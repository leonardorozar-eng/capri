// CapriCore full-body drawings for the desktop. One pose per situation.
// A normal canvas. A second WebGL context on this page turned her black and green.

const SRC = '../../assets/capri/body/';
const CANVAS = 1254;
// Standing art is about 1050px of that square. Match the old cut-out height (420).
const STAND_PX = 420 / 1050;

const POSES = {
  'sit-edge': { file: 'sit-edge.png', ax: 609, ay: 787, vis: [182, 111, 891, 1067], kind: 'seat' },
  'sit-floor': { file: 'sit-floor.png', ax: 643, ay: 1166, vis: [185, 247, 884, 920], kind: 'ground' },
  hang: { file: 'hang-feet.png', ax: 626, ay: 88, vis: [182, 84, 889, 933], kind: 'ceiling' },
  'dock-left': { file: 'dock-left.png', ax: 215, ay: 458, vis: [195, 76, 863, 1102], kind: 'dock-left' },
  'dock-right': { file: 'dock-right.png', ax: 1038, ay: 425, vis: [198, 76, 859, 1102], kind: 'dock-right' },
  neutral: { file: 'neutral.png', ax: 627, ay: 1166, vis: [200, 116, 881, 1050], kind: 'ground' },
  'blink-half': { file: 'blink-half.png', ax: 627, ay: 1166, vis: [199, 113, 882, 1055], kind: 'ground' },
  'blink-closed': { file: 'blink-closed.png', ax: 627, ay: 1166, vis: [200, 112, 883, 1058], kind: 'ground' },
  heart: { file: 'heart.png', ax: 627, ay: 1166, vis: [193, 96, 899, 1047], kind: 'ground' },
  'wave-raise': { file: 'wave-raise.png', ax: 627, ay: 1166, vis: [211, 128, 881, 1035], kind: 'ground' },
  'wave-a': { file: 'wave-a.png', ax: 627, ay: 1166, vis: [213, 125, 880, 1039], kind: 'ground' },
  'wave-b': { file: 'wave-b.png', ax: 627, ay: 1166, vis: [213, 124, 881, 1043], kind: 'ground' },
  sleepy: { file: 'sleepy.png', ax: 627, ay: 1166, vis: [198, 113, 883, 1054], kind: 'ground' },
  'sit-floor-sleepy': { file: 'sit-floor-sleepy.png', ax: 627, ay: 1141, vis: [191, 418, 922, 725], kind: 'ground' },
  'recline-sleepy': { file: 'recline-sleepy.png', ax: 627, ay: 1024, vis: [224, 449, 838, 577], kind: 'seat' },
  'music-window': { file: 'music-window.png', ax: 628, ay: 771, vis: [194, 76, 889, 1090], kind: 'seat', notes: [[533, 402], [764, 365]] },
  'music-floor': { file: 'music-floor.png', ax: 641, ay: 1164, vis: [199, 296, 883, 871], kind: 'ground', notes: [[522, 642], [775, 591]] },
};

const WAVE = [
  ['wave-raise', 220],
  ['wave-a', 250],
  ['wave-b', 250],
  ['wave-a', 250],
  ['wave-b', 250],
  ['wave-raise', 220],
];
const WAVE_MS = WAVE.reduce((sum, step) => sum + step[1], 0);

