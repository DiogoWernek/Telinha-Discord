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
  try { $('nome').value = params.get('nome') || localStorage.getItem('telinha-nome') || ''; } catch {}
  if (config.precisaCodigo) $('campo-codigo').hidden = false;
})();

// ---------- Modo navegador ----------
$('btn-olho').addEventListener('click', () => {
  const mostrar = $('codigo').type === 'password';
  $('codigo').type = mostrar ? 'text' : 'password';
  const rotulo = mostrar ? 'Esconder código' : 'Mostrar código';
  $('btn-olho').setAttribute('aria-label', rotulo);
  $('btn-olho').title = rotulo;
  $('btn-olho').innerHTML = `<svg><use href="#${mostrar ? 'i-olho-fechado' : 'i-olho'}"/></svg>`;
  $('codigo').focus();
});

$('form-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erro').textContent = '';
  $('btn-entrar').disabled = true;
  try {
    const nome = $('nome').value.trim();
    try { localStorage.setItem('telinha-nome', nome); } catch {}
    await entrar(
      await pedirToken({
        nome,
        sala: $('sala').value,
        codigo: $('codigo').value,
        vinculo: params.get('vinculo') || '', // veio da Atividade do Discord
      })
    );
  } catch (err) {
    $('erro').textContent = err.message;
  } finally {
    $('btn-entrar').disabled = false;
  }
});

// ---------- Modo Atividade do Discord ----------
async function iniciarNoDiscord() {
  document.querySelector('.hero').hidden = true;
  $('form-entrar').hidden = true;
  $('carregando').hidden = false;
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
    $('carregando-texto').textContent = 'Não deu para ligar a telinha: ' + (err.message || err);
    document.querySelector('.logo-pulsa').style.animation = 'none';
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
  $('titulo-sala').textContent = noDiscord ? 'Telinha da call' : `#${sala}`;
  $('entrada').hidden = true;
  $('sala-view').hidden = false;
  atualizarPessoas();
  atualizarVazio();
}

// ---------- Som por pessoa (mudo e volume) ----------
const somPrefs = new Map(); // identity -> { mudo, volume }

// A outra janela da mesma pessoa (ex.: Atividade abriu o navegador para compartilhar)
function ehMinhaOutraJanela(p) {
  try {
    const meu = room?.localParticipant.identity;
    return Boolean(meu) && JSON.parse(p.metadata || '{}').vinculo === meu;
  } catch {
    return false;
  }
}

function prefsDe(p) {
  if (!somPrefs.has(p.identity)) {
    // sua própria transmissão começa no mudo: senão você se ouve (e o som pode voltar na captura)
    somPrefs.set(p.identity, { mudo: ehMinhaOutraJanela(p), volume: 1 });
  }
  return somPrefs.get(p.identity);
}

function aplicarSom(identity) {
  const pref = somPrefs.get(identity);
  if (!pref) return;
  document.querySelectorAll('audio[data-sid]').forEach((el) => {
    if (el.dataset.quem !== identity) return;
    el.muted = pref.mudo;
    el.volume = pref.volume;
  });
  document.querySelectorAll('.tile').forEach((tile) => {
    if (tile.dataset.quem !== identity) return;
    const silencioso = pref.mudo || pref.volume === 0;
    const btn = tile.querySelector('.btn-mudo');
    btn.innerHTML = `<svg><use href="#${silencioso ? 'i-mudo' : 'i-som'}"/></svg>`;
    btn.title = silencioso ? 'Ativar som' : 'Silenciar';
    btn.setAttribute('aria-label', btn.title);
    btn.classList.toggle('mudo', silencioso);
    tile.querySelector('.volume').value = Math.round(pref.volume * 100);
  });
}

function controlesDeSom(participante) {
  const caixa = document.createElement('div');
  caixa.className = 'controles-som';

  const mudo = document.createElement('button');
  mudo.className = 'btn icone btn-mudo';
  mudo.onclick = () => {
    const pref = prefsDe(participante);
    const silencioso = pref.mudo || pref.volume === 0;
    pref.mudo = !silencioso;
    if (silencioso && pref.volume === 0) pref.volume = 0.5;
    aplicarSom(participante.identity);
  };

  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.className = 'volume';
  volume.setAttribute('aria-label', 'Volume');
  volume.oninput = () => {
    const pref = prefsDe(participante);
    pref.volume = volume.value / 100;
    pref.mudo = false;
    aplicarSom(participante.identity);
  };

  // clique com o mouse não deixa foco preso (senão os controles ficam aparecendo)
  mudo.addEventListener('pointerup', () => mudo.blur());
  volume.addEventListener('pointerup', () => volume.blur());

  caixa.append(mudo, volume);
  return caixa;
}

