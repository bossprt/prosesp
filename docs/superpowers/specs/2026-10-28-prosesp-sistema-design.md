# PROSESP — Sistema de Gestão de Consignado e Mensalidades

**Data:** 2026-10-28 · **Status:** rascunho para aprovação
**Escopo deste documento:** visão do sistema inteiro + detalhe completo da **Etapa 1**. As etapas 2–9 ganham documento próprio quando chegar a vez delas.

Legenda: **[decidido]** = dito pelo dono do projeto · **[chamada do builder]** = decisão técnica minha, pode ser vetada · **[pendente PROSESP]** = o cliente ainda vai definir.

---

## 1. Intenção e porquê

A PROSESP (Programa de Serviços ao Servidor Público — associação privada, Franca/SP) oferece a servidores públicos dois produtos descontados em folha:

1. **Empréstimo consignado** (contratos com parcelas).
2. **Mensalidade associativa** (o servidor vira associado; chamada também de "contribuição" / "auxílio financeiro").

Hoje usa o **Workbank**, que não entrega o que precisam e obriga trabalho manual em: tabelas, inadimplência, retorno e conciliação, financeiro, parcelas não descontadas e, principalmente, a **esteira com digitação de contrato**. O sistema novo substitui o Workbank.

**Sucesso:** o contrato é digitado uma vez; o sistema calcula pela tabela certa do convênio, conduz a esteira, confere o retorno da folha sozinho, aponta parcelas não descontadas e atrasos, calcula comissões e estornos, e fecha o financeiro — sem planilha paralela.

### Não-objetivos
- Copiar o formato de tabelas/relatórios do Workbank (serve só para entender o negócio). **[decidido]**
- Copiar código, regras de negócio ou dados do projeto `gestao-contratos` (de outro dono). Ele pode ser lido só para entender o funcionamento geral. **[decidido]**
- Integração automática com averbadoras (averbação continua manual). **[decidido]**
- Campo de consentimento LGPD no cadastro. **[decidido]**

### Anti-objetivos (seria fracasso mesmo "funcionando")
- Regra de convênio fixa no código.
- Dinheiro calculado/validado só na tela.
- ADE errado entrando sem trava e só aparecendo no retorno.
- Valor duplicado em dois lugares que podem divergir (ex.: valor da mensalidade guardado no contrato **e** em outra tabela).
- Diferenças de desconto "sumindo" sem alguém decidir.

---

## 2. Restrições

- **Stack [decidido]:** React + Vite + TypeScript (front); Supabase (Postgres, Auth, RLS, RPCs plpgsql para operações críticas, Edge Functions para integrações); Vercel + GitHub; vitest; migrações SQL versionadas; dinheiro sempre `numeric(14,2)` (fatores `numeric(12,8)`).
- **Ambiente [decidido]:** desenvolvimento 100% local (Supabase CLI via `npx supabase` + Docker). Nada sobe para GitHub/Supabase remoto sem o dono dizer "pode subir"/"pode aplicar". Se o projeto Supabase/repositório serão separados do `gestao-contratos`: **[pendente dono]**.
- **Segredos:** nenhuma chave no front nem no repositório; o dono configura as chaves.
- **Idioma:** UI e mensagens de erro em português claro.
- **Qualidade:** `npx tsc -b` + testes antes de cada commit; revisão (/code-review + /security-review) ao fim de cada etapa.

---

## 3. Visão do sistema inteiro

### 3.1 Perfis de acesso **[decidido]**
`administrador`, `gerente`, `financeiro`, `operador`, `consulta`, `parceiro`.
- **Parceiro** tem login próprio e vê **somente** os próprios clientes, contratos, pré-digitações e extrato de comissões.
- **Gerente** ≈ quase tudo do administrador; detalhes **[pendente PROSESP]**.
- Permissões ficam numa **matriz configurável** (perfil × permissão) editável pelo administrador. **[chamada do builder]**

