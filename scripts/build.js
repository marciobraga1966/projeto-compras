/* Build para Vercel (ou qualquer hospedagem estática):
   copia o aplicativo para dist/ e grava dist/js/env.js com as variáveis do Supabase. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const pick = (...names) => { for (const n of names) if (process.env[n]) return process.env[n].trim(); return ''; };

const url = pick('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
const key = pick('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY');

if (/service_role|sb_secret_/.test(key) || (key.split('.').length === 3 && /"role"\s*:\s*"service_role"/.test(Buffer.from(key.split('.')[1], 'base64').toString()))) {
  console.error('ERRO: a chave informada é a service_role/secret. Use a chave pública (anon / publishable).');
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
['index.html', 'manifest.webmanifest', 'css', 'js', 'assets'].forEach(p => {
  fs.cpSync(path.join(root, p), path.join(dist, p), { recursive: true });
});
fs.writeFileSync(path.join(dist, 'js', 'env.js'),
  'window.BRASMIC_ENV = ' + JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }) + ';\n');

console.log(url && key ? 'Supabase configurado: ' + url : 'Aviso: SUPABASE_URL / SUPABASE_ANON_KEY não definidas — conexão será informada na tela de Configurações.');
