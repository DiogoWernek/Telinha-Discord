<p align="center">
  <img src="design/telinha-icone-1024.png" width="120" alt="Ícone do Telinha" />
</p>

<h1 align="center">Telinha</h1>

<p align="center">
  Compartilhamento de tela que roda <b>dentro do Discord</b>, como Atividade, igual aos jogos do 🚀.<br/>
  Projeto open source: hospede o seu e use com a sua galera.
</p>

---

## O que ele faz

- **Roda embutido na call:** abre pelo menu de Atividades do canal de voz, sem sair do Discord.
- **Sala automática:** todo mundo no mesmo canal de voz cai na mesma sala, sem link nem configuração.
- **Login pelo Discord:** cada um aparece com o próprio nome.
- **Até 1080p a 60 FPS, com áudio do sistema.** Tem um seletor de qualidade para escolher entre fluidez e nitidez.
- **Sem eco:** não recaptura o som que o próprio Telinha toca.
- **Tela cheia** dentro da Atividade (Esc ou duplo clique para sair).
- **Também funciona fora do Discord,** como um site normal: você cria uma sala e manda o link.

### Qualidades disponíveis

| Opção | Resolução | FPS | Bom para |
|---|---|---|---|
| **Fluido** (padrão) | 720p | 60 | jogos e vídeos |
| Equilibrado | 1080p | 30 | um pouco de tudo |
| Máximo | 1080p | 60 | PC e internet bons |
| Texto nítido | 1080p | 30 | código e documentos |

---

## Como funciona

```
Quem compartilha ──(WebRTC)──▶ LiveKit Cloud ──▶ Quem assiste
        ▲                                             ▲
        └──── Atividade do Discord (iframe) ──────────┘
                      │
                      ▼
          Servidor do Telinha (Vercel)
          • entrega a página
          • gera os tokens do LiveKit
          • troca o login do Discord (OAuth2)
```

- **LiveKit Cloud** transporta o vídeo. O plano grátis dá para uso entre amigos.
- **Servidor do Telinha:** um Express pequeno (`server.js`) que não guarda estado nenhum, por isso roda bem na Vercel.
- **Discord:** carrega o site num iframe pelo proxy dele (`<id>.discordsays.com`). O LiveKit também passa por esse proxy, via o mapeamento `/livekit`.

---

## Como hospedar o seu

Você vai precisar de:

- uma conta no [GitHub](https://github.com);
- uma conta no [LiveKit Cloud](https://cloud.livekit.io) (grátis);
- uma conta na [Vercel](https://vercel.com) (grátis);
- uma conta do Discord e um servidor onde você possa adicionar apps.

São uns 15 minutos. Siga na ordem.

### 1. Copie o projeto

Faça um **fork** deste repositório no GitHub, ou clone e suba no seu próprio repositório.

### 2. LiveKit (o vídeo)

1. Entre em [cloud.livekit.io](https://cloud.livekit.io) e crie um projeto.
2. Vá em **Settings → Keys** e crie uma chave.
3. Anote os três valores:
   - **WebSocket URL**, algo como `wss://meu-projeto-abc123.livekit.cloud`;
   - **API Key**;
   - **API Secret**, que só aparece uma vez.

### 3. App no Discord

1. Entre no [Discord Developer Portal](https://discord.com/developers/applications) e clique em **Novo aplicativo**. Dê um nome, que é o nome que aparece no menu de Atividades.
2. Em **Informações gerais**, você pode subir o ícone `design/telinha-icone-1024.png`. Anote o **ID do aplicativo** (é o Client ID).
3. Em **OAuth2**:
   - clique em **Redefinir segredo** e anote o **Client Secret**;
   - em **Redirecionamentos**, adicione `https://127.0.0.1` e salve. O SDK exige um redirect cadastrado, mesmo sem usar.

> A **Chave pública** da página inicial não é usada. O secret é só o do OAuth2.

### 4. Deploy na Vercel

1. Na Vercel, clique em **Add New → Project** e importe o seu repositório.
2. A Vercel detecta tudo sozinha: o build roda `npm run build` e o servidor é o `server.js`.
3. Em **Environment Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `LIVEKIT_URL` | o WebSocket URL do passo 2 |
   | `LIVEKIT_API_KEY` | a API Key do passo 2 |
   | `LIVEKIT_API_SECRET` | o API Secret do passo 2 |
   | `DISCORD_CLIENT_ID` | o ID do aplicativo do passo 3 |
   | `DISCORD_CLIENT_SECRET` | o Client Secret do passo 3 |
   | `PUBLIC_URL` | a URL do seu deploy, ex: `https://meu-telinha.vercel.app` |
   | `CODIGO_ACESSO` | *(opcional)* senha para quem entra pelo navegador |

4. Clique em **Deploy**. Se você só descobrir a URL depois do primeiro deploy, preencha a `PUBLIC_URL` e faça um **Redeploy**, porque a Vercel só aplica variáveis novas num deploy novo.

Para testar, abra `https://<seu-deploy>/api/config`. A resposta deve mostrar o seu `discordClientId` e a `publicUrl`.

### 5. Ligar a Atividade no Discord

De volta ao Developer Portal:

1. Em **Atividades → Mapeamentos de URL**, configure:

   | Prefixo | Alvo |
   |---|---|
   | `/` | `meu-telinha.vercel.app` *(o seu domínio, sem `https://`)* |
   | `/livekit` | `meu-projeto-abc123.livekit.cloud` *(o host do LiveKit, sem `wss://`)* |

   O primeiro vai em "Mapeamento de raízes". O segundo você cria em **Adicione outro mapeamento de URL**.

2. Em **Atividades → Configurações**, ative **Ativar atividades**. A opção só libera depois que o mapeamento estiver salvo.

3. Em **Instalação**:
   - marque **Instalação no servidor** e **Instalação do usuário**;
   - em instalação no servidor, adicione o escopo `applications.commands`;
   - copie o **Link de instalação**, abra no navegador e adicione o app ao seu servidor.

### 6. Usar

1. Entre num canal de voz do servidor onde você instalou o app.
2. Clique no 🚀 (**Atividades**) e escolha o seu app. Na primeira vez, autorize.
3. Escolha a qualidade e clique em **Compartilhar tela**.
4. Quem estiver na call abre a mesma Atividade e assiste.

Para usar em outros servidores, mande o **link de instalação** para o dono do servidor.

---

## Rodar no seu PC (desenvolvimento)

```bash
npm install
cp .env.example .env
npm start
```

Preencha o `.env` antes de rodar. O app abre em http://localhost:3000. Fora do Discord, basta um nome e uma sala.

Para testar **dentro do Discord** sem fazer deploy, crie um túnel HTTPS temporário:

```bash
cloudflared tunnel --url http://localhost:3000
```

Use a URL `https://...trycloudflare.com` que aparecer no mapeamento `/` do portal e na `PUBLIC_URL` do `.env`, e reinicie o `npm start`. A URL muda toda vez que o túnel reinicia.

### Estrutura

| Caminho | O que é |
|---|---|
| `server.js` | Express: página, `/api/token` (LiveKit), `/api/discord/token` (OAuth2), `/api/config` |
| `src/app.js` | front-end: sala, compartilhamento, qualidade, integração com o Discord |
| `public/` | HTML, CSS, fontes e ícones (o `app.js` é gerado pelo build) |
| `scripts/versionar.js` | coloca `?v=<hash>` nos links do `index.html` para o Discord não usar cache velho |
| `design/` | ícone (SVG e PNG 1024) e conceitos |

---

## Problemas comuns

**O app não aparece no menu de Atividades**
- Confira se **Ativar atividades** está ligado e salvo no portal.
- O app precisa estar **instalado no servidor** pelo link de instalação.
- Recarregue o Discord com **Ctrl+R**. Às vezes o app não aparece na busca, mas está mais embaixo na lista.

**Layout quebrado ou versão antiga dentro do Discord**
- O Discord guarda cache. Feche a Atividade, aperte **Ctrl+R** e abra de novo.

**"Não deu para ligar a telinha" ao abrir a Atividade**
- Confira o `DISCORD_CLIENT_ID` e o `DISCORD_CLIENT_SECRET` na Vercel e o redirect `https://127.0.0.1` no OAuth2.
- Confira o mapeamento `/livekit`: precisa ser o host exato do `LIVEKIT_URL`, sem `wss://`.

**Ao compartilhar, abre uma página de erro no navegador**
- A `PUBLIC_URL` está errada ou desatualizada. Corrija na Vercel e faça **Redeploy**.

**Eco infinito no áudio**
- Não deixe uma segunda janela do Telinha aberta **no mesmo PC** enquanto compartilha com áudio. Ela toca o som de volta e ele é capturado de novo.
- Use um Chrome, Edge ou Discord atualizado (o recurso `restrictOwnAudio` depende disso).

**Travando ou com pouco FPS**
- Use **Fluido · 720p 60fps**.
- Não compartilhe o próprio Discord, porque o efeito de espelho infinito pesa muito.
- Se só um amigo trava, provavelmente é a internet dele. O app baixa a resolução automaticamente para manter o FPS.

---

## Licença

[MIT](LICENSE): use, modifique e hospede à vontade, inclusive no seu servidor. Só mantenha o aviso de copyright.

## Feito com

[LiveKit](https://livekit.io) · [Discord Embedded App SDK](https://github.com/discord/embedded-app-sdk) · [Express](https://expressjs.com) · [esbuild](https://esbuild.github.io) · fontes [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) e [Figtree](https://fonts.google.com/specimen/Figtree) (OFL)
