# Etapa 2 — Contratos e Esteira — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contratos digitados uma vez com valores congelados da tabela, esteira com matriz de transições configurável, ADE travado contra erro, refinanciamento, liberação atômica que gera parcelas e mensalidade, encerramentos e atraso diário — com telas para equipe e parceiro.

**Architecture:** Mesmo padrão da Etapa 1: regras no Postgres (RLS + RPCs `security definer` com `app_exigir`/`app_equipe_pode`, triggers de auditoria), front React chamando RPCs. Nenhuma escrita direta em contratos, parcelas, mensalidades, averbações ou eventos.

**Tech Stack:** a da Etapa 1 (Supabase local, Postgres 17, pg_cron, React 19 + Vite + TS, TanStack Query, vitest, pg).

**Spec:** `docs/superpowers/specs/2026-10-28-etapa2-contratos-esteira-design.md` (seções 2, 2.1 e 2.2 prevalecem sobre a 3 quando divergirem).

## Global Constraints

- Tudo local; `git push` só com "pode subir" do dono.
- Antes de cada commit: `npx tsc -b` em `app/` e `npm test` na raiz, passando.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Dinheiro `numeric(14,2)`; fator `numeric(12,8)`; percentuais `numeric(7,4)`. Nunca float; valores vão do front ao banco como texto decimal.
- Toda tabela nova: RLS ligada + trigger `public.auditar()`; funções `security definer` com `set search_path = ''` e `revoke … from public, anon`.
- Mensagens ao usuário em português claro; erros de regra via `raise exception` (P0001).
- Depois de cada migração: `npm run db:tipos` (e remover BOM/CRLF se gerado pelo PowerShell).
- Dentro da esteira **ninguém** vê comissão; só `comissoes.ver` (administrador, gerente, financeiro).

## Review Focus

1. **Duplo clique em "Liberar crédito"** (duas chamadas simultâneas) → só uma gera parcelas; a outra recebe "Este crédito já foi liberado." (teste na Task 6).
2. **ADE colado no modo seguro / ADE com espaços ou zeros** → modo seguro recusa confirmação diferente; o ADE é gravado sem espaços nas pontas e a unicidade compara o texto normalizado (teste na Task 5).
3. **Refin escolhendo contrato de outro cliente, de outra matrícula ou já reservado** → recusado com mensagem (teste na Task 3).
4. **Contrato que volta de `pendente` depois de averbado** → continua exigindo `contratos.editar_averbado` para editar valores (teste na Task 3).
5. **Parceiro lendo `contrato_comissao_regra`, contratos de outro parceiro ou eventos pela API** → zero linhas (teste na Task 2).

---

## Estrutura de arquivos

```
supabase/migrations/0014_contratos_base.sql        enums, permissões, configurações, matriz de transições, descontos por convênio
supabase/migrations/0015_contratos.sql             contratos + comissão + versões + descontos + quitações + dívidas externas + eventos + RLS
supabase/migrations/0016_digitacao.sql             digitar / pré-digitar / editar
supabase/migrations/0017_esteira.sql               mover, aprovar/cancelar pré-digitação, recusar
supabase/migrations/0018_averbacao.sql             averbações (contrato e mensalidade), ADE, pendências, reaverbar, migrar matrícula
supabase/migrations/0019_liberacao.sql             parcelas, pagamentos, mensalidades, liberar_credito, mensalidades do mês
supabase/migrations/0020_encerramentos.sql         encerrar, atraso diário, prejuízo, cancelar mensalidade
tests/db/0014…0020_*.test.ts, tests/db/contratos_fixture.ts
app/src/lib/contratos.ts                            rótulos de fase/situação, transições permitidas
app/src/features/esteira/…                          quadro, cartão, ações de fase
app/src/features/contratos/…                        digitação, detalhe, ADE, parcelas
app/src/features/mensalidades/…, prejuizo/…, pendencias/…, parceiro/PreDigitacao…
```

---

### Task 1: Base da Etapa 2 (0014)

**Files:** Create `supabase/migrations/0014_contratos_base.sql`, `tests/db/0014_contratos_base.test.ts`

