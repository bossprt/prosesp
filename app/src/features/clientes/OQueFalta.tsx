export function OQueFalta({ itens }: { itens: { chave: string; rotulo: string }[] }) {
  if (itens.length === 0) {
    return <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">Cadastro completo para este convênio.</p>;
  }
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">Falta para gerar contrato neste convênio:</p>
      <ul className="ml-5 list-disc">
        {itens.map((i) => (
          <li key={i.chave}>{i.rotulo}</li>
        ))}
      </ul>
    </div>
  );
}
