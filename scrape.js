// scrape.js
// Запуск: node scrape.js            — всі магазини
//         node scrape.js silpo atb  — тільки перелічені
//         node scrape.js --debug    — зберігає html/screenshot по кожній сторінці в debug/
//
// Що робить:
//  1) відкриває кожну сторінку з config.js у справжньому Chromium;
//  2) для кожного магазину викликає СВІЙ екстрактор (STORE_EXTRACTORS) — селектори
//     підібрані під живу верстку кожного сайту (не універсальна евристика);
//  3) качає фото в images/<store>/ (з кешем за slug+hash — не перекачує повторно);
//  4) пише data/<store>.json — сирий список знайдених товарів.
//
// Потім запусти `node build.js`, щоб зібрати з цього catalog.html.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");
const { SOURCES } = require("./config");

const ROOT = __dirname;
const IMAGES_DIR = path.join(ROOT, "images");
const DATA_DIR = path.join(ROOT, "data");
const DEBUG_DIR = path.join(ROOT, "debug");

const args = process.argv.slice(2);
const DEBUG = args.includes("--debug");
const storesToRun = args.filter(a => !a.startsWith("--"));

for (const dir of [IMAGES_DIR, DATA_DIR, DEBUG_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------- утиліти для парсингу цін (виконуються В БРАУЗЕРІ) ----------
function parseNum(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, "").match(/[\d.,]+/);
  if (!m) return null;
  const v = parseFloat(m[0].replace(",", "."));
  return isNaN(v) ? null : v;
}

// ---------- per-site екстрактори: виконуються в page.evaluate ----------
const STORE_EXTRACTORS = {
  // Сільпо: .product-card з чіткими класами (Angular SSR)
  // Важливо: для свіжого м'яса/риби/сиру "на вагу" Сільпо показує ціну ЗА
  // ОДИНИЦЮ ВАГИ (найчастіше 100г), а не за кг чи за пакунок — і ніде явно
  // цього не підписує (той самий текст "100г" виглядає як вага пакунка).
  // Тому завжди зберігаємо цю вагову позначку як unit і завжди показуємо її
  // біля ціни в каталозі — це правдиво в обох випадках (чи то вага пакунка,
  // чи то розрахункова одиниця), і знімає двозначність.
  silpo: function () {
    function num(s) {
      if (!s) return null;
      const m = String(s).replace(/\s/g, "").match(/[\d.,]+/);
      if (!m) return null;
      const v = parseFloat(m[0].replace(",", "."));
      return isNaN(v) ? null : v;
    }
    const out = [];
    document.querySelectorAll(".product-card").forEach(card => {
      const name = card.querySelector(".product-card__title")?.textContent.trim();
      const img = card.querySelector(".product-card__product-img");
      let src = img?.currentSrc || img?.getAttribute("src") || img?.getAttribute("data-src");
      const newPrice = num(card.querySelector(".product-card-price__displayPrice")?.textContent);
      const oldPrice = num(card.querySelector(".product-card-price__displayOldPrice")?.textContent);
      const unit = card.querySelector(".ft-typo-14-semibold, .ft-typo-16-semibold")?.textContent.trim() || null;
      if (!name || !src || newPrice == null) return;
      if (src.startsWith("//")) src = "https:" + src;
      out.push({ name, oldPrice: oldPrice || null, newPrice, img: src, unit });
    });
    return out;
  },

  // АТБ: <article class="catalog-item"> — ціни в атрибуті value на <data>,
  // одиниця ("/шт" або "/кг") — чистий текст у .product-price__unit.
  atb: function () {
    const out = [];
    document.querySelectorAll("article.catalog-item").forEach(card => {
      const name = card.querySelector(".catalog-item__title a")?.textContent.trim();
      const img = card.querySelector(".catalog-item__img");
      let src = img?.getAttribute("src") || img?.getAttribute("data-src");
      const topData = card.querySelector(".product-price__top");
      const bottomData = card.querySelector(".product-price__bottom");
      const topVal = topData ? parseFloat(topData.getAttribute("value")) : null;
      const bottomVal = bottomData ? parseFloat(bottomData.getAttribute("value")) : null;
      const unitText = card.querySelector(".product-price__unit")?.textContent.trim() || null;
      const unit = unitText && unitText.replace("/", "") !== "шт" ? unitText.replace("/", "") : null;
      if (!name || !src || topVal == null) return;
      if (src.startsWith("//")) src = "https:" + src;
      // top = поточна (акційна) ціна, bottom = стара, коли товар зі знижкою
      out.push({ name, oldPrice: bottomVal || null, newPrice: topVal, img: src, unit });
    });
    return out;
  },

  // Novus: Magento-стандарт, li.product-item, data-price-amount/data-price-type.
  // Вагові товари підписані текстом типу "за 1 кг" в .product-item-details.
  novus: function () {
    const out = [];
    document.querySelectorAll("li.product-item").forEach(card => {
      const name = card.querySelector(".product-item-name a, .product-item-link")?.textContent.replace(/­/g, "").trim();
      const img = card.querySelector(".product-image-photo");
      let src = img?.getAttribute("src") || img?.getAttribute("data-src");
      const finalEl = card.querySelector('[data-price-type="finalPrice"]');
      const oldEl = card.querySelector('[data-price-type="oldPrice"]');
      const newPrice = finalEl ? parseFloat(finalEl.getAttribute("data-price-amount")) : null;
      const oldPrice = oldEl ? parseFloat(oldEl.getAttribute("data-price-amount")) : null;
      const weightText = card.querySelector(".product-item-details")?.textContent || "";
      const unit = /за\s*1?\s*кг/i.test(weightText) ? "кг" : null;
      if (!name || !src || newPrice == null) return;
      if (src.startsWith("//")) src = "https:" + src;
      out.push({ name, oldPrice: oldPrice || null, newPrice, img: src, unit });
    });
    return out;
  },

  // Фора: .product-list-item, ціна розбита на current-integer + current-fraction.
  // .product-weight — або конкретна вага пакунка ("500г" — інформативно, не
  // двозначно), або гола одиниця ("кг"/"г" без числа — означає "ціна за кг/г",
  // ось це і показуємо як unit; конкретну вагу пакунка — ні, не потрібно).
  fora: function () {
    function num(s) {
      if (!s) return null;
      const m = String(s).replace(/\s/g, "").match(/[\d.,]+/);
      if (!m) return null;
      const v = parseFloat(m[0].replace(",", "."));
      return isNaN(v) ? null : v;
    }
    const out = [];
    document.querySelectorAll(".product-list-item").forEach(card => {
      const name = card.querySelector(".product-title")?.textContent.trim();
      const img = card.querySelector(".product-list-item__image");
      let src = img?.getAttribute("src") || img?.getAttribute("data-src");
      const intPart = card.querySelector(".current-integer")?.textContent.trim();
      const fracPart = card.querySelector(".current-fraction")?.textContent.trim();
      let newPrice = null;
      if (intPart != null) {
        const fracNum = num(fracPart) ?? 0;
        newPrice = parseFloat(intPart) + fracNum / 100;
      }
      const oldPrice = num(card.querySelector(".old-price .old-integer")?.textContent);
      const weightText = card.querySelector(".product-weight")?.textContent.trim() || "";
      const unit = /^(кг|г)$/i.test(weightText) ? weightText.toLowerCase() : null;
      if (!name || !src || newPrice == null) return;
      if (src.startsWith("//")) src = "https:" + src;
      out.push({ name, oldPrice: oldPrice || null, newPrice, img: src, unit });
    });
    return out;
  },

  // Novus, але НЕ novus.ua/sales.html (Magento) — це novus.zakaz.ua, окрема
  // платформа (React/Next), звичайні категорії товарів. Потрібна тут, щоб мати
  // РЕГУЛЯРНІ (не лише акційні) ціни Novus для порівняння з іншими магазинами.
  novuszakaz: function () {
    function num(s) {
      if (!s) return null;
      const v = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
      return isNaN(v) ? null : v;
    }
    const out = [];
    document.querySelectorAll(".ProductTile").forEach(card => {
      const name = card.querySelector(".ProductTile__title")?.textContent.trim();
      const img = card.querySelector(".ProductTile__imageContainer img");
      let src = img?.getAttribute("src") || img?.getAttribute("data-src");
      const newPrice = num(card.querySelector('[data-marker="Discounted Price"] .Price__value_caption')?.textContent);
      const oldPrice = num(card.querySelector('[data-marker="Old Price"] .Price__value_body')?.textContent);
      const weightText = card.querySelector(".ProductTile__weight")?.textContent || "";
      const unit = /^\s*(за\s*)?1?\s*кг\s*$/i.test(weightText) ? "кг" : null;
      if (!name || !src || newPrice == null) return;
      if (src.startsWith("//")) src = "https:" + src;
      out.push({ name, oldPrice: oldPrice || null, newPrice, img: src, unit });
    });
    return out;
  },
};

const CHALLENGE_TITLE_RE = /just a moment|attention required|access denied|checking your browser|перевірка браузера/i;

async function gotoWithRetry(page, url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      if (attempt === 2) throw e;
      continue;
    }
    await page.waitForTimeout(3500);
    const title = await page.title().catch(() => "");
    if (CHALLENGE_TITLE_RE.test(title)) {
      // антибот-заглушка (напр. Cloudflare) — почекати довше й спробувати ще раз
      await page.waitForTimeout(6000);
      continue;
    }
    return true;
  }
  return true;
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/['".,()»«%]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function downloadImage(url, destPathNoExt) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "";
    let ext = ".jpg";
    if (ct.includes("png")) ext = ".png";
    else if (ct.includes("webp")) ext = ".webp";
    else if (ct.includes("gif")) ext = ".gif";
    const dest = destPathNoExt + ext;
    fs.writeFileSync(dest, buf);
    return path.basename(dest);
  } catch (e) {
    return null;
  }
}

