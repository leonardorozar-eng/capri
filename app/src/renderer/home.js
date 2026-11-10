'use strict';

// Standing portrait frames from CapriCore, cropped to the head and upper torso.
// The desktop uses the matching full-body drawings, one pose per situation.

const COPY = {
  pt: {
    stay: 'Ficar nesta janela',
    stayOn: 'Na próxima abertura ela já entra aqui. Fechar a janela desliga isso e ela volta pra mesa.',
    stayOff: 'A janela aberta tira ela da mesa. Liga pra ela já entrar aqui na próxima abertura.',
    placeholder: 'Fala com ela…',
    send: 'Enviar',
    opt: 'Opções',
    optHide: 'Esconder opções',
    options: 'Ligar e desligar',
    model: 'Modelo de IA',
    more: 'Tamanho, descanso e visual',
    hey: 'Hey Capri',
    holo: 'Holograma (o clique atravessa ela)',
    none: 'Nenhum modelo encontrado',
    night: 'Night City',
    on: 'ligado',
    off: 'desligado',
    web: 'Buscar na internet',
    webHint: 'Ligado, ela busca um trecho na internet antes de responder. Desligado, ela responde só com o que já sabe.',
    listen: 'Ouvindo música',
    listenHint: 'Ligado, se o Spotify está tocando ela senta de fone. Desligado, a música não muda a pose.',
    call: 'Modo jogo',
    callHint: 'A janela vira uma chamada translúcida. Ela fica com as animações e comenta o jogo. Um botão volta ao normal.',
    callBack: 'Janela normal',
    callLines: [
      '{game}? Continua. Eu tô olhando.',
      'Essa partida de {game} tá feia. Eu gostei.',
      'Se perder agora em {game}, eu vi.',
      '{game} de novo? Tá viciado ou tá ganhando?',
      'Não pisca. {game} pune.',
      'Eu apostaria em você. Quase.',
      'Calma. {game} não acaba nesse erro.',
      'Olha essa jogada. Quase bonita.',
    ],
    callIdle: [
      'Abre um jogo. Eu comento.',
      'Não tô vendo jogo nenhum daqui.',
      'Quando começar, eu falo.',
    ],
    fast: 'Pensamento rápido',
    fastHint: 'Resposta curta e rápida',
    mid: 'Pensamento médio',
    midHint: 'Resposta no ritmo normal',
    deep: 'Pensamento aprofundado',
    deepHint: 'Resposta com mais cuidado e um pouco mais de detalhe',
    usageOut: 'fora da memória',
    usageLocal: 'memória só aparece no modelo local',
    winMin: 'Minimizar',
    winMax: 'Aumentar',
    winRestore: 'Restaurar',
    winClose: 'Fechar',
  },
  en: {
    stay: 'Stay in this window',
    stayOn: 'Next time the app opens, she starts here. Closing the window turns this off and she goes back to the desktop.',
    stayOff: 'An open window takes her off the desktop. Turn this on and she starts here next time.',
    placeholder: 'Talk to her…',
    send: 'Send',
    opt: 'Options',
    optHide: 'Hide options',
    options: 'On and off',
    model: 'AI model',
    more: 'Size, rest and look',
    hey: 'Hey Capri',
    holo: 'Hologram (clicks pass through her)',
    none: 'No model found',
    night: 'Night City',
    on: 'on',
    off: 'off',
    web: 'Search the web',
    webHint: 'On, she looks up a short note before answering. Off, she answers from what she already knows.',
    listen: 'Listening to music',
    listenHint: 'On, while Spotify is playing she sits with headphones. Off, music does not change her pose.',
    call: 'Game mode',
    callHint: 'The window becomes a translucent call. She keeps her animations and comments on the game. One button returns to normal.',
    callBack: 'Normal window',
    callLines: [
      '{game}? Keep going. I’m watching.',
      'This {game} round is ugly. I like it.',
      'If you lose {game} now, I saw it.',
      '{game} again? Hooked, or winning?',
      'Don’t blink. {game} punishes that.',
      'I’d bet on you. Almost.',
      'Easy. {game} doesn’t end on that mistake.',
      'Look at that play. Almost pretty.',
    ],
    callIdle: [
      'Open a game. I’ll comment.',
      'I don’t see a game from here.',
      'When it starts, I’ll talk.',
    ],
    fast: 'Fast thinking',
    fastHint: 'A short, quick reply',
    mid: 'Medium thinking',
    midHint: 'A normal reply',
    deep: 'Deep thinking',
    deepHint: 'A more careful reply, with a little more detail',
    usageOut: 'not in memory',
    usageLocal: 'memory is only shown for the local model',
    winMin: 'Minimize',
    winMax: 'Maximize',
    winRestore: 'Restore',
    winClose: 'Close',
  },
  es: {
    stay: 'Quedarse en esta ventana',
    stayOn: 'La próxima vez entra aquí. Cerrar la ventana lo apaga y ella vuelve al escritorio.',
    stayOff: 'Con la ventana abierta ella sale del escritorio. Enciéndelo para que entre aquí al abrir.',
    placeholder: 'Háblale…',
    send: 'Enviar',
    opt: 'Opciones',
    optHide: 'Ocultar opciones',
    options: 'Activar y desactivar',
    model: 'Modelo de IA',
    more: 'Tamaño, descanso y estilo',
    hey: 'Hey Capri',
    holo: 'Holograma (el clic la atraviesa)',
    none: 'Ningún modelo',
    night: 'Night City',
    on: 'activado',
    off: 'apagado',
    web: 'Buscar en internet',
    webHint: 'Activado, busca una nota en internet antes de responder. Apagado, responde solo con lo que ya sabe.',
    listen: 'Escuchando música',
    listenHint: 'Activado, si Spotify está sonando ella se sienta con auriculares. Apagado, la música no cambia la pose.',
    call: 'Modo juego',
    callHint: 'La ventana se vuelve una llamada translúcida. Ella sigue con las animaciones y comenta el juego. Un botón vuelve a lo normal.',
    callBack: 'Ventana normal',
    callLines: [
      '¿{game}? Sigue. Te estoy mirando.',
      'Esta partida de {game} está fea. Me gusta.',
      'Si pierdes {game} ahora, lo vi.',
      '¿{game} otra vez? ¿Enganchado o ganando?',
      'No parpadees. {game} castiga.',
      'Apostaría por ti. Casi.',
      'Calma. {game} no termina en ese error.',
      'Mira esa jugada. Casi bonita.',
    ],
    callIdle: [
      'Abre un juego. Yo comento.',
      'Desde aquí no veo ningún juego.',
      'Cuando empiece, hablo.',
    ],
    fast: 'Pensamiento rápido',
    fastHint: 'Respuesta corta y rápida',
    mid: 'Pensamiento medio',
    midHint: 'Respuesta normal',
    deep: 'Pensamiento profundo',
    deepHint: 'Respuesta con más cuidado y un poco más de detalle',
    usageOut: 'fuera de la memoria',
    usageLocal: 'la memoria solo aparece en el modelo local',
    winMin: 'Minimizar',
    winMax: 'Aumentar',
    winRestore: 'Restaurar',
    winClose: 'Cerrar',
  },
  fr: {
    stay: 'Rester dans cette fenêtre',
    stayOn: 'Au prochain lancement elle entre ici. Fermer la fenêtre l’éteint et elle revient au bureau.',
    stayOff: 'La fenêtre ouverte la retire du bureau. Allume ça pour qu’elle entre ici au prochain lancement.',
    placeholder: 'Parle-lui…',
    send: 'Envoyer',
    opt: 'Options',
    optHide: 'Cacher les options',
    options: 'Activer et désactiver',
    model: 'Modèle d’IA',
    more: 'Taille, repos et style',
    hey: 'Hey Capri',
    holo: 'Hologramme (le clic la traverse)',
    none: 'Aucun modèle',
    night: 'Night City',
    on: 'allumé',
    off: 'éteint',
    web: 'Chercher sur internet',
    webHint: 'Allumé, elle cherche une note sur internet avant de répondre. Éteint, elle répond avec ce qu’elle sait déjà.',
    listen: 'Écoute de la musique',
    listenHint: 'Allumé, quand Spotify joue elle s’assoit avec un casque. Éteint, la musique ne change pas la pose.',
    call: 'Mode jeu',
    callHint: 'La fenêtre devient un appel translucide. Elle garde ses animations et commente le jeu. Un bouton revient au normal.',
    callBack: 'Fenêtre normale',
    callLines: [
      '{game} ? Continue. Je regarde.',
      'Cette partie de {game} est moche. J’aime.',
      'Si tu perds {game} maintenant, j’ai vu.',
      '{game} encore ? Accro, ou en train de gagner ?',
      'Ne cligne pas. {game} punit.',
      'Je parierais sur toi. Presque.',
      'Doucement. {game} ne s’arrête pas sur cette erreur.',
      'Regarde ce coup. Presque joli.',
    ],
    callIdle: [
      'Ouvre un jeu. Je commente.',
      'Je ne vois aucun jeu d’ici.',
      'Quand ça commence, je parle.',
    ],
    fast: 'Pensée rapide',
    fastHint: 'Réponse courte et rapide',
    mid: 'Pensée moyenne',
    midHint: 'Réponse normale',
    deep: 'Pensée approfondie',
    deepHint: 'Réponse plus soignée, avec un peu plus de détail',
    usageOut: 'hors mémoire',
    usageLocal: 'la mémoire ne s’affiche que pour le modèle local',
    winMin: 'Réduire',
    winMax: 'Agrandir',
    winRestore: 'Restaurer',
    winClose: 'Fermer',
  },
  ru: {
    stay: 'Остаться в этом окне',
    stayOn: 'В следующий запуск она сразу здесь. Закрытие окна выключает это, и она возвращается на стол.',
    stayOff: 'Пока окно открыто, её нет на столе. Включи, чтобы в следующий раз она входила сюда.',
    placeholder: 'Скажи ей…',
    send: 'Отправить',
    opt: 'Параметры',
    optHide: 'Скрыть параметры',
    options: 'Включить и выключить',
    model: 'Модель ИИ',
    more: 'Размер, отдых и вид',
    hey: 'Hey Capri',
    holo: 'Голограмма (клик проходит сквозь неё)',
    none: 'Моделей нет',
    night: 'Night City',
    on: 'вкл',
    off: 'выкл',
    web: 'Искать в интернете',
    webHint: 'Включено — она ищет короткую заметку в интернете перед ответом. Выключено — отвечает тем, что уже знает.',
    listen: 'Слушает музыку',
    listenHint: 'Включено — пока Spotify играет, она сидит в наушниках. Выключено — музыка не меняет позу.',
    call: 'Игровой режим',
    callHint: 'Окно становится полупрозрачным звонком. Она оставляет анимации и комментирует игру. Одна кнопка возвращает обычное окно.',
    callBack: 'Обычное окно',
    callLines: [
      '{game}? Продолжай. Я смотрю.',
      'Эта партия в {game} страшная. Мне нравится.',
      'Если сейчас проиграешь в {game}, я видела.',
      'Снова {game}? Залип или выигрываешь?',
      'Не моргай. {game} за это наказывает.',
      'Я бы поставила на тебя. Почти.',
      'Тише. {game} на этой ошибке не кончается.',
      'Смотри на этот ход. Почти красиво.',
    ],
    callIdle: [
      'Открой игру. Я прокомментирую.',
      'Отсюда я не вижу игру.',
      'Когда начнётся, я скажу.',
    ],
    fast: 'Быстрое мышление',
    fastHint: 'Короткий быстрый ответ',
    mid: 'Среднее мышление',
    midHint: 'Обычный ответ',
    deep: 'Глубокое мышление',
    deepHint: 'Ответ внимательнее и чуть подробнее',
    usageOut: 'не в памяти',
    usageLocal: 'память видна только у локальной модели',
    winMin: 'Свернуть',
    winMax: 'Развернуть',
    winRestore: 'Восстановить',
    winClose: 'Закрыть',
  },
};