**Interfaces — Produces:**
- enums: `public.fase_contrato` = `pre_digitacao, digitado, em_validacao, pendente, em_averbacao, averbado, aguardando_assinatura, aguardando_pagamento, credito_liberado, recusado, cancelado`; `public.situacao_contrato` = `em_andamento, ativo, em_atraso, quitado, renovado, cancelado, prejuizo`; `public.situacao_averbacao` = `proposta, ativa, substituida, migrada, cancelamento_pendente, cancelada`.
- Permissões novas (inseridas em `permissoes`): `contratos.ver`, `contratos.digitar`, `contratos.mover`, `contratos.recusar`, `contratos.editar_averbado`, `contratos.liberar`, `contratos.encerrar`, `comissoes.ver`, `mensalidades.cancelar`, `averbadora.pendencias`. Matriz padrão: administrador = todas; gerente = todas menos `contratos.liberar`; financeiro = `contratos.ver`, `contratos.liberar`, `comissoes.ver`; operador = `contratos.ver`, `contratos.digitar`, `contratos.mover`, `averbadora.pendencias`; consulta = `contratos.ver`; parceiro = `contratos.ver`, `contratos.digitar` (o teto do parceiro em `trg_teto_parceiro` passa a aceitar essas duas).
- `public.configuracoes(chave text pk, valor jsonb not null, descricao text)` com `('parceiro_ve_todos_contratos', 'false')`; função `public.config_bool(p_chave text) returns boolean` (stable). Leitura para logados; escrita com `permissoes.gerenciar`.
- `public.fase_transicoes(de fase_contrato, para fase_contrato, permissao text fk permissoes, pk(de,para))` semeada conforme spec §2-2: aprovar `pre_digitacao→digitado` (`contratos.mover`), `digitado→em_validacao`, `em_validacao→em_averbacao`, `em_averbacao→averbado`, `averbado→aguardando_assinatura`, `aguardando_assinatura→aguardando_pagamento` (todas `contratos.mover`); `X→pendente` para toda fase de `digitado` a `aguardando_pagamento` (`contratos.mover`); `X→recusado` para toda fase de `pre_digitacao` a `aguardando_pagamento` (`contratos.recusar`). **Não** existe linha com `para = credito_liberado`. Escrita com `permissoes.gerenciar`.
- `public.convenio_tipos_desconto(id, convenio_id fk, nome, forma text check in ('fixo','percentual'), valor_padrao numeric(14,4), ativo)` — vazia.
- Check de `cliente_documentos.tipo` passa a aceitar `requerimento_cancelamento`.

- [ ] **Step 1: Testes** (`0014_contratos_base.test.ts`): `não existe transição para credito_liberado`; `recusar exige contratos.recusar e operador não tem`; `parceiro pode receber contratos.digitar mas não contratos.mover` (teto); `config_bool lê parceiro_ve_todos_contratos = false`; `operador não altera configuração`; `documento requerimento_cancelamento é aceito`.
- [ ] **Step 2:** `npm run db:reset; npx vitest run tests/db/0014` → FAIL.
- [ ] **Step 3:** Implementar 0014.
- [ ] **Step 4:** Mesmo comando → PASS; suíte inteira verde.
- [ ] **Step 5:** Commit `feat(db): base da esteira (fases, permissões, configurações)`.

---

### Task 2: Contratos e tabelas satélites (0015)

**Files:** Create `supabase/migrations/0015_contratos.sql`, `tests/db/contratos_fixture.ts`, `tests/db/0015_contratos.test.ts`

