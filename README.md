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

## Próximos passos possíveis

- Bot do Discord com `/tela`, que cria a sala e posta o link.
- Escolher a qualidade (720p/1080p/60fps).
- Chat ou reações na sala.