const CLIPS = {
  wink: [
    ['flirty', 350], ['idle-wink_half', 90], ['idle-wink_closed', 160],
    ['idle-wink_half', 90], ['flirty', 600],
  ],
  speech: [
    ['idle-mouth_small', 110], ['idle-mouth_round', 140], ['idle-mouth_wide', 120],
    ['idle-mouth_round', 140], ['idle-mouth_small', 110],
  ],
  heart_hands: [
    ['flirty', 280], ['idle-heart_hands', 1200], ['flirty', 400],
  ],
  wave: [
    ['neutral', 180], ['idle-wave_raise', 220], ['idle-wave_a', 250], ['idle-wave_b', 250],
    ['idle-wave_a', 250], ['idle-wave_b', 250], ['idle-wave_raise', 220], ['neutral', 280],
  ],
  laugh: [
    ['smirk', 140], ['idle-laughing', 900], ['happy', 400],
  ],
  delight: [
    ['happy', 280], ['idle-excited', 700], ['smirk', 400],
  ],
};

const $ = (id) => document.getElementById(id);
const log = $('log');
const box = $('box');
const sendBtn = $('send');
const webBtn = $('web');
const tip = $('tip');
let state = null;
let usage = null;
let copy = COPY.pt;
let draft = null;
let painting = false;
let callOn = false;
let playName = '';
let callTimer = 0;
let mouthTimer = 0;
let lastCallLine = '';