**Interfaces — Produces:**
- `public.contratos`: `id uuid pk`, `numero bigint unique default nextval('contratos_numero_seq')` (sequência começa em 100000), `cliente_id`, `matricula_id fk cliente_matriculas`, `convenio_id`, `vinculo_id` (copiados da matrícula por trigger), `tipo tipo_contrato`, `parceiro_id null`, `agente_id null` (agente deve ser do parceiro — trigger), `origem_id null`, `fase fase_contrato`, `fase_retorno fase_contrato null` (usada por `pendente`), `situacao situacao_contrato default 'em_andamento'`, `linha_tabela_id`, `fator numeric(12,8)`, `prazo int`, `valor_parcela`, `valor_bruto`, `total_descontos default 0`, `total_quitado default 0`, `total_dividas_externas default 0`, `valor_liquido numeric(14,2) generated always as (valor_bruto - total_descontos - total_quitado - total_dividas_externas) stored`, `valor_mensalidade_tabela`, `mensalidade_proposta numeric(14,2) null`, `valores_travados_em timestamptz null`, `primeiro_vencimento date null`, `data_liberacao date null`, `legado bool default false`, `legado_importado_por uuid`, `legado_importado_em timestamptz`, `criado_por default auth.uid()`, `criado_em`, `versao int default 1`. Check `valor_liquido >= 0` com mensagem via trigger: "O valor líquido ficou negativo: os descontos e quitações passam do valor do contrato."
- `public.contrato_comissao_regra(contrato_id pk fk, percentual numeric(7,4), base base_comissao)`.
- `public.contrato_versoes(id, contrato_id, versao int, dados jsonb, comissao jsonb, motivo, criado_por, criado_em, unique(contrato_id, versao))`.
- `public.contrato_descontos(id, contrato_id, tipo_desconto_id fk convenio_tipos_desconto, valor numeric(14,2) >= 0)`.
- `public.contrato_quitacoes(id, contrato_id, contrato_quitado_id, saldo_devedor numeric(14,2) > 0, fonte text check in ('averbadora','calculo','outro'), observacao, reservado bool default true)` + índice único parcial `(contrato_quitado_id) where reservado`.
- `public.contrato_dividas_externas(id, contrato_id, credor text, numero_contrato_externo text, saldo numeric(14,2) > 0, favorecido text, observacao)`.
- `public.contrato_eventos(id bigint identity, contrato_id, de fase_contrato, para fase_contrato, situacao_de, situacao_para, motivo, usuario_id default auth.uid(), em default now())` — só inserção (trigger igual ao da auditoria).
- Função `public.contrato_visivel(p_contrato_id uuid) returns boolean` (stable, definer): equipe com `contratos.ver`; parceiro com `contratos.ver` se `parceiro_id = app_parceiro_id()` **ou** (`config_bool('parceiro_ve_todos_contratos')` e `parceiro_ve_cliente(cliente_id)`).
- RLS (só select; nenhuma policy de insert/update/delete para `authenticated` — tudo por RPC):
  - `contratos`, `contrato_descontos`, `contrato_quitacoes`, `contrato_dividas_externas`, `contrato_eventos` → `contrato_visivel(contrato_id)`.
  - `contrato_versoes` → equipe com `contratos.ver` (`app_equipe_pode`); o campo `comissao` dentro dela só é devolvido pela view `v_contrato_versoes` que zera a comissão para quem não tem `comissoes.ver`; a tabela em si não tem grant de select para `authenticated`.
  - `contrato_comissao_regra` → `app_equipe_pode('comissoes.ver')`.
- `tests/db/contratos_fixture.ts`: `inserirContratoBase(c, opts: { cliente?: string; parceiroId?: string | null; fase?: string; valor?: string }): Promise<{ id: string; clienteId: string; matriculaId: string }>` (insere como dono, com valores fixos: fator 0.0612, prazo 24, bruto 1000, parcela 61.20, mensalidade 35).

- [ ] **Step 1: Testes:** `valor_liquido = bruto - descontos - quitado - dívidas`; `líquido negativo é recusado com a mensagem`; `parceiro vê só os próprios contratos`; `parceiro vê contratos do cliente vinculado quando a configuração é ligada`; `parceiro e operador não leem contrato_comissao_regra; financeiro lê`; `parceiro não lê contrato_versoes`; `ninguém insere direto em contratos nem em contrato_eventos`; `agente de outro parceiro é recusado`; `mesmo contrato não fica reservado por dois refins`.
- [ ] **Step 2–4:** FAIL → implementar → PASS (suíte inteira).
- [ ] **Step 5:** Commit `feat(db): contratos, comissão, versões, quitações e eventos`.

---

### Task 3: Digitação, pré-digitação e edição (0016)

**Files:** Create `supabase/migrations/0016_digitacao.sql`, `tests/db/0016_digitacao.test.ts`

