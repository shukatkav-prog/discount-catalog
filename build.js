// build.js — читає data/*.json (результат scrape.js), групує схожі товари з різних
// магазинів для порівняння цін і збирає catalog.html з РЕАЛЬНИМИ локальними фото.
// Запуск: node build.js

const fs = require("fs");
const path = require("path");
const { CATEGORIES, EXCLUDE_KEYWORDS, SOURCES } = require("./config");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const TODAY = new Date().toISOString().slice(0, 10);

function loadStore(key) {
  const p = path.join(DATA_DIR, `${key}.json`);
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  const label = SOURCES[key]?.label || key;
  return raw.map(r => ({ ...r, store: label }));
}

const allItems = Object.keys(SOURCES).flatMap(loadStore);
console.log(`Завантажено ${allItems.length} сирих позицій з ${Object.keys(SOURCES).length} магазинів`);

// Ключові слова завжди мають починатись на межі слова — інакше "вівс" ловить
// "льВІВСЬке", а "бри " (з пробілом на кінці — так задумано під ЦІЛЕ слово)
// ловить "мікроФІБРИ". Тому ЗАВЖДИ перевіряємо, що символ перед збігом — не
// буква. Кінець слова перевіряємо лише коли ключове слово написане з пробілом
// на кінці (це свідомий сигнал "ціле слово, не основа") — інші ключові слова
// свідомо задумані як основа для збігу з відмінками ("яйц" -> "яйця", "яйце").
function isLetter(ch) {
  return /[a-zа-яіїєґ0-9]/i.test(ch);
}
function hasKeyword(text, kw) {
  const enforceRight = kw.endsWith(" ");
  const needle = enforceRight ? kw.slice(0, -1) : kw;
  let from = 0;
  while (true) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) return false;
    const before = idx > 0 ? text[idx - 1] : "";
    if (isLetter(before)) {
      from = idx + 1;
      continue;
    }
    if (enforceRight) {
      const afterIdx = idx + needle.length;
      const after = afterIdx < text.length ? text[afterIdx] : "";
      if (isLetter(after)) {
        from = idx + 1;
        continue;
      }
    }
    return true;
  }
}
function isExcluded(name) {
  const low = name.toLowerCase();
  // "напій ... алкогольний на основі рому/віскі" тощо — офіційне маркування
  // міцного алкоголю в Україні; ловимо це загальним правилом, а не лише
  // списком назв спиртного, щоб не пропустити те, чого немає в EXCLUDE_KEYWORDS.
  if (low.includes("алкогольн") && !low.includes("безалкогольн")) return true;
  return EXCLUDE_KEYWORDS.some(k => hasKeyword(low, k));
}
function categoryFor(name) {
  const low = name.toLowerCase();
  for (const cat of CATEGORIES) {
    if (!cat.keywords.some(k => hasKeyword(low, k))) continue;
    if (cat.excludeKeywords && cat.excludeKeywords.some(k => hasKeyword(low, k))) continue;
    return cat.id;
  }
  return null;
}
function pct(oldP, newP) {
  if (!oldP || !newP || oldP <= newP) return null;
  return Math.round((1 - newP / oldP) * 100);
}
function words(name) {
  return name
    .toLowerCase()
    .replace(/\d+([.,]\d+)?\s*(г|кг|мл|л|шт|уп|%)\b/gi, " ")
    .replace(/[«»"'().,%]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}
function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union ? inter / union : 0;
}

// ---- фільтрація + категоризація ----
const byCategory = {};
for (const cat of CATEGORIES) byCategory[cat.id] = [];

for (const item of allItems) {
  if (!item.name || isExcluded(item.name)) continue;
  const catId = categoryFor(item.name);
  if (!catId) continue;
  const p = pct(item.oldPrice, item.newPrice);
  byCategory[catId].push({
    name: item.name,
    store: item.store,
    oldPrice: item.oldPrice,
    newPrice: item.newPrice,
    pct: p,
    image: item.localImage || null,
    words: words(item.name),
  });
}

// ---- групування схожих товарів різних магазинів у межах категорії ----
function groupCategory(items) {
  const groups = [];
  for (const it of items) {
    let placed = false;
    for (const g of groups) {
      if (jaccard(it.words, g.repWords) >= 0.4) {
        g.entries.push(it);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push({ repWords: it.words, repName: it.name, entries: [it] });
  }
  // у межах групи лишаємо по одному найдешевшому запису на магазин
  for (const g of groups) {
    const byStore = {};
    for (const e of g.entries) {
      if (!byStore[e.store] || (e.newPrice ?? Infinity) < (byStore[e.store].newPrice ?? Infinity)) {
        byStore[e.store] = e;
      }
    }
    g.entries = Object.values(byStore);
    g.maxPct = Math.max(0, ...g.entries.map(e => e.pct || 0));
    g.cheapestStore = g.entries.reduce((best, e) =>
      (e.newPrice ?? Infinity) < (best?.newPrice ?? Infinity) ? e : best, null)?.store || null;
    g.image = g.entries.find(e => e.image)?.image || null;
    g.displayName = g.entries.sort((a,b)=>b.name.length-a.name.length)[0].name;
  }
  groups.sort((a, b) => b.maxPct - a.maxPct);
  return groups;
}

const grouped = {};
for (const cat of CATEGORIES) grouped[cat.id] = groupCategory(byCategory[cat.id]);

// ---------------- HTML ----------------
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function money(v) { return v == null ? "—" : `${v} ₴`; }

function renderEntry(e, cheapestStore) {
  const isCheap = e.store === cheapestStore && cheapestStore;
  const pctHtml = e.pct != null ? `<span class="pct">-${e.pct}%</span>` : "";
  const oldHtml = e.oldPrice ? `<span class="old">${money(e.oldPrice)}</span>` : "";
  const star = isCheap ? ` <span class="star">★ найдешевше</span>` : "";
  return `<div class="entry ${isCheap ? "cheapest" : ""}">
    <div class="store-row"><span class="store">${esc(e.store)}${star}</span>${pctHtml}</div>
    <div class="price-row">${oldHtml}<span class="new">${money(e.newPrice)}</span></div>
  </div>`;
}

function renderGroup(g, catIcon) {
  const multi = new Set(g.entries.map(e => e.store)).size > 1;
  const badge = multi ? `<span class="cmp-badge">порівняно в ${new Set(g.entries.map(e=>e.store)).size} мережах</span>` : "";
  const fire = g.maxPct >= 40 ? "🔥 " : "";
  const thumb = g.image
    ? `<div class="thumb"><img src="${esc(g.image)}" loading="lazy" alt=""></div>`
    : `<div class="thumb thumb-fallback"><span>${catIcon}</span></div>`;
  const entriesHtml = g.entries
    .sort((a, b) => (a.newPrice ?? 1e9) - (b.newPrice ?? 1e9))
    .map(e => renderEntry(e, g.cheapestStore)).join("\n");
  return `<div class="card">
    ${thumb}
    <div class="card-body">
      <div class="card-name">${fire}${esc(g.displayName)}</div>
      ${badge}
      <div class="entries">${entriesHtml}</div>
    </div>
  </div>`;
}

const CAT_ICON = {
  cheese:"🧀", oils:"🫒", sausage:"🥓", fish:"🦐", poultry:"🍗", vegan:"🌱",
  dairy:"🥛", eggs:"🥚", bread:"🥖", salads:"🥗", produce:"🍊", snacks:"🍟",
  sweets:"🍬", icecream:"🍦", drinks:"🥤", nabeer:"🍺", sauces:"🥫", pasta:"🍝",
  frozen:"❄️", tea:"🍵",
};

const sections = CATEGORIES.map((cat, i) => {
  const groups = grouped[cat.id];
  if (!groups.length) {
    return `<section class="category" id="${cat.id}">
      <h2><span class="cat-icon">${CAT_ICON[cat.id]}</span>${i+1}. ${esc(cat.title)} <span class="count">0</span></h2>
      <div class="cat-note">ℹ️ Нічого не знайдено в цьому запуску — або скрапер не отримав даних з відповідних сторінок (перевір debug/), або цього тижня знижок у категорії справді нема.</div>
    </section>`;
  }
  const cardsHtml = groups.map(g => renderGroup(g, CAT_ICON[cat.id])).join("\n");
  return `<section class="category" id="${cat.id}">
    <h2><span class="cat-icon">${CAT_ICON[cat.id]}</span>${i+1}. ${esc(cat.title)} <span class="count">${groups.length}</span></h2>
    <div class="grid">${cardsHtml}</div>
  </section>`;
}).join("\n");

const navHtml = CATEGORIES.map(cat => `<a href="#${cat.id}">${CAT_ICON[cat.id]} ${esc(cat.title.split(" (")[0])}</a>`).join("\n");
const totalGroups = Object.values(grouped).reduce((s, g) => s + g.length, 0);
const withPhotos = Object.values(grouped).reduce((s, g) => s + g.filter(x => x.image).length, 0);

const html = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Каталог знижок тижня — ${TODAY}</title>
<style>
  :root { --bg:#f5f1ea; --card-bg:#fff; --ink:#2b2622; --ink-soft:#6b6259; --accent:#c1502e; --accent2:#2f6e5c; --gold:#d4a13d; --border:#e6ddd0; --cheap-bg:#eaf5ee; --cheap-border:#2f6e5c; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { scroll-behavior: smooth; }
  body { margin:0; font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; background:var(--bg); color:var(--ink); line-height:1.4; }
  header { background:linear-gradient(135deg,#2b2622,#40372d); color:#f5f1ea; padding:22px 16px 16px; text-align:center; }
  header h1 { margin:0 0 6px; font-size:22px; }
  header p { margin:4px 0; color:#d8cdbd; font-size:13px; }
  nav { position:sticky; top:0; z-index:10; background:#fffaf2; border-bottom:1px solid var(--border); padding:8px 10px; display:flex; flex-wrap:nowrap; gap:6px; overflow-x:auto; -webkit-overflow-scrolling:touch; white-space:nowrap; }
  nav a { flex:0 0 auto; font-size:12px; color:var(--ink); text-decoration:none; background:var(--card-bg); border:1px solid var(--border); border-radius:20px; padding:6px 12px; }
  nav a:hover { background:var(--gold); color:#fff; }
  .category { max-width:1180px; margin:0 auto; padding:22px 14px 4px; }
  .category h2 { font-size:18px; display:flex; align-items:center; gap:8px; border-bottom:2px solid var(--gold); padding-bottom:8px; margin-bottom:6px; }
  .count { margin-left:auto; font-size:12px; font-weight:400; color:var(--ink-soft); background:var(--bg); border-radius:10px; padding:2px 9px; }
  .cat-note { font-size:12px; color:var(--ink-soft); background:#fff6e6; border:1px dashed var(--gold); border-radius:8px; padding:8px 12px; margin:8px 0 14px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; }
  .card { background:var(--card-bg); border:1px solid var(--border); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 1px 3px rgba(0,0,0,.04); }
  .thumb { height:120px; display:flex; align-items:center; justify-content:center; background:#fff; border-bottom:1px solid var(--border); overflow:hidden; }
  .thumb img { width:100%; height:100%; object-fit:contain; }
  .thumb-fallback { font-size:34px; background:radial-gradient(circle at 30% 30%,#fff6e6,var(--bg) 75%); }
  .card-body { padding:10px 12px 12px; }
  .card-name { font-size:13px; font-weight:600; margin-bottom:4px; }
  .cmp-badge { display:inline-block; font-size:9.5px; color:var(--accent2); background:var(--cheap-bg); border-radius:8px; padding:1px 7px; margin-bottom:6px; }
  .entries { display:flex; flex-direction:column; gap:6px; margin-top:6px; }
  .entry { border:1px solid var(--border); border-radius:8px; padding:6px 9px; background:#fbf9f5; }
  .entry.cheapest { background:var(--cheap-bg); border-color:var(--cheap-border); }
  .store-row { display:flex; justify-content:space-between; align-items:center; }
  .store { font-size:11px; font-weight:700; }
  .star { color:var(--accent2); font-size:9.5px; font-weight:700; }
  .pct { font-size:10.5px; font-weight:700; color:#fff; background:var(--accent); border-radius:6px; padding:1px 6px; }
  .price-row { margin-top:3px; display:flex; align-items:baseline; gap:7px; }
  .old { font-size:11.5px; color:#a39a8d; text-decoration:line-through; }
  .new { font-size:15px; font-weight:800; color:var(--accent2); }
  footer { text-align:center; padding:26px 20px 46px; font-size:11px; color:var(--ink-soft); }
</style>
</head>
<body>
<header>
  <h1>🛒 Каталог знижок тижня</h1>
  <p>Сільпо · Novus · Фора · АТБ · станом на ${TODAY} · ${totalGroups} товарних груп, фото знайдено для ${withPhotos}</p>
</header>
<nav>${navHtml}</nav>
${sections}
<footer>
  Згенеровано локально скриптом discount-catalog-scraper (scrape.js + build.js) — реальні фото
  качаються з сайтів магазинів напряму на цьому комп'ютері. Групування однакових товарів між
  магазинами — евристичне (за схожістю назв), тому час від часу звір руками.
</footer>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, "catalog.html"), html, "utf-8");
console.log(`\nГотово: catalog.html (${totalGroups} товарних груп, фото для ${withPhotos})`);
console.log(`Відкрий файл ${path.join(ROOT, "catalog.html")} у браузері.`);
