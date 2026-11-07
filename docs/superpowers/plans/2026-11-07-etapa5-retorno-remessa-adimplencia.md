# Etapa 5 — Retorno, remessa e adimplência: plano de construção

> Execução: o builder faz as tarefas de banco inline (TDD). A biblioteca do navegador (Tarefa 5) e as telas (Tarefa 6) podem ir para agentes. No fim: um revisor novo e o Codex.

**Goal:** importar o retorno da folha com prévia, aplicar os pagamentos, tratar as sobras, dar baixa nas diferenças, desfazer, gerar a remessa e mostrar a adimplência.

**Spec:** `docs/superpowers/specs/2026-11-07-etapa5-retorno-remessa-adimplencia-design.md`

**Stack:** Postgres (Supabase local), RPCs plpgsql `security definer set search_path = ''`, vitest (projetos `db` e `app`), React 19 + TanStack Query, exceljs 4.4.0.

## Global Constraints
- Dinheiro `numeric(14,2)`. A competência é sempre dia 1.
- Toda RPC confere a permissão na primeira instrução e responde 'Você não tem permissão para esta ação.' (42501). Nada é executável por `anon`. Tabelas novas com RLS, `revoke` de escrita para `authenticated` e trigger `auditar`.
- Mensagens em português claro.
- Commit: `PLANO=<este arquivo> bash .superpowers/done.sh <n> <base> "<msg>" npm test`, depois de `cd app && npx tsc -b`.

## Review Focus
1. Retorno com milhares de linhas: o tempo do gravar (classificação em conjunto, não linha a linha com consultas repetidas além do necessário).
2. Contrato reaverbado: ADE antigo no retorno paga a parcela certa do mesmo contrato.
3. Duas pessoas gravando retornos do mesmo convênio e produto ao mesmo tempo (trava).
4. Desfazer depois de linhas vinculadas e de outro retorno.
5. Mensalidade com averbação migrada (reajuste) recebendo pelo ADE antigo.

---

### Tarefa 1 — Base (0035_retorno_base.sql)
- Permissões `retorno.ver`, `retorno.importar`, `retorno.baixar_diferenca` e os perfis da seção 3.11 do desenho.
- Tabelas `retornos`, `retorno_linhas`, `mensalidade_pagamentos`, `diferenca_baixas`, e a coluna `parcela_pagamentos.retorno_linha_id`.
- `v_parcelas_saldo` com `baixado`, e `v_mensalidade_parcelas_saldo`.
- Trigger que valida `layout_retorno` e `layout_remessa`.
- `_recalcular_parcela(uuid, date)`, `_recalcular_mensalidade_parcela(uuid, date)`, `_recalcular_situacao_contrato(uuid)`.
- Testes `tests/db/0035_retorno_base.test.ts`:
  - permissões por perfil;
  - layout inválido recusado com mensagem;
  - saldo com pagamento e baixa;
  - recálculo (paga, parcial, atrasada, aberta; cancelada e prejuízo intocadas);
  - situação do contrato ativo ↔ em atraso;
  - parceiro não lê `retornos`.

### Tarefa 2 — Importar (0036_retorno_importar.sql)
- `retorno_conferir(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date, p_linhas jsonb, p_hash text) returns jsonb`. Devolve `{ resumo: {situacao: {qtd, soma}}, linhas: [{linha, situacao, motivo, contrato_numero, cliente, valor, saldo, sugestao_contrato_numero}] }`.
- `retorno_gravar(...)` com os mesmos parâmetros mais `p_arquivo_nome text`. Devolve `{ retorno_id, resumo }`.
- Linha de entrada: `{linha, ade, cpf, matricula, valor, nome, competencia, observacao, parcela_paga, parcela_total, dados}` (textos).
- Testes `tests/db/0036_retorno_importar.test.ts`, um por regra da seção 3.3:
  - ignorada; competência diferente; duplicada no arquivo;
  - não encontrada com e sem sugestão; ADE cancelado ou com cancelamento pendente; ADE antiga após reaverbação;
  - CPF e matrícula diferentes, com zeros à esquerda aceitos;
  - sem parcela; parcela cancelada; já paga;
  - não descontada; conciliada; parcial; maior que o saldo;
  - mensalidade conciliada e por ADE migrado;
  - hash repetido; tudo ou nada;
  - conferir não grava;
  - situação do contrato volta a ativo ao pagar a atrasada;
  - sem permissão.

### Tarefa 3 — Tratar, baixar, desfazer (0037_retorno_tratamento.sql)
- `retorno_vincular_linha(p_linha_id uuid, p_contrato_id uuid, p_mensalidade_id uuid) returns jsonb`
- `retorno_ignorar_linha(p_linha_id uuid, p_motivo text)`
- `diferenca_baixar(p_parcela_id uuid, p_mensalidade_parcela_id uuid, p_motivo text)`
- `retorno_desfazer(p_retorno_id uuid, p_motivo text)`
- Testes `tests/db/0037_retorno_tratamento.test.ts`:
  - vincular aplica o pagamento;
  - vincular linha já tratada é recusado;
  - vincular com valor maior que o saldo é recusado;
  - ignorar exige motivo;
  - baixa exige gerente ou admin e motivo, e deixa a parcela paga;
  - desfazer apaga os pagamentos (inclusive os vinculados), recalcula e libera o hash;
  - desfazer é recusado depois de uma baixa ou se não for o mais recente.

### Tarefa 4 — Consultas (0038_retorno_consultas.sql)
- `retorno_ausentes(p_convenio_id, p_produto, p_competencia) returns jsonb`
- `remessa_dados(p_convenio_id, p_produto, p_competencia) returns jsonb`, que registra na auditoria quem gerou
- `adimplencia(p_convenio_id, p_competencia) returns jsonb`. Devolve `{ parcelas: {esperado, recebido, percentual, pagas, parciais, nao_pagas}, mensalidades: {…}, em_atraso: [...], tudo_pago: [...], nao_descontadas: [...] }`
- `diferencas_abertas(p_convenio_id uuid default null) returns jsonb`
- Testes `tests/db/0038_retorno_consultas.test.ts` com números fixos, a remessa só com saldo maior que zero e ADE ativo, e permissões.

### Tarefa 5 — Biblioteca do navegador (`app/src/features/retorno/arquivo.ts`)
Interface no prompt do agente. Leitura de xlsx e csv, layout, adivinhação, hash e remessa, com testes.

### Tarefa 6 — Telas
- Rotas e menu: Retornos, Importar retorno, Retorno (detalhe), Diferenças, Adimplência.
- No convênio: o editor "Retorno e remessa".
- `database.types.ts` regenerado.
- Testes de tela com dados falsos.

### Tarefa 7 — Revisão final
Um revisor novo (modelo mais capaz) e o Codex. Críticos e importantes entram numa passada de correção com RED→GREEN. Os menores ficam anotados.
