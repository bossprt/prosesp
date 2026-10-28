# Etapa 1 — Convênios, Cadastros e Perfis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base do sistema PROSESP rodando localmente: login, seis perfis com matriz de permissões, auditoria, cadastros de apoio (bancos, parceiros, agentes, origens), convênios configuráveis, tabelas de cálculo com simulador, e cadastro de clientes em duas camadas com o acesso restrito do parceiro.

**Architecture:** Regras e segurança vivem no Postgres (Supabase local): RLS em todas as tabelas, funções `security definer` para escritas sensíveis, triggers de auditoria. O front React só chama tabelas protegidas por RLS e RPCs. Uma Edge Function cria usuários (precisa da chave de serviço, que nunca vai ao front).

**Tech Stack:** Supabase CLI (`npx supabase`, Docker), Postgres 17 + `btree_gist`, Deno Edge Function, React 18 + Vite + TypeScript, React Router, TanStack Query, react-hook-form + zod, Tailwind, vitest (+ `pg` para testes de banco, @testing-library/react + jsdom para o front).

**Spec:** `docs/superpowers/specs/2026-10-28-prosesp-sistema-design.md` (seções 3.1–3.3 e 4).

## Global Constraints

- Tudo local. Nunca `git push`, nunca `supabase link`/`db push` para remoto sem o dono dizer "pode subir"/"pode aplicar".
- Antes de cada commit: `npx tsc -b` (em `app/`) e `npm test` (raiz) passando; se falhar, reportar a mensagem exata.
- Todo commit termina com a linha: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Dinheiro: `numeric(14,2)`; fatores: `numeric(12,8)`; percentuais: `numeric(7,4)`. Nunca `float`.
- Toda tabela nova: `enable row level security` na mesma migração; nenhuma tabela sem policy.
- Funções `security definer` com `set search_path = ''`, nomes totalmente qualificados, e `revoke execute ... from public, anon` explícito.
- Mensagens de erro ao usuário em português claro (vale para `raise exception` e para o front).
- Nenhuma chave secreta no front nem no repositório. `app/.env.local` (ignorado pelo git) só com URL e chave **anon** locais.
- Sem campo de consentimento LGPD.
- Perfis: `administrador`, `gerente`, `financeiro`, `operador`, `consulta`, `parceiro`. Agentes não têm login.

## Review Focus

1. **CPF digitado com máscara, espaços ou sem zero à esquerda** ("012.345.678-90", "1234567890") → normalizado para 11 dígitos antes de validar e de checar unicidade; nunca dois clientes para o mesmo CPF. (Teste na Task 7.)
2. **Valor exatamente na borda de faixa** (R$ 499,99 e R$ 500,00 com faixas 300–499,99 e 500–999,99) → cada um cai em exatamente uma linha; nenhum buraco nem sobreposição. (Teste na Task 6.)
3. **Parceiro chamando a API direto com o id de um cliente que não é dele** (sem passar pela tela) → zero linhas / erro de permissão, em `clientes` e em todas as tabelas filhas e no Storage. (Testes nas Tasks 8 e 10.)
4. **Editar ou apagar linha de tabela já usada numa simulação gravada** → recusado com mensagem em português; encerrar vigência continua permitido. (Teste na Task 6.)
5. **Marcar uma segunda conta bancária como principal** → a anterior deixa de ser principal na mesma operação; nunca duas principais. (Teste na Task 7.)

---

## Estrutura de arquivos

```
package.json                      # scripts raiz: test, test:db, db:reset
vitest.config.ts                  # projeto "db" (tests/db)
supabase/config.toml              # gerado por `npx supabase init`
supabase/migrations/0001_acesso.sql
supabase/migrations/0002_auditoria.sql
supabase/migrations/0003_cadastros_apoio.sql
supabase/migrations/0004_convenios.sql
supabase/migrations/0005_tabelas_calculo.sql
supabase/migrations/0006_simulador.sql
supabase/migrations/0007_clientes.sql
supabase/migrations/0008_clientes_parceiro.sql
supabase/migrations/0009_o_que_falta.sql
supabase/migrations/0010_storage_documentos.sql
supabase/functions/criar-usuario/index.ts
scripts/criar-admin.mjs
tests/db/helpers.ts               # conexão, transação com rollback, "como usuário"
tests/db/*.test.ts                # um arquivo por migração
app/                              # Vite React TS (criado na Task 11)
  src/lib/supabase.ts, erros.ts, mascaras.ts, permissoes.ts
  src/features/<area>/...         # auth, usuarios, apoio, convenios, tabelas, clientes, parceiro
```

---

### Task 1: Esqueleto do repositório e harness de testes de banco

**Files:**
- Create: `package.json`, `vitest.config.ts`, `.gitignore`, `supabase/config.toml` (via CLI), `tests/db/helpers.ts`, `tests/db/smoke.test.ts`

