# Etapa 3 — Importação dos dados antigos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O administrador baixa a planilha modelo PROSESP, envia a planilha preenchida, vê a prévia com erros por linha, grava as linhas boas (o erro afasta o CPF inteiro), baixa as linhas que ficaram de fora e pode desfazer uma importação enquanto ninguém mexeu.

**Architecture:** O navegador lê o Excel (ExcelJS), converte para JSON por aba, confere duplicidades dentro do arquivo e divide em **lotes de até 300 CPFs**. Cada lote vai a uma RPC: `importacao_conferir` (roda a gravação e desfaz tudo no fim — prévia idêntica à gravação) ou `importacao_gravar_lote` (grava). No banco, cada CPF é processado num subbloco `begin … exception`: erro em qualquer linha do CPF desfaz só aquele CPF. Todos os registros criados levam `importacao_id`, que é a base do desfazer.

**Tech Stack:** a das Etapas 1–2 + `exceljs@4.4.0` no app.

**Spec:** `docs/superpowers/specs/2026-10-29-etapa3-importacao-legado-design.md`

## Global Constraints

- Tudo local; `git push` só com "pode subir" do dono.
- Antes de cada commit: `npx tsc -b` em `app/` e `npm test` na raiz, passando.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Dinheiro `numeric(14,2)`, fator `numeric(12,8)`; dinheiro vindo do app passa por `public._dinheiro(text)`.
- Toda tabela nova: RLS + trigger `public.auditar()`; funções `security definer`, `set search_path = ''`, `revoke … from public, anon`.
- Mensagens ao usuário em português claro. Erro de linha no formato `Aba <Nome>, linha <n>: <mensagem>` (montado na tela a partir de `{aba, linha, mensagem}`).
- Não afrouxar nenhuma regra existente do banco (CPF, celular/WhatsApp, ADE único, coerência de totais).
- Só `importacao.executar` (padrão: administrador) usa qualquer parte desta etapa.

## Review Focus

1. **Arquivo grande (50 mil linhas)** → nenhum lote passa do tempo limite do banco; a prévia e a gravação terminam e somam certo (teste de agrupamento na Task 7 + lote de 300 CPFs no teste da Task 2).
2. **Mesmo arquivo enviado de novo** → nada duplica; o que já entrou aparece como "já existe" (teste na Task 3).
3. **Erro numa parcela de um CPF com 3 contratos** → nenhum dado desse CPF entra, as outras linhas do CPF aparecem como "Não importado: há erro em outra linha deste CPF" (teste na Task 4).
4. **Desfazer depois que o cálculo noturno de atraso rodou** → desfazer continua permitido (teste na Task 6).
5. **Datas e valores como o Excel guarda** (data serial, `Date`, texto `05/2024`, `1.234,56`, número `1234.5`) → convertidos certo; texto inválido vira erro de linha, nunca exceção na tela (teste na Task 7).

---

## Estrutura de arquivos

```
supabase/migrations/0022_importacao_base.sql       permissão, bucket, tabela importacoes, colunas importacao_id/numero_legado, conversores, eventos apagáveis só no desfazer
supabase/migrations/0023_importacao_clientes.sql   processador por CPF, conferir/gravar_lote/iniciar/concluir, clientes e matrículas
supabase/migrations/0024_importacao_contratos.sql  contratos, quitações, dívidas, desconto legado, averbação, evento, situação
supabase/migrations/0025_importacao_parcelas.sql   parcelas geradas ou da aba Parcelas, pagamentos legado
supabase/migrations/0026_importacao_mensalidades.sql mensalidades e histórico de valores
supabase/migrations/0027_importacao_desfazer.sql   desfazer_importacao
tests/db/0022…0027_*.test.ts, tests/db/importacao_fixture.ts
app/src/features/importacao/colunas.ts             definição das abas/colunas (fonte única do modelo e da leitura)
app/src/features/importacao/planilha.ts            gerar modelo, ler arquivo, converter, agrupar em lotes, planilha de erros
app/src/features/importacao/planilha.test.ts
app/src/features/importacao/ImportacaoPage.tsx     baixar modelo, enviar, prévia, gravar, histórico, desfazer
```

## Formato trocado entre app e banco (todas as tasks)

`p_dados jsonb` de um lote:

```json
{ "posicao": "2026-10-01",
  "clientes":    [{"linha": 2, "cpf": "...", "nome": "...", "celular": "...", "whatsapp": null, "data_nascimento": "1980-05-10", "email": null, "rg": null, "nome_mae": null, "cep": null, "logradouro": null, "numero": null, "complemento": null, "bairro": null, "cidade": null, "uf": null}],
  "matriculas":  [{"linha": 2, "cpf": "...", "convenio": "Governo do Acre", "vinculo": "Efetivo", "matricula": "123456", "orgao": null}],
  "contratos":   [{"linha": 2, "numero_antigo": "4521", "cpf": "...", "convenio": "...", "matricula": "...", "tipo": "novo", "prazo": "24", "valor_parcela": "122.40", "valor_bruto": "2000.00", "valor_liquido": null, "data_liberacao": "2024-05-10", "primeira_competencia": "2024-06-01", "parcelas_pagas": "5", "situacao": "ativo", "ade": null, "parceiro": null}],
  "quitacoes":   [{"linha": 2, "numero_novo": "4521", "numero_quitado": "3100", "saldo": "500.00"}],
  "dividas":     [{"linha": 2, "numero_antigo": "4521", "credor": "Banco X", "saldo": "800.00", "numero_externo": null}],
  "parcelas":    [{"linha": 2, "numero_antigo": "4521", "numero": "1", "competencia": "2024-06-01", "valor": "122.40", "situacao": "paga"}],
  "mensalidades":[{"linha": 2, "cpf": "...", "convenio": "...", "matricula": "...", "valor": "35.00", "vigente_desde": "2024-06-01", "situacao": "ativa", "ade": null}] }
```

Todos os valores são texto (ou `null`); o banco converte e recusa com mensagem. `linha` é a linha do Excel (cabeçalho = 1).

Retorno de `importacao_conferir` e `importacao_gravar_lote`:

```json
{ "resumo": {"clientes": {"novas": 0, "existentes": 0, "erros": 0}, "matriculas": {…}, "contratos": {…}, "quitacoes": {…}, "dividas": {…}, "parcelas": {…}, "mensalidades": {…}},
  "erros":  [{"aba": "Contratos", "linha": 12, "mensagem": "CPF inválido."}],
  "avisos": [{"aba": "Clientes", "linha": 3, "mensagem": "Cliente já cadastrado com outro nome (Maria S.). Os dados dele não foram alterados."}] }
```

Nomes de aba no retorno: `Clientes`, `Matrículas`, `Contratos`, `Quitações`, `Dívidas compradas`, `Parcelas`, `Mensalidades`.

---

### Task 1: Base da importação (0022)

**Files:** Create `supabase/migrations/0022_importacao_base.sql`, `tests/db/0022_importacao_base.test.ts`

**Interfaces — Produces:**
- Permissão `importacao.executar` ('Importar dados do sistema anterior'), dada só a `administrador`. O teto do parceiro continua recusando-a.
- `public.importacoes(id uuid pk default gen_random_uuid(), arquivo_nome text not null, arquivo_caminho text, hash text not null, data_posicao date not null, situacao text not null default 'em_andamento' check (situacao in ('em_andamento','gravada','desfeita')), resumo jsonb, erros jsonb, usuario_id uuid default auth.uid(), criado_em timestamptz default now(), concluida_em timestamptz, desfeita_em timestamptz, desfeita_por uuid)`. RLS: select com `app_equipe_pode('importacao.executar')`; escrita só por funções (revoke insert/update/delete de authenticated). Auditada.
- Colunas `importacao_id uuid references public.importacoes(id)` em `clientes`, `cliente_matriculas`, `contratos`, `mensalidades`, `mensalidade_averbacoes`, `contrato_averbacoes`, com índice em cada.
- `contratos.numero_legado text unique` e `contratos.quitados_legado text` (nºs antigos sem ligação, separados por `; `).
- Bucket privado `importacoes`; insert/select em `storage.objects` com `bucket_id = 'importacoes' and app_equipe_pode('importacao.executar')`.
- `public._imp_chave(p text) returns text` (immutable): minúsculas, sem acento (via `translate`), espaços repetidos colapsados, `btrim`.
- `public._imp_data(p text, p_campo text) returns date`: aceita `aaaa-mm-dd`; `null`/vazio → null; outro → `raise exception '% inválida: %.', p_campo, p`.
- `public._imp_competencia(p text, p_campo text) returns date`: aceita `aaaa-mm-dd` ou `aaaa-mm`, devolve o dia 1; inválido → mesma mensagem.
- `public._imp_inteiro(p text, p_campo text) returns integer`: só dígitos; senão `'% inválido: %.'`.
- `trg_eventos_imutaveis` passa a permitir DELETE quando `current_setting('app.desfazendo_importacao', true) = 'on'` (UPDATE continua proibido sempre).

