# Etapa 4 — Contrato em PDF e assinatura (ZapSign) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O administrador mantém o modelo do contrato (com versões) em cada convênio; a equipe envia o contrato averbado para assinatura na ZapSign; o aviso da ZapSign traz o PDF assinado; uma pessoa confere e aprova; reenviar, vencer em 7 dias e cancelar funcionam.

**Architecture:** Todas as regras e mudanças de estado ficam no banco (RPCs), testadas com `pg` como nas etapas anteriores. O que precisa de rede ou de PDF fica em duas Edge Functions (`assinatura` e `zapsign-webhook`) que são finas: chamam RPCs, montam o PDF e falam com a ZapSign. A lógica das funções mora em módulos TS puros em `supabase/functions/_shared/`, testados no Node por um novo projeto do vitest (`funcoes`), com uma ZapSign falsa local.

**Tech Stack:** a das Etapas 1–3 + `pdf-lib@1.17.1` (Deno via `deno.json`, Node como devDependency).

**Spec:** `docs/superpowers/specs/2026-10-29-etapa4-pdf-assinatura-design.md`

## Global Constraints

- Tudo local; `git push` só com "pode subir" do dono. Nada em banco de produção.
- Antes de cada commit: `npx tsc -b` em `app/` e `npm test` na raiz, passando.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Toda tabela nova: RLS + trigger `public.auditar()`; funções `security definer`, `set search_path = ''`, `revoke … from public, anon`. Funções `_assinatura_*` (uso das Edge Functions) só para `service_role`.
- Mensagens ao usuário em português claro.
- Nenhuma chave no repositório ou no navegador. Segredos das funções: `ZAPSIGN_API_TOKEN`, `ZAPSIGN_WEBHOOK_SEGREDO`, `ZAPSIGN_URL` (padrão `https://sandbox.api.zapsign.com.br`). Localmente em `supabase/functions/.env` (já coberto por `.env*` no `.gitignore`); o dono preenche. Testes usam ZapSign falsa.
- "É produção?" = `public.config_bool('ambiente_producao')` (linha nova em `configuracoes`, padrão `false`). *Ruling do plano: o desenho citava variável de ambiente "ex."; no banco a regra fica onde é aplicada e é auditada.*
- Contratos legados (`legado = true`) nunca são enviados.

## Situações do envio (`contrato_assinaturas.situacao`)

`preparando` → `enviado` → `assinado` → `aprovado`; desvios: `falhou`, `recusado_cliente`, `vencido`, `cancelamento_pendente` → `cancelado`. "Envio aberto" = `preparando`, `enviado` ou `assinado`. No máximo um envio aberto por contrato (índice único parcial).

## Review Focus

1. **Aviso da ZapSign repetido, fora de ordem ou forjado** → nada muda duas vezes; aviso sem segredo certo é 401; situação vem sempre da consulta à ZapSign (testes na Task 3 e Task 6).
2. **Valores editados entre envio e aprovação** → aprovar é recusado e o contrato volta a "averbado" (testes na Task 4).
3. **ZapSign fora do ar no envio** → contrato continua "averbado", envio `falhou`, mensagem em português (teste na Task 6).
4. **Texto do modelo com acento, travessão, aspas curvas, emoji, linha muito longa, tabela de 96 parcelas** → PDF gerado com quebra de linha e de página, caractere sem suporte trocado, nunca exceção (testes na Task 5).
5. **Modelo de teste em produção / convênio sem modelo / cliente sem celular** → envio recusado com mensagem clara, nada criado na ZapSign (testes na Task 3).

---

### Task 1: Base — modelos, configuração de assinatura, envios, bucket

**Files:**
- Create: `supabase/migrations/0029_assinatura_base.sql`
- Test: `tests/db/0029_assinatura_base.test.ts`

