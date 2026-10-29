import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Selecao } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';
import { cpfValido, soDigitos } from '../../lib/mascaras';

// Campos do cadastro completo (os mesmos que o parceiro pode propor; nome e CPF ficam fora).
const CAMPOS: { chave: string; rotulo: string; tipo?: string }[] = [
  { chave: 'celular', rotulo: 'Celular' },
  { chave: 'whatsapp', rotulo: 'WhatsApp' },
  { chave: 'email', rotulo: 'E-mail', tipo: 'email' },
  { chave: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'date' },
  { chave: 'rg', rotulo: 'RG' },
  { chave: 'rg_orgao', rotulo: 'Órgão emissor do RG' },
  { chave: 'nome_mae', rotulo: 'Nome da mãe' },
  { chave: 'nome_pai', rotulo: 'Nome do pai' },
  { chave: 'escolaridade', rotulo: 'Escolaridade' },
  { chave: 'pis', rotulo: 'PIS' },
  { chave: 'cep', rotulo: 'CEP' },
  { chave: 'logradouro', rotulo: 'Logradouro' },
  { chave: 'numero', rotulo: 'Número' },
  { chave: 'complemento', rotulo: 'Complemento' },
  { chave: 'bairro', rotulo: 'Bairro' },
  { chave: 'cidade', rotulo: 'Cidade' },
  { chave: 'uf', rotulo: 'UF' },
  { chave: 'conjuge_nome', rotulo: 'Nome do cônjuge' },
  { chave: 'conjuge_cpf', rotulo: 'CPF do cônjuge' },
];

const ESTADOS_CIVIS = [
  { valor: 'solteiro', rotulo: 'Solteiro(a)' },
  { valor: 'casado', rotulo: 'Casado(a)' },
  { valor: 'uniao_estavel', rotulo: 'União estável' },
  { valor: 'divorciado', rotulo: 'Divorciado(a)' },
  { valor: 'viuvo', rotulo: 'Viúvo(a)' },
];
const SIM_NAO = [
  { valor: 'true', rotulo: 'Sim' },
  { valor: 'false', rotulo: 'Não' },
];

type Valor = string | boolean | null | undefined;
export type DadosCliente = Record<string, Valor>;

interface Props {
  cliente: DadosCliente;
  /** "direto" grava na hora (equipe); "proposta" envia para conferência (parceiro). */
  modo: 'direto' | 'proposta';
  onEnviar: (mudancas: DadosCliente) => Promise<unknown>;
}

const paraTexto = (v: Valor) => (v === null || v === undefined ? '' : String(v));

function normalizar(chave: string, texto: string): Valor {
  if (texto.trim() === '') return null;
  if (chave === 'pep' || chave === 'analfabeto') return texto === 'true';
  if (['celular', 'whatsapp', 'cep', 'conjuge_cpf', 'pis'].includes(chave)) return soDigitos(texto);
  if (chave === 'uf') return texto.trim().toUpperCase();
  return texto.trim();
}

export function ClienteDadosForm({ cliente, modo, onEnviar }: Props) {
  const chaves = [...CAMPOS.map((c) => c.chave), 'estado_civil', 'pep', 'analfabeto'];
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(chaves.map((k) => [k, paraTexto(cliente[k])])));
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const campo = (k: string) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    const mudancas: DadosCliente = {};
    for (const k of chaves) {
      const novo = normalizar(k, f[k]);
      const antigo = cliente[k] === undefined ? null : cliente[k];
      if (paraTexto(novo) !== paraTexto(antigo)) mudancas[k] = novo;
    }
    if (Object.keys(mudancas).length === 0) return setErro('Nada foi alterado.');
    if ('celular' in mudancas && paraTexto(mudancas.celular).length < 10) return setErro('Celular precisa de DDD e número.');
    if ('whatsapp' in mudancas && paraTexto(mudancas.whatsapp).length < 10) return setErro('WhatsApp precisa de DDD e número.');
    if (mudancas.conjuge_cpf && !cpfValido(String(mudancas.conjuge_cpf))) return setErro('CPF do cônjuge inválido.');
    try {
      await onEnviar(mudancas);
      setOk(modo === 'proposta' ? 'Alteração enviada para conferência.' : 'Cadastro salvo.');
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-3">
      {modo === 'proposta' && (
        <div className="sm:col-span-3">
          <Aviso tipo="info">Sua alteração será conferida pela equipe PROSESP.</Aviso>
        </div>
      )}
      {CAMPOS.map((c) => (
        <Campo key={c.chave} rotulo={c.rotulo} type={c.tipo ?? 'text'} {...campo(c.chave)} />
      ))}
      <Selecao rotulo="Estado civil" opcoes={ESTADOS_CIVIS} {...campo('estado_civil')} />
      <Selecao rotulo="Pessoa exposta politicamente" vazio="Não informado" opcoes={SIM_NAO} {...campo('pep')} />
      <Selecao rotulo="Analfabeto" vazio="Não informado" opcoes={SIM_NAO} {...campo('analfabeto')} />
      <div className="space-y-2 sm:col-span-3">
        <Aviso>{erro}</Aviso>
        <Aviso tipo="ok">{ok}</Aviso>
        <Botao type="submit">{modo === 'proposta' ? 'Enviar para conferência' : 'Salvar'}</Botao>
      </div>
    </form>
  );
}