### 3.2 Multi-convênio
Convênio = configuração no banco. Cada convênio tem: vínculos (efetivo, temporário, …), tabelas de cálculo, prazos e margens, averbadora, formato de ADE, layout de retorno/remessa, data de corte, dias para sugerir prejuízo (padrão 90), dia de vencimento, regras de atraso, campos obrigatórios do cadastro, modelo de contrato PDF, regras de comissão. Convênio novo = cadastro, sem código.

Ativos hoje: **Governo do Acre**, **Prefeitura de Rio Branco**. Outros existem no histórico do Workbank (Gov. PB, Aquiraz, Maranguape, Maragogipe, Cachoeira, Altos, São Félix).

### 3.3 Tabelas e simulador
- **Fórmulas [decidido]:** `parcela = valor × fator`; `valor = parcela ÷ fator`.
- Cada **linha de tabela** combina: convênio, vínculo, tipo (novo/refinanciamento/compra), prazo, faixa de valor (opcional), faixa de idade (opcional) → fator, % de comissão, base da comissão, valor da mensalidade. **[chamada do builder]**
- Tabelas têm **vigência** (de/até). O banco **impede sobreposição**: duas linhas vigentes nunca atendem o mesmo caso. **[chamada do builder]**
- Fatores reais: **[pendente PROSESP]**.

### 3.4 Esteira de contratos **[decidido]**
`pré-digitação` (só parceiro) → `digitado` → `em validação` → `em averbação` → `averbado` → (botão Enviar) → `aguardando assinatura` → (validação manual da assinatura) → `aguardando pagamento` → `crédito liberado`.
Desvios: `pendente` (motivo obrigatório, volta para corrigir) e `recusado` (motivo obrigatório; situação = cancelada; cancela assinatura em aberto). Recusar é possível em qualquer fase antes do pagamento. Na pré-digitação, a equipe aprova (→ digitado) ou devolve ao parceiro com motivo.

Tipos de contrato: **novo**, **refinanciamento** (pode quitar vários anteriores), **compra**; e **mensalidade**.
Situação (fora da fase): ativo, em atraso, quitado, renovado, cancelado, prejuízo.

**ADE (trava contra erro) [decidido]:** dois modos configuráveis — *seguro* (digitar 2×, colar bloqueado) e *rápido* (um campo, colar permitido). Em ambos: formato validado pelo convênio e ADE único. Opcional: importar lista de averbações da averbadora (quando ela fornecer) e conferir antes do retorno.

**Reaverbação:** ADE novo substitui o ativo (antigo = substituído); parcelas pagas ficam no ADE antigo, abertas/atrasadas passam para o novo (não vão para o fim do prazo). Mensalidade: valor obrigatório na reaverbação e data de primeiro vencimento informada à mão (data de corte é por convênio). Troca de matrícula sem trocar ADE é operação separada.

### 3.5 Comissões e estornos **[decidido]**
Duas operações separadas, cada uma com histórico próprio:
1. **Comissão do contrato:** % da tabela; base = **líquido** (novo, refinanciamento) ou **bruto** (compra).
2. **Comissão da mensalidade:** **100% da primeira mensalidade**; em aumento de mensalidade por contrato novo/refinanciamento, **100% da diferença**.

Ambas geradas **quando o crédito é liberado** (não esperam o desconto).
**Estorno:** quitação ou inadimplência nos **3 primeiros meses** → estorno da comissão e da mensalidade não descontada. Estorno entra como **débito** no próximo acerto; o gestor pode **parcelar** em vários acertos; se não houver saldo, passa para o próximo (acerto nunca negativo; saldo devedor do parceiro acompanhado).
**Acerto / relatório de comissões:** por parceiro, lista as duas operações juntas; rodapé Crédito − Débito = Saldo a pagar. Pagamento em lote por parceiro, operação atômica, servidor confere o total visto pelo usuário (regras completas do pedido original, item 3.7).

