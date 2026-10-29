# Etapa 2 — Contratos e Esteira — Desenho

**Data:** 2026-10-28 · **Status:** rascunho para aprovação
**Base:** `2026-10-28-prosesp-sistema-design.md` (visão geral, seções 3.4–3.6) e a Etapa 1 já entregue (convênios, tabelas, simulador, clientes, parceiros, perfis, auditoria).

Legenda: **[decidido]** = dito pelo dono · **[chamada do builder]** = decisão técnica, pode ser vetada · **[pendente PROSESP]** = regra que o cliente vai definir; o sistema fica preparado como configuração.

---

## 1. Intenção

Substituir a esteira "na base do clique" do Workbank: o contrato é digitado uma vez, os valores saem da tabela do convênio e ficam congelados no contrato, cada mudança de fase tem dono, motivo e histórico, e o erro mais caro de hoje (ADE errado) é travado na digitação.

### Fora da Etapa 2 (outras etapas)
- Envio real para assinatura (ZapSign), PDF do contrato → Etapa 4.
- Importação de retorno/remessa, baixa de parcelas, furos/diferenças → Etapa 5.
- Pagamento de comissões, estornos, recursos financeiros, arrependimento → Etapa 6.
- Importação de contratos legados → Etapa 3 (mas o modelo de dados já nasce com o campo "legado").

### Anti-objetivos
- Recalcular valores de um contrato depois de digitado (os valores contratados são fotografia).
- Regra de convênio ou de permissão fixa no código.
- Contrato mudando de fase sem registro de quem, quando, de onde, para onde e por quê.

---

## 2. Decisões do dono

1. **Fases [decidido]:** `pré-digitação` (só parceiro) → `digitado` → `em validação` → `em averbação` → `averbado` → (botão Enviar) → `aguardando assinatura` → (validação manual da assinatura) → `aguardando pagamento` → `crédito liberado`. Desvios: `pendente` (motivo obrigatório; ao corrigir volta à fase anterior) e `recusado` (motivo obrigatório; situação cancelada; cancela assinatura em aberto). Recusar é possível em qualquer fase antes do pagamento.
2. **Quem move cada fase [pendente PROSESP]:** matriz configurável. Ponto de partida (proposta aprovada como padrão):

   | Transição | Permissão padrão |
   |---|---|
   | pré-digitação → digitado (aprovar) / devolver ao parceiro | operador, gerente, admin |
   | digitado → em validação → em averbação → averbado | operador, gerente, admin |
   | averbado → aguardando assinatura → aguardando pagamento | operador, gerente, admin |
   | aguardando pagamento → crédito liberado | financeiro, admin |
   | qualquer → pendente | operador, gerente, admin |
   | qualquer (antes do pagamento) → recusado | gerente, admin |
   | pré-digitação → cancelada pelo parceiro | parceiro dono, se ninguém da equipe mexeu |

