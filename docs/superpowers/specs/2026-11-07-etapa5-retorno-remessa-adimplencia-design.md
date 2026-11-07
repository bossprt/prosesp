# Etapa 5 — Retorno, remessa e adimplência

Data: 2026-11-07 · Depende de: Etapas 1–4 (convênios, contratos, parcelas, mensalidades, averbações).

Legenda: **[decidido]** = dito pelo dono (no desenho geral, seção 3.6) · **[chamada do builder]** = decisão minha. O dono pediu para seguir sem perguntas ("continue o projeto… não me pergunte nada"). Toda chamada do builder pode ser vetada depois. **[pendente PROSESP]** = o cliente ainda vai responder.

## 1. Intenção

Todo mês o convênio devolve o **retorno**: a lista do que foi descontado em folha e do que não foi. Hoje a equipe confere isso à mão. O sistema deve:

- ler o arquivo de retorno;
- casar cada linha com o contrato ou a mensalidade certa;
- dar baixa no que foi pago;
- mostrar o que não foi descontado, o que veio a menos e o que não foi encontrado;
- calcular a adimplência por convênio e mês.

A **remessa** é o arquivo que a PROSESP manda (ou usa para conferir) com os descontos esperados no mês.

Sucesso: um retorno de milhares de linhas entra em minutos, com uma prévia do tipo "X batem, Y com problema". Só o que precisa de decisão humana sobra numa lista.

## 2. Objetivos, fora do escopo, anti-objetivos

**Objetivos**
1. Layout do retorno e da remessa configurável por convênio, sem código **[decidido]**. Vem com o modelo do Governo do Acre (24 colunas) pronto.
2. Importar um retorno com prévia antes de gravar **[decidido]**. Gravar é tudo ou nada. O mesmo arquivo não entra duas vezes (hash) **[decidido]**.
3. Casamento por ADE dentro do convênio, conferindo CPF, matrícula, valor e competência **[decidido]**. Se não achar pelo ADE, sugere um contrato por CPF + matrícula **[decidido]**, mas não aplica sozinho.
4. Situações de linha **[decidido]**: conciliada, parcial, divergente, não encontrada, ADE antiga, duplicada, ignorada. Também **não descontada**, para o arquivo de não descontados **[chamada do builder]**.
5. Desconto menor que a parcela: registra o recebido e a diferença fica em aberto. Gerente ou administrador pode dar baixa com motivo e auditoria **[decidido]**.
6. Funciona igual para parcelas de empréstimo e para mensalidades **[decidido]**. O atraso de mensalidade continua sem marcar o empréstimo como "em atraso" **[decidido]**.
7. Tratar as linhas que sobraram: vincular a um contrato (quando há sugestão ou escolha manual) ou ignorar com motivo.
8. Desfazer um retorno gravado por engano **[chamada do builder]**.
9. Gerar a remessa do mês por convênio, em Excel, no layout do convênio **[chamada do builder]**.
10. Tela de adimplência por convênio e competência:
    - esperado, recebido e % de adimplência;
    - não descontadas;
    - ausentes do retorno;
    - diferenças em aberto;
    - contratos em atraso;
    - contratos com tudo pago, prontos para quitar.

**Fora do escopo**
- Estorno de comissão por inadimplência (Etapa 6).
- Lançamentos financeiros e DRE (Etapa 7).
- Indicadores históricos e gráficos (Etapa 8).
- Envio automático da remessa ao convênio (a averbação continua manual **[decidido]**).
- Quitar o contrato sozinho quando a última parcela é paga. Ele aparece na lista "tudo pago" e a equipe usa o encerramento que já existe **[chamada do builder]**.

**Anti-objetivos**
- Diferenças "sumindo" sem alguém decidir **[decidido]**.
- Gravar metade de um retorno.
- Aplicar um pagamento por palpite (a sugestão por CPF nunca é aplicada sozinha).
- Formato de convênio fixo no código.
- Dinheiro conferido só na tela: o banco reclassifica tudo ao gravar.

## 3. Como funciona

### 3.1 Layout do convênio **[chamada do builder]**

`convenios.layout_retorno` (jsonb, já existe):

