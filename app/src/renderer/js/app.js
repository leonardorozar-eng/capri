import { Capri } from './capri.js';
import { FxLayer, GRAB_FRAMES } from './fx.js';
import { Chip, Mask } from './chip.js';
import { Panel } from './panel.js';
import { Voice } from './voice.js';
import { Brain } from './brain.js';
import { Guide } from './guide.js';
import { Mission } from './mission.js';
import { Chat } from './chat.js';
import { Setup } from './setup.js';
import { Custom } from './custom.js';
import { Bond, Jealousy } from './bond.js';
import { Reminders, clock } from './reminders.js';
import { Look } from './look.js';
import { Pc } from './pc.js';
import { Care } from './care.js';
import { Breaks } from './breaks.js';
import { linesFor } from './lines.js';
import { pick, fmt, reducedMotion } from './util.js';
import { Strips } from './strips.js';
import { Body } from './body.js';

const host = window.host;

// config.lang can be "auto". Her lines here follow the language she is actually using.
function speechCode(lang) {
  const raw = String(lang || '').toLowerCase();
  const nav = (navigator.language || 'en').toLowerCase();
  const code = raw === 'auto' || raw === '' ? nav : raw;
  if (code.startsWith('pt')) return 'pt';
  if (code.startsWith('es')) return 'es';
  if (code.startsWith('fr')) return 'fr';
  if (code.startsWith('ru')) return 'ru';
  return 'en';
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// close-ups of her for the cut-ins, frames of the show (tools/build-cutins.py)
const CUTINS = ['grin', 'laugh', 'eyes', 'many', 'look'];
const WATCH_MS = 2000; // how often she checks the pointer still reaches her
const FOLLOW_AFTER = 2; // checks in a row with the pointer on another screen before she follows it there
const AWAY_MS = 15 * 60 * 1000; // the pointer still this long: you were away from your PC
const SNOOZE_MS = 10 * 60 * 1000;

// what you made her, from the config (custom.js)
const mine = (cfg) => ({ userName: cfg.userName || '', persona: cfg.persona || '', myLines: cfg.myLines || [], memories: cfg.memories || [] });

// Her cursor, drawn on the overlay. It never moves the real pointer.
class Hands {
  constructor() {
    this.n = 0;
    this.el = document.createElement('div');
    this.el.className = 'capri-hand';
    this.el.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'capri';
    this.el.appendChild(label);
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.x = innerWidth * 0.5;
    this.y = innerHeight * 0.45;
    this.tx = this.x;
    this.ty = this.y;
    this.raf = 0;
    this.next = 0;
    this.onBusy = null;
  }

  get active() { return this.n > 0; }

  begin() {
    this.n += 1;
    if (this.n > 1) return;
    this.el.hidden = false;
    this.pick();
    this.step();
    this.onBusy?.();
  }

  end() {
    if (this.n === 0) return;
    this.n -= 1;
    if (this.n > 0) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.el.hidden = true;
    this.onBusy?.();
  }

  stop() {
    if (!this.n) return;
    this.n = 1;
    this.end();
  }

  pick() {
    this.tx = 80 + Math.random() * Math.max(40, innerWidth - 160);
    this.ty = 80 + Math.random() * Math.max(40, innerHeight - 160);
    this.next = performance.now() + 700 + Math.random() * 900;
  }

  step() {
    if (!this.n) return;
    if (performance.now() > this.next) this.pick();
    this.x += (this.tx - this.x) * 0.08;
    this.y += (this.ty - this.y) * 0.08;
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
    if (this.n) this.raf = requestAnimationFrame(() => this.step());
  }
}

// Up to four copies of her face. They wander and talk. They do not touch windows or files.
class Clones {
  constructor() {
    this.items = [];
    this.timer = 0;
    this.raf = 0;
    this.onBusy = null;
    this.speak = null;
    this.lines = ['Cópia pronta.', 'Mais uma.', 'A gente fica.', 'Tô aqui.'];
  }

  get count() { return this.items.length; }

  summon(n) {
    const add = Math.min(4 - this.items.length, Math.max(0, n | 0));
    if (add <= 0) return 0;
    for (let i = 0; i < add; i += 1) this.spawn();
    this.speak?.(this.lines[Math.min(this.items.length, this.lines.length) - 1]);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.clear(), 60000);
    if (!this.raf) this.step();
    this.onBusy?.();
    return this.items.length;
  }

  spawn() {
    const img = document.createElement('img');
    img.className = 'capri-clone';
    img.alt = '';
    img.src = '../../assets/capri/capri-face.png';
    document.body.appendChild(img);
    this.items.push({
      el: img,
      x: Math.random() * Math.max(1, innerWidth - 80),
      y: Math.random() * Math.max(1, innerHeight - 80),
      vx: (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.7),
      vy: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.6),
    });
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = 0;
    for (const item of this.items) item.el.remove();
    this.items = [];
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onBusy?.();
  }

  step() {
    if (!this.items.length) {
      this.raf = 0;
      return;
    }
    for (const item of this.items) {
      item.x += item.vx;
      item.y += item.vy;
      if (item.x < 0 || item.x > innerWidth - 72) item.vx *= -1;
      if (item.y < 0 || item.y > innerHeight - 72) item.vy *= -1;
      item.el.style.transform = `translate(${item.x}px, ${item.y}px)`;
    }
    this.raf = this.items.length ? requestAnimationFrame(() => this.step()) : 0;
  }
}

