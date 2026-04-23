/**
 * Cinematic Wedding — vanilla engine
 * Parallax + IO + rAF + lerp smooth scroll (no heavy libs)
 */
(function () {
  "use strict";

  const doc = document.documentElement;
  const body = document.body;

  const state = {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    lowFx: false,
    touch: matchMedia("(pointer: coarse)").matches,
    scrollY: 0,
    innerH: window.innerHeight,
    innerW: window.innerWidth,
    lastTs: 0,
    parallaxEnabled: true,
    cursorEnabled: false,
    cursor: { x: 0, y: 0, tx: 0, ty: 0, scale: 1, targetScale: 1, visible: false, rafId: 0, active: false },
    heroRevealed: false,
    io: null,
    parallaxIO: null,
    activeParallaxScenes: new Set(),
    ticking: false,
    countdownEls: null,
    cdPrev: { d: -1, h: -1, m: -1, s: -1 },
    weddingDate: null,
    dockManualTarget: "",
    dockManualUntil: 0,
  };

  function detectLowFx() {
    const cores = navigator.hardwareConcurrency || 8;
    const mem = navigator.deviceMemory;
    const saveData = navigator.connection && navigator.connection.saveData;
    const small = Math.min(screen.width, screen.height) <= 360;
    const lowCpu = cores <= 4;
    const lowMem = typeof mem === "number" && mem <= 4;
    return state.reducedMotion || saveData || (lowCpu && (lowMem || small));
  }

  function initFlags() {
    state.lowFx = detectLowFx();
    if (state.lowFx) body.classList.add("low-fx");
    if (state.touch) body.classList.add("touch");
    state.cursorEnabled = !state.touch && !state.reducedMotion && window.matchMedia("(pointer: fine)").matches;
    if (state.cursorEnabled) body.classList.add("has-cursor");
    state.parallaxEnabled = !state.reducedMotion && !state.touch && !state.lowFx;
    if (state.reducedMotion) body.classList.add("low-fx");
  }

  /* ---------- URL guest name (?to=) ---------- */
  function initGuestName() {
    const el = document.getElementById("guestName");
    const coverEl = document.getElementById("coverGuestName");
    if (!el && !coverEl) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("to");
    if (!raw) return;
    const decoded = decodeURIComponent(raw.replace(/\+/g, " ")).trim();
    if (!decoded) return;
    if (el) el.textContent = decoded;
    if (coverEl) coverEl.textContent = decoded;
  }

  /* ---------- Preloader ---------- */
  function initPreloader() {
    const pre = document.getElementById("preloader");
    if (!pre) return;
    body.classList.add("is-loading");

    const MIN_MS = 5000;
    const MAX_MS = 6000;
    const start = performance.now();
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      const elapsed = performance.now() - start;
      const wait = Math.max(0, MIN_MS - elapsed);
      window.setTimeout(() => {
        pre.classList.add("is-done");
        body.classList.remove("is-loading");
        pre.setAttribute("aria-busy", "false");
        // triggerHeroReveal is now handled by cover page
      }, wait);
    }

    window.addEventListener("load", finish, { once: true });
    window.setTimeout(finish, MAX_MS);
  }

  function triggerHeroReveal(force) {
    if (state.heroRevealed && !force) return;
    state.heroRevealed = true;
    const reveals = document.querySelectorAll("#hero [data-reveal]");
    reveals.forEach((node, i) => {
      window.setTimeout(() => node.classList.add("is-in"), 120 + i * 140);
    });
  }

  /* ---------- Scroll progress ---------- */
  function updateScrollProgress() {
    const bar = document.getElementById("scrollProgress");
    if (!bar) return;
    const max = doc.scrollHeight - state.innerH;
    const p = max > 0 ? (state.scrollY / max) * 100 : 0;
    bar.style.width = `${Math.min(100, Math.max(0, p))}%`;
    bar.setAttribute("aria-valuenow", String(Math.round(p)));
  }

  /* ---------- Dock ---------- */
  function updateDock() {
    const dock = document.querySelector(".dock");
    if (!dock) return;
    const past = state.scrollY > state.innerH * 0.35;
    dock.classList.toggle("is-visible", past);
    const links = dock.querySelectorAll("a");
    const now = performance.now();
    const manualStillActive =
      !!state.dockManualTarget &&
      now < state.dockManualUntil &&
      !!document.querySelector(state.dockManualTarget);

    if (manualStillActive) {
      links.forEach((a) => {
        const on = a.getAttribute("href") === state.dockManualTarget;
        if (on) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
      return;
    }

    if (state.dockManualTarget && now >= state.dockManualUntil) {
      state.dockManualTarget = "";
      state.dockManualUntil = 0;
    }

    const from = state.scrollY + Math.min(250, state.innerH * 0.3);
    let current = "#hero";
    links.forEach((a) => {
      const id = a.getAttribute("href");
      if (!id || id.charAt(0) !== "#") return;
      const sec = document.querySelector(id);
      if (!sec) return;
      if (sec.offsetTop <= from) current = id;
    });

    // Handle bottom of page reached
    if (state.scrollY + state.innerH >= document.documentElement.scrollHeight - 50) {
      const lastLink = links[links.length - 1].getAttribute("href");
      if (document.querySelector(lastLink)) current = lastLink;
    }

    links.forEach((a) => {
      const on = a.getAttribute("href") === current;
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  /* ---------- Parallax (transform only) ---------- */
  function parallaxHero() {
    if (!state.parallaxEnabled) return;
    const hero = document.getElementById("hero");
    if (!hero || !state.activeParallaxScenes.has(hero)) return;
    const layers = hero.querySelectorAll(".hero__bg-layer");
    if (!layers.length) return;
    const rect = hero.getBoundingClientRect();
    const inView = rect.bottom > 0 && rect.top < state.innerH;
    if (!inView) return;

    const p = Math.max(0, state.scrollY - hero.offsetTop);
    const sBack = state.lowFx ? 0.04 : 0.07;
    const sMid = state.lowFx ? 0.09 : 0.14;
    const sFront = state.lowFx ? 0.12 : 0.2;
    layers[0].style.transform = `translate3d(0, ${(-p * sBack).toFixed(2)}px, 0) scale(1.02)`;
    if (layers[1]) layers[1].style.transform = `translate3d(0, ${(-p * sMid).toFixed(2)}px, 0) scale(1.01)`;
    if (layers[2]) layers[2].style.transform = `translate3d(0, ${(-p * sFront).toFixed(2)}px, 0)`;
  }

  function parallaxCouple() {
    if (!state.parallaxEnabled) return;
    const bg = document.querySelector(".couple-parallax__bg");
    const wrap = document.querySelector(".section--couple");
    if (!bg || !wrap || !state.activeParallaxScenes.has(wrap)) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > state.innerH) return;
    const rel = (state.scrollY - wrap.offsetTop) * 0.15;
    const y = rel * (state.lowFx ? 0.08 : 0.12);
    bg.style.transform = `translate3d(0, ${y}px, 0)`;
  }

  function parallaxStory() {
    if (!state.parallaxEnabled) return;
    state.activeParallaxScenes.forEach((scene) => {
      if (!(scene instanceof HTMLElement) || !scene.hasAttribute("data-parallax-scene")) return;
      const bg = scene.querySelector(".story-scene__bg");
      if (!bg) return;
      const rect = scene.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > state.innerH + 100) return;
      const factor = parseFloat(bg.getAttribute("data-story-bg") || "0.2");
      const center = rect.top + rect.height * 0.5 - state.innerH * 0.5;
      const y = center * -factor * (state.lowFx ? 0.35 : 0.55);
      const sc = 1 + (state.lowFx ? 0 : center / state.innerH) * 0.02;
      bg.style.transform = `translate3d(0, ${y}px, 0) scale(${sc.toFixed(4)})`;
    });
  }

  function parallaxGallery() {
    // Disabled: No parallax effects on gallery as per task requirement
    return;
  }

  /* ---------- Intersection Observer ---------- */
  function initIO() {
    const nodes = document.querySelectorAll("[data-io]");
    if (!nodes.length) return;

    state.io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
          }
        });
      },
      { root: null, threshold: state.lowFx ? 0.12 : 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    nodes.forEach((n) => state.io.observe(n));

    const closing = document.getElementById("closing");
    if (closing) {
      const ioClose = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            en.target.classList.toggle("is-deep", en.isIntersecting && en.intersectionRatio > 0.35);
          });
        },
        { threshold: [0, 0.2, 0.35, 0.55] }
      );
      ioClose.observe(closing);
    }
  }

  /* ---------- Anchor scroll (native smooth — tidak memblokir scroll jari / roda) ---------- */
  function scrollToSection(el) {
    const behavior = state.reducedMotion || state.lowFx ? "auto" : "smooth";
    el.scrollIntoView({ behavior, block: "start", inline: "nearest" });
  }

  function initAnchorScroll() {
    document.querySelectorAll("a[data-scrollto][href^='#']").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (!href) return;
        const el = document.querySelector(href);
        if (!el) return;
        e.preventDefault();
        // Lock dock active state briefly so highlight doesn't hop
        // while smooth scrolling passes intermediate sections.
        state.dockManualTarget = href;
        state.dockManualUntil = performance.now() + (state.reducedMotion || state.lowFx ? 250 : 1100);
        updateDock();
        scrollToSection(el);
      });
    });
  }

  function moveOrbs() {
    const a = document.querySelector(".gradient-orb--a");
    const b = document.querySelector(".gradient-orb--b");
    if (!a || !b) return;
    if (state.lowFx) {
      a.style.transform = "translate3d(0, 0, 0)";
      b.style.transform = "translate3d(0, 0, 0)";
      return;
    }
    const t = state.scrollY * 0.0014;
    const x1 = Math.sin(t * 0.8) * 12;
    const y1 = Math.cos(t * 0.6) * 10;
    const x2 = Math.cos(t * 0.5) * 15;
    const y2 = Math.sin(t * 0.7) * 11;
    a.style.transform = `translate3d(${x1.toFixed(2)}px, ${y1.toFixed(2)}px, 0)`;
    b.style.transform = `translate3d(${x2.toFixed(2)}px, ${y2.toFixed(2)}px, 0)`;
  }

  function renderVisuals() {
    state.ticking = false;
    state.scrollY = window.scrollY;
    parallaxHero();
    parallaxCouple();
    parallaxStory();
    parallaxGallery();
    moveOrbs();
    updateScrollProgress();
    updateDock();
  }

  function scheduleVisualUpdate() {
    if (state.ticking || document.hidden) return;
    state.ticking = true;
    window.requestAnimationFrame(renderVisuals);
  }

  /* ---------- Cursor ---------- */
  function initCursor() {
    const glow = document.getElementById("cursorGlow");
    if (!glow || !state.cursorEnabled) return;

    state.cursor.tx = window.innerWidth * 0.5;
    state.cursor.ty = window.innerHeight * 0.5;
    state.cursor.x = state.cursor.tx;
    state.cursor.y = state.cursor.ty;

    function runCursor() {
      if (!state.cursor.active || document.hidden) {
        state.cursor.rafId = 0;
        return;
      }
      // Lerp tuned for smooth premium cursor without trailing too long.
      const lerp = state.lowFx ? 0.24 : 0.16;
      state.cursor.tx += (state.cursor.x - state.cursor.tx) * lerp;
      state.cursor.ty += (state.cursor.y - state.cursor.ty) * lerp;
      state.cursor.scale += (state.cursor.targetScale - state.cursor.scale) * 0.2;
      glow.style.opacity = state.cursor.visible ? "1" : "0";
      glow.style.transform = `translate3d(${state.cursor.tx}px, ${state.cursor.ty}px, 0) scale(${state.cursor.scale.toFixed(3)})`;
      state.cursor.rafId = window.requestAnimationFrame(runCursor);
    }

    function ensureCursorLoop() {
      if (!state.cursor.active || state.cursor.rafId) return;
      state.cursor.rafId = window.requestAnimationFrame(runCursor);
    }

    function stopCursorLoop() {
      if (!state.cursor.rafId) return;
      window.cancelAnimationFrame(state.cursor.rafId);
      state.cursor.rafId = 0;
    }

    state.cursor.active = true;
    ensureCursorLoop();

    window.addEventListener(
      "pointermove",
      (e) => {
        state.cursor.x = e.clientX;
        state.cursor.y = e.clientY;
        state.cursor.visible = true;
        ensureCursorLoop();
      },
      { passive: true }
    );

    window.addEventListener(
      "mouseleave",
      () => {
        state.cursor.visible = false;
      },
      { passive: true }
    );
  }

  function initCursorInteractions() {
    if (!state.cursorEnabled) return;
    const glow = document.getElementById("cursorGlow");
    if (!glow) return;

    const interactiveSelector = "a, button, [data-ripple], .filter-btn, .event-glass__btn, .hero__cta";
    document.addEventListener(
      "pointerover",
      (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        if (target.closest("a")) glow.classList.add("is-link");
        if (target.closest(interactiveSelector)) {
          glow.classList.add("is-hover");
          state.cursor.targetScale = state.lowFx ? 1.06 : 1.2;
        }
      },
      { passive: true }
    );
    document.addEventListener(
      "pointerout",
      () => {
        glow.classList.remove("is-link");
        glow.classList.remove("is-hover");
        state.cursor.targetScale = 1;
      },
      { passive: true }
    );
    document.addEventListener(
      "pointerdown",
      () => {
        state.cursor.targetScale = state.lowFx ? 1.12 : 1.32;
        glow.classList.remove("is-click");
        void glow.offsetWidth;
        glow.classList.add("is-click");
      },
      { passive: true }
    );
    glow.addEventListener("animationend", () => {
      glow.classList.remove("is-click");
      state.cursor.targetScale = 1;
    });
  }

  function initParallaxObserver() {
    const scenes = document.querySelectorAll("[data-parallax-scene], .gallery-item, #hero, .section--couple");
    if (!scenes.length || !state.parallaxEnabled) return;
    state.parallaxIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) state.activeParallaxScenes.add(entry.target);
          else state.activeParallaxScenes.delete(entry.target);
        });
        scheduleVisualUpdate();
      },
      { root: null, threshold: 0.01, rootMargin: "20% 0px 20% 0px" }
    );
    scenes.forEach((scene) => state.parallaxIO.observe(scene));
  }

  /* ---------- Hero first scroll ---------- */
  function initHeroScrollCue() {
    const onScroll = () => {
      if (window.scrollY > 8) triggerHeroReveal(false);
      window.removeEventListener("scroll", onScroll);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Countdown ---------- */
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function tickCountdown() {
    const root = document.getElementById("countdownRoot");
    const coverRoot = document.getElementById("coverCountdownRoot");
    if (!root && !coverRoot) return;
    if (!state.weddingDate) {
      const iso = root ? root.getAttribute("data-wedding") : null;
      state.weddingDate = iso ? new Date(iso) : new Date("2026-05-24T08:00:00+07:00");
    }
    const now = new Date();
    let diff = state.weddingDate - now;
    if (diff < 0) diff = 0;

    const s = Math.floor(diff / 1000) % 60;
    const m = Math.floor(diff / (1000 * 60)) % 60;
    const h = Math.floor(diff / (1000 * 60 * 60)) % 24;
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));

    const map = [
      ["cdDays", d, "coverDays"],
      ["cdHours", h, "coverHours"],
      ["cdMins", m, "coverMins"],
      ["cdSecs", s, "coverSecs"],
    ];

    map.forEach(([id, val, coverId], idx) => {
      const el = document.getElementById(id);
      const coverEl = document.getElementById(coverId);
      const key = ["d", "h", "m", "s"][idx];
      const prev = state.cdPrev[key];
      const str = idx === 0 ? String(val) : pad2(val);
      if (prev !== val) {
        if (el) {
          el.textContent = str;
          el.classList.remove("is-tick");
          void el.offsetWidth;
          el.classList.add("is-tick");
        }
        if (coverEl) coverEl.textContent = str;
      }
      state.cdPrev[key] = val;
    });
  }

  /* ---------- RSVP ---------- */
  function initRSVP() {
    const form = document.getElementById("rsvpForm");
    const note = document.getElementById("rsvpNote");
    const list = document.getElementById("wishesList");
    const listWrap = document.getElementById("wishesListWrap");
    const totalWishes = document.getElementById("totalWishes");
    const totalAttend = document.getElementById("totalAttend");
    const totalAbsent = document.getElementById("totalAbsent");
    const filterBtns = document.querySelectorAll(".filter-btn");
    if (!form || !note || !list || !listWrap) return;

    const STORAGE_KEY = "wedding_wishes_v1";
    const sheetEndpoint = String(form.getAttribute("data-sheet-endpoint") || "").trim();
    const submitBtn = document.getElementById("rsvpSubmit");
    const stateWish = { filter: "all", items: [], source: "local" };

    function nowLabel(iso) {
      const d = new Date(iso);
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    }

    function showSkeleton() {
      list.innerHTML = "";
      for (let i = 0; i < 3; i++) {
        const sk = document.createElement("div");
        sk.className = "wish-skeleton";
        list.appendChild(sk);
      }
    }

    function save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateWish.items));
      } catch {
        note.textContent = "Data tidak bisa disimpan di browser ini.";
      }
    }

    function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) stateWish.items = parsed;
      } catch {
        stateWish.items = [];
      }
    }

    async function fetchFromSheet() {
      if (!sheetEndpoint) return false;
      try {
        const res = await fetch(sheetEndpoint, { method: "GET" });
        if (!res.ok) return false;
        const payload = await res.json();
        if (!payload || !Array.isArray(payload.data)) return false;
        stateWish.items = payload.data
          .map((item, idx) => ({
            id: String(item.id || `${Date.now()}-${idx}`),
            name: String(item.name || "").trim(),
            message: String(item.message || "").trim(),
            attendance: String(item.attendance || "hadir") === "tidak-hadir" ? "tidak-hadir" : "hadir",
            createdAt: String(item.createdAt || item.createdAT || new Date().toISOString()),
          }))
          .filter((item) => item.name && item.message);
        stateWish.source = "sheet";
        save();
        return true;
      } catch {
        return false;
      }
    }

    async function sendToSheet(entry) {
      if (!sheetEndpoint) return { ok: false, reason: "no-endpoint" };
      try {
        const res = await fetch(sheetEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
        if (!res.ok) return { ok: false, reason: "http-error" };
        return { ok: true };
      } catch {
        return { ok: false, reason: "network-error" };
      }
    }

    function filteredItems() {
      if (stateWish.filter === "all") return stateWish.items;
      return stateWish.items.filter((item) => item.attendance === stateWish.filter);
    }

    function updateStats() {
      const total = stateWish.items.length;
      const hadir = stateWish.items.filter((item) => item.attendance === "hadir").length;
      const tidakHadir = total - hadir;
      if (totalWishes) totalWishes.textContent = String(total);
      if (totalAttend) totalAttend.textContent = String(hadir);
      if (totalAbsent) totalAbsent.textContent = String(tidakHadir);
    }

    function createBadge(attendance) {
      const badge = document.createElement("span");
      const isHadir = attendance === "hadir";
      badge.className = `wish-badge ${isHadir ? "wish-badge--hadir" : "wish-badge--tidak-hadir"}`;
      badge.textContent = isHadir ? "✔ Hadir" : "✖ Tidak Hadir";
      return badge;
    }

    function render(stagger) {
      list.innerHTML = "";
      const items = filteredItems();
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "wish-empty";
        empty.textContent = "Belum ada ucapan untuk filter ini.";
        list.appendChild(empty);
        updateStats();
        return;
      }

      items.forEach((item, idx) => {
        const card = document.createElement("article");
        card.className = "wish-card";
        card.style.animationDelay = stagger ? `${Math.min(idx, 8) * 70}ms` : "0ms";

        const head = document.createElement("div");
        head.className = "wish-card__head";

        const name = document.createElement("h3");
        name.className = "wish-card__name";
        name.textContent = item.name;

        head.appendChild(name);
        head.appendChild(createBadge(item.attendance));

        const text = document.createElement("p");
        text.className = "wish-card__text";
        text.textContent = item.message;

        const time = document.createElement("small");
        time.className = "wish-card__time";
        time.textContent = nowLabel(item.createdAt);

        card.appendChild(head);
        card.appendChild(text);
        card.appendChild(time);
        list.appendChild(card);
      });

      updateStats();
    }

    function setFilter(next) {
      stateWish.filter = next;
      filterBtns.forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-filter") === next);
      });
      render(false);
    }

    function autoScrollToLatest() {
      listWrap.scrollTo({ top: 0, behavior: state.lowFx || state.reducedMotion ? "auto" : "smooth" });
    }

    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-filter") || "all";
        setFilter(next);
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get("name") || "").trim();
      const message = String(fd.get("message") || "").trim();
      const attendance = String(fd.get("attendance") || "hadir");

      if (!name) {
        note.textContent = "Nama wajib diisi.";
        return;
      }
      if (message.length < 5) {
        note.textContent = "Ucapan minimal 5 karakter.";
        return;
      }

      const entry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name,
        message,
        attendance: attendance === "tidak-hadir" ? "tidak-hadir" : "hadir",
        createdAt: new Date().toISOString(),
      };

      if (submitBtn) submitBtn.disabled = true;
      const syncResult = await sendToSheet(entry);
      stateWish.items.unshift(entry);

      save();
      if (syncResult.ok) {
        note.textContent = "Ucapan tersimpan ke spreadsheet. Terima kasih atas doa terbaiknya.";
      } else if (syncResult.reason === "no-endpoint") {
        note.textContent = "Ucapan tersimpan lokal. Isi endpoint spreadsheet agar data masuk Google Sheet.";
      } else {
        note.textContent = "Ucapan tersimpan lokal. Sinkron spreadsheet gagal, coba lagi nanti.";
      }
      form.reset();
      const hadir = form.querySelector('input[name="attendance"][value="hadir"]');
      if (hadir) hadir.checked = true;

      if (stateWish.filter !== "all" && stateWish.filter !== attendance) {
        setFilter("all");
      }
      render(false);
      autoScrollToLatest();
      if (submitBtn) submitBtn.disabled = false;
    });

    showSkeleton();
    load();
    fetchFromSheet().finally(() => {
      window.setTimeout(() => render(true), 420);
    });
  }

  /* ---------- Gift copy ---------- */
  function initGiftCopy() {
    const toast = document.getElementById("giftToast");
    document.querySelectorAll(".gift-copy").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const text = btn.getAttribute("data-copy-target") || "";
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          if (toast) {
            toast.textContent = "Nomor rekening berhasil disalin.";
            toast.classList.remove("is-success");
            void toast.offsetWidth;
            toast.classList.add("is-success");
          }
        } catch {
          if (toast) toast.textContent = "Salin manual: " + text;
        }
      });
    });
  }

  /* ---------- Gift confirmation ---------- */
  function initGiftConfirmation() {
    const form = document.getElementById("giftConfirmForm");
    const note = document.getElementById("giftConfirmNote");
    const uploadZone = document.getElementById("giftUploadZone");
    const uploadInput = document.getElementById("giftProof");
    const uploadTrigger = document.getElementById("giftUploadTrigger");
    const preview = document.getElementById("giftPreview");
    const previewImage = document.getElementById("giftPreviewImage");
    const submitBtn = document.getElementById("giftConfirmSubmit");
    const list = document.getElementById("giftConfirmList");
    const adminPanel = document.getElementById("giftAdminPanel");
    const exportBtn = document.getElementById("giftExportJson");
    const logoutBtn = document.getElementById("giftAdminLogout");
    const searchInput = document.getElementById("giftAdminSearch");
    const methodFilter = document.getElementById("giftAdminMethodFilter");
    if (!form || !note || !uploadZone || !uploadInput || !uploadTrigger || !preview || !previewImage || !submitBtn || !list || !adminPanel || !exportBtn || !logoutBtn || !searchInput || !methodFilter) return;

    const STORAGE_KEY = "wedding_gift_confirmations_v1";
    const ADMIN_SESSION_KEY = "wedding_gift_admin_unlocked_v1";
    const ADMIN_PIN_HASH = "4151a7b7c7f2b992077270a09183abeac2249df079dbf1cbd785f063212278e6";
    const stateGift = { items: [], proofDataUrl: "", proofName: "", search: "", method: "all", adminUnlocked: false };

    function toRupiahInput(raw) {
      const onlyDigits = raw.replace(/[^\d]/g, "");
      if (!onlyDigits) return "";
      const formatted = new Intl.NumberFormat("id-ID").format(Number(onlyDigits));
      return `Rp ${formatted}`;
    }

    function showError(msg) {
      note.textContent = msg;
      note.classList.remove("is-success");
    }

    function showSuccess(msg) {
      note.textContent = msg;
      note.classList.add("is-success");
    }

    function readStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) stateGift.items = parsed;
      } catch {
        stateGift.items = [];
      }
    }

    function writeStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateGift.items));
      } catch {
        showError("Penyimpanan lokal penuh. Coba hapus data browser.");
      }
    }

    function setAdminPanelVisibility() {
      adminPanel.hidden = !stateGift.adminUnlocked;
    }

    async function sha256Hex(text) {
      const bytes = new TextEncoder().encode(text);
      const buffer = await crypto.subtle.digest("SHA-256", bytes);
      const arr = Array.from(new Uint8Array(buffer));
      return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    async function requestAdminAccess() {
      const input = window.prompt("Masukkan PIN admin untuk melihat data gift:");
      if (!input) return;
      const hash = await sha256Hex(input.trim());
      if (hash === ADMIN_PIN_HASH) {
        stateGift.adminUnlocked = true;
        sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
        setAdminPanelVisibility();
        renderAdminList(false);
      } else {
        showError("PIN admin salah. Data konfirmasi tetap tersembunyi.");
      }
    }

    function initAdminAccess() {
      stateGift.adminUnlocked = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
      setAdminPanelVisibility();
      const params = new URLSearchParams(window.location.search);
      if (params.get("admin") === "1" && !stateGift.adminUnlocked) {
        requestAdminAccess();
      }
    }

    function filteredAdminItems() {
      const keyword = stateGift.search.toLowerCase();
      return stateGift.items.filter((item) => {
        const byMethod = stateGift.method === "all" || item.method === stateGift.method;
        if (!byMethod) return false;
        if (!keyword) return true;
        const sender = String(item.senderName || "").toLowerCase();
        const message = String(item.message || "").toLowerCase();
        return sender.includes(keyword) || message.includes(keyword);
      });
    }

    function renderAdminList(withSkeleton) {
      list.innerHTML = "";
      if (withSkeleton) {
        for (let i = 0; i < 2; i++) {
          const sk = document.createElement("div");
          sk.className = "gift-admin-skeleton";
          list.appendChild(sk);
        }
        return;
      }

      const rows = filteredAdminItems();
      if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "gift-admin-empty";
        empty.textContent = stateGift.items.length
          ? "Data tidak ditemukan untuk filter saat ini."
          : "Belum ada konfirmasi gift tersimpan.";
        list.appendChild(empty);
        return;
      }

      const table = document.createElement("table");
      table.className = "gift-admin-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th>Pengirim</th>
            <th>Metode</th>
            <th>Nominal</th>
            <th>Tanggal Kirim</th>
            <th>Pesan</th>
            <th>Waktu Input</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");
      rows.slice(0, 24).forEach((item) => {
        if (!tbody) return;
        const tr = document.createElement("tr");
        const sender = item.isAnonymous ? "Anonim" : item.senderName;
        const tdSender = document.createElement("td");
        tdSender.textContent = sender || "-";

        const tdMethod = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = "gift-admin-badge";
        badge.textContent = item.method || "-";
        tdMethod.appendChild(badge);

        const tdAmount = document.createElement("td");
        tdAmount.textContent = item.amount || "-";

        const tdDate = document.createElement("td");
        tdDate.textContent = item.sendDate || "-";

        const tdMessage = document.createElement("td");
        const msg = document.createElement("span");
        msg.className = "gift-admin-text-trim";
        msg.textContent = item.message || "-";
        tdMessage.appendChild(msg);

        const tdTs = document.createElement("td");
        tdTs.textContent = item.timestamp || "-";

        tr.appendChild(tdSender);
        tr.appendChild(tdMethod);
        tr.appendChild(tdAmount);
        tr.appendChild(tdDate);
        tr.appendChild(tdMessage);
        tr.appendChild(tdTs);
        tbody.appendChild(tr);
      });
      list.appendChild(table);
    }

    function applyPreview(dataUrl, name) {
      if (!dataUrl) {
        stateGift.proofDataUrl = "";
        stateGift.proofName = "";
        previewImage.removeAttribute("src");
        preview.hidden = true;
        return;
      }
      stateGift.proofDataUrl = dataUrl;
      stateGift.proofName = name || "";
      previewImage.src = dataUrl;
      preview.hidden = false;
    }

    function handleFile(file) {
      if (!file) return;
      const isValidType = /^image\/(jpeg|png)$/i.test(file.type);
      if (!isValidType) {
        showError("Bukti transfer harus JPG atau PNG.");
        uploadInput.value = "";
        applyPreview("", "");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        applyPreview(String(reader.result || ""), file.name);
      };
      reader.readAsDataURL(file);
    }

    function validateFields() {
      const fd = new FormData(form);
      const senderName = String(fd.get("senderName") || "").trim();
      const message = String(fd.get("message") || "").trim();
      if (!senderName) {
        showError("Nama pengirim wajib diisi.");
        return false;
      }
      if (message.length < 5) {
        showError("Pesan minimal 5 karakter.");
        return false;
      }
      return true;
    }

    uploadTrigger.addEventListener("click", () => uploadInput.click());
    uploadZone.addEventListener("click", (e) => {
      if (e.target === uploadZone) uploadInput.click();
    });
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0];
      handleFile(file || null);
    });

    ["dragenter", "dragover"].forEach((evt) => {
      uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadZone.classList.add("is-drag");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadZone.classList.remove("is-drag");
      });
    });
    uploadZone.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files[0]) return;
      handleFile(files[0]);
    });

    const amountInput = form.querySelector('input[name="amount"]');
    if (amountInput) {
      amountInput.addEventListener("input", () => {
        amountInput.value = toRupiahInput(amountInput.value);
      });
    }

    const senderInput = form.querySelector('input[name="senderName"]');
    const messageInput = form.querySelector('textarea[name="message"]');
    if (senderInput) {
      senderInput.addEventListener("input", () => {
        if (senderInput.value.trim()) note.textContent = "";
      });
    }
    if (messageInput) {
      messageInput.addEventListener("input", () => {
        if (messageInput.value.trim().length >= 5) note.textContent = "";
      });
    }

    exportBtn.addEventListener("click", () => {
      const data = JSON.stringify(stateGift.items, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gift-confirmation-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    logoutBtn.addEventListener("click", () => {
      stateGift.adminUnlocked = false;
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      setAdminPanelVisibility();
      showSuccess("Sesi admin ditutup. Data konfirmasi kembali disembunyikan.");
    });

    searchInput.addEventListener("input", () => {
      stateGift.search = searchInput.value.trim();
      renderAdminList(false);
    });

    methodFilter.addEventListener("change", () => {
      stateGift.method = methodFilter.value || "all";
      renderAdminList(false);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validateFields()) return;
      submitBtn.classList.add("is-loading");

      const fd = new FormData(form);
      const senderName = String(fd.get("senderName") || "").trim();
      const method = String(fd.get("method") || "").trim();
      const amount = String(fd.get("amount") || "").trim();
      const sendDate = String(fd.get("sendDate") || "").trim();
      const message = String(fd.get("message") || "").trim();
      const isAnonymous = Boolean(fd.get("isAnonymous"));
      const timestamp = new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());

      window.setTimeout(() => {
        stateGift.items.unshift({
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          senderName,
          method: method || "Transfer Bank",
          amount,
          sendDate,
          message,
          isAnonymous,
          proofName: stateGift.proofName,
          proofDataUrl: stateGift.proofDataUrl,
          timestamp,
        });

        writeStorage();
        setAdminPanelVisibility();
        renderAdminList(false);
        submitBtn.classList.remove("is-loading");
        showSuccess("Terima kasih, konfirmasi gift Anda telah diterima 💖");
        note.scrollIntoView({ behavior: state.reducedMotion || state.lowFx ? "auto" : "smooth", block: "center" });

        form.reset();
        applyPreview("", "");
      }, 900);
    });

    renderAdminList(true);
    readStorage();
    initAdminAccess();
    window.setTimeout(() => renderAdminList(false), 420);
  }

  /* ---------- Gallery & Lightbox ---------- */
  function initGallery() {
    const track = document.getElementById("galleryTrack");
    const items = document.querySelectorAll(".gallery-item");
    const dotsContainer = document.getElementById("galleryDots");
    const btnPrev = document.getElementById("galleryPrev");
    const btnNext = document.getElementById("galleryNext");
    const lightbox = document.getElementById("galleryLightbox");
    const lbImg = document.getElementById("lightboxImg");
    const lbPrev = document.getElementById("lightboxPrev");
    const lbNext = document.getElementById("lightboxNext");

    if (!track || !items.length || !lightbox || !lbImg) return;

    let currentIndex = 0;
    let isAutoPlaying = !document.body.classList.contains("low-fx");
    let autoPlayTimer = 0;
    const AUTO_DELAY = 4000;

    // --- Dots Setup ---
    items.forEach((_, i) => {
      const dot = document.createElement("div");
      dot.className = "gallery-dot";
      dot.setAttribute("aria-label", `Ke foto ${i + 1}`);
      dot.addEventListener("click", () => scrollToItem(i));
      dotsContainer.appendChild(dot);
    });
    const dots = dotsContainer.querySelectorAll(".gallery-dot");

    // --- Intersection Observer for Active State (Ken Burns / Depth) ---
    const ioOptions = {
      root: track,
      threshold: 0.6,
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("is-active");
          const idx = Array.from(items).indexOf(en.target);
          if (idx !== -1) updateNav(idx);
        } else {
          en.target.classList.remove("is-active");
        }
      });
    }, ioOptions);

    items.forEach((item) => observer.observe(item));

    function scrollToItem(index) {
      if (index < 0 || index >= items.length) return;
      const item = items[index];
      const scrollPos = item.offsetLeft - track.offsetLeft - (track.clientWidth / 2) + (item.clientWidth / 2);

      track.scrollTo({
        left: scrollPos,
        behavior: state.reducedMotion || state.lowFx ? "auto" : "smooth"
      });
      pauseAutoPlay();
      resumeAutoPlay();
    }

    function updateNav(index) {
      currentIndex = index;
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === index);
      });

      if (btnPrev && btnNext) {
        btnPrev.classList.toggle("is-hidden", index === 0);
        btnNext.classList.toggle("is-hidden", index === items.length - 1);
      }
    }

    // Prev / Next scroll
    if (btnPrev) btnPrev.addEventListener("click", () => scrollToItem(currentIndex - 1));
    if (btnNext) btnNext.addEventListener("click", () => scrollToItem(currentIndex + 1));

    // --- Auto Play ---
    function autoSlide() {
      if (!isAutoPlaying) return;
      let nextIndex = currentIndex + 1;
      if (nextIndex >= items.length) nextIndex = 0;
      scrollToItem(nextIndex);
      autoPlayTimer = window.setTimeout(autoSlide, AUTO_DELAY);
    }

    function pauseAutoPlay() {
      isAutoPlaying = false;
      if (autoPlayTimer) window.clearTimeout(autoPlayTimer);
    }

    function resumeAutoPlay() {
      if (state.lowFx || state.reducedMotion) return;
      isAutoPlaying = true;
      if (autoPlayTimer) window.clearTimeout(autoPlayTimer);
      autoPlayTimer = window.setTimeout(autoSlide, AUTO_DELAY);
    }

    // Pause on Interaction
    track.addEventListener("touchstart", pauseAutoPlay, { passive: true });
    track.addEventListener("pointerdown", pauseAutoPlay, { passive: true });
    track.addEventListener("mouseenter", pauseAutoPlay, { passive: true });
    track.addEventListener("mouseleave", resumeAutoPlay, { passive: true });

    // Fallback sync scroll event for smooth track updates
    track.addEventListener("scroll", () => {
      // Allow IO time to settle, fallback if needed
    }, { passive: true });

    // --- Mouse Drag Desktop ---
    let isDown = false;
    let startX;
    let scrollLeft;

    track.addEventListener("mousedown", (e) => {
      isDown = true;
      track.classList.add("is-dragging");
      startX = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
      pauseAutoPlay();
    });

    track.addEventListener("mouseleave", () => {
      if (isDown) {
        isDown = false;
        track.classList.remove("is-dragging");
        resumeAutoPlay();
      }
    });

    track.addEventListener("mouseup", () => {
      if (isDown) {
        isDown = false;
        track.classList.remove("is-dragging");
        resumeAutoPlay();
      }
    });

    track.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault(); // Prevent text selection/drag
      const x = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.5; // Scroll-fast
      track.scrollLeft = scrollLeft - walk;
    });

    // Start auto slide
    resumeAutoPlay();

    // --- Lightbox Logic ---
    let lbIndex = 0;

    items.forEach((item, i) => {
      item.addEventListener("click", () => {
        // Only open lightbox if item is active, otherwise scroll to it
        if (!item.classList.contains("is-active")) {
          scrollToItem(i);
        } else {
          openLightbox(i);
        }
      });
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(i);
        }
      });
    });

    function openLightbox(index) {
      if (index < 0 || index >= items.length) return;
      lbIndex = index;
      pauseAutoPlay();

      const img = items[index].querySelector("img");
      if (img) lbImg.src = img.src;

      lightbox.classList.add("is-open");
      document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
      lightbox.classList.remove("is-open");
      document.body.style.overflow = "";
      setTimeout(() => { lbImg.src = ""; }, 500);
      resumeAutoPlay();
    }

    function slideLightbox(dir) {
      const imgWrap = lightbox.querySelector(".lightbox__img-wrap");
      if (imgWrap) imgWrap.classList.add("is-sliding");

      setTimeout(() => {
        lbIndex += dir;
        if (lbIndex < 0) lbIndex = items.length - 1;
        if (lbIndex >= items.length) lbIndex = 0;

        const img = items[lbIndex].querySelector("img");
        if (img) lbImg.src = img.src;
        if (imgWrap) imgWrap.classList.remove("is-sliding");

        // Also sync track to match Lightbox
        scrollToItem(lbIndex);
      }, 300);
    }

    document.querySelectorAll("[data-close]").forEach(el => {
      el.addEventListener("click", closeLightbox);
    });

    if (lbPrev) lbPrev.addEventListener("click", () => slideLightbox(-1));
    if (lbNext) lbNext.addEventListener("click", () => slideLightbox(1));

    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") slideLightbox(-1);
      if (e.key === "ArrowRight") slideLightbox(1);
    });

    let touchStartX = 0;
    let touchEndX = 0;
    lightbox.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    lightbox.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) slideLightbox(1);
      if (touchEndX - touchStartX > 50) slideLightbox(-1);
    }, { passive: true });

    // Initial Nav State
    updateNav(0);
  }

  /* ---------- Ripple ---------- */
  function initRipple() {
    document.addEventListener(
      "pointerdown",
      (e) => {
        const btn = e.target.closest("[data-ripple]");
        if (!btn || !(btn instanceof HTMLElement)) return;
        if (e.button !== 0) return;
        const r = btn.getBoundingClientRect();
        const ripple = document.createElement("span");
        ripple.className = "ripple";
        const size = Math.max(r.width, r.height) * 1.4;
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - r.left - size / 2}px`;
        ripple.style.top = `${e.clientY - r.top - size / 2}px`;
        btn.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
      },
      true
    );
  }

  /* ---------- Music ---------- */
  function initMusic() {
    const audio = document.getElementById("bgMusic");
    const toggle = document.getElementById("musicToggle");
    if (!audio || !toggle) return;

    toggle.addEventListener("click", async () => {
      const pressed = toggle.getAttribute("aria-pressed") === "true";
      if (pressed) {
        audio.pause();
        toggle.setAttribute("aria-pressed", "false");
      } else {
        try {
          await audio.play();
          toggle.setAttribute("aria-pressed", "true");
        } catch {
          toggle.setAttribute("aria-pressed", "false");
        }
      }
    });
  }

  /* ---------- Resize ---------- */
  function initResize() {
    window.addEventListener(
      "resize",
      () => {
        state.innerH = window.innerHeight;
        state.innerW = window.innerWidth;
        scheduleVisualUpdate();
      },
      { passive: true }
    );
    window.addEventListener("scroll", scheduleVisualUpdate, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scheduleVisualUpdate();
        if (state.cursorEnabled) state.cursor.active = true;
      } else if (state.cursorEnabled) {
        state.cursor.active = false;
      }
    });
  }

  /* ---------- Cover Page ---------- */
  function initCoverPage() {
    const coverCta = document.getElementById("coverCta");
    const coverPage = document.getElementById("coverPage");

    if (!coverCta || !coverPage) return;

    coverCta.addEventListener("click", () => {
      coverPage.classList.add("is-hidden");
      document.body.classList.remove("scroll-locked");

      const audio = document.getElementById("bgMusic");
      const toggle = document.getElementById("musicToggle");
      if (audio) {
        audio.play().catch(() => { });
        if (toggle) {
          toggle.setAttribute("aria-pressed", "true");
          toggle.classList.add("is-playing");
        }
      }

      window.setTimeout(() => {
        triggerHeroReveal(true);
      }, 300);

      window.setTimeout(() => {
        coverPage.style.display = "none";
      }, 1200);
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initFlags();
    initGuestName();
    initPreloader();
    initIO();
    initAnchorScroll();
    initHeroScrollCue();
    initParallaxObserver();
    initRSVP();
    initGiftCopy();
    initGiftConfirmation();
    initGallery();
    initRipple();
    initMusic();
    initCoverPage();
    initCursor();
    initCursorInteractions();
    initResize();

    tickCountdown();
    window.setInterval(tickCountdown, 1000);

    scheduleVisualUpdate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
