// build.js — читає data/*.json (результат scrape.js), групує схожі товари з різних
// магазинів для порівняння цін і збирає catalog.html з РЕАЛЬНИМИ локальними фото.
// Запуск: node build.js

const fs = require("fs");
const path = require("path");
const { CATEGORIES, EXTRA_CATEGORIES, EXCLUDE_KEYWORDS, SOURCES } = require("./config");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const TODAY = new Date().toISOString().slice(0, 10);

// маленькі іконки магазинів (assets/) — вбудовуємо як base64, щоб не тягнути
// окремі файли й не залежати від живих сайтів у самому HTML.
const STORE_ICON_FILES = {
  "Сільпо": "icon-silpo-32.png",
  "АТБ": "icon-atb-32.png",
  "Novus": "icon-novus-32.png",
  "Фора": "icon-fora-32.png",
};
const STORE_ICON = {};
for (const [label, file] of Object.entries(STORE_ICON_FILES)) {
  const p = path.join(ROOT, "assets", file);
  if (fs.existsSync(p)) {
    STORE_ICON[label] = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  }
}

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
// cat.keywords — звичайний OR-збіг (будь-яке слово підходить).
// cat.keywordGroups — список AND-груп: товар підходить, якщо містить УСІ слова
// хоч однієї групи. Потрібно для випадків типу "безалкогольне пиво", де в
// реальній назві товару ці два слова майже ніколи не стоять поруч (напр.
// "Пиво Bitburger Drive світле безалкогольне") — проста підрядкова фраза
// "безалкогольне пиво" такого не зловить.
function matchesCategory(low, cat) {
  if (cat.keywords && cat.keywords.some(k => hasKeyword(low, k))) return true;
  if (cat.keywordGroups && cat.keywordGroups.some(group => group.every(k => hasKeyword(low, k)))) return true;
  return false;
}
function categoryForList(name, categories) {
  const low = name.toLowerCase();
  for (const cat of categories) {
    if (!matchesCategory(low, cat)) continue;
    if (cat.excludeKeywords && cat.excludeKeywords.some(k => hasKeyword(low, k))) continue;
    return cat.id;
  }
  return null;
}
function categoryFor(name) {
  return categoryForList(name, CATEGORIES);
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
const byExtraCategory = {};
for (const cat of EXTRA_CATEGORIES) byExtraCategory[cat.id] = [];

// товари, що пройшли фільтр виключень, але не підійшли під жодну з 20 основних
// категорій, перевіряємо ще й проти EXTRA_CATEGORIES (вино, пиво/сидр, одяг,
// побутова хімія — реальні великі кластери, які інакше губились би мовчки).
// Що не підійшло взагалі нікуди (декор, іграшки, канцтовари, батарейки тощо) —
// саме це і викидаємо, а не всю решту одним смітником "Інше".
const CATEGORY_IDS = new Set(CATEGORIES.map(c => c.id));
let unmatchedCount = 0;
let sourceOverrideCount = 0;
for (const item of allItems) {
  if (!item.name || isExcluded(item.name)) continue;
  const entry = {
    name: item.name,
    store: item.store,
    oldPrice: item.oldPrice,
    newPrice: item.newPrice,
    pct: pct(item.oldPrice, item.newPrice),
    image: item.localImage || null,
    words: words(item.name),
  };
  // Якщо товар зішкрябано зі сторінки, яка на сайті МАГАЗИНУ й так є однією
  // конкретною категорією (напр. "Чипси"), довіряємо цьому більше, ніж
  // власному пошуку за ключовими словами в назві — інакше "Чипси зі смаком
  // курки" потрапляють у "Птицю" тільки тому, що в назві є слово "курка".
  // sourceCategory виставляється тільки для сторінок з config.js, де category
  // сайту однозначна (не для змішаних сторінок знижок/акцій).
  if (item.sourceCategory && CATEGORY_IDS.has(item.sourceCategory)) {
    const keywordCatId = categoryFor(item.name);
    if (keywordCatId !== item.sourceCategory) sourceOverrideCount++;
    byCategory[item.sourceCategory].push(entry);
    continue;
  }
  const catId = categoryFor(item.name);
  if (catId) {
    byCategory[catId].push(entry);
    continue;
  }
  const extraId = categoryForList(item.name, EXTRA_CATEGORIES);
  if (extraId) {
    byExtraCategory[extraId].push(entry);
    continue;
  }
  unmatchedCount++;
}
console.log(`Категорія підтверджена/виправлена за сторінкою магазину (а не лише ключовими словами): ${sourceOverrideCount} товарів переставлено`);
console.log(`Не підійшло під жодну категорію (основну чи додаткову) — у каталог не йде: ${unmatchedCount}`);

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
const extraGrouped = {};
for (const cat of EXTRA_CATEGORIES) extraGrouped[cat.id] = groupCategory(byExtraCategory[cat.id]);

// ---------------- HTML ----------------
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function money(v) { return v == null ? "—" : `${v} ₴`; }

function renderEntry(e, cheapestStore, multi, groupName, groupImage) {
  // "найдешевше" має сенс лише якщо є з чим порівнювати — якщо товар знайдено
  // лише в одному магазині, зелену рамку не показуємо (порівняння не відбулось).
  // Саму рамку/фон достатньо, щоб позначити переможця — окремий текстовий
  // напис поруч з назвою магазину лише дублює той самий сигнал і, до того ж,
  // ламав однаковий розмір карток у 2x2-сітці (переносився на новий рядок).
  const isCheap = multi && e.store === cheapestStore && cheapestStore;
  const pctHtml = e.pct != null ? `<span class="pct">-${e.pct}%</span>` : "";
  const oldHtml = e.oldPrice ? `<span class="old">${money(e.oldPrice)}</span>` : "";
  const icon = STORE_ICON[e.store] ? `<img class="store-icon" src="${STORE_ICON[e.store]}" alt="">` : "";
  // pct-бейдж живе в price-row (поруч зі старою/новою ціною), а не в store-row
  // разом з назвою магазину — інакше в вузькій 2-колонковій сітці рядок з
  // назвою переносився через тісноту, і картки виходили різної висоти.
  // data-* атрибути читає script.js для списку покупок (додати/прибрати).
  return `<div class="entry ${isCheap ? "cheapest" : ""}" data-store="${esc(e.store)}" data-name="${esc(groupName)}" data-price="${e.newPrice}" data-img="${esc(groupImage || "")}">
    <div class="store-row"><span class="store">${icon}${esc(e.store)}</span><button class="add-btn" type="button" aria-label="Додати у список ${esc(e.store)}">+</button></div>
    <div class="price-row">${oldHtml}${pctHtml}<span class="new">${money(e.newPrice)}</span></div>
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
    .map(e => renderEntry(e, g.cheapestStore, multi, g.displayName, g.image)).join("\n");
  return `<div class="card">
    ${thumb}
    <div class="card-body">
      <div class="card-name">${fire}${esc(g.displayName)}</div>
      ${badge}
      <div class="entries${multi ? " entries-compare" : ""}">${entriesHtml}</div>
    </div>
  </div>`;
}

const CAT_ICON = {
  cheese:"🧀", oils:"🫒", sausage:"🥓", fish:"🦐", poultry:"🍗", vegan:"🌱",
  dairy:"🥛", eggs:"🥚", bread:"🥖", salads:"🥗", produce:"🍊", snacks:"🍟",
  sweets:"🍬", icecream:"🍦", drinks:"🥤", nabeer:"🍺", sauces:"🥫", pasta:"🍝",
  frozen:"❄️", tea:"🍵",
  wine:"🍷", regbeer:"🍻", clothing:"🧦", homecare:"🧴",
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

// Додаткові категорії (вино, пиво/сидр, одяг, побутова хімія) — реальні великі
// кластери товарів, які магазини домішують у ті самі сторінки знижок, але які
// НЕ входять у 20 основних харчових категорій Лери. Показуємо їх окремою секцією
// нижче, з чіткою розбивкою по темі (а не одним смітником "Інше"), щоб нічого
// не губилось непомітно — але й не змішувалось з основним списком.
const extraSections = EXTRA_CATEGORIES.map(cat => {
  const groups = extraGrouped[cat.id];
  if (!groups.length) return "";
  const cardsHtml = groups.map(g => renderGroup(g, CAT_ICON[cat.id])).join("\n");
  return `<section class="category extra-category" id="${cat.id}">
    <h2><span class="cat-icon">${CAT_ICON[cat.id]}</span>${esc(cat.title)} <span class="count">${groups.length}</span></h2>
    <div class="grid">${cardsHtml}</div>
  </section>`;
}).join("\n");

const hasExtra = EXTRA_CATEGORIES.some(cat => extraGrouped[cat.id].length);
const extraBlock = hasExtra ? `<div class="extra-divider"><span>Інші категорії (поза основним списком)</span></div>
${extraSections}` : "";

const navHtml = CATEGORIES.map(cat => `<a href="#${cat.id}">${CAT_ICON[cat.id]} ${esc(cat.title.split(" (")[0])}</a>`).join("\n")
  + (hasExtra ? "\n" + EXTRA_CATEGORIES.filter(cat => extraGrouped[cat.id].length)
      .map(cat => `<a href="#${cat.id}" class="nav-extra">${CAT_ICON[cat.id]} ${esc(cat.title)}</a>`).join("\n") : "");
const totalGroups = Object.values(grouped).reduce((s, g) => s + g.length, 0);
const withPhotos = Object.values(grouped).reduce((s, g) => s + g.filter(x => x.image).length, 0);

// Клієнтський JS для списку покупок (додати товар / переглянути по магазинах).
// Ніяких залежностей, зберігається в localStorage браузера — сайт статичний,
// сервера немає. Написано без backtick-рядків (щоб не конфліктувати з
// backtick-шаблоном самого build.js, у який цей рядок вставляється як є).
const LIST_SCRIPT = [
"(function(){",
"  var LS_KEY = 'discountCatalogList_v1';",
"  var TODAY = " + JSON.stringify(TODAY) + ";",
"  var STORES = ['Сільпо','АТБ','Novus','Фора'];",
"  function loadState(){",
"    try {",
"      var raw = localStorage.getItem(LS_KEY);",
"      if (!raw) return { date: TODAY, items: {} };",
"      var parsed = JSON.parse(raw);",
"      if (!parsed.items) parsed.items = {};",
"      return parsed;",
"    } catch(e) { return { date: TODAY, items: {} }; }",
"  }",
"  function saveState(){ try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e) {} }",
"  var state = loadState();",
"  var activeTab = STORES[0];",
"  function keyFor(store, name){ return store + '__' + name; }",
"  function esc(s){ return String(s).replace(/[&<>\"']/g, function(c){ if (c==='&') return '&amp;'; if (c==='<') return '&lt;'; if (c==='>') return '&gt;'; if (c==='\"') return '&quot;'; return '&#39;'; }); }",
"  function toggleItem(entryEl){",
"    var store = entryEl.getAttribute('data-store');",
"    var name = entryEl.getAttribute('data-name');",
"    var price = parseFloat(entryEl.getAttribute('data-price'));",
"    var img = entryEl.getAttribute('data-img') || '';",
"    var key = keyFor(store, name);",
"    if (state.items[key]) { delete state.items[key]; }",
"    else { state.items[key] = { store: store, name: name, price: price, img: img, picked: false }; }",
"    state.date = TODAY;",
"    saveState();",
"    renderAll();",
"  }",
"  function removeItem(key){ delete state.items[key]; saveState(); renderAll(); }",
"  function togglePicked(key){ if (state.items[key]) { state.items[key].picked = !state.items[key].picked; saveState(); renderListOverlay(); } }",
"  function clearStoreList(store){",
"    Object.keys(state.items).forEach(function(k){ if (state.items[k].store === store) delete state.items[k]; });",
"    saveState(); renderAll();",
"  }",
"  function renderButtons(){",
"    var entries = document.querySelectorAll('.entry');",
"    for (var i=0;i<entries.length;i++){",
"      var entryEl = entries[i];",
"      var store = entryEl.getAttribute('data-store');",
"      var name = entryEl.getAttribute('data-name');",
"      var btn = entryEl.querySelector('.add-btn');",
"      if (!btn) continue;",
"      var active = !!state.items[keyFor(store, name)];",
"      btn.className = 'add-btn' + (active ? ' added' : '');",
"      btn.setAttribute('aria-label', (active ? 'Прибрати зі списку ' : 'Додати у список ') + store);",
"      btn.textContent = active ? '✓' : '+';",
"    }",
"  }",
"  function renderFab(){",
"    var total = Object.keys(state.items).length;",
"    var fab = document.getElementById('list-fab');",
"    if (!fab) return;",
"    if (total === 0) { fab.style.display = 'none'; return; }",
"    fab.style.display = 'flex';",
"    fab.querySelector('.fab-badge').textContent = total;",
"  }",
"  function renderAll(){ renderButtons(); renderFab(); if (document.getElementById('list-overlay').className.indexOf('open') !== -1) renderListOverlay(); }",
"  function openOverlay(){ document.getElementById('list-overlay').className = 'open'; renderListOverlay(); document.body.style.overflow='hidden'; }",
"  function closeOverlay(){ document.getElementById('list-overlay').className = ''; document.body.style.overflow=''; }",
"  function switchTab(store){ activeTab = store; renderListOverlay(); }",
"  function renderListOverlay(){",
"    var tabsEl = document.getElementById('list-tabs');",
"    var tabsHtml = '';",
"    STORES.forEach(function(s){",
"      var count = 0;",
"      Object.keys(state.items).forEach(function(k){ if (state.items[k].store === s) count++; });",
"      tabsHtml += '<button type=\"button\" class=\"list-tab' + (s===activeTab?' active':'') + '\" data-store=\"' + esc(s) + '\">' + esc(s) + ' (' + count + ')</button>';",
"    });",
"    tabsEl.innerHTML = tabsHtml;",
"    var panel = document.getElementById('list-panel');",
"    var keys = Object.keys(state.items).filter(function(k){ return state.items[k].store === activeTab; });",
"    if (!keys.length) { panel.innerHTML = '<p class=\"list-empty\">Список порожній. Натисни «+» біля ціни в каталозі, щоб додати товар.</p>'; return; }",
"    var total = 0, rows = '';",
"    keys.forEach(function(key){",
"      var it = state.items[key];",
"      total += it.price;",
"      rows += '<div class=\"list-item-row' + (it.picked?' picked':'') + '\">' +",
"        '<button type=\"button\" class=\"pick-btn\" data-key=\"' + esc(key) + '\" aria-label=\"Позначити взято\">' + (it.picked?'☑':'☐') + '</button>' +",
"        (it.img ? '<img class=\"list-item-img\" src=\"' + esc(it.img) + '\" alt=\"\">' : '') +",
"        '<span class=\"list-item-name\">' + esc(it.name) + '</span>' +",
"        '<span class=\"list-item-price\">' + it.price + ' ₴</span>' +",
"        '<button type=\"button\" class=\"remove-btn\" data-key=\"' + esc(key) + '\" aria-label=\"Прибрати\">×</button>' +",
"        '</div>';",
"    });",
"    panel.innerHTML = rows +",
"      '<div class=\"list-total\">Разом у ' + esc(activeTab) + ': ' + total.toFixed(2) + ' ₴</div>' +",
"      '<button type=\"button\" class=\"clear-store-btn\" data-store=\"' + esc(activeTab) + '\">Очистити список ' + esc(activeTab) + '</button>';",
"  }",
"  function checkStale(){",
"    if (state.date !== TODAY && Object.keys(state.items).length > 0) {",
"      var banner = document.getElementById('stale-banner');",
"      banner.querySelector('.stale-date').textContent = state.date;",
"      banner.style.display = 'flex';",
"    }",
"  }",
"  function dismissStale(clearIt){",
"    if (clearIt) { state = { date: TODAY, items: {} }; }",
"    else { state.date = TODAY; }",
"    saveState(); renderAll();",
"    document.getElementById('stale-banner').style.display = 'none';",
"  }",
"  document.addEventListener('click', function(ev){",
"    var addBtn = ev.target.closest('.add-btn');",
"    if (addBtn) { toggleItem(addBtn.closest('.entry')); return; }",
"    if (ev.target.closest('#list-fab')) { openOverlay(); return; }",
"    if (ev.target.closest('.list-close')) { closeOverlay(); return; }",
"    if (ev.target === document.getElementById('list-overlay')) { closeOverlay(); return; }",
"    var tab = ev.target.closest('.list-tab');",
"    if (tab) { switchTab(tab.getAttribute('data-store')); return; }",
"    var pickBtn = ev.target.closest('.pick-btn');",
"    if (pickBtn) { togglePicked(pickBtn.getAttribute('data-key')); return; }",
"    var removeBtn = ev.target.closest('.remove-btn');",
"    if (removeBtn) { removeItem(removeBtn.getAttribute('data-key')); return; }",
"    var clearBtn = ev.target.closest('.clear-store-btn');",
"    if (clearBtn) { clearStoreList(clearBtn.getAttribute('data-store')); return; }",
"    if (ev.target.closest('.stale-keep')) { dismissStale(false); return; }",
"    if (ev.target.closest('.stale-clear')) { dismissStale(true); return; }",
"  });",
"  renderAll();",
"  checkStale();",
"})();"
].join("\n");

const html = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Каталог знижок тижня — ${TODAY}</title>
<style>
  :root { --bg:#f5f1ea; --card-bg:#fff; --ink:#2b2622; --ink-soft:#6b6259; --accent:#c1502e; --accent2:#2f6e5c; --gold:#d4a13d; --border:#e6ddd0; --cheap-bg:#eaf5ee; --cheap-border:#2f6e5c; --font-display:Georgia,"Iowan Old Style","Palatino Linotype",serif; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { scroll-behavior: smooth; }
  body { margin:0; font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; background:var(--bg); color:var(--ink); line-height:1.4; }
  header { background:linear-gradient(135deg,#2b2622,#40372d); color:#f5f1ea; padding:22px 16px 16px; text-align:center; }
  header h1 { margin:0 0 6px; font-size:24px; font-family:var(--font-display); font-weight:700; }
  header p { margin:4px 0; color:#d8cdbd; font-size:13px; }
  /* max-height = рівно 3 ряди пігулок (8px padding + 3×44px + 2×6px gap +
     8px padding) — будь-яке інше число обрізає 4-й ряд пігулок посередині,
     і виглядає як зламаний скрол замість чіткого краю. */
  nav { position:sticky; top:0; z-index:10; background:#fffaf2; border-bottom:1px solid var(--border); padding:8px 10px; display:flex; flex-wrap:wrap; gap:6px; max-height:calc(16px + 3*44px + 2*6px); overflow-y:auto; }
  nav a { flex:0 0 auto; font-size:12.5px; color:var(--ink); text-decoration:none; background:var(--card-bg); border:1px solid var(--border); border-radius:20px; padding:12px 14px; display:inline-flex; align-items:center; }
  nav a:hover { background:var(--gold); color:#fff; }
  .category { max-width:1180px; margin:0 auto; padding:22px 14px 4px; }
  .category h2 { font-size:19px; font-family:var(--font-display); font-weight:700; display:flex; align-items:center; gap:8px; border-bottom:2px solid var(--gold); padding-bottom:8px; margin-bottom:6px; }
  .extra-divider { max-width:1180px; margin:34px auto 4px; padding:0 14px; display:flex; align-items:center; gap:10px; color:var(--ink-soft); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .extra-divider::before, .extra-divider::after { content:""; flex:1; height:1px; background:var(--border); }
  .extra-category h2 { border-bottom-color:var(--ink-soft); }
  .nav-extra { color:#000; background:#dedad2; border-color:#c7c2b6; }
  .nav-extra:hover { background:#c7c2b6; color:#000; }
  .count { margin-left:auto; font-size:12px; font-weight:400; color:var(--ink-soft); background:var(--bg); border-radius:10px; padding:2px 9px; }
  .cat-note { font-size:12px; color:var(--ink-soft); background:#fff6e6; border:1px dashed var(--gold); border-radius:8px; padding:8px 12px; margin:8px 0 14px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
  .card { background:var(--card-bg); border:1px solid var(--border); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 1px 3px rgba(0,0,0,.04); }
  .thumb { height:120px; display:flex; align-items:center; justify-content:center; background:#fff; border-bottom:1px solid var(--border); overflow:hidden; }
  .thumb img { width:100%; height:100%; object-fit:contain; }
  .thumb-fallback { font-size:34px; background:radial-gradient(circle at 30% 30%,#fff6e6,var(--bg) 75%); }
  .card-body { padding:10px 12px 12px; }
  .card-name { font-size:13px; font-weight:600; margin-bottom:4px; }
  .cmp-badge { display:inline-block; font-size:9.5px; color:var(--accent2); background:var(--cheap-bg); border-radius:8px; padding:1px 7px; margin-bottom:6px; }
  /* 2 колонки, коли є з чим порівнювати (2-4 магазини) — легше зіставити ціни
     оком, ніж гортати список зверху вниз; єдина позиція лишається на всю ширину.
     grid-auto-rows:1fr вирівнює висоту між рядками сітки (2х2), щоб усі 4
     картки виглядали однакового розміру, а не "стрибали" залежно від того,
     чи є в тій позиції знижка. */
  .entries { display:grid; grid-template-columns:1fr; grid-auto-rows:1fr; gap:6px; margin-top:6px; }
  .entries.entries-compare { grid-template-columns:1fr 1fr; }
  .entry { border:1px solid var(--border); border-radius:8px; padding:6px 8px; background:#fbf9f5; min-width:0; display:flex; flex-direction:column; justify-content:center; gap:3px; }
  .entry.cheapest { background:var(--cheap-bg); border-color:var(--cheap-border); }
  .store-row { display:flex; align-items:center; justify-content:space-between; gap:6px; }
  .store { font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px; min-width:0; }
  .store-icon { width:14px; height:14px; object-fit:contain; border-radius:3px; vertical-align:middle; flex-shrink:0; }
  .pct { font-size:10px; font-weight:700; color:#fff; background:var(--accent); border-radius:6px; padding:1px 5px; white-space:nowrap; }
  .price-row { display:flex; align-items:baseline; gap:5px; flex-wrap:wrap; }
  .old { font-size:11px; color:#a39a8d; text-decoration:line-through; }
  .new { font-size:14px; font-weight:800; color:var(--accent2); }

  /* ---- список покупок (додати товар / переглянути по магазинах) ---- */
  .add-btn { flex-shrink:0; width:22px; height:22px; border-radius:50%; border:1px solid var(--border); background:#fff; color:var(--accent2); font-size:15px; font-weight:700; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
  .add-btn:hover { background:var(--cheap-bg); border-color:var(--cheap-border); }
  .add-btn.added { background:var(--accent2); border-color:var(--accent2); color:#fff; }
  #stale-banner { display:none; position:sticky; top:44px; z-index:9; background:#fff6e6; border-bottom:1px solid var(--gold); padding:8px 14px; font-size:12.5px; color:var(--ink); align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; text-align:center; }
  #stale-banner button { border:1px solid var(--border); background:#fff; border-radius:16px; padding:5px 12px; font-size:12px; cursor:pointer; }
  #stale-banner .stale-clear { border-color:var(--accent); color:var(--accent); }
  /* Маленька кругла кнопка в кутку, а не широка панель на весь низ екрана —
     широка панель весь час лежала поверх карток товарів і заважала читати.
     Кнопка лише сигналізує кількістю (бейдж), сам список — тільки за тапом. */
  #list-fab { display:none; position:fixed; right:14px; bottom:14px; z-index:20; width:52px; height:52px; border-radius:50%; background:var(--ink); color:#fff; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.3); border:none; font-size:22px; padding:0; }
  #list-fab .fab-badge { position:absolute; top:-4px; right:-4px; min-width:20px; height:20px; padding:0 4px; border-radius:10px; background:var(--accent); color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
  #list-overlay { display:none; position:fixed; inset:0; z-index:30; background:rgba(20,17,14,.55); align-items:flex-end; justify-content:center; }
  #list-overlay.open { display:flex; }
  .list-modal { background:var(--bg); width:100%; max-width:560px; max-height:88vh; border-radius:18px 18px 0 0; display:flex; flex-direction:column; overflow:hidden; }
  @media (min-width:640px) { #list-overlay { align-items:center; } .list-modal { border-radius:18px; max-height:80vh; } }
  .list-modal-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px 0; }
  .list-modal-head h3 { margin:0; font-size:17px; font-family:var(--font-display); }
  .list-close { border:none; background:var(--card-bg); border:1px solid var(--border); width:32px; height:32px; border-radius:50%; font-size:16px; cursor:pointer; }
  #list-tabs { display:flex; gap:6px; padding:12px 16px 0; overflow-x:auto; }
  .list-tab { flex:0 0 auto; border:1px solid var(--border); background:var(--card-bg); border-radius:16px; padding:8px 13px; font-size:12.5px; cursor:pointer; color:var(--ink); }
  .list-tab.active { background:var(--ink); color:#fff; border-color:var(--ink); }
  #list-panel { flex:1; overflow-y:auto; padding:14px 16px 18px; }
  .list-empty { text-align:center; color:var(--ink-soft); font-size:13px; padding:30px 10px; }
  .list-item-row { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); }
  .list-item-row.picked .list-item-name { text-decoration:line-through; color:var(--ink-soft); }
  .pick-btn { flex-shrink:0; width:26px; height:26px; border-radius:6px; border:1px solid var(--border); background:#fff; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; }
  .list-item-img { width:34px; height:34px; object-fit:contain; border-radius:6px; background:#fff; border:1px solid var(--border); flex-shrink:0; }
  .list-item-name { flex:1; font-size:13px; min-width:0; }
  .list-item-price { font-size:13px; font-weight:700; color:var(--accent2); white-space:nowrap; }
  .remove-btn { flex-shrink:0; width:24px; height:24px; border-radius:50%; border:none; background:transparent; color:var(--ink-soft); font-size:16px; cursor:pointer; }
  .remove-btn:hover { color:var(--accent); }
  .list-total { text-align:right; font-size:14px; font-weight:800; padding:12px 0 4px; color:var(--ink); }
  .clear-store-btn { width:100%; margin-top:8px; padding:9px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--ink-soft); font-size:12.5px; cursor:pointer; }

  footer { text-align:center; padding:26px 20px 86px; font-size:11px; color:var(--ink-soft); }
  .footer-meta { font-size:13px; font-weight:600; color:var(--ink); margin:0 0 10px; }
</style>
</head>
<body>
<header>
  <h1>🛒 Каталог знижок тижня</h1>
</header>
<nav>${navHtml}</nav>
<div id="stale-banner">
  <span>Список покупок збережено <b class="stale-date"></b> — товари могли змінитися.</span>
  <button class="stale-keep" type="button">Лишити список</button>
  <button class="stale-clear" type="button">Почати новий</button>
</div>
${sections}
${extraBlock}
<footer>
  <p class="footer-meta">Сільпо · Novus · Фора · АТБ · станом на ${TODAY} · ${totalGroups} товарних груп, фото знайдено для ${withPhotos}</p>
  Оновлюється щоп'ятниці автоматично (GitHub Actions) — реальні фото качаються напряму
  з сайтів магазинів. Групування однакових товарів між магазинами — евристичне
  (за схожістю назв), тому час від часу звір руками.
</footer>

<button id="list-fab" type="button" aria-label="Список покупок">
  🛒<span class="fab-badge"></span>
</button>

<div id="list-overlay">
  <div class="list-modal">
    <div class="list-modal-head">
      <h3>Список покупок</h3>
      <button class="list-close" type="button" aria-label="Закрити">×</button>
    </div>
    <div id="list-tabs"></div>
    <div id="list-panel"></div>
  </div>
</div>

<script>${LIST_SCRIPT}</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, "catalog.html"), html, "utf-8");
console.log(`\nГотово: catalog.html (${totalGroups} товарних груп, фото для ${withPhotos})`);
console.log(`Відкрий файл ${path.join(ROOT, "catalog.html")} у браузері.`);
