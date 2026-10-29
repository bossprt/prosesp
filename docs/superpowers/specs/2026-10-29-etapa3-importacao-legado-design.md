# Etapa 3 — Importação dos dados antigos (legado)

Data: 2026-10-29 · Depende de: Etapas 1 e 2 (cadastros, contratos, parcelas, mensalidades, averbações).

## 1. Intenção

Trazer para o sistema PROSESP os clientes, matrículas, contratos, parcelas e mensalidades que hoje vivem no Workbank (e em planilhas), **sem depender do formato de nenhum outro sistema**. Palavras do dono: "se não seríamos dependentes de outro sistema sempre".

Por isso a importação lê **uma planilha modelo própria do PROSESP**. Quem tiver dados antigos (do Workbank, de outra planilha ou digitados) copia para esse modelo. O sistema confere tudo, mostra uma prévia e só grava depois da confirmação.

O Workbank exporta PDF e Excel. O PDF não é fonte de importação.

## 2. Objetivos, fora do escopo, anti-objetivos

**Objetivos**
- Baixar a planilha modelo (Excel) pelo sistema.
- Enviar a planilha preenchida, ver a prévia com contagens e erros por linha em português, e só então gravar.
- Importar uma vez ou aos poucos (por convênio, por exemplo). Reimportar não duplica nada.
- Guardar o registro de cada importação (quem, quando, arquivo, totais) e permitir desfazê-la enquanto ninguém mexeu nos dados importados.
- Aceitar contratos ativos e também encerrados (quitados, cancelados, renovados, prejuízo), porque a PROSESP ainda vai decidir se traz o histórico.

**Fora do escopo**
- Ler o formato do Workbank ou PDF.
- Comissão de contratos antigos (o sistema só cuida da comissão de contratos novos).
- Pagamentos a parceiros, assinatura, documentos digitalizados.
- Histórico mês a mês de descontos recebidos (retorno) — Etapa 5. Aqui só entra quantas parcelas já foram pagas.

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Afrouxar as regras do banco para o legado caber (CPF inválido, ADE repetido etc.). Dado ruim é corrigido na planilha, não no banco.
- Duplicar cliente, matrícula, contrato ou ADE ao reimportar.
- Gravar metade de um arquivo sem a pessoa saber o que entrou.
- Recalcular valores de contrato antigo pela tabela atual: vale o que foi contratado.

## 3. Decisões já tomadas

Pelo dono:
- Planilha modelo própria; não depender do Workbank.
- Prévia antes de gravar.
- **Linhas com erro** — *provisório, ver P0*: grava as boas e separa as com erro numa lista para corrigir e reenviar (como no pedido original: "erros para lista de pendências sem travar o resto"). Se o dono escolher "nada entra", basta o botão Gravar exigir zero erros; o resto do desenho não muda.
- Pode importar várias vezes; o que já existe não é duplicado.
- Registro de cada importação e possibilidade de desfazer enquanto ninguém mexeu.
- Contratos antigos não passam pela esteira; entram direto na situação certa, com os valores da planilha.
- Parcelas: usa a informação de pagas/em aberto da planilha; se não vier, monta pelo prazo e pela primeira parcela.
- Comissão antiga não é importada.
- Só o administrador importa.

Pelo desenho geral (Apêndice A do pedido original):
- Marca "legado" com data e autor (colunas `legado`, `legado_importado_por`, `legado_importado_em` já existem em `contratos`).
- Chave de não duplicar = número do contrato antigo / ADE.
- Refinanciamento pode quitar vários contratos anteriores; mensalidade com histórico de valores.
- Recomendação de processo: importar primeiro uma amostra de 10–20 contratos e conferir com a PROSESP antes do total.

## 4. A planilha modelo

Um arquivo Excel com uma aba por assunto e uma aba "Instruções" (o que cada coluna aceita, com exemplo). Datas em `dd/mm/aaaa`, competência em `mm/aaaa`, dinheiro com vírgula (`1.234,56`) ou número do Excel. Colunas com * são obrigatórias. Na aba Instruções há um campo **Data da posição** (a data em que os dados foram tirados do sistema antigo), obrigatório.

**Clientes:** CPF*, Nome*, Celular*, WhatsApp (se vazio, copia o Celular — *chamada minha*, o banco exige os dois), Data de nascimento, E-mail, RG, Nome da mãe, CEP, Logradouro, Número, Complemento, Bairro, Cidade, UF.

**Matrículas:** CPF*, Convênio*, Vínculo*, Matrícula*, Órgão.

