import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Selecao } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';
import { cpfValido, soDigitos } from '../../lib/mascaras';
import type { ConvenioOpcao } from '../simulador/SimuladorForm';

export interface DadosClienteRapido {
  nome: string;
  cpf: string;
  celular: string;
  whatsapp: string;
  convenio_id: string;
  vinculo_id: string;
  matricula: string;
}

interface Props {
  convenios: ConvenioOpcao[];
  onSalvar: (d: DadosClienteRapido) => Promise<unknown>;
  inicial?: Partial<DadosClienteRapido>;
}

export function ClienteRapidoForm({ convenios, onSalvar, inicial }: Props) {
  const [f, setF] = useState<DadosClienteRapido>({
    nome: '', cpf: '', celular: '', whatsapp: '', convenio_id: '', vinculo_id: '', matricula: '', ...inicial,
  });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo = (k: keyof DadosClienteRapido) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
  });
  const vinculos = convenios.find((c) => c.id === f.convenio_id)?.vinculos ?? [];

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!cpfValido(f.cpf)) return setErro('CPF inválido.');
    if (!f.nome.trim()) return setErro('Informe o nome.');
    const celular = soDigitos(f.celular);
    const whatsapp = soDigitos(f.whatsapp);
    if (celular.length < 10 || whatsapp.length < 10) return setErro('Celular e WhatsApp são obrigatórios, com DDD.');
    if (!f.convenio_id || !f.vinculo_id || !f.matricula.trim()) return setErro('Informe convênio, vínculo e matrícula.');
    setEnviando(true);
    try {
      await onSalvar({
        ...f,
        nome: f.nome.trim(),
        cpf: soDigitos(f.cpf).padStart(11, '0'),
        celular,
        whatsapp,
        matricula: f.matricula.trim(),
      });
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Campo rotulo="Nome" {...campo('nome')} />
      <Campo rotulo="CPF" inputMode="numeric" {...campo('cpf')} />
      <Campo rotulo="Celular" inputMode="tel" {...campo('celular')} />
      <Campo rotulo="WhatsApp" inputMode="tel" {...campo('whatsapp')} />
      <Selecao
        rotulo="Convênio"
        value={f.convenio_id}
        onChange={(e) => setF({ ...f, convenio_id: e.target.value, vinculo_id: '' })}
        opcoes={convenios.map((c) => ({ valor: c.id, rotulo: c.nome }))}
      />
      <Selecao rotulo="Vínculo" {...campo('vinculo_id')} opcoes={vinculos.map((v) => ({ valor: v.id, rotulo: v.nome }))} />
      <Campo rotulo="Matrícula" {...campo('matricula')} />
      <div className="space-y-2 sm:col-span-2">
        <Aviso>{erro}</Aviso>
        <Botao type="submit" disabled={enviando}>
          Cadastrar cliente
        </Botao>
      </div>
    </form>
  );
}