```
{ "versao": 1,
  "colunas": { "ade": "ID_Consignacao", "cpf": "CPF", "matricula": "Matricula", "valor": "Valor_Desconto",
               "nome": "Nome", "competencia": "Folha", "observacao": "Observacao",
               "parcela_paga": "Parc_Paga", "parcela_total": "Parc_Total" },
  "linha_cabecalho": 1 }
```

- Só `ade` e `valor` são obrigatórios. Os outros campos podem ficar vazios.
- Os nomes de coluna são comparados sem diferenciar maiúsculas, acentos e espaços.
- `layout_remessa` é uma lista ordenada de colunas: `{ "versao": 1, "colunas": [ { "titulo": "ID_Consignacao", "campo": "ade" }, … ] }`. Os campos possíveis são ade, cpf, matricula, nome, valor, competencia, parcela_numero, parcela_total, contrato_numero e servico.
- O banco confere a forma dos dois JSON (trigger), com mensagem em português.
- A tela tem o botão "Usar modelo do Governo do Acre", que preenche as 24 colunas da seção 3.6 do desenho geral.

Layout da Prefeitura de Rio Branco: **[pendente PROSESP]**. A equipe cadastra pela tela quando o arquivo chegar.

### 3.2 Importar

O usuário escolhe:
- o convênio;
- o produto (parcelas ou mensalidades);
- o tipo (descontados ou não descontados);
- a competência.

O tipo e o produto vêm pré-preenchidos pelo nome do arquivo, quando ele diz "CONTRIBUICAO", "NAO DESCONTADO" etc. A competência vem pré-preenchida pela coluna de competência, quando todas as linhas têm o mesmo valor. A pessoa confere e pode mudar **[chamada do builder]**.

O navegador lê o arquivo (.xlsx com exceljs, ou .csv com `;` ou `,`) e aplica o layout. Ele manda as linhas como texto, com a mesma conversão de dinheiro e data da Etapa 3. Limite: 20.000 linhas por arquivo, numa chamada só **[chamada do builder]**.

Duas funções no banco:
- `retorno_conferir(...)` classifica sem gravar e devolve a prévia;
- `retorno_gravar(...)` reclassifica dentro da transação (com trava por convênio e produto) e grava tudo ou nada.

O hash é SHA-256 do arquivo. Um hash já gravado (e não desfeito) é recusado com "Este arquivo já foi importado em DD/MM/AAAA."

### 3.3 Classificação de cada linha **[decidido + chamadas do builder]**

Em ordem:

1. Linha sem ADE e sem CPF, ou com valor vazio ou ≤ 0 em "descontados": **ignorada**, com o motivo "Linha sem dados suficientes".
2. Coluna de competência preenchida e diferente da escolhida: **divergente**, "Competência do arquivo diferente da escolhida."
3. ADE repetido no mesmo arquivo: a partir da segunda vez é **duplicada**, "ADE repetido no arquivo".
4. Procura a averbação pelo ADE no convênio. Para parcelas, em `contrato_averbacoes`; para mensalidades, em `mensalidade_averbacoes`. A comparação é por texto sem espaços nas pontas e, se os dois forem só dígitos, também sem zeros à esquerda.
   - Não achou:
     - procura por CPF + matrícula um contrato ativo ou em atraso do convênio com parcela nessa competência (ou uma mensalidade ativa);
     - se houver exatamente um, a linha fica **não encontrada** e guarda a sugestão;
     - senão, fica **não encontrada** sem sugestão.
   - Achou com situação `cancelada`: **divergente**, "ADE cancelado no sistema."
   - Achou com situação `substituida` ou `migrada`: segue para o próximo passo, mas a situação final passa a ser **ADE antiga** quando o pagamento é aplicado.
5. CPF informado e diferente do CPF do cliente (comparando só dígitos), ou matrícula informada e diferente (sem zeros à esquerda): **divergente**, "CPF diferente do cadastro." ou "Matrícula diferente do cadastro."
6. Busca a parcela da competência: `parcelas` do contrato, ou `mensalidade_parcelas` da mensalidade.
   - Não existe: **divergente**, "Não há parcela nesta competência."
   - Situação cancelada ou prejuízo: **divergente**, "Parcela cancelada ou em prejuízo."
   - Saldo zero: **duplicada**, "Parcela já paga."
