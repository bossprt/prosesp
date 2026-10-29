import { useState } from 'react';
import { Aviso, Botao, Campo, Pagina, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';

export function ApoioPage() {
  const bancos = useConsulta(['bancos'], () => exigir(supabase.from('bancos').select('*').order('codigo')));
  const origens = useConsulta(['origens'], () => exigir(supabase.from('origens').select('*').order('nome')));
  const novoBanco = useAcao(
    (b: { codigo: string; nome: string }) => exigir(supabase.from('bancos').insert(b)),
    [['bancos']],
  );
  const novaOrigem = useAcao((nome: string) => exigir(supabase.from('origens').insert({ nome })), [['origens']]);
  const alternar = useAcao(
    ({ tabela, id, ativo }: { tabela: 'bancos' | 'origens'; id: string; ativo: boolean }) =>
      exigir(supabase.from(tabela).update({ ativo }).eq('id', id)),
    [['bancos'], ['origens']],
  );
  const [codigo, setCodigo] = useState('');
  const [nomeBanco, setNomeBanco] = useState('');
  const [origem, setOrigem] = useState('');

  return (
    <Pagina titulo="Bancos e origens">
      <Aviso>{novoBanco.erro || novaOrigem.erro || alternar.erro}</Aviso>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-medium">Bancos</h2>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              novoBanco.mutate(
                { codigo: codigo.trim(), nome: nomeBanco.trim() },
                { onSuccess: () => (setCodigo(''), setNomeBanco('')) },
              );
            }}
          >
            <Campo rotulo="Código" value={codigo} maxLength={3} onChange={(e) => setCodigo(e.target.value)} className="w-20" />
            <Campo rotulo="Nome do banco" value={nomeBanco} onChange={(e) => setNomeBanco(e.target.value)} className="flex-1" />
            <Botao type="submit" disabled={!/^\d{3}$/.test(codigo) || !nomeBanco.trim()}>
              Adicionar
            </Botao>
          </form>
          <Tabela colunas={['Código', 'Nome', '']}>
            {(bancos.data ?? []).map((b) => (
              <tr key={b.id} className={b.ativo ? '' : 'text-slate-400'}>
                <td className="px-3 py-2">{b.codigo}</td>
                <td className="px-3 py-2">{b.nome}</td>
                <td className="px-3 py-2 text-right">
                  <Botao variante="secundario" onClick={() => alternar.mutate({ tabela: 'bancos', id: b.id, ativo: !b.ativo })}>
                    {b.ativo ? 'Desativar' : 'Ativar'}
                  </Botao>
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
        <div className="space-y-2">
          <h2 className="font-medium">Origens do contrato</h2>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              novaOrigem.mutate(origem.trim(), { onSuccess: () => setOrigem('') });
            }}
          >
            <Campo rotulo="Nova origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className="flex-1" />
            <Botao type="submit" disabled={!origem.trim()}>
              Adicionar
            </Botao>
          </form>
          <Tabela colunas={['Origem', '']}>
            {(origens.data ?? []).map((o) => (
              <tr key={o.id} className={o.ativo ? '' : 'text-slate-400'}>
                <td className="px-3 py-2">{o.nome}</td>
                <td className="px-3 py-2 text-right">
                  <Botao variante="secundario" onClick={() => alternar.mutate({ tabela: 'origens', id: o.id, ativo: !o.ativo })}>
                    {o.ativo ? 'Desativar' : 'Ativar'}
                  </Botao>
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      </div>
    </Pagina>
  );
}
