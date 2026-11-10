// Short 2D clips the WebGL pet does not have.
// Art and frame counts are from lachydotmcg/capri-desktop v0.8.0 (PolyForm Noncommercial 1.0.0).
// The perch and lay-down sheets are by that project's artist, who asked to stay unnamed.
// Drawn on a normal canvas. A second WebGL context turned the pet black and green.

const CLIPS = {
  idle: { file: 'idle.png', count: 16, fps: 8 },
  grin: { file: 'grin.png', count: 16, fps: 8 },
  glitch: { file: 'glitch.png', count: 10, fps: 15 },
  dangle: { file: 'dangle.png', count: 24, fps: 10 },
  arrive: { file: 'arrive.png', count: 14, fps: 15 },
  walk: { file: 'walk.png', count: 12, fps: 12 },
  perch: { file: 'perch.png', count: 60, fps: 30 },
  laydown: { file: 'laydown.png', count: 60, fps: 30 },
  laydown_flipped: { file: 'laydown_flipped.png', count: 60, fps: 30 },
  laydown_sleep: { file: 'laydown_sleep.png', count: 60, fps: 30 },
  laydown_sleep_flipped: { file: 'laydown_sleep_flipped.png', count: 60, fps: 30 },
  laydown_leave: { file: 'laydown_leave.png', count: 12, fps: 15, show: 7 },
  laydown_leave_flipped: { file: 'laydown_leave_flipped.png', count: 12, fps: 15, show: 7 },
};

// Same seat math as lachydotmcg Capri.cs: LieScale 0.85, hip at 0.806 of the
// 384 square, seat row 0.79. The flipped sheets are stored mirrored, and the
// draw mirrors them again so her red arm stays on the correct side.
const LIE_SCALE = 0.85;
const LIE_RIGHT = 0.5 + (0.806 - 0.5) * LIE_SCALE;
const LIE_SHIFT_Y = (0.79 - 0.5) * (1 - LIE_SCALE) + (94 / 384) * LIE_SCALE;
const LIE_TALL = (250 / 384) * LIE_SCALE;

function lieMetrics(cellW) {
  const wide = (cellW / 384) * LIE_SCALE;
  return {
    hipX: (LIE_RIGHT - 0.5) / wide + 0.5,
    hipY: (0.79 - 0.5 - LIE_SHIFT_Y + LIE_TALL / 2) / LIE_TALL,
    tall: LIE_TALL,
    wide,
  };
}

