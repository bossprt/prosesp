import { useEffect, useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Convenio = Database['public']['Tables']['convenios']['Row'];
type Chave = 'assinatura_selfie' | 'assinatura_documento' | 'assinatura_codigo' | 'assinatura_email' | 'assinatura_whatsapp';

const OPCOES: { chave: Chave; rotulo: string }[] = [
  { chave: 'assinatura_selfie', rotulo: 'Pedir selfie do cliente' },
  { chave: 'assinatura_documento', rotulo: 'Pedir foto do documento' },
  { chave: 'assinatura_codigo', rotulo: 'Pedir código por WhatsApp/SMS' },
  { chave: 'assinatura_email', rotulo: 'Mandar o link por e-mail' },
  { chave: 'assinatura_whatsapp', rotulo: 'Mandar o link por WhatsApp' },
];

/** Prazo, exigências, canais e assinantes extras da assinatura no convênio. */
export function AssinaturaConfig({ convenio, podeEditar }: { convenio: Convenio; podeEditar: boolean }) {
  const [f, setF] = useState(convenio);
  useEffect(() => setF(convenio), [convenio]);
  const [ok, setOk] = useState('');
  const salvar = useAcao(
    () =>
      exigir(supabase.from('convenios').update({
        assinatura_prazo_dias: Number(f.assinatura_prazo_dias),
        ...Object.fromEntries(OPCOES.map((o) => [o.chave, f[o.chave]])),
      }).eq('id', convenio.id)),
    [['convenios']],
  );
  const assinantes = useConsulta(['convenio-assinantes', convenio.id], async () =>
    (await exigir(supabase.from('convenio_assinantes').select('*').eq('convenio_id', convenio.id).order('ordem'))) ?? [],
  );
  const [novo, setNovo] = useState({ nome: '', papel: '', email: '', celular: '' });
  const adicionar = useAcao(
    () =>
      exigir(supabase.from('convenio_assinantes').insert({
        convenio_id: convenio.id, nome: novo.nome.trim(), papel: novo.papel.trim(),
        email: novo.email.trim() || null, celular: novo.celular.replace(/\D/g, '') || null,
        ordem: (assinantes.data?.length ?? 0) + 1,
      })),
    [['convenio-assinantes', convenio.id]],
  );
  const alternar = useAcao(
    ({ id, ativo }: { id: string; ativo: boolean }) => exigir(supabase.from('convenio_assinantes').update({ ativo }).eq('id', id)),
    [['convenio-assinantes', convenio.id]],
  );

  function enviar(e: FormEvent) {
    e.preventDefault();
    setOk('');
    salvar.mutate(undefined, { onSuccess: () => setOk('Configuração da assinatura salva.') });
  }

  return (
    <div className="space-y-3">
      <h2 className="font-medium">Assinatura eletrônica</h2>
      <form onSubmit={enviar} className="grid gap-2 rounded border border-slate-200 bg-white p-3 sm:grid-cols-2">
        <Campo
          rotulo="Prazo para assinar (dias)"
          inputMode="numeric"
          disabled={!podeEditar}
          value={String(f.assinatura_prazo_dias ?? '')}
          onChange={(e) => setF({ ...f, assinatura_prazo_dias: Number(e.target.value.replace(/\D/g, '')) || 0 })}
        />
        <div className="space-y-1">
          {OPCOES.map((o) => (
            <label key={o.chave} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!podeEditar} checked={Boolean(f[o.chave])}
                onChange={(e) => setF({ ...f, [o.chave]: e.target.checked })} />
              {o.rotulo}
            </label>
          ))}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Aviso>{salvar.erro}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          {podeEditar && <Botao type="submit">Salvar assinatura</Botao>}
        </div>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quem assina além do cliente</p>
        {(assinantes.data ?? []).length === 0 && <p className="text-sm text-slate-500">Só o cliente assina.</p>}
        <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white text-sm">
          {(assinantes.data ?? []).map((a) => (
            <li key={a.id} className={`flex items-center justify-between px-3 py-2 ${a.ativo ? '' : 'text-slate-400'}`}>
              <span>{a.nome} · {a.papel} · {a.email ?? a.celular}</span>
              {podeEditar && (
                <Botao variante="secundario" onClick={() => alternar.mutate({ id: a.id, ativo: !a.ativo })}>
                  {a.ativo ? 'Desativar' : 'Ativar'}
                </Botao>
              )}
            </li>
          ))}
        </ul>
        <Aviso>{adicionar.erro || alternar.erro}</Aviso>
        {podeEditar && (
          <form
            className="grid gap-2 sm:grid-cols-5 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              adicionar.mutate(undefined, { onSuccess: () => setNovo({ nome: '', papel: '', email: '', celular: '' }) });
            }}
          >
            <Campo rotulo="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <Campo rotulo="Papel (ex.: testemunha)" value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })} />
            <Campo rotulo="E-mail" type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
            <Campo rotulo="Celular" inputMode="tel" value={novo.celular} onChange={(e) => setNovo({ ...novo, celular: e.target.value })} />
            <Botao type="submit" disabled={!novo.nome.trim() || !novo.papel.trim() || (!novo.email.trim() && !novo.celular.trim())}>
              Adicionar
            </Botao>
          </form>
        )}
      </div>
    </div>
  );
}