3. **Obrigatórios na digitação [decidido]:** CPF, nome, data de nascimento e e-mail. Demais **[pendente PROSESP]** — usa a lista de exigências por convênio da Etapa 1 ("o que falta"), que bloqueia a passagem de `em validação` para `em averbação`.
4. **Tipos:** novo, refinanciamento, compra **[decidido]**.
5. **Valores [decidido + pendente]:** contrato guarda valor bruto, descontos e saldos quitados; **líquido = bruto − descontos − saldos quitados**, calculado no banco. Descontos (tarifa, IOF etc.) são cadastráveis por convênio; começa **sem nenhum** **[pendente PROSESP]**.
6. **Refinanciamento [decidido]:** um contrato novo pode quitar um ou mais contratos ativos do mesmo cliente; os antigos encerram como **renovados**; o novo tem ADE e parcelas próprios. **Saldo devedor [pendente PROSESP]:** até haver regra, o operador informa o saldo de cada contrato quitado e a fonte (averbadora / cálculo / outro); o sistema mostra como referência a soma das parcelas em aberto.
7. **Mensalidade [decidido]:** **uma por matrícula**. Valor vem da linha da tabela do contrato. Contrato novo/refin que pede mensalidade **maior** reajusta para cima (o parceiro recebe 100% da diferença — cálculo da comissão na Etapa 6). Pede **menor** → mantém a atual (*palpite confirmado como padrão; PROSESP pode mudar*). **Continua** depois de quitados os empréstimos; **só é cancelada com requerimento assinado pelo cliente** (anexo obrigatório + motivo).
8. **ADE [decidido]:** modos seguro (2×, sem colar) e rápido (1×, pode colar) por convênio; formato validado pelo convênio; ADE único no convênio.
9. **Reaverbação [decidido]:** ADE novo substitui o ativo (antigo = substituído); parcelas pagas ficam no antigo, abertas passam para o novo; mensalidade exige valor na reaverbação e primeiro vencimento informado à mão; data de corte é do convênio. Troca de matrícula sem trocar ADE é operação separada.
10. **Visibilidade do parceiro [decidido]:** vê o cadastro do cliente (via vínculo da Etapa 1) e **só os próprios contratos**. Configuração global, **desligada por padrão**, para a PROSESP liberar que o parceiro veja todos os contratos do cliente.
11. **Prejuízo [decidido na visão geral]:** lista de candidatos com atraso maior que `dias_prejuizo` do convênio (padrão 90); a decisão é humana.

---

## 2.1 Esclarecimentos após revisão **[chamadas do builder, salvo indicação]**

1. **Edição:** valores (valor, prazo, tipo, matrícula, descontos, quitações) podem ser editados enquanto o contrato está em `pré-digitação`, `digitado`, `em validação` ou `pendente` (antes de averbar). Cada edição refaz a simulação com a tabela vigente e grava nova fotografia; a anterior fica em `contrato_versoes`. Ao aprovar uma pré-digitação, se a linha da tabela mudou desde que o parceiro digitou, a tela mostra a diferença e a equipe confirma. Depois de `em averbação`, valores só mudam por recusa + nova digitação. O parceiro não vê % de comissão nesta etapa (extrato vem na Etapa 6).
2. **Compra [pendente PROSESP]:** o sistema fica preparado para os dois entendimentos — tabela **opcional** `contrato_dividas_externas` (banco/credor, número do contrato externo, saldo, favorecido do pagamento, observação). Líquido = bruto − descontos − saldos quitados internos − dívidas externas. Se a PROSESP disser que compra é só um contrato novo, a lista fica vazia.
3. **Mensalidade tem ADE próprio:** o arquivo de retorno de contribuição tem `ID_Consignacao`, como o de parcelas. A mensalidade tem `mensalidade_averbacoes` (mesmas regras de modo/formato/unicidade do ADE). Quando um contrato cria ou reajusta a mensalidade, o passo de averbação pede também o ADE da mensalidade. Reajuste = reaverbação da mensalidade com o novo valor.
4. **Contratos antigos no refin:** um contrato selecionado num refin em andamento fica **reservado** (não pode ser escolhido por outro refin; a reserva cai se o refin for recusado). Na liberação do novo: parcelas do antigo com competência ≥ primeira competência do novo → `cancelada`; anteriores continuam abertas (ainda podem ser descontadas); averbação ativa do antigo → `cancelada`; situação → `renovado`.
5. **Recusa depois de averbado:** a averbação passa a `cancelamento pendente` e entra numa lista "cancelar na averbadora"; quando a equipe confirma, vira `cancelada`. O contrato fica `recusado` desde o primeiro momento.

## 2.2 Ajustes após revisão do Codex **[chamadas do builder]**