**Interfaces — Consumes:** `simular_por_valor/_por_parcela` (Etapa 1), `o_que_falta`, `contrato_visivel`. **Produces:**
- Formato de `p_dados jsonb`: `{ cliente_id, matricula_id, tipo, prazo, modo: 'valor'|'parcela', quantia: "1000.00", parceiro_id?, agente_id?, origem_id?, descontos?: [{tipo_desconto_id, valor}], quitacoes?: [{contrato_quitado_id, saldo_devedor, fonte, observacao?}], dividas_externas?: [{credor, numero_contrato_externo, saldo, favorecido, observacao?}] }`.
- `public._exigir_cliente_para_contrato(p_cliente_id uuid)` — exige CPF, nome, `data_nascimento` e `email` preenchidos → "Para digitar o contrato, complete no cadastro: data de nascimento, e-mail." (lista só o que falta).
- `public._calcular_contrato(p_dados jsonb, p_gravar boolean) returns jsonb` — roda a simulação (por valor ou parcela, com a data de nascimento do cliente), devolve a fotografia `{linha_tabela_id, fator, prazo, valor_parcela, valor_bruto, valor_mensalidade_tabela, percentual, base}`.
- `public.digitar_contrato(p_dados jsonb) returns uuid` — exige `contratos.digitar` e equipe; grava contrato em `digitado`, comissão, versão 1, descontos/quitações/dívidas, evento; simulação gravada (`p_gravar=true`); `mensalidade_proposta` = valor da tabela se maior que a mensalidade ativa da matrícula (até a Task 6 existir, considera vigente = 0 via função `public.mensalidade_vigente(p_matricula_id uuid) returns numeric` que a Task 6 substitui).
- `public.pre_digitar_contrato(p_dados jsonb) returns uuid` — parceiro; força `parceiro_id = app_parceiro_id()`; fase `pre_digitacao`; simulação **sem** gravar; exige `parceiro_ve_cliente(cliente_id)` (o vínculo vem da busca/adoção ou do cadastro da Etapa 1) → senão "Busque o cliente por CPF e matrícula antes de pré-digitar.".
- `public.editar_contrato(p_id uuid, p_dados jsonb, p_motivo text) returns void` — permitido em `pre_digitacao, digitado, em_validacao, pendente`, e também depois de averbado; se `valores_travados_em` não for nulo exige `contratos.editar_averbado` e motivo, e cria pendência "ajustar na averbadora" (tabela da Task 5 — nesta task, grava em `contrato_eventos` com motivo e a Task 5 acrescenta a pendência). Recalcula, incrementa `versao`, grava `contrato_versoes`. Parceiro edita só a própria pré-digitação.
- Validações de quitação: o contrato quitado é do **mesmo cliente e mesma matrícula**, está `ativo` ou `em_atraso`, e não está reservado → mensagens "Só é possível quitar contratos ativos do mesmo cliente e matrícula." / "Este contrato já está sendo quitado por outro refinanciamento.". Tipo `refinanciamento` exige ao menos uma quitação; `novo` não aceita quitação.

- [ ] **Step 1: Testes:** `digitar copia fator, parcela e comissão da tabela e grava simulação`; `cliente sem e-mail e nascimento recebe a mensagem listando os dois`; `refin quita contrato do mesmo cliente e calcula o líquido` (bruto 1000, saldo 400 → líquido 600); `refin de contrato de outro cliente é recusado`; `contrato já reservado é recusado`; `novo com quitação é recusado`; `parceiro pré-digita, contrato fica dele e não grava simulação`; `parceiro não pré-digita para cliente sem vínculo`; `editar antes de averbar recalcula e cria versão 2`; `contrato que volta de pendente depois de averbado exige contratos.editar_averbado` (Review Focus 4); `gerente edita averbado com motivo`; `editar sem motivo depois de averbado é recusado`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): digitação, pré-digitação e edição de contratos`.

---

### Task 4: Esteira (0017)

**Files:** Create `supabase/migrations/0017_esteira.sql`, `tests/db/0017_esteira.test.ts`

**Interfaces — Produces:**
- `public.mover_contrato(p_id uuid, p_para fase_contrato, p_motivo text default null) returns void` — `select … for update`; procura `fase_transicoes(de = fase atual, para)`; ausente → "Esta mudança de fase não é permitida."; exige a permissão da linha (e ser equipe, salvo cancelamento da própria pré-digitação); `pendente`/`recusado` exigem motivo → "Informe o motivo."; ao ir para `pendente` guarda `fase_retorno`; de `pendente` só volta para `fase_retorno` (linha implícita, permissão `contratos.mover`); regras: sair de `em_validacao` exige `o_que_falta(cliente, convenio)` vazio → "Ainda falta no cadastro: <rótulos>."; entrar em `em_averbacao` preenche `valores_travados_em` se nulo; entrar em `averbado` exige averbação `ativa` (Task 5 — até lá, a regra existe e o teste correspondente fica na Task 5); `recusado` → situação `cancelado`, libera reservas de quitação, averbações `ativa`/`proposta` do contrato e da mensalidade proposta → `cancelamento_pendente` (Task 5 trata), registra evento.
- `public.cancelar_pre_digitacao(p_id uuid, p_motivo text) returns void` — parceiro dono enquanto fase `pre_digitacao` e nenhum evento de equipe; fase `cancelado`.
- `public.aprovar_pre_digitacao(p_id uuid) returns jsonb` — equipe `contratos.mover`; recalcula com a tabela vigente e grava simulação; se a linha ou valores mudaram, devolve `{ mudou: true, antes, depois }` **sem** mover; `public.confirmar_aprovacao(p_id uuid) returns void` aplica e move para `digitado`.

- [ ] **Step 1: Testes:** `transição fora da matriz é recusada`; `ninguém move para credito_liberado`; `operador não recusa; gerente recusa com motivo`; `recusar sem motivo é recusado`; `pendente guarda e volta para a fase anterior`; `sair de em_validacao com cadastro incompleto lista o que falta`; `entrar em em_averbacao preenche valores_travados_em e pendente não limpa`; `recusar libera a reserva do contrato quitado`; `parceiro cancela a própria pré-digitação; não cancela depois que a equipe mexeu`; `aprovar pré-digitação com tabela alterada devolve a diferença sem mover`; `toda mudança gera evento com quem e motivo`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): esteira com matriz configurável`.