**Contratos:** Nº contrato antigo*, CPF*, Convênio*, Matrícula*, Tipo* (novo/refinanciamento/compra), Prazo*, Valor da parcela*, Valor bruto*, Valor líquido, Data da liberação*, Primeira competência*, Parcelas pagas* (quantidade, na data da posição), Situação* (ativo/em atraso/quitado/renovado/cancelado/prejuízo), ADE, Parceiro (nome).

**Quitações (opcional, refinanciamento):** Nº contrato novo*, Nº contrato quitado*, Saldo quitado* (> 0). Se o contrato quitado não estiver no arquivo nem no banco (ex.: só ativos importados), a linha é aceita e o nº antigo fica guardado como texto no contrato novo, sem ligação — *chamada minha*.

**Dívidas compradas (opcional, compra):** Nº contrato antigo*, Credor*, Saldo* (> 0), Nº do contrato no outro banco.

**Parcelas (opcional, detalhe):** Nº contrato antigo*, Nº da parcela*, Competência*, Valor*, Situação* (paga/aberta/atrasada/cancelada). Quando um contrato tem linhas aqui, elas substituem a regra de "Parcelas pagas".

**Mensalidades:** CPF*, Convênio*, Matrícula*, Valor*, Vigente desde* (competência), Situação* (ativa/cancelada), ADE. Várias linhas da mesma matrícula = histórico de valores (a mais recente é a vigente).

Convênio, vínculo e parceiro são encontrados pelo **nome** já cadastrado (sem diferença de maiúsculas/acentos). Se não existir, é erro: cadastra primeiro, depois importa.

## 5. Como funciona

1. **Baixar modelo** → Excel vazio com as abas e instruções.
2. **Enviar arquivo** → o navegador lê o Excel e manda as linhas ao banco para **conferência** (não grava nada).
3. **Prévia** → por aba: quantas linhas novas, quantas já existem (serão puladas), quantas com erro. Lista de erros no formato "Aba Contratos, linha 12: CPF inválido." Botão **Gravar** grava as linhas sem erro; a prévia diz "X entram, Y ficam de fora".
4. **Gravar** → numa única transação grava tudo o que passou na conferência. **O erro afasta o cliente inteiro**: se qualquer linha de um CPF (cliente, matrícula, contrato, parcela, mensalidade) tem erro, nenhuma linha desse CPF entra, para não ficar contrato sem parcela ou mensalidade sem matrícula. Confere de novo no momento de gravar (os dados podem ter mudado desde a prévia).
4b. **Lista das que ficaram de fora** → botão "Baixar linhas com erro": um Excel no mesmo modelo, só com as linhas não gravadas e uma coluna "Erro". Corrige e envia esse arquivo (ou o original inteiro: o que já entrou é pulado).
5. **Histórico** → lista de importações (data, quem, nome do arquivo, totais, situação). O arquivo original fica guardado. Botão **Desfazer** enquanto permitido.

Mesmo arquivo enviado duas vezes (mesmo conteúdo) → avisa "Este arquivo já foi importado em dd/mm/aaaa"; se aquela importação deixou linhas de fora, permite seguir (só as que faltam entrarão).

## 6. Regras de conferência (cada uma vira mensagem em português)

- CPF válido; nome não vazio; celular obrigatório (regra do banco).
- Convênio, vínculo e parceiro existentes; vínculo pertence ao convênio.
- Matrícula: se já existe para outro CPF no mesmo convênio → erro "matrícula pertence a outro cliente".
- Contrato: prazo > 0; parcela e bruto > 0; líquido ≤ bruto; parcelas pagas entre 0 e prazo; primeira competência ≥ mês da liberação − 1 (tolerância) — *chamada minha*; situação válida; contrato cuja matrícula/CPF não bate com a aba Matrículas ou com o banco → erro.
- ADE único (contratos e mensalidades, como na Etapa 2) e no formato do convênio, quando o convênio tem formato.
- Quitações: quando o contrato quitado existe (arquivo ou banco), precisa ser do mesmo cliente e estar "renovado".
- Situação ativo/em atraso: o sistema calcula pelas parcelas vencidas até a data da posição (a mesma regra do cálculo diário de atraso); se divergir da planilha, aparece como aviso e vale o cálculo — *chamada minha*, evita que o cálculo noturno mude os números no dia seguinte.
- Mensalidade: uma por matrícula; valores > 0; datas de vigência sem repetição. Se a matrícula já tem mensalidade no banco: com o mesmo valor vigente → pula; com outro valor → erro "Esta matrícula já tem mensalidade no sistema" — *chamada minha*.
- Linhas repetidas dentro do próprio arquivo (mesmo CPF, mesmo nº de contrato, mesmo ADE) → erro.
- Cliente que já existe no banco: **não é alterado**; se o nome for diferente, aparece como aviso (não bloqueia) — *chamada minha*.

