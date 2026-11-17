'use strict';

// Capri's memory is an Obsidian vault: notes and wikilinks. She reads them when
// she answers, and the home window draws the same links as a live graph.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// The vault that already exists syncs only with this Microsoft account.
// Any other PC gets an empty vault of its own.
const OWNER_EMAIL = 'alexandrebrancozelia@gmail.com';

const STOP = new Set(`que com para uma uns umas por dos das dos ela ele voce voces seu sua seus suas nao sim
the and you your her his she they them this that with from are was were have has not just like
sobre quando como porque onde quem qual quais meu minha meus minhas`.split(/\s+/));

let userData = '';
let onChange = null;
let preferredName = '';
let vault = '';
let personFile = 'Leonardo.md';
let notes = [];
let graphCache = { nodes: [], edges: [] };
let signature = '';
let writing = 0;
let watcher = null;
let pollTimer = null;
let pokeTimer = null;
let started = false;

function fold(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokens(text) {
  return fold(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP.has(word));
}

function stateFile() {
  return path.join(userData, 'obsidian-vault.json');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveState(patch) {
  if (!userData) return;
  const next = { ...loadState(), ...patch };
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(next));
  } catch (err) {
    console.error('[capri] obsidian state:', err.message);
  }
}

function regValue(key, name) {
  let buf;
  try {
    buf = execFileSync('reg.exe', ['query', key, '/v', name], { windowsHide: true });
  } catch {
    return '';
  }
  let text = buf.toString('utf16le');
  if (!text.includes('REG_SZ')) text = buf.toString('utf8');
  const line = text.split(/\r?\n/).find((row) => row.includes(name) && row.includes('REG_SZ'));
  if (!line) return '';
  const at = line.indexOf('REG_SZ');
  return line.slice(at + 'REG_SZ'.length).trim();
}

function oneDriveAccount() {
  const key = 'HKCU\\Software\\Microsoft\\OneDrive\\Accounts\\Personal';
  return {
    email: regValue(key, 'UserEmail'),
    folder: regValue(key, 'UserFolder'),
  };
}

function isOwnerAccount(account) {
  return fold(account?.email) === fold(OWNER_EMAIL);
}

function chooseVault() {
  const account = oneDriveAccount();
  if (isOwnerAccount(account) && account.folder) {
    return path.join(account.folder, 'Documentos', 'Capri');
  }
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Capri', 'cofre');
}

function personName() {
  const picked = String(preferredName || '').trim();
  if (picked) return picked.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\.+$/g, '').trim().slice(0, 60);
  const user = String(os.userInfo().username || 'Leonardo').trim();
  return user || 'Leonardo';
}

function personBase() {
  return personFile.replace(/\.md$/i, '');
}

function writeText(file, text) {
  const next = text.endsWith('\n') ? text : `${text}\n`;
  writing += 1;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === next) return false;
    fs.writeFileSync(file, next, 'utf8');
    return true;
  } finally {
    writing -= 1;
  }
}

function ensure(rel, text) {
  const file = path.join(vault, rel);
  if (!fs.existsSync(file)) writeText(file, text);
}

function spliceMarked(rel, fallback, inner) {
  const file = path.join(vault, rel);
  const block = `<!-- capri -->\n${inner.trim()}\n<!-- /capri -->`;
  let text = fallback;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch { /* a new note */ }
  if (text.includes('<!-- capri -->') && text.includes('<!-- /capri -->')) {
    text = text.replace(/<!-- capri -->[\s\S]*?<!-- \/capri -->/, block);
  } else {
    text = `${text.replace(/\s*$/, '\n\n')}${block}\n`;
  }
  writeText(file, text);
}