**Interfaces:**
- Produces:
  - `convenios` ganha: `assinatura_prazo_dias int not null default 7 check (between 1 and 90)`, `assinatura_selfie bool default true`, `assinatura_documento bool default true`, `assinatura_codigo bool default true`, `assinatura_email bool default true`, `assinatura_whatsapp bool default true`. Remove `modelo_contrato`.
  - `convenio_assinantes(id, convenio_id, nome, email, celular, papel, ordem, ativo)` — leitura `convenios.ver`, escrita `convenios.editar`.
  - `contrato_modelos(id, convenio_id, versao int, texto text, teste bool, ativo bool, criado_por, criado_em)`, `unique(convenio_id, versao)`, índice único parcial de um `ativo` por convênio. Sem UPDATE/DELETE para `authenticated` (salvar = nova versão).
  - `contrato_assinaturas(id, contrato_id, modelo_id, situacao text, valores jsonb, pdf_caminho, pdf_assinado_caminho, zapsign_token, assinantes jsonb, evidencias jsonb, prazo date, erro text, enviado_por, enviado_em, assinado_em, conferido_por, conferido_em, cancelado_em, criado_em)`; índice único parcial `(contrato_id) where situacao in ('preparando','enviado','assinado')`. Leitura: equipe `contratos.ver`; parceiro se `contrato_visivel` (sem coluna `evidencias` — via view `contrato_assinaturas_parceiro` ou coluna mascarada; builder escolhe, teste cobre). Escrita só por funções.
  - Bucket privado `contratos-assinatura`, caminhos `<contrato_id>/<assinatura_id>/{enviado.pdf|assinado.pdf|evidencias/...}`. Equipe `contratos.ver` lê tudo; parceiro lê só `*.pdf` de contrato visível. Escrita só `service_role`.
  - `configuracoes`: `('ambiente_producao', 'false', 'Este banco é o de produção (bloqueia modelo de teste)')`.
  - `modelo_campos() returns table(chave text, rotulo text, exemplo text)` (stable, `authenticated`): a lista única de campos. Chaves com ponto (`cliente.nome`). Inclui também os blocos `parcelas.tabela` e as condições `se mensalidade`, `se quitacoes`, `se dividas`.
  - `salvar_modelo_contrato(p_convenio_id uuid, p_texto text, p_teste boolean) returns int` — exige `convenios.editar`; valida marcadores; cria versão `max+1`, ativa, desativa a anterior; devolve a versão.

- [ ] **Step 1: Testes** (`0029 base da assinatura`):
  - `salvar_modelo_contrato` cria versão 1, depois 2; só a 2 fica ativa; a 1 continua lá com o mesmo texto.
  - texto com `{cliente.nomee}` → erro `Campo desconhecido: {cliente.nomee}.`
  - `{se mensalidade}` sem `{fim}` → `Bloco "{se mensalidade}" sem {fim}.`; `{fim}` sobrando → `{fim} sem bloco aberto.`; `{se outra}` → `Condição desconhecida: {se outra}.`
  - operador não salva modelo (`Você não tem permissão para esta ação.`); `update`/`delete` direto em `contrato_modelos` como administrador → `permission denied`.
  - `modelo_campos()` contém pelo menos `cliente.nome`, `cliente.cpf`, `contrato.valor_parcela`, `contrato.prazo`, `contrato.ade`, `mensalidade.valor`, `documento.data_extenso`, `parcelas.tabela`.
  - dois envios abertos para o mesmo contrato → violação do índice único.
  - parceiro lê o envio do seu contrato mas não vê `evidencias`; não vê envio de contrato de outro parceiro.
  - `convenios.modelo_contrato` não existe mais; `assinatura_prazo_dias` padrão 7.
- [ ] **Step 2:** `npx vitest run tests/db/0029_assinatura_base.test.ts` → FAIL (função não existe).
- [ ] **Step 3:** Escrever a migração. Validação de marcadores: regex `\{([^{}]+)\}` sobre o texto; cada achado é um campo de `modelo_campos()`, `se <cond>` com cond conhecida, ou `fim`; pilha para conferir os blocos (não aninhar é permitido, mas cada `se` precisa do seu `fim`).
- [ ] **Step 4:** `npx supabase db reset` e o teste → PASS; `npm run db:tipos`.
- [ ] **Step 5:** Commit `feat: base da assinatura (modelos com versão, envios, bucket)`.

### Task 2: Dados do documento

