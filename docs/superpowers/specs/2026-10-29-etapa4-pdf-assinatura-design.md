# Etapa 4 — Contrato em PDF e assinatura (ZapSign)

Data: 2026-10-29 · Depende de: Etapas 1 e 2 (convênios, clientes, contratos, esteira, averbação).

## 1. Intenção

Hoje a esteira já tem a fase "aguardando assinatura", mas o envio é só uma mudança de fase. Esta etapa faz o envio de verdade: o sistema gera o PDF do contrato com os dados do contrato, manda para a ZapSign, a ZapSign leva o link ao cliente (e-mail e WhatsApp), o cliente assina, o PDF assinado volta para o sistema e **alguém da equipe confere** antes de o contrato seguir para "aguardando pagamento".

O texto do contrato é da PROSESP, revisado por advogado, e **ainda não chegou**. Por isso o texto fica dentro do sistema, editável pelo administrador, e trocar o texto nunca exige mudar o programa.

## 2. Objetivos, fora do escopo, anti-objetivos

**Objetivos**
- Modelo de contrato por convênio, com versões, editado na tela do convênio.
- Um documento só, unificado: contrato + termo de associação (autorização da mensalidade). Decisão do dono.
- Botão "Enviar para assinatura" no contrato averbado: gera o PDF, envia à ZapSign, contrato vai para "aguardando assinatura".
- Receber da ZapSign o aviso de assinatura e guardar o PDF assinado.
- Conferência manual da assinatura pela equipe (decisão do dono): aprovar → "aguardando pagamento"; problema → "pendente" com motivo.
- Reenviar, trocar contato e reenviar, cancelar; prazo de 7 dias para assinar (decisão do dono, valor padrão configurável por convênio).
- Guardar no contrato: versão do texto usada, PDF enviado, PDF assinado, histórico dos envios.

**Fora do escopo**
- O texto jurídico real (vem da PROSESP).
- Provedor de WhatsApp próprio: o link vai pelo envio automático da própria ZapSign. O provedor continua pendente só para a IA (Etapa 9).
- Assinatura de contratos legados (importados): não se assina nada antigo.
- Documentos de cancelamento de mensalidade (requerimento) — continua como está.

**Anti-objetivos**
- Contrato avançar para "aguardando pagamento" sem uma pessoa conferir.
- PDF com dado diferente do que está no banco (o PDF é montado no servidor, nunca no navegador).
- Chave da ZapSign no navegador, no repositório ou no chat. O dono configura a chave; o sistema só lê do ambiente do servidor.
- Confiar no conteúdo do aviso da ZapSign sem confirmar com a própria ZapSign.
- Contrato assinado perder o texto que o cliente viu, porque o modelo mudou depois.
- Usar o modelo de teste em produção sem perceber.

## 3. Decisões já tomadas

Pelo dono:
- Existe texto revisado por advogado; vai ser colado depois. Até lá, modelo de teste.
- Documento unificado (contrato + termo de associação).
- Conferência da assinatura é manual.
- Prazo para assinar: 7 dias.
- Exigências na assinatura: "acho que todos" (selfie, foto do documento, código por SMS/WhatsApp) — padrão ligado, **a PROSESP confirma**.

Minhas (o dono pode corrigir):
- Modelo editável no sistema, com campos marcados no texto (ex.: `{cliente.nome}`); lista de campos visível na tela.
- Assinantes extras fixos por convênio (representante, testemunhas), opcionais; padrão: só o cliente.
- Reenviar, trocar contato e cancelar como descrito em §4.5.
- Integração pelo servidor (Edge Functions do Supabase), como já é feito em `criar-usuario`.

## 4. Como funciona