- [ ] **Step 1: Testes** em `0022_importacao_base.test.ts`:
  - `administrador tem importacao.executar e operador não` (consulta `perfil_permissoes`).
  - `teto do parceiro recusa importacao.executar` → `erroDe` = `'Esta permissão não pode ser dada ao perfil parceiro.'`.
  - `operador não lê importacoes` (insere uma como dono, `comoUsuario` operador → 0 linhas; admin → 1).
  - `_imp_chave('  Governo  do ÁCRE ')` = `'governo do acre'`.
  - `_imp_data('2024-05-10','Data da liberação')` = `2024-05-10`; `_imp_data('10/05/2024','Data da liberação')` → erro `'Data da liberação inválida: 10/05/2024.'`.
  - `_imp_competencia('2024-05','Primeira competência')` = `2024-05-01`.
  - `eventos continuam imutáveis` (delete sem a configuração → `'O histórico do contrato não pode ser alterado.'`) e `delete permitido com app.desfazendo_importacao = on` (`set local`).
- [ ] **Step 2:** `npx vitest run tests/db/0022` → FAIL (função/tabela não existe).
- [ ] **Step 3:** Escrever a migração; `npx supabase db reset`; `npm run db:tipos`.
- [ ] **Step 4:** `npx vitest run tests/db/0022` → PASS; `npm test` → tudo verde.
- [ ] **Step 5: Commit** `feat: base da importação de dados antigos`.

---

### Task 2: Processador por CPF, clientes e matrículas (0023)

**Files:** Create `supabase/migrations/0023_importacao_clientes.sql`, `tests/db/importacao_fixture.ts`, `tests/db/0023_importacao_clientes.test.ts`

**Interfaces — Consumes:** Task 1. **Produces:**
- `public.importacao_iniciar(p_arquivo_nome text, p_arquivo_caminho text, p_hash text, p_posicao date) returns uuid` — exige permissão; se existe importação `gravada` com o mesmo hash e `erros` vazio → `raise exception 'Este arquivo já foi importado em %.', to_char(criado_em,'DD/MM/YYYY')`. Cria a linha `em_andamento`.
- `public.importacao_conferir(p_dados jsonb, p_hash text default null) returns jsonb` — exige permissão; chama `_imp_processar(p_dados, null)` dentro de um bloco que termina com `raise exception using errcode = 'PIMP0'` e captura essa exceção devolvendo o resultado (nada fica gravado). Se `p_hash` bate com importação gravada que deixou erros, acrescenta aviso `{aba:'Arquivo', linha:0, mensagem:'Este arquivo já foi importado em dd/mm/aaaa; só as linhas que faltam vão entrar.'}`.
- `public.importacao_gravar_lote(p_importacao_id uuid, p_dados jsonb) returns jsonb` — exige permissão e importação `em_andamento` do próprio usuário; `pg_advisory_xact_lock(hashtext('importacao'))`; chama `_imp_processar(p_dados, p_importacao_id)`.
- `public.importacao_concluir(p_importacao_id uuid, p_resumo jsonb, p_erros jsonb) returns void` — grava resumo/erros, `situacao = 'gravada'`, `concluida_em = now()`.
- `public._imp_processar(p_dados jsonb, p_importacao_id uuid) returns jsonb` — monta os grupos por CPF (clientes, matrículas, contratos e mensalidades pelo `cpf`; quitações, dívidas e parcelas pelo CPF do contrato no próprio lote, senão pelo contrato já gravado com aquele `numero_legado`, senão erro `'O contrato antigo nº % não está na aba Contratos.'`). Para cada CPF, num subbloco `begin … exception when sqlstate 'PIMP1'`: chama, nesta ordem, `_imp_clientes`, `_imp_contratos`, `_imp_parcelas`, `_imp_mensalidades`, cada uma `(g jsonb, ctx jsonb) returns jsonb` — `g` é o grupo, `ctx` = `{importacao_id, posicao}` — e devolvendo um array de saídas `{aba, linha, tipo: 'erro'|'aviso'|'nova'|'existente', mensagem}`. As saídas ficam numa **variável local** do processador (variáveis sobrevivem ao desfazer do subbloco; tabela temporária e `set_config` não). Se o array do grupo tiver algum `erro`, o processador levanta `PIMP1` para desfazer o grupo. Dentro de cada função, o insert de cada linha fica no seu próprio `begin … exception when others` que transforma o erro do banco (ex.: trigger de CPF) numa saída `erro` com a aba/linha dessa linha e o `SQLERRM`. Depois de desfazer um grupo, cada linha dele sem erro próprio recebe o erro `'Não importado: há erro em outra linha deste CPF.'` e as contagens `nova`/`existente` do grupo são descartadas. No fim agrega as saídas no formato de retorno. Em `importacao_conferir`, o resultado é calculado numa variável antes do `raise … 'PIMP0'`.
- Nesta task, `_imp_contratos`, `_imp_parcelas` e `_imp_mensalidades` são criadas vazias (devolvem `'[]'::jsonb`); as Tasks 3–5 as substituem.
- `_imp_clientes`: CPF existente → `existente` (não altera; nome diferente em `_imp_chave` → aviso `'Cliente já cadastrado com outro nome (%). Os dados dele não foram alterados.'`); novo → insert com `whatsapp = coalesce(whatsapp, celular)` e `importacao_id`. Matrícula: convênio por `_imp_chave(nome)` (`'Convênio não encontrado: %.'`), vínculo do convênio (`'Vínculo não encontrado neste convênio: %.'`); já existe para o mesmo cliente → `existente`; para outro cliente → `'Esta matrícula pertence a outro cliente.'`; nova → insert com `importacao_id`. CPF que aparece em Matrículas/Contratos/Mensalidades mas não está na aba Clientes nem no banco → `'Cliente não encontrado: inclua o CPF na aba Clientes.'`. Limite: lote com mais de 300 CPFs → `'Lote grande demais.'`.