### 3.6 Retorno, remessa e diferenças de desconto **[decidido + chamadas do builder]**
- Layout do **Governo do Acre**: 24 colunas (Folha, CNPJ_Consignataria, Consignataria, VP, Matricula, Departamento, Lotacao, Cod_Desconto, Valor_Desconto, Nome, Grupo, Orgao, CPF, ID_Consignacao, Servico, Parc_Paga, Parc_Total, Data_Contrato, Valor_Original_Parcela, Observacao, Contrato interno, Ultima situação, Categoria, Situação da Matricula). Mesmo layout para parcelas ("CONVENIOS_…") e mensalidades ("CONTRIBUICAO_…"); nome do arquivo indica Descontado/Não descontado e mês. Layout é configuração do convênio.
- Casamento por ADE (ID_Consignacao) dentro do convênio; conferência de CPF, matrícula, valor e competência; fallback por CPF + matrícula + valor (+ "Contrato interno") com sugestão.
- **Prévia da conciliação antes de gravar** ("X batem, Y com problema").
- Situações de linha: conciliada, divergente, parcial, não encontrada, ADE antiga, duplicada, ignorada.
- **Desconto menor que a parcela:** registra o recebido; diferença fica **em aberto** (diferença de desconto); gerente/admin pode dar baixa com motivo e auditoria.
- Mesmo arquivo importado 2× não reprocessa (hash).
- Atraso recalculado diariamente; atraso de mensalidade não marca o contrato de empréstimo como "em atraso" e tem indicador próprio.

### 3.7 Financeiro e DRE **[decidido: suportar os dois modelos]**
Cada liberação tem um **recurso** de origem: *próprio* (receita = juros embutidos nas parcelas recebidas; principal volta como capital) ou *terceiro* (receita = comissão de intermediação). Mensalidade é sempre receita. DRE por convênio e geral, competência e caixa, com fechamento de mês imutável.

### 3.8 Demais módulos
Conforme o pedido original do dono (resumido no Apêndice A): PDF + ZapSign, legado via **planilha-modelo própria** (fonte a descobrir), liberações e arrependimento, parceiros/agentes/origens, indicadores, IA por áudio (só leitura), auditoria e RLS em todas as tabelas. WhatsApp em dois canais (link de assinatura na Etapa 4; IA na Etapa 9) — provedor **[pendente]**.

### 3.9 Ordem de construção **[decidido]**
1. Convênios, cadastros e perfis · 2. Contratos e esteira · 3. Legado · 4. PDF e assinatura · 5. Retorno, remessa e adimplência · 6. Liberações, recursos, comissões, mensalidades · 7. Financeiro e DRE · 8. Indicadores · 9. IA por áudio.

---

## 4. Etapa 1 em detalhe — Convênios, cadastros e perfis

### 4.1 Entregáveis
1. Projeto criado (front Vite + Supabase local), CI local de typecheck/testes.
2. Login (e-mail + senha via Supabase Auth); usuários criados pelo administrador (sem cadastro público).
3. Perfis, matriz de permissões, RLS em todas as tabelas, auditoria genérica.
4. Cadastro de **convênios** com toda a configuração da 3.2 (os campos de etapas futuras ficam reservados como configuração, mesmo que ainda não usados) e **tabelas de cálculo** com vigência e trava de sobreposição + **simulador** (parcela ↔ valor).
5. Cadastro de **clientes** em duas camadas, com matrículas, contas bancárias, beneficiários, documentos e histórico.
6. Cadastro de **parceiros**, **agentes**, **origens** e **bancos**.

