// Transforma o texto do modelo de contrato (com {campos}) em blocos prontos para o PDF.
// Marcação: "# " título, "## " subtítulo, "- " item, linha em branco separa parágrafos, **negrito**,
// {se condição} … {fim} só aparece quando a condição vale, {parcelas.tabela} sozinho na linha vira a tabela.

export interface Parcela {
  numero: number;
  competencia: string;
  vencimento: string;
  valor: string;
}

export interface DadosDocumento {
  campos: Record<string, string>;
  condicoes: Record<string, boolean>;
  parcelas: Parcela[];
}

export interface Parte {
  texto: string;
  negrito: boolean;
}

export type Bloco =
  | { tipo: 'titulo' | 'subtitulo' | 'paragrafo' | 'item'; partes: Parte[] }
  | { tipo: 'parcelas'; linhas: Parcela[] };

function partes(linha: string, dados: DadosDocumento): Parte[] {
  const texto = linha.replace(/\{([^{}]+)\}/g, (_, chave: string) => dados.campos[chave.trim()] ?? '');
  return texto
    .split('**')
    .map((t, i) => ({ texto: t, negrito: i % 2 === 1 }))
    .filter((p) => p.texto !== '');
}

export function renderizarModelo(texto: string, dados: DadosDocumento): Bloco[] {
  const semCondicoes = texto
    .replace(/\r\n?/g, '\n')
    .replace(/\{\s*se\s+([^{}]+?)\s*\}([\s\S]*?)\{\s*fim\s*\}/g, (_, cond: string, miolo: string) =>
      dados.condicoes[cond.trim()] ? miolo : '');

  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) {
      const p = partes(paragrafo.join(' '), dados);
      if (p.length) blocos.push({ tipo: 'paragrafo', partes: p });
    }
    paragrafo = [];
  };
  const linhaEspecial = (tipo: 'titulo' | 'subtitulo' | 'item', resto: string) => {
    fecharParagrafo();
    const p = partes(resto.trim(), dados);
    if (p.length) blocos.push({ tipo, partes: p });
  };

  for (const bruta of semCondicoes.split('\n')) {
    const linha = bruta.trim();
    if (linha === '') fecharParagrafo();
    else if (/^\{\s*parcelas\.tabela\s*\}$/.test(linha)) {
      fecharParagrafo();
      blocos.push({ tipo: 'parcelas', linhas: dados.parcelas });
    } else if (linha.startsWith('## ')) linhaEspecial('subtitulo', linha.slice(3));
    else if (linha.startsWith('# ')) linhaEspecial('titulo', linha.slice(2));
    else if (linha.startsWith('- ')) linhaEspecial('item', linha.slice(2));
    else paragrafo.push(linha);
  }
  fecharParagrafo();
  return blocos;
}
