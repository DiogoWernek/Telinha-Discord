# 📺 Telinha

Compartilhamento de tela pelo navegador, usando LiveKit. Você abre uma sala, manda o link no Discord e a galera assiste.

## 1. Criar a conta no LiveKit (grátis)

1. Acesse https://cloud.livekit.io e crie uma conta e um projeto.
2. Vá em **Settings → Keys** e crie uma chave.
3. Copie o **WebSocket URL** (`wss://...livekit.cloud`), a **API Key** e o **API Secret**.

## 2. Configurar

```bash
cp .env.example .env
```

Preencha o `.env` com os três valores. Se quiser, defina também o `CODIGO_ACESSO`, que funciona como senha para entrar.

## 3. Rodar

```bash
npm install
npm start
```

Abra http://localhost:3000, escolha um nome e uma sala e clique em **Compartilhar tela**.
Para compartilhar o áudio do sistema no Windows, marque "Compartilhar áudio" ao escolher a tela inteira ou uma aba.

## 4. Deixar acessível para os amigos

Em `localhost` só você acessa. As opções:

- **Rápido (teste):** `cloudflared tunnel --url http://localhost:3000` gera uma URL https pública temporária.
- **Fixo:** publique no Render ou no Railway (Node). Configure as variáveis do `.env` no painel. É obrigatório usar HTTPS, porque o navegador só permite capturar a tela em site seguro.

Depois use o botão **🔗 Copiar link** e mande no Discord. O link já abre direto na sala.

## Atividade do Discord

Em produção: https://telinha-discord.vercel.app (Vercel, build com `npm run build`).

Dentro do Discord o app detecta o `?frame_id=`, faz login pelo Discord e usa o **canal de voz como sala**
(`canal-<id>`). Se o Discord bloquear a captura de tela, ele abre `PUBLIC_URL/?sala=canal-<id>`
no navegador, e a tela aparece dentro da Atividade para todo mundo da call.

Configuração no [Developer Portal](https://discord.com/developers/applications), app **TelinhaWernek**:

- **OAuth2:** Client ID/Secret no `.env` e na Vercel; redirect `https://127.0.0.1`.
- **Atividades → Mapeamentos de URL:**

  | Prefixo | Alvo |
  |---|---|
  | `/` | `telinha-discord.vercel.app` |
  | `/livekit` | host do `LIVEKIT_URL`, sem `wss://` |

- **Atividades → Configurações:** Ativar atividades.
- **Instalação:** instalar no servidor pelo link de instalação.

Variáveis na Vercel: as mesmas do `.env.example`, com `PUBLIC_URL=https://telinha-discord.vercel.app`.

## Próximos passos possíveis

- Bot do Discord com `/tela`, que cria a sala e posta o link.
- Escolher a qualidade (720p/1080p/60fps).
- Chat ou reações na sala.