const SHOW = {
  dance: { clip: 'idle', loops: 2, bob: true },
  lie: { seq: ['laydown', 'laydown_sleep'], loops: 1 },
  grin: { clip: 'grin', loops: 2 },
  glitch: { clip: 'glitch', loops: 2 },
  dangle: { clip: 'dangle', loops: 1 },
  arrive: { clip: 'arrive', loops: 1 },
  walk: { clip: 'walk', loops: 2 },
  perch: { clip: 'perch', loops: 1 },
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

export class Strips {
  constructor(allowed) {
    this.allowed = allowed || (() => true);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lachy-strip';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    this.canvas.style.cssText = 'position:fixed;left:0;top:0;z-index:1;pointer-events:none;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.images = new Map();
    this.playing = false;
    this.token = 0;
    this.pose = null;
    this.lieBox = null;
  }

  // Hold the lay-down sheet on her window seat. False when a short clip is already up.
  lie(capri) {
    if (this.pose) return true;
    if (this.playing) return false;
    this.pose = 'lie';
    this.playing = true;
    this.runPose(capri);
    return true;
  }

  endPose(how) {
    if (!this.pose) return;
    this.pose = how === 'sit' ? 'sit' : 'off';
  }

  placeOf(capri) {
    if (!this.allowed() || capri.mode !== 'idle') return null;
    if (capri.stance !== 'sit' || !capri.perch || capri.perch.id === 'taskbar') return null;
    const win = capri.perchWin(capri.perch.id);
    if (!win) return null;
    return { hipX: capri.pos.x, hipY: win.y + 3, scale: capri.scale };
  }

  async runPose(capri) {
    const token = this.token;
    const sprite = document.getElementById('sprite');
    const names = ['laydown', 'laydown_flipped', 'laydown_sleep', 'laydown_sleep_flipped', 'laydown_leave', 'laydown_leave_flipped'];
    try {
      const arts = {};
      for (const name of names) arts[name] = await this.image(name);
      if (token !== this.token || this.pose !== 'lie' || !this.placeOf(capri)) return;
      if (sprite) sprite.style.visibility = 'hidden';
      this.canvas.hidden = false;
      await this.playPose(token, capri, arts, 'laydown', () => this.pose === 'lie');
      while (token === this.token && this.pose === 'lie' && this.placeOf(capri)) {
        const again = await this.playPose(token, capri, arts, 'laydown_sleep', () => this.pose === 'lie');
        if (!again) break;
      }
      if (token === this.token && this.pose === 'sit' && capri.stance === 'sit' && this.placeOf(capri)) {
        await this.playPose(token, capri, arts, 'laydown_leave', () => this.pose === 'sit');
      }
    } catch {
      // missing sheet: she stays the sitting sprite
    } finally {
      if (token === this.token) {
        const dropped = this.pose === 'lie';
        this.pose = null;
        this.playing = false;
        this.canvas.hidden = true;
        this.lieBox = null;
        capri.lieBox = null;
        if (sprite) sprite.style.visibility = '';
        if (dropped) capri.windowPose = 'sit';
      }
    }
  }

  async playPose(token, capri, arts, base, keep) {
    const sample = CLIPS[base];
    const frames = sample.show || sample.count;
    const ms = (frames * 1000) / sample.fps;
    const started = performance.now();
    while (performance.now() - started < ms) {
      const place = this.placeOf(capri);
      if (token !== this.token || !keep() || !place) return false;
      const left = capri.facing < 0;
      const name = left ? `${base}_flipped` : base;
      const clip = CLIPS[name];
      const at = performance.now() - started;
      const index = Math.min(frames - 1, Math.floor((at / 1000) * clip.fps));
      this.drawLie(arts[name], clip, index, place, left);
      capri.lieBox = this.lieBox;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return token === this.token && keep();
  }

  drawLie(img, clip, index, place, left) {
    const cellW = img.width / clip.count;
    const cellH = img.height;
    const metrics = lieMetrics(cellW);
    const size = 420 * place.scale;
    const cssH = Math.max(40, size * metrics.tall);
    const cssW = cssH * (cellW / cellH);
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (this.canvas.width !== pxW) this.canvas.width = pxW;
    if (this.canvas.height !== pxH) this.canvas.height = pxH;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const frac = left ? 1 - metrics.hipX : metrics.hipX;
    const leftPx = place.hipX - cssW * frac;
    const topPx = place.hipY - cssH * metrics.hipY;
    this.canvas.style.transform = `translate(${leftPx}px, ${topPx}px)`;
    this.lieBox = { left: leftPx, top: topPx, right: leftPx + cssW, bottom: topPx + cssH };
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxW, pxH);
    ctx.save();
    if (left) {
      ctx.translate(pxW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, index * cellW, 0, cellW, cellH, 0, 0, pxW, pxH);
    ctx.restore();
  }

  async image(name) {
    const clip = CLIPS[name];
    if (!clip) return null;
    if (this.images.has(name)) return this.images.get(name);
    const img = await loadImage(`../../assets/lachy/${clip.file}`);
    this.images.set(name, img);
    return img;
  }

  // Drop a guest clip or a window lie. The WebGL sprite comes back.
  stop() {
    this.token += 1;
    this.pose = null;
    this.playing = false;
    this.canvas.hidden = true;
    this.lieBox = null;
    const sprite = document.getElementById('sprite');
    if (sprite) {
      sprite.style.visibility = '';
      sprite.style.opacity = '';
    }
  }

  // One named clip. False when another clip is up, or the art did not load.
  async play(name) {
    const show = SHOW[name];
    if (!show || this.playing || this.pose || !this.allowed()) return false;
    const seq = show.seq || [show.clip];
    let art;
    try {
      art = await Promise.all(seq.map((item) => this.image(item)));
    } catch {
      return false;
    }
    if (art.some((img) => !img) || !this.allowed()) return false;
    const token = ++this.token;
    this.playing = true;
    const sprite = document.getElementById('sprite');
    const previous = sprite ? sprite.style.visibility : '';
    if (sprite) sprite.style.visibility = 'hidden';
    this.canvas.hidden = false;
    const started = performance.now();
    const plan = [];
    seq.forEach((item, index) => {
      const clip = CLIPS[item];
      const loops = show.loops || 1;
      plan.push({ img: art[index], clip, ms: (clip.count * loops * 1000) / clip.fps });
    });
    const total = plan.reduce((sum, part) => sum + part.ms, 0);
    await new Promise((resolve) => {
      const frame = (now) => {
        if (token !== this.token) return resolve();
        const elapsed = now - started;
        if (elapsed >= total || !this.allowed()) return resolve();
        let at = elapsed;
        let part = plan[0];
        for (const item of plan) {
          part = item;
          if (at < item.ms) break;
          at -= item.ms;
        }
        this.draw(part, at, show.bob ? Math.sin(elapsed / 140) : 0);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    if (token === this.token) {
      this.playing = false;
      this.canvas.hidden = true;
      if (sprite) sprite.style.visibility = previous;
    }
    return true;
  }

  draw(part, at, bob) {
    const sprite = document.getElementById('sprite');
    if (!sprite) return;
    const box = sprite.getBoundingClientRect();
    const { clip, img } = part;
    const cellW = img.width / clip.count;
    const cellH = img.height;
    const wide = cellW / cellH > 1.15;
    const cssH = Math.max(40, box.height);
    const cssW = wide ? cssH * (cellW / cellH) : Math.max(40, box.width);
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (this.canvas.width !== pxW) this.canvas.width = pxW;
    if (this.canvas.height !== pxH) this.canvas.height = pxH;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const left = box.left + box.width / 2 - cssW / 2;
    const top = box.top + box.height - cssH;
    this.canvas.style.transform = `translate(${left}px, ${top}px)`;
    const index = Math.min(clip.count - 1, Math.floor((at / 1000) * clip.fps) % clip.count);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, pxW, pxH);
    const scale = Math.min(pxW / cellW, pxH / cellH);
    const dw = cellW * scale;
    const dh = cellH * scale;
    const bobPx = bob * pxH * 0.04;
    ctx.drawImage(img, index * cellW, 0, cellW, cellH, (pxW - dw) / 2, (pxH - dh) / 2 + bobPx, dw, dh);
  }
}