**Interfaces:**
- Produces (`tests/db/helpers.ts`):
  - `emTransacao(fn: (c: pg.PoolClient) => Promise<void>): Promise<void>` — abre `begin`, roda, sempre `rollback`.
  - `criarUsuarioTeste(c, perfil: Perfil, opts?: { parceiroId?: string }): Promise<string>` — insere em `auth.users` e `public.usuarios`, devolve o uuid. (Disponível a partir da Task 2.)
  - `comoUsuario(c, userId: string): Promise<void>` — `set local role authenticated` + `set_config('request.jwt.claims', '{"sub":"<id>","role":"authenticated"}', true)`.
  - `comoAnon(c): Promise<void>` — `set local role anon`.
  - `type Perfil = 'administrador'|'gerente'|'financeiro'|'operador'|'consulta'|'parceiro'`
  - Conexão: `process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'`.

- [ ] **Step 1:** `npx supabase init` na raiz; `npm init -y`; instalar dev deps `vitest pg @types/pg typescript`. Scripts: `"test": "vitest run"`, `"test:db": "vitest run tests/db"`, `"db:reset": "npx supabase db reset"`. `.gitignore`: `node_modules`, `.env*`, `supabase/.temp`, `app/dist`.
- [ ] **Step 2:** Escrever `tests/db/smoke.test.ts`: `it('conecta no banco local')` → `select 1 as ok` retorna `ok = 1`.
- [ ] **Step 3:** `npx supabase start` (Docker). Run: `npm run test:db` → Expected: PASS.
- [ ] **Step 4:** Commit `chore: esqueleto do repositório e testes de banco`.

---

### Task 2: Perfis, permissões e usuários (0001_acesso)

**Files:**
- Create: `supabase/migrations/0001_acesso.sql`, `tests/db/0001_acesso.test.ts`

**Interfaces:**
- Produces:
  - enum `public.perfil_acesso` com os 6 perfis.
  - `public.permissoes(chave text pk, descricao text)` — semente com: `usuarios.gerenciar`, `permissoes.gerenciar`, `auditoria.ver`, `convenios.ver`, `convenios.editar`, `tabelas.editar`, `simulador.usar`, `clientes.ver`, `clientes.editar`, `clientes.aprovar_alteracoes`, `parceiros.ver`, `parceiros.editar`, `apoio.editar`.
  - `public.perfil_permissoes(perfil perfil_acesso, permissao text fk, pk(perfil, permissao))`.
  - `public.usuarios(id uuid pk fk auth.users, nome text not null, email text not null, perfil perfil_acesso not null, parceiro_id uuid null, ativo boolean default true, criado_em timestamptz default now())`; check: `(perfil = 'parceiro') = (parceiro_id is not null)` (FK para `parceiros` é adicionada na Task 4).
  - Funções (stable, security definer): `public.app_perfil() returns perfil_acesso` (null se não logado ou inativo); `public.app_pode(p_permissao text) returns boolean`; `public.app_parceiro_id() returns uuid`; `public.app_exigir(p_permissao text) returns void` — levanta `'Você não tem permissão para esta ação.'` com `errcode = '42501'`.
  - Teto do parceiro: constante no corpo de um trigger em `perfil_permissoes` — parceiro só pode receber `simulador.usar`, `convenios.ver`, `clientes.ver`, `clientes.editar`; outra → `'Esta permissão não pode ser dada ao perfil parceiro.'`
  - Semente da matriz padrão: administrador = todas; gerente = todas menos `usuarios.gerenciar`, `permissoes.gerenciar`; financeiro = `convenios.ver`, `clientes.ver`, `parceiros.ver`, `simulador.usar`; operador = `convenios.ver`, `simulador.usar`, `clientes.ver`, `clientes.editar`, `clientes.aprovar_alteracoes`, `parceiros.ver`; consulta = `convenios.ver`, `clientes.ver`, `parceiros.ver`, `simulador.usar`; parceiro = as quatro do teto.
  - RLS: `usuarios` — cada um lê a própria linha; quem tem `usuarios.gerenciar` lê/escreve todas; ninguém altera a **própria** `perfil`/`parceiro_id`/`ativo` (trigger). `perfil_permissoes` — leitura para logados; escrita só com `permissoes.gerenciar`.

- [ ] **Step 1: Testes que falham** em `tests/db/0001_acesso.test.ts`:
  - `app_pode devolve true para administrador e false para consulta em convenios.editar`
  - `usuário inativo não tem perfil` → `app_perfil()` = null
  - `anon não tem nenhuma permissão` → `app_pode('clientes.ver')` = false
  - `não é possível dar apoio.editar ao perfil parceiro` → erro com a mensagem acima
  - `gerente não altera o próprio perfil` → update recusado
  - `operador não lê a linha de outro usuário` → 0 linhas
- [ ] **Step 2:** `npm run db:reset && npm run test:db -- 0001` → FAIL (objetos inexistentes).
- [ ] **Step 3:** Escrever `0001_acesso.sql` conforme Interfaces; completar `criarUsuarioTeste` em helpers.
- [ ] **Step 4:** `npm run db:reset && npm run test:db -- 0001` → PASS.
- [ ] **Step 5:** Commit `feat(db): perfis, permissões e usuários`.