---

### Task 5: Averbação, ADE e pendências da averbadora (0018)

**Files:** Create `supabase/migrations/0018_averbacao.sql`, `tests/db/0018_averbacao.test.ts`

**Interfaces — Produces:**
- `public.contrato_averbacoes(id, contrato_id, convenio_id, matricula_id, ade text, situacao situacao_averbacao, valor_averbado numeric(14,2), migrada_para uuid null, criado_por, criado_em)`; índices únicos: `(convenio_id, ade)` onde situação ≠ `cancelada`; `(contrato_id)` onde situação = `ativa`.
- `public.mensalidade_averbacoes` — mesma forma, com `matricula_id` e `contrato_origem_id` (a mensalidade em si nasce na Task 6; a FK `mensalidade_id` é adicionada lá).
- `public._validar_ade(p_convenio_id uuid, p_ade text, p_confirmacao text) returns text` — `btrim`; modo `seguro` exige confirmação igual → "As duas digitações do ADE não são iguais."; aplica `ade_regex` → "ADE fora do formato do convênio: <ade_descricao>."; devolve o ADE normalizado.
- `public.registrar_ade(p_contrato_id uuid, p_ade text, p_confirmacao text default null) returns void` — fase `em_averbacao`; cria averbação `ativa` com `valor_averbado = valor_parcela`; ADE repetido → "Este ADE já está em uso neste convênio.".
- `public.registrar_ade_mensalidade(p_contrato_id uuid, p_ade text, p_confirmacao text default null) returns void` — só quando `mensalidade_proposta` não é nula; cria averbação `proposta`. `mover_contrato` para `averbado` passa a exigir: averbação ativa do contrato **e**, se `mensalidade_proposta` não nula, averbação de mensalidade `proposta`.
- `public.pendencias_averbadora(id, tipo text check in ('cancelar','ajustar'), contrato_id, averbacao_id null, mensalidade_averbacao_id null, motivo, resolvida_em null, resolvida_por null, criado_em)` + `public.resolver_pendencia(p_id uuid) returns void` (`averbadora.pendencias`): `cancelar` → averbação vai a `cancelada`.
- `recusar` (Task 4) agora: averbações `ativa`/`proposta` → `cancelamento_pendente` + pendência `cancelar`. `editar_contrato` depois de averbado → pendência `ajustar`.
- `public.reaverbar(p_contrato_id uuid, p_novo_ade text, p_confirmacao text default null) returns void` — antiga `substituida`, nova `ativa` (parcelas são reapontadas na Task 6).
- `public.migrar_matricula(p_contrato_id uuid, p_nova_matricula_id uuid, p_novo_ade text, p_confirmacao text, p_valor_averbado numeric) returns void` — nova matrícula do mesmo cliente; contrato passa para a nova matrícula (convênio pode mudar só se a nova matrícula for do mesmo convênio — senão "A nova matrícula precisa ser do mesmo convênio."); averbação antiga `migrada` com `migrada_para`; nova `ativa` com `valor_averbado` (≤ `valor_parcela`, > 0).

