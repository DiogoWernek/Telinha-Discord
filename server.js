import 'dotenv/config';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  CODIGO_ACESSO, // opcional: se definido, exigido para entrar
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  PUBLIC_URL, // URL pública (https) — usada para abrir o navegador a partir da Atividade
  PORT = 3000,
} = process.env;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limpar = (s, max) =>
  String(s ?? '')
    .trim()
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .slice(0, max);

app.post('/api/token', async (req, res) => {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res
      .status(500)
      .json({ erro: 'Servidor sem credenciais do LiveKit. Configure o arquivo .env.' });
  }

  const nome = limpar(req.body?.nome, 32);
  const sala = limpar(req.body?.sala, 48).replace(/ /g, '-').toLowerCase();

  if (!nome || !sala) {
    return res.status(400).json({ erro: 'Informe seu nome e o nome da sala.' });
  }
  if (CODIGO_ACESSO && req.body?.codigo !== CODIGO_ACESSO) {
    // quem vem pela Atividade do Discord já está autenticado pelo Discord
    const okDiscord = req.body?.discordToken && (await usuarioDiscord(req.body.discordToken));
    if (!okDiscord) return res.status(401).json({ erro: 'Código de acesso incorreto.' });
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `${nome}-${Math.random().toString(36).slice(2, 7)}`,
    name: nome,
    ttl: '6h',
    // "vinculo" = identidade da outra janela da mesma pessoa (Atividade ↔ navegador),
    // para a Atividade não tocar o som da própria transmissão
    metadata: JSON.stringify({ vinculo: String(req.body?.vinculo ?? '').slice(0, 80) }),
  });
  at.addGrant({ room: sala, roomJoin: true, canPublish: true, canSubscribe: true });

  res.json({ token: await at.toJwt(), url: LIVEKIT_URL, sala });
});

app.get('/api/config', (_req, res) => {
  res.json({
    precisaCodigo: Boolean(CODIGO_ACESSO),
    discordClientId: DISCORD_CLIENT_ID,
    publicUrl: PUBLIC_URL?.replace(/\/$/, ''),
  });
});

// Troca o "code" do OAuth da Atividade por um access_token (o secret fica só aqui no servidor)
app.post('/api/discord/token', async (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    return res.status(500).json({ erro: 'Servidor sem DISCORD_CLIENT_ID/SECRET no .env.' });
  }
  const resp = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(req.body?.code ?? ''),
    }),
  });
  const dados = await resp.json();
  if (!resp.ok) {
    console.error('Discord OAuth falhou:', dados);
    return res.status(401).json({ erro: 'Login do Discord falhou.' });
  }
  res.json({ access_token: dados.access_token });
});

async function usuarioDiscord(token) {
  try {
    const r = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`telinha rodando em http://localhost:${PORT}`);
});