**Files:**
- Create: `supabase/migrations/0030_assinatura_dados.sql`
- Test: `tests/db/0030_assinatura_dados.test.ts`

**Interfaces:**
- Consumes: `modelo_campos()`, `primeira_competencia(uuid, date)`, `contratos`, parcelas/quitações/dívidas/mensalidade proposta, contas do cliente.
- Produces: `contrato_dados_documento(p_contrato_id uuid, p_data date default current_date) returns jsonb` — exige `contratos.ver` + `contrato_visivel`. Formato:
  `{ "campos": {"cliente.nome": "...", ...}, "condicoes": {"mensalidade": bool, "quitacoes": bool, "dividas": bool}, "parcelas": [{"numero":1,"competencia":"06/2024","vencimento":"28/06/2024","valor":"R$ 122,40"}], "valores": {"valor_parcela": "122.40", "prazo": 24, "valor_bruto": "...", "valor_liquido": "...", "mensalidade_proposta": "..." } }`
  Textos já formatados no banco: dinheiro `R$ 1.234,56`, data `DD/MM/YYYY`, competência `MM/YYYY`, CPF `000.000.000-00`, `documento.data_extenso` = `29 de outubro de 2026`. Campo sem valor = `""`. Parcelas **previstas**: competência inicial `primeira_competencia(convenio, p_data)`, vencimento `make_date(ano, mês, convenio.dia_vencimento)` (mesma regra da liberação). `valores` é o retrato usado na aprovação (Task 4).

- [ ] **Step 1: Testes** (`0030 dados do documento`):
  - as chaves de `campos` são exatamente as de `modelo_campos()` que não são bloco/condição (comparar conjuntos).
  - contrato do fixture (24x R$ 122,40, Acre corte 2, venc. 28) com `p_data = '2026-10-01'` → 24 parcelas, a primeira com a competência de `primeira_competencia(convenio,'2026-10-01')` e vencimento dia 28; `contrato.valor_parcela = 'R$ 122,40'`.
  - refinanciamento com quitação → `condicoes.quitacoes = true`; contrato novo sem mensalidade proposta → `condicoes.mensalidade = false`.
  - cliente sem RG → `campos."cliente.rg" = ''`.
  - parceiro de outro contrato → `Contrato não encontrado.`
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** reset + teste → PASS.
- [ ] **Step 5:** Commit `feat: dados do contrato para o documento`.

### Task 3: Envio, aviso da ZapSign e vencimento (banco)

**Files:**
- Create: `supabase/migrations/0031_assinatura_envio.sql`
- Test: `tests/db/0031_assinatura_envio.test.ts`, fixture `tests/db/assinatura_fixture.ts` (contrato averbado + modelo ativo; helpers `comoServico(c)` = `set local role service_role`)

**Interfaces:**
- Consumes: Tasks 1–2, `_registrar_mudanca`.
- Produces:
  - `assinatura_preparar(p_contrato_id uuid) returns jsonb` (`authenticated`, exige `contratos.mover`; equipe — parceiro recebe `Você não tem permissão para esta ação.`). Confere, nesta ordem e com estas mensagens: fase `averbado` (`O contrato precisa estar averbado para enviar.`), não legado, sem envio aberto (`Este contrato já tem uma assinatura em andamento.`), modelo ativo (`Este convênio ainda não tem modelo de contrato.`), modelo de teste em produção (`O modelo deste convênio é de teste e não pode ser usado em produção.`), celular do cliente (`O cliente não tem celular cadastrado.`), e-mail se `assinatura_email` (`O cliente não tem e-mail cadastrado.`). Cria envio `preparando` com `valores`, `modelo_id`, `prazo = current_date + assinatura_prazo_dias`. Devolve `{assinatura_id, modelo: {texto, teste, versao}, dados: <contrato_dados_documento>, config: {selfie, documento, codigo, email, whatsapp, prazo}, assinantes: [{nome,email,celular,papel}]}` (cliente primeiro, depois `convenio_assinantes` ativos por `ordem`).
  - `_assinatura_registrar_envio(p_id uuid, p_pdf_caminho text, p_zapsign_token text, p_assinantes jsonb) returns void` (`service_role`): `preparando` → `enviado`, contrato `averbado` → `aguardando_assinatura` via `_registrar_mudanca` com motivo `Enviado para assinatura`.
  - `_assinatura_falhou(p_id uuid, p_erro text) returns void` (`service_role`): `preparando` → `falhou`.
  - `_assinatura_atualizar(p_zapsign_token text, p_situacao text, p_pdf_assinado_caminho text, p_evidencias jsonb) returns text` (`service_role`), `p_situacao in ('assinado','recusado_cliente')`; só age se o envio está `enviado`; senão não faz nada; devolve a situação final. Idempotente.
  - `assinaturas_vencer(p_hoje date) returns int`: `enviado` com `prazo < p_hoje` → `vencido`; cron diário `'assinaturas-vencer', '0 5 * * *'`.
  - `fase_transicoes`: apagar `averbado → aguardando_assinatura` e `aguardando_assinatura → aguardando_pagamento` (agora só pelas funções desta etapa).
  - Contratos já em `aguardando_assinatura` sem envio → voltam a `averbado` com evento motivo `Volta para envio pela assinatura eletrônica`.

