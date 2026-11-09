import { Room, RoomEvent, Track } from 'livekit-client';
import { DiscordSDK } from '@discord/embedded-app-sdk';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// Dentro do Discord a página recebe ?frame_id=... e toda requisição passa pelo proxy /.proxy
const noDiscord = params.has('frame_id');
const api = (caminho) => (noDiscord ? `/.proxy${caminho}` : caminho);

let room = null;
let discord = null;
let salaAtual = '';
let config = {};
const tiles = new Map(); // trackSid -> elemento .tile

async function pedirToken(corpo) {
  const resp = await fetch(api('/api/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dados = await resp.json();
  if (!resp.ok) throw new Error(dados.erro || 'Falha ao entrar.');
  return dados;
}

// ---------- Inicialização ----------
(async () => {
  try {
    config = await fetch(api('/api/config')).then((r) => r.json());
  } catch {}

  if (noDiscord) return iniciarNoDiscord();

  $('sala').value = params.get('sala') || '';
  try { $('nome').value = localStorage.getItem('telinha-nome') || ''; } catch {}
  if (config.precisaCodigo) $('campo-codigo').hidden = false;
})();

// ---------- Modo navegador ----------
$('form-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erro').textContent = '';
  $('btn-entrar').disabled = true;
  try {
    const nome = $('nome').value.trim();
    try { localStorage.setItem('telinha-nome', nome); } catch {}
    await entrar(await pedirToken({ nome, sala: $('sala').value, codigo: $('codigo').value }));
  } catch (err) {
    $('erro').textContent = err.message;
  } finally {
    $('btn-entrar').disabled = false;
  }
});

// ---------- Modo Atividade do Discord ----------
async function iniciarNoDiscord() {
  $('form-entrar').hidden = true;
  $('erro').textContent = 'Conectando ao Discord…';
  try {
    discord = new DiscordSDK(config.discordClientId);
    await discord.ready();

    const { code } = await discord.commands.authorize({
      client_id: config.discordClientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });
    const resp = await fetch(api('/api/discord/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const { access_token, erro } = await resp.json();
    if (!resp.ok) throw new Error(erro || 'Falha no login do Discord.');
    const { user } = await discord.commands.authenticate({ access_token });

    // Sala = canal de voz: todo mundo na mesma call cai na mesma sala
    const dados = await pedirToken({
      nome: user.global_name || user.username,
      sala: `canal-${discord.channelId}`,
      discordToken: access_token,
    });
    // LiveKit também precisa passar pelo proxy do Discord (mapeamento /livekit)
    dados.url = `wss://${location.host}/.proxy/livekit`;
    await entrar(dados);
  } catch (err) {
    $('erro').textContent = 'Erro: ' + (err.message || err);
    console.error(err);
  }
}

// ---------- Sala ----------
async function entrar({ token, url, sala }) {
  room = new Room({ adaptiveStream: true, dynacast: true });

  room
    .on(RoomEvent.TrackSubscribed, (track, pub, participante) => adicionarTrack(track, pub, participante))
    .on(RoomEvent.TrackUnsubscribed, (track, pub) => removerTrack(track, pub))
    .on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.source === Track.Source.ScreenShare) adicionarTrack(pub.track, pub, room.localParticipant, true);
      atualizarBotaoTela();
    })
    .on(RoomEvent.LocalTrackUnpublished, (pub) => {
      removerTrack(pub.track, pub);
      atualizarBotaoTela();
    })
    .on(RoomEvent.ParticipantConnected, atualizarPessoas)
    .on(RoomEvent.ParticipantDisconnected, atualizarPessoas)
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      $('btn-audio').hidden = room.canPlaybackAudio;
    })
    .on(RoomEvent.Disconnected, sairDaTela);

  await room.connect(url, token);
  await room.startAudio().catch(() => {}); // clique em "Entrar" libera o autoplay

  salaAtual = sala;
  if (noDiscord) $('btn-link').hidden = true; // na Atividade não há link para copiar
  else history.replaceState(null, '', `?sala=${encodeURIComponent(sala)}`);
  $('titulo-sala').textContent = `Sala: ${sala}`;
  $('entrada').hidden = true;
  $('sala-view').hidden = false;
  atualizarPessoas();
  atualizarVazio();
}