### 4.1 Modelo do contrato
- Tabela de modelos por convênio, com versões: texto, número da versão, se é de teste, quem criou, quando. Só uma versão ativa por convênio. Versão usada por algum envio nunca é alterada nem apagada (salvar = nova versão).
- A coluna antiga `convenios.modelo_contrato` (texto solto, sem uso) é substituída por essa tabela.
- Texto com formatação simples: títulos, parágrafos, negrito, listas. O builder escolhe a marcação (ex.: Markdown simples) desde que o administrador consiga escrever sem conhecimento técnico.
- Campos: `{grupo.campo}`. Ao salvar, campo desconhecido é erro em português ("Campo desconhecido: {cliente.nomee}."). A tela lista os campos disponíveis com um exemplo de valor.
- Campos mínimos: dados do cliente (nome, CPF, RG se houver, data de nascimento, endereço, celular, e-mail), matrícula (número, órgão, vínculo, convênio), contrato (número, tipo, prazo, valor da parcela, bruto, descontos, quitações, dívidas compradas, líquido, primeiro e último vencimento, ADE), mensalidade (valor), conta de crédito (banco, agência, conta ou PIX principal), data de emissão por extenso, e um bloco automático com a tabela de parcelas (número, competência, vencimento, valor). O builder confere nos dados reais quais existem e completa a lista.
- **Blocos condicionais** (**minha decisão**): o texto aceita trechos que só aparecem quando se aplicam — termo de associação só se o contrato tem mensalidade proposta; quitações só em refinanciamento; dívidas compradas só em compra. Marcação simples, ex.: `{se mensalidade} … {fim}`; condição desconhecida é erro ao salvar.
- **Datas das parcelas** (**minha decisão**, pendência 5): as parcelas só são criadas na liberação do crédito, e a data depende do dia da liberação e do dia de corte. Por isso o PDF mostra competências e vencimentos **previstos**, calculados como se o crédito fosse liberado no dia do envio, com a frase "datas previstas; confirmadas na liberação do crédito". A liberação continua como está.
- Campo sem valor no contrato (ex.: cliente sem RG) sai como linha em branco para preencher, não como erro — **minha decisão**; o "o que falta" do cadastro já barrou o essencial antes da averbação.
- "Ver prévia": gera o PDF com um contrato escolhido (ou dados de exemplo), sem enviar nada.
- Modelo de teste: marca d'água/tarja "MODELO DE TESTE — NÃO USAR" em todas as páginas. Contrato só pode ser enviado com modelo de teste se o ambiente não for produção (configuração de ambiente); em produção, envio com modelo de teste é recusado com mensagem clara.

### 4.2 Configuração no convênio
- Prazo para assinar em dias (padrão 7).
- Exigências: selfie, foto do documento, código por SMS/WhatsApp — cada uma liga/desliga (padrão: todas ligadas).
- Canais de envio: e-mail e WhatsApp (padrão: os dois; usa os do cadastro do cliente).
- Assinantes extras: lista (nome, e-mail, celular, papel). Padrão vazio.

### 4.3 Envio (fase averbado → aguardando assinatura)
- Quem pode: quem já pode mover essa fase hoje (`contratos.mover`, equipe). Parceiro não envia.
- O botão chama uma função no servidor que: confere permissão e fase; confere que o convênio tem modelo ativo; confere que o cliente tem celular (e e-mail, se o canal estiver ligado); monta o PDF com os dados atuais; grava o PDF num bucket privado; cria o documento na ZapSign com os assinantes, exigências, prazo e envio automático; registra o envio; move o contrato para "aguardando assinatura".
- Se a ZapSign falhar, nada muda no contrato e a mensagem diz o que houve em português ("Não foi possível enviar para a ZapSign. Tente de novo em alguns minutos.").
- A mudança direta de "averbado" para "aguardando assinatura" sem envio deixa de ser permitida pela tela/função genérica de mover fase; só pelo envio.

### 4.4 Retorno e conferência
- A ZapSign avisa o sistema (webhook) numa função do servidor protegida por um segredo. A função **busca o documento na ZapSign** para confirmar a situação, e só então grava.
- Quando todos assinaram: baixa o PDF assinado para o bucket privado, guarda o que a ZapSign registrou (data/hora, IP, selfie, foto do documento, se disponíveis) e marca o envio como "assinado — falta conferir". O contrato continua em "aguardando assinatura".
- Se o cliente recusar na ZapSign: o envio fica "recusado pelo cliente" e o contrato aparece para a equipe decidir.
- Aviso repetido ou fora de ordem não estraga nada (idempotente).
- Tela do contrato mostra: situação do envio, links de quem assina, PDF enviado, PDF assinado, fotos, e os botões conforme a situação.
- **Aprovar assinatura** (`contratos.mover`): só com envio "assinado"; move para "aguardando pagamento", registrando quem conferiu.
- **Não aprovar**: põe o contrato em "pendente" com motivo (fluxo atual).
- Lista "Assinaturas para conferir" para a equipe achar os contratos rápido.

