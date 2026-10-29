// Listas de opções usadas em mais de uma tela (mesmos valores aceitos pelo banco).
export const TIPOS_CONTA = [
  { valor: 'corrente', rotulo: 'Corrente' },
  { valor: 'poupanca', rotulo: 'Poupança' },
  { valor: 'pagamento', rotulo: 'Pagamento' },
];

export const TIPOS_PIX = ['cpf', 'cnpj', 'email', 'celular', 'aleatoria'].map((v) => ({ valor: v, rotulo: v }));
