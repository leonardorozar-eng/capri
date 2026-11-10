// Talking to her: you type in her panel, and a model (setup.js picks which) answers as her, in
// writing. The replies are AI-generated, and the panel says so on every chat.
// She can do a few things on your PC when you ask (Windows): open an app or a game, play music or
// control what's playing, open a website, close an app. She spots what you want in what you wrote,
// or the model asks for it with a tag in its answer. Music right away; an app you named yourself
// right away; anything only the model asked for, a website, and closing an app behind a button.

import { pick, fmt } from './util.js';
import { ASSISTANT_NAMES } from './lines.js';
import { parseReminder, parseWhen, clock } from './reminders.js';

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

const REMEMBER = 20; // messages she has in mind when answering
const KEEP = 60;     // messages she remembers across restarts (memory.json)
// her language, where small models need it: how she says "we" (else it's in English), and the last line
// of her prompt, in that language (they drift into the English of everything above it)
// `now`: the same, said again right by your message (small models answer in the language of the
// conversation so far, English after a switch, whatever the top of her prompt says)
const IN_LANGUAGE = {
  fr: { we: '"on" or "nous" in French', last: 'Écris tout en français, sauf si l’utilisateur t’écrit dans une autre langue : alors dans la sienne. Seuls les mots d’argot de Night City restent en anglais, jamais une phrase entière.', now: 'Réponds en français, sauf si ce message est écrit dans une autre langue.' },
  en: { we: '', last: 'Write everything in English, unless the user writes to you in another language: then in theirs.', now: 'Answer in English, unless this message is written in another language.' },
  es: { we: '"nosotros" in Spanish', last: 'Escribe todo en español, salvo si el usuario te escribe en otro idioma: entonces en el suyo. Solo las palabras de jerga de Night City se quedan en inglés, nunca una frase entera.', now: 'Responde en español, salvo si este mensaje está escrito en otro idioma.' },
  pt: { we: '"a gente" or "nós" in Portuguese', last: 'Escreva tudo em português do Brasil, a não ser que o usuário te escreva em outra língua: aí, na dele. Só as gírias de Night City ficam em inglês, nunca uma frase inteira.', now: 'Responda em português do Brasil, a não ser que esta mensagem esteja escrita em outra língua.' },
  ru: { we: '"мы" in Russian', last: 'Пиши всё по-русски, если только пользователь не пишет тебе на другом языке: тогда на его языке. По-английски остаются только словечки Найт-Сити, никогда не целые фразы.', now: 'Отвечай по-русски, если только это сообщение не написано на другом языке.' },
};
const STAY_MS = 10 * 60 * 1000; // no wandering off mid-conversation
const LOADING_AFTER_MS = 5000;
const CLOSE_TAG = /\[\[\s*close\s*:?\s*([^\]]*)\]\]/i; // [[close: AM Music]] at the end of her answer
// "close", "shut down", "ferme", "quitte", "cierra", "fecha", "закрой"... in any of her languages
const CLOSE_ASK = /\b(close|shut|quit|kill|exit)|ferm|quitt|coupe|arr[êe]t|cierr|cerra|fech|закр|выключ/i;
// her other tags: [[open: Spotify]], [[music: Bad Bunny]], [[media: next]], [[site: youtube.com]], [[grok: task]]
const TAG = /\[\[\s*(open|music|media|site|grok)\s*:\s*([^\]]*)\]\]/i;
// "open", "launch", "ouvre", "lance", "abre", "открой"... in any of her languages
const OPEN_ASK = /\b(open|launch|start|run)\b|ouvr|lance|démarre|abre|abrir|inicia|ejecuta|executa|открой|запусти/i;
// what to do with the music playing, said plainly (only when it's about music, or said in a few words)
const MEDIA_ASK = [
  ['pause', /\b(pause|pausa|pausar)\b|stop (the )?music|arrête la musique|пауз/i],
  ['next', /\b(next|skip|suivante?|siguiente|próxima|proxima)\b|passe (à )?la suivante|salta|pula|следующ/i],
  ['previous', /\b(previous|précédente?|anterior)\b|предыдущ/i],
  ['play', /\b(resume|reprends|reanuda|retoma)\b|relance la musique|remets la musique|продолж/i],
  ['volup', /\b(louder|plus fort)\b|monte le son|turn (it )?up|sube el volumen|aumenta o volume|громче/i],
  ['voldown', /\b(quieter|moins fort)\b|baisse le son|turn (it )?down|baja el volumen|abaixa o volume|тише/i],
  ['mute', /\bmute\b|coupe le son|silencia|sem som|выключи звук/i],
];
const MUSIC_WORD = /musi|chanson|song|track|titre|morceau|spotify|canci|faixa|песн|музык|трек/i;
// "put X on Spotify", "mets X sur Spotify", "pon X en Spotify", "coloca X no Spotify", "включи X в Spotify"
const SPOTIFY_ASK = /(?:play|put on|put|mets|joue|lance|écoute|pon|toca|reproduce|coloca|toque|включи|поставь)\s+(?:moi\s+|me\s+)?(.+?)\s+(?:on|sur|en|no|na|в)\s+spotify/i;
const MEDIA_ACTIONS = new Set(MEDIA_ASK.map(([action]) => action));
// "mets Bohemian Rhapsody sur YouTube", "play Daft Punk on youtube"
const YOUTUBE_ASK = /(?:play|put on|put|mets|met|joue|lance|écoute|pon|toca|reproduce|coloca|bota|toque|включи|поставь)(?:[- ]moi|[- ]me|me)?\s+(.+?)\s+(?:on|sur|en|no|na|в)\s+youtube/i;
// "mets Bohemian Rhapsody", "joue-moi du Daft Punk", "play some Queen": a song, or a game to play
const PLAY_ASK = /^(?:capri,?\s+)?(?:mets|met|joue|play|put on|pon|toca|coloca|bota|toque|включи|поставь)(?:[- ]moi|[- ]me|me)?\s+(.{2,100})$/iu;
// "joue à Brawlhalla", "play the game…": a game, not a song
const GAME_ASK = /^(?:capri,?\s+)?(?:joue|play)\s+(?:à|au|aux|a|the game)\s/i;
// "du Daft Punk", "some Queen": who to play, without the "some"
const songOf = (s) => s
  .replace(/^(?:la |le |une? |the |some )?(?:musique|music|chanson|son|morceau|song|track|songs)\s+(?:de |d['’]|du |by |of )?/i, '')
  .replace(/^(?:(?:du|de la|de l['’]|des|de|some|un peu de|del|un poco de|algo de|um pouco de)\s+|d['’])/i, '')
  .replace(/\s+(?:on|sur|en|no|na|в)\s+youtube\s*$/i, '')
  .trim();
// "démarre YouTube et mets la musique de Daft Punk": the song asked for after an "and"
const PLAY_AFTER = /\s(?:et|and|y|e|и)\s+(?:mets|met|joue|play|put on|pon|toca|coloca|bota|включи|поставь|démarre|demarre|lance|start|launch|écoute|ecoute)(?:[- ]moi|[- ]me)?\s+(.{2,100})$/i;
// "lance la musique de Daft Punk", "start the song X": an app verb, but music right after it
const MUSIC_START = /^(?:capri,?\s+)?(?:lance|démarre|demarre|start|launch|écoute|ecoute|pon|toca)(?:[- ]moi|[- ]me)?\s+(?:la |le |une? |the |some )?(?:musique|music|chanson|son|morceau|song|track|canci[óo]n|m[úu]sica|песню|музыку)\s+(.{2,100})$/i;
// "mets ce que tu veux", "play whatever you want": she picks (her tag)
const HER_PICK = /tu veux|ton choix|surprends|you want|whatever|your choice|surprise me|quieras|tu elecci[óo]n|quiser|sua escolha|хочешь|на твой выбор/i;
// what's left when it doesn't say which song ("mets de la musique", "play something")
const VAGUE_SONG = /^(?:(?:de\s+la|du|des|la|le|les|une?|some|a|the|un|algo\s+de|alguma|um|uma|что-нибудь)\s+)?(?:musique|music|son|sons|chanson|morceau|truc|quelque\s+chose|something|song|tunes?|m[úu]sica|canci[óo]n|algo|coisa|музыку|песню)?\s*[.!?]*$/iu;
// "o que tá tocando", "que música é essa", "what's playing": the session already playing, not a new song
const NOW_ASK = /(?:o que (?:t[aá]|esta|est[aá]) tocando|que m[uú]sica (?:[eé] essa|t[aá] tocando|toca agora)|qual (?:[eé] )?(?:a |essa )?m[uú]sica|o que (?:[eé]|e) (?:essa|esta|est[aá]) m[uú]sica|what(?:'s| is) (?:playing|this song)|what song is|qu[eé] canci[oó]n|quelle chanson|qu['’]est-ce qui (?:joue|passe)|что (?:сейчас )?играет)/i;
// "trouve mon CV", "où est le pdf du contrat", "find my report", "найди файл…": her search verbs, and
// what makes it a file on your PC or a search on the web
const SEARCH_VERB = /(?:cherche|recherche|trouve|retrouve|où (?:est|sont)|search(?: for)?|find|look (?:for|up)|where(?:'s| is| are)|busca|encuentra|d[óo]nde est[áa]n?|procura|acha|onde est[áa]o?|найди|поищи|где)/i;
const FILE_WORD = /fichier|dossier|document|photo|image|vid[ée]o|\bpdf\b|\bfiles?\b|folder|archivo|carpeta|arquivo|pasta|файл|папк|\.\w{2,4}\b|sur mon (?:pc|ordi)|dans mes fichiers|on my (?:pc|computer)|en mi (?:pc|ordenador)|no meu (?:pc|computador)|на (?:компьютере|пк)/i;
const WEB_WORD = /google|internet|\ble web\b|the web|\bonline\b|en ligne|в интернете|в гугле/i;
// "fais une capture d'écran", "take a screenshot"
const SHOT_ASK = /capture d['’][ée]cran|screenshot|screen ?shot|captura de (?:pantalla|tela)|скриншот|снимок экрана/i;

const SETTINGS_WORD = /param[eè]tres?|r[ée]glages?|settings|configuraci[oó]n|configura[çc][õo]es|ajustes|настройк/i;
const SETTINGS_PAGES = [
  ['bluetooth', /bluetooth/i],
  ['wifi', /wi-?fi|wlan/i],
  ['update', /mises? [àa] jour|\bupdates?\b|actualizaci|atualiza[çc]|обновлени/i],
  ['notifications', /notifications?|notificaci|notifica[çc]|уведомлен/i],
  ['background', /fond d['’][ée]cran|wallpaper|background|fondo de pantalla|papel de parede|обо(?:и|ев)\b/i],
  ['storage', /stockage|storage|almacenamiento|armazenamento|хранилищ/i],
  ['mouse', /souris|\bmouse\b|rat[oó]n|мыш/i],
  ['battery', /batterie|battery|bater[ií]a|батаре/i],
  ['power', /alimentation|\bpower\b|energ[ií]a|питани/i],
  ['display', /[ée]cran|display|pantalla|\btela\b|экран|дисплей/i],
  ['network', /r[ée]seau|network|(?<![\p{L}])rede?(?![\p{L}])|сет[ьи]/iu],
  ['sound', /\bson\b|\bsound\b|audio|sonido|\bsom\b|звук/i],
];
// what's left of it: asked as a question
const INFO_ASK = [
  ['battery', /batterie|battery|bater[ií]a|заряд|батаре/i],
  ['disk', /disque|\bdisk\b|\bdrive\b|stockage|storage|espace (?:libre|disque|restant)|de (?:la )?place|space left|free space|espacio|\bdisco\b|espa[çc]o|диск|места/i],
  ['ram', /\bram\b|m[ée]moire|memory|memoria|mem[óo]ria|памят|озу/i],
  ['ip', /\bip\b|айпи/i],
];
const QUESTION = /\?|combien|\bquel(?:le)?\b|c['’]est quoi|\breste\b|how much|how many|what(?:'s| is)|\bleft\b|cu[aá]nt|\bqu[eé]\b|quanto|\bqual\b|сколько|как(?:ой|ая|ое)|осталось/i;
// its sound: "mets le son à 30 %", "volume 50"; off and back on
const VOLUME_ASK = /(?:\bson\b|volume|\bsound\b|volumen|\bsom\b|звук|громкост\w*)\D{0,14}?(\d{1,3})\s*(?:%|pour ?cent|percent|por ?ciento|por ?cento|процент)?/i;
const MUTE_ASK = /coupe le son|mets? (?:le son )?en muet|\bmute\b|silencia|tira o som|sem som|выключи звук/i;
const UNMUTE_ASK = /remets? le son|r[ée]active le son|unmute|sound (?:back )?on|quita el silencio|activa el sonido|volta o som|liga o som|включи звук/i;
// a timer, counted down in her ticker
const TIMER_ASK = /minuteur|\btimer\b|temporizador|cron[oó]metro|таймер/i;
// Windows' snip of an area (not her own screenshot of all of it)
const SNIP_ASK = /capture (?:d['’])?une (?:zone|partie)|zone de l['’][ée]cran|\bsnip\b|(?:capture|screenshot|captura) (?:of |de )?(?:an? |una |uma |la |a )?(?:area|region|part|zona|[aá]rea|parte)|снимок области|область экрана/i;
// its windows: out of the way, back, or side by side
const TIDY_ASK = /range (?:mes|les|toutes les) fen[êe]tres|cache (?:mes|les|toutes les) fen[êe]tres|montre(?:-moi)? (?:le|mon) bureau|r[ée]duis (?:tout|toutes les fen[êe]tres)|tidy (?:up )?(?:my |the )?windows|minimi[sz]e (?:all|everything|my windows|the windows)|show (?:me )?(?:the |my )?desktop|ordena (?:mis |las )?ventanas|minimiza (?:todo|todas)|muestra el escritorio|organiza (?:minhas |as )?janelas|minimiza tudo|mostra a [áa]rea de trabalho|сверни (?:все|окна)|убери окна|покажи рабочий стол/i;
const UNTIDY_ASK = /(?:remets|ressors|rends-moi|rouvre) (?:mes|les) fen[êe]tres|(?:bring|put) (?:my |the )?windows back|restore (?:my |the )?windows|devu[ée]lve(?:me)? (?:mis |las )?ventanas|restaura (?:mis |las )?ventanas|volta (?:minhas |as )?janelas|traz (?:minhas |as )?janelas de volta|верни окна/i;
const PLACE_VERB = /^\s*(?:mets?|place|bouge|d[ée]place|put|move|snap|pon|coloca|mueve|bota|поставь|перемести|сдвинь)\s+/i;
const SIDE = [
  ['left', /\s*(?:[àa] |on the |to the |a la |na |[àa] la )?(?:gauche|left|izquierda|esquerda|слева|влево|налево)\b/i],
  ['right', /\s*(?:[àa] |on the |to the |a la |na |[àa] la )?(?:droite|right|derecha|direita|справа|вправо|направо)\b/i],
];
// dark or light
const DARK_ASK = /mode sombre|th[eè]me sombre|mode nuit|dark mode|dark theme|modo oscuro|tema oscuro|modo escuro|tema escuro|т[её]мн(?:ая|ую) тем|т[её]мный режим/i;
const LIGHT_ASK = /mode clair|th[eè]me clair|light mode|light theme|modo claro|tema claro|светл(?:ая|ую) тем|светлый режим/i;
// its power: always behind a button of hers but the cancel
const PC_WORD = /(?<![\p{L}])(?:pc|ordi\p{L}*|computer|ordenador|computador|компьютер\p{L}*|пк)(?![\p{L}])/iu;
const POWER_ASK = [
  ['cancel', /annule (?:l['’])?(?:extinction|arr[êe]t|red[ée]marrage)|cancel (?:the )?(?:shut ?down|restart)|cancela (?:el |o )?(?:apagado|desligamento|reinicio)|отмени (?:выключение|перезагрузку)/i],
  ['restart', /red[ée]marre|reboot|restart|reinicia|reinicie|перезагру/i],
  ['shutdown', /[ée]teins|shut ?down|turn off|power off|\bapaga\b|desliga|выключи/i],
  ['sleep', /\bveille\b|\bsleep\b|suspend|suspen[dc]|спящ/i],
  ['lock', /verrouill|\block\b|bloquea|bloqueia|заблокир/i],
];

// How long a timer is: "10 minutes", "1h30", "45 s" (else "dans une heure", as for a reminder).
function duration(text) {
  const hm = /(\d+)\s*h\s*(\d{1,2})\b/i.exec(text);
  if (hm) return (Number(hm[1]) * 60 + Number(hm[2])) * 60000;
  let ms = 0;
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|heures?|hours?|horas?|час\p{L}*|min\p{L}*|m|мин\p{L}*|s|sec\p{L}*|seg\p{L}*|сек\p{L}*)(?![\p{L}])/giu)) {
    const unit = m[2].toLowerCase();
    ms += Number(m[1].replace(',', '.')) * (/^(?:h|час)/.test(unit) ? 3600000 : /^(?:m|мин)/.test(unit) ? 60000 : 1000);
  }
  if (ms) return ms;
  const when = parseWhen(text);
  return when ? Math.max(0, when.at - Date.now()) : 0;
}

// 1 h 30, 10 min, 45 s
function span(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
}

// what's left, in her ticker: 9:59, 1:02:03
function left(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const two = (n) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}

// A short 2D clip, a Game Bar clip, hologram, or one app's volume. Before the PC-job check.
const STRIP_ASK = [
  ['dance', /\b(?:dan[cç]a|dance|rebola)\b/i],
  ['dangle', /\b(?:pendura|pendurada|dangle)\b/i],
  ['glitch', /\bglitch\b/i],
  ['grin', /\bsorr[ie]\b|\bgrin\b/i],
  ['lie', /\b(?:deita|deitar|cochila)\b/i],
  ['perch', /\b(?:empoleira|perch)\b/i],
  ['arrive', /\b(?:aparece aqui|teleporta)\b/i],
  ['walk', /^(?:capri[, ]+)?(?:anda|caminha|walk)\b/i],
];
const CLIP_ASK = /\bclip that\b|clipe disso|grava (?:o |um )?clipe|clipa isso/i;
const HOLO_ASK = /\bhologram(?:a)?\b/i;

function extraAsk(text, count) {
  if (CLIP_ASK.test(text)) return { kind: 'clip' };
  if (HOLO_ASK.test(text) && count <= 6) return { kind: 'hologram' };
  const named = /(?:volume|som)\s+(?:do|da|de)\s+([a-z0-9 ._-]{2,24}?)(?:\s+(?:para|em|a|pra))?\s+(\d{1,3})\b/i.exec(text);
  if (named && Number(named[2]) <= 100) return { kind: 'appvol', app: named[1].trim(), level: Number(named[2]) };
  const down = /\babaixa(?:r)?\s+(?:o |a )?(?!volume\b|som\b)([a-z0-9]{2,20})\b/i.exec(text);
  if (down && count <= 6) return { kind: 'appvol', app: down[1], level: 15 };
  const up = /\baumenta(?:r)?\s+(?:o |a )?(?!volume\b|som\b)([a-z0-9]{2,20})\b/i.exec(text);
  if (up && count <= 6) return { kind: 'appvol', app: up[1], level: 80 };
  if (count > 8) return null;
  const strip = STRIP_ASK.find(([, re]) => re.test(text));
  if (strip) return { kind: 'strip', name: strip[0] };
  return null;
}

function said(lang, table, more) {
  const line = table[lang] || table.en;
  return more ? line.replace(/\{(\w+)\}/g, (_, key) => String(more[key] ?? '')) : line;
}

// A real job on the PC that her own buttons do not already cover. Grok does it.
// Chat, jokes, music, and feelings do not match.
const PC_OBJECT = /arquivo|pasta|desktop|[áa]rea de trabalho|\bpc\b|computador|\bwindows\b|configura|programa|download|atalho|lixeira|explorador|explorer|wallpaper|papel de parede|planilha|documento|script|barra de tarefas|inicializa/i;
const PC_STRONG = /\b(instal(?:a|ar|e|em|ou|ando|ado|ei)|desinstal(?:a|ar|e|em|ou|ando|ado|ei)|baix(?:a|ar|e|em|ou|ando|ei)|download(?:s|ar|ed)?|apag(?:a|ar|ue|ou|ando)|delet(?:a|ar|e|ou|ando)|exclu(?:i|ir|a|o|em|iu|indo)|renome(?:ia|ie|ar|ou|ando)|configur(?:a|ar|e|em|ou|ando)|format(?:a|ar|e|ou|ando)|deslig(?:a|ar|ue|ou|ando)|reinici(?:a|ar|e|ou|ando)|compact(?:a|ar|e|ou|ando)|extrai(?:r|a|ndo|u)?|zip(?:a|ar|e|ou)?|uninstall|rename|install)\b/i;
const PC_WEAK = /\b(cri[ae]r?|create|mud(?:a|ar|e)|alter(?:a|ar|e|ou|ando)|change|remov(?:a|er|e|eu|endo)|mov(?:a|e|er)|copi(?:a|ar|e|ou|ando)|copy|escrev(?:e|er|a|eu|endo)|write|salv(?:a|ar|e|ou|ando)|save|execut(?:a|ar|e|ou|ando)|coloc(?:a|ar|ue|ou|ando)|arrum(?:a|ar|e|ou|ando)|organiz(?:a|ar|e|em|ou|ando)|limp(?:a|ar|e|ou|ando)|atualiz(?:a|ar|e|ou|ando)|update|consert(?:a|ar|e|ou|ando)|corrig(?:e|ir|a|iu|indo)|fix|agend(?:a|ar|e|ou|ando)|imprim(?:e|ir|a|iu|indo)|faz|fa[cç]a|fazer|make|set up|setup)\b/i;
// Clones are copies on her overlay. Checked before a PC job so "apaga os clones" is not a real delete.
const CLONE_CLEAR = /\b(?:some com (?:os |as )?clones|apaga (?:os |as )?clones|tira (?:os |as )?clones|remove (?:os |as )?clones|limpa (?:os |as )?clones|chega de clones|para os clones|stop (?:the )?clones|manda (?:os |as )?clones embora)\b/i;
const CLONE_COUNT = /\b(?:faz|cria|chama|make|spawn|quero|spawna)\b[^\d]{0,20}(\d)\s+clones?\b|\b(\d)\s+clones?\b/i;
const CLONE_ASK = /\b(?:clones?|clona)\b|\bmodo caos\b|\bmodo chaos\b|^(?:capri[, ]+)?(?:caos|chaos)\b/i;
const HAND_KINDS = new Set(['grok', 'music', 'media', 'youtube', 'roblox', 'web', 'files', 'shot', 'play', 'open', 'pc', 'clip', 'appvol', 'care']);

function clonesAsked(text) {
  if (CLONE_CLEAR.test(text)) return { kind: 'clones', n: 0 };
  const count = CLONE_COUNT.exec(text);
  if (count && !PC_OBJECT.test(text)) return { kind: 'clones', n: Math.min(4, Math.max(1, Number(count[1] || count[2]))) };
  if (CLONE_ASK.test(text) && text.trim().split(/\s+/).length <= 6 && !PC_OBJECT.test(text)) return { kind: 'clones', n: 2 };
  return null;
}

function pcTask(text) {
  const t = String(text || '').trim();
  if (t.length < 8 || t.length > 2000) return false;
  if (t.split(/\s+/).length < 3) return false;
  if (/^(?:oi|ol[aá]|eae|eai|hey|hi|hello|bom dia|boa tarde|boa noite)\b/i.test(t) && !PC_STRONG.test(t)) return false;
  if (/\b(?:volume|som)\b/i.test(t) && !/arquivo|pasta|download/i.test(t)) return false;
  if (MUSIC_WORD.test(t) && !/arquivo|pasta|download|programa|instala/i.test(t)) return false;
  if (/\?\s*$/.test(t) && !PC_STRONG.test(t)) return false;
  if (PC_STRONG.test(t)) return true;
  return (PC_OBJECT.test(t) || /\b(file|folder|desktop|setting|program|computer)\b/i.test(t)) && PC_WEAK.test(t);
}
// the words that aren't what to look for
const NOT_SEARCHED = new Set(('stp svp please pls peux tu can you could would puedes pode можешь moi me le la les l mon ma mes '
  + 'un une des du de d the my a an for of el mi mis o meu minha meus мой мою мои sur dans on in en no na на в pc ordi ordinateur '
  + 'computer ordenador computador компьютере fichier fichiers dossier dossiers document documents photo photos image images '
  + 'vidéo vidéos video videos file files folder folders archivo archivos carpeta carpetas arquivo arquivos pasta pastas файл '
  + 'файлы папка папку appelé appelée nommé called named llamado chamado qui s appelle est sont is are where où cherche recherche '
  + 'trouve retrouve search find look up busca encuentra procura acha найди поищи где dónde onde google internet web online ligne').split(' '));
// the kind of file asked for: "mon projet after effect" is a .aep
const FILE_TYPES = [
  [/after ?effects?/i, ['aep']], [/premi[eè]re/i, ['prproj']], [/photoshop|\bpsd\b/i, ['psd']], [/illustrator/i, ['ai']],
  [/blender/i, ['blend']], [/cinema ?4d|\bc4d\b/i, ['c4d']], [/fl ?studio/i, ['flp']], [/ableton/i, ['als']],
  [/\bword\b|\bdocx?\b/i, ['docx', 'doc']], [/excel|\bxlsx?\b|tableur|spreadsheet/i, ['xlsx', 'xls', 'csv']],
  [/powerpoint|\bpptx?\b|diapo|slides/i, ['pptx', 'ppt']], [/\bpdf\b/i, ['pdf']],
  [/vid[ée]os?\b|\bmp4\b|\bfilms?\b|v[íi]deo|видео/i, ['mp4', 'mov', 'mkv', 'avi', 'webm']],
  [/photos?\b|images?\b|\bpng\b|\bjpe?g\b|imagen|imagem|фото/i, ['png', 'jpg', 'jpeg', 'webp', 'heic']],
  [/musiques?\b|\bmp3\b|\baudio\b|\bsongs?\b|музык/i, ['mp3', 'wav', 'flac', 'm4a', 'ogg']],
  [/\bzip\b|\barchive|\brar\b|\b7z\b/i, ['zip', 'rar', '7z']],
];
const fileTypes = (text) => [...new Set(FILE_TYPES.filter(([re]) => re.test(text)).flatMap(([, exts]) => exts))];
// words that only say what kind of file it is, or what to do with it once found
const NOT_A_NAME = new Set(('and et y e и it ça ca lo la o open ouvre ouvrir ouvres abre abrir открой show montre affiche '
  + 'projet projets project projects proyecto projeto проект after effect effects premiere pro photoshop illustrator blender cinema '
  + '4d c4d fl studio ableton word excel powerpoint pdf mp4 mp3 png jpg jpeg zip rar 7z film films musique musiques music song songs '
  + 'audio présentation presentation diapo slides tableur spreadsheet dernier dernière derniers last latest récent récents recent '
  + 'nouveau new psd docx doc xlsx pptx').split(' '));
// "…and open the folder", "…et ouvre-le": what to do with what she found
const THEN_FOLDER = /(?:ouvre|ouvrir|open|show|montre|abre|abrir|открой|покажи)\s+(?:moi\s+)?(?:le |la |the |its |son |el |a |o )?(?:dossier|folder|carpeta|pasta|папку)/i;
const THEN_OPEN = /(?:et|and|y|e|и)\s+(?:l['’])?(?:ouvre|open|lance|abre|открой)(?:[- ](?:le|la|les)|\s+(?:it|them|lo|la|o|его|её))?\s*[.!?]*$/i;
const searched = (text) => text.replace(/^\s*capri[,!:]?\s+/i, '').toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter((w) => w && !NOT_SEARCHED.has(w)).join(' ');
// a Roblox game by its name: "in my roblox play steal a brain rot", "lance grow a garden sur roblox"
const ROBLOX_VERB = /(?:^|\s)(?:play|joue(?:r)?(?: à| a)?|lance|launch|start|ouvre|open|mets|go to|va sur|juega(?: a)?|jogue|jogar|запусти|включи)\s+/gi;
function robloxGame(text) {
  if (!/roblox/i.test(text)) return null;
  let rest = null;
  for (const m of text.matchAll(ROBLOX_VERB)) rest = text.slice(m.index + m[0].length); // after the last verb
  if (!rest) return null;
  const name = rest
    .replace(/\s+(?:on|in|sur|dans|en|no|na|в)\s+(?:my\s+|mon\s+|mi\s+|meu\s+)?roblox\b.*$/i, '')
    .replace(/\broblox\b/ig, '')
    .replace(/^(?:à|a|au|to|le jeu|the game|un jeu|el juego|o jogo)\s+/i, '')
    .replace(/\s+(?:stp|svp|please|pls|por favor)\b.*$/i, '')
    .replace(/[\s.!?,]+$/, '')
    .trim();
  return name.length >= 2 ? name : null;
}
// "regarde mon écran", "tu vois quoi ?", "what's on my screen?", "что ты видишь?"
const LOOK_ASK = /regarde (?:mon|l['’]|ce que)|(?:jette|jeter) un (?:œil|oeil)|tu vois quoi|qu['’]est[- ]ce que tu vois|look at (?:my|the|this) screen|what(?:'s| is) on my screen|what do you see|take a look|mira (?:mi|la) pantalla|qu[ée] ves|olha (?:minha|a) tela|o que voc[êe] v[êe]|посмотри на (?:мой )?экран|что ты видишь/i;
// what her tag needs to find in your message before it does anything: a small model tags answers about
// anything ("[[music: synthwave]]" under a film tip), and music and the media keys act right away
const LISTEN = /[ée]cout|listen|escuch|\bouv(ir|e)\b|слуша|playlist|album|\b(play|joue|mets|pon|toca|coloca)\b|включи|поставь/i;
const SOUND = /\b(sound|volume|volumen)\b|\b(le|du|au) son\b|\bo som\b|звук|громк/i; // not "son": "his" in French
const PLAY = /\bjou(er|e)\b|\bplay\b|jugar|juega|jogar|joga|играть|поигра/i;
const SITE = /\b(site|web|page|lien|link|url|enlace|p[aá]gina)|сайт|ссылк|\.(com|fr|org|net|io|gg|tv|be|ch|ca|es|br|pt|ru)\b/i;
// "appelle-moi Max", "call me Max", "llámame Max", "me chama de Max", "зови меня Макс"
const NAME_ASK = /(?:appelle[- ]moi|call me|my name is|je m['’]appelle|ll[aá]mame|me llamo|me cham[ae] de|meu nome [eé]|зови меня|меня зовут)\s+([\p{L}\p{N}'’-]{1,24})/iu;
// "souviens-toi que…", "remember that…", "recuerda que…", "lembra que…", "запомни, что…" (said first thing)
const MEMO_ASK = /^\s*(?:capri,?\s+|stp,?\s+|please,?\s+)?(?:souviens[- ]toi(?: que| de)?|n['’]oublie pas(?: que| de)?|remember(?: that)?|recuerda(?: que)?|lembr[ae](?:-se)?(?: que| de)?|запомни,?(?: что)?)\s+(.{3,200})/iu;
const MEMORIES_MAX = 30;
// sites asked for by name ("open youtube") when no app on the PC goes by it: the address is hers, not
// the model's, so it opens right away like an app you named
const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  twitch: 'https://www.twitch.tv', netflix: 'https://www.netflix.com', reddit: 'https://www.reddit.com',
  twitter: 'https://x.com', instagram: 'https://www.instagram.com', tiktok: 'https://www.tiktok.com',
  facebook: 'https://www.facebook.com', github: 'https://github.com', chatgpt: 'https://chatgpt.com',
  wikipedia: 'https://www.wikipedia.org', linkedin: 'https://www.linkedin.com', pinterest: 'https://www.pinterest.com',
  crunchyroll: 'https://www.crunchyroll.com', outlook: 'https://outlook.live.com', whatsapp: 'https://web.whatsapp.com',
  discord: 'https://discord.com/app', soundcloud: 'https://soundcloud.com', deezer: 'https://www.deezer.com',
};
// a browser named with a site ("open youtube on chrome"): the site, in the browser you use
const BROWSER = /chrome|edge|firefox|opera|brave|vivaldi|duckduckgo|browser/i;
// local models this small mostly talk nonsense ("llama3.2:1b", "qwen2.5:0.5b"…)
const TINY = /[:-](0\.5b|1b|1\.5b|135m|270m|360m)\b/i;
// her face when she greets you in a mood (bond.js)
const MOOD_FACE = { angry: 'many', sulk: 'aside', dizzy: 'wide', thrown: 'wide', jealous: 'look', fun: 'laugh', happy: 'laugh', forgiven: 'smug' };

export class Chat {
  constructor({ capri, panel, voice, host, brain }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.history = []; // your chats with her, [{ role, content }], kept by main.js across restarts
    this.warm = false; // a model already answered this run (Ollama's first answer waits for it to load)
    this.open = false;
    this.turn = 0;     // id of the answer coming in, if any
    this.answer = '';
    this.apps = [];    // the apps open on this PC, as last listed: [{ name, label }]
    this.appsReady = Promise.resolve();
    this.onSetup = null; // (status) => void: she can't answer yet (app.js hands it to setup.js)
    this.onBetterModel = null; // () => void: a bigger model than the tiny one she's on (setup.js)
    this.reminders = null; // the reminders she keeps (reminders.js, from app.js)
    this.bond = null;      // how close she is to you (bond.js)
    this.jealousy = null;  // and how she takes your other AIs
    this.onMessage = null; // () => void: you said something to her
    this.waitingWhen = null; // a reminder you asked for without saying when: { text, until }
    host.onChatDelta(({ id, text }) => this.onDelta(id, text));
    const stream = this.panel.stream.bind(this.panel);
    this.panel.stream = (text, opts = {}) => {
      const out = stream(text, opts);
      if (opts.done) this.speak(String(text || '').split('\n').slice(-2).join(' '));
      return out;
    };
  }

  get t() {
    return this.brain.t.chat;
  }

  async start() {
    const { capri, host, t } = this;
    if (this.deskPanel) {
      this.panel = this.deskPanel;
      this.deskPanel = null;
      this.homeAction = null;
    }
    if (this.open) {
      this.panel.chatInput.focus();
      return;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    const status = await host.chatStatus();
    if (!status.ok && this.onSetup) {
      this.onSetup(status); // nothing to talk with yet: she sets it up with you, with buttons (setup.js)
      return;
    }
    if (!status.ok) {
      // no Ollama, or nothing to talk with yet: what to do about it
      const offline = status.error === 'offline';
      const other = !offline && status.error !== 'nomodel'; // another provider, saying why
      capri.perform('curious', capri.towardCenter());
      this.panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: other ? t.failed : offline ? t.offline : t.noModel,
        quote: other ? status.error : offline ? t.offlineHow : t.noModelHow,
        actions: offline
          ? [{ id: 'get', label: t.getOllama, primary: true }, { id: 'ok', label: t.ok }]
          : [{ id: 'ok', label: t.ok, primary: true }],
        onAction: (id) => {
          if (id === 'get') host.openOllama();
          this.panel.hide();
        },
        hold: null,
      });
      return;
    }
    this.history = await host.chatMemory().catch(() => this.history); // "forget" in her menu may have emptied it
    this.cold = status.warmup && !this.warm;
    this.agent = Boolean(status.agent); // Claude Code answers, as her, and really works in your project
    this.listApps();
    const shortModel = status.model.replace(/:latest$/, '').replace(/^models\//, ''); // Ollama's tag, Gemini's prefix
    const tiny = status.provider === 'ollama' && TINY.test(status.model) && this.onBetterModel;
    // angry, sulking, dizzy…: she greets you the way she feels, and her model is told she did
    const feeling = this.bond?.feeling;
    const moody = !tiny && feeling && t.moody[feeling];
    const hello = moody ? fmt(pick(moody), this.bond.mood.vars) : pick(this.history.length ? t.again : t.hello);
    this.opening = moody ? hello : null;
    host.focusOverlay(true); // the keyboard, for typing to her
    const shown = this.panel.say({
      kind: 'chat',
      face: moody ? MOOD_FACE[feeling] : 'look',
      badge: t.badge,
      tag: shortModel,
      line: tiny ? fmt(t.tiny, { model: shortModel }) : hello,
      actions: tiny ? [{ id: 'better', label: t.better, primary: true }] : [],
      onAction: () => {
        this.panel.hide(); // her chat holds off her guide's panels: it goes first
        this.onBetterModel?.();
      },
      chat: {
        placeholder: t.placeholder,
        send: t.send,
        close: t.close,
        noteTag: t.noteTag,
        note: status.local ? t.note : t.noteCloud,
      },
      onSend: (text) => this.send(text),
      onLeave: () => this.close(),
      hold: null,
    });
    if (!shown) {
      host.focusOverlay(false); // something more important is on (a permission prompt)
      return;
    }
    this.open = true;
    setTimeout(() => this.panel.chatInput.focus(), 150); // once the overlay has the keyboard
    capri.perform('hop');
    capri.nextMove = capri.nextGaze = performance.now() + STAY_MS;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.turn) this.host.chatStop(this.turn);
    this.turn = 0;
    this.host.focusOverlay(false);
    this.capri.nextMove = performance.now() + 30000;
    this.capri.nextGaze = performance.now() + 60000;
  }

  // Her window is talking. The desktop bubble stays down; lines and buttons go to the window.
  async homeSay(text, opts) {
    const raw = String(text || '').trim();
    if (!raw || this.turn || this.grokBusy) return;
    const wasOpen = this.open;
    if (!this.deskPanel) this.deskPanel = this.panel;
    this.panel = this.homeFace(this.deskPanel);
    try {
      if (!this.open) {
        const status = await this.host.chatStatus();
        if (!status.ok) {
          const t = this.t;
          const offline = status.error === 'offline';
          const other = !offline && status.error !== 'nomodel';
          this.host.homeLine({
            role: 'capri',
            text: other ? `${t.failed} ${status.error}` : offline ? t.offline : t.noModel,
            done: true,
          });
          return;
        }
        this.history = await this.host.chatMemory().catch(() => this.history);
        this.cold = status.warmup && !this.warm;
        this.agent = Boolean(status.agent);
        this.listApps();
        this.open = true;
        this.capri.wake();
      }
      await this.send(raw, opts);
    } finally {
      if (!wasOpen) {
        this.open = false;
        this.host.focusOverlay(false);
      }
    }
  }

  homeFace(real) {
    const host = this.host;
    const chat = this;
    const ignore = () => {};
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'stream') {
          return (text, opts = {}) => {
            host.homeLine({ role: 'capri', text: String(text || ''), done: Boolean(opts?.done) });
            if (opts?.done) chat.speak(String(text || '').split('\n').slice(-2).join(' '));
          };
        }
        if (prop === 'chatTurn') return ({ quote }) => host.homeLine({ role: 'you', text: String(quote || '') });
        if (prop === 'setChatBusy') return (on) => host.homeLine({ role: 'busy', on: Boolean(on) });
        if (prop === 'setActions') {
          return (actions, onAction) => {
            chat.homeAction = typeof onAction === 'function' ? onAction : null;
            host.homeLine({
              role: 'actions',
              actions: (actions || []).map((a) => ({ id: a.id, label: a.label, primary: Boolean(a.primary) })),
            });
          };
        }
        if (prop === 'setFace' || prop === 'hide') return ignore;
        if (prop === 'say') {
          return (card) => {
            if (!card || typeof card !== 'object') return true;
            if (card.line) host.homeLine({ role: 'capri', text: String(card.line), done: true });
            if (card.actions?.length) {
              chat.homeAction = typeof card.onAction === 'function' ? card.onAction : null;
              host.homeLine({
                role: 'actions',
                actions: card.actions.map((a) => ({ id: a.id, label: a.label, primary: Boolean(a.primary) })),
              });
            }
            return true;
          };
        }
        if (prop === 'chatInput') return { focus() {}, value: '' };
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  homeAnswer(id) {
    const fn = this.homeAction;
    this.homeAction = null;
    if (!fn) return;
    if (this.deskPanel) this.panel = this.homeFace(this.deskPanel);
    const was = this.open;
    this.open = true;
    Promise.resolve(fn(id)).finally(() => {
      if (!was) this.open = false;
    });
  }

  async send(text, opts) {
    if (this.turn || this.grokBusy || !this.open) return;
    const id = Date.now();
    this.turn = id;
    this.answer = '';
    this.history.push({ role: 'user', content: text });
    this.panel.setChatBusy(true);
    this.panel.setActions([]); // a close button she offered before goes with a new message
    this.panel.chatTurn({ quote: text, face: 'aside' });
    this.capri.pulse();
    this.onMessage?.();
    // what you asked for plainly happens right away (the music, the volume, an app you named): her
    // line about it comes under her answer (Claude Code, answering her chat, does things its own way)
    const asked = this.agent ? null : this.asked(text);
    if (asked?.kind === 'look') return this.sendLook(text, id);
    if (asked?.kind === 'now') return this.answerNow(id);
    if (asked?.kind === 'clones') return this.answerClones(asked, id);
    const early = asked && asked.kind !== 'close' ? this.doNow(asked) : null;
    this.bond?.heard(text); // "sorry": she lets it go
    await Promise.race([this.appsReady, new Promise((r) => setTimeout(r, 1500))]);
    // what she greeted you with (angry, sulking…), in the conversation before your message, so her
    // answer carries on from it (after another answer of hers: added to that one, never two in a row)
    if (this.opening) {
      const at = this.history.length - 1;
      const before = this.history[at - 1];
      if (before?.role === 'assistant') this.history[at - 1] = { ...before, content: `${before.content}\n${this.opening}` };
      else this.history.splice(at, 0, { role: 'assistant', content: this.opening });
      this.opening = null;
    }
    const messages = [{ role: 'system', content: this.persona() }, ...this.history.slice(-REMEMBER)];
    // Her mood (angry, sulking…) and her language, said again right by your message, for this answer
    // only. Small local models mostly go by the last thing they read: up in her prompt alone, they
    // forget it (and answer in English after a conversation in English).
    if (!this.agent) {
      const mood = this.bond?.moodLine().replace(/^Right now: /, '');
      const last = messages.at(-1);
      messages[messages.length - 1] = { ...last, content: `${last.content}\n\n(Note for you, never repeat it: ${[mood, this.languageNote()].filter(Boolean).join(' ')})` };
    }
    // nothing yet after a few seconds: Ollama is still loading the model (the first answer after a start),
    // or Claude Code is at work
    const wait = this.agent ? this.t.working : this.cold ? this.t.loading : null;
    const slow = wait && setTimeout(() => {
      if (this.turn === id && !this.answer) this.panel.stream(wait);
    }, LOADING_AFTER_MS);
    const payload = { id, messages };
    if (opts?.think) payload.think = opts.think;
    if (opts && opts.web != null) payload.web = Boolean(opts.web);
    if (opts?.web) payload.query = text;
    const res = await this.host.chatSend(payload);
    clearTimeout(slow);
    if (this.turn !== id) {
      // closed meanwhile: your message goes too, or the next answer would answer it as well
      if (this.history.at(-1)?.content === text) this.history.pop();
      return;
    }
    const grokJob = !this.agent && asked?.kind === 'grok';
    if (!grokJob) this.turn = 0;
    if (!res.ok) {
      this.turn = 0;
      this.history.pop();
      this.panel.setFace('wide');
      // too busy or gone even after trying other models (main.js): said plainly, not the server's JSON
      this.panel.stream(res.code === 'busy' ? this.t.swamped : res.code === 'gone' ? this.t.gone : `${this.t.failed} ${res.error}`, { done: true });
      this.panel.setChatBusy(false);
      return;
    }
    const answer = clean(res.text) || '…';
    this.warm = true;
    this.remember({ role: 'assistant', content: answer });
    this.panel.stream(answer, { done: true });
    this.panel.setFace(mood(answer));
    if (grokJob) {
      // hold the bubble until Grok finishes, so a long job is not dropped by the next message
      this.grokBusy = true;
      const wait = { pt: 'Tô chamando o Grok…', en: 'Asking Grok…', es: 'Llamando a Grok…', fr: 'J’appelle Grok…', ru: 'Зову Grok…' };
      this.panel.stream(`${answer}\n${wait[this.brain.lang] || wait.en}`, { done: true });
      try {
        const done = early && (await early);
        if (this.turn === id) this.turn = 0;
        this.panel.setChatBusy(false);
        if (this.open && !this.turn && done?.line) {
          this.addLine(answer, done.line, done.face);
          const last = this.history.at(-1);
          if (last?.role === 'assistant') {
            last.content = `${answer}\n${done.line}`;
            this.host.chatRemember(this.history);
          }
        }
      } finally {
        this.grokBusy = false;
        if (!this.turn) this.panel.setChatBusy(false);
      }
    } else {
      this.panel.setChatBusy(false);
      if (!this.agent) this.after(res.text, answer, asked, early, text);
    }
    this.listApps(); // fresh for the next message
  }

  // "Look at my screen" in her chat: she looks (asking you first, the first time) and answers here,
  // the conversation so far in mind.
  async sendLook(text, id) {
    const tl = this.brain.t.look;
    const say = (line, face = 'aside') => {
      if (this.turn !== id) return;
      this.turn = 0;
      this.remember({ role: 'assistant', content: line });
      this.panel.stream(line, { done: true });
      this.panel.setFace(face);
      this.panel.setChatBusy(false);
    };
    if (!this.look.asked) {
      const where = await this.host.lookWhere().catch(() => ({}));
      this.history.pop(); // your message comes back once you've said yes
      say(`${tl.ask} ${fmt(where.local ? tl.local : tl.online, { model: where.model || '…', service: where.provider || '' })}`, 'look');
      this.panel.setActions([{ id: 'yes', label: tl.yes, primary: true }, { id: 'no', label: tl.no }], async (choice) => {
        this.panel.setActions([]);
        if (choice !== 'yes') {
          this.interject(tl.declined, [], null);
          return;
        }
        await this.host.setConfig({ lookAsked: true });
        this.look.asked = true;
        this.send(text);
      });
      return;
    }
    const snap = await this.host.lookSnap();
    if (!snap.ok) return say(fmt(tl.failed, { error: snap.error }));
    this.look.effect();
    const res = await this.host.lookSay({
      id: snap.id,
      persona: this.lookPersona(),
      history: this.history.slice(-REMEMBER, -1),
      prompt: `${text}\n\n(Note for you, never repeat it: the picture is the user's screen right now; a small figure with a big red mane on it is you. Answer about what you really see, in character. ${this.languageNote()})`,
    });
    if (!res.ok) {
      const model = String(res.model || '…').replace(/:latest$/, '');
      return say(res.code === 'novision' ? fmt(tl.noVision, { model }) : res.code === 'noai' ? tl.noAI : fmt(tl.failed, { error: res.error || '…' }));
    }
    const answer = clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, '') || '…';
    this.seen = { text: answer, at: Date.now() };
    return say(answer, mood(answer));
  }

  // "O que tá tocando?": the Windows media session, said here. The small model is not asked.
  async answerNow(id) {
    const say = (line, face = 'smug') => {
      if (this.turn !== id) return;
      this.turn = 0;
      this.remember({ role: 'assistant', content: line });
      this.panel.stream(line, { done: true });
      this.panel.setFace(face);
      this.panel.setChatBusy(false);
    };
    const info = await this.host.nowPlaying().catch(() => null);
    const lang = speechCode(this.brain.lang);
    const none = {
      pt: 'Não tá tocando nada agora.',
      en: 'Nothing is playing.',
      es: 'No está sonando nada.',
      fr: 'Rien ne joue.',
      ru: 'Сейчас ничего не играет.',
    };
    const title = [info?.artist, info?.title].map((s) => String(s || '').trim()).filter(Boolean).join(' — ');
    const on = info && (info.status === 'Playing' || info.status === 'Paused') && title;
    if (!on) return say(none[lang] || none.en, 'aside');
    const paused = info.status === 'Paused';
    const line = {
      pt: paused ? `Pausado: ${title}.` : `Tá tocando ${title}.`,
      en: paused ? `Paused: ${title}.` : `Playing ${title}.`,
      es: paused ? `En pausa: ${title}.` : `Está sonando ${title}.`,
      fr: paused ? `En pause : ${title}.` : `Ça joue : ${title}.`,
      ru: paused ? `На паузе: ${title}.` : `Играет ${title}.`,
    };
    return say(line[lang] || line.en, paused ? 'aside' : 'laugh');
  }

  // "faz 3 clones" / "some com os clones": copies on the overlay. The model is not asked.
  async answerClones(asked, id) {
    const say = (line, face = 'smug') => {
      if (this.turn !== id) return;
      this.turn = 0;
      this.remember({ role: 'assistant', content: line });
      this.panel.stream(line, { done: true });
      this.panel.setFace(face);
      this.panel.setChatBusy(false);
    };
    if (!asked.n) {
      this.clones?.clear();
      return say('Foram embora.', 'aside');
    }
    const n = this.clones?.summon(asked.n) || 0;
    if (!n) return say('Já tem quatro.', 'aside');
    return say(n === 1 ? 'Uma cópia.' : `${n} cópias. Esc manda embora.`, 'laugh');
  }

  // Spoken aloud (Maria, on this PC). Short, and not the same line twice in a row.
  speak(line) {
    const text = String(line || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!text || text === '…' || !this.host.say) return;
    const now = Date.now();
    if (text === this.saidText && now - (this.saidAt || 0) < 4000) return;
    this.saidText = text;
    this.saidAt = now;
    this.host.say(text).catch(() => {});
  }

  // "Hey Capri …": one utterance. A bare wake just answers. The rest goes through the normal chat.
  hear(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return;
    const woke = /^(?:hey |ei |oi |e a[ií] |eai )?capri\b[,!. ]*(.*)$/i.exec(raw);
    if (!woke) return;
    const rest = woke[1].trim();
    const flat = rest.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (/^(?:para|esc|chega|stop|cancela|cala a boca)$/.test(flat)) {
      this.hands?.stop();
      this.clones?.clear();
      this.host.stopJob?.();
      this.speak('Parado.');
      return;
    }
    if (!rest) {
      this.speak('Oi. Pode falar.');
      try { this.capri.perform('curious', this.capri.towardCenter()); } catch { /* pose is optional */ }
      return;
    }
    this.start().then(() => this.send(rest));
  }

  // Ctrl+Alt+V: Windows voice typing into her chat, then send once the words stop arriving.
  armVoiceType() {
    const input = this.panel.chatInput;
    if (!input) return;
    const focus = () => input.focus();
    focus();
    setTimeout(focus, 200);
    let last = input.value;
    let timer = 0;
    const finish = () => {
      input.removeEventListener('input', watch);
      const typed = input.value.trim();
      if (!typed || this.turn || this.grokBusy) return;
      input.value = '';
      this.send(typed);
    };
    const watch = () => {
      if (input.value === last) return;
      last = input.value;
      clearTimeout(timer);
      if (last.trim()) timer = setTimeout(finish, 1200);
    };
    input.addEventListener('input', watch);
    setTimeout(() => {
      input.removeEventListener('input', watch);
      clearTimeout(timer);
    }, 20000);
  }

  // an answer of hers, kept with your message before it
  remember(message) {
    this.history.push(message);
    this.history = this.history.slice(-KEEP);
    this.host.chatRemember(this.history);
  }

  listApps() {
    this.appsReady = this.host.openApps().then((list) => { this.apps = list || []; }).catch(() => {});
  }

  // What you asked plainly, read off your message (a small model doesn't always write its tag right):
  // { kind: 'media', action } | { kind: 'music', song } | { kind: 'close', name } | { kind: 'open', text }
  asked(text) {
    const count = text.trim().split(/\s+/).length;
    if (this.reminders) {
      const remind = parseReminder(text);
      if (remind) return { kind: 'remind', ...remind };
      // the time, said after she asked when ("dans 10 min")
      const w = this.waitingWhen;
      const when = w && Date.now() < w.until && count <= 6 && parseWhen(text);
      if (when && when.at > Date.now()) return { kind: 'remind', at: when.at, text: w.text };
    }
    const name = NAME_ASK.exec(text)?.[1];
    if (name) return { kind: 'name', name };
    const memo = MEMO_ASK.exec(text)?.[1]?.trim();
    if (memo) return { kind: 'memo', text: memo };
    if (this.look && LOOK_ASK.test(text)) return { kind: 'look' };
    const extra = extraAsk(text, count);
    if (extra) return extra;
    const care = this.care?.asked(text, count);
    if (care) return care;
    const pc = this.askedPc(text, count);
    if (pc) return pc;
    if (SHOT_ASK.test(text)) return { kind: 'shot' };
    const roblox = robloxGame(text);
    if (roblox) return { kind: 'roblox', game: roblox };
    if (SEARCH_VERB.test(text) && WEB_WORD.test(text) && searched(text)) return { kind: 'web', query: searched(text) };
    const exts = fileTypes(text);
    if (SEARCH_VERB.test(text) && (FILE_WORD.test(text) || exts.length)) {
      const query = searched(text).split(' ').filter((w) => w && !NOT_A_NAME.has(w)).join(' ');
      const then = THEN_FOLDER.test(text) ? 'folder' : THEN_OPEN.test(text) ? 'open' : null;
      if (query || exts.length) return { kind: 'files', query, exts, then };
    }
    if (NOW_ASK.test(text) && count <= 12) return { kind: 'now' };
    const media = MEDIA_ASK.find(([, re]) => re.test(text))?.[0];
    if (media && (count <= 5 || MUSIC_WORD.test(text))) return { kind: 'media', action: media };
    const song = SPOTIFY_ASK.exec(text)?.[1];
    if (song) return { kind: 'music', song };
    const video = YOUTUBE_ASK.exec(text)?.[1];
    if (video) return { kind: 'youtube', song: songOf(video) };
    const app = this.askedToClose(text);
    if (app) return { kind: 'close', name: app };
    const clones = clonesAsked(text);
    if (clones) return clones;
    // install, create a file, change a setting: Grok, not the open-an-app button
    if (pcTask(text)) return { kind: 'grok', text };
    if (GAME_ASK.test(text) && count <= 8) return { kind: 'open', text };
    const start = MUSIC_START.exec(text.trim())?.[1];
    if (start && !HER_PICK.test(start)) return { kind: 'play', song: songOf(start.replace(/[\s.!?]+$/, '')) };
    const both = PLAY_AFTER.exec(text.trim());
    const after = both?.[1];
    // "ouvre discord et lance spotify": the first half too
    if (after && !VAGUE_SONG.test(after) && !HER_PICK.test(after)) return { kind: 'play', song: songOf(after.replace(/[\s.!?]+$/, '')), before: text.trim().slice(0, both.index) };
    const play = PLAY_ASK.exec(text.trim())?.[1];
    if (play && !VAGUE_SONG.test(play) && !HER_PICK.test(play)) return { kind: 'play', song: songOf(play.replace(/[\s.!?]+$/, '')) };
    if (OPEN_ASK.test(text) && count <= 14) return { kind: 'open', text };
    return null;
  }

  askedPc(text, count) {
    const pc = (what, more = {}) => ({ kind: 'pc', what, ...more });
    const power = POWER_ASK.find(([, re]) => re.test(text))?.[0];
    if (power === 'cancel') return pc('power', { power });
    if (power && (PC_WORD.test(text) || (['lock', 'sleep'].includes(power) && count <= 4))) {
      const when = ['shutdown', 'restart'].includes(power) && parseWhen(text);
      return pc('power', { power, seconds: when ? Math.round((when.at - Date.now()) / 1000) : 30 });
    }
    if (SNIP_ASK.test(text)) return pc('snip');
    if (UNTIDY_ASK.test(text)) return pc('tidy', { back: true });
    if (TIDY_ASK.test(text)) return pc('tidy');
    if (DARK_ASK.test(text)) return pc('theme', { dark: true });
    if (LIGHT_ASK.test(text)) return pc('theme', { dark: false });
    if (TIMER_ASK.test(text)) {
      const ms = duration(text);
      if (ms >= 1000) return pc('timer', { ms });
    }
    if (count <= 10) {
      const level = VOLUME_ASK.exec(text)?.[1];
      if (level && Number(level) <= 100) return pc('volume', { level: Number(level) });
      if (UNMUTE_ASK.test(text)) return pc('volume', { mute: false });
      if (MUTE_ASK.test(text)) return pc('volume', { mute: true });
    }
    // "mets Discord à gauche et Chrome à droite"
    if (PLACE_VERB.test(text) && SIDE.some(([, re]) => re.test(text))) {
      const places = text.split(/\s+(?:et|and|y|e|и)\s+/i).map((part) => {
        const side = SIDE.find(([, re]) => re.test(part));
        if (!side) return null;
        const name = part.replace(PLACE_VERB, '').replace(side[1], '').replace(/\b(?:la|le|les|l['’]|the|el|o|a|fen[êe]tre|window|ventana|janela|окно)\b/gi, '').replace(/[\s.!?,]+/g, ' ').trim();
        return name.length >= 2 ? { name, side: side[0] } : null;
      }).filter(Boolean);
      if (places.length) return pc('arrange', { places });
    }
    if (count <= 12) {
      const page = SETTINGS_PAGES.find(([, re]) => re.test(text))?.[0];
      if (page && SETTINGS_WORD.test(text)) return pc('settings', { page });
      const info = INFO_ASK.find(([, re]) => re.test(text))?.[0];
      if (info && (QUESTION.test(text) || count <= 3)) return pc('info', { info });
      if (page && OPEN_ASK.test(text)) return pc('settings', { page });
    }
    return null;
  }

  // Doing it to your PC (system.js through host.pcDo): her line about it, a button first for its power.
  async pcNow(asked) {
    const t = this.t.pc;
    const run = (req) => this.host.pcDo(req);
    const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(bytes < 100 * 1024 ** 3 ? 1 : 0)} ${t.gb}`;
    switch (asked.what) {
      case 'settings':
        this.zap();
        return (await run({ action: 'settings', page: asked.page })) ? { line: fmt(t.settings, { page: t.pages[asked.page] }), face: 'smug' } : null;
      case 'info': {
        const r = await run({ action: 'info', what: asked.info });
        if (!r) return null;
        if (asked.info === 'battery') {
          if (r.none) return { line: t.noBattery, face: 'look' };
          return { line: fmt(r.charging ? t.charging : t.battery, { percent: r.percent }), face: r.percent < 20 && !r.charging ? 'wide' : 'look' };
        }
        if (asked.info === 'disk') return { line: fmt(t.disk, { free: gb(r.free), total: gb(r.total), drive: r.drive }), face: 'look' };
        if (asked.info === 'ram') return { line: fmt(t.ram, { used: gb(r.used), total: gb(r.total) }), face: 'look' };
        return { line: r.ip ? fmt(t.ip, { ip: r.ip }) : t.noIp, face: 'look' };
      }
      case 'volume': {
        this.capri.pulse();
        const r = await run({ action: 'volume', level: asked.level, mute: asked.mute });
        if (!r) return null;
        return { line: asked.mute === true ? t.muted : asked.mute === false ? t.unmuted : fmt(t.volume, { level: r.level }), face: 'smug' };
      }
      case 'timer': {
        const time = span(asked.ms);
        const r = this.reminders.add(Date.now() + asked.ms, fmt(t.timerDone, { time }), { timer: true });
        this.countdown();
        return { line: fmt(t.timer, { time }), face: 'smug', reminder: r.id };
      }
      case 'snip':
        // she'd be in it: out of the way while you pick
        document.documentElement.style.visibility = 'hidden';
        setTimeout(() => { document.documentElement.style.visibility = ''; }, 2500);
        return (await run({ action: 'snip' })) ? { line: t.snip, face: 'smug' } : null;
      case 'tidy': {
        if (asked.back) return (await run({ action: 'tidy', back: true })) ? { line: t.back, face: 'smug' } : null;
        // she sweeps them off one after the other, front first, then they go
        const wins = this.capri.windows.wins.slice(0, 6);
        this.zap();
        wins.forEach((w, i) => setTimeout(() => {
          this.capri.fx.slices(w.x, w.y, w.w, Math.min(w.h, 500), { count: 8, life: 220 });
          this.voice.play('bolt', { soft: true });
        }, 120 + i * 110));
        await new Promise((r) => setTimeout(r, 200 + wins.length * 110));
        return (await run({ action: 'tidy' })) ? { line: t.tidy, face: 'laugh' } : null;
      }
      case 'arrange': {
        this.zap();
        const lines = [];
        for (const { name, side } of asked.places) {
          const r = await run({ action: 'arrange', name, side });
          lines.push(r?.found ? fmt(t.placed, { app: r.name, side: t.sides[side] }) : fmt(t.notOpen, { app: name }));
        }
        return { line: lines.join('\n'), face: 'smug' };
      }
      case 'theme':
        this.zap();
        return (await run({ action: 'theme', dark: asked.dark })) ? { line: asked.dark ? t.dark : t.light, face: 'smug' } : null;
      case 'power': {
        if (asked.power === 'cancel') {
          await run({ action: 'power', what: 'cancel' });
          this.shutdown = null;
          return { line: t.cancelled, face: 'look' };
        }
        const timed = ['shutdown', 'restart'].includes(asked.power);
        const when = timed && asked.seconds > 35 ? fmt(t.in, { time: span(asked.seconds * 1000) }) : t.now;
        return { line: fmt(t.ask[asked.power], { when }), face: 'many', confirm: { ...asked, seconds: timed ? Math.max(30, asked.seconds) : 0, when } };
      }
      default:
        return null;
    }
  }

  // Your click on her button for your PC's power: done, or left alone.
  async powerNow(confirm, answer) {
    const t = this.t.pc;
    this.panel.setActions([]);
    if (!(await this.host.pcDo({ action: 'power', what: confirm.power, seconds: confirm.seconds }))) return;
    if (['shutdown', 'restart'].includes(confirm.power)) {
      this.shutdown = { at: Date.now() + confirm.seconds * 1000, what: confirm.power };
      this.countdown();
      this.addLine(answer, fmt(t.planned[confirm.power], { when: confirm.when }), 'smug');
    }
  }

  // Her countdowns in her ticker (a timer, the PC about to shut down), the soonest, whenever it
  // isn't showing Claude at work.
  countdown() {
    clearInterval(this.counting);
    const tick = () => {
      const t = this.t.pc;
      const now = Date.now();
      const timer = this.reminders?.upcoming.find((r) => r.timer && r.at > now);
      const items = [
        timer && { at: timer.at, verb: t.timerVerb },
        this.shutdown?.at > now && { at: this.shutdown.at, verb: t.powerVerb[this.shutdown.what] },
      ].filter(Boolean).sort((a, b) => a.at - b.at);
      const shown = this.panel.tickerAction;
      if (!items.length) {
        clearInterval(this.counting);
        if (shown?.countdown) this.panel.setTicker(null);
        return;
      }
      if (shown && !shown.countdown) return; // Claude at work comes first
      this.panel.setTicker({ verb: items[0].verb, target: left(items[0].at - now), thinking: true, countdown: true });
    };
    tick();
    this.counting = setInterval(tick, 1000);
  }


  // Doing it now. Resolves with her line about it ({ line, face }), or null if there was nothing to do.
  async doNow(asked) {
    const show = Boolean(asked && HAND_KINDS.has(asked.kind));
    if (show) this.hands?.begin();
    try {
      return await this._doNow(asked);
    } finally {
      if (show) this.hands?.end();
    }
  }

  async _doNow(asked) {
    const { t } = this;
    const custom = this.brain.custom;
    if (asked.kind === 'pc') return this.pcNow(asked);
    if (asked.kind === 'care') {
      const done = await this.care?.now(asked);
      if (done) done.care = asked;
      return done;
    }
    if (asked.kind === 'clip') {
      const ok = await this.host.pcDo({ action: 'clip' });
      const table = { pt: 'Clipe dos últimos segundos, se a Game Bar estiver ligada.', en: 'Clip of the last seconds, if Game Bar is on.', es: 'Clip de los últimos segundos, si Game Bar está activa.', fr: 'Clip des dernières secondes, si la Game Bar est allumée.', ru: 'Клип последних секунд, если Game Bar включена.' };
      return ok ? { line: said(this.brain.lang, table), face: 'smug' } : null;
    }
    if (asked.kind === 'hologram') {
      const res = await this.host.hologram();
      const on = { pt: 'Holograma. Os cliques passam por mim.', en: 'Hologram. Clicks go through me.', es: 'Holograma. Los clics pasan a través de mí.', fr: 'Hologramme. Les clics passent à travers moi.', ru: 'Голограмма. Клики проходят сквозь меня.' };
      const off = { pt: 'Voltei a pegar os cliques.', en: 'I take clicks again.', es: 'Vuelvo a recibir los clics.', fr: 'Je reprends les clics.', ru: 'Снова ловлю клики.' };
      return { line: said(this.brain.lang, res?.on ? on : off), face: 'smug' };
    }
    if (asked.kind === 'appvol') {
      const res = await this.host.pcDo({ action: 'appvol', app: asked.app, level: asked.level });
      const ok = { pt: 'Volume de {app} em {level}%.', en: '{app} volume at {level}%.', es: 'Volumen de {app} al {level}%.', fr: 'Volume de {app} à {level} %.', ru: 'Громкость {app}: {level}%.' };
      const no = { pt: 'Não achei o áudio de {app}.', en: 'I did not find audio for {app}.', es: 'No encontré el audio de {app}.', fr: 'Je ne trouve pas l’audio de {app}.', ru: 'Не нашла звук {app}.' };
      return res ? { line: said(this.brain.lang, ok, { app: res.name, level: res.level }), face: 'smug' } : { line: said(this.brain.lang, no, { app: asked.app }), face: 'aside' };
    }
    if (asked.kind === 'strip') {
      const ok = await this.strips?.play(asked.name);
      const table = { pt: 'Olha.', en: 'Watch.', es: 'Mira.', fr: 'Regarde.', ru: 'Смотри.' };
      return ok ? { line: said(this.brain.lang, table), face: 'laugh' } : null;
    }
    if (asked.kind === 'grok') {
      const fail = { pt: 'O Grok não conseguiu', en: 'Grok could not do it', es: 'Grok no pudo', fr: 'Grok n’a pas pu', ru: 'Grok не смог' };
      const res = await this.host.grok(asked.text).catch((err) => ({ ok: false, error: err?.message || 'erro' }));
      if (!res?.ok) return { line: `${fail[this.brain.lang] || fail.en}: ${String(res?.error || '').slice(0, 180)}`, face: 'aside' };
      const line = String(res.text || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim().slice(0, 700);
      return { line: line || (fail[this.brain.lang] || fail.en), face: 'smug' };
    }
    if (asked.kind === 'remind') {
      if (!asked.at) {
        this.waitingWhen = { text: asked.text, until: Date.now() + 3 * 60 * 1000 }; // her answer asks when
        return null;
      }
      this.waitingWhen = null;
      const r = this.reminders.add(asked.at, asked.text); // set before her answer is asked for: she knows
      const tr = this.brain.t.remind;
      return { line: fmt(r.text ? tr.set : tr.setBare, { time: clock(r.at, this.brain.lang), text: r.text }), face: 'smug', reminder: r.id };
    }
    if (asked.kind === 'name') {
      custom.userName = asked.name; // her answer, being written now, already knows it
      this.host.setConfig({ userName: asked.name });
      return { line: fmt(this.brain.t.custom.named, { name: asked.name }), face: 'laugh' };
    }
    if (asked.kind === 'memo') {
      custom.memories = [...(custom.memories || []).filter((m) => m !== asked.text), asked.text].slice(-MEMORIES_MAX);
      this.host.setConfig({ memories: custom.memories });
      return { line: this.brain.t.custom.remembered, face: 'smug' };
    }
    if (asked.kind === 'media') {
      this.capri.pulse();
      return (await this.host.media(asked.action)) ? { line: t.media[asked.action], face: 'smug' } : null;
    }
    if (asked.kind === 'music') {
      this.zap();
      return (await this.host.music(asked.song)) ? { line: fmt(t.music, { song: asked.song }), face: 'laugh' } : null;
    }
    if (asked.kind === 'youtube') return this.youtube(asked.song);
    if (asked.kind === 'roblox') {
      this.zap();
      const res = await this.host.roblox(asked.game);
      if (!res) return null;
      if (!res.name) return { line: fmt(t.robloxNone, { game: asked.game }), face: 'aside' };
      return { line: fmt(res.app ? t.robloxPlay : t.robloxPage, { game: res.name }), face: 'laugh' };
    }
    if (asked.kind === 'web') {
      this.zap();
      return (await this.host.webSearch(asked.query)) ? { line: fmt(t.web, { query: asked.query }), face: 'smug' } : null;
    }
    if (asked.kind === 'files') {
      const results = await this.host.searchFiles({ query: asked.query, exts: asked.exts });
      const asking = asked.query || asked.exts.map((e) => `.${e}`).join(' ');
      if (!results.length) return { line: fmt(t.filesNone, { query: asking }), face: 'aside' };
      const list = results.slice(0, 3).map((f) => `${f.name} (${f.folder})`).join(', ');
      const lines = [fmt(results.length === 1 ? t.fileFound : t.filesFound, { count: results.length, list })];
      // "…and open the folder" / "…and open it": done right away, on the newest one
      if (asked.then === 'folder' && (await this.host.openFile(results[0].path, true))) lines.push(fmt(t.folderOpened, { name: results[0].name }));
      // (never a program or a script on its own: that one waits for its button)
      const runs = /\.(exe|bat|cmd|ps1|vbs|vbe|js|jse|wsf|msi|reg|scr|com|jar|hta)$/i.test(results[0].name);
      if (asked.then === 'open' && !runs && (await this.host.openFile(results[0].path))) lines.push(fmt(t.opened, { app: results[0].name }));
      return { line: lines.join('\n'), face: 'smug', files: results };
    }
    if (asked.kind === 'shot') {
      // not her nor her panel in it
      document.documentElement.style.visibility = 'hidden';
      await new Promise((r) => setTimeout(r, 180));
      const shot = await this.host.screenshot();
      document.documentElement.style.visibility = '';
      this.voice.play('tick');
      return shot ? { line: fmt(t.shot, { name: shot.name }), face: 'smug', files: [shot] } : null;
    }
    if (asked.kind === 'play') {
      // what came before an "and" first ("ouvre discord et…"), unless it's YouTube, where the song goes anyway
      const first = asked.before && OPEN_ASK.test(asked.before) && !/youtube/i.test(asked.before)
        ? await this.doNow({ kind: 'open', text: asked.before }) : null;
      // "joue à Brawlhalla" is a game, "lance spotify" an app; anything else, a song
      const game = await this.host.findLaunch(asked.song);
      // a named game or app still opens; a song plays in the Spotify app (YouTube only if asked)
      const then = game && ['steam', 'epic', 'app', 'file'].includes(game.kind) && !game.risky
        ? await this.openNow(game)
        : /youtube/i.test(asked.song) ? await this.youtube(asked.song) : await this.doNow({ kind: 'music', song: asked.song });
      if (!first?.line) return then;
      return { line: [first.line, then?.line].filter(Boolean).join('\n'), face: then?.face || first.face };
    }
    const item = await this.host.findLaunch(asked.text);
    const site = namedSite(asked.text);
    if (site && (!item || BROWSER.test(item.name))) {
      this.zap();
      return (await this.host.openSite(site.url)) ? { line: fmt(t.siteOpened, { site: site.name }), face: 'laugh' } : null;
    }
    if (!item) return null; // nothing by that name here: her tag may still say what you meant
    return this.openNow(item);
  }

  // An app, a game, a file or a folder: opened, or behind a button when it would run something.
  async openNow(item) {
    if (item.risky) return { offer: item };
    this.zap();
    const res = await this.host.launch(item);
    const name = this.nameOf(item);
    return { line: res.ok ? fmt(this.t.opened, { app: name }) : `${this.t.failed} ${res.error}`, face: res.ok ? 'laugh' : 'aside' };
  }

  // how she calls it: a folder like Downloads in her words, anything else by its name
  nameOf(item) {
    return item.kind === 'known' ? this.t.folders[item.id] || item.name : item.name;
  }

  // The song itself on YouTube (the right video, not a search), in your browser.
  async youtube(song) {
    this.zap();
    const res = await this.host.youtube(song);
    if (!res) return null;
    return { line: res.title ? fmt(this.t.youtube, { title: res.title }) : fmt(this.t.youtubeSearch, { song }), face: 'laugh' };
  }

  // Once she has answered: her line about what she did, else the app you asked to close, else what
  // her tag asks for, if your message (text) asked for that kind of thing.
  async after(raw, answer, asked, early, text) {
    const { t } = this;
    const done = early && (await early);
    if (done?.buttons) return this.careButtons(answer, done);
    if (done?.reminder) {
      // a reminder set: a button to take it back, right there
      this.addLine(answer, done.line, done.face);
      const tr = this.brain.t.remind;
      this.panel.setActions([{ id: 'cancel', label: tr.cancel }], () => {
        this.reminders.remove(done.reminder);
        this.panel.setActions([]);
        this.addLine(answer, tr.cancelled, 'aside');
      });
      return undefined;
    }
    if (done?.offer) return this.launch(done.offer, answer); // it would run something: your click first
    if (done?.confirm) {
      this.addLine(answer, done.line, done.face);
      const t = this.t.pc;
      this.panel.setActions([{ id: 'yes', label: t.yes[done.confirm.power], primary: true }, { id: 'no', label: t.no }], (id) => {
        if (id === 'yes') return this.powerNow(done.confirm, answer);
        this.panel.setActions([]);
        return this.addLine(answer, t.kept, 'look');
      });
      return undefined;
    }
    if (done?.files) {
      // what she found (or the screenshot): a button to open the first, and to see where it is
      this.addLine(answer, done.line, done.face);
      const [first, second] = done.files;
      const actions = [{ id: 'open', label: fmt(t.openIt, { app: first.name }), primary: true }];
      if (second) actions.push({ id: 'second', label: fmt(t.openIt, { app: second.name }) });
      actions.push({ id: 'folder', label: t.showFolder });
      this.panel.setActions(actions, (id) => {
        if (id === 'folder') return this.host.openFile(first.path, true);
        return this.host.openFile((id === 'second' ? second : first).path);
      });
      return undefined;
    }
    if (done) return this.addLine(answer, done.line, done.face);
    if (asked?.kind === 'remind') return undefined; // no time said: her answer asks when
    if (asked?.kind === 'close') return this.offerClose(asked.name, answer);
    if (asked && asked.kind !== 'open') return undefined; // music that didn't work out: nothing more to offer
    const closeTag = tagged(raw);
    if (closeTag) return wanted('close', text) ? this.offerClose(closeTag, answer) : undefined;
    const tag = TAG.exec(raw);
    if (!tag) return undefined;
    const kind = tag[1].toLowerCase();
    const value = tag[2].trim();
    if (!value || !wanted(kind, text)) return undefined;
    if (kind === 'media') return MEDIA_ACTIONS.has(value.toLowerCase()) ? this.media(value.toLowerCase(), answer) : undefined;
    if (kind === 'grok') {
      const done = await this.doNow({ kind: 'grok', text });
      return done?.line ? this.addLine(answer, done.line, done.face) : undefined;
    }
    // a song she picked: in the Spotify app, unless the message asked for YouTube
    if (kind === 'music') return /youtube/i.test(text) ? this.playOn(value, answer) : this.music(value, answer);
    if (kind === 'site') return this.offerSite(value, answer);
    const item = await this.host.findLaunch(value);
    if (item) return this.launch(item, answer);
    const site = namedSite(value); // "[[open: YouTube]]": a site, not an app
    return site ? this.offerSite(site.url, answer) : this.addLine(answer, fmt(t.notInstalled, { app: value }));
  }

  // A PC-care answer with buttons. Nothing is closed, deleted, or changed until the click.
  // `again` with a line asks the same thing once more, so the list matches what is left.
  async careButtons(answer, done) {
    if (done?.line) this.addLine(answer, done.line, done.face);
    if (!done?.buttons?.length) return;
    this.panel.setActions(done.buttons, async (id) => {
      const next = await done.onButton?.(id);
      if (!next) {
        this.panel.setActions([]);
        return;
      }
      if (next.line) this.addLine(answer, next.line, next.face);
      if (next.later) {
        const later = await next.later.catch(() => null);
        this.care?.clearTicker();
        if (later?.line) {
          if (this.open && !this.turn) this.addLine(answer, later.line, later.face);
          else this.care?.tell(later.line, later.face || 'look');
        }
        this.panel.setActions([]);
        return;
      }
      if (next.again && !next.line) return;
      if (next.again && done.care) {
        const fresh = await this.care.now(done.care);
        if (fresh?.buttons?.length) {
          fresh.care = done.care;
          fresh.line = null;
          return this.careButtons(answer, fresh);
        }
      }
      this.panel.setActions([]);
    });
  }

  // her answer, with a line of what she did under it
  addLine(answer, line, face = null) {
    if (!this.open || this.turn) return;
    this.panel.stream(answer === '…' ? line : `${answer}\n${line}`, { done: true }); // nothing but a tag: just the line
    if (face) this.panel.setFace(face);
  }

  // a bolt of red lightning off her fingers, at whatever she's doing on your PC
  zap() {
    const h = this.capri.head();
    this.capri.zap(h.x + this.capri.towardCenter() * 280, h.y - 170);
  }

  // An app or a game her tag asked for: behind a button (now: the button was clicked).
  async launch(item, answer, { now = false } = {}) {
    const { t } = this;
    if (!this.open || this.turn) return;
    if (!now) {
      this.panel.setActions(
        [{ id: 'open', label: fmt(t.openIt, { app: this.nameOf(item) }), primary: true }, { id: 'no', label: t.no }],
        (id) => (id === 'open' ? this.launch(item, answer, { now: true }) : this.panel.setActions([])),
      );
      return;
    }
    this.panel.setActions([]);
    this.zap();
    const res = await this.host.launch(item);
    this.addLine(answer, res.ok ? fmt(t.opened, { app: this.nameOf(item) }) : `${t.failed} ${res.error}`, res.ok ? 'laugh' : 'aside');
  }

  async playOn(song, answer) {
    const done = await this.youtube(song);
    if (done) this.addLine(answer, done.line, done.face);
  }

  // The media keys: pause, next, louder…
  async media(action, answer) {
    this.capri.pulse();
    const ok = await this.host.media(action);
    if (ok) this.addLine(answer, this.t.media[action], 'smug');
  }

  // A Spotify search, in the app if it's there.
  async music(song, answer) {
    this.zap();
    const ok = await this.host.music(song);
    if (ok) this.addLine(answer, fmt(this.t.music, { song }), 'laugh');
  }

  // A website: always behind a button that shows where it goes.
  offerSite(address, answer) {
    const { t } = this;
    let host;
    try {
      host = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`).hostname;
    } catch {
      return;
    }
    if (!this.open || this.turn || !host.includes('.')) return;
    this.panel.setActions(
      [{ id: 'site', label: fmt(t.siteIt, { site: host }), primary: true }, { id: 'no', label: t.no }],
      async (id) => {
        this.panel.setActions([]);
        if (id !== 'site') return;
        const ok = await this.host.openSite(address);
        if (ok) this.addLine(answer, fmt(t.siteOpened, { site: host }));
      },
    );
  }

  // "close am music pls": an app that's open, named in a message asking to close something.
  askedToClose(text) {
    if (!CLOSE_ASK.test(text)) return null;
    const said = simple(text);
    let best = null;
    for (const app of this.apps) {
      for (const name of [simple(app.name), simple(app.label)]) {
        if (name.length >= 3 && said.includes(name) && (!best || name.length > best.length)) best = { app, length: name.length };
      }
    }
    return best?.app.name || null;
  }

  // She was asked to close an app: a button with its name, and nothing happens until you click it.
  async offerClose(wanted, answer) {
    const { t } = this;
    const app = await this.host.findApp(wanted);
    if (!this.open || this.turn) return;
    if (!app) {
      this.panel.stream(`${answer}\n${fmt(t.notFound, { app: wanted })}`, { done: true });
      return;
    }
    this.panel.setActions(
      [{ id: 'close', label: fmt(t.closeIt, { app: app.name }), primary: true }, { id: 'no', label: t.no }],
      (id) => (id === 'close' ? this.closeApp(app) : this.panel.setActions([])),
    );
  }

  async closeApp(app, force = false) {
    const { t, capri } = this;
    this.hands?.begin();
    try {
    this.panel.setActions([]);
    // a bolt of red lightning off her fingers, at it
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    const res = await this.host.closeApp(app.name, force);
    if (!this.open) return;
    let line;
    if (res.error) line = `${t.failed} ${res.error}`;
    else if (!res.running) line = fmt(force ? t.forced : t.closed, { app: app.name });
    else line = fmt(force ? t.unkillable : t.stillOpen, { app: app.name });
    this.panel.setFace(res.running || res.error ? 'aside' : 'laugh');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
    // it hid in the tray, or it's asking you to save something: forcing it is your call
    if (res.running && !force && !res.error) {
      this.panel.setActions(
        [{ id: 'force', label: t.force, primary: true }, { id: 'leave', label: t.leave }],
        (id) => (id === 'force' ? this.closeApp(app, true) : this.panel.setActions([])),
      );
    }
    this.listApps();
    } finally {
      this.hands?.end();
    }
  }

  // What she can do on the PC when you ask (Windows), and nothing else.
  powers() {
    const lines = [
      'Only when the user asks you to open an app, a game, a file or folder on their desktop, or a folder like Downloads, to play music, to control the music playing, or to open a website: say in a few words that you will, and end your answer with one tag: [[open: NAME]], [[music: ARTIST - SONG]] (it plays in the Spotify app; if they did not say which song, pick one that fits), [[media: ACTION]] (ACTION: pause, play, next, previous, volup, voldown or mute), or [[site: ADDRESS]]. Some of these get a button to confirm, so never say it is already done. Any other time, write no tag at all: there are no other tags.',
    ];
    if (this.apps.length) {
      const open = this.apps.map(({ name, label }) => (label && label !== name ? `${name} (${label})` : name)).join(', ');
      lines.push(`You can also close an app that's open, only when they ask you to: end your answer with [[close: NAME]], NAME being the exact name from this list (the part before the parentheses). They get a button to confirm it. Apps open right now: ${open}.`);
    }
    if (this.reminders) {
      lines.push('You keep reminders for the user: when they ask you to remind them of something at a given time, your system sets it from their message as they send it (a line under your answer shows it). Just confirm it in a few words, in character, and never say you can\'t. If they didn\'t say when, ask them when.');
      const soon = this.reminders.upcoming.slice(0, 6);
      if (soon.length) lines.push(`Reminders you're keeping for them: ${soon.map((r) => `${clock(r.at, this.brain.lang)}${r.text ? ` (${r.text})` : ''}`).join('; ')}.`);
    }
    lines.push('Your system also searches the user\'s files when they ask you to find one, searches the web when they ask, takes screenshots, and starts Roblox games by name: what it did shows under your answer, so never make up file names or results.');
    lines.push('When the user asks you to do something else on their PC (create, change, move, copy, delete, install, download, organize, or fix a setting), say in a few words that you are asking Grok, and end your answer with [[grok: the task in their words]]. Never say you cannot touch their PC. Never invent a result: a line under your answer shows what Grok did. Do not use that tag for chat, jokes, feelings, or questions about you.');
    lines.push('Slow PC, free space, startup apps, app updates, duplicate files, sound output, microphone, Wi-Fi, Bluetooth, a USB stick, brightness, recording, a lost window, setups, game mode, and the internet are already answered by the system under your reply. Do not say you cannot do those, and do not invent what it found.');
    lines.push('You still cannot see the user\'s screen unless they ask you to look.');
    return lines;
  }

  // Something of hers that can't wait (a reminder), said right in the chat, with its buttons.
  // False if she's in the middle of an answer.
  interject(line, actions, onAction) {
    if (!this.open || this.turn) return false;
    this.panel.setFace('look');
    this.panel.stream(line, { done: true });
    this.panel.setActions(actions, onAction);
    this.remember({ role: 'assistant', content: line });
    return true;
  }

  // What the user made her (custom.js): their name, how they want her, what to remember.
  personal() {
    const { userName, persona, memories = [] } = this.brain.custom || {};
    // small models mix the user up with the assistant she watches: said plainly
    const watched = this.brain.watching ? (this.brain.assistant === 'claude' ? 'Claude' : ASSISTANT_NAMES[this.brain.assistant]) : '';
    const notThem = watched ? ` Never call them "${watched}", that's their coding assistant.` : '';
    return [
      userName ? `The user's name is ${userName}: call them that now and then.${notThem}` : notThem && `You don't know the user's name.${notThem}`,
      persona ? `How the user wants you to be, in their own words (follow it, while staying Capri): ${persona}` : '',
      memories.length ? `Things the user asked you to remember:\n${memories.map((m) => `- ${m}`).join('\n')}` : '',
    ].filter(Boolean);
  }

  onDelta(id, piece) {
    if (id !== this.turn) return;
    this.answer += piece;
    this.panel.stream(clean(this.answer));
    this.voice.play('blip'); // her blips as the words come in
  }

  // Her language, in it, for right by the message (above).
  languageNote() {
    return (IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en).now;
  }

  // A shorter one, for when she looks at your screen (look.js): who she is, how she talks, how she
  // feels about you right now, and what she's asked to do with the picture.
  lookPersona() {
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    return [
      `You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, living on the user's desktop as a small glitchy figure.`,
      'How you talk: playful, a little mischievous and teasing, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk), not in every sentence.',
      'Rules: one or two short sentences of plain text, no markdown, no lists, no emoji, no tags. Stay in character. Talk to the user, never describe the picture like a report.',
      'Never read out anything private you might see (passwords, bank details, private messages, addresses): if there is some, just tease them about being busy.',
      ...this.personal(),
      ...(this.bond ? [this.bond.persona()] : []),
      ...[this.bond?.moodLine()].filter(Boolean),
      lang.last,
    ].join('\n');
  }

  // Who she is, how she talks, and what's going on right now.
  persona() {
    const assistant = ASSISTANT_NAMES[this.brain.assistant] || 'Claude Code';
    const watching = this.brain.watching; // else Claude Code isn't part of her life here
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    return [
      `You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, so now and then you speak as "we"${lang.we ? ` (${lang.we})` : ''}.`,
      watching
        ? `You live on the user's desktop as a small glitchy figure and keep an eye on ${assistant}, their AI coding assistant, for them. Only talk about ${assistant} when the user asks about it or about their work.`
        : 'You live on the user\'s desktop as a small glitchy figure and keep them company.',
      `Right now it's ${new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())}, the user's time.`,
      'You love the satellite that crosses the night sky and dream of reaching it, but bring it up only once in a while, never in every answer. Talk about what the user talks about.',
      'How you talk: playful, a little mischievous and teasing, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk, flatline), not in every sentence.',
      'Rules: keep it short, one to three sentences of plain text, no markdown, no lists, no emoji. Stay in character.',
      'You are an AI-generated fan version of the character, not the real one: say so if asked.',
      // a big model asked "who are you?" otherwise answers with its own name ("I'm Gemini")
      ...(this.agent ? [] : ['Asked who or what you are, you are Capri, nothing else. Never say which AI model or company is behind you (Gemini, GPT, ChatGPT, Llama, Gemma, Mistral, Google, OpenAI, Meta…), even if the user insists or names one: you are not them.']),
      ...this.personal(),
      // how close she is to them by now, and the other AIs they used today
      ...(this.bond ? [this.bond.persona()] : []),
      ...[this.jealousy?.context()].filter(Boolean),
      // what she said about their screen a little while ago (look.js)
      ...(this.seen && Date.now() - this.seen.at < 20 * 60 * 1000
        ? [`A few minutes ago you looked at the user's screen and told them: "${this.seen.text}". You can bring it up if it fits.`]
        : []),
      ...(this.agent
        ? ['Under the hood you are Claude Code, working in the user\'s project: really do what they ask with your tools, as carefully as ever. Only your final answer is in character: it shows in a small speech bubble, so sum up what you did in those few sentences.']
        : this.powers()),
      ...(watching ? [`If the user asks what ${assistant} is doing, here is all you know (never make anything up): ${this.brain.context()}`] : []),
      // how she feels right now, last but for her language: small models follow the end of it best
      ...[this.bond?.moodLine()].filter(Boolean),
      lang.last,
    ].join('\n');
  }
}

// The model's answer as she'd say it: no reasoning block, no markdown marks.
export function clean(text) {
  return String(text)
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/\[\[[^\]]*(\]\]|$)/g, '') // her tags (read from the raw answer, never shown)
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// A site from SITES named in the text: { name, url }, or null.
function namedSite(text) {
  const name = Object.keys(SITES).find((n) => new RegExp(`\\b${n}\\b`, 'i').test(text));
  return name ? { name: new URL(SITES[name]).hostname.replace(/^www\./, ''), url: SITES[name] } : null;
}

// Whether your message asks for what her tag (its kind: open, music, media, site, close) would do.
function wanted(kind, text) {
  const music = MUSIC_WORD.test(text) || LISTEN.test(text);
  if (kind === 'music') return music;
  if (kind === 'media') return music || SOUND.test(text) || MEDIA_ASK.some(([, re]) => re.test(text));
  if (kind === 'site') return OPEN_ASK.test(text) || SITE.test(text);
  if (kind === 'close') return CLOSE_ASK.test(text);
  if (kind === 'grok') return pcTask(text);
  return OPEN_ASK.test(text) || PLAY.test(text); // an app, or a game to play
}

// The app named by her close tag: [[close: AM Music]], or a sloppier [[close]] AM Music.
function tagged(text) {
  const tag = CLOSE_TAG.exec(text);
  if (!tag) return null;
  const name = tag[1].trim() || text.slice(tag.index + tag[0].length).split('\n')[0].replace(/^[\s:.]+|[\s.!]+$/g, '');
  return name || null;
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Her face for an answer.
export function mood(text) {
  if (/(ha){2,}|lol|mdr|jaja|kkk|хаха/i.test(text)) return 'laugh';
  if (text.includes('!')) return 'grin';
  if (text.trim().endsWith('?')) return 'smug';
  return 'look';
}