### 4.5 Quando não assina
- **Reenviar**: pede à ZapSign para mandar o link de novo aos mesmos contatos.
- **Trocar contato**: equipe corrige celular/e-mail no cadastro; o reenvio usa o contato novo (atualiza o assinante na ZapSign).
- **Prazo vencido**: rotina diária marca o envio como "vencido"; o contrato aparece na lista "Assinatura vencida". A equipe pode enviar de novo (novo documento) ou pôr pendente/recusar.
- **Contrato vai para pendente ou recusado** com envio em aberto: o documento é cancelado na ZapSign. Ao voltar de pendente, o contrato volta para "averbado" (não para "aguardando assinatura") e precisa de novo envio, com PDF novo.
- Se a ZapSign não aceitar o cancelamento, o envio fica marcado "cancelar na ZapSign" e aparece numa lista para a equipe resolver; o contrato segue mesmo assim.

### 4.6 Edição do contrato depois do envio (**minha decisão**)
- Editar valores (parcela, prazo, bruto, descontos, quitações, dívidas, mensalidade) com envio em aberto **ou já assinado, ainda não aprovado**: a edição cancela o envio na ZapSign e o contrato volta para "averbado", exigindo novo envio. A tela avisa antes de salvar.
- Depois de aprovado ("aguardando pagamento"), editar valores também volta o contrato para "averbado" e cancela a assinatura aprovada (o cliente precisa assinar o contrato novo).
- Ao aprovar, o sistema confere que os valores do contrato são os mesmos do PDF enviado; se não forem, recusa a aprovação.

### 4.7 Contratos que já estão em "aguardando assinatura"
- Não há produção ainda; só dados de teste locais. A migração devolve para "averbado" qualquer contrato em "aguardando assinatura" sem envio registrado, com motivo no histórico.

## 5. Segurança e configuração
- Chave da API da ZapSign e segredo do webhook ficam como segredos das Edge Functions; o dono coloca. Local: arquivo de ambiente das funções, fora do Git.
- Sem chave configurada, o botão de envio responde "A assinatura eletrônica ainda não foi configurada." Testes automáticos usam uma ZapSign falsa local (endereço configurável), nunca a real.
- Ambiente de testes da ZapSign (sandbox) para testar antes de produção.
- "É produção?" vem de uma variável de ambiente das funções (ex.: `AMBIENTE=producao`); sem ela, conta como teste e usa o endereço do sandbox (**minha decisão**). Chave do sandbox e de produção ficam em projetos/ambientes separados.
- Buckets privados; PDF e fotos visíveis só para a equipe com `contratos.ver` e para o parceiro dono do contrato (só os PDFs, não as fotos — **minha decisão**, pois são dados biométricos).
- Toda ação (enviar, reenviar, cancelar, aprovar, aviso recebido) fica auditada.

## 6. O que fica para o builder
- Biblioteca de PDF (no servidor/Deno) e o visual do PDF (fonte, cabeçalho, rodapé com página X de Y).
- Marcação exata do texto e editor da tela.
- Endpoints exatos da ZapSign (criar, reenviar, atualizar assinante, cancelar/excluir, consultar) conforme a documentação oficial.
- Nomes de tabelas e funções.

## 7. Pendências com a PROSESP
1. Texto do contrato unificado, revisado por advogado (um por convênio ou um só).
2. Quem assina além do cliente (representante, testemunhas).
3. Exigências na assinatura (selfie, documento, código) — padrão: todas.
4. Conta na ZapSign (plano com API) — o dono configura a chave.
5. Se o contrato pode mostrar datas "previstas" das parcelas ou se prefere só prazo, valor e primeira competência prevista.