function adicionarTrack(track, pub, participante, local = false) {
  if (!track) return;

  if (track.kind === Track.Kind.Audio) {
    if (local) return; // não tocar o próprio áudio
    const el = track.attach();
    el.dataset.sid = pub.trackSid;
    el.dataset.quem = participante.identity;
    document.body.appendChild(el);
    prefsDe(participante);
    aplicarSom(participante.identity);
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
  const badge = document.createElement('span');
  badge.className = 'ao-vivo';
  badge.textContent = 'AO VIVO';
  const quem = document.createElement('span');
  const outraJanela = !local && ehMinhaOutraJanela(participante);
  quem.textContent = local
    ? 'Você'
    : outraJanela
      ? 'Você (navegador)'
      : participante.name || participante.identity;
  rotulo.append(badge, quem);
  tile.dataset.quem = participante.identity;

  const cheia = document.createElement('button');
  cheia.className = 'btn icone tela-cheia';
  cheia.innerHTML = '<svg><use href="#i-cheia"/></svg>';
  cheia.title = 'Tela cheia';
  cheia.setAttribute('aria-label', 'Tela cheia');
  cheia.onclick = () => alternarTelaCheia(tile);
  cheia.addEventListener('pointerup', () => cheia.blur());
  video.addEventListener('dblclick', () => alternarTelaCheia(tile));

  tile.append(video, rotulo, cheia);
  if (!local) {
    // na sua própria prévia não há som para controlar
    tile.append(controlesDeSom(participante));
    prefsDe(participante);
  }
  $('grade').appendChild(tile);
  tiles.set(pub.trackSid, tile);
  if (!local) aplicarSom(participante.identity);
  atualizarVazio();
}

// O iframe do Discord não libera a Fullscreen API → cai para "tela cheia" dentro da Atividade
async function alternarTelaCheia(tile) {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (tile.classList.contains('cheia')) return tile.classList.remove('cheia');
  try {
    if (!document.fullscreenEnabled) throw new Error('sem fullscreen');
    await tile.requestFullscreen();
  } catch {
    tile.classList.add('cheia');
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.tile.cheia').forEach((t) => t.classList.remove('cheia'));
});

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
  const todos = [room.localParticipant, ...room.remoteParticipants.values()];
  const n = todos.length;
  $('pessoas').textContent = n === 1 ? 'Só você por aqui' : `${n} pessoas assistindo`;

  const cores = ['#ff6b4a', '#ffb35c', '#5fd4a0', '#7cc4ff', '#d99cff', '#ff8fb1'];
  const corDe = (s) => cores[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % cores.length];
  $('avatares').replaceChildren(
    ...todos.slice(0, 6).map((p) => {
      const nome = p.name || p.identity;
      const el = document.createElement('span');
      el.className = 'avatar';
      el.textContent = nome.trim()[0]?.toUpperCase() || '?';
      el.title = p === room.localParticipant ? `${nome} (você)` : nome;
      el.style.background = corDe(p.identity);
      return el;
    })
  );
}

function atualizarBotaoTela() {
  const ligado = Boolean(room?.localParticipant.isScreenShareEnabled);
  $('btn-tela').innerHTML = ligado
    ? '<svg><use href="#i-parar"/></svg><span>Parar de compartilhar</span>'
    : '<svg><use href="#i-tela"/></svg><span>Compartilhar tela</span>';
  $('btn-tela').classList.toggle('ativo', ligado);
  $('qualidade').disabled = ligado; // muda na próxima vez que compartilhar
}

// Presets de qualidade. 'motion' prioriza FPS (jogo/vídeo); 'detail' prioriza nitidez (texto/código).
const QUALIDADES = {
  fluido: { w: 1280, h: 720, fps: 60, bitrate: 5_000_000, hint: 'motion' },
  equilibrado: { w: 1920, h: 1080, fps: 30, bitrate: 6_000_000, hint: 'motion' },
  maximo: { w: 1920, h: 1080, fps: 60, bitrate: 9_000_000, hint: 'motion' },
  nitido: { w: 1920, h: 1080, fps: 30, bitrate: 4_000_000, hint: 'detail' },
};
try {
  const salva = localStorage.getItem('telinha-qualidade');
  if (salva in QUALIDADES) $('qualidade').value = salva;
} catch {}
$('qualidade').addEventListener('change', () => {
  try { localStorage.setItem('telinha-qualidade', $('qualidade').value); } catch {}
});

$('btn-tela').addEventListener('click', async () => {
  const ligar = !room.localParticipant.isScreenShareEnabled;
  const q = QUALIDADES[$('qualidade').value] || QUALIDADES.fluido;
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
        resolution: { width: q.w, height: q.h, frameRate: q.fps },
        contentHint: q.hint,
      },
      {
        // para tela o LiveKit usa screenShareEncoding (o padrão dele é 1080p a 15fps!)
        screenShareEncoding: { maxBitrate: q.bitrate, maxFramerate: q.fps },
        // sob rede ruim: jogo perde resolução mas mantém FPS; texto o contrário
        degradationPreference: q.hint === 'motion' ? 'maintain-framerate' : 'maintain-resolution',
        // H.264 costuma ter codificação por hardware → menos CPU, mais FPS
        videoCodec: 'h264',
      }
    );
  } catch (err) {
    console.error(err);
    if (noDiscord && ligar && config.publicUrl) {
      // O Discord bloqueia captura de tela dentro da Atividade → compartilha pelo navegador, mesma sala
      await discord.commands.openExternalLink({
        url:
          `${config.publicUrl}/?sala=${encodeURIComponent(salaAtual)}` +
          `&nome=${encodeURIComponent(room.localParticipant.name || '')}` +
          `&vinculo=${encodeURIComponent(room.localParticipant.identity)}`,
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
    $('btn-link').innerHTML = '<svg><use href="#i-ok"/></svg><span>Copiado!</span>';
  } catch {
    prompt('Copie o link:', location.href);
  }
  setTimeout(() => ($('btn-link').innerHTML = '<svg><use href="#i-link"/></svg><span>Copiar link</span>'), 1500);
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
