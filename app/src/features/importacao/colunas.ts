/** Planilha modelo PROSESP: fonte única do modelo gerado e da leitura. */

export type AbaChave = 'clientes' | 'matriculas' | 'contratos' | 'quitacoes' | 'dividas' | 'parcelas' | 'mensalidades';
export type TipoColuna = 'texto' | 'data' | 'competencia' | 'dinheiro' | 'inteiro';

export interface Coluna {
  chave: string;
  titulo: string;
  obrigatoria: boolean;
  tipo: TipoColuna;
  exemplo: string;
}

export interface Aba {
  chave: AbaChave;
  nome: string;
  /** A aba precisa existir no arquivo (pode estar vazia). */
  obrigatoria: boolean;
  colunas: Coluna[];
}

export type LinhaImp = { linha: number } & Record<string, string | number | null>;
export type DadosImportacao = { posicao: string | null } & Record<AbaChave, LinhaImp[]>;
export interface ErroLinha {
  aba: string;
  linha: number;
  mensagem: string;
}

const c = (chave: string, titulo: string, obrigatoria: boolean, tipo: TipoColuna, exemplo: string): Coluna => ({
  chave, titulo, obrigatoria, tipo, exemplo,
});

export const ABAS: Aba[] = [
  {
    chave: 'clientes', nome: 'Clientes', obrigatoria: true,
    colunas: [
      c('cpf', 'CPF', true, 'texto', '529.982.247-25'),
      c('nome', 'Nome', true, 'texto', 'Maria da Silva'),
      c('celular', 'Celular', true, 'texto', '(68) 99999-0000'),
      c('whatsapp', 'WhatsApp', false, 'texto', 'Se vazio, usa o celular'),
      c('data_nascimento', 'Data de nascimento', false, 'data', '10/05/1980'),
      c('email', 'E-mail', false, 'texto', 'maria@email.com'),
      c('rg', 'RG', false, 'texto', '123456'),
      c('nome_mae', 'Nome da mãe', false, 'texto', 'Ana da Silva'),
      c('cep', 'CEP', false, 'texto', '69900-000'),
      c('logradouro', 'Logradouro', false, 'texto', 'Rua A'),
      c('numero', 'Número', false, 'texto', '10'),
      c('complemento', 'Complemento', false, 'texto', 'Casa'),
      c('bairro', 'Bairro', false, 'texto', 'Centro'),
      c('cidade', 'Cidade', false, 'texto', 'Rio Branco'),
      c('uf', 'UF', false, 'texto', 'AC'),
    ],
  },
  {
    chave: 'matriculas', nome: 'Matrículas', obrigatoria: true,
    colunas: [
      c('cpf', 'CPF', true, 'texto', '529.982.247-25'),
      c('convenio', 'Convênio', true, 'texto', 'Governo do Acre'),
      c('vinculo', 'Vínculo', true, 'texto', 'Efetivo'),
      c('matricula', 'Matrícula', true, 'texto', '123456'),
      c('orgao', 'Órgão', false, 'texto', 'SEE'),
    ],
  },
  {
    chave: 'contratos', nome: 'Contratos', obrigatoria: true,
    colunas: [
      c('numero_antigo', 'Nº contrato antigo', true, 'texto', '4521'),
      c('cpf', 'CPF', true, 'texto', '529.982.247-25'),
      c('convenio', 'Convênio', true, 'texto', 'Governo do Acre'),
      c('matricula', 'Matrícula', true, 'texto', '123456'),
      c('tipo', 'Tipo', true, 'texto', 'novo, refinanciamento ou compra'),
      c('prazo', 'Prazo', true, 'inteiro', '24'),
      c('valor_parcela', 'Valor da parcela', true, 'dinheiro', '122,40'),
      c('valor_bruto', 'Valor bruto', true, 'dinheiro', '2.000,00'),
      c('valor_liquido', 'Valor líquido', false, 'dinheiro', '1.900,00'),
      c('data_liberacao', 'Data da liberação', true, 'data', '10/05/2024'),
      c('primeira_competencia', 'Primeira competência', true, 'competencia', '06/2024'),
      c('parcelas_pagas', 'Parcelas pagas', true, 'inteiro', '5 (quantidade na data da posição)'),
      c('situacao', 'Situação', true, 'texto', 'ativo, em atraso, quitado, renovado, cancelado ou prejuízo'),
      c('ade', 'ADE', false, 'texto', '998877'),
      c('parceiro', 'Parceiro', false, 'texto', 'Nome do parceiro cadastrado'),
    ],
  },
  {
    chave: 'quitacoes', nome: 'Quitações', obrigatoria: false,
    colunas: [
      c('numero_novo', 'Nº contrato novo', true, 'texto', '4521'),
      c('numero_quitado', 'Nº contrato quitado', true, 'texto', '3100'),
      c('saldo', 'Saldo quitado', true, 'dinheiro', '500,00'),
    ],
  },
  {
    chave: 'dividas', nome: 'Dívidas compradas', obrigatoria: false,
    colunas: [
      c('numero_antigo', 'Nº contrato antigo', true, 'texto', '4521'),
      c('credor', 'Credor', true, 'texto', 'Banco X'),
      c('saldo', 'Saldo', true, 'dinheiro', '800,00'),
      c('numero_externo', 'Nº do contrato no outro banco', false, 'texto', '77-1'),
    ],
  },
  {
    chave: 'parcelas', nome: 'Parcelas', obrigatoria: false,
    colunas: [
      c('numero_antigo', 'Nº contrato antigo', true, 'texto', '4521'),
      c('numero', 'Nº da parcela', true, 'inteiro', '1'),
      c('competencia', 'Competência', true, 'competencia', '06/2024'),
      c('valor', 'Valor', true, 'dinheiro', '122,40'),
      c('situacao', 'Situação', true, 'texto', 'paga, aberta, atrasada ou cancelada'),
    ],
  },
  {
    chave: 'mensalidades', nome: 'Mensalidades', obrigatoria: true,
    colunas: [
      c('cpf', 'CPF', true, 'texto', '529.982.247-25'),
      c('convenio', 'Convênio', true, 'texto', 'Governo do Acre'),
      c('matricula', 'Matrícula', true, 'texto', '123456'),
      c('valor', 'Valor', true, 'dinheiro', '35,00'),
      c('vigente_desde', 'Vigente desde', true, 'competencia', '06/2024'),
      c('situacao', 'Situação', true, 'texto', 'ativa ou cancelada'),
      c('ade', 'ADE', false, 'texto', '998878'),
    ],
  },
];

export const ABA_INSTRUCOES = 'Instruções';
export const ROTULO_POSICAO = 'Data da posição';