---

### Task 3: Auditoria (0002_auditoria)

**Files:** Create `supabase/migrations/0002_auditoria.sql`, `tests/db/0002_auditoria.test.ts`

**Interfaces:**
- Produces:
  - `public.auditoria(id bigint identity pk, em timestamptz default now(), usuario_id uuid, acao text, tabela text, registro_id text, antes jsonb, depois jsonb, detalhe jsonb)`.
  - Trigger function `public.auditar()` (after insert/update/delete, for each row) — grava `acao` = `TG_OP`, `antes`/`depois` = `to_jsonb(OLD/NEW)`, `usuario_id` = `auth.uid()`.
  - `public.registrar_acesso(p_acao text, p_detalhe jsonb) returns void` — security definer, para acessos sensíveis (consulta de CPF, download de documento, login).
  - RLS: select só com `auditoria.ver`; **nenhuma** policy de insert/update/delete para `authenticated`; além disso `revoke update, delete, truncate on public.auditoria from public, anon, authenticated` e trigger `before update or delete` que levanta `'Registros de auditoria não podem ser alterados.'` (vale até para o dono).
  - Toda tabela das Tasks 4–8 recebe `create trigger trg_auditoria after insert or update or delete ... execute function public.auditar()`.

- [ ] **Step 1:** Testes: `alteração numa tabela auditada grava antes e depois com o usuário`; `operador não lê auditoria`; `gerente lê auditoria`; `ninguém apaga registro de auditoria` (mesmo como postgres → erro); `registrar_acesso grava acao e detalhe`. Para o primeiro teste use `public.usuarios` (aplique o trigger nela nesta migração).
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(db): auditoria só-inserção`.

---

### Task 4: Bancos, parceiros, agentes e origens (0003_cadastros_apoio)

**Files:** Create `supabase/migrations/0003_cadastros_apoio.sql`, `tests/db/0003_cadastros_apoio.test.ts`

**Interfaces:**
- Produces:
  - `public.bancos(id uuid pk, codigo char(3) unique not null, nome text not null, ativo bool)` — semente com os principais bancos (001, 033, 104, 237, 341, 260, 077, 336, 756, 748).
  - `public.parceiros(id uuid pk, tipo_pessoa text check in ('PF','PJ'), documento text unique not null (só dígitos, 11 ou 14), nome text not null, email text, celular text not null, whatsapp text not null, recebe_mensalidades bool default false, ativo bool default true, criado_em timestamptz)`.
  - `public.parceiro_contas(id uuid pk, parceiro_id fk, banco_id fk, agencia text, conta text, tipo_conta text check in ('corrente','poupanca','pagamento'), chave_pix text, tipo_chave_pix text check in ('cpf','cnpj','email','celular','aleatoria'), principal bool)` + índice único parcial `(parceiro_id) where principal`.
  - `public.agentes(id uuid pk, parceiro_id fk not null, nome text not null, celular text, ativo bool)`.
  - `public.origens(id uuid pk, nome text unique not null, ativo bool)` — semente: `Tráfego pago`, `Indicação`, `Parceiro`, `Balcão`.
  - FK `usuarios.parceiro_id → parceiros.id`.
  - RLS: leitura com `parceiros.ver` (bancos/origens: qualquer logado); escrita com `parceiros.editar` (parceiros, contas, agentes) e `apoio.editar` (bancos, origens). Parceiro logado lê **só** a própria linha de `parceiros`, as próprias contas e os próprios agentes.
  - RPC `public.definir_conta_principal(p_conta_id uuid) returns void` — desmarca a anterior e marca a nova na mesma transação (padrão reusado na Task 7).

- [ ] **Step 1:** Testes: `documento de parceiro é normalizado e único`; `parceiro só vê a si mesmo` (2 parceiros); `definir_conta_principal troca a principal` (Review Focus 5); `consulta não insere parceiro`; `toda alteração em parceiros é auditada`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): bancos, parceiros, agentes e origens`.

---

### Task 5: Convênios e vínculos (0004_convenios)

**Files:** Create `supabase/migrations/0004_convenios.sql`, `tests/db/0004_convenios.test.ts`