### 4.2 Modelo de dados (resumo) **[chamada do builder]**
- `perfis`, `permissoes`, `perfil_permissoes`, `usuarios` (liga `auth.users` ao perfil; usuário do tipo parceiro aponta para `parceiros.id`).
- `convenios` (nome, UF/ente, ativo, averbadora, formato do ADE (regex + descrição), modo do ADE (seguro/rápido), dia de vencimento, dia de corte, dias p/ prejuízo, prazos mín/máx, % de margem, campos obrigatórios do cadastro (lista), layout de retorno/remessa (JSON versionado), modelo PDF (referência)).
- `convenio_vinculos` (efetivo, temporário, …).
- `tabelas_calculo` (convênio, nome, vigência) → `tabela_linhas` (vínculo, tipo, prazo, faixa valor, faixa idade, fator, % comissão, base comissão, valor mensalidade) com *exclusion constraint* impedindo sobreposição na mesma vigência.
- `clientes` (CPF único, nome, celular, whatsapp + campos completos: RG, filiação, estado civil, escolaridade, PIS, endereço, PEP, analfabeto, cônjuge).
- `cliente_matriculas` (convênio, vínculo, matrícula, órgão, ativa), `cliente_contas` (banco, agência, conta, tipo, chave PIX, principal — no máximo 1), `cliente_beneficiarios`, `cliente_documentos` (Supabase Storage privado), `cliente_historico` (alterações de telefone, conta e matrícula).
- `parceiros` (PF/PJ, documento, contas/PIX, recebe mensalidades S/N), `agentes` (ligados a parceiro), `origens`, `bancos` (código FEBRABAN).
- `auditoria` (quem, quando, tabela, registro, antes, depois) preenchida por trigger.

### 4.2.1 Esclarecimentos
- **Cadastro rápido [decidido]:** nome, CPF, celular, WhatsApp, convênio e matrícula. **Completo:** RG, filiação, estado civil, escolaridade, PIS, endereço, PEP, analfabeto, cônjuge (+ contas, beneficiários, documentos).
- **Campos obrigatórios por convênio [chamada do builder]:** a lista pode citar colunas do cliente **e** itens relacionados (ter matrícula ativa no convênio, ter conta principal, ter beneficiário, ter documento de tipo X anexado). A função "o que falta" avalia todos.
- **Valor da mensalidade na tabela [chamada do builder]:** é o valor *de referência para novos contratos*. O contrato grava o valor contratado (histórico imutável, como exigido no legado). Não é duplicação: são dois fatos diferentes, e nada lê um no lugar do outro.
- **Legado e constraints [chamada do builder]:** o banco é estrito desde o início (CPF válido, celular obrigatório). Registros de legado que não passam vão para a lista de pendências da importação (Etapa 3), em vez de afrouxar o banco. Campos do cadastro completo são anuláveis por natureza.

- **Cliente compartilhado, contrato com dono [decidido]:** o cliente é único por CPF e **não pertence a parceiro**; quem tem dono é o **contrato** (parceiro + agente + origem). Um cliente pode ter vários contratos de parceiros diferentes.
- Parceiro que digita um CPF já existente **reaproveita o cadastro** (vê e usa os dados cadastrais) e liga a nova pré-digitação a esse cliente. Ele vê apenas os dados cadastrais do cliente e **só os contratos que ele trouxe** — nunca contratos, valores ou identidade de outros parceiros.
- RLS do parceiro em `clientes` e tabelas filhas: visível se existir contrato/pré-digitação dele ligado ao cliente, ou se ele o cadastrou. A busca por CPF é uma RPC que devolve só os dados cadastrais.
- **[chamada do builder]** Alterações feitas pelo parceiro no cadastro (telefone, conta, endereço) ficam no histórico com autor e são conferidas pela equipe na aprovação da pré-digitação. Na Etapa 1, sem contratos ainda, o vínculo parceiro↔cliente é registrado pelo cadastro feito por ele.

- **Agentes [decidido]:** não têm login; são um cadastro (ligado a um parceiro) escolhido numa lista ao digitar o contrato. Só parceiros têm acesso externo.