1. **Trava de valores persistente:** `contratos.valores_travados_em` é preenchido ao entrar em `em averbação` e nunca volta a nulo. Edição de valores só é permitida com esse campo nulo — mesmo que o contrato vá para `pendente` depois.
2. **Liberação só por um caminho:** `crédito liberado` não é destino aceito por `mover_contrato`; só `liberar_credito` chega lá, numa transação única com `select … for update` no contrato (e na mensalidade e nos contratos quitados). Chamar de novo num contrato já liberado → "Este crédito já foi liberado." Parcelas, mensalidade e renovações acontecem juntas ou nada acontece.
3. **Mensalidade x averbação:** na digitação o sistema calcula a **mensalidade proposta** = maior entre a vigente da matrícula e a da tabela. Só se ela for **maior** que a vigente o passo de averbação pede o ADE da mensalidade (averbação da mensalidade ligada ao contrato de origem, estado `proposta`). Na liberação, com a mensalidade travada, o reajuste é aplicado a partir da primeira competência do contrato **só se ainda for maior** que a vigente naquele momento; se outro contrato já aplicou valor igual ou maior, a averbação proposta vai para `cancelamento pendente` (cancelar na averbadora). Recusa do contrato de origem antes da liberação → averbação proposta vai para `cancelamento pendente`.
4. **Comissão fora do alcance do parceiro:** percentual e base de comissão ficam em `contrato_comissao_regra` (1:1 com o contrato e com cada versão), com RLS só para a equipe. `contratos` não guarda comissão.
5. **Precisão:** dinheiro `numeric(14,2)`; fator `numeric(12,8)`; percentuais `numeric(7,4)` — iguais às tabelas da Etapa 1.
6. **Pagamento parcial e reaverbação:** pagamentos ficam em `parcela_pagamentos` (parcela, valor, competência de desconto, averbação de origem). A parcela aponta para a averbação ativa; ao reaverbar, parcelas `parcial` e `aberta` passam para o ADE novo, mas os pagamentos já recebidos continuam com a averbação de origem. O saldo da parcela = valor − soma dos pagamentos.
7. **Estados e catálogo:** averbação (contrato e mensalidade): `proposta`, `ativa`, `substituida`, `cancelamento_pendente`, `cancelada`. Tipo de documento novo: `requerimento_cancelamento`.

## 3. Modelo de dados **[chamada do builder]**

- `contratos`: `numero` (sequencial legível, único), `cliente_id`, `matricula_id` (define convênio/vínculo), `convenio_id`, `vinculo_id`, `tipo`, `parceiro_id` (nulo = casa), `agente_id`, `origem_id`, `fase`, `situacao` (`em_andamento`, `ativo`, `em_atraso`, `quitado`, `renovado`, `cancelado`, `prejuizo`), **valores contratados congelados**: `linha_tabela_id`, `fator`, `prazo`, `valor_parcela`, `valor_bruto`, `total_descontos`, `total_quitado`, `total_dividas_externas`, `valor_liquido` (coluna calculada), `valor_mensalidade_tabela`, `valores_travados_em` (comissão fica em `contrato_comissao_regra`, ver 2.2); `primeiro_vencimento`, `data_liberacao`, `legado` (bool), `legado_importado_por/em`, `criado_por/em`.
  - Dinheiro `numeric(14,2)`, fator `numeric(12,8)`, percentuais `numeric(7,4)` (ver 2.2); check `valor_liquido >= 0` → "O valor líquido ficou negativo: os descontos e quitações passam do valor do contrato."
- `contrato_descontos` (contrato, tipo de desconto, valor) + `convenio_tipos_desconto` (convênio, nome, forma fixo/percentual, valor padrão, ativo).
- `contrato_quitacoes` (contrato novo, contrato quitado, saldo devedor, fonte, observação); ao liberar o crédito do novo, os quitados viram `renovado`.
- `contrato_averbacoes` (contrato, ADE, situação `ativa`/`substituida`/`cancelada`, data, quem) — índice único: um ADE por convênio; uma ativa por contrato.
- `contrato_eventos` (histórico de fase/situação: de, para, motivo, quem, quando) — só inserção.
- `fase_transicoes` (de, para, permissão exigida) — a matriz configurável; o banco recusa transição que não esteja na tabela.
- `parcelas` (contrato, número, competência AAAA-MM, vencimento, valor, valor pago, status `aberta`/`paga`/`parcial`/`atrasada`/`prejuizo`/`cancelada`, averbação) — única por contrato+competência.
- `mensalidades` (matrícula única ativa, situação `ativa`/`cancelada`, cancelada_em, requerimento documento_id, motivo) + `mensalidade_valores` (mensalidade, valor, vigente desde competência, tipo `nova`/`reajuste`/`migracao`, contrato de origem) + `mensalidade_parcelas` (competência, valor, status) — histórico mês a mês.
- `configuracoes` (chave/valor tipado): `parceiro_ve_todos_contratos` = false.