- [ ] **Step 1: Fixture** `importacao_fixture.ts`: `cenarioImportacao(c)` (convênio "Governo do Acre" com `dia_corte = 2`, `dia_vencimento = 28`, vínculo "Efetivo", parceiro "Parceiro A", admin) e `dados(parcial)` que devolve um lote mínimo válido (1 cliente, 1 matrícula) mesclando o que vier.
- [ ] **Step 2: Testes** `0023_importacao_clientes.test.ts`:
  - `conferir não grava nada` (resumo `clientes.novas = 1`; depois `select count(*) from clientes where cpf=…` = 0).
  - `gravar cria cliente e matrícula com importacao_id`; `whatsapp` vazio fica igual ao celular.
  - `reenviar o mesmo lote marca tudo como existente` (`clientes.existentes = 1`, `matriculas.existentes = 1`, nenhum novo).
  - `cliente existente com outro nome gera aviso e não é alterado`.
  - `convênio escrito com acento e maiúsculas diferente é encontrado` (`'GOVERNO DO ACRE'`).
  - `CPF inválido afasta o CPF inteiro`: erro `{aba:'Clientes', linha:2, mensagem:'CPF inválido.'}` e a matrícula do mesmo CPF com `'Não importado: há erro em outra linha deste CPF.'`; outro CPF válido do mesmo lote entra.
  - `matrícula de outro cliente é recusada`.
  - `operador não consegue conferir` → `'Você não tem permissão para esta ação.'`.
  - `iniciar recusa arquivo já importado sem erros` → `'Este arquivo já foi importado em DD/MM/AAAA.'`.
  - `lote com 300 CPFs grava em menos de 8 s` (gera 300 clientes; mede).
- [ ] **Step 3:** `npx vitest run tests/db/0023` → FAIL.
- [ ] **Step 4:** Migração, reset, tipos.
- [ ] **Step 5:** `npx vitest run tests/db/0023` → PASS; `npm test` verde.
- [ ] **Step 6: Commit** `feat: importação de clientes e matrículas com prévia e lotes`.

---

### Task 3: Contratos, quitações, dívidas e averbação (0024)

**Files:** Create `supabase/migrations/0024_importacao_contratos.sql`, `tests/db/0024_importacao_contratos.test.ts`