- [ ] **Step 1: Testes:** `modo seguro recusa confirmação diferente`; `ADE com espaços é gravado aparado e bate na unicidade` (Review Focus 2); `ADE fora do formato mostra a descrição do convênio`; `não entra em averbado sem ADE ativo`; `contrato que aumenta mensalidade exige ADE da mensalidade para averbado`; `recusar contrato averbado cria pendência cancelar e marca cancelamento_pendente`; `resolver pendência cancela a averbação`; `editar averbado cria pendência ajustar`; `reaverbar substitui o ADE`; `migrar matrícula com valor menor guarda valor_averbado e marca a antiga como migrada`; `migrar para matrícula de outro cliente é recusado`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): averbação, ADE seguro e pendências da averbadora`.

---

### Task 6: Liberação, parcelas e mensalidades (0019)

**Files:** Create `supabase/migrations/0019_liberacao.sql`, `tests/db/0019_liberacao.test.ts`

**Interfaces — Produces:**
- `public.parcelas(id, contrato_id, numero int, competencia date (dia 1), vencimento date, valor numeric(14,2), status text check in ('aberta','paga','parcial','atrasada','prejuizo','cancelada') default 'aberta', averbacao_id, unique(contrato_id, competencia), unique(contrato_id, numero))`.
- `public.parcela_pagamentos(id, parcela_id, valor > 0, competencia_desconto date, averbacao_id, origem text default 'manual', criado_em)` + view `public.v_parcelas_saldo(parcela_id, valor, pago, saldo)`.
- `public.mensalidades(id, matricula_id, situacao text check in ('ativa','cancelada'), cancelada_em, requerimento_documento_id, motivo_cancelamento)` + índice único `(matricula_id) where situacao = 'ativa'`; `public.mensalidade_valores(id, mensalidade_id, valor, vigente_desde date, tipo text check in ('nova','reajuste','migracao'), contrato_origem_id, averbacao_id)`; `public.mensalidade_parcelas(id, mensalidade_id, competencia, valor, status text check in ('aberta','paga','parcial','atrasada','cancelada'), unique(mensalidade_id, competencia))`; FK `mensalidade_averbacoes.mensalidade_id`.
- `public.mensalidade_vigente(p_matricula_id uuid) returns numeric` (substitui a da Task 3) — valor mais recente da mensalidade ativa, 0 se não houver.
- `public.primeira_competencia(p_convenio_id uuid, p_data date) returns date` — exige `dia_corte` e `dia_vencimento` configurados → "Configure o dia de corte e o dia de vencimento do convênio antes de liberar."; dia de `p_data` ≤ `dia_corte` → mês de `p_data`; senão mês seguinte; devolve o dia 1 do mês. Vencimento de cada parcela = `make_date(ano, mês, dia_vencimento)`.
- `public.liberar_credito(p_id uuid, p_data date default current_date) returns void` — `contratos.liberar` + equipe; `for update` no contrato; fase precisa ser `aguardando_pagamento`, senão se já `credito_liberado` → "Este crédito já foi liberado."; gera `prazo` parcelas a partir de `primeira_competencia`, ligadas à averbação ativa; situação `ativo`, fase `credito_liberado`, `data_liberacao`, `primeiro_vencimento`; **refin**: para cada quitação, `for update` no quitado, parcelas com competência ≥ primeira do novo → `cancelada`, averbação ativa → `cancelada`, situação `renovado`, reserva → false; **mensalidade** (`for update` na mensalidade da matrícula): não existe → cria `ativa` com valor `valor_mensalidade_tabela`, tipo `nova` e averbação proposta → `ativa`; existe e `mensalidade_proposta` > vigente → `mensalidade_valores` tipo `reajuste` vigente desde a primeira competência, averbação proposta → `ativa`, averbação ativa anterior → `migrada` (`migrada_para`); caso contrário a averbação proposta (se houver) → `migrada` para a ativa vigente. Evento registrado. Tudo na mesma transação.
- `public.gerar_mensalidades_competencia(p_competencia date) returns integer` — cria `mensalidade_parcelas` da competência para toda mensalidade ativa com valor vigente (idempotente por unique); agendada mensalmente via pg_cron no dia 1 (`cron.schedule('mensalidades-do-mes', '0 3 1 * *', …)`).
- `reaverbar` (Task 5) passa a reapontar parcelas `aberta`/`parcial`/`atrasada` para a nova averbação; `parcela_pagamentos` mantêm a averbação de origem.

- [ ] **Step 1: Testes:** `liberar gera 24 parcelas a partir da competência certa` (convênio corte 2, vencimento 28; liberação 2026-11-02 → primeira 2026-11, vencimento 2026-11-28; liberação 2026-11-03 → 2026-12); `liberar sem dia de corte configurado mostra a mensagem`; `segunda liberação do mesmo contrato é recusada` e `duas liberações concorrentes geram parcelas uma vez só` (duas conexões, Review Focus 1); `refin: antigo fica renovado, parcelas futuras canceladas, anteriores abertas, averbação cancelada`; `primeiro contrato da matrícula cria mensalidade nova`; `contrato com mensalidade maior reajusta e o ADE antigo fica migrado`; `contrato com mesma mensalidade não muda nada`; `dois contratos aumentando: vale o maior e o proposto menor fica migrado`; `operador não libera`; `gerar_mensalidades_competencia é idempotente`; `reaverbar mantém pagamentos na averbação de origem e move o saldo`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): liberação atômica, parcelas e mensalidades`.