7. Arquivo de não descontados: **não descontada**, sem pagamento. O motivo é a observação do arquivo.
8. Arquivo de descontados, comparando o valor com o saldo:
   - valor = saldo: **conciliada**, paga o valor;
   - valor < saldo: **parcial**, paga o valor e a diferença fica em aberto;
   - valor > saldo: **divergente**, "Desconto maior que o saldo da parcela.", sem pagamento.

Saldo = valor − pagamentos − baixas.

### 3.4 Gravar

- Cria o registro em `retornos` e todas as `retorno_linhas`.
- Para conciliada, parcial e ADE antiga, cria o pagamento ligado à linha: `parcela_pagamentos` (com origem 'retorno') ou `mensalidade_pagamentos` (tabela nova).
- Recalcula a situação de cada parcela tocada:
  - saldo ≤ 0: paga;
  - vencida: atrasada;
  - com algum pagamento: parcial;
  - senão: aberta.
  - Cancelada e prejuízo não mudam.
- Recalcula a situação do contrato (ativo ↔ em atraso), com a mesma regra da função diária de atrasos.
- Guarda um resumo (contagem e soma por situação) no retorno.

### 3.5 Tratar o que sobrou

Linhas não encontradas, divergentes, duplicadas e não descontadas podem ser tratadas por quem tem `retorno.importar`:

- **Vincular a um contrato** (ou mensalidade). Vale para não encontrada e divergente em arquivo de descontados. O banco refaz os passos 5–8 com o contrato escolhido, sem a checagem de CPF e matrícula, porque é uma decisão humana. Se der conciliada ou parcial, aplica o pagamento e marca a linha como "tratada: vinculada".
- **Ignorar com motivo**: marca "tratada: ignorada".

Quem tratou e quando fica gravado.

### 3.6 Diferenças em aberto e baixa **[decidido]**

A lista mostra as parcelas (e parcelas de mensalidade) com algum pagamento e saldo maior que zero.

Gerente ou administrador (`retorno.baixar_diferenca`) dá baixa com um motivo obrigatório. Isso cria uma linha em `diferenca_baixas` com o valor do saldo e marca a parcela como paga. Tem auditoria. A baixa não pode ser desfeita pela tela **[chamada do builder]**.

### 3.7 Desfazer um retorno **[chamada do builder]**

Gerente ou administrador, com motivo. Só é possível se:
- nenhuma baixa de diferença foi feita depois do retorno numa parcela que ele tocou;
- é o retorno gravado mais recente do mesmo convênio e produto.

O desfazer:
- apaga os pagamentos ligados às linhas do retorno, inclusive os das linhas vinculadas depois;
- recalcula as parcelas e os contratos;
- marca o retorno como desfeito.

As linhas continuam guardadas para histórico. O mesmo arquivo pode ser importado de novo.

### 3.8 Ausentes do retorno

Para um convênio, produto e competência: são as parcelas da competência com saldo maior que zero, de contrato ativo ou em atraso (ou mensalidade ativa), sem nenhuma linha em retorno gravado dessa competência. São os descontos que o convênio nem citou.

### 3.9 Remessa **[chamada do builder]**

Por convênio, produto e competência. A remessa lista as parcelas da competência com saldo maior que zero de contratos ativos ou em atraso (ou mensalidades ativas), com o ADE ativo. Para cada uma: ADE, CPF, matrícula, nome, valor (o saldo), número e total da parcela, número do contrato e serviço ("Empréstimo" ou "Mensalidade").

O navegador monta o Excel na ordem do `layout_remessa`. Sem layout, usa uma ordem padrão. Gerar a remessa não muda nada no banco. Mesmo assim, fica registrado na auditoria quem gerou.

### 3.10 Adimplência

Por convênio e competência, para parcelas e para mensalidades separadamente:
- **esperado**: soma do valor das parcelas da competência, sem as canceladas;
- **recebido**: soma dos pagamentos dessas parcelas;
- **% de adimplência**: recebido ÷ esperado.

