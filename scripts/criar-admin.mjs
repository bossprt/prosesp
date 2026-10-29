// Cria o primeiro administrador. Uso (local):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-admin.mjs <email> "<nome>"
// Os valores vêm de `npx supabase status` e não devem ser gravados em arquivo.
// O convite chega no e-mail de teste local (http://127.0.0.1:54324), onde a pessoa define a senha.
import { createClient } from '@supabase/supabase-js';

const [email, nome] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !nome) {
  console.error('Uso: node scripts/criar-admin.mjs <email> "<nome>"');
  process.exit(1);
}
if (!url || !chave) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja `npx supabase status`).');
  process.exit(1);
}

const admin = createClient(url, chave, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: 'http://127.0.0.1:5173/redefinir-senha',
});
if (error || !data.user) {
  console.error('Não foi possível enviar o convite:', error?.message);
  process.exit(1);
}
const { error: erroPerfil } = await admin
  .from('usuarios')
  .insert({ id: data.user.id, nome, email: email.toLowerCase(), perfil: 'administrador' });
if (erroPerfil) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error('Não foi possível gravar o administrador:', erroPerfil.message);
  process.exit(1);
}
console.log(`Administrador criado. Abra o convite em http://127.0.0.1:54324 para definir a senha de ${email}.`);