## 7. O que é gravado

- **Cliente/matrícula** novos; existentes são reaproveitados (CPF; convênio + matrícula normalizada).
- **Contrato** com nova coluna `numero_legado` (texto, único) — chave de não duplicar. `legado = true`, `legado_importado_por/em`, `fase = credito_liberado`, `situacao` da planilha, `linha_tabela_id` nulo, `fator = valor_parcela / valor_bruto` (8 casas), `valores_travados_em = agora`, `data_liberacao`, `primeiro_vencimento` pelo dia de vencimento do convênio. Sem regra de comissão. Um evento no histórico: "Importado do sistema anterior".
- **Totais:** quitações e dívidas compradas entram nas suas tabelas; a sobra `bruto − líquido − quitado − dívidas` (se > 0) vira um desconto do tipo "Descontos do sistema anterior" (criado por convênio se faltar) — *chamada minha*. Sobra negativa = erro na linha. Líquido vazio = sem desconto.
- **Parcelas**: da aba Parcelas, ou geradas pelo prazo a partir da primeira competência; as N primeiras ("Parcelas pagas") ficam pagas com um pagamento de origem `legado`. As demais: contrato ativo/em atraso → abertas (vencidas até a data da posição ficam atrasadas); quitado/renovado/cancelado → canceladas; prejuízo → prejuízo — *chamada minha*.
- **Averbação** quando o ADE vier: ativa para ativo/em atraso/prejuízo (como na Etapa 2); cancelada para quitado/renovado/cancelado — *chamada minha*. Contrato sem ADE é aceito (legado).
- **Quitações** (refinanciamento) ligam o contrato novo aos antigos, sem reserva (`reservado = false`).
- **Mensalidade** com o histórico de valores (`tipo = nova` na primeira, `reajuste` nas seguintes); averbação ativa se tiver ADE; cancelada fica cancelada **sem exigir o requerimento** (é legado) — *chamada minha*. Não gera parcelas de mensalidade do passado; o processo mensal existente cuida das próximas.
- Tabela `importacoes`: id, arquivo (nome + caminho no armazenamento), hash do conteúdo, usuário, data, totais por aba, situação (`gravada`/`desfeita`). Cada registro criado guarda o id da importação, para desfazer.

## 8. Desfazer

Permitido enquanto **nenhuma pessoa** alterou dados criados pela importação: contrato sem edição, evento de fase/situação feito por usuário, pagamento ou averbação nova; mensalidade sem novo valor ou cancelamento; cliente sem alteração. Mudanças automáticas (cálculo diário de atraso, mensalidades do mês geradas pelo sistema) **não contam** e são apagadas junto — *chamada minha*. O histórico de eventos é imutável; o desfazer usa uma função interna autorizada a apagar apenas os eventos dos contratos daquela importação, e o próprio desfazer fica registrado na auditoria. Apaga só o que **essa** importação criou (cliente que já existia continua). Se algo foi mexido, a mensagem diz o quê: "Não dá para desfazer: o contrato antigo nº 4521 já foi alterado."

## 9. Acesso e segurança

- Nova permissão `importacao.executar`, só administrador na matriz padrão; parceiro nunca (teto do parceiro).
- Gravação por função no banco (`security definer`, `search_path` vazio), como o resto do sistema; tabelas sem escrita direta.
- Tudo auditado. Limite de tamanho do arquivo (sugestão: 10 MB / 50 mil linhas) — *chamada minha*.

## 10. Tela

Menu "Importar dados antigos" (só para quem tem a permissão): botões Baixar modelo e Enviar arquivo, área da prévia (contagens e lista de erros com filtro por aba), botão Gravar, e abaixo o histórico com Desfazer.

## 11. Deixado para o construtor

Biblioteca de leitura/escrita de Excel no navegador; divisão em blocos para arquivos grandes mantendo a gravação atômica; formato exato do retorno da conferência; ordem de processamento das abas.

## 12. Pendências

- **P0 (dono):** gravar as linhas boas (adotado provisoriamente, recomendado) ou nada entra se houver erro. Trocar custa pouco: só muda a habilitação do botão Gravar.
- PROSESP: trazer só ativos ou também encerrados (o sistema aceita os dois).
- PROSESP: importar tudo de uma vez ou por convênio (o sistema aceita os dois).
- PROSESP: de onde virão os dados e quem preenche a planilha modelo.