- [ ] **Step 1: Testes** (`0031 envio para assinatura`): cada mensagem acima num caso; `preparar` devolve cliente como primeiro assinante e os extras; ciclo preparar → registrar → contrato em `aguardando_assinatura` com evento; `falhou` deixa contrato `averbado` e permite novo `preparar`; `_assinatura_atualizar` duas vezes com `assinado` → segunda não muda nada e `assinado_em` é o da primeira; atualizar envio `cancelado` não faz nada; `authenticated` chamando `_assinatura_registrar_envio` → `permission denied`; `mover_contrato(id,'aguardando_assinatura')` → `Esta mudança de fase não é permitida.`; `assinaturas_vencer(prazo + 1)` vence 1, contrato continua em `aguardando_assinatura`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** reset + teste → PASS; `npm test` inteiro (testes antigos que moviam `averbado → aguardando_assinatura` direto precisam passar pelo fixture novo — ajuste registrado como Ruling).
- [ ] **Step 5:** Commit `feat: envio, retorno e vencimento da assinatura no banco`.

### Task 4: Conferência, pendente/recusa, edição e cancelamento (banco)

**Files:**
- Create: `supabase/migrations/0032_assinatura_conferencia.sql`
- Test: `tests/db/0032_assinatura_conferencia.test.ts`

**Interfaces:**
- Consumes: Task 3; `mover_contrato` e `editar_contrato` (última versão em `0021_correcoes_etapa2.sql` — copiar dali e alterar).
- Produces:
  - `aprovar_assinatura(p_contrato_id uuid) returns void` (`contratos.mover`, equipe): exige envio `assinado` (`Não há assinatura para conferir.`); compara `valores` com o contrato atual (`Os valores do contrato mudaram depois do envio. Envie de novo.` — e nesse caso nada muda); envio → `aprovado` com `conferido_por/em`; contrato → `aguardando_pagamento` (motivo `Assinatura conferida`).
  - `_assinatura_cancelar_aberta(p_contrato_id uuid, p_motivo text) returns void` (interno): envio aberto ou `aprovado` de contrato que ainda não teve crédito liberado → `cancelamento_pendente` (se tem `zapsign_token`) ou `cancelado` (se `preparando` sem token).
  - `mover_contrato`: para `pendente`/`recusado` chama `_assinatura_cancelar_aberta`; quando a fase de origem é `aguardando_assinatura` ou `aguardando_pagamento`, `fase_retorno` = `averbado`.
  - `editar_contrato`: se mudou valor (parcela, prazo, bruto, descontos, quitações, dívidas, mensalidade proposta) e o contrato está em `aguardando_assinatura` ou `aguardando_pagamento` → `_assinatura_cancelar_aberta` + contrato volta a `averbado` (motivo `Valores alterados: nova assinatura necessária`).
  - `_assinatura_cancelamento_feito(p_id uuid, p_ok boolean, p_erro text) returns void` (`service_role`): `cancelamento_pendente` → `cancelado` (ok) ou mantém com `erro` preenchido.
  - `assinaturas_lista(p_tipo text) returns setof jsonb` (equipe `contratos.ver`), `p_tipo in ('conferir','vencidas','recusadas','cancelar')`: contrato id, cliente, CPF, convênio, situação, datas, erro.

