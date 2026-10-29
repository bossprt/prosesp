import { describe, expect, it } from 'vitest';
import { itensMenu } from './permissoes';

const de = (lista: string[]) => (chave: string) => lista.includes(chave);

describe('itensMenu', () => {
  it('menu de consulta não mostra Usuários', () => {
    const rotulos = itensMenu(de(['convenios.ver', 'clientes.ver', 'parceiros.ver', 'simulador.usar']), false).map(
      (i) => i.rotulo,
    );
    expect(rotulos).toContain('Clientes');
    expect(rotulos).not.toContain('Usuários');
    expect(rotulos).not.toContain('Auditoria');
  });

  it('administrador vê Usuários e Permissões', () => {
    const rotulos = itensMenu(de(['usuarios.gerenciar', 'permissoes.gerenciar']), false).map((i) => i.rotulo);
    expect(rotulos).toEqual(expect.arrayContaining(['Usuários', 'Permissões']));
  });

  it('parceiro vê o portal, não a lista geral de clientes', () => {
    const itens = itensMenu(de(['clientes.ver', 'simulador.usar']), true);
    expect(itens.map((i) => i.rota)).toEqual(['/simulador', '/parceiro/clientes']);
  });
});