const BLINK = [
  ['neutral', 2600],
  ['blink-half', 70],
  ['blink-closed', 110],
  ['blink-half', 70],
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

function waveName(now, until) {
  let at = now - (until - WAVE_MS);
  if (at < 0) at = 0;
  for (const [name, ms] of WAVE) {
    if (at < ms) return name;
    at -= ms;
  }
  return 'wave-raise';
}

function blinkName(now) {
  const span = BLINK.reduce((sum, step) => sum + step[1], 0);
  let at = now % span;
  for (const [name, ms] of BLINK) {
    if (at < ms) return name;
    at -= ms;
  }
  return 'neutral';
}

// The one drawing that matches where she is. Later rules never override an earlier one.
export function poseFor(capri, now) {
  if (!capri || capri.hidden || capri.stowed || capri.p.alpha < 0.5) return null;
  if (capri.stance === 'peek' && capri.peekSide === 'top') return 'hang';
  if (capri.stance === 'peek' && capri.peekSide === 'left') return 'dock-left';
  if (capri.stance === 'peek' && capri.peekSide === 'right') return 'dock-right';

  const taskbar = capri.stance === 'sit' && capri.perch?.id === 'taskbar';
  const windowSit = capri.stance === 'sit' && capri.perch && !taskbar;
  const standing = capri.stance === 'stand';

  if (capri.mode === 'sleep') {
    if (taskbar) return 'sit-floor-sleepy';
    if (windowSit) return 'recline-sleepy';
    if (standing) return 'sleepy';
    return null;
  }
  if (standing && capri.pet?.since) return 'heart';
  if (standing && now < (capri.heartUntil || 0)) return 'heart';
  if (standing && now < (capri.waveUntil || 0)) return waveName(now, capri.waveUntil);

  const hearing = Boolean(capri.listen && capri.grooving);
  if (hearing && windowSit) return 'music-window';
  if (hearing && (taskbar || standing)) return 'music-floor';

  if (windowSit) return 'sit-edge';
  if (taskbar) return 'sit-floor';
  // Held, flying, or knocked down: the old sprite tumbles, lies on her side, and gets back up.
  if (capri.stance === 'held' || capri.stance === 'fly' || capri.stance === 'down') return null;
  if (standing || capri.stance === 'fall') {
    return standing && !capri.busy && !capri.dragging ? blinkName(now) : 'neutral';
  }
  return null;
}

function visibleBounds(originX, originY, unit, pose, mirror) {
  const [vx, vy, vw, vh] = pose.vis;
  const xs = [vx, vx + vw].map((ix) => originX + (mirror ? pose.ax * 2 - ix : ix) * unit);
  const ys = [vy, vy + vh].map((iy) => originY + iy * unit);
  return {
    left: Math.min(xs[0], xs[1]),
    right: Math.max(xs[0], xs[1]),
    top: Math.min(ys[0], ys[1]),
    bottom: Math.max(ys[0], ys[1]),
  };
}

function dockAnchorY(capri, pose) {
  const px = STAND_PX * capri.scale;
  const bottom = pose.vis[1] + pose.vis[3];
  let y = capri.pos.y - (bottom - pose.ay) * px;
  const top = y - (pose.ay - pose.vis[1]) * px;
  if (top < 8) y += 8 - top;
  const screenBottom = y + (bottom - pose.ay) * px;
  const limit = capri.view.h - 8;
  if (screenBottom > limit) y -= screenBottom - limit;
  return y;
}

function anchorOf(capri, pose) {
  const mirror = capri.facing < 0 && pose.kind !== 'dock-left' && pose.kind !== 'dock-right' && pose.kind !== 'ceiling';
  if (pose.kind === 'ceiling') return { x: capri.pos.x, y: 0, mirror: false };
  if (pose.kind === 'dock-left') return { x: 0, y: dockAnchorY(capri, pose), mirror: false };
  if (pose.kind === 'dock-right') return { x: capri.view.w, y: dockAnchorY(capri, pose), mirror: false };
  if (pose.kind === 'seat') {
    const win = capri.perch ? capri.perchWin(capri.perch.id) : null;
    return { x: capri.pos.x, y: win ? win.y : capri.pos.y, mirror };
  }
  let y = capri.pos.y;
  if (capri.stance === 'sit' && capri.perch?.id === 'taskbar') y = capri.view.floor;
  return { x: capri.pos.x, y, mirror };
}

export class Body {
  constructor(guest) {
    this.guest = guest || (() => false);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'capri-body';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    this.canvas.style.cssText = 'position:fixed;left:0;top:0;z-index:1;pointer-events:none;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.images = new Map();
    this.notes = [];
    this.ready = false;
    this.capri = null;
    this.box = null;
    this.load();
  }

  attach(capri) {
    this.capri = capri;
    capri.bodyHit = (x, y) => this.hit(x, y);
    const loop = (now) => {
      this.sync(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async load() {
    const jobs = Object.entries(POSES).map(async ([id, pose]) => {
      try { this.images.set(id, await loadImage(SRC + pose.file)); } catch { /* that pose keeps the old drawing */ }
    });
    for (let i = 0; i < 4; i += 1) {
      jobs.push(loadImage(`${SRC}note-${i}.png`).then((img) => { this.notes[i] = img; }).catch(() => {}));
    }
    await Promise.all(jobs);
    this.ready = true;
  }

  sync(now) {
    const capri = this.capri;
    const sprite = document.getElementById('sprite');
    if (!capri || !this.ready || this.guest()) {
      this.hide(sprite, false);
      return;
    }
    const id = poseFor(capri, now);
    const pose = id && POSES[id];
    const img = pose && this.images.get(id);
    if (!pose || !img) {
      this.hide(sprite, true);
      return;
    }
    this.draw(capri, id, pose, img, now);
    if (sprite) sprite.style.visibility = 'hidden';
  }

  hide(sprite, restore) {
    this.canvas.hidden = true;
    this.box = null;
    if (restore && sprite) sprite.style.visibility = '';
  }

  draw(capri, id, pose, img, now) {
    const unit = STAND_PX * capri.scale;
    const css = CANVAS * unit;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(1, Math.round(css * dpr));
    if (this.canvas.width !== px) this.canvas.width = px;
    if (this.canvas.height !== px) this.canvas.height = px;
    const where = anchorOf(capri, pose);
    const left = where.x - pose.ax * unit;
    const top = where.y - pose.ay * unit;
    this.canvas.style.width = `${css}px`;
    this.canvas.style.height = `${css}px`;
    this.canvas.style.transform = `translate(${left}px, ${top}px)`;
    this.canvas.hidden = false;
    const bounds = visibleBounds(left, top, unit, pose, where.mirror);
    this.box = {
      id,
      ...bounds,
      canvasLeft: left,
      canvasTop: top,
      css,
      taskbar: capri.stance === 'sit' && capri.perch?.id === 'taskbar',
      floor: capri.view.floor,
    };
    const ctx = this.ctx;
    ctx.setTransform(px / CANVAS, 0, 0, px / CANVAS, 0, 0);
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    ctx.save();
    ctx.translate(pose.ax, pose.ay);
    if (where.mirror) ctx.scale(-1, 1);
    ctx.translate(-pose.ax, -pose.ay);
    ctx.drawImage(img, 0, 0, CANVAS, CANVAS);
    if (pose.notes && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.drawNotes(ctx, pose, now);
    ctx.restore();
  }

  drawNotes(ctx, pose, now) {
    const life = 2400;
    const gap = 700;
    for (let n = 0; n < 4; n += 1) {
      const born = Math.floor((now - n * gap) / (gap * 2)) * (gap * 2) + n * gap;
      const age = now - born;
      if (age < 0 || age > life) continue;
      const note = this.notes[n % 4];
      if (!note) continue;
      const t = age / life;
      const side = n % 2;
      const [ex, ey] = pose.notes[side];
      const dir = side ? 1 : -1;
      const x = ex + dir * (40 + 150 * t);
      const y = ey - 30 - 160 * t;
      const alpha = Math.sin(Math.min(1, t) * Math.PI) * 0.9;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(dir * t * 0.4);
      ctx.drawImage(note, -42, -42, 84, 84);
      ctx.restore();
    }
  }

  // true or false while a drawing is up. null lets the WebGL cut-out decide.
  hit(x, y) {
    const box = this.box;
    if (!box || this.canvas.hidden) return null;
    if (box.taskbar && y > box.floor) return false;
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  }
}