Também conta:
- quantas parcelas foram pagas, parciais e não pagas;
- os contratos em atraso (quantos dias, pela parcela atrasada mais antiga);
- os contratos com todas as parcelas pagas (sem nenhuma aberta, parcial ou atrasada) que ainda estão ativos.

### 3.11 Permissões **[chamada do builder]**

| Permissão | Perfis |
|---|---|
| `retorno.ver` | administrador, gerente, financeiro, operador, consulta |
| `retorno.importar` (importar, tratar linhas, gerar remessa) | administrador, gerente, financeiro |
| `retorno.baixar_diferenca` (baixa e desfazer) | administrador, gerente |

O parceiro não vê nada desta etapa. Todas as escritas passam por RPC `security definer` que confere a permissão logo na primeira instrução. Tudo tem RLS e auditoria. Nada é executável por `anon`.

## 4. Telas

- **Retornos** (menu): lista dos retornos com convênio, competência, produto, tipo, arquivo, totais, quem gravou e quando. Cada um tem os botões Ver e Desfazer.
- **Importar retorno**: escolhas, arquivo, prévia (contagens e somas por situação, com tabela filtrável de linhas e motivo) e botão Gravar.
- **Retorno (detalhe)**: linhas por situação. As linhas pendentes têm as ações Vincular (com a sugestão já preenchida ou o nº do contrato digitado) e Ignorar.
- **Diferenças em aberto**: lista com filtro de convênio e o botão Dar baixa, com motivo.
- **Adimplência**: convênio + competência, cartões de resumo e abas (não descontadas, ausentes, em atraso, tudo pago). Nela fica o botão "Baixar remessa".
- **Convênio → Retorno e remessa**: editor do layout (campo do sistema → nome da coluna) e o botão do modelo do Acre.

Mensagens sempre em português claro.

## 5. Modelo de dados (resumo) **[chamada do builder]**

- `retornos`: convenio_id, produto (parcelas|mensalidades), tipo (descontados|nao_descontados), competencia (dia 1), arquivo_nome, hash, situacao (gravado|desfeito), resumo jsonb, usuario_id, criado_em, desfeito_em, desfeito_por, motivo_desfazer. Hash único entre os gravados.
- `retorno_linhas`:
  - retorno_id, linha, dados jsonb (o que veio do arquivo);
  - ade, cpf, matricula, valor, competencia_arquivo, observacao;
  - situacao, motivo;
  - contrato_id, parcela_id, mensalidade_id, mensalidade_parcela_id, sugestao_contrato_id, sugestao_mensalidade_id;
  - valor_aplicado, tratamento (vinculada|ignorada), tratamento_motivo, tratada_por, tratada_em.
- `mensalidade_pagamentos`: mensalidade_parcela_id, valor, competencia_desconto, origem, retorno_linha_id, criado_em.
- `parcela_pagamentos` + `retorno_linha_id`.
- `diferenca_baixas`: parcela_id ou mensalidade_parcela_id (exatamente um), valor, motivo, usuario_id, criado_em.
- `v_parcelas_saldo` passa a descontar as baixas. Nova `v_mensalidade_parcelas_saldo`.

## 6. Testes

**Banco**, um teste por regra da seção 3.3:
- gravar, tudo ou nada;
- hash repetido;
- recálculo de situação;
- baixa;
- vincular e ignorar;
- desfazer e as travas dele;
- ausentes;
- remessa;
- adimplência com números fixos;
- permissões por perfil;
- RLS do parceiro.

**App:**
- leitura de xlsx e csv;
- mapeamento por layout, comparando sem acento e sem diferenciar maiúsculas;
- adivinhação de tipo, produto e competência;
- montagem da remessa;
- telas de prévia, tratamento e adimplência com dados falsos.

Typecheck limpo.

## 7. Deixado para o builder

- Desenho visual das telas, seguindo os componentes existentes (`Pagina`, `Tabela`, `Botao`, `Aviso`, `Campo`).
- Nomes internos de funções auxiliares.
- Índices.

## 8. Decisões depois da revisão do Codex **[chamadas do builder]**