function scheduleCall(ms) {
  clearTimeout(callTimer);
  callTimer = setTimeout(() => {
    if (!callOn) return;
    sayCall();
    scheduleCall(42000 + Math.random() * 28000);
  }, ms);
}

function sayCall() {
  const list = playName ? copy.callLines : copy.callIdle;
  if (!list?.length) return;
  let line = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && line === lastCallLine) line = list[(list.indexOf(line) + 1) % list.length];
  lastCallLine = line;
  $('callLine').textContent = line.replaceAll('{game}', playName);
  portrait.setSpeaking(true);
  clearTimeout(mouthTimer);
  mouthTimer = setTimeout(() => {
    portrait.setSpeaking(false);
    if (callOn) portrait.play(Math.random() < 0.5 ? 'wink' : 'wave', performance.now());
  }, 1500);
}

function applyCall(on) {
  const enter = on && !callOn;
  const leave = !on && callOn;
  callOn = on;
  document.body.classList.toggle('call', on);
  $('callBack').hidden = !on;
  if (on) $('callBack').textContent = copy.callBack;
  if (leave) {
    $('callLine').hidden = true;
    $('callLine').textContent = '';
    clearTimeout(callTimer);
    clearTimeout(mouthTimer);
    callTimer = 0;
    portrait.setSpeaking(false);
    portrait.side = 0;
    requestAnimationFrame(() => portrait.fit());
  }
  if (enter) {
    $('callLine').hidden = false;
    $('callLine').textContent = '';
    lastCallLine = '';
    portrait.side = 0;
    requestAnimationFrame(() => portrait.fit());
    scheduleCall(1600);
  }
}