function seed() {
  const person = personBase();
  ensure(`${person}.md`, `# ${person}\n\nQuem conversa com a [[Capri]].\n\n- [[Memórias]]\n- [[Conversas]]\n`);
  ensure('Capri.md', `# Capri\n\nEu moro na mesa deste PC. Este cofre é a minha memória.\n\n- [[${person}]]\n- [[Memórias]]\n- [[Conversas]]\n- [[Mesa]]\n`);
  ensure('Mesa.md', `# Mesa\n\nA [[Capri]] fica na mesa, ao lado de [[${person}]]. A janela aberta mostra as ligações que ela lembra.\n`);
  ensure('Conversas.md', `# Conversas\n\nO que [[${person}]] falou com a [[Capri]].\n\n<!-- capri -->\n<!-- /capri -->\n`);
  ensure('Memórias.md', `# Memórias\n\nO que a [[Capri]] guarda sobre [[${person}]].\n\n<!-- capri -->\n<!-- /capri -->\n`);
  const obsidianDir = path.join(vault, '.obsidian');
  ensure('.obsidian/app.json', JSON.stringify({
    alwaysUpdateLinks: true,
    showInlineTitle: true,
    userIgnoreFilters: ['_capri/'],
  }, null, 2));
  ensure('.obsidian/graph.json', JSON.stringify({
    collapseFilter: true,
    search: '',
    showTags: false,
    showAttachments: false,
    hideUnresolved: false,
    showOrphans: true,
    collapseColorGroups: true,
    colorGroups: [],
    collapseDisplay: false,
    showArrow: false,
    textFadeMultiplier: 0,
    nodeSizeMultiplier: 1.15,
    lineSizeMultiplier: 1,
    collapseForces: true,
    centerStrength: 0.4,
    repelStrength: 12,
    linkStrength: 1,
    linkDistance: 180,
    scale: 1,
    close: false,
  }, null, 2));
  if (!fs.existsSync(obsidianDir)) fs.mkdirSync(obsidianDir, { recursive: true });
}

function registerVault() {
  const appData = process.env.APPDATA;
  if (!appData || !vault) return;
  const file = path.join(appData, 'obsidian', 'obsidian.json');
  let data = { vaults: {} };
  try {
    if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return;
  }
  if (!data || typeof data !== 'object') return;
  if (!data.vaults || typeof data.vaults !== 'object') data.vaults = {};
  const known = Object.values(data.vaults).some((entry) => entry && path.resolve(String(entry.path || '')) === path.resolve(vault));
  if (known) return;
  const id = crypto.randomBytes(8).toString('hex');
  data.vaults[id] = { path: vault, ts: Date.now(), open: true };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[capri] obsidian vault list:', err.message);
  }
}

function listMarkdown(dir, prefix, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '_capri' || entry.name === 'node_modules') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listMarkdown(full, rel, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    try {
      if (fs.statSync(full).size > 200000) continue;
    } catch {
      continue;
    }
    out.push({ rel: rel.replace(/\\/g, '/'), full });
  }
}

function headingOf(rel, body) {
  const found = /^#\s+(.+)$/m.exec(body);
  if (found) return found[1].trim().slice(0, 80);
  return path.basename(rel, '.md').replace(/-/g, ' ');
}

function kindOf(rel) {
  const base = path.basename(rel, '.md').toLowerCase();
  if (base === 'capri') return 'capri';
  if (`${base}.md` === personFile.toLowerCase()) return 'person';
  if (rel.toLowerCase().startsWith('memórias/') || rel.toLowerCase().startsWith('memorias/')) return 'memory';
  if (rel.toLowerCase().startsWith('diário/') || rel.toLowerCase().startsWith('diario/')) return 'day';
  if (rel.toLowerCase().startsWith('assuntos/')) return 'topic';
  return 'note';
}

