import { useState } from 'react';
import type { Json, Tables } from '../../lib/database.types';
import { exigir, useAcao } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { EditorLayouts } from '../retorno/EditorLayouts';

/** Seção "Retorno e remessa" da página do convênio. */
export function RetornoRemessaConfig({ convenio, podeEditar }: { convenio: Tables<'convenios'>; podeEditar: boolean }) {
  const [ok, setOk] = useState('');
  const salvar = useAcao(
    ({ ret, rem }: { ret: unknown; rem: unknown }) =>
      exigir(supabase.from('convenios').update({ layout_retorno: ret as Json, layout_remessa: rem as Json }).eq('id', convenio.id)),
    [['convenios']],
  );
  return (
    <div className="lg:col-span-3">
      <EditorLayouts
        layoutRetorno={convenio.layout_retorno}
        layoutRemessa={convenio.layout_remessa}
        podeEditar={podeEditar}
        erro={salvar.erro}
        ok={ok}
        salvando={salvar.isPending}
        onSalvar={(ret, rem) => {
          setOk('');
          salvar.mutate({ ret, rem }, { onSuccess: () => setOk('Layouts de retorno e remessa salvos.') });
        }}
      />
    </div>
  );
}