- [ ] **Step 1: Testes** (`0032 conferência da assinatura`): aprovar sem assinado → mensagem; aprovar com assinado → `aguardando_pagamento`; editar valor depois de `assinado` → contrato `averbado`, envio `cancelamento_pendente`; aprovar com valores diferentes (alterados por `update` como dono) → mensagem e nada muda; pendente em `aguardando_assinatura` → envio `cancelamento_pendente` e ao corrigir volta para `averbado`; recusar → `cancelamento_pendente`; editar valor em `aguardando_pagamento` → `averbado` + envio aprovado vira `cancelamento_pendente`; `_assinatura_cancelamento_feito(false,'x')` mantém e aparece em `assinaturas_lista('cancelar')`; listas `conferir` e `vencidas` trazem os casos certos; perfil consulta chamando `aprovar_assinatura` → `Você não tem permissão para esta ação.`
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** reset + `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: conferência e cancelamento da assinatura no banco`.

### Task 5: Modelo → PDF (módulos compartilhados)

**Files:**
- Create: `supabase/functions/_shared/modelo.ts`, `supabase/functions/_shared/pdf.ts`, `supabase/functions/_shared/modelo.test.ts`, `supabase/functions/_shared/pdf.test.ts`, `supabase/functions/assinatura/deno.json` (`{"imports": {"pdf-lib": "npm:pdf-lib@1.17.1"}}`)
- Modify: `vitest.config.ts` (projeto `funcoes`: `include: ['supabase/functions/**/*.test.ts']`, `environment: 'node'`), `package.json` (devDependency `pdf-lib@1.17.1` exata)

**Interfaces:**
- Consumes: formato de `contrato_dados_documento` (Task 2).
- Produces:
  - `type Bloco = {tipo:'titulo'|'subtitulo'|'paragrafo'|'item', partes: {texto:string, negrito:boolean}[]} | {tipo:'parcelas', linhas: Parcela[]}`
  - `renderizarModelo(texto: string, dados: DadosDocumento): Bloco[]` — marcação: linha `# ` título, `## ` subtítulo, `- ` item, linha em branco separa parágrafos, `**x**` negrito; `{campo}` trocado pelo valor; `{se cond}…{fim}` some se a condição é falsa; `{parcelas.tabela}` sozinho na linha vira bloco `parcelas`.
  - `gerarPdf(blocos: Bloco[], opcoes: {teste: boolean, titulo: string}): Promise<Uint8Array>` — A4, Helvetica/Helvetica-Bold (pdf-lib padrão), margens 50pt, quebra de linha por largura, quebra de página, rodapé `Página X de Y`; tabela de parcelas com cabeçalho repetido em nova página; frase `Datas previstas; confirmadas na liberação do crédito.` abaixo da tabela; com `teste`, tarja diagonal `MODELO DE TESTE — NÃO USAR` em toda página. Caractere fora do WinAnsi é trocado por `?` (aspas curvas → retas, travessão mantido).