## 4. Operações (RPCs no banco, todas auditadas) **[chamada do builder]**

- `digitar_contrato(dados)` — equipe; usa `simular_por_valor`/`por_parcela` com `p_gravar` e **copia** os valores da linha para o contrato. Fase inicial `digitado`.
- `pre_digitar_contrato(dados)` — parceiro; fase `pre_digitacao`; cria vínculo cliente↔parceiro (substitui a "adoção" da Etapa 1 como caminho principal).
- `mover_contrato(id, para, motivo)` — confere a matriz, motivo obrigatório para `pendente`/`recusado`, regras de fase (ex.: "o que falta" vazio para sair de `em validação`; ADE ativo para `averbado`), registra evento. `pendente` guarda a fase de retorno.
- `registrar_ade(id, ade, ade_confirmacao)` — valida modo do convênio (no modo seguro exige as duas digitações iguais; a tela bloqueia colar), formato e unicidade.
- `reaverbar(id, novo_ade, primeiro_vencimento, novo_valor_mensalidade)` e `migrar_matricula(id, nova_matricula_id)`.
- `liberar_credito(id, data)` — financeiro/admin; gera parcelas (primeira competência pela data de corte do convênio), cria/reajusta a mensalidade da matrícula, marca quitados como `renovado`. **Na Etapa 2 é só o registro da liberação**; recurso, comprovante e arrependimento entram na Etapa 6, sem mudar a assinatura da função.
- `encerrar_contrato(id, tipo, motivo)` — quitação, cancelamento, prejuízo (renovação vem do refin).
- `cancelar_mensalidade(id, documento_id, motivo)` — exige documento anexado do tipo `requerimento_cancelamento`.
- Diário (pg_cron): `recalcular_atrasos()` — parcela vencida e não paga → `atrasada`; contrato `ativo` ↔ `em_atraso`. Atraso de mensalidade não marca o contrato.

## 5. Telas **[chamada do builder]**

- **Esteira**: quadro por fase (colunas), filtros por convênio, parceiro e período; cartão com cliente, valor, parcela e tempo na fase; ações conforme a matriz.
- **Digitação**: cliente (busca ou cadastro rápido), matrícula, tipo, simulação embutida, contratos a quitar (refin), descontos, parceiro/agente/origem; mostra "o que falta".
- **Contrato**: dados congelados, histórico de fases, averbações (com campo de ADE no modo do convênio), parcelas por competência, quitações.
- **Mensalidades** da matrícula: valor atual, histórico mês a mês e cancelamento com requerimento.
- **Portal do parceiro**: pré-digitação e acompanhamento só dos próprios contratos.
- **Candidatos a prejuízo**.

## 6. Segurança

RLS em todas as tabelas novas; parceiro lê só contratos com `parceiro_id` dele (ou todos do cliente vinculado, se a configuração estiver ligada); nenhuma escrita direta em `contratos`, `parcelas`, `mensalidades` e eventos — só pelas RPCs; valores e fase mudam só por RPC.

## 7. Pendências da PROSESP (não bloqueiam a construção)

1. Quem pode mover cada fase (em especial, quem recusa).
2. Regra do saldo devedor no refinanciamento.
3. Descontos (tarifa, IOF etc.) por convênio.
4. Demais campos obrigatórios na digitação.
5. Mensalidade menor num contrato novo: manter a atual (padrão) ou reduzir.
6. Liberar ou não a visão de todos os contratos do cliente para o parceiro.
