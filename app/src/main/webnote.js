'use strict';

// Short public notes for the local model. The model never browses and never gets a shell.
// HTTPS only. A miss, a timeout, or a bad page just means she answers without them.

async function grab(url, signal) {
  if (!url.startsWith('https://')) throw new Error('https');
  const res = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: { accept: 'application/json', 'user-agent': 'Capri/0.5 (local desktop)' },
  });
  if (!String(res.url || '').startsWith('https://')) throw new Error('redirect');
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function textsFromDuck(data) {
  const out = [];
  const abs = String(data?.AbstractText || data?.Answer || '').replace(/<[^>]+>/g, ' ').trim();
  if (abs) out.push(abs);
  const walk = (items) => {
    for (const item of items || []) {
      if (item?.Topics) walk(item.Topics);
      const text = String(item?.Text || '').replace(/<[^>]+>/g, ' ').trim();
      if (text) out.push(text);
      if (out.length >= 4) return;
    }
  };
  walk(data?.RelatedTopics);
  return out;
}

async function webNote(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (q.length < 2) return '';
  const signal = AbortSignal.timeout(5000);
  const bits = [];
  try {
    const data = await grab(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&kl=br-pt`,
      signal,
    );
    bits.push(...textsFromDuck(data));
  } catch {
    // Wikipedia can still have a page.
  }
  if (bits.join(' ').length < 240) {
    try {
      const found = await grab(
        `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&utf8=1&srlimit=1`,
        signal,
      );
      const title = found?.query?.search?.[0]?.title;
      if (title) {
        const page = await grab(
          `https://pt.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&utf8=1`,
          signal,
        );
        const extract = String(Object.values(page?.query?.pages || {})[0]?.extract || '').trim();
        if (extract) bits.push(extract);
      }
    } catch {
      // No note. She still answers.
    }
  }
  return bits.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

module.exports = { webNote };