**Interfaces — Consumes:** Tasks 1–2. **Produces:** `create or replace function public._imp_contratos(g jsonb, ctx jsonb) returns jsonb` com as regras:
- `numero_antigo` já existe em `contratos.numero_legado` → `existente` (e suas quitações, dívidas e parcelas do lote também, sem conferir).
- Obrigatórios e conversões: `tipo` ∈ novo/refinanciamento/compra (`'Tipo inválido: %.'`), `prazo` > 0, `valor_parcela` e `valor_bruto` > 0 via `_dinheiro`, `valor_liquido` ≤ bruto, `data_liberacao`, `primeira_competencia` ≥ mês da liberação − 1 mês (`'A primeira competência é anterior à liberação.'`), `parcelas_pagas` entre 0 e prazo (`'Parcelas pagas maior que o prazo.'`), `situacao` ∈ ativo/em atraso/quitado/renovado/cancelado/prejuízo (aceita com ou sem acento; grava `ativo, em_atraso, quitado, renovado, cancelado, prejuizo`). Convênio sem `dia_vencimento` → `'Configure o dia de vencimento do convênio % antes de importar.'`.
- Matrícula precisa ser do CPF do contrato no mesmo convênio (do lote ou do banco) → `'Matrícula não encontrada para este cliente neste convênio.'`. Parceiro por `_imp_chave(nome)` → `'Parceiro não encontrado: %.'`.
- Insert em `contratos`: `numero_legado`, `fase = 'credito_liberado'`, `situacao` (ver abaixo), `legado = true`, `legado_importado_por = auth.uid()`, `legado_importado_em = now()`, `linha_tabela_id = null`, `fator = round(valor_parcela / valor_bruto, 8)`, `valores_travados_em = now()`, `data_liberacao`, `importacao_id`. Sem `contrato_comissao_regra`. Um `contrato_eventos` (`para = 'credito_liberado'`, `situacao_para`, `motivo = 'Importado do sistema anterior'`).
- Quitações (do mesmo `numero_novo`): `saldo` > 0; quitado encontrado (lote ou banco) precisa ser do mesmo cliente e `situacao = 'renovado'` (`'O contrato antigo nº % não é deste cliente ou não está renovado.'`) → `contrato_quitacoes` com `reservado = false`, `fonte = 'outro'`, `observacao = 'Importado'`; não encontrado → acrescenta o nº em `quitados_legado` e aviso `'Contrato quitado nº % não existe no sistema; guardado só como referência.'`. O saldo entra em `total_quitado` em ambos os casos.
- Dívidas compradas → `contrato_dividas_externas` (`credor`, `saldo` > 0, `numero_contrato_externo`), somadas em `total_dividas_externas`.
- Sobra `valor_bruto − valor_liquido − total_quitado − total_dividas_externas`: com líquido vazio = 0; negativa → `'O valor líquido não fecha: bruto menos quitações e dívidas fica menor que o líquido informado.'`; positiva → `contrato_descontos` do tipo `'Descontos do sistema anterior'` (criado em `convenio_tipos_desconto` com `forma = 'fixo'` se faltar) e `total_descontos`.
- ADE (se vier): `ativa` para ativo/em atraso/prejuízo — valida com `_validar_ade(convenio, ade, ade)`; `cancelada` para quitado/renovado/cancelado — só confere duplicidade no lote. `valor_averbado = valor_parcela`, `importacao_id`.
- Situação: para ativo/em atraso a situação gravada é recalculada na Task 4 (depois das parcelas); aqui grava a da planilha.

- [ ] **Step 1: Testes** `0024_importacao_contratos.test.ts`:
  - `contrato importado fica liberado, legado e sem comissão` (fase, legado, `numero_legado`, fator `0.06120000` para 122.40/2000, zero linhas em `contrato_comissao_regra`, 1 evento com o motivo).
  - `reimportar o mesmo contrato não duplica` (`contratos.existentes = 1`).
  - `refinanciamento liga ao quitado renovado e soma o saldo` (líquido = bruto − 500).
  - `quitado fora do sistema vira referência com aviso` (`quitados_legado = '3100'`).
  - `líquido menor que bruto vira desconto do sistema anterior`.
  - `líquido que não fecha é erro da linha`.
  - `ADE repetido no banco é recusado` → `'Este ADE já está em uso neste convênio.'`.
  - `contrato quitado com ADE grava averbação cancelada`.
  - `parceiro inexistente e tipo inválido viram erros da aba Contratos com a linha certa`.
- [ ] **Step 2:** FAIL. **Step 3:** migração, reset, tipos. **Step 4:** PASS + `npm test`.
- [ ] **Step 5: Commit** `feat: importação de contratos, quitações, dívidas e averbações`.

---

### Task 4: Parcelas e situação calculada (0025)

**Files:** Create `supabase/migrations/0025_importacao_parcelas.sql`, `tests/db/0025_importacao_parcelas.test.ts`