**Interfaces:**
- Produces:
  - `public.convenios(id uuid pk, nome text unique not null, uf char(2), ente text, ativo bool default true, averbadora text, ade_regex text, ade_descricao text, ade_modo text check in ('seguro','rapido') default 'seguro', dia_vencimento smallint check 1..28, dia_corte smallint check 1..28, dias_prejuizo int default 90 check > 0, prazo_min int, prazo_max int check prazo_max >= prazo_min, margem_percentual numeric(7,4), campos_obrigatorios text[] default '{}', layout_retorno jsonb, layout_remessa jsonb, modelo_contrato text, criado_em timestamptz)`.
  - `ade_regex` é validado no insert/update (`'' ~ ade_regex` dentro de bloco que captura erro → `'Formato de ADE inválido.'`).
  - `campos_obrigatorios` só aceita chaves do catálogo `public.catalogo_campos_cliente() returns table(chave text, rotulo text)` (criada nesta migração; checada por trigger; reusada pela Task 9). Chaves: `rg`, `rg_orgao`, `data_nascimento`, `nome_mae`, `nome_pai`, `estado_civil`, `escolaridade`, `pis`, `endereco`, `pep`, `analfabeto`, `conjuge`, `email`, `conta_principal`, `beneficiario`, `doc_rg`, `doc_comprovante_residencia`.
  - `public.convenio_vinculos(id uuid pk, convenio_id fk, nome text, ativo bool, unique(convenio_id, nome))`.
  - Semente: `Governo do Acre` (vínculos `Efetivo`, `Temporário`) e `Prefeitura de Rio Branco` (vínculo `Efetivo`); demais campos nulos (pendente PROSESP).
  - RLS: ler com `convenios.ver`; escrever com `convenios.editar`. Auditado.