- **Comissão variando por parceiro [pendente PROSESP]:** ainda não se sabe se a comissão muda por parceiro (o dono levantou a hipótese de categorias como bronze/prata/ouro, mas a regra será informada pela PROSESP). Na Etapa 1 a linha de tabela guarda um % de comissão único; o desenho de comissão por parceiro fica para quando a PROSESP responder, antes da Etapa 6. **[chamada do builder]** Guardar o % de comissão em tabela separada da linha de fator, para que essa extensão não exija refazer as tabelas.

### 4.3 Regras
- CPF validado (dígitos) e único; tentativa repetida → "Já existe um cliente com este CPF."
- Celular e WhatsApp obrigatórios no cadastro rápido.
- **"O que falta"**: função no banco que, dado cliente + convênio, devolve os campos obrigatórios ausentes — usada pela tela e, na Etapa 2, para bloquear a geração do contrato.
- Parceiro só lê/escreve linhas ligadas a ele (RLS); demais perfis conforme matriz.
- Escritas sensíveis por RPC `security definer` que checa permissão na primeira instrução; nenhuma função crítica executável por `anon`.
- Toda alteração em cliente, conta, matrícula, convênio e tabela gera auditoria.

### 4.4 Testes
Testes de banco (RLS por perfil, trava de sobreposição, CPF único, "o que falta", auditoria) e testes de front (formulários, máscaras, simulador). Typecheck limpo.

### 4.5 Decisões após revisão independente (Codex) **[chamadas do builder]**
1. **Busca por CPF pelo parceiro:** exige CPF **e** matrícula batendo com o cadastro (impede "pescar" dados só com um CPF). Devolve apenas campos cadastrais para pré-preenchimento; cada consulta é auditada (quem, quando, CPF). O vínculo parceiro↔cliente nasce só quando ele salva a pré-digitação.
2. **Alterações do parceiro são propostas:** telefone, conta, endereço etc. alterados pelo parceiro ficam como **alteração pendente** e só valem para o cadastro após a equipe aprovar. Até lá, todas as operações usam os dados vigentes. Operador/gerente/admin alteram direto (com histórico).
3. **Matriz de permissões com teto fixo:** permissões configuráveis decidem *o que* cada perfil faz; o *escopo de dados* do parceiro (só os próprios vínculos) é imposto pela RLS e não é configurável. Ninguém altera o próprio perfil/permissões; só administrador gerencia perfis e usuários; o parceiro nunca recebe permissões administrativas.
4. **Trava de sobreposição:** a vigência é copiada para cada linha; a exclusion constraint cobre convênio + vínculo + tipo + prazo + faixa de valor + faixa de idade + vigência, **entre todas as tabelas do convênio**. Faixas são `[mín, máx]` inclusivas em centavos/anos inteiros; faixa ausente = "qualquer valor" (e portanto conflita com qualquer outra). Vigência sem fim = aberta. Teste de aceitação: toda simulação encontra **no máximo uma** linha.
5. **Simulador determinístico:** fator > 0 (check no banco); cálculo em `numeric` sem arredondar no meio; resultado arredondado para centavos (half-up) uma vez no final; `valor = parcela ÷ fator` arredonda **para baixo** (nunca libera valor cuja parcela passe da margem). Vigência e idade avaliadas na data da simulação. Testes com exemplos numéricos fixos.
6. **Tabelas imutáveis depois de usadas:** linha de tabela já referenciada por simulação/contrato não pode ser editada nem apagada — só encerrada (fim de vigência) e substituída. Simulações gravadas guardam o id da linha usada.
7. **Usuários e anexos:** o primeiro administrador é criado por script de instalação local (sem tela pública). Usuários são desativados, nunca apagados. Bucket de documentos privado; políticas do Storage seguem a mesma regra de visibilidade do cliente; links de download assinados e de curta duração; testes de acesso direto.
8. **Auditoria:** registra alterações (trigger) e também acessos sensíveis (consulta de CPF pelo parceiro, download de documento, login). A tabela de auditoria é só-inserção (ninguém altera nem apaga), e só administrador e gerente a leem.