**Interfaces — Consumes:** Task 3. **Produces:** `create or replace function public._imp_parcelas(g jsonb, ctx jsonb) returns jsonb`:
- Para cada contrato novo do grupo. Vencimento = `make_date(ano, mês da competência, dia_vencimento do convênio)` (mesma fórmula de `liberar_credito`).
- **Com linhas na aba Parcelas:** usa-as (número 1..prazo sem repetição, competência única, valor > 0, situação ∈ paga/aberta/atrasada/cancelada → `'Situação da parcela inválida: %.'`). Paga → `status = 'paga'` + `parcela_pagamentos(valor, competencia_desconto = competencia, origem = 'legado')`.
- **Sem linhas:** gera `prazo` parcelas a partir de `primeira_competencia` com `valor_parcela`; as `parcelas_pagas` primeiras → pagas (com pagamento `legado`); demais: ativo/em atraso → `aberta`, e `atrasada` se `vencimento < ctx.posicao`; quitado/renovado/cancelado → `cancelada`; prejuízo → `prejuizo`.
- `averbacao_id` das parcelas = averbação ativa do contrato, se houver. `primeiro_vencimento` = menor vencimento.
- Situação final para contratos marcados ativo/em atraso: `em_atraso` se existe parcela `atrasada`, senão `ativo`; se diferir da planilha → aviso `'Situação ajustada para % pelas parcelas vencidas até a data da posição.'`.

- [ ] **Step 1: Testes** `0025_importacao_parcelas.test.ts`:
  - `gera 24 parcelas com 5 pagas e pagamentos legado` (competências 06/2024…05/2026, vencimento dia 28).
  - `parcelas vencidas antes da posição ficam atrasadas e o contrato vira em_atraso com aviso`.
  - `contrato quitado tem parcelas restantes canceladas`; `prejuízo tem parcelas restantes em prejuízo`.
  - `aba Parcelas substitui a regra de parcelas pagas`.
  - `erro numa parcela afasta o CPF inteiro` (CPF com 3 contratos; nenhum contrato, cliente ou matrícula dele gravado; demais linhas do CPF com `'Não importado: há erro em outra linha deste CPF.'`).
  - `recalcular_atrasos depois da importação não muda nada se a posição é hoje`.
- [ ] **Step 2:** FAIL. **Step 3:** migração, reset, tipos. **Step 4:** PASS + `npm test`.
- [ ] **Step 5: Commit** `feat: parcelas dos contratos importados`.

---

### Task 5: Mensalidades (0026)

**Files:** Create `supabase/migrations/0026_importacao_mensalidades.sql`, `tests/db/0026_importacao_mensalidades.test.ts`

**Interfaces — Consumes:** Task 2. **Produces:** `create or replace function public._imp_mensalidades(g jsonb, ctx jsonb) returns jsonb`:
- Agrupa por matrícula (convênio + matrícula); linhas ordenadas por `vigente_desde` (repetida → `'Competência repetida na mensalidade desta matrícula.'`); valor > 0; situação da última linha ∈ ativa/cancelada.
- Matrícula já tem mensalidade no banco: valor vigente (`_valor_mensalidade_em(id, ctx.posicao)`) igual ao da última linha → `existente`; diferente → `'Esta matrícula já tem mensalidade no sistema.'`.
- Nova: `mensalidades(matricula_id, situacao, importacao_id)`; cancelada → `cancelada_em = now()`, `motivo_cancelamento = 'Cancelada no sistema anterior'`, sem requerimento. `mensalidade_valores`: primeira `tipo = 'nova'`, seguintes `'reajuste'`. ADE (se vier) → `mensalidade_averbacoes` (`ativa` com `_validar_ade` se a mensalidade está ativa; senão `cancelada`), `valor_averbado` = último valor, `importacao_id`. Não cria `mensalidade_parcelas`.

- [ ] **Step 1: Testes**: `histórico de 3 valores fica nova/reajuste/reajuste e o vigente é o último`; `mensalidade cancelada não exige requerimento`; `mesmo valor já existente é pulado`; `valor diferente do existente é erro`; `ADE da mensalidade repetido com contrato é recusado`.
- [ ] **Step 2:** FAIL. **Step 3:** migração, reset, tipos. **Step 4:** PASS + `npm test`.
- [ ] **Step 5: Commit** `feat: mensalidades importadas com histórico de valores`.

---

### Task 6: Desfazer (0027)

**Files:** Create `supabase/migrations/0027_importacao_desfazer.sql`, `tests/db/0027_importacao_desfazer.test.ts`