- [ ] **Step 1: Testes:** `renderizarModelo` — campo trocado; negrito em partes; condição falsa remove o trecho e a verdadeira só tira os marcadores; parcelas viram bloco. `gerarPdf` — começa com `%PDF`; 96 parcelas geram mais de 1 página (contar com `PDFDocument.load(...).getPageCount()`); texto com `ção “x” — 😀` não lança; linha de 2000 caracteres sem espaço não lança; com `teste: true` o texto extraído contém a tarja (ou: cada página tem o desenho — builder escolhe a checagem).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run --project funcoes` → PASS; `npm test`.
- [ ] **Step 5:** Commit `feat: modelo do contrato vira PDF`.

### Task 6: ZapSign e Edge Functions

**Files:**
- Create: `supabase/functions/_shared/zapsign.ts`, `supabase/functions/_shared/fluxo.ts`, `supabase/functions/_shared/zapsign-falsa.ts` (servidor HTTP falso, usado nos testes e no teste no navegador), `supabase/functions/_shared/fluxo.test.ts`, `supabase/functions/assinatura/index.ts`, `supabase/functions/zapsign-webhook/index.ts`, `supabase/functions/zapsign-webhook/deno.json`, `supabase/functions/.env.example` (só nomes das variáveis, sem valores)
- Modify: `supabase/config.toml` (`[functions.zapsign-webhook] verify_jwt = false`)

**Interfaces:**
- Consumes: RPCs das Tasks 3–4, `renderizarModelo`, `gerarPdf`.
- Produces:
  - `zapsign.ts`: `criarCliente({url, token, fetch?})` com `criarDocumento({nome, pdfBase64, assinantes, exige:{selfie,documento,codigo}, canais:{email,whatsapp}, prazo})`, `consultar(token)`, `reenviar(signerToken)`, `atualizarAssinante(signerToken, {email, celular})`, `cancelar(docToken)`, `baixar(url)`. Endpoints e campos conforme a documentação oficial da API ZapSign (o builder confere; registrar no ledger os endpoints usados). Erro HTTP → `ErroZapSign` com mensagem em português.
  - `fluxo.ts` (dependências injetadas: `rpc`, `upload`, `zapsign`, `producao`):
    - `enviar(contratoId)`: `assinatura_preparar` → `renderizarModelo` → `gerarPdf` → upload `enviado.pdf` → `criarDocumento` → `_assinatura_registrar_envio`; qualquer falha depois do preparar → `_assinatura_falhou` e erro `Não foi possível enviar para a ZapSign. Tente de novo em alguns minutos.`
    - `previa(convenioId, contratoId|null, texto)` → PDF (sem gravar nada; `contrato_dados_documento` ou dados de exemplo de `modelo_campos().exemplo`).
    - `reenviar(contratoId, {atualizarContato:boolean})`.
    - `processarCancelamentos()` → para cada `cancelamento_pendente`, `cancelar` + `_assinatura_cancelamento_feito`.
    - `receberAviso(docToken)`: `consultar` → se todos assinaram, baixar PDF assinado e evidências para o bucket e `_assinatura_atualizar('assinado', …)`; se recusado, `_assinatura_atualizar('recusado_cliente', …)`; outro estado → nada.
  - `assinatura/index.ts`: POST `{acao: 'enviar'|'previa'|'reenviar'|'processar_cancelamentos', ...}`, usa o JWT de quem chama para as RPCs de usuário e a service role só para `_assinatura_*` e Storage (padrão de `criar-usuario`). Sem `ZAPSIGN_API_TOKEN` → 503 `A assinatura eletrônica ainda não foi configurada.` (prévia funciona sem chave).
  - `zapsign-webhook/index.ts`: confere `?segredo=` contra `ZAPSIGN_WEBHOOK_SEGREDO` (comparação em tempo constante) → senão 401; chama `receberAviso` com o token do documento do corpo; responde 200 mesmo quando nada muda.
- [ ] **Step 1: Testes** (`fluxo.test.ts`, com ZapSign falsa e `rpc`/`upload` falsos que registram chamadas): envio feliz chama as RPCs na ordem e manda o PDF em base64 com exigências e prazo do convênio; ZapSign 500 → `_assinatura_falhou` chamado e mensagem certa; aviso com documento assinado na falsa → upload do assinado + `_assinatura_atualizar('assinado')`; aviso repetido → mesma chamada (a idempotência é do banco); aviso de documento ainda pendente → nenhuma RPC; `processarCancelamentos` com falha numa → as outras seguem; webhook sem segredo → 401 (testar a função de checagem exportada).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run --project funcoes` → PASS; `npm test`; `npx supabase functions serve` sobe sem erro de import.
- [ ] **Step 5:** Commit `feat: integração com a ZapSign (envio, aviso, reenvio, cancelamento)`.

### Task 7: Telas