- [ ] **Step 1:** Testes: `ade_regex inválido é recusado em português`; `campo obrigatório fora do catálogo é recusado`; `dia_vencimento 31 é recusado`; `operador lê mas não edita convênio`; `vínculo duplicado no mesmo convênio é recusado`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): convênios configuráveis`.

---

### Task 6: Tabelas de cálculo, comissão e simulador (0005, 0006)

**Files:** Create `supabase/migrations/0005_tabelas_calculo.sql`, `supabase/migrations/0006_simulador.sql`, `tests/db/0005_tabelas_calculo.test.ts`, `tests/db/0006_simulador.test.ts`

**Interfaces:**
- Produces:
  - `create extension if not exists btree_gist`.
  - enum `public.tipo_contrato` = `novo`, `refinanciamento`, `compra`.
  - enum `public.base_comissao` = `liquido`, `bruto`.
  - `public.tabelas_calculo(id uuid pk, convenio_id fk, nome text not null, criado_em timestamptz)`.
  - `public.tabela_linhas(id uuid pk, tabela_id fk, convenio_id uuid not null (copiado da tabela por trigger), vinculo_id fk not null, tipo tipo_contrato not null, prazo int not null check > 0, faixa_valor int8range not null default '(,)' (centavos, inclusiva), faixa_idade int4range not null default '(,)' (anos, inclusiva), vigencia daterange not null (inclusiva no início, aberta = sem fim), fator numeric(12,8) not null check (fator > 0), valor_mensalidade numeric(14,2) check (>= 0))`.
    - Ranges normalizados para `[a,b]` inclusivos na entrada (função `public.faixa_centavos(min numeric, max numeric) returns int8range`; `null` = ilimitado).
    - `exclude using gist (convenio_id with =, vinculo_id with =, tipo with =, prazo with =, faixa_valor with &&, faixa_idade with &&, vigencia with &&)` → erro `23P01`.
    - `vinculo_id` deve pertencer ao `convenio_id` (trigger).
  - `public.tabela_linha_comissoes(linha_id uuid pk fk, percentual numeric(7,4) not null check 0..100, base base_comissao not null)`; check via trigger: `tipo = 'compra'` ⇒ `base = 'bruto'`, senão `base = 'liquido'`. (Separada da linha para permitir, no futuro, comissão por parceiro — pendente PROSESP.)
  - `public.simulacoes(id uuid pk, linha_id fk, entrada text check in ('valor','parcela'), valor numeric(14,2), parcela numeric(14,2), criado_por uuid, criado_em timestamptz)`.
  - Imutabilidade: trigger em `tabela_linhas` e `tabela_linha_comissoes` — se existe `simulacoes.linha_id = OLD.id`, só é permitido alterar `vigencia` para encerrar (novo upper ≥ hoje e nada mais mudou); qualquer outra edição ou delete → `'Esta linha de tabela já foi usada e não pode ser alterada. Encerre a vigência e crie uma nova.'`
  - `public.simular_por_valor(p_convenio_id uuid, p_vinculo_id uuid, p_tipo tipo_contrato, p_prazo int, p_valor numeric, p_data_nascimento date default null, p_data date default current_date, p_gravar boolean default false) returns table(linha_id uuid, fator numeric, valor numeric, parcela numeric, valor_mensalidade numeric, percentual_comissao numeric, base_comissao base_comissao, simulacao_id uuid)`
    - Seleciona a única linha vigente em `p_data` cujas faixas contêm `round(p_valor*100)` e a idade (anos completos em `p_data`; se a linha tem faixa de idade limitada e `p_data_nascimento` é null → `'Informe a data de nascimento para simular.'`).
    - `parcela = round(p_valor * fator, 2)` (uma única arredondada no fim).
  - `public.simular_por_parcela(... mesmos parâmetros, p_parcela numeric no lugar de p_valor ...)`
    - Para cada linha candidata (mesmas chaves, vigente, idade ok): `valor = floor(p_parcela / fator * 100) / 100`; mantém as linhas cuja `faixa_valor` contém o valor calculado; devolve a de **maior valor** (melhor para o cliente; decisão do builder registrada aqui).
  - Ambas: `app_exigir('simulador.usar')`; sem linha → `'Nenhuma tabela vigente atende esta simulação.'`; com `p_gravar` grava em `simulacoes` e devolve o id.
  - RLS: tabelas lidas com `convenios.ver` ou `simulador.usar`; escritas com `tabelas.editar`. Auditadas.

- [ ] **Step 1: Testes 0005:** `linhas sobrepostas no mesmo convênio são recusadas mesmo em tabelas diferentes`; `faixa 300–499,99 e 500–999,99 convivem`; `faixa ilimitada conflita com qualquer outra`; `fator zero é recusado`; `compra com base líquido é recusada`; `vínculo de outro convênio é recusado`; `linha usada não pode ser editada` (Review Focus 4); `linha usada pode ter a vigência encerrada`.
- [ ] **Step 2: Testes 0006** (fixture: fator `0.06120000`, faixas acima, prazo 24, vínculo Efetivo, Gov. Acre):
  - `R$ 1.000,00 gera parcela R$ 61,20`
  - `parcela R$ 61,20 gera valor R$ 1.000,00`
  - `parcela R$ 61,21 gera valor arredondado para baixo` → `1000.16` (61.21/0.0612 = 1000.1633…)
  - `R$ 499,99 e R$ 500,00 caem em linhas diferentes` (Review Focus 2)
  - `sem linha vigente devolve mensagem em português`
  - `faixa de idade exige data de nascimento`
  - `parceiro pode simular; anon não pode`
  - `p_gravar cria simulacao com a linha usada`
- [ ] **Step 3:** Rodar → FAIL. **Step 4:** Implementar 0005 e 0006. **Step 5:** Rodar → PASS.
- [ ] **Step 6:** Commit `feat(db): tabelas de cálculo e simulador`.

---

### Task 7: Clientes e tabelas filhas (0007_clientes)

**Files:** Create `supabase/migrations/0007_clientes.sql`, `tests/db/0007_clientes.test.ts`

**Interfaces:**
- Produces:
  - `public.so_digitos(text) returns text` (immutable); `public.cpf_valido(text) returns boolean` (immutable; 11 dígitos após `lpad`, não todos iguais, dígitos verificadores).
  - `public.clientes(id uuid pk, cpf char(11) unique not null check cpf_valido(cpf), nome text not null, celular text not null, whatsapp text not null, email text, data_nascimento date, rg text, rg_orgao text, nome_mae text, nome_pai text, estado_civil text check in ('solteiro','casado','divorciado','viuvo','uniao_estavel'), escolaridade text, pis text, cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf char(2), pep boolean, analfabeto boolean, conjuge_nome text, conjuge_cpf char(11), criado_por uuid, criado_em timestamptz, atualizado_em timestamptz)`.
    - Trigger `before insert or update`: `cpf := lpad(so_digitos(cpf), 11, '0')`; celular/whatsapp só dígitos, 10–11. CPF inválido → `'CPF inválido.'`; duplicado → capturado no front como `'Já existe um cliente com este CPF.'` (unique `clientes_cpf_key`).
  - `public.cliente_matriculas(id, cliente_id fk, convenio_id fk, vinculo_id fk, matricula text not null, orgao text, ativa bool, unique(convenio_id, matricula))` — `matricula` gravada sem zeros à esquerda em coluna gerada `matricula_normalizada`.
  - `public.cliente_contas(id, cliente_id fk, banco_id fk, agencia, conta, tipo_conta, chave_pix, tipo_chave_pix, principal bool)` + índice único parcial `(cliente_id) where principal` + RPC `public.definir_conta_principal_cliente(p_conta_id uuid)`.
  - `public.cliente_beneficiarios(id, cliente_id fk, nome text not null, cpf char(11) check cpf_valido, parentesco text, percentual numeric(5,2))`.
  - `public.cliente_historico(id bigint identity, cliente_id, campo text check in ('telefone','conta','matricula'), antes jsonb, depois jsonb, usuario_id uuid, em timestamptz)` — preenchido por triggers em `clientes` (celular/whatsapp), `cliente_contas` e `cliente_matriculas`.
  - RLS (equipe): ler com `clientes.ver`, escrever com `clientes.editar`. A regra do parceiro vem na Task 8. Todas auditadas.

- [ ] **Step 1:** Testes: `CPF com máscara e sem zero à esquerda vira o mesmo CPF e bate na unicidade` (Review Focus 1); `CPF com dígito errado é recusado em português`; `CPF 111.111.111-11 é recusado`; `celular é obrigatório`; `segunda conta principal troca a anterior` (Review Focus 5, via RPC) e `insert direto de segunda principal é recusado`; `troca de celular gera histórico`; `matrícula "000123" e "123" no mesmo convênio colidem`; `consulta lê e não edita cliente`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): clientes, matrículas, contas, beneficiários e histórico`.

---

### Task 8: Acesso do parceiro a clientes e alterações pendentes (0008_clientes_parceiro)