**Interfaces — Consumes:** Tasks 1–5. **Produces:** `public.desfazer_importacao(p_id uuid) returns void` — exige permissão; só `gravada` (`'Esta importação não pode ser desfeita.'`). Bloqueia com a primeira mensagem que se aplicar:
- contrato da importação com `versao > 1`, mais de 1 `contrato_eventos`, `parcela_pagamentos` com `origem <> 'legado'`, averbação ou `pendencias_averbadora` criadas depois de `importacoes.criado_em`, ou citado em `contrato_quitacoes` de contrato de fora da importação → `'Não dá para desfazer: o contrato antigo nº % já foi alterado.'`;
- mensalidade com `mensalidade_valores` ou cancelamento posteriores, ou `mensalidade_parcelas` paga/parcial → `'Não dá para desfazer: a mensalidade da matrícula % já foi alterada.'`;
- cliente criado com `atualizado_em > importacoes.criado_em`, ou com contas, documentos, contratos ou mensalidades de fora da importação → `'Não dá para desfazer: o cliente de CPF % já foi alterado.'`;
- matrícula criada usada por contrato/mensalidade de fora → mesma mensagem do cliente.
Mudanças automáticas (status de parcelas, `situacao` ativo/em_atraso, `mensalidade_parcelas` abertas/atrasadas) não contam. Se liberado: `set local app.desfazendo_importacao = 'on'`; apaga mensalidades, averbações de mensalidade, contratos (cascata), matrículas e clientes **com aquele `importacao_id`**; marca `desfeita`, `desfeita_em`, `desfeita_por`.

- [ ] **Step 1: Testes**: `desfazer apaga só o que a importação criou` (cliente que já existia continua); `desfazer depois de recalcular_atrasos funciona`; `contrato editado bloqueia com o nº antigo na mensagem`; `pagamento manual bloqueia`; `cliente com conta nova bloqueia`; `segunda vez dá 'Esta importação não pode ser desfeita.'`; `operador não desfaz`.
- [ ] **Step 2:** FAIL. **Step 3:** migração, reset, tipos. **Step 4:** PASS + `npm test`.
- [ ] **Step 5: Commit** `feat: desfazer importação`.

---

### Task 7: Planilha no navegador (colunas e planilha.ts)

**Files:** Create `app/src/features/importacao/colunas.ts`, `app/src/features/importacao/planilha.ts`, `app/src/features/importacao/planilha.test.ts`; Modify `app/package.json` (`exceljs@4.4.0`).

**Interfaces — Produces:**
- `colunas.ts`: `export const ABAS: { nome: AbaNome; chave: keyof DadosImportacao; colunas: { chave: string; titulo: string; obrigatoria: boolean; tipo: 'texto'|'data'|'competencia'|'dinheiro'|'inteiro'; exemplo: string }[] }[]`, na ordem e com os títulos da seção 4 do desenho (sem o `*` no título; o modelo acrescenta). Aba Instruções: linha 1 `Data da posição` | célula B1; depois a explicação de cada coluna.
- `planilha.ts`:
  - `gerarModelo(): Promise<Blob>` — Excel com Instruções + as 7 abas, cabeçalho em negrito, uma linha de exemplo.
  - `lerPlanilha(arquivo: ArrayBuffer): Promise<{ dados: DadosImportacao; errosLeitura: ErroLinha[] }>` — acha abas e colunas por `_imp_chave` equivalente em TS (`chaveTexto`); aba obrigatória ausente → `{aba, linha: 0, mensagem: 'A aba % não foi encontrada.'}`; linhas totalmente vazias ignoradas; `posicao` vazia → erro `'Informe a Data da posição na aba Instruções.'`.
  - Conversões: `paraData(v: unknown): string|null` (Date, número serial do Excel, `dd/mm/aaaa`, `aaaa-mm-dd` → `aaaa-mm-dd`; outro texto volta como está para o banco recusar), `paraCompetencia` (`mm/aaaa`, Date, serial → `aaaa-mm-01`), `paraDinheiro` (`1.234,56`, `1234,5`, número → `'1234.56'`; outro texto volta como está), CPF e matrícula como texto (número do Excel sem `.0`).
  - `conferirArquivo(d: DadosImportacao): ErroLinha[]` — duplicados dentro do arquivo: CPF repetido em Clientes, nº antigo repetido em Contratos, ADE repetido (contratos + mensalidades, por convênio), matrícula repetida por convênio em Matrículas → `'Repetido no arquivo (também na linha %).'`.
  - `dividirEmLotes(d: DadosImportacao, maxCpfs = 300): DadosImportacao[]` — todas as linhas de um CPF (inclusive quitações/dívidas/parcelas pelo CPF do contrato) no mesmo lote; linhas cujo contrato não está no arquivo vão no último lote; `posicao` em todos.
  - `planilhaDeErros(original: ArrayBuffer, erros: ErroLinha[]): Promise<Blob>` — mesmo modelo, só as linhas com erro, coluna final `Erro`.
  - `hashArquivo(a: ArrayBuffer): Promise<string>` (SHA-256 hex via `crypto.subtle`).