function excerptOf(body) {
  return body
    .replace(/^---[\s\S]*?---/m, ' ')
    .replace(/<!-- capri -->[\s\S]*?<!-- \/capri -->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_\[\]|`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function linksIn(body) {
  const bare = body.replace(/```[\s\S]*?```/g, ' ');
  const found = [];
  const wiki = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match = wiki.exec(bare);
  while (match) {
    found.push(match[1].trim());
    match = wiki.exec(bare);
  }
  return found;
}

function scan() {
  if (!vault) return graphCache;
  const files = [];
  listMarkdown(vault, '', files);
  const docs = files.map((file) => {
    let body = '';
    try {
      body = fs.readFileSync(file.full, 'utf8');
    } catch {
      body = '';
    }
    const base = path.basename(file.rel, '.md');
    return { rel: file.rel, base, body, title: headingOf(file.rel, body) };
  });
  const groups = new Map();
  for (const doc of docs) {
    const key = doc.base.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }
  const byId = new Map();
  for (const [key, list] of groups) {
    if (list.length === 1) {
      list[0].id = key;
      byId.set(key, list[0]);
    } else {
      for (const doc of list) {
        doc.id = doc.rel.toLowerCase();
        byId.set(doc.id, doc);
      }
    }
  }
  const resolve = (raw) => {
    let name = String(raw || '').trim().replace(/\\/g, '/');
    if (name.toLowerCase().endsWith('.md')) name = name.slice(0, -3);
    const exact = name.toLowerCase();
    if (byId.has(exact)) return exact;
    const base = exact.split('/').pop();
    if (byId.has(base)) return base;
    return base ? `missing:${base}` : '';
  };
  const edgeSet = new Set();
  const ghosts = new Map();
  for (const doc of docs) {
    for (const raw of linksIn(doc.body)) {
      const id = resolve(raw);
      if (!id || id === doc.id) continue;
      if (id.startsWith('missing:') && !ghosts.has(id) && ghosts.size < 24) {
        ghosts.set(id, { id, title: raw.trim().slice(0, 80), kind: 'note', degree: 0 });
      }
      const pair = [doc.id, id].sort().join('>');
      edgeSet.add(pair);
    }
  }
  const degree = new Map();
  const edges = [];
  for (const pair of edgeSet) {
    const [a, b] = pair.split('>');
    edges.push({ a, b });
    degree.set(a, (degree.get(a) || 0) + 1);
    degree.set(b, (degree.get(b) || 0) + 1);
  }
  notes = docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    kind: kindOf(doc.rel),
    body: doc.body,
    excerpt: excerptOf(doc.body),
    degree: degree.get(doc.id) || 0,
  }));
  const nodes = notes.map(({ id, title, kind, degree: links }) => ({ id, title, kind, degree: links }));
  for (const ghost of ghosts.values()) {
    if (!byId.has(ghost.id)) nodes.push({ ...ghost, degree: degree.get(ghost.id) || 0 });
  }
  graphCache = { nodes, edges };
  const nextSig = `${nodes.map((node) => `${node.id}:${node.kind}:${node.title}:${node.degree}`).join('|')}|${edges.map((edge) => `${edge.a}>${edge.b}`).join('|')}`;
  if (nextSig !== signature) {
    signature = nextSig;
    if (onChange) onChange(graphCache);
  }
  return graphCache;
}

function slug(text) {
  const clean = fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return clean || 'nota';
}

function plain(text, max) {
  return String(text || '')
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function syncConfig(cfg) {
  if (!started || !vault) return;
  preferredName = String(cfg?.userName || '').trim();
  const name = personName();
  const base = personBase();
  const personPath = path.join(vault, personFile);
  if (!fs.existsSync(personPath)) {
    writeText(personPath, `# ${name}\n\nQuem conversa com a [[Capri]].\n\n- [[Memórias]]\n- [[Conversas]]\n`);
  } else {
    try {
      const current = fs.readFileSync(personPath, 'utf8');
      const next = current.replace(/^#\s+.+/m, `# ${name}`);
      if (next !== current) writeText(personPath, next);
    } catch { /* the note can wait */ }
  }
  const memories = (Array.isArray(cfg?.memories) ? cfg.memories : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(-40);
  const state = loadState();
  const map = state.memories && typeof state.memories === 'object' ? { ...state.memories } : {};
  const lines = [];
  for (const memory of memories) {
    let rel = map[memory];
    if (!rel) {
      let nameSlug = slug(memory);
      const used = new Set(Object.values(map));
      let relTry = `Memórias/${nameSlug}.md`;
      let n = 2;
      while (used.has(relTry)) {
        relTry = `Memórias/${nameSlug}-${n}.md`;
        n += 1;
      }
      rel = relTry;
      map[memory] = rel;
    }
    const title = memory.split('\n')[0].trim().slice(0, 80);
    writeText(path.join(vault, rel), `# ${title}\n\n${memory}\n\nLigado a [[${base}]] e [[Capri]].\n`);
    lines.push(`- [[${path.basename(rel, '.md')}]]`);
  }
  spliceMarked('Memórias.md', `# Memórias\n\nO que a [[Capri]] guarda sobre [[${base}]].\n`, lines.join('\n') || '');
  saveState({ vault, personFile, memories: map });
  scan();
}

function journal(question, answer) {
  if (!started || !vault) return;
  const asked = plain(question, 420);
  const said = plain(answer, 420);
  if (!asked && !said) return;
  const day = new Date();
  const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const clock = `${String(day.getHours()).padStart(2, '0')}:${String(day.getMinutes()).padStart(2, '0')}`;
  const base = personBase();
  const rel = `Diário/${stamp}.md`;
  const file = path.join(vault, rel);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    text = `# ${stamp}\n\n[[Conversas]] de [[${base}]] com [[Capri]].\n`;
  }
  text = `${text.replace(/\s*$/, '\n\n')}## ${clock}\n**${base}:** ${asked || '…'}\n**Capri:** ${said || '…'}\n`;
  writeText(file, text);
  let listed = '';
  try {
    listed = fs.readFileSync(path.join(vault, 'Conversas.md'), 'utf8');
  } catch {
    listed = '';
  }
  const link = `- [[${stamp}]]`;
  const inner = [...listed.matchAll(/^- \[\[[^\]]+\]\]/gm)].map((item) => item[0]);
  if (!inner.includes(link)) inner.push(link);
  spliceMarked('Conversas.md', `# Conversas\n\nO que [[${base}]] falou com a [[Capri]].\n`, inner.join('\n'));
  try {
    keepTopic(asked, said);
  } catch (err) {
    console.error('[capri] obsidian topic:', err.message);
  }
  scan();
}

