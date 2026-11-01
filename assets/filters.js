// filters.js — пошук, фільтри, сортування й згортання розділів у catalog.html.
// Вставляється в сторінку як є (build.js читає цей файл). Без залежностей.
(function () {
  var LIMIT = 8; // скільки карток показує згорнутий розділ

  var state = { q: "", stores: {}, minPct: 0, multi: false, sort: "alpha" };
  var qEl = document.getElementById("q");
  var panel = document.getElementById("filter-panel");
  var toggleBtn = document.getElementById("filter-toggle");
  var badge = toggleBtn.querySelector(".fbadge");
  var resultLine = document.getElementById("result-line");
  var sortEl = document.getElementById("sort-select");

  var sections = Array.prototype.slice.call(document.querySelectorAll("section.category"));
  sections.forEach(function (sec) {
    var grid = sec.querySelector(".grid");
    sec._grid = grid;
    sec._cards = Array.prototype.slice.call(grid.children);
    sec._cards.forEach(function (c, i) { c._i = i; c._pct = +c.getAttribute("data-pct") || 0; });
    sec._expanded = false;
    sec._count = sec.querySelector(".count");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "more-btn";
    grid.parentNode.insertBefore(btn, grid.nextSibling);
    sec._btn = btn;
    btn.addEventListener("click", function () {
      sec._expanded = !sec._expanded;
      apply();
      if (!sec._expanded) sec.scrollIntoView({ block: "start" });
    });
  });
  var navLinks = {};
  Array.prototype.forEach.call(document.querySelectorAll("nav a"), function (a) {
    navLinks[a.getAttribute("href").slice(1)] = a;
  });
  var extraDivider = document.querySelector(".extra-divider");

  function matches(card) {
    if (state.q) {
      var name = card.getAttribute("data-name") || "";
      var tokens = state.q.split(/\s+/);
      for (var t = 0; t < tokens.length; t++) if (name.indexOf(tokens[t]) === -1) return false;
    }
    if (card._pct < state.minPct) return false;
    if (state.multi && card.getAttribute("data-multi") !== "1") return false;
    var sel = Object.keys(state.stores);
    if (sel.length) {
      var disc = (card.getAttribute("data-disc") || "").split("|");
      var ok = false;
      for (var s = 0; s < sel.length; s++) if (disc.indexOf(sel[s]) !== -1) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }

  function apply() {
    var searching = state.q.length > 0;
    var total = 0, extraShown = 0;
    sections.forEach(function (sec) {
      var matched = sec._cards.filter(matches);
      if (state.sort === "discount") {
        matched.sort(function (a, b) { return b._pct - a._pct || a._i - b._i; });
      } else {
        matched.sort(function (a, b) { return a._i - b._i; });
      }
      var limit = (searching || sec._expanded) ? Infinity : LIMIT;
      // порядок у DOM: спочатку відібрані (у вибраному порядку), решта прихована
      var frag = document.createDocumentFragment();
      matched.forEach(function (c, i) {
        c.classList.toggle("is-hidden", i >= limit);
        frag.appendChild(c);
      });
      sec._cards.forEach(function (c) {
        if (matched.indexOf(c) === -1) { c.classList.add("is-hidden"); frag.appendChild(c); }
      });
      sec._grid.appendChild(frag);

      sec._count.textContent = matched.length;
      sec.classList.toggle("is-hidden", matched.length === 0);
      total += matched.length;
      if (sec.classList.contains("extra-category")) extraShown += matched.length;

      if (matched.length > LIMIT && !searching) {
        sec._btn.style.display = "";
        sec._btn.textContent = sec._expanded ? "Згорнути" : "Показати ще " + (matched.length - LIMIT);
      } else {
        sec._btn.style.display = "none";
      }
      var link = navLinks[sec.id];
      if (link) link.classList.toggle("nav-empty", matched.length === 0);
    });
    if (extraDivider) extraDivider.classList.toggle("is-hidden", extraShown === 0);

    var active = searching || state.minPct > 0 || state.multi || Object.keys(state.stores).length > 0;
    var n = (state.minPct > 0 ? 1 : 0) + (state.multi ? 1 : 0) + Object.keys(state.stores).length;
    badge.textContent = n ? n : "";
    badge.style.display = n ? "" : "none";
    resultLine.textContent = active ? "Знайдено: " + total : "Усього зі знижками: " + total;
    resultLine.className = active ? "active" : "";
  }

  var timer;
  qEl.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      state.q = qEl.value.trim().toLowerCase();
      apply();
    }, 120);
  });
  toggleBtn.addEventListener("click", function () {
    var open = panel.classList.toggle("open");
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  sortEl.addEventListener("change", function () { state.sort = sortEl.value; apply(); });

  panel.addEventListener("click", function (ev) {
    var chip = ev.target.closest(".chip");
    if (chip) {
      if (chip.hasAttribute("data-store")) {
        var s = chip.getAttribute("data-store");
        if (state.stores[s]) delete state.stores[s]; else state.stores[s] = true;
        chip.classList.toggle("on", !!state.stores[s]);
      } else if (chip.hasAttribute("data-pct")) {
        state.minPct = +chip.getAttribute("data-pct");
        Array.prototype.forEach.call(panel.querySelectorAll(".chip[data-pct]"), function (c) {
          c.classList.toggle("on", c === chip);
        });
      } else if (chip.id === "chip-multi") {
        state.multi = !state.multi;
        chip.classList.toggle("on", state.multi);
      }
      apply();
      return;
    }
    if (ev.target.closest("#filter-reset")) {
      state = { q: state.q, stores: {}, minPct: 0, multi: false, sort: "alpha" };
      sortEl.value = "alpha";
      Array.prototype.forEach.call(panel.querySelectorAll(".chip"), function (c) {
        c.classList.toggle("on", c.getAttribute("data-pct") === "0");
      });
      apply();
    }
  });

  apply();
})();