---

### Task 7: Encerramentos, atraso e prejuízo (0020)

**Files:** Create `supabase/migrations/0020_encerramentos.sql`, `tests/db/0020_encerramentos.test.ts`

**Interfaces — Produces:**
- `public.encerrar_contrato(p_id uuid, p_tipo text check in ('quitado','cancelado','prejuizo'), p_motivo text) returns void` — `contratos.encerrar`; só contratos `ativo`/`em_atraso`; motivo obrigatório; `quitado`/`cancelado` → parcelas abertas `cancelada`, averbação ativa `cancelamento_pendente` + pendência `cancelar`; `prejuizo` → parcelas abertas/atrasadas `prejuizo` (averbação continua). Mensalidade **não** é afetada.
- `public.recalcular_atrasos(p_hoje date default current_date) returns void` — parcelas `aberta`/`parcial` vencidas → `atrasada`; contratos `ativo` com parcela atrasada → `em_atraso`, `em_atraso` sem atrasada → `ativo`; mensalidade_parcelas vencidas → `atrasada` sem tocar contratos. pg_cron diário `'0 4 * * *'`.
- view `public.v_candidatos_prejuizo(contrato_id, numero, cliente, convenio, dias_atraso)` — atraso maior que `convenios.dias_prejuizo` (security_invoker).
- `public.cancelar_mensalidade(p_mensalidade_id uuid, p_documento_id uuid, p_motivo text) returns void` — `mensalidades.cancelar`; documento do tipo `requerimento_cancelamento` do mesmo cliente → senão "Anexe o requerimento de cancelamento assinado pelo cliente."; mensalidade `cancelada`, parcelas futuras `cancelada`, averbação ativa `cancelamento_pendente` + pendência.

- [ ] **Step 1: Testes:** `quitar cancela parcelas abertas e cria pendência`; `prejuízo marca parcelas`; `encerrar sem motivo é recusado`; `encerrar não mexe na mensalidade`; `recalcular_atrasos marca parcela e contrato e volta a ativo quando pago`; `atraso de mensalidade não marca o contrato`; `candidato a prejuízo respeita dias_prejuizo do convênio` (90 padrão; convênio com 30); `cancelar mensalidade sem requerimento é recusado`; `cancelar mensalidade com requerimento cria pendência`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): encerramentos, atraso diário e prejuízo`.

---

### Task 8: Telas — esteira e detalhe do contrato

**Files:** `app/src/lib/contratos.ts` (+test), `app/src/features/esteira/{EsteiraPage,CartaoContrato,AcoesFase}.tsx` (+test), `app/src/features/contratos/{ContratoPage,AdeCampo,ParcelasTabela}.tsx` (+test); Modify `app/src/rotas.tsx`, `app/src/lib/permissoes.ts` (menu: Esteira `contratos.ver` equipe; Pendências da averbadora `averbadora.pendencias`; Candidatos a prejuízo `contratos.encerrar`).

**Interfaces — Produces:**
- `contratos.ts`: `ROTULO_FASE: Record<Fase, string>`, `ROTULO_SITUACAO`, `ORDEM_FASES: Fase[]` (colunas do quadro), `transicoesPermitidas(fase: Fase, matriz: {de, para, permissao}[], pode: (p: string) => boolean): Fase[]`, `exigeMotivo(para: Fase): boolean` (`pendente`, `recusado`).
- `AdeCampo({ modo: 'seguro'|'rapido', descricao?: string, onConfirmar(ade: string, confirmacao: string | null): Promise<unknown> })` — modo seguro: dois campos, `onPaste` bloqueado com aviso "No modo seguro o ADE precisa ser digitado."; botão só habilita com os dois iguais.
- `AcoesFase({ fase, matriz, pode, onMover(para, motivo) })` — botões das transições permitidas; `pendente`/`recusado` pedem motivo.
- `EsteiraPage`: colunas por `ORDEM_FASES`, filtros convênio/parceiro/período; cartão com número, cliente, bruto, parcela, dias na fase. **Nenhum campo de comissão.**
- `ContratoPage` (`/contratos/:id`): dados congelados, versões (equipe), eventos, averbações + `AdeCampo` quando `em_averbacao`, mensalidade proposta, parcelas, quitações/dívidas, botão "Liberar crédito" (só `contratos.liberar`, fase `aguardando_pagamento`, confirmação), "Encerrar" (`contratos.encerrar`).

- [ ] **Step 1: Testes:** `transicoesPermitidas mostra só as da matriz com permissão`; `AdeCampo no modo seguro bloqueia colar e exige iguais`; `AdeCampo no modo rápido aceita colar`; `AcoesFase pede motivo para recusar`; `CartaoContrato não mostra comissão`.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npm test`, `npx tsc -b`).
- [ ] **Step 5:** Commit `feat(app): esteira e detalhe do contrato`.