1. **ADE ambíguo.** A busca começa pelo texto exato, sem espaços nas pontas. Se não achar e os dois forem só dígitos, compara sem zeros à esquerda. Os candidatos têm esta prioridade: ativa > substituída/migrada > cancelamento pendente > proposta > cancelada. Se o melhor nível tiver mais de um contrato (ou mensalidade) diferente, a linha fica **divergente**, "Mais de um cadastro com este ADE.". O sistema nunca escolhe ao acaso.
2. **ADE antigo.** A parcela é achada por contrato + competência. A matrícula é conferida com a da **averbação encontrada**, não com a atual do contrato, porque a matrícula pode ter migrado. O pagamento guarda essa averbação (`parcela_pagamentos.averbacao_id`).
3. **Duas linhas para a mesma parcela** (ADE antigo e novo, ou mensalidade com ADE migrado). As linhas são classificadas na ordem do arquivo e vão consumindo o saldo. Quando o saldo zera, a próxima fica **duplicada**, "Parcela já paga por outra linha deste arquivo.". ADE de mensalidade ainda em proposta (sem mensalidade) fica **divergente**, "ADE de mensalidade ainda não liberado.".
4. **Desfazer da Etapa 3.** O `desfazer_importacao` passa a recusar quando existe pagamento que não veio do legado (parcela ou mensalidade), baixa de diferença ou linha de retorno ligada aos dados da importação, seja qual for a situação da parcela.
5. **Desfazer retorno depois de um encerramento.** É recusado se algum contrato tocado não estiver mais ativo ou em atraso, ou se alguma mensalidade tocada foi cancelada. A mensagem diz qual contrato.
6. **Ordem de travas.** Todas as escritas desta etapa seguem a mesma ordem:
   1. trava do convênio + produto (`pg_advisory_xact_lock`) em gravar e desfazer;
   2. o retorno e a linha;
   3. os contratos ou mensalidades, ordenados por id (`for update`);
   4. as parcelas.

   Saldo e condições são conferidos de novo depois das travas. O encerramento existente também trava o contrato, então fica em fila com o retorno.
7. **Atrasos diários.** A função diária `recalcular_atrasos` continua como está. A regra dela (aberta ou parcial vencida → atrasada) é compatível com o recálculo por saldo. As funções internas de recálculo não exigem permissão e só são chamadas pelas RPCs desta etapa. O vencimento da mensalidade é o dia de vencimento do convênio na competência (28 se não houver), igual à função diária.
8. **Valor.** O valor é lido sem derrubar a importação. Ele precisa ser maior que zero, ter no máximo 2 casas e caber em `numeric(14,2)`. Se não passar, a linha fica **ignorada**, "Valor inválido.". A prévia e a gravação usam a mesma função.
9. **Competência.** A competência escolhida é a da folha (do desconto), e o pagamento vai para a parcela da mesma competência. Para pagar outra parcela (regularização de atraso), a pessoa usa **Vincular** e escolhe a parcela. Isso nunca acontece sozinho. O pagamento sempre grava a competência do desconto.
10. **Remessa.**
    - O valor é o saldo da parcela, limitado ao `valor_averbado` do ADE ativo.
    - Para mensalidade sem parcela gerada naquela competência (mês futuro), usa o valor vigente da mensalidade ativa naquela competência.
    - Só entram contratos com ADE ativo e mensalidades com averbação ativa.
11. **Tratamento.**
    - Só para retorno gravado, linha sem tratamento, situação não encontrada ou divergente, em arquivo de descontados.
    - O contrato ou a mensalidade escolhida tem que ser do mesmo convênio do retorno e estar ativa (contrato ativo ou em atraso).
    - Vincular exige motivo.
    - Ignorar exige motivo e vale também para duplicada e não descontada (como "visto").
    - Uma linha tratada não muda mais. Para mudar, é preciso desfazer o retorno.
12. **Parceiro.** O parceiro continua vendo as parcelas e os pagamentos dos próprios contratos, como antes. A coluna nova `retorno_linha_id` é só um identificador, porque ele não lê `retorno_linhas`. Ele não lê as baixas. A situação da parcela ("paga") mostra o efeito da baixa, mas o saldo calculado na tela dele pode não descontar a baixa. As funções novas revogam a execução de `public` e `anon`.