function textOf(lang) {
  return COPY[lang] || COPY.en;
}

function addBubble(role, text) {
  const p = document.createElement('p');
  p.className = `bubble ${role}`;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  return p;
}

function paintChrome() {
  document.documentElement.lang = state?.lang || 'pt';
  copy = textOf(state?.lang);
  box.placeholder = copy.placeholder;
  sendBtn.textContent = copy.send;
  const webOn = Boolean(state?.webSearch);
  webBtn.textContent = '⊕';
  webBtn.className = webOn ? 'on' : '';
  webBtn.dataset.tip = `${copy.web} · ${webOn ? copy.on : copy.off}. ${copy.webHint}`;
  webBtn.title = webBtn.dataset.tip;
  webBtn.setAttribute('aria-pressed', webOn ? 'true' : 'false');
  webBtn.setAttribute('aria-label', copy.web);
  paintWindowButtons();
}

let windowMax = false;

function paintWindowButtons() {
  const minBtn = $('winMin');
  const maxBtn = $('winMax');
  const closeBtn = $('winClose');
  const maxLabel = windowMax ? copy.winRestore : copy.winMax;
  minBtn.dataset.tip = copy.winMin;
  minBtn.title = copy.winMin;
  minBtn.setAttribute('aria-label', copy.winMin);
  maxBtn.dataset.tip = maxLabel;
  maxBtn.title = maxLabel;
  maxBtn.setAttribute('aria-label', maxLabel);
  maxBtn.textContent = windowMax ? '❐' : '□';
  closeBtn.dataset.tip = copy.winClose;
  closeBtn.title = copy.winClose;
  closeBtn.setAttribute('aria-label', copy.winClose);
}

function button(label, action, extra, primary) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (primary) b.className = 'primary';
  b.addEventListener('click', () => host.homeDo(action, extra || {}));
  return b;
}

function nearestScale(scale) {
  return [0.45, 0.6, 0.8].reduce((best, n) => (Math.abs(n - Number(scale)) < Math.abs(best - Number(scale)) ? n : best), 0.8);
}

function scaleLabel(scale, labels) {
  const n = nearestScale(scale);
  if (Math.abs(n - 0.45) < 0.01) return labels.small || 'Pequena';
  if (Math.abs(n - 0.6) < 0.01) return labels.medium || 'Média';
  return labels.large || 'Grande';
}

function square(symbol, tipText, opts, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `sq${opts?.on ? ' on' : ''}${opts?.blocked ? ' blocked' : ''}`;
  b.textContent = symbol;
  b.dataset.tip = tipText;
  b.title = tipText;
  b.setAttribute('aria-label', tipText);
  if (opts && 'on' in opts) b.setAttribute('aria-pressed', opts.on ? 'true' : 'false');
  b.addEventListener('click', () => {
    if (painting || opts?.blocked) return;
    fn();
  });
  return b;
}

function toggleTip(label, on) {
  return `${label} · ${on ? copy.on : copy.off}`;
}

