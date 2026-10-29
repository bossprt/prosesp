import { Aviso, Pagina } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { AlteracaoCard, type AlteracaoView } from './AlteracaoCard';

export function AprovacoesPage() {
  const lista = useConsulta(['aprovacoes'], async (): Promise<AlteracaoView[]> => {
    const dados =
      (await exigir(
        supabase
          .from('cliente_alteracoes_pendentes')
          .select('id, tipo, proposta, criado_em, clientes(*), parceiros(nome)')
          .eq('status', 'pendente')
          .order('criado_em'),
      )) ?? [];
    return dados.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      proposta: (a.proposta ?? {}) as Record<string, unknown>,
      atual: (a.clientes ?? {}) as Record<string, unknown>,
      cliente: a.clientes?.nome ?? '',
      parceiro: a.parceiros?.nome ?? '',
      criado_em: a.criado_em,
    }));
  });
  const aprovar = useAcao((id: string) => exigir(supabase.rpc('aprovar_alteracao', { p_id: id })), [['aprovacoes']]);
  const recusar = useAcao(
    ({ id, motivo }: { id: string; motivo: string }) => exigir(supabase.rpc('recusar_alteracao', { p_id: id, p_motivo: motivo })),
    [['aprovacoes']],
  );

  return (
    <Pagina titulo="Alterações enviadas por parceiros">
      <Aviso>{aprovar.erro || recusar.erro}</Aviso>
      {lista.data?.length === 0 && <Aviso tipo="info">Nada aguardando conferência.</Aviso>}
      {(lista.data ?? []).map((a) => (
        <AlteracaoCard
          key={a.id}
          alteracao={a}
          onAprovar={(id) => aprovar.mutate(id)}
          onRecusar={(id, motivo) => recusar.mutate({ id, motivo })}
        />
      ))}
    </Pagina>
  );
}