- [ ] **Step 1: Testes** `planilha.test.ts`: `modelo gerado é lido de volta sem erros` (gera, preenche 1 linha por aba com ExcelJS, lê); `paraData` com `new Date(2024,4,10)`, serial `45422`, `'10/05/2024'` → `'2024-05-10'` e `'abc'` → `'abc'`; `paraCompetencia('05/2024')` → `'2024-05-01'`; `paraDinheiro('1.234,56')` → `'1234.56'`, `paraDinheiro(1234.5)` → `'1234.50'`; `cabeçalho com acento/maiúsculas diferente é reconhecido`; `aba faltando vira erro`; `conferirArquivo acha contrato repetido com as duas linhas`; `dividirEmLotes com 650 CPFs gera 3 lotes e mantém parcelas junto do contrato`; `planilhaDeErros contém só as linhas com erro e a coluna Erro`.
- [ ] **Step 2:** `cd app && npx vitest run src/features/importacao` → FAIL. **Step 3:** `npm i exceljs@4.4.0`; implementar. **Step 4:** PASS + `npx tsc -b`.
- [ ] **Step 5: Commit** `feat: leitura e geração da planilha modelo de importação`.

---

### Task 8: Tela de importação

**Files:** Create `app/src/features/importacao/ImportacaoPage.tsx`, `app/src/features/importacao/importacao.test.tsx`; Modify `app/src/rotas.tsx` (rota `/importacao`), `app/src/lib/permissoes.ts` (item de menu "Importar dados antigos", permissão `importacao.executar`).

**Interfaces — Consumes:** Tasks 2–7 (RPCs `importacao_conferir`, `importacao_iniciar`, `importacao_gravar_lote`, `importacao_concluir`, `desfazer_importacao`; tabela `importacoes`; bucket `importacoes`).

Fluxo da tela:
1. **Baixar modelo** → `gerarModelo()`.
2. **Enviar arquivo** (`.xlsx`, até 10 MB → `'Arquivo maior que 10 MB. Divida a planilha.'`; mais de 50 mil linhas → `'Planilha com mais de 50 mil linhas. Divida em arquivos menores.'`) → `lerPlanilha` + `conferirArquivo` + `importacao_conferir` por lote (com barra "Conferindo lote 2 de 5"), somando resumos. CPFs com erro de `conferirArquivo` não são enviados e entram como erro.
3. **Prévia**: tabela por aba (novas / já existem / com erro), avisos, lista de erros `Aba X, linha N: mensagem` com filtro por aba; texto "X linhas entram, Y ficam de fora".
4. **Gravar** (desabilitado se nada entra): sobe o arquivo em `importacoes/<uuid>/<nome>`, `importacao_iniciar`, `importacao_gravar_lote` por lote, `importacao_concluir` com a soma. Ao fim: resumo + botão **Baixar linhas com erro** (`planilhaDeErros`) quando houver.
5. **Histórico** (`importacoes` mais recentes primeiro): data, quem, arquivo, totais, situação; **Desfazer** com `confirm('Desfazer a importação de <arquivo>? Os dados criados por ela serão apagados.')`; erro mostrado com `mensagemErro`.

- [ ] **Step 1: Teste** `importacao.test.tsx` (supabase mockado como nos testes da esteira): `mostra a prévia somada de dois lotes`; `Gravar fica desabilitado quando nada entra`; `menu não mostra Importar dados antigos para operador`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `npx tsc -b` + `npm test`.
- [ ] **Step 5: Verificação no navegador** (dev server `app` da `.claude/launch.json`): baixar modelo, preencher 3 CPFs (um com CPF inválido), conferir, gravar, ver 2 clientes e seus contratos/parcelas no sistema, baixar linhas com erro, desfazer, conferir que sumiram.
- [ ] **Step 6: Commit** `feat: tela de importação de dados antigos`.

---

## Fim da etapa

`/code-review` no ramo + revisão do Codex (`exec --sandbox read-only`) sobre as migrações 0022–0027 e `features/importacao`; corrigir Critical/Important com teste que falha antes; relatório ao dono em português.