function paint() {
  if (!state) return;
  painting = true;
  tip.hidden = true;
  paintChrome();
  const L = state.labels || {};
  const think = state.think || 'medium';
  const sizeNow = scaleLabel(state.scale, L);
  const restNow = state.rest === 'taskbar' ? (L.restTaskbar || 'Barra') : (L.restCorner || 'Canto');
  const themeNow = state.theme === 'classic' ? (L.themeClassic || 'Clássico') : copy.night;
  const modelNow = state.model || state.modelError || copy.none;
  $('icons').replaceChildren(
    square('⌂', `${copy.stay} · ${state.stay ? copy.on : copy.off}. ${state.stay ? copy.stayOn : copy.stayOff}`, { on: state.stay }, () => host.homeDo('stay', { on: !state.stay })),
    square('♪', toggleTip(copy.hey, state.hey), { on: state.hey }, () => host.homeDo('hey', { on: !state.hey })),
    square('♫', `${toggleTip(copy.listen, state.listen)}. ${copy.listenHint}`, { on: state.listen }, () => host.homeDo('config', { patch: { listen: !state.listen } })),
    square('▶', `${copy.call}. ${copy.callHint}`, { on: state.call }, () => host.homeDo('call', { on: !state.call })),
    square('◇', toggleTip(copy.holo, state.hologram), { on: state.hologram }, () => host.homeDo('hologram', { on: !state.hologram })),
    square('◎', toggleTip(L.lookAuto || 'Olhar minha tela', state.watchScreen), { on: state.watchScreen }, () => host.homeDo('watch', { on: !state.watchScreen })),
    square('↔', toggleTip(L.wander || 'Passear', state.wander), { on: state.wander }, () => host.homeDo('config', { patch: { wander: !state.wander } })),
    square('✥', toggleTip(L.possess || 'Possuir', state.possess), { on: state.possess }, () => host.homeDo('config', { patch: { possess: !state.possess } })),
    square('♥', toggleTip(L.jealous || 'Ciúmes', state.jealous), { on: state.jealous }, () => host.homeDo('config', { patch: { jealous: !state.jealous } })),
    square('⊠', toggleTip(L.closePages || 'Fechar páginas', state.closePages), { on: state.closePages, blocked: !state.jealous }, () => host.homeDo('config', { patch: { closePages: !state.closePages } })),
    square('▣', toggleTip(L.pcReact || 'Reagir ao PC', state.pcReact), { on: state.pcReact }, () => host.homeDo('config', { patch: { pcReact: !state.pcReact } })),
    square('♡', toggleTip(L.breaks || 'Pausas', state.breaks !== false), { on: state.breaks !== false }, () => host.homeDo('config', { patch: { breaks: state.breaks === false } })),
    square('→', toggleTip(L.follow || 'Seguir', state.follow), { on: state.follow }, () => host.homeDo('config', { patch: { follow: !state.follow } })),
    square('∅', toggleTip(L.mute || 'Sem som', state.muted), { on: state.muted }, () => host.homeDo('config', { patch: { muted: !state.muted } })),
    square('✦', L.teleport || 'Teletransportar', {}, () => host.homeDo('teleport')),
    square('⌕', L.lookNow || 'Olha minha tela', {}, () => host.homeDo('look')),
    square('◌', state.visible ? (L.hide || 'Guardar') : (L.show || 'Trazer de volta'), { on: !state.visible }, () => host.homeDo('hide')),
    square('⌫', L.forget || 'Esquecer', {}, () => host.homeDo('forget')),
    square('×', L.quit || 'Sair', {}, () => host.homeDo('quit')),
    square('⤢', `${L.size || 'Tamanho'}: ${sizeNow}`, {}, () => {
      const scales = [0.45, 0.6, 0.8];
      const next = scales[(scales.indexOf(nearestScale(state.scale)) + 1) % scales.length];
      host.homeDo('config', { patch: { scale: next } });
    }),
    square('⌴', `${L.rest || 'Descanso'}: ${restNow}`, {}, () => host.homeDo('config', { patch: { rest: state.rest === 'taskbar' ? 'corner' : 'taskbar' } })),
    square('✺', `${L.theme || 'Visual'}: ${themeNow}`, { on: state.theme !== 'classic' }, () => host.homeDo('config', { patch: { theme: state.theme === 'classic' ? 'nightcity' : 'classic' } })),
    square('◆', `${L.chatModel || copy.model}: ${modelNow}`, {}, () => {
      const names = state.models || [];
      if (!names.length) return;
      const at = Math.max(0, names.indexOf(state.model));
      host.homeDo('model', { name: names[(at + 1) % names.length] });
    }),
  );
  $('modes').replaceChildren(
    square('»', `${copy.fast}. ${copy.fastHint}`, { on: think === 'fast' }, () => host.homeDo('config', { patch: { think: 'fast' } })),
    square('◈', `${copy.mid}. ${copy.midHint}`, { on: think === 'medium' }, () => host.homeDo('config', { patch: { think: 'medium' } })),
    square('✳', `${copy.deep}. ${copy.deepHint}`, { on: think === 'deep' }, () => host.homeDo('config', { patch: { think: 'deep' } })),
  );
  paintUsage();
  applyCall(Boolean(state.call));
  painting = false;
}