**Files:** Create `supabase/migrations/0008_clientes_parceiro.sql`, `tests/db/0008_clientes_parceiro.test.ts`

**Interfaces:**
- Produces:
  - `public.cliente_parceiros(cliente_id fk, parceiro_id fk, criado_em, pk(cliente_id, parceiro_id))` — vínculo que dá visibilidade. Na Etapa 1 nasce quando o parceiro cadastra o cliente ou o "adota" pela busca; na Etapa 2 também pela pré-digitação.
  - `public.parceiro_ve_cliente(p_cliente_id uuid) returns boolean` (stable, security definer) — `exists` em `cliente_parceiros` com `app_parceiro_id()`.
  - Policies adicionais para perfil parceiro em `clientes`, `cliente_matriculas`, `cliente_contas`, `cliente_beneficiarios` (e, na Task 9, `cliente_documentos`): select só se `parceiro_ve_cliente(cliente_id)`. **Parceiro não tem insert/update direto** em nenhuma delas — tudo por RPC.
  - `public.parceiro_buscar_cliente(p_cpf text, p_matricula text) returns table(cliente_id uuid, nome text, celular text, whatsapp text, email text, data_nascimento date, ... campos cadastrais ..., matriculas jsonb)` — exige parceiro; só devolve se existir cliente com o CPF **e** matrícula (normalizada) dele; sempre chama `registrar_acesso('parceiro_buscar_cliente', {cpf, encontrado})`; não encontrado → zero linhas (sem dizer se o CPF existe). Ao encontrar, **não** cria vínculo.
  - `public.parceiro_cadastrar_cliente(p_dados jsonb) returns uuid` — cria cliente + matrícula + vínculo; CPF já existente → `'Este CPF já está cadastrado. Use a busca por CPF e matrícula.'`
  - `public.parceiro_adotar_cliente(p_cpf text, p_matricula text) returns uuid` — mesma checagem da busca; cria o vínculo (substituído pela pré-digitação na Etapa 2).
  - `public.cliente_alteracoes_pendentes(id uuid pk, cliente_id fk, parceiro_id fk, tipo text check in ('dados','conta','matricula'), proposta jsonb not null, status text check in ('pendente','aprovada','recusada') default 'pendente', motivo text, criado_em, decidido_por uuid, decidido_em)`.
  - `public.parceiro_propor_alteracao(p_cliente_id uuid, p_tipo text, p_proposta jsonb) returns uuid` — exige `parceiro_ve_cliente`; só chaves permitidas por tipo.
  - `public.aprovar_alteracao(p_id uuid) returns void` / `public.recusar_alteracao(p_id uuid, p_motivo text) returns void` — exigem `clientes.aprovar_alteracoes`; aprovar aplica a proposta (gera histórico e auditoria); recusar exige motivo não vazio → `'Informe o motivo da recusa.'`

- [ ] **Step 1:** Testes:
  - `parceiro A não vê cliente do parceiro B nem por id direto` (clientes e cada tabela filha) (Review Focus 3)
  - `busca com CPF certo e matrícula errada não devolve nada e é auditada`
  - `busca com CPF e matrícula certos devolve os dados e não cria vínculo`
  - `adotar cria vínculo e passa a ver o cliente`
  - `parceiro não faz update direto em clientes`
  - `alteração proposta não muda o cadastro até ser aprovada`
  - `operador aprova e o cadastro muda com histórico`
  - `recusar sem motivo é recusado`
  - `parceiro cadastrando CPF existente recebe a mensagem de usar a busca`
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): acesso do parceiro e alterações pendentes`.

---

### Task 9: "O que falta" por convênio (0009_o_que_falta)

**Files:** Create `supabase/migrations/0009_o_que_falta.sql`, `tests/db/0009_o_que_falta.test.ts`

**Interfaces:**
- Consumes: `catalogo_campos_cliente()` (Task 5), tabelas da Task 7, `parceiro_ve_cliente` (Task 8). A tabela `cliente_documentos` nasce **aqui** (as chaves `doc_*` dependem dela); a Task 10 só acrescenta o Storage.
- Produces:
  - `public.cliente_documentos(id uuid pk, cliente_id fk, tipo text check in ('rg','comprovante_residencia','outro'), caminho text not null, nome_arquivo text, enviado_por uuid, enviado_em timestamptz)` com RLS de equipe (`clientes.ver`/`clientes.editar`) + regra do parceiro (Task 8 padrão).
  - `public.o_que_falta(p_cliente_id uuid, p_convenio_id uuid) returns table(chave text, rotulo text)` — sempre inclui a falta de matrícula ativa no convênio (`'matricula'`, `'Matrícula neste convênio'`); depois cada chave de `campos_obrigatorios` ausente. Rótulos em português (ex.: `doc_rg` → `'Documento: RG'`, `conta_principal` → `'Conta bancária principal'`). Respeita RLS de quem chama (security invoker).

- [ ] **Step 1:** Testes: `cliente só com cadastro rápido e convênio exigindo rg e conta_principal lista os dois`; `depois de preencher, lista vazia`; `sem matrícula no convênio aparece matrícula`; `doc_rg só some quando há documento tipo rg`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(db): o que falta no cadastro por convênio`.