async function boot() {
  const [config, image, intro, ...cutins] = await Promise.all([
    host.getConfig(),
    loadImage('../../assets/capri/capri-full.png'),
    // her intro: her close-up grabbing the screen, and its drawings with her mouth and arm moving
    Promise.all(GRAB_FRAMES.map((name) => loadImage(`../../assets/capri/intro-${name}.webp`).catch(() => null)))
      // decoded now, not the first time each one shows up (a hitch right on "hi", on the wave)
      .then((cels) => Promise.all(cels.map((cel) => cel && createImageBitmap(cel))))
      .then((cels) => (cels[0] ? Object.fromEntries(GRAB_FRAMES.map((name, i) => [name, cels[i]])) : null)),
    ...CUTINS.map((name) => loadImage(`../../assets/capri/cutin-${name}.png`)),
    document.fonts.load('600 16px "Chakra Petch"'),
    document.fonts.load('400 11px "JetBrains Mono"'),
  ]);
  document.documentElement.lang = config.lang;
  // her animations: like Windows, full or reduced (her menu)
  const applyMotion = (setting) => {
    reducedMotion.setting = setting || 'auto';
    document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'full';
  };
  applyMotion(config.motion);
  reducedMotion.onSystemChange(() => applyMotion(reducedMotion.setting));
  // her windows: Night City, or her first ones (her menu, classic.css)
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme || 'nightcity';
  };
  applyTheme(config.theme);

  const fx = new FxLayer(document.getElementById('fx'), {
    cutins: Object.fromEntries(CUTINS.map((name, i) => [name, cutins[i]])),
    intro,
  });
  fx.resize(innerWidth, innerHeight);
  // how far the top of the taskbar is from the bottom of her window: she covers it too while she
  // rests on it (the floor she stands on stays its top)
  let floorGap = config.floorGap ?? 0;
  const chip = new Chip(document.getElementById('chip'));
  chip.place(innerWidth, innerHeight - floorGap);
  const mask = new Mask(document.getElementById('mask'));

  const voice = new Voice();
  voice.configure(config);
  host.listSounds().then((list) => list.length && voice.loadCustom(list));

  const panel = new Panel({
    panel: document.getElementById('panel'),
    ticker: document.getElementById('ticker'),
    labels: linesFor(config.lang, config.assistant),
  });

  const capri = new Capri({
    root: document.getElementById('capri'),
    canvas: document.getElementById('sprite'),
    image,
    fx,
    voice,
  });
  capri.wander = config.wander;
  capri.possessWindows = config.possess;
  capri.restOn = config.rest || 'corner';
  capri.setView(innerWidth, innerHeight, innerHeight - floorGap);
  capri.setScale(config.scale);

  const mission = new Mission();
  const brain = new Brain({ capri, panel, voice, host, mission, lang: config.lang, assistant: config.assistant });

  // Click-through everywhere except on her body, the panel and her biochip.
  let interactive = false;
  let mouse = null;
  const setInteractive = (on) => {
    if (on === interactive) return;
    interactive = on;
    host.setInteractive(on);
  };
  const onChip = () => Boolean(chip.visible && mouse && chip.contains(mouse.x, mouse.y, 0));
  const refreshHit = () => {
    if (capri.dragging || capri.holding) return setInteractive(true);
    if (!mouse) return setInteractive(false);
    const r = panel.rect();
    const onPanel = r && mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom;
    document.body.style.cursor = onChip() ? 'pointer' : '';
    return setInteractive(Boolean(onPanel || capri.hit(mouse.x, mouse.y) || onChip()));
  };
  // Her biochip: her eyes on it follow the pointer over it, and she comes out when you click it
  // (only then, so the pointer passing through that corner doesn't call her back).
  // Her mask, asleep: the pointer coming over it stirs her, and a moment of that wakes her up.
  let wakeTimer = 0;
  const comeOut = () => {
    if (capri.stowed) host.setConfig({ visible: true }); // the tray and Ctrl+Alt+C follow
    capri.unstow();
  };
  const hoverChip = () => {
    chip.pointer = chip.visible && mouse && chip.contains(mouse.x, mouse.y) ? mouse : null;
    const near = mask.visible && mouse && mask.contains(mouse.x, mouse.y, 30);
    mask.pointer = near ? mouse : null;
    if (!near) {
      clearTimeout(wakeTimer);
      wakeTimer = 0;
    } else if (!wakeTimer) {
      wakeTimer = setTimeout(() => {
        wakeTimer = 0;
        if (capri.dormant) capri.wake();
      }, 400);
    }
  };
  let lastMove = performance.now();
  let onBack = null; // (away ms) => you're back at your PC after a while (the bond, below)
  window.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastMove > AWAY_MS) onBack?.(now - lastMove);
    lastMove = now;
    mouse = { x: e.clientX, y: e.clientY };
    refreshHit();
    hoverChip();
  });
  document.addEventListener('mouseleave', () => {
    mouse = null;
    refreshHit();
    hoverChip();
  });
  // Where the pointer really is, every couple of seconds: if it moved over her window and no
  // mousemove came, the hook that brings it to her is gone (Windows drops it without a word, after
  // sleep say), and main.js puts in a new one.
  let seen = null;
  let rearmedAt = -Infinity;
  let follow = null; // (pointer) => she may follow it to another screen (below)
  setInterval(async () => {
    const at = await host.cursor().catch(() => null);
    const before = seen;
    seen = at;
    follow?.(at);
    if (!at?.inside) return;
    const now = performance.now();
    // the pointer is on her and she isn't clickable (its moves stopped reaching her): she is now
    if (!interactive && now - lastMove > WATCH_MS) {
      mouse = { x: at.x, y: at.y };
      refreshHit();
    }
    if (!before?.inside || (at.x === before.x && at.y === before.y)) return;
    if (now - lastMove < WATCH_MS * 1.5 || now - rearmedAt < 20000) return;
    rearmedAt = now;
    host.rearm();
  }, WATCH_MS);
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) host.openMenu();
  });
  window.addEventListener('click', (e) => {
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) comeOut();
  });

  // wiring
  capri.onMove = (head) => {
    // pointing at something: the panel goes on her other side, so it doesn't cover it
    panel.setAnchor({ ...head, lean: capri.pointing ? -capri.pointing.dir : 0 }, capri.view);
    // she may have moved out from under a still pointer: never leave a dead click zone behind
    refreshHit();
  };
  capri.onTeleport = (phase) => (phase === 'start' ? panel.suspend() : panel.resume());
  capri.chipAt = () => chip.center();
  capri.onStow = () => {
    chip.setMode(capri.mode);
    chip.show();
  };
  capri.onUnstow = () => chip.hide();
  capri.onDoze = (phase, face) => {
    if (phase === 'start') {
      mask.place(face.x, face.y, capri.scale * 1.1);
      mask.show();
    } else if (phase === 'waking') {
      mask.wake();
    } else {
      mask.hide();
    }
  };
  capri.onMode = (mode, prev) => chip.setMode(mode, prev);
  // now and then she says something about the satellite: while she looks at it, or once
  // the red light has gone up (never during, nothing should cover that)
  capri.onGaze = (when) => {
    const lines = when === 'end' ? brain.t.uplink : brain.t.gaze;
    if (!panel.visible && Math.random() < (when === 'end' ? 0.6 : 0.4)) panel.say({ kind: 'info', line: pick(lines), hold: 3800 });
  };
  panel.onChar = (kind) => voice.play('blip', { mood: kind });
  panel.onTalk = (talking) => talking && capri.perform('talk');
  capri.onMenu = () => host.openMenu();

  // Her guide (guide.js): her welcome on first launch, and "How does it work?" in her menu,
  // where she takes you to things and points at them.
  const guide = new Guide({ capri, panel, voice, host, brain });
  // Talking to her (chat.js): "Talk to her" in her menu, or the button when you click her idle.
  const chat = new Chat({ capri, panel, voice, host, brain });
  const hands = new Hands();
  const clones = new Clones();
  const pokeBusy = () => host.handsBusy(hands.active || clones.count > 0);
  hands.onBusy = pokeBusy;
  clones.onBusy = pokeBusy;
  clones.speak = (line) => chat.speak(line);
  chat.hands = hands;
  chat.clones = clones;
  const desk = { home: config.homeStay === true };
  const said = panel.say.bind(panel);
  const sayAtHome = (msg) => {
    panel.hide();
    const line = msg?.line ? String(msg.line) : '';
    const quote = msg?.quote ? String(msg.quote) : '';
    const text = [line, quote].filter(Boolean).join('\n');
    if (text) {
      host.homeLine({ role: 'capri', text, done: true });
      if (msg.kind !== 'work') chat.speak(line || text);
    }
    if (msg?.actions?.length) {
      chat.homeAction = typeof msg.onAction === 'function' ? msg.onAction : null;
      host.homeLine({
        role: 'actions',
        actions: msg.actions.map((a) => ({ id: a.id, label: a.label, primary: Boolean(a.primary) })),
      });
    }
    return Boolean(text || msg?.actions?.length);
  };
  panel.say = (msg) => {
    if (desk.home) {
      panel.hide();
      // The desktop chat card is an input bubble. Inside the window, the composer is already there.
      if (msg?.kind === 'chat') return false;
      return sayAtHome(msg);
    }
    const shown = said(msg);
    if (shown !== false && msg?.line && msg.kind !== 'work') chat.speak(msg.line);
    return shown;
  };
  const ticked = typeof panel.setTicker === 'function' ? panel.setTicker.bind(panel) : null;
  if (ticked) {
    panel.setTicker = (info) => ticked(desk.home ? null : info);
  }
  const streamed = panel.stream.bind(panel);
  panel.stream = (text, opts = {}) => {
    if (desk.home) {
      panel.hide();
      const line = String(text || '');
      if (line) host.homeLine({ role: 'capri', text: line, done: Boolean(opts.done) });
      if (opts.done && line) chat.speak(line.split('\n').slice(-2).join(' '));
      return;
    }
    return streamed(text, opts);
  };
  const handStyle = document.createElement('style');
  handStyle.textContent = '.capri-hand{position:fixed;left:0;top:0;z-index:4;width:14px;height:14px;pointer-events:none;border-radius:50%;background:#ff2a4a;box-shadow:0 0 0 2px #fff,7px 9px 0 -2px #ff2a4a}.capri-hand span{position:absolute;left:16px;top:10px;font:11px/1 "Segoe UI",sans-serif;color:#fff;background:#14141c;padding:2px 5px;border-radius:4px;white-space:nowrap}.capri-clone{position:fixed;left:0;top:0;z-index:2;width:72px;height:72px;pointer-events:none;border-radius:50%;object-fit:cover;filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))}';
  document.head.appendChild(handStyle);
  brain.onTalk = () => chat.start();
  // Getting her chat going with buttons (setup.js): Ollama and a model, a key, or an address
  const setup = new Setup({ guide, panel, host, brain, capri, voice });
  guide.setup = setup;
  guide.onTalk = () => chat.start();
  chat.onSetup = (status) => setup.chat(status);
  chat.onBetterModel = () => setup.better();
  setup.onReady = () => chat.start();
  // What she calls you, how she is, your lines, what she remembers (custom.js)
  const custom = new Custom({ guide, host, brain, capri, voice });
  guide.custom = custom;
  brain.custom = mine(config);

  // How close she is to you (bond.js), her jealousy of your other AIs, the reminders she keeps.
  const bond = new Bond({ host, data: config.bond });
  brain.bond = bond;
  chat.bond = bond;
  capri.fondness = bond.stage;
  const jealousy = new Jealousy({ capri, panel, brain, bond, chat, guide, host });
  jealousy.enabled = config.jealous !== false;
  jealousy.closePages = config.closePages !== false;
  chat.jealousy = jealousy;
  brain.onRival = (key) => jealousy.onRivalEvent(key);
  const reminders = new Reminders({ host, list: config.reminders || [] });
  chat.reminders = reminders;
  chat.onMessage = () => bond.add('chat', 2);
  // looking at your screen (look.js): when you ask, or now and then if you turned it on
  const look = new Look({ capri, panel, brain, chat, guide, host, fx, voice, active: () => performance.now() - lastMove });
  look.configure(config);
  chat.look = look; // "regarde mon écran" in her chat
  // your PC as she feels it (pc.js): the processor, the battery, the network, a USB stick, a game
  const pc = new Pc({ capri, panel, brain, host, voice, chat, guide });
  pc.enabled = config.pcReact !== false;
  const care = new Care({ chat, host, panel, brain, capri });
  chat.care = care;
  let wantsOut = config.visible !== false; // not put away in your settings (Ctrl+Alt+C, her menu)
  let homeStay = config.homeStay === true;
  let homeCovered = false;
  let coverToken = 0;
  pc.wantsOut = () => wantsOut;
  const breaks = new Breaks({
    host, panel, brain, capri, pc,
    quiet: () => !chat.open && !homeCovered && !homeStay && !capri.hidden && !capri.stowed
      && !capri.busy && !guide.running && (!panel.visible || ['idle', 'info'].includes(panel.current?.kind)),
  });
  breaks.enabled = config.breaks !== false;

  // A click, with no drag: the desktop conversation. A drag still picks her up, and a flick still throws her.
  // Sulking, she turns her back on you. About to close one of your other AIs' pages, she leaves it.
  capri.onClick = () => {
    if (desk.home) return;
    if (jealousy.spare()) return;
    if (jealousy.onClick()) return;
    if (panel.visible && !chat.open) panel.hide();
    chat.start();
    bond.add('click', 1);
  };

  // Rub the pointer back and forth on her head: she leans into it and says so. A click still talks.
  let patSaid = 0;
  capri.onPat = () => {
    const now = performance.now();
    if (now - patSaid < 12000 || capri.hidden || capri.stowed) return;
    patSaid = now;
    bond.add('click', 1);
    const lines = {
      pt: ['Ei. Continua.', 'Tá. Gostei.', 'Sem pressa.', 'Mais um pouco.'],
      en: ['Hey. Keep going.', 'Okay. I like that.', 'No rush.', 'A little more.'],
      es: ['Eh. Sigue.', 'Está. Me gusta.', 'Sin prisa.', 'Un poco más.'],
      fr: ['Hé. Continue.', 'D’accord. J’aime ça.', 'Sans te presser.', 'Encore un peu.'],
      ru: ['Эй. Продолжай.', 'Ладно. Мне нравится.', 'Не спеши.', 'Ещё немного.'],
    };
    panel.say({ kind: 'info', face: 'laugh', line: pick(lines[speechCode(brain.lang)] || lines.en), hold: 2400 });
  };

  // Petted (your pointer back and forth over her mane): she purrs, says something now and then
  // (shy before she's attached to you), and it brings you a little closer. Too long and she's had
  // enough: a zap at your pointer.
  let petTalk = 0;
  capri.onPet = (phase) => {
    const t = brain.t.pet;
    const quiet = !chat.open && (!panel.visible || ['idle', 'info'].includes(panel.current?.kind));
    if (phase === 'start') {
      bond.add('pet', 1);
      if (!['angry', 'sulk'].includes(bond.feeling)) bond.feel('petted');
      const now = performance.now();
      if (quiet && now - petTalk > 90000) {
        petTalk = now;
        const attached = bond.stage >= 2;
        panel.say({ kind: 'info', face: attached ? 'smug' : 'wide', line: pick(attached ? t.high : t.low), hold: 3000 });
      }
    } else if (phase === 'enough') {
      if (quiet) panel.say({ kind: 'info', face: 'many', line: pick(t.enough), hold: 3000 });
      if (!mouse || !capri.zap(mouse.x, mouse.y)) capri.perform('huff', capri.towardCenter());
    }
  };

  const groove = async () => {
    try {
      const info = await host.nowPlaying();
      capri.grooving = Boolean(info && info.status === 'Playing');
    } catch {
      capri.grooving = false;
    }
  };
  setTimeout(groove, 1500);
  setInterval(groove, 5000);
  const strips = new Strips(() => !capri.hidden && !capri.stowed && !capri.dragging && !capri.busy && !chat.open);
  chat.strips = strips;
  const body = new Body(() => strips.playing);
  body.attach(capri);
  capri.listen = Boolean(config.listen);
  capri.onWindowPose = () => true;


  // Thrown around (capri.js throwHer): she says how it was. The first time she's shaken (or she
  // loves it, once she's attached to you); twice in a row she's dizzy and fed up; three times in
  // two minutes she zaps your pointer and won't let you pick her up for a bit.
  const throws = [];
  capri.onThrown = ({ how, hard = 0 }) => {
    const t = brain.t.thrown;
    if (how === 'leap') {
      if (Math.random() < 0.4) panel.say({ kind: 'info', face: 'smug', line: pick(brain.t.screens.hello), hold: 3000 });
      return;
    }
    const now = performance.now();
    throws.push(now);
    while (throws.length && now - throws[0] > 120000) throws.shift();
    // how she says it, and how she feels about it after (her chat knows: bond.js)
    let line, face = 'smug', feel = null;
    if (throws.length >= 3) {
      throws.length = 0;
      line = pick(t.angry);
      face = 'many';
      feel = 'angry';
      capri.refuseUntil = now + 25000;
      bond.lose(1);
      if (mouse) capri.zap(mouse.x, mouse.y);
    } else if (how === 'ledge') line = pick(t.ledge);
    else if (how === 'feet') line = pick(t.feet);
    else if (throws.length === 2) {
      line = pick(t.again);
      face = 'aside';
      feel = 'dizzy';
    } else if (hard > 0.75 && Math.random() < 0.5) {
      line = pick(t.screen);
      face = 'laugh';
      feel = 'thrown';
    } else if (bond.stage >= 3) {
      line = pick(t.fun);
      face = 'laugh';
      feel = 'fun';
    } else {
      line = pick(t.ow);
      face = 'wide';
      feel = 'thrown';
    }
    if (feel && bond.feeling !== 'angry') bond.feel(feel);
    panel.say({ kind: 'info', face, line, hold: 3800 });
  };
  // you said sorry in her chat: she lets it go (and lets you pick her up again)
  bond.onCalm = () => {
    jealousy.forgive();
    capri.refuseUntil = 0;
  };
  capri.onDodge = () => panel.say({ kind: 'info', face: 'smug', line: pick(brain.t.thrown.dodge), hold: 2500 });

  // A new stage with you: her minds come out to look at you, and she says so, the sync bar under it.
  // At a quiet moment, so it isn't missed.
  let newStage = 0;
  bond.onStage = (stage) => {
    newStage = stage;
    capri.fondness = stage;
  };
  const quiet = () => !capri.busy && !capri.act && !capri.dragging && !capri.stowed && !capri.dormant && !capri.hidden
    && capri.mode !== 'alert' && !chat.open && !guide.running && !panel.visible && ['stand', 'sit'].includes(capri.stance);
  setInterval(async () => {
    if (!newStage || !quiet()) return;
    const stage = newStage;
    newStage = 0;
    const up = brain.t.bond.up[stage];
    if (!['angry', 'sulk'].includes(bond.feeling)) bond.feel('happy', { percent: bond.percent });
    voice.play('star');
    await capri.perform('split');
    capri.perform('hop');
    panel.say({
      kind: 'done', badge: `${brain.t.state.info} ${bond.percent}%`, face: stage >= 3 ? 'laugh' : 'look',
      line: fmt(up.line, { percent: bond.percent }), quote: up.quote, progress: bond.percent / 100, hold: 9000,
    });
  }, 3000);
  // time spent together: a little sync for every ten minutes you're at your PC with her out
  setInterval(() => {
    if (performance.now() - lastMove < 10 * 60 * 1000 && !capri.stowed) bond.add('time', 1);
  }, 10 * 60 * 1000);
  // back at your PC after a while: once she's attached to you, she's glad to see you
  onBack = () => {
    if (bond.stage < 2 || capri.stowed) return;
    capri.wake();
    setTimeout(() => {
      if (!quiet()) return;
      capri.perform('hop');
      panel.say({ kind: 'idle', face: 'look', line: pick(brain.t.bond.back), hold: 3500 });
    }, 700);
  };

  // A reminder due: she comes and finds you (on whichever screen you're on), and holds it up until
  // you say it's done or ask for ten more minutes. One that came due while she was off, she brings
  // up when she's back. Talking with her, it comes in the chat.
  const startedAt = Date.now();
  const remind = async (r) => {
    const t = brain.t.remind;
    const time = clock(r.at, brain.lang);
    const missed = r.at < startedAt - 60000;
    const line = missed
      ? fmt(r.text ? t.missed : t.missedBare, { text: r.text, time })
      : fmt(pick(r.text ? t.now : t.nowBare), { text: r.text });
    let answered = false;
    const onAction = (id) => {
      answered = true;
      if (id === 'snooze') {
        reminders.snooze(r.id, SNOOZE_MS);
        panel.setActions([]);
        if (chat.open) chat.interject(t.snoozed, [], null);
        else panel.say({ kind: 'info', face: 'smug', line: t.snoozed, hold: 2500 });
        return;
      }
      reminders.remove(r.id);
      bond.add('remind', 2);
      panel.setActions([]);
      if (chat.open) chat.interject(pick(t.doneLine), [], null);
      else panel.say({ kind: 'info', face: 'smug', line: pick(t.doneLine), hold: 2500 });
    };
    const actions = [{ id: 'done', label: t.done, primary: true }, { id: 'snooze', label: t.snooze }];
    voice.play('remind');
    for (let i = 0; chat.open && chat.turn && i < 60; i++) await wait(500); // her answer first
    if (chat.open && chat.interject(line, actions, onAction)) {
      // read in the chat: closed (or talked over) without a button, it counts as seen
      while (!answered && chat.open) await wait(1000);
      if (!answered) reminders.remove(r.id);
      return;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    await until(() => !capri.busy && !capri.dragging, 8000);
    await capri.toPointer(await host.cursor().catch(() => null));
    capri.perform('hop');
    const shownAt = performance.now();
    const shown = panel.say({
      kind: 'remind', face: 'look', line, quote: missed ? '' : fmt(t.asked, { time }), actions, onAction, hold: null,
      // closed without an answer: seen, if it was up long enough to read; else back in a couple of minutes
      onLeave: () => {
        if (answered) return;
        if (performance.now() - shownAt > 2500) reminders.remove(r.id);
        else reminders.snooze(r.id, 2 * 60 * 1000);
      },
    });
    if (!shown) reminders.snooze(r.id, 60 * 1000); // something more important on: in a minute
  };
  reminders.onDue = (r) => remind(r).catch((err) => {
    console.error('[capri] reminder', err);
    reminders.snooze(r.id, 60 * 1000);
  });
  // the first Claude Code event that ever reaches her: so you know it worked
  brain.linked = config.linked;
  brain.watching = config.claude !== false;
  brain.onLinked = () => {
    host.setConfig({ linked: true, welcomed: true });
    voice.play('hello');
    capri.greet();
    capri.perform('hop');
    panel.say({ kind: 'done', badge: 'LINK', line: brain.t.welcome.linked, hold: 6000 });
  };

  // The demo's second half, after its fake Claude session: everything she does on her own, one
  // after the other, a line before each.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (done, max = 15000) => {
    for (const t0 = Date.now(); !done() && Date.now() - t0 < max;) await wait(100);
  };
  const free = () => !capri.busy && !capri.act && capri.stance !== 'fall';
  brain.onShowcase = async () => {
    const t = brain.t.showcase;
    const caption = (line) => panel.say({ kind: 'info', line, hold: 2200 });
    capri.nextMove = capri.nextGaze = performance.now() + 120000; // nothing of her own in between
    if (capri.stowed) await capri.unstow();
    if (capri.dormant) capri.wake();
    await until(free);
    panel.hide();

    caption(t.minds);
    await wait(1000);
    await capri.perform('split');
    await wait(900);

    caption(t.zap);
    await wait(1000);
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    await wait(1800);

    panel.hide();
    if (capri.gaze({ big: true })) await until(() => !capri.sky);
    await wait(2500);

    // a little terminal opens for her to take over, and closes under her once she's done with it
    if (capri.possessWindows && (await host.demoWindow(true))) {
      const top = () => capri.windows.wins.find((w) => capri.canSit(w)); // it opens on top of everything
      await until(top, 4000);
      const win = top();
      const seat = win && { win, dx: win.w * 0.4 };
      if (seat) {
        panel.hide();
        await capri.sitOn(seat);
        await until(free);
        caption(t.possess);
        await wait(1400);
        panel.hide();
        await capri.possess();
        await wait(1800);
      }
      host.demoWindow(false);
      await wait(400);
      await until(free); // she may have fallen off it
      await wait(900);
    }

    caption(t.sleep);
    await wait(1400);
    panel.hide();
    capri.setMode('sleep');
    await wait(2500); // dozing off
    await capri.doze();
    await wait(4500);
    capri.wake();
    await until(free);
    await wait(1200);

    caption(t.chip);
    await wait(1600);
    panel.hide();
    await capri.stow();
    await wait(3500);
    await capri.unstow();
    await wait(600);
    panel.say({ kind: 'info', line: t.end, hold: 5000 });
  };

  // what's in here, for --dev scripts (debug route `eval`)
  window.dev = { capri, brain, panel, chat, guide, fx, voice, bond, jealousy, reminders, look, pc, care, breaks, setup, screens: () => screens };

  host.onClaudeEvent((evt) => brain.handle(evt));
  host.onWindows((data) => {
    capri.setWindows(data);
    brain.onWindows(data);
    jealousy.onWindows(data);
    pc.onWindows(data);
  });
  // the windows as they are now: the watcher only speaks again when something changes
  host.windowsNow().then((data) => data && capri.setWindows(data));

  // her window resized, or moved to another screen (whose pixels may be another size)
  let dpr = window.devicePixelRatio;
  const applySize = ({ width, height, gap = 0 }) => {
    floorGap = gap;
    fx.resize(width, height);
    chip.place(width, height - gap);
    capri.setView(width, height, height - gap);
    if (window.devicePixelRatio !== dpr) {
      dpr = window.devicePixelRatio;
      capri.setScale(capri.scale); // her drawing redone at the new screen's pixels
    }
  };
  host.onResize(applySize);

  // Your screens. She goes from one to the other through their shared edge (thrown, or jumping
  // over to follow you), else in her column of light. `screens`: { current, origin (her window's
  // corner), list: [{ id, x, y, w, h }] }, all in the desktop's coordinates.
  let screens = await host.screens().catch(() => null);
  const refreshScreens = async () => {
    screens = await host.screens().catch(() => screens);
  };
  // the screen right past one side of hers (-1 left, 1 right), at height y of her window, if any
  const beyond = (side, y) => {
    const here = screens?.list.find((d) => d.id === screens.current);
    if (!here) return null;
    const gy = screens.origin.y + y;
    return screens.list.find((d) => d.id !== here.id && gy >= d.y && gy < d.y + d.h
      && (side > 0 ? Math.abs(d.x - (here.x + here.w)) <= 2 : Math.abs(d.x + d.w - here.x) <= 2)) || null;
  };
  const moveTo = async (id) => {
    const res = await host.moveScreen(id);
    if (!res) return null;
    screens = { ...screens, current: id, origin: res.origin };
    applySize(res);
    return res;
  };
  capri.canCross = (side, y) => Boolean(beyond(side, y));
  capri.onCross = async (side, at) => {
    const there = beyond(side, at.y);
    if (!there) return null;
    const gy = screens.origin.y + at.y;
    const res = await moveTo(there.id);
    return res && { y: gy - res.origin.y };
  };
  capri.onScreenOf = (cursor) => capri.jumpScreen(async () => {
    await moveTo(cursor.display);
    return host.cursor();
  }, { toPointer: true });
  // to screen `id`: jumping over the shared edge if there's one at her height, else teleporting
  const goToScreen = async (id) => {
    if (!screens || id === screens.current) return;
    const mid = capri.screenPoint(118, 232);
    const side = [-1, 1].find((s) => beyond(s, Math.max(120, mid.y - 140))?.id === id);
    if (side && (await capri.leapTo(side))) return;
    await capri.jumpScreen(async () => {
      await moveTo(id);
      return host.cursor();
    });
  };
  // The pointer on another of your screens for a few seconds: she follows you there, when she's
  // free to (not in the middle of something, not asleep, not put away).
  let followOn = config.follow !== false;
  let awayChecks = 0;
  follow = (at) => {
    const elsewhere = followOn && screens && screens.list.length > 1 && at && !at.inside && at.display != null && at.display !== screens.current;
    awayChecks = elsewhere ? awayChecks + 1 : 0;
    if (awayChecks < FOLLOW_AFTER) return;
    if (capri.busy || capri.dragging || capri.stowed || capri.dormant || capri.hidden || capri.act || capri.pointing) return;
    if (!['stand', 'sit'].includes(capri.stance) || capri.mode === 'sleep' || capri.mode === 'alert' || chat.open || guide.running) return;
    awayChecks = 0;
    goToScreen(at.display);
  };
  window.addEventListener('resize', () => {
    fx.resize(innerWidth, innerHeight);
    chip.place(innerWidth, innerHeight - floorGap);
    capri.setView(innerWidth, innerHeight, innerHeight - floorGap);
  });

  const revealDesktop = () => {
    const pose = capri.p;
    pose.alpha = capri.mode === 'sleep' ? 0.55 : 1;
    pose.collapse = 0;
    pose.dissolve = 0;
    pose.glitch = 0;
    pose.split = 0;
    pose.silAmount = 0;
    if (capri.stowed) return;
    capri.setHidden(false);
    capri.place();
  };
  const bringBack = () => {
    if (capri.stowed) return;
    const folded = capri.p.alpha < 0.2 || capri.p.collapse > 0.4;
    const grounded = capri.stance === 'stand' || capri.stance === 'sit';
    if (folded && !capri.busy && !capri.dragging && !capri.lounge && grounded) {
      capri.setHidden(false);
      capri.arrive({ ...capri.pos }, {
        face: capri.facing,
        stance: capri.stance,
        perch: capri.perch,
        beam: true,
      });
      return;
    }
    revealDesktop();
  };
  // The home window is open: she leaves the desktop. Closing it brings her back, unless she was put away.
  const coverHome = async (on) => {
    if (on) {
      if (homeCovered) return;
      const token = ++coverToken;
      homeCovered = true;
      desk.home = true;
      strips.stop();
      if (capri.windowPose === 'lie') {
        capri.windowPose = 'sit';
        capri.lieBox = null;
      }
      if (chat.open) chat.close();
      panel.hide();
      panel.setTicker?.(null);
      const free = !capri.hidden && !capri.stowed && !capri.busy && !capri.dragging;
      if (free) {
        capri.busy = true;
        try { await capri.vanish({ beam: true }); } catch { /* hide anyway */ }
        capri.busy = false;
      }
      if (token !== coverToken) {
        if (!homeCovered) bringBack();
        return;
      }
      if (!capri.stowed) capri.setHidden(true);
      return;
    }
    coverToken += 1;
    homeCovered = false;
    desk.home = homeStay;
    if (!desk.home) panel.hide();
    bringBack();
  };
  const applyHomeStay = (on) => {
    homeStay = Boolean(on);
    if (homeStay) {
      desk.home = true;
      if (chat.open) chat.close();
      panel.hide();
      panel.setTicker?.(null);
      strips.stop();
      capri.setHidden(true);
    } else if (!homeCovered) {
      desk.home = false;
      bringBack();
    }
  };

  host.onConfig((cfg) => {
    voice.configure(cfg);
    capri.listen = Boolean(cfg.listen);
    jealousy.enabled = cfg.jealous !== false;
    jealousy.closePages = cfg.closePages !== false;
    followOn = cfg.follow !== false;
    look.configure(cfg);
    pc.enabled = cfg.pcReact !== false;
    breaks.enabled = cfg.breaks !== false;
    const nextOut = cfg.visible !== false;
    if (nextOut !== wantsOut) {
      if (!nextOut) {
        if (!capri.stowed && !capri.stowing) {
          if (homeCovered || homeStay || capri.hidden) capri.stowNow();
          else capri.stow();
        }
      } else if (homeCovered || homeStay) {
        if (capri.stowed) {
          capri.stowed = false;
          capri.hidden = true;
          capri.root.hidden = true;
        }
      } else if (capri.stowed) {
        capri.unstow();
      }
    }
    wantsOut = nextOut;
    reminders.sync(cfg.reminders); // one may have been cancelled from her menu
    capri.wander = cfg.wander;
    capri.possessWindows = cfg.possess;
    if (Boolean(cfg.homeStay) !== homeStay) applyHomeStay(cfg.homeStay);
    capri.restOn = cfg.rest || 'corner';
    applyMotion(cfg.motion);
    applyTheme(cfg.theme);
    if ((cfg.claude === false && brain.watching) || cfg.assistant !== brain.assistant) {
      guide.answer(null);
      panel.hide();
      capri.stopPointing();
      brain.replyFor = null;
      brain.linked = cfg.linked;
      // no longer watching Claude Code: whatever it was in the middle of is no business of hers
      brain.sessions.clear();
      panel.setTicker(null);
      if (capri.mode === 'work' || capri.mode === 'alert') capri.setMode('idle');
    }
    brain.watching = cfg.claude !== false;
    brain.custom = mine(cfg);
    brain.assistant = cfg.assistant;
    panel.labels = linesFor(cfg.lang, cfg.assistant);
    if (cfg.scale !== capri.scale) capri.setScale(cfg.scale);
    if (cfg.lang !== brain.lang) {
      brain.lang = cfg.lang;
      panel.labels = linesFor(cfg.lang, cfg.assistant);
      document.documentElement.lang = cfg.lang;
    }
  });

  host.onCommand(async (cmd) => {
    const t = brain.t;
    switch (cmd.name) {
      case 'teleport':
        capri.teleport(capri.spot('random'));
        break;
      case 'status':
        brain.status();
        break;
      case 'customize': // "Make her yours" in her menu
        custom.open();
        break;
      case 'setupChat': // "Set it up with her" in her menu's AI model
        setup.chat();
        break;
      case 'setupKey': // "API key or address" in her menu's AI model, or a service picked there that needs one
        setup.key();
        break;
      case 'setupFree': // --dev: Claude Code (or Codex) through Ollama
        setup.free();
        break;
      case 'setupStep': // --dev: one step of her setup on its own (pickModel, pull, pickKeyed, address…)
        guide.scene(() => setup[cmd.step]?.(...(cmd.args || [])));
        break;
      case 'look': // "Look at my screen" in her menu: once, now
        look.once();
        break;
      case 'watchScreen': // "Look at my screen now and then" in her menu
        look.setAuto(cmd.on);
        break;
      case 'goScreen': // a screen picked in her menu: she goes there
        goToScreen(cmd.id);
        break;
      case 'screens': // a screen plugged in, unplugged or moved
        refreshScreens();
        break;
      case 'remindIn': // --dev: a reminder `ms` from now
        reminders.add(Date.now() + (cmd.ms ?? 3000), cmd.text ?? '');
        break;
      case 'bond': // --dev: sync points from a source (as if earned)
        bond.add(cmd.source || 'chat', cmd.n || 1);
        break;
      case 'rearmed': // a new mouse hook (main.js): click-through until the pointer comes over her again
        mouse = null;
        refreshHit();
        break;
      case 'rearm': // --dev: as if she'd noticed the pointer no longer reaches her
        host.rearm();
        break;
      case 'loseGl': { // --dev: as if the GPU had been reset (waking from sleep): she goes, then comes back
        const lose = capri.sprite.gl.getExtension('WEBGL_lose_context');
        lose?.loseContext();
        setTimeout(() => lose?.restoreContext(), cmd.ms ?? 1500);
        break;
      }
      case 'answer': { // --dev: as if that button of her panel had been clicked (her chat's too)
        const button = document.querySelector(`.panel__action[data-id="${CSS.escape(cmd.id)}"]`);
        if (button) button.click();
        else guide.answer(cmd.id);
        break;
      }
      case 'assistantChanged': // Claude Code, Codex or Antigravity, picked in her menu
        guide.welcome();
        break;
      case 'welcome': // "How does it work?" in her menu
        guide.menu();
        break;
      case 'forget': // "Forget our conversations" in her menu, maybe with her chat open
        chat.history = [];
        break;
      case 'voice':
        chat.hear(cmd.text);
        break;
      case 'voiceType':
        chat.start().then(() => chat.armVoiceType());
        break;
      case 'handsStop':
        hands.stop();
        clones.clear();
        break;
      case 'chat': // "Talk to her" in her menu
        chat.start();
        break;
      case 'homeCover':
        await coverHome(Boolean(cmd.on));
        break;
      case 'homeTalk':
        chat.homeSay(cmd.text, { think: cmd.think, web: cmd.web });
        break;
      case 'homeAnswer':
        chat.homeAnswer(cmd.id);
        break;
      case 'report': // "Mission report" in her menu
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (brain.report()) capri.perform('curious', capri.towardCenter());
        break;
      case 'fakeClaude': { // --dev: the topmost window (the test window) is where a prompt was typed, and you're elsewhere
        const win = capri.windows.wins[0];
        if (win) {
          brain.sessions.set('dev', { id: 'dev', project: 'dev', taskStart: Date.now(), count: 0, files: new Set(), log: [], working: true, waiting: false, window: win.id, seen: Date.now() });
          capri.windows = { ...capri.windows, fg: -1 };
        }
        break;
      }
      case 'guide': // --dev: one topic of her guide (welcome, menu, connect, icon, claude, folder)
        if (cmd.topic === 'welcome') guide.welcome();
        else if (cmd.topic === 'menu') guide.menu();
        else if (typeof guide[cmd.topic] === 'function') guide.scene(() => guide[cmd.topic]());
        break;
      case 'stow': // Ctrl+Alt+C: into her biochip, or back out
        if (cmd.on) capri.stow();
        else capri.unstow();
        break;
      case 'satellite': // the whole sequence, on demand (tray)
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (capri.stance === 'peek') await capri.unpeek();
        if (!capri.gaze({ big: true })) setTimeout(() => capri.gaze({ big: true }), 1500);
        break;
      case 'hooks':
        if (cmd.ok) panel.say({ kind: 'info', line: cmd.action === 'install' ? t.hooksOk : t.hooksRemoved, hold: 6000 });
        else panel.say({ kind: 'error', line: fmt(t.hooksFail, { error: cmd.error }), hold: 9000 });
        break;
      // --dev helpers
      case 'intro': // her intro again, as when she starts (still: as with Windows' animations off)
        panel.hide();
        await capri.intro(capri.spot('post'), cmd.still ? { still: true } : {});
        break;
      case 'pose':
        capri.debug = cmd.params || null;
        if (cmd.still) capri.nextMove = capri.nextGaze = Infinity; // no wandering off mid-test
        if (cmd.hush) {
          panel.setTicker(null);
          panel.hide();
        }
        if (cmd.scale) capri.setScale(cmd.scale);
        if (cmd.stance) capri.setStance(cmd.stance, cmd);
        if (cmd.at) capri.pos = cmd.at;
        if (cmd.facing) capri.facing = cmd.facing;
        capri.drawFrame();
        break;
      case 'config': // a setting, as if changed from her menu
        host.setConfig(cmd.patch || {});
        break;
      case 'focus': // as if window `fg` had come to the front
        capri.windows = { ...capri.windows, fg: cmd.fg };
        brain.onWindows(capri.windows);
        break;
      case 'freeze':
        capri.hidden = Boolean(cmd.on);
        break;
      case 'act':
        // behaviours by method name (gaze, celebrate, hurt, shed, peek, fall, wanderStep...) or acts by name
        if (cmd.act === 'sit') {
          // pile: n-th window she could sit on from the top of the pile (0: the --dev test window
          // opened last), instead of the usual choice
          const top = cmd.pile !== undefined && capri.windows.wins.filter((w) => capri.canSit(w))[cmd.pile];
          const seat = top ? { win: top, dx: top.w * 0.4 } : capri.pickSeat();
          if (seat) capri.sitOn(seat);
        } else if (typeof capri[cmd.act] === 'function') capri[cmd.act](...(cmd.args || []));
        else capri.perform(cmd.act, cmd.dir || 0);
        break;
      default:
        break;
    }
  });

  // entrance: her face big in the corner says hi, then she dives down to her spot
  // (put away last time: she starts in her biochip; window mode: she starts inside her window)
  if (config.homeStay) {
    capri.pos = { ...capri.spot('post') };
    capri.faceCenter();
    capri.setStance('stand');
    capri.place();
    capri.setHidden(true);
  } else if (config.visible === false) capri.stowNow();
  else if (intro) await capri.intro(capri.spot('post'));
  else await capri.materialize(capri.spot('post'));
  // Windows has its animations off and she's following it: she barely moves. The first time, she
  // says so and asks whether to move anyway (her menu › Animations changes it later).
  if (!config.homeStay && reducedMotion.setting === 'auto' && reducedMotion.system && !config.motionAsked) {
    const m = brain.t.motion;
    await new Promise((done) => {
      const asked = panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: m.line,
        quote: m.quote,
        actions: [{ id: 'full', label: m.full, primary: true }, { id: 'reduced', label: m.still }],
        onAction: (id) => {
          host.setConfig({ motion: id, motionAsked: true });
          panel.hide();
          if (id === 'full') capri.perform('hop');
        },
        onLeave: done,
        hold: null,
      });
      if (!asked) done();
    });
  }
  const hooks = await host.hooksStatus();
  // her welcome: the first time, or while she's meant to watch Claude Code and isn't plugged into it
  if (!config.homeStay && (!config.welcomed || (config.claude && !hooks.installed))) guide.welcome();
  else if (!config.homeStay) panel.say({ kind: 'info', line: brain.onlineLine(), hold: 4000 });

  // In the evening, after a real day's work, she brings you her report card once, on her own,
  // at a quiet moment.
  setInterval(() => {
    const day = mission.day;
    const quiet = !brain.busySessions.length && !panel.visible && !guide.running && !capri.busy && !capri.act;
    if (new Date().getHours() < 18 || day.reported || day.missions < 3 || !quiet) return;
    if (capri.stowed || capri.dormant || capri.mode === 'sleep') return;
    if (brain.report()) {
      mission.markReported();
      capri.perform('curious', capri.towardCenter());
    }
  }, 60000);
}

boot().catch((err) => {
  console.error('[capri] boot failed', err);
});