function adicionarTrack(track, pub, participante, local = false) {
  if (!track) return;

  if (track.kind === Track.Kind.Audio) {
    if (local) return; // não tocar o próprio áudio
    const el = track.attach();
    el.dataset.sid = pub.trackSid;
    document.body.appendChild(el);
    return;
  }

  // vídeo: só mostramos telas compartilhadas
  if (pub.source !== Track.Source.ScreenShare) return;

  const tile = document.createElement('div');
  tile.className = 'tile';
  const video = track.attach();
  video.muted = true;
  video.playsInline = true;

  const rotulo = document.createElement('span');
  rotulo.className = 'rotulo';
  rotulo.textContent = local ? 'Você (prévia)' : participante.name || participante.identity;

  const cheia = document.createElement('button');
  cheia.className = 'tela-cheia';
  cheia.textContent = '⛶';
  cheia.title = 'Tela cheia';
  cheia.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : tile.requestFullscreen());

  tile.append(video, rotulo, cheia);
  $('grade').appendChild(tile);
  tiles.set(pub.trackSid, tile);
  atualizarVazio();
}

function removerTrack(track, pub) {
  track?.detach().forEach((el) => el.remove());
  document.querySelectorAll(`audio[data-sid="${pub.trackSid}"]`).forEach((el) => el.remove());
  const tile = tiles.get(pub.trackSid);
  if (tile) {
    tile.remove();
    tiles.delete(pub.trackSid);
  }
  atualizarVazio();
}

function atualizarVazio() {
  $('vazio').hidden = tiles.size > 0;
}

function atualizarPessoas() {
  if (!room) return;
  const n = room.remoteParticipants.size + 1;
  $('pessoas').textContent = `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
}

function atualizarBotaoTela() {
  const ligado = room?.localParticipant.isScreenShareEnabled;
  $('btn-tela').textContent = ligado ? '⏹️ Parar de compartilhar' : '🖥️ Compartilhar tela';
  $('btn-tela').classList.toggle('ativo', Boolean(ligado));
}

$('btn-tela').addEventListener('click', async () => {
  const ligar = !room.localParticipant.isScreenShareEnabled;
  try {
    await room.localParticipant.setScreenShareEnabled(
      ligar,
      {
        audio: {
          // não captura o som que a própria página Telinha toca (áudio dos outros) → evita eco infinito
          restrictOwnAudio: true,
          // processamento de voz estraga música/jogo; desligado para som de tela
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        selfBrowserSurface: 'exclude',
        resolution: { width: 1920, height: 1080, frameRate: 30 },
        contentHint: 'detail',
      },
      { videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 } }
    );
  } catch (err) {
    console.error(err);
    if (noDiscord && ligar && config.publicUrl) {
      // O Discord bloqueia captura de tela dentro da Atividade → compartilha pelo navegador, mesma sala
      await discord.commands.openExternalLink({
        url: `${config.publicUrl}/?sala=${encodeURIComponent(salaAtual)}`,
      });
    } else if (err.name !== 'NotAllowedError') {
      alert('Não foi possível compartilhar a tela: ' + err.message);
    }
  }
  atualizarBotaoTela();
});

$('btn-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('btn-link').textContent = '✅ Copiado!';
  } catch {
    prompt('Copie o link:', location.href);
  }
  setTimeout(() => ($('btn-link').textContent = '🔗 Copiar link'), 1500);
});

$('btn-audio').addEventListener('click', () => room.startAudio());
$('btn-sair').addEventListener('click', () => room?.disconnect());

function sairDaTela() {
  tiles.forEach((t) => t.remove());
  tiles.clear();
  document.querySelectorAll('audio[data-sid]').forEach((el) => el.remove());
  room = null;
  $('sala-view').hidden = true;
  $('entrada').hidden = false;
  atualizarBotaoTela();
}