// A real question becomes a named talk she can open again. The name is his own
// words, so asking about that subject later finds the same note and the lines inside it.
const CHATTER = new Set('oi ola eai blz beleza ok okay valeu obrigado obrigada kkk kk haha sim nao entendi show fechou tmj opa eae fala bom dia tarde noite tudo bem vlw obg'.split(/\s+/));
const TOPIC_DIR = 'Assuntos';
const TOPIC_CAP = 40;

function worthKeeping(asked) {
  const words = tokens(asked);
  if (words.length < 2) return false;
  if (words.every((word) => CHATTER.has(word))) return false;
  return String(asked || '').trim().length >= 12;
}

function topicTitle(asked) {
  let title = String(asked || '').replace(/\s+/g, ' ').trim();
  title = title.replace(/^(ei|oi|ol[aá]|opa|e a[ií]|ent[aã]o|seguinte|tipo|queria saber|quero saber|me explica|me fala|me conta|me diz|voc[eê] lembra|lembra quando|lembra|volta naquele assunto de|volta naquele assunto|volta naquele|como eu fa[cç]o pra|como faz pra|como que eu)\s+/i, '').trim();
  title = title.replace(/[?!.,;:]+$/g, '').trim();
  const words = title.split(/\s+/).filter(Boolean).slice(0, 8);
  title = words.join(' ');
  if (title.length > 64) title = title.slice(0, 64).replace(/\s+\S*$/, '').trim();
  if (title.length < 4) title = String(asked || '').replace(/\s+/g, ' ').trim().slice(0, 64);
  if (!title) return 'Assunto';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function listTopics() {
  const dir = path.join(vault, TOPIC_DIR);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.md')) continue;
    const full = path.join(dir, name);
    let body = '';
    try {
      body = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    out.push({ rel: `${TOPIC_DIR}/${name}`, full, title: headingOf(name, body), body });
  }
  return out;
}

function sameTopic(title, topic) {
  const mine = tokens(title);
  const theirs = tokens(topic.title);
  if (!mine.length || !theirs.length) return false;
  const known = new Set(theirs);
  let shared = 0;
  for (const word of mine) if (known.has(word)) shared += 1;
  if (shared >= 2 && shared / Math.min(mine.length, theirs.length) >= 0.5) return true;
  const fa = fold(title);
  const fb = fold(topic.title);
  if (fa.length >= 8 && fb.includes(fa)) return true;
  if (fb.length >= 8 && fa.includes(fb)) return true;
  return false;
}

function continuesLast(asked, last) {
  const shared = tokens(asked).filter((word) => tokens(last.title).includes(word)).length;
  if (shared >= 1) return true;
  const text = String(asked || '').trim();
  return text.length < 48 && /^(e |mas |ent[aã]o |tipo |sobre isso|disso|desse|dessa|nisso)\b/i.test(text);
}

function pickTopic(title, asked, topics) {
  const hit = topics.find((topic) => sameTopic(title, topic));
  if (hit) return hit;
  const recent = loadState().lastTopic;
  if (!recent?.rel || Date.now() - Number(recent.at || 0) >= 20 * 60 * 1000) return null;
  const last = topics.find((topic) => topic.rel === recent.rel);
  if (!last || !continuesLast(asked, last)) return null;
  return last;
}

function trimTopic(text) {
  const max = 8000;
  if (text.length <= max) return text;
  const bits = text.split(/\n(?=## )/);
  while (bits.length > 2 && bits.join('\n').length > max) bits.splice(1, 1);
  return bits.join('\n');
}

function alreadyThere(body, asked) {
  const needle = fold(asked).slice(0, 80);
  if (needle.length < 12) return false;
  const sections = String(body || '').split(/\n(?=## )/);
  return fold(sections[sections.length - 1] || '').includes(needle);
}

function indexTopics(topics) {
  const lines = topics.map((topic) => `- [[${path.basename(topic.rel, '.md')}]]`);
  spliceMarked(
    'Assuntos.md',
    `# Assuntos\n\nO que [[${personBase()}]] e a [[Capri]] já conversaram, separado por assunto.\n`,
    lines.join('\n'),
  );
}

function keepTopic(asked, said) {
  if (!started || !vault || !worthKeeping(asked)) return;
  const title = topicTitle(asked);
  const topics = listTopics();
  const chosen = pickTopic(title, asked, topics);
  const clock = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const section = `## ${clock}\n**${personBase()}:** ${asked}\n**Capri:** ${said || '…'}\n`;
  let rel;
  if (chosen) {
    rel = chosen.rel;
    if (!alreadyThere(chosen.body, asked)) {
      writeText(chosen.full, trimTopic(`${chosen.body.replace(/\s*$/, '\n\n')}${section}`));
    }
  } else if (topics.length >= TOPIC_CAP) {
    return;
  } else {
    const name = slug(title);
    const used = new Set(topics.map((topic) => topic.rel));
    rel = `${TOPIC_DIR}/${name}.md`;
    let n = 2;
    while (used.has(rel)) {
      rel = `${TOPIC_DIR}/${name}-${n}.md`;
      n += 1;
    }
    writeText(path.join(vault, rel), `# ${title}\n\nAssunto da [[Capri]] com [[${personBase()}]].\n\n${section}`);
  }
  saveState({ lastTopic: { rel, at: Date.now() } });
  indexTopics(listTopics());
}

function wantsOldTalk(folded) {
  return /\b(lembr|remember|memoria|memory|convers|ontem|yesterday|esqueci|assunto|volta|voltar|aquele|aquela|daquela|continua|continuar)\b/.test(folded);
}

function quoteTopic(note, words) {
  const sections = String(note.body || '').split(/\n(?=## )/).slice(1).map((part) => part.trim()).filter(Boolean);
  if (!sections.length) return note.excerpt || '';
  const ranked = sections.map((section, index) => {
    const hay = fold(section);
    let score = 0;
    for (const word of words) if (hay.includes(word)) score += 1;
    return { section, score, index };
  });
  ranked.sort((a, b) => b.score - a.score || b.index - a.index);
  if (!ranked[0] || ranked[0].score === 0) return sections.slice(-2).join('\n').slice(0, 1100);
  const picked = [];
  let size = 0;
  for (const item of ranked) {
    if (picked.length && item.score === 0) break;
    picked.push(item);
    size += item.section.length;
    if (picked.length >= 3 || size >= 1000) break;
  }
  picked.sort((a, b) => a.index - b.index);
  return picked.map((item) => item.section).join('\n').slice(0, 1100);
}

function recall(question) {
  if (!notes.length) return '';
  const words = tokens(question);
  const folded = fold(question);
  const wantsDiary = /\b(lembr|remember|memoria|memory|convers|ontem|yesterday|esqueci)\b/.test(folded);
  const wantsTopic = wantsOldTalk(folded);
  const ranked = notes
    .map((note) => {
      const hayTitle = fold(note.title);
      const hayBody = note.kind === 'topic' ? fold(note.body).slice(0, 8000) : fold(note.excerpt);
      let score = 0;
      for (const word of words) {
        if (hayTitle.includes(word)) score += note.kind === 'topic' ? 8 : 5;
        if (hayBody.includes(word)) score += note.kind === 'topic' ? 2 : 1;
      }
      if (wantsDiary && note.kind === 'day') score += 3;
      if (wantsTopic && note.kind === 'topic') score += 4;
      return { note, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const best = ranked[0];
  if (best && best.note.kind === 'topic' && best.score >= 6) {
    const lines = [
      `Saved talk "${best.note.title}". Use this part of that conversation when it helps. Do not mention notes or files:`,
      quoteTopic(best.note, words),
    ];
    const other = ranked.find((item) => item.note.id !== best.note.id && item.note.kind !== 'topic');
    if (other) lines.push(`${other.note.title}: ${other.note.excerpt}`);
    return lines.join('\n').slice(0, 1600);
  }
  if (!ranked.length && !wantsDiary && !wantsTopic) return '';
  const titles = notes.map((note) => note.title).filter(Boolean).slice(0, 40).join(', ');
  const lines = [`Vault notes: ${titles}.`];
  if (wantsTopic) {
    const names = notes.filter((note) => note.kind === 'topic').map((note) => note.title).filter(Boolean).slice(0, 20);
    if (names.length) lines.push(`Saved topics: ${names.join(', ')}.`);
  }
  for (const item of ranked) lines.push(`${item.note.title}: ${item.note.excerpt}`);
  if (wantsDiary) {
    const day = [...notes].reverse().find((note) => note.kind === 'day');
    if (day && !ranked.some((item) => item.note.id === day.id)) lines.push(`${day.title}: ${day.excerpt}`);
  }
  return lines.join('\n').slice(0, 1600);
}

function poke() {
  clearTimeout(pokeTimer);
  pokeTimer = setTimeout(() => {
    if (writing > 0) {
      poke();
      return;
    }
    try {
      scan();
    } catch (err) {
      console.error('[capri] obsidian scan:', err.message);
    }
  }, 300);
}

function start(options) {
  userData = options?.userData || userData;
  onChange = typeof options?.onChange === 'function' ? options.onChange : onChange;
  preferredName = String(options?.name || preferredName || '').trim();
  const state = loadState();
  const mine = isOwnerAccount(oneDriveAccount());
  vault = chooseVault();
  fs.mkdirSync(vault, { recursive: true });
  const savedPerson = state.personFile && fs.existsSync(path.join(vault, state.personFile)) ? state.personFile : '';
  const keptPerson = fs.existsSync(path.join(vault, 'Leonardo.md')) ? 'Leonardo.md' : '';
  personFile = mine ? (savedPerson || keptPerson || `${personName()}.md`) : `${personName()}.md`;
  seed();
  registerVault();
  saveState({ vault, personFile });
  started = true;
  scan();
  try {
    watcher = fs.watch(vault, { recursive: true }, () => poke());
  } catch (err) {
    console.error('[capri] obsidian watch:', err.message);
  }
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (writing > 0) return;
    try {
      scan();
    } catch { /* the next pass retries */ }
  }, 2000);
  return graphCache;
}

function stop() {
  started = false;
  if (watcher) watcher.close();
  watcher = null;
  clearInterval(pollTimer);
  clearTimeout(pokeTimer);
}

function graph() {
  return graphCache;
}

module.exports = {
  start, stop, graph, recall, journal, syncConfig,
  vaultPath: () => vault,
  chooseVault, isOwnerAccount, oneDriveAccount,
};