---

### Task 10: Documentos no Storage, criação de usuários e primeiro administrador

**Files:**
- Create: `supabase/migrations/0010_storage_documentos.sql`, `tests/db/0010_storage.test.ts`, `supabase/functions/criar-usuario/index.ts`, `scripts/criar-admin.mjs`

**Interfaces:**
- Produces:
  - Bucket privado `documentos-clientes`; caminho `<cliente_id>/<uuid>-<nome>`. Policies em `storage.objects`: select/insert para equipe com `clientes.ver`/`clientes.editar`; parceiro só se `parceiro_ve_cliente((storage.foldername(name))[1]::uuid)`; nenhum delete para parceiro; nenhum acesso anon. Front usa `createSignedUrl(caminho, 60)` e chama `registrar_acesso('download_documento', …)`.
  - Edge Function `criar-usuario` (POST `{ nome, email, perfil, parceiro_id? }`): valida o JWT de quem chama, confere `app_pode('usuarios.gerenciar')` via RPC com o token do chamador, cria em `auth.admin.inviteUserByEmail` (com chave de serviço vinda de `Deno.env`) e insere `usuarios`. Resposta de erro sempre `{ erro: string }` em português.
  - `public.desativar_usuario(p_id uuid) returns void` — exige `usuarios.gerenciar`; não pode desativar a si mesmo → `'Você não pode desativar o seu próprio acesso.'`
  - `scripts/criar-admin.mjs <email> <nome>` — lê `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente (valores locais de `npx supabase status`, nunca gravados em arquivo), convida o e-mail e cria a linha `usuarios` com perfil `administrador`. O convite chega no Inbucket local (`http://127.0.0.1:54324`), onde o dono define a própria senha.

- [ ] **Step 1:** Testes de banco: `parceiro não lê objeto de cliente sem vínculo`; `anon não lê nenhum objeto`; `operador lê e envia`; `parceiro não apaga`; `desativar a si mesmo é recusado`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Verificação manual da Edge Function:** `npx supabase functions serve criar-usuario` e, com o token de um admin de teste, `curl` criando um operador → `200` e convite visível no Inbucket; com token de operador → `403` e `{ "erro": "Você não tem permissão para esta ação." }`.
- [ ] **Step 6:** Commit `feat: documentos privados, criação de usuários e primeiro admin`.

---

### Task 11: App React — base, login e navegação por permissão

**Files:**
- Create: `app/` (via `npm create vite@latest app -- --template react-ts`), `app/src/lib/supabase.ts`, `app/src/lib/erros.ts`, `app/src/lib/mascaras.ts`, `app/src/lib/permissoes.ts`, `app/src/features/auth/{LoginPage,RedefinirSenhaPage,useSessao}.tsx`, `app/src/AppLayout.tsx`, testes `*.test.ts(x)` ao lado.
- Modify: `vitest.config.ts` (adicionar projeto `app` com jsdom), `package.json` raiz (`test` roda os dois).

