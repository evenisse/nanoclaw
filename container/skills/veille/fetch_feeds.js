#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));

function loadSources() {
  const lines = readFileSync(`${DIR}/sources.yml`, 'utf8').split('\n');
  const sources = [];
  let cur = null;
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s === 'sources:') continue;
    if (s.startsWith('- name:')) {
      if (cur) sources.push(cur);
      cur = { name: s.slice(7).trim() };
    } else if (cur) {
      const colon = s.indexOf(':');
      if (colon !== -1) {
        const key = s.slice(0, colon).trim();
        const val = s.slice(colon + 1).split('#')[0].trim();
        cur[key] = val;
      }
    }
  }
  if (cur) sources.push(cur);
  return sources;
}

const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

function stripHtml(text) {
  if (!text) return '';
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&[a-z#0-9]+;/gi, m => HTML_ENTITIES[m] ?? m);
  return text.replace(/\s+/g, ' ').trim().slice(0, 150);
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.trim());
  return isNaN(d) ? null : d;
}

function getTagText(xml, tag) {
  const m = xml.match(new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`, 'i'
  ));
  if (!m) return '';
  return m[1] !== undefined ? m[1] : (m[2] ?? '');
}

function getAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function splitTags(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[0]);
  return out;
}

function parseRss(xml, source, cutoff) {
  return splitTags(xml, 'item').flatMap(item => {
    const title = stripHtml(getTagText(item, 'title')).trim();
    const link = getTagText(item, 'link').trim() || getAttr(item, 'link', 'href');
    const date = parseDate(getTagText(item, 'pubDate'));
    if (!date || date < cutoff) return [];
    const rawDesc = stripHtml(getTagText(item, 'description'));
    const desc = rawDesc.startsWith('Comments') || rawDesc.startsWith('http') ? '' : rawDesc;
    const cats = [...item.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)];
    const category = cats.length ? stripHtml(cats[0][1]) : 'N/A';
    return [{ date, title, link, category, description: desc, source: source.name }];
  });
}

function parseAtom(xml, source, cutoff) {
  return splitTags(xml, 'entry').flatMap(entry => {
    const title = stripHtml(getTagText(entry, 'title')).trim();
    const link = getAttr(entry, 'link', 'href');
    const dateStr = getTagText(entry, 'updated') || getTagText(entry, 'published');
    const date = parseDate(dateStr);
    if (!date || date < cutoff) return [];
    const rawContent = getTagText(entry, 'summary') || getTagText(entry, 'content');
    const desc = stripHtml(rawContent.slice(0, 2000));
    const catM = entry.match(/<category[^>]*\sterm="([^"]*)"/i);
    const category = catM ? catM[1] : 'N/A';
    return [{ date, title, link, category, description: desc, source: source.name }];
  });
}

async function fetchFeed(source, cutoff) {
  try {
    const resp = await fetch(source.url, {
      headers: { 'User-Agent': 'veille-techno/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    const articles = /<item[\s>]/.test(xml)
      ? parseRss(xml, source, cutoff)
      : parseAtom(xml, source, cutoff);
    return { articles, error: null };
  } catch (e) {
    return { articles: [], error: `ERROR: ${source.name} - ${e.message}` };
  }
}

const days = parseInt(process.argv[2] ?? '7', 10);
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - days);
cutoff.setHours(0, 0, 0, 0);

const catIdx = process.argv.indexOf('--category');
const categoryFilter = catIdx !== -1 ? process.argv[catIdx + 1]?.toLowerCase() : null;

const sources = loadSources();
const activeSources = categoryFilter
  ? sources.filter(s =>
      (s.categories ?? '').split(',').map(c => c.trim().toLowerCase()).includes(categoryFilter)
    )
  : sources;

const results = await Promise.all(activeSources.map(s => fetchFeed(s, cutoff)));

const seen = new Map();
const errors = [];
for (const { articles, error } of results) {
  if (error) errors.push(error);
  for (const a of articles) {
    if (seen.has(a.link)) {
      const ex = seen.get(a.link);
      if (!ex.source.includes(a.source)) ex.source += `, ${a.source}`;
    } else {
      seen.set(a.link, a);
    }
  }
}

const unique = [...seen.values()].sort((a, b) => b.date - a.date);

for (const err of errors) process.stderr.write(err + '\n');

const clean = s => (s || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
for (const a of unique) {
  console.log([
    a.date.toISOString().slice(0, 10),
    clean(a.title),
    a.link,
    clean(a.category),
    clean(a.description || 'N/A'),
    clean(a.source),
  ].join('\t'));
}

console.log('SOURCES:');
for (const s of activeSources) {
  console.log(`  ${s.name}\t${s.site ?? s.url}\t${s.description ?? ''}`);
}