function memText(bytes) {
  const n = Number(bytes) || 0;
  const loc = (state?.lang || 'pt') === 'pt' ? 'pt-BR' : (state?.lang || 'pt');
  if (n < 100 * 1024 * 1024) return `${Math.round(n / (1024 * 1024)).toLocaleString(loc)} MB`;
  return `${(n / 1073741824).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
}

function paintUsage() {
  const el = $('usage');
  const model = usage?.model || state?.model || '';
  if (usage && usage.local === false) {
    el.textContent = `${model} · ${copy.usageLocal}`;
    return;
  }
  if (!usage?.loaded) {
    el.textContent = model ? `${model} · ${copy.usageOut}` : '';
    return;
  }
  el.textContent = `${usage.model || model} · RAM ${memText(usage.ram)} · VRAM ${memText(usage.vram)}`;
}

function showTip(el) {
  const text = el.dataset.tip;
  if (!text) return;
  tip.textContent = text;
  tip.hidden = false;
  const rect = el.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = rect.top - height - 6;
  if (top < 40) top = rect.bottom + 6;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

webBtn.addEventListener('click', () => {
  if (painting || !state) return;
  host.homeDo('config', { patch: { webSearch: !state.webSearch } });
});

$('talk').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = box.value.trim();
  if (!text || sendBtn.disabled) return;
  box.value = '';
  host.homeTalk(text, { think: state?.think || 'medium', web: Boolean(state?.webSearch) });
});

document.body.addEventListener('mouseover', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el) showTip(el);
});
document.body.addEventListener('mouseout', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (!el || el.contains(e.relatedTarget)) return;
  tip.hidden = true;
});
$('icons').addEventListener('scroll', () => { tip.hidden = true; });

$('winMin').addEventListener('click', () => host.homeWindow('minimize'));
$('winMax').addEventListener('click', () => host.homeWindow('maximize'));
$('winClose').addEventListener('click', () => host.homeWindow('close'));
host.onHomeWindowState((next) => {
  windowMax = Boolean(next?.maximized);
  paintWindowButtons();
});

host.onHomeState((next) => {
  state = next;
  paint();
});

host.onHomeUsage((next) => {
  usage = next;
  if (state) paintUsage();
});

host.onHomePlay((msg) => {
  const next = msg && typeof msg.game === 'string' ? msg.game.slice(0, 80) : '';
  if (next === playName) return;
  playName = next;
  if (callOn) scheduleCall(800);
});

$('callBack').addEventListener('click', () => host.homeDo('call', { on: false }));

host.onHomeLine((msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.role === 'clear') {
    log.replaceChildren();
    draft = null;
    $('actions').replaceChildren();
    portrait.calm();
    return;
  }
  if (msg.role === 'busy') {
    sendBtn.disabled = Boolean(msg.on);
    box.disabled = Boolean(msg.on);
    portrait.setBusy(Boolean(msg.on));
    return;
  }
  if (msg.role === 'you') {
    draft = null;
    addBubble('you', msg.text || '');
    portrait.notice();
    return;
  }
  if (msg.role === 'actions') {
    const bar = $('actions');
    bar.replaceChildren();
    for (const action of msg.actions || []) {
      bar.appendChild(button(action.label || action.id, 'answer', { id: action.id }, action.primary));
    }
    return;
  }
  if (msg.role === 'capri') {
    if (!draft) draft = addBubble('capri', '');
    draft.textContent = msg.text || '';
    log.scrollTop = log.scrollHeight;
    portrait.setSpeaking(!msg.done);
    if (msg.done) {
      draft = null;
      portrait.reply();
    }
  }
});

host.chatMemory().then((mem) => {
  const history = Array.isArray(mem) ? mem : [];
  for (const item of history.slice(-12)) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue;
    addBubble(item.role === 'user' ? 'you' : 'capri', String(item.content || '').slice(0, 1200));
  }
}).catch(() => {});

class Portrait {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.images = new Map();
    this.frame = 'neutral';
    this.sequence = null;
    this.speaking = false;
    this.busy = false;
    this.petting = false;
    this.petUntil = 0;
    this.hearts = [];
    this.lean = { x: 0, y: 0 };
    this.side = 0;
    this.dpr = 1;
    this.burstAt = 0;
    this.arrived = false;
    this.arriveAt = null;
    this.openedAt = performance.now();
    const now = performance.now();
    this.last = null;
    this.nextBlink = now + 2200;
    this.nextActivity = now + 8000;
    this.load();
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', () => this.onUp());
    canvas.addEventListener('pointercancel', () => this.onUp());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.fit());
    requestAnimationFrame((t) => this.loop(t));
  }

  load() {
    for (const id of [
      'neutral', 'idle-blink_half', 'idle-blink_closed', 'idle-wink_half', 'idle-wink_closed',
      'idle-mouth_small', 'idle-mouth_round', 'idle-mouth_wide',
      'flirty', 'happy', 'smirk', 'attentive', 'thinking',
      'idle-laughing', 'idle-excited', 'idle-heart_hands',
      'idle-wave_raise', 'idle-wave_a', 'idle-wave_b',
    ]) {
      const img = new Image();
      img.src = `../../assets/capri/portrait/${id}.png`;
      this.images.set(id, img);
    }
  }

  play(id, now) {
    const clip = CLIPS[id];
    if (!clip) return;
    this.sequence = {
      id,
      start: now,
      frames: clip.map(([frame, ms]) => ({ id: frame, ms })),
    };
  }

  advance(now) {
    if (!this.sequence) return false;
    let age = now - this.sequence.start;
    for (const frame of this.sequence.frames) {
      if (age < frame.ms) {
        this.frame = frame.id;
        return true;
      }
      age -= frame.ms;
    }
    this.sequence = null;
    return false;
  }

  attend(now) {
    this.nextActivity = now + 18000;
  }

  setBusy(on) {
    this.busy = on;
    if (on) this.attend(performance.now());
  }

  setSpeaking(on) {
    this.speaking = on;
    if (on) {
      this.busy = false;
      this.attend(performance.now());
    }
  }

  notice() {
    if (this.petting || this.speaking) return;
    const now = performance.now();
    this.sequence = { id: 'notice', start: now, frames: [{ id: 'attentive', ms: 900 }] };
    this.attend(now);
  }

  reply() {
    this.speaking = false;
    this.busy = false;
    const now = performance.now();
    this.play(Math.random() < 0.45 ? 'laugh' : 'delight', now);
    this.nextBlink = now + 3000 + Math.random() * 3000;
  }

  calm() {
    this.speaking = false;
    this.busy = false;
    this.sequence = null;
    this.frame = 'neutral';
  }

  begin() {
    if (this.arriveAt == null) this.arriveAt = performance.now();
  }

  onDown(e) {
    if (!this.arrived || e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { x: e.offsetX, y: e.offsetY, moved: 0, winked: false, hands: false };
    this.petting = true;
    this.attend(performance.now());
  }

  onMove(e) {
    if (!this.arrived || !this.drag) return;
    this.drag.moved += Math.hypot(e.movementX, e.movementY);
    const cx = this.canvas.clientWidth / 2;
    const cy = this.canvas.clientHeight / 2;
    this.lean.x = Math.max(-8, Math.min(8, ((e.offsetX - cx) / Math.max(1, cx)) * 8));
    this.lean.y = Math.max(-6, Math.min(6, ((e.offsetY - cy) / Math.max(1, cy)) * 6));
    if (this.drag.moved > 24) this.stroke(e.offsetX, e.offsetY);
  }

  onUp() {
    if (!this.drag) return;
    const tap = this.drag.moved < 24;
    const x = this.drag.x;
    const y = this.drag.y;
    this.drag = null;
    this.petting = false;
    this.lean.x = 0;
    this.lean.y = 0;
    this.petUntil = performance.now() + 700;
    if (tap) {
      this.burst(x, y);
      this.play('wink', performance.now());
    }
  }

  stroke(x, y) {
    const now = performance.now();
    if (now - this.burstAt >= 220) this.burst(x, y);
    if (!this.drag.winked) {
      this.drag.winked = true;
      this.play('wink', now);
    } else if (this.drag.moved > 160 && !this.drag.hands) {
      this.drag.hands = true;
      this.play('heart_hands', now);
    }
  }

  burst(x, y) {
    this.burstAt = performance.now();
    for (let i = 0; i < 4; i++) {
      this.hearts.push({
        x, y,
        vx: (i - 1.5) * 16,
        vy: -26 - i * 7,
        born: this.burstAt,
        life: 1450,
      });
    }
  }

  tick(now) {
    const gap = this.last == null ? 0 : Math.max(0, now - this.last);
    if (gap > 1000) {
      if (this.sequence) this.sequence.start += gap;
      this.nextActivity += gap;
      this.nextBlink += gap;
    }
    this.last = now;
    const affectionate = this.petting || now < this.petUntil;
    if (this.speaking) {
      if (!this.sequence || this.sequence.id !== 'speech') this.play('speech', now);
      if (!this.advance(now)) this.play('speech', now);
      return;
    }
    if (affectionate) {
      const clip = this.sequence && (this.sequence.id === 'wink' || this.sequence.id === 'heart_hands');
      if (clip) {
        if (!this.advance(now)) this.frame = 'flirty';
      } else if (!this.sequence) this.frame = 'flirty';
      else this.advance(now);
      return;
    }
    if (this.busy) {
      this.sequence = null;
      this.frame = 'attentive';
      return;
    }
    if (this.sequence) {
      if (this.advance(now)) return;
      this.nextActivity = now + 12000 + Math.random() * 6000;
    }
    if (now >= this.nextActivity) {
      const roll = Math.random();
      this.play(roll < 0.55 ? 'wink' : 'wave', now);
      this.advance(now);
      return;
    }
    if (now >= this.nextBlink) {
      const age = now - this.nextBlink;
      if (age < 280) {
        this.frame = age < 80 || age > 190 ? 'idle-blink_half' : 'idle-blink_closed';
        return;
      }
      this.nextBlink = now + 3000 + Math.random() * 4500;
    }
    this.frame = 'neutral';
  }

  fit() {
    const stage = this.canvas.parentElement;
    const side = Math.max(32, Math.floor(Math.min(stage.clientWidth, stage.clientHeight)));
    if (side === this.side) return;
    this.side = side;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${side}px`;
    this.canvas.style.height = `${side}px`;
    this.canvas.width = Math.floor(side * this.dpr);
    this.canvas.height = Math.floor(side * this.dpr);
  }

  drawHeart(ctx, x, y, s, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff4fd8';
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.bezierCurveTo(-7, -3, -3.2, -8, 0, -4.2);
    ctx.bezierCurveTo(3.2, -8, 7, -3, 0, 3);
    ctx.fill();
    ctx.restore();
  }

  draw(now) {
    this.fit();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const img = this.images.get(this.frame) || this.images.get('neutral');
    if (img && img.complete && img.naturalWidth) {
      const bleed = 1.05;
      const dw = w * bleed;
      const dh = h * bleed;
      const lx = this.lean.x * this.dpr;
      const ly = this.lean.y * this.dpr;
      ctx.drawImage(img, (w - dw) / 2 + lx, (h - dh) / 2 + ly, dw, dh);
    }
    const alive = [];
    for (const heart of this.hearts) {
      const age = now - heart.born;
      if (age < 0 || age > heart.life) continue;
      alive.push(heart);
      const t = age / heart.life;
      const x = (heart.x + heart.vx * t) * this.dpr;
      const y = (heart.y + heart.vy * t - 18 * t) * this.dpr;
      this.drawHeart(ctx, x, y, this.dpr * (0.7 + t * 0.8), 1 - t);
    }
    this.hearts = alive;
  }

  drawArrival(t) {
    this.fit();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (t < 280) return;
    const beam = Math.min(1, (t - 280) / 240);
    const bw = Math.max(2 * this.dpr, w * 0.018);
    const top = h * (1 - beam);
    const grad = ctx.createLinearGradient(0, top, 0, h);
    grad.addColorStop(0, 'rgba(62,240,255,0)');
    grad.addColorStop(0.18, 'rgba(62,240,255,0.95)');
    grad.addColorStop(1, 'rgba(255,79,216,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect((w - bw) / 2, top, bw, h - top);
    ctx.fillStyle = '#f6e9ff';
    ctx.fillRect((w - bw * 0.22) / 2, top, bw * 0.22, h - top);
    if (t < 500) return;
    const img = this.images.get('neutral');
    if (!img || !img.complete || !img.naturalWidth) return;
    const unfold = Math.min(1, (t - 500) / 420);
    const ease = 1 - (1 - unfold) ** 3;
    const sx = 0.035 + ease * 0.965;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(sx, 1);
    const dw = w * 1.05;
    const dh = h * 1.05;
    if (unfold < 0.92) {
      const bands = 6;
      const cellH = img.naturalHeight / bands;
      const slice = dh / bands;
      for (let i = 0; i < bands; i++) {
        const jx = Math.sin(t / 38 + i * 1.7) * (w * 0.028) / sx;
        ctx.drawImage(
          img, 0, i * cellH, img.naturalWidth, cellH,
          -dw / 2 + jx, -dh / 2 + i * slice, dw, slice + this.dpr,
        );
      }
    } else {
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
    if (t >= 940 && t < 1000) {
      ctx.fillStyle = 'rgba(57, 255, 106, 0.72)';
      ctx.fillRect(0, 0, w, h);
    } else if (t >= 1000 && t < 1060) {
      ctx.fillStyle = 'rgba(8, 2, 16, 0.78)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  loop(now) {
    if (!this.arrived) {
      if (this.arriveAt == null && now - this.openedAt > 1600) this.arriveAt = now;
      const t = this.arriveAt == null ? 0 : now - this.arriveAt;
      this.drawArrival(t);
      const img = this.images.get('neutral');
      const ready = img && img.complete && img.naturalWidth;
      if (this.arriveAt != null && ((t >= 1100 && ready) || t >= 1800)) {
        this.arrived = true;
        this.last = null;
        this.nextBlink = now + 2200;
        this.nextActivity = now + 8000;
      }
    } else {
      this.tick(now);
      this.draw(now);
    }
    requestAnimationFrame((t) => this.loop(t));
  }
}

const portrait = new Portrait($('portrait'));
host.onHomeArrive(() => portrait.begin());