**Interfaces:**
- Produces:
  - `supabase` client lendo `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
  - `mensagemErro(e: unknown): string` — `23505` + `clientes_cpf_key` → `'Já existe um cliente com este CPF.'`; outro `23505` → `'Este registro já existe.'`; `23P01` → `'Já existe uma linha de tabela que atende este mesmo caso.'`; `42501` → `'Você não tem permissão para esta ação.'`; `P0001` → a própria mensagem; rede → `'Sem conexão com o servidor. Tente de novo.'`; resto → `'Algo deu errado. Tente de novo ou fale com o administrador.'`
  - `mascaras.ts`: `formatarReais(n: number|string): string` ("R$ 1.234,56"), `lerReais(s: string): string` (decimal com ponto, 2 casas, sem float), `formatarCpf`, `formatarCelular`, `soDigitos`, `cpfValido` (mesma regra do banco).
  - Após login bem-sucedido, `LoginPage` chama `registrar_acesso('login', {})`.
  - `usePermissoes(): { perfil: Perfil|null, pode(chave: string): boolean, parceiroId: string|null }` — lê `usuarios` + `perfil_permissoes`.
  - Rotas: `/login`, `/redefinir-senha`, e dentro do layout: `/convenios`, `/tabelas`, `/simulador`, `/clientes`, `/parceiros`, `/apoio`, `/usuarios`, `/permissoes`, `/aprovacoes`, `/auditoria`, `/parceiro/clientes`. Menu mostra só o que `pode()`.

- [ ] **Step 1:** Testes: `formatarReais(1234.5) = "R$ 1.234,50"`; `lerReais("1.234,56") = "1234.56"`; `lerReais("abc")` lança `'Valor inválido.'`; `cpfValido("012.345.678-90")` igual ao banco para 5 CPFs fixos; `mensagemErro` para cada código acima; `LoginPage mostra "E-mail ou senha incorretos." quando o login falha`; `menu de consulta não mostra Usuários`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implementar. **Step 4:** `npm test` e `cd app && npx tsc -b` → PASS.
- [ ] **Step 5:** Commit `feat(app): base, login e menu por permissão`.

---

### Task 12: Telas de cadastros de apoio, usuários e permissões

**Files:** `app/src/features/apoio/*`, `app/src/features/parceiros/*`, `app/src/features/usuarios/*` (+ testes)

**Interfaces:**
- Consumes: tabelas das Tasks 2–4, RPC `definir_conta_principal`, Edge Function `criar-usuario`, `desativar_usuario`.
- Produces: `ParceirosPage` (lista, formulário com contas/PIX/agentes, marca "recebe mensalidades"), `ApoioPage` (bancos, origens), `UsuariosPage` (convidar, desativar), `PermissoesPage` (grade perfil × permissão; checkbox do parceiro desabilitado fora do teto).

- [ ] **Step 1:** Testes: `PermissoesPage desabilita apoio.editar na coluna parceiro`; `ParceiroForm recusa documento inválido antes de enviar`; `UsuariosPage mostra a mensagem do servidor quando o convite falha`.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npm test`, `npx tsc -b`).
- [ ] **Step 5:** Commit `feat(app): parceiros, apoio, usuários e permissões`.

---

### Task 13: Telas de convênios, tabelas e simulador

**Files:** `app/src/features/convenios/*`, `app/src/features/tabelas/*`, `app/src/features/simulador/*` (+ testes)

**Interfaces:**
- Consumes: Tasks 5–6 (`simular_por_valor`, `simular_por_parcela`).
- Produces: `ConveniosPage` (configuração completa, vínculos, campos obrigatórios por checkboxes do catálogo, modo do ADE), `TabelasPage` (tabelas e linhas; faixas digitadas em R$ com máscara; encerrar vigência), `SimuladorPage` (alterna "tenho o valor" / "tenho a parcela"; mostra fator, parcela, valor, mensalidade e comissão).

- [ ] **Step 1:** Testes: `SimuladorPage envia valor "1.234,56" como "1234.56"`; `SimuladorPage mostra "Nenhuma tabela vigente atende esta simulação."`; `TabelasPage mostra a mensagem de sobreposição`; `TabelasPage oferece só "Encerrar vigência" para linha usada`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(app): convênios, tabelas e simulador`.

---

### Task 14: Telas de clientes, portal do parceiro e aprovações

**Files:** `app/src/features/clientes/*`, `app/src/features/parceiro/*`, `app/src/features/aprovacoes/*`, `app/src/features/auditoria/*` (+ testes)

**Interfaces:**
- Consumes: Tasks 7–10.
- Produces:
  - `ClienteRapidoForm` (nome, CPF, celular, WhatsApp, convênio, vínculo, matrícula) e `ClienteDetalhePage` com abas: Cadastro completo, Matrículas, Contas, Beneficiários, Documentos (upload/download assinado), Histórico, e o quadro **"O que falta"** por convênio.
  - Portal do parceiro: `/parceiro/clientes` com busca por **CPF + matrícula**, "Cadastrar novo", e edição que gera **alteração pendente** (aviso: "Sua alteração será conferida pela equipe PROSESP.").
  - `/aprovacoes`: fila de alterações pendentes com antes × depois, aprovar / recusar com motivo.
  - `/auditoria`: lista filtrável (tabela, usuário, período) só leitura.

- [ ] **Step 1:** Testes: `ClienteRapidoForm mostra "Já existe um cliente com este CPF."`; `quadro O que falta lista os rótulos do servidor`; `portal do parceiro não mostra botão de salvar direto, só "Enviar para conferência"`; `recusar sem motivo mostra "Informe o motivo da recusa."`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(app): clientes, portal do parceiro e aprovações`.

---

### Task 15: Revisão da etapa e entrega

- [ ] **Step 1:** `npm run db:reset && npm test && cd app && npx tsc -b` → tudo PASS (guardar a saída).
- [ ] **Step 2:** Rodar `/code-review` sobre a etapa e corrigir os problemas reais (com teste quando for bug).
- [ ] **Step 3:** Rodar `/security-review` com foco em RLS, funções `security definer`, Storage, vazamento de dados pessoais, chaves e o teto do parceiro; corrigir.
- [ ] **Step 4:** Segundo olhar do Codex (somente leitura) sobre `supabase/migrations` e `supabase/functions`.
- [ ] **Step 5:** Rodar o app (`npm run dev` em `app/`), criar o primeiro admin com `scripts/criar-admin.mjs`, e percorrer: cadastrar convênio + tabela, simular, cadastrar cliente, logar como parceiro, buscar por CPF+matrícula, propor alteração, aprovar como operador.
- [ ] **Step 6:** Commit das correções e entregar ao dono a lista simples: o que foi achado, o que foi corrigido, o que ficou pendente. Nada de `push`.