async function dismissAtbAgeGate(page) {
  try {
    const btn = page.locator("button.custom-blue-btn", { hasText: "18" }).first();
    if (await btn.isVisible({ timeout: 3000 })) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    // модалки не було — ок
  }
}

async function scrapeStore(browser, storeKey, storeCfg) {
  console.log(`\n=== ${storeCfg.label} (${storeKey}) ===`);
  const storeImgDir = path.join(IMAGES_DIR, storeKey);
  fs.mkdirSync(storeImgDir, { recursive: true });

  // ВАЖЛИВО: свіжий browser context на КОЖНУ сторінку, а не один на весь магазин.
  // З'ясовано живим тестуванням: Сільпо й АТБ стоять за Cloudflare, і повторні
  // навігації в межах однієї сесії (той самий context/cookies) після 1-ї сторінки
  // майже одразу ловлять "Трохи зачекайте…" (Cloudflare Turnstile-challenge) —
  // навіть з паузами по 7-10с між запитами. Окрема сесія на кожну сторінку
  // повністю це обходить (перевірено на 4+ послідовних сторінках).
  const results = [];
  let pageIdx = 0;
  for (const pageEntry of storeCfg.pages) {
    pageIdx++;
    // сторінка може бути просто URL-рядком (mode = storeCfg.mode) або
    // об'єктом { url, mode, expect } — mode потрібен, коли частина сторінок
    // магазину насправді на іншій платформі з іншою версткою (напр.
    // novus.zakaz.ua); expect — коли ця сторінка на сайті магазину є ОДНІЄЮ
    // конкретною категорією (напр. "Чипси") — build.js довіряє цьому більше,
    // ніж власному пошуку за ключовими словами в назві (який плутає, скажімо,
    // чипси зі смаком курки з самою куркою).
    const url = typeof pageEntry === "string" ? pageEntry : pageEntry.url;
    const mode = typeof pageEntry === "string" ? storeCfg.mode : (pageEntry.mode || storeCfg.mode);
    const expectCategory = typeof pageEntry === "string" ? null : (pageEntry.expect || null);
    const extractor = STORE_EXTRACTORS[mode];
    if (!extractor) {
      console.log(`  ! невідомий mode "${mode}" для ${url}, пропускаю`);
      continue;
    }
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      viewport: { width: 1400, height: 1000 },
      locale: "uk-UA",
    });
    const page = await context.newPage();
    try {
      await gotoWithRetry(page, url);

      if (storeKey === "atb") await dismissAtbAgeGate(page);

      // прокрутка, щоб підвантажились ліниві картинки
      await page.evaluate(async () => {
        for (let i = 0; i < 8; i++) {
          window.scrollBy(0, window.innerHeight);
          await new Promise(r => setTimeout(r, 250));
        }
      });
      await page.waitForTimeout(800);

      if (DEBUG) {
        const base = path.join(DEBUG_DIR, `${storeKey}-${pageIdx}`);
        fs.writeFileSync(base + ".html", await page.content());
        await page.screenshot({ path: base + ".png", fullPage: true }).catch(() => {});
      }

      let found = [];
      try {
        found = await page.evaluate(extractor);
      } catch (e) {
        console.log(`  ! помилка витягування даних з ${url}: ${e.message}`);
      }
      console.log(`  ${url} -> ${found.length} карток`);
      for (const item of found) {
        item.sourceUrl = url;
        item.sourceCategory = expectCategory;
        results.push(item);
      }
    } catch (e) {
      console.log(`  ! не вдалось відкрити ${url}: ${e.message}`);
    } finally {
      await context.close();
    }
  }

  // дедуп по (назва + нова ціна). Один товар часто трапляється і на сторінці
  // знижок (без відомої категорії), і на своїй сторінці категорії (з відомою) —
  // лишаємо версію з відомою sourceCategory, якщо така є, а не першу-ліпшу.
  const dedup = new Map();
  for (const r of results) {
    const key = r.name + "|" + r.newPrice;
    const existing = dedup.get(key);
    if (!existing || (!existing.sourceCategory && r.sourceCategory)) {
      dedup.set(key, r);
    }
  }
  const deduped = Array.from(dedup.values());

  // качаємо фото (з кешем: якщо файл із таким slug вже є на диску — не качаємо повторно)
  for (const item of deduped) {
    const slug = slugify(item.name) + "-" + crypto.createHash("md5").update(item.img).digest("hex").slice(0, 8);
    const existing = fs.readdirSync(storeImgDir).find(f => f.startsWith(slug + "."));
    if (existing) {
      item.localImage = `images/${storeKey}/${existing}`;
      continue;
    }
    const saved = await downloadImage(item.img, path.join(storeImgDir, slug));
    if (saved) {
      item.localImage = `images/${storeKey}/${saved}`;
    } else {
      item.localImage = null;
    }
  }

  const outPath = path.join(DATA_DIR, `${storeKey}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2), "utf-8");
  console.log(`  Разом: ${deduped.length} товарів, дані -> ${path.relative(ROOT, outPath)}`);
  return deduped;
}

(async () => {
  const browser = await chromium.launch({ headless: !DEBUG });
  const keys = storesToRun.length ? storesToRun : Object.keys(SOURCES);
  for (const key of keys) {
    if (!SOURCES[key]) {
      console.log(`Невідомий магазин "${key}", пропускаю. Доступні: ${Object.keys(SOURCES).join(", ")}`);
      continue;
    }
    await scrapeStore(browser, key, SOURCES[key]);
  }
  await browser.close();
  console.log("\nГотово. Тепер запусти: node build.js");
})();