---

### Task 9: Telas — digitação, pré-digitação, mensalidades, pendências e prejuízo

**Files:** `app/src/features/contratos/{DigitacaoPage,DigitacaoForm}.tsx` (+test), `app/src/features/parceiro/{PreDigitacaoPage,MeusContratosPage}.tsx`, `app/src/features/mensalidades/MensalidadesSecao.tsx` (dentro do detalhe do cliente), `app/src/features/pendencias/PendenciasAverbadoraPage.tsx`, `app/src/features/prejuizo/CandidatosPrejuizoPage.tsx`; Modify `rotas.tsx`, `permissoes.ts` (menu do parceiro: "Pré-digitação", "Meus contratos").

**Interfaces — Produces:**
- `DigitacaoForm({ clientes busca, convenios, contratosQuitaveis, tiposDesconto, onSimular, onEnviar(p_dados) })` — mesma forma de `p_dados` da Task 3; mostra prévia **Bruto − Descontos − Quitações − Dívidas = Líquido** (usando os valores de `onSimular`, nunca calculando dinheiro com float: soma via centavos inteiros em `lib/mascaras.ts` → nova `somarReais(...valores: string[]): string` e `subtrairReais(a, ...b): string`).
- `PreDigitacaoPage` reutiliza `DigitacaoForm` com `modo="parceiro"` (sem campos de parceiro/agente da casa; agente da lista do próprio parceiro).
- `MensalidadesSecao` — valor atual, histórico (`mensalidade_valores` + `mensalidade_parcelas`), cancelar (exige escolher documento `requerimento_cancelamento` já anexado).

- [ ] **Step 1: Testes:** `somarReais/subtrairReais com centavos exatos` ("0.10"+"0.20"="0.30"); `DigitacaoForm mostra líquido 600,00 para bruto 1.000,00 e quitação 400,00`; `DigitacaoForm de refinanciamento exige escolher contrato a quitar`; `pré-digitação do parceiro não mostra campo de parceiro`; `cancelar mensalidade sem requerimento desabilita o botão`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(app): digitação, pré-digitação, mensalidades, pendências e prejuízo`.

---

### Task 10: Revisão da etapa

- [ ] **Step 1:** `npm run db:reset && npm test && (cd app && npx tsc -b)` → tudo verde.
- [ ] **Step 2:** `/code-review` na etapa; corrigir problemas reais com teste que falha antes.
- [ ] **Step 3:** Segundo olhar do Codex (somente leitura) sobre `supabase/migrations/0014–0020` com foco em RLS, comissão, liberação atômica e estados de averbação; corrigir.
- [ ] **Step 4:** Ponta a ponta no navegador com usuários de teste locais: digitar contrato novo → mover até `aguardando_pagamento` (com ADE no modo seguro) → liberar → ver 24 parcelas e mensalidade nova; refin quitando o primeiro; parceiro pré-digita e a equipe aprova; recusar um averbado e resolver a pendência.
- [ ] **Step 5:** Commit das correções; entregar ao dono: achado / corrigido / pendente. Sem push sem "pode subir".