**Files:**
- Create: `app/src/features/convenios/ModeloContrato.tsx`, `app/src/features/convenios/AssinaturaConfig.tsx`, `app/src/features/contratos/AssinaturaCartao.tsx`, `app/src/features/assinaturas/AssinaturasPage.tsx`, `app/src/features/assinaturas/useAssinaturas.ts`, testes `*.test.tsx` ao lado
- Modify: `app/src/features/convenios/ConveniosPage.tsx`, `app/src/features/contratos/ContratoPage.tsx`, `app/src/features/esteira/AcoesFase.tsx` (tirar os botões genéricos de `averbado → aguardando assinatura` e `aguardando assinatura → aguardando pagamento`; no lugar, "Enviar para assinatura"), `app/src/rotas.tsx` (`/assinaturas`), `app/src/lib/permissoes.ts` (menu "Assinaturas", `contratos.mover`)

**Interfaces:**
- Consumes: RPCs `salvar_modelo_contrato`, `modelo_campos`, `aprovar_assinatura`, `assinaturas_lista`; Edge Function `assinatura` via `supabase.functions.invoke('assinatura', {body})`.
- Produces: telas.
  - **Modelo do contrato** (no convênio, `convenios.editar`): versão ativa e histórico (só leitura), área de texto, lista de campos com exemplo (clicar insere no cursor), caixa "modelo de teste", botões "Ver prévia" (abre o PDF em nova aba) e "Salvar nova versão"; erro do banco mostrado como veio.
  - **Assinatura no convênio**: prazo (dias), três exigências, dois canais, assinantes extras (adicionar/desativar).
  - **Cartão "Assinatura" no contrato**: situação em português, prazo, links "PDF enviado"/"PDF assinado" (URL assinada do Storage), evidências só para equipe; botões por situação: averbado → "Enviar para assinatura"; enviado → "Reenviar", "Reenviar para o contato novo"; assinado → "Aprovar assinatura" e "Não aprovar" (pede motivo → `mover_contrato(...,'pendente', motivo)`); vencido/recusado_cliente/falhou → "Enviar de novo". Depois de mover para pendente/recusado, chama `processar_cancelamentos`.
  - **Assinaturas** (`/assinaturas`): abas "Para conferir", "Vencidas", "Recusadas pelo cliente", "Cancelar na ZapSign" (com botão "Tentar de novo" = `processar_cancelamentos`); cada linha abre o contrato.
- [ ] **Step 1: Testes** (jsdom, supabase simulado como nos testes existentes): cartão mostra "Aprovar assinatura" só em `assinado`; "Não aprovar" exige motivo; editor insere `{cliente.nome}` ao clicar no campo; erro `Campo desconhecido…` aparece na tela; página de assinaturas troca de aba e lista.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx tsc -b` + `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: telas de modelo do contrato e de assinatura`.

### Task 8: Teste no navegador de ponta a ponta

**Files:** nenhum de produto (scripts só em `.superpowers/`, apagados no fim).

- [ ] **Step 1:** `supabase/functions/.env` local apontando `ZAPSIGN_URL` para a ZapSign falsa (`node` rodando `zapsign-falsa.ts` compilado ou via `npx tsx`, acessível do container por `host.docker.internal`), token e segredo de teste gerados na hora. `npx supabase functions serve` em segundo plano.
- [ ] **Step 2:** `node .superpowers/e2e-setup.mjs`; no app (porta 5173), como administrador: colar um modelo de teste no Acre, ver a prévia; criar/levar um contrato até averbado; enviar; simular "assinado" na falsa e chamar o webhook; conferir na lista "Para conferir"; aprovar → aguardando pagamento. Repetir com "Não aprovar" e com edição de valor depois do envio.
- [ ] **Step 3:** apagar `.superpowers/e2e-usuarios.json` e o `.env` de teste; `npx supabase db reset`; `npm test` inteiro → PASS.
- [ ] **Step 4:** Ledger com o resultado (sem commit de produto, salvo correções encontradas — cada uma com teste RED→GREEN e commit `fix: …`).

### Fim

Revisão completa: revisor novo (modelo mais capaz) + Codex sobre `git diff main...HEAD`, uma rodada de correções com testes, aprovação do dono. Nada sobe sem "pode subir".