### 4.6 Fora da Etapa 1
Contratos, esteira, comissões, retorno, PDF, financeiro.

---

## 5. Pendências do cliente
1. Fatores e tabelas reais (por convênio/vínculo/tipo/prazo/…).
2. Permissões exatas do gerente.
3. Layout do retorno da Prefeitura de Rio Branco; arquivo real com dados do Gov. AC.
4. Fonte da planilha de legado.
5. Provedor de WhatsApp (assinatura e IA).
6. Projeto Supabase / repositório separados do gestao-contratos.
7. Data de corte e dias de prejuízo por convênio.
8. Se a comissão varia por parceiro (e como).

---

## Apêndice A — Requisitos do pedido original (resumo fiel)

- **Documentos e assinatura:** PDF gerado pelo sistema com modelo por convênio; assinatura ZapSign; link também por e-mail e WhatsApp; texto jurídico revisado por advogado; texto de privacidade no contrato.
- **Cadastro de cliente:** duas camadas; sistema mostra o que falta antes do contrato; convênio define obrigatórios; várias matrículas, contas (PIX, uma principal) e beneficiários; anexos (RG, comprovante de residência); histórico de telefone, conta e matrícula; CPF repetido bloqueado; celular e WhatsApp em todo cadastro; sem campo de consentimento LGPD.
- **Legado:** planilha-modelo, extrato da averbadora e PDFs; entra na fase/situação reais com parcelas pagas/a vencer/em atraso por competência; não gera comissão, pagamento nem assinatura; guarda valores contratados sem recalcular; prévia "X entram, Y com problema" e gravação só após confirmação; erros para lista de pendências sem travar o resto; chave = número do ADE/proposta (sem duplicar); marca "legado" com data e autor; refinanciamento com vários anteriores e mensalidade mês a mês; amostra de 10–20 conferida com o cliente antes do total.
- **Pagamentos:** filas de comissões e de mensalidades com seleção em lote; lote de um parceiro só; mensalidades só para o parceiro configurado como recebedor; contrato + mensalidade do mesmo parceiro num pagamento atômico (um PIX, um comprovante, históricos separados ligados por observação); servidor confere o total visto e recusa se mudou ou já foi pago; janela com conta destino, data, forma, QR Code e copia-e-cola PIX, comprovante (URL/arquivo), observação; histórico por lote; mensalidade com histórico por competência e tipos nova/reajuste/migração (migração ≠ reajuste); só financeiro e administrador pagam; funções fechadas a não logados; auditoria de todo pagamento.
- **Liberações e recursos:** tela de liberação separada das comissões, com histórico e cancelamento por arrependimento dentro do prazo; recurso financeiro de cada liberação, com saldo e relatório.
- **Parceiros, agentes e origens:** cadastro com conta bancária e PIX; cada contrato tem origem (ex.: tráfego pago) e agente; comissão segue regra do convênio e do parceiro (tabela de comissão por parceiro).
- **Financeiro:** contas a pagar/receber por convênio, parceiro e competência; plano de contas; DRE mensal por convênio e geral (competência e caixa); fechamento de mês imutável; dinheiro validado no banco; máscara R$; auditoria de toda mudança de valor.
- **Indicadores:** painel com produção, carteira, evolução da dívida, adimplência, prejuízo, encerramentos; relatórios de comissões pagas, pendentes de desconto e por recurso; exportar planilha.
- **IA por áudio:** WhatsApp → transcrição → IA entende → consulta banco → responde texto/áudio; só leitura; respeita perfil; números sempre do banco; auditoria de perguntas; ações de dinheiro continuam na tela.
- **Auditoria e segurança:** registro de quem fez o quê em valor, fase, cadastro e acesso; RLS em todas as tabelas; funções críticas fechadas a visitantes; nenhuma chave secreta no front.
- **Encerramentos:** quitação, renovação, cancelamento, prejuízo; histórico completo de parcelas por competência.
