// ==UserScript==
// @name         LiveBooster [by SANG]
// @namespace    livebooster-sang
// @version      5.0.0
// @description  Otimizador de performance
// @match        *://*.habblive.in/*
// @match        *://habblive.in/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const INSTANCE_KEY = '_liveBooster';
  const STORAGE_KEY = 'livebooster-settings';
  let alive = true;

  // Reinjeção
  if (window[INSTANCE_KEY]?.kill) {
    try { window[INSTANCE_KEY].kill(); } catch (e) { /* instância anterior corrompida, ignora */ }
  }

  // ==========================================================
  // Configurações
  // ==========================================================
  const DEFAULTS = {
    liteMode: false,
    autoLite: true,
    panelVisible: true,
    panelMini: false,
    panelPos: null,
    upscaleEnabled: false,
    upscaleFactor: 0.5,
    accentColor: '#00f0ff',
    gpuBoost: true,
    force120Fps: true
  };

  const TYPE_VALIDATORS = {
    liteMode: v => typeof v === 'boolean',
    autoLite: v => typeof v === 'boolean',
    panelVisible: v => typeof v === 'boolean',
    panelMini: v => typeof v === 'boolean',
    panelPos: v => v === null || (typeof v === 'object' && Number.isFinite(v.left) && Number.isFinite(v.top)),
    upscaleEnabled: v => typeof v === 'boolean',
    upscaleFactor: v => typeof v === 'number' && v > 0 && v <= 1,
    accentColor: v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v),
    gpuBoost: v => typeof v === 'boolean',
    force120Fps: v => typeof v === 'boolean'
  };

  function loadSettings() {
    const merged = { ...DEFAULTS };
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      console.warn('[LiveBooster] settings corrompidas no localStorage, usando padrões.');
      stored = {};
    }
    for (const key of Object.keys(DEFAULTS)) {
      if (key in stored && TYPE_VALIDATORS[key](stored[key])) {
        merged[key] = stored[key];
      }
    }
    return merged;
  }

  const settings = loadSettings();

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { console.warn('[LiveBooster] falha ao salvar settings:', e); }
  }

  // ==========================================================
  // GPU Boost
  // ==========================================================
  const GpuBoost = {
    originalGetContext: null,
    observer: null,
    boostedCanvases: new WeakSet(),

    apply() {
      if (!this.originalGetContext) {
        this.originalGetContext = HTMLCanvasElement.prototype.getContext;
      }
      const original = this.originalGetContext;

      HTMLCanvasElement.prototype.getContext = function (type, opts) {
        let newOpts = opts;
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
          newOpts = Object.assign({}, opts || {}, { powerPreference: 'high-performance' });
        }
        return original.call(this, type, newOpts);
      };

      this.boostMainCanvas();

      this.observer = new MutationObserver(() => this.boostMainCanvas());
      if (document.body) {
        this.observer.observe(document.body, { childList: true, subtree: true });
      }
    },

    boostMainCanvas() {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      if (!canvases.length) return;
      const main = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      if (this.boostedCanvases.has(main)) return;

      // Remove boost de qualquer canvas antigo que não seja mais o principal
      canvases.forEach(c => {
        if (c !== main && this.boostedCanvases.has(c)) {
          this.unboostCanvas(c);
        }
      });

      main.style.transform = 'translateZ(0)';
      main.style.willChange = 'transform';
      main.style.backfaceVisibility = 'hidden';
      this.boostedCanvases.add(main);
    },

    unboostCanvas(canvas) {
      canvas.style.removeProperty('transform');
      canvas.style.removeProperty('will-change');
      canvas.style.removeProperty('backface-visibility');
      this.boostedCanvases.delete(canvas);
    },

    remove() {
      if (this.originalGetContext) {
        HTMLCanvasElement.prototype.getContext = this.originalGetContext;
        this.originalGetContext = null;
      }
      document.querySelectorAll('canvas').forEach(c => {
        if (this.boostedCanvases.has(c)) this.unboostCanvas(c);
      });
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
    }
  };

  // ==========================================================
  // Force FPS Manager
  // ==========================================================
  const FPSManager = {
    timeoutId: null,
    forced: false,
    attempt: 0,
    delays: [1000, 2000, 3000, 5000, 8000, 13000, 20000], // backoff, depois para

    start() {
      if (this.timeoutId || this.forced) return;
      this.attempt = 0;
      this.scheduleNext();
    },

    stop() {
      if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; }
      this.forced = false;
    },

    scheduleNext() {
      if (this.attempt >= this.delays.length) {
        console.warn('[LiveBooster] Não foi possível localizar um controle de FPS. Ajuste manual pode ser necessário.');
        return;
      }
      const delay = this.delays[this.attempt++];
      this.timeoutId = setTimeout(() => this.tryForce(), delay);
    },

    tryForce() {
      if (this.forced) return;
      if (this.tryElements() || this.tryLocalStorage() || this.tryGlobalObjects()) {
        this.markForced();
        return;
      }
      this.scheduleNext();
    },

    tryElements() {
      const candidates = document.querySelectorAll(
        'select, input[type="range"], input[type="number"], button, [role="button"]'
      );
      for (const el of candidates) {
        if (this.trySetElement(el)) return true;
      }
      return false;
    },

    trySetElement(el) {
      try {
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || '').trim();
        const looksLikeFps = /\bfps\b|frame\s*rate/i.test(text) ||
                              /\bfps\b|frame\s*rate/i.test(el.id || '') ||
                              /\bfps\b|frame\s*rate/i.test(el.className || '');
        if (!looksLikeFps) return false;

        if (tag === 'select') {
          const options = Array.from(el.options);
          const target = options.find(opt => /\b120\b/.test(opt.textContent) || opt.value === '120');
          if (target && el.value !== target.value) {
            el.value = target.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return !!target;
        }

        if (tag === 'input' && (el.type === 'range' || el.type === 'number')) {
          const max = parseFloat(el.max);
          const val = parseFloat(el.value);
          if (!isNaN(max) && max >= 120 && val < 120) {
            el.value = '120';
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
          return false;
        }

        if ((tag === 'button' || el.getAttribute('role') === 'button') && /\b120\b/.test(text)) {
          el.click();
          return true;
        }
      } catch (e) { /* elemento hostil/inacessível, ignora */ }
      return false;
    },

    tryLocalStorage() {
      const KEY_RE = /\bfps\b|frame.?rate/i;
      const PROP_RE = /\bfps\b|frame.?rate|frame.?cap|frame.?limit/i;

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !KEY_RE.test(key)) continue;
          const raw = localStorage.getItem(key);

          try {
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
              let changed = false;
              for (const prop of Object.keys(obj)) {
                if (PROP_RE.test(prop) && this.isPlausibleFpsValue(obj[prop])) {
                  obj[prop] = 120;
                  changed = true;
                }
              }
              if (changed) {
                localStorage.setItem(key, JSON.stringify(obj));
                return true;
              }
            }
          } catch {
            if (this.isPlausibleFpsValue(raw) && raw !== '120') {
              localStorage.setItem(key, '120');
              return true;
            }
          }
        }
      } catch (e) { console.warn('[LiveBooster] erro ao acessar localStorage:', e); }
      return false;
    },

    isPlausibleFpsValue(v) {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 && n <= 300;
    },

    tryGlobalObjects() {
      const roots = [window.game, window.app, window.config, window.settings, window.gameConfig];
      const props = ['fps', 'frameRate', 'maxFps', 'targetFps', 'fpsCap', 'frameLimit'];
      for (const obj of roots) {
        if (!obj || typeof obj !== 'object') continue;
        for (const prop of props) {
          try {
            if (prop in obj && this.isPlausibleFpsValue(obj[prop])) {
              obj[prop] = 120;
              return true;
            }
          } catch (e) { /* getter/setter hostil, ignora */ }
        }
      }
      return false;
    },

    markForced() {
      this.forced = true;
      if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; }
      console.log('[LiveBooster] Configuração de FPS aplicada.');
    }
  };

  // ==========================================================
  // Upscaling
  // ==========================================================
  const Upscale = {
    observer: null,
    originalData: new WeakMap(),
    remapRegistry: new WeakMap(), // canvas -> { addEventListener, removeEventListener, map }

    createRemappedEvent(e, scaleX, scaleY) {
      const COORD_PROPS_X = ['clientX', 'pageX', 'screenX', 'offsetX'];
      const COORD_PROPS_Y = ['clientY', 'pageY', 'screenY', 'offsetY'];
      return new Proxy(e, {
        get(target, prop) {
          if (COORD_PROPS_X.includes(prop) && typeof target[prop] === 'number') {
            return target[prop] * scaleX;
          }
          if (COORD_PROPS_Y.includes(prop) && typeof target[prop] === 'number') {
            return target[prop] * scaleY;
          }
          if (prop === 'deltaY' && typeof target.deltaY === 'number') {
            return target.deltaY * scaleY;
          }
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    },

    applyToCanvas(canvas) {
      if (!canvas || this.originalData.has(canvas)) return;
      if (canvas.width <= 100 || canvas.height <= 100) return;

      const origWidth = canvas.width, origHeight = canvas.height;
      const nw = Math.max(1, Math.floor(origWidth * settings.upscaleFactor));
      const nh = Math.max(1, Math.floor(origHeight * settings.upscaleFactor));

      this.originalData.set(canvas, {
        w: origWidth, h: origHeight,
        sw: canvas.style.width || '', sh: canvas.style.height || ''
      });

      const scaleX = origWidth / nw;
      const scaleY = origHeight / nh;
      const origAEL = canvas.addEventListener.bind(canvas);
      const origREL = canvas.removeEventListener.bind(canvas);
      const remapped = new Map();
      const REMAP_TYPES = new Set([
        'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel',
        'pointerdown', 'pointerup', 'pointermove'
      ]);

      canvas.addEventListener = function (type, listener, options) {
        if (REMAP_TYPES.has(type) && typeof listener === 'function') {
          const wrapped = (e) => listener.call(canvas, Upscale.createRemappedEvent(e, scaleX, scaleY));
          remapped.set(listener, wrapped);
          origAEL(type, wrapped, options);
        } else {
          origAEL(type, listener, options);
        }
      };
      canvas.removeEventListener = function (type, listener, options) {
        if (remapped.has(listener)) {
          origREL(type, remapped.get(listener), options);
          remapped.delete(listener);
        } else {
          origREL(type, listener, options);
        }
      };

      this.remapRegistry.set(canvas, { addEventListener: origAEL, removeEventListener: origREL, map: remapped });

      canvas.width = nw;
      canvas.height = nh;
      canvas.style.width = origWidth + 'px';
      canvas.style.height = origHeight + 'px';
      canvas.style.imageRendering = 'pixelated';
    },

    removeFromCanvas(canvas) {
      const data = this.originalData.get(canvas);
      if (!data) return;

      const remap = this.remapRegistry.get(canvas);
      if (remap) {
        canvas.addEventListener = remap.addEventListener;
        canvas.removeEventListener = remap.removeEventListener;
        this.remapRegistry.delete(canvas);
      }

      canvas.width = data.w;
      canvas.height = data.h;
      data.sw ? (canvas.style.width = data.sw) : canvas.style.removeProperty('width');
      data.sh ? (canvas.style.height = data.sh) : canvas.style.removeProperty('height');
      canvas.style.removeProperty('image-rendering');
      this.originalData.delete(canvas);
    },

    scanAll() {
      document.querySelectorAll('canvas').forEach(c => this.applyToCanvas(c));
    },

    trackedCanvases: new Set(),

    startObserver() {
      if (this.observer) return;
      this.observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          m.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (node.tagName === 'CANVAS') this.applyToCanvas(node);
            if (node.querySelectorAll) node.querySelectorAll('canvas').forEach(c => this.applyToCanvas(c));
          });
        }
      });
      if (document.body) this.observer.observe(document.body, { childList: true, subtree: true });
    },

    stopObserver() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
    },

    removeAll() {
      document.querySelectorAll('canvas').forEach(c => {
        if (this.originalData.has(c)) this.removeFromCanvas(c);
      });
    },

    setEnabled(on) {
      settings.upscaleEnabled = on;
      if (on) { this.scanAll(); this.startObserver(); }
      else { this.removeAll(); this.stopObserver(); }
      saveSettings();
    },

    changeFactor(factor) {
      settings.upscaleFactor = factor;
      if (settings.upscaleEnabled) { this.removeAll(); this.scanAll(); }
      saveSettings();
    }
  };

  // ==========================================================
  // Lite Mode
  // ==========================================================
  const LiteMode = {
    styleEl: null,

    ensureStyle() {
      if (this.styleEl) return this.styleEl;
      const el = document.createElement('style');
      el.id = 'lb-lite-style';
      el.textContent = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          box-shadow: none !important;
          filter: none !important;
          backdrop-filter: none !important;
          text-shadow: none !important;
          background-attachment: initial !important;
        }
        img, canvas, video { image-rendering: optimizeSpeed !important; }
        *:not(#lb-panel):not(#lb-panel *) { will-change: auto !important; }
      `;
      this.styleEl = el;
      return el;
    },

    set(on) {
      settings.liteMode = on;
      if (on) {
        if (!document.getElementById('lb-lite-style')) document.head.appendChild(this.ensureStyle());
      } else {
        const el = document.getElementById('lb-lite-style');
        if (el) el.remove();
      }
      saveSettings();
      UI.syncFromSettings();
    }
  };

  // ==========================================================
  // Otimização de canvas
  // ==========================================================
  function optimizeCanvas(c) {
    try {
      const ctx = c.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    } catch (e) { /* contexto pode já estar em uso por webgl, ignora */ }
  }

  let canvasObserver = null;
  function startCanvasObserver() {
    if (canvasObserver) return;
    document.querySelectorAll('canvas').forEach(c => {
      optimizeCanvas(c);
      if (settings.upscaleEnabled) Upscale.applyToCanvas(c);
    });
    canvasObserver = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'CANVAS') {
            optimizeCanvas(node);
            if (settings.upscaleEnabled) Upscale.applyToCanvas(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('canvas').forEach(c => {
              optimizeCanvas(c);
              if (settings.upscaleEnabled) Upscale.applyToCanvas(c);
            });
          }
        });
      }
    });
    if (document.body) canvasObserver.observe(document.body, { childList: true, subtree: true });
  }
  function stopCanvasObserver() {
    if (canvasObserver) { canvasObserver.disconnect(); canvasObserver = null; }
  }

  const throttledEvents = new Map();
  function throttleEvent(type) {
    if (throttledEvents.has(type)) return;
    let ticking = false;
    const handler = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; }); }
    };
    throttledEvents.set(type, handler);
    window.addEventListener(type, handler, { capture: true, passive: true });
  }
  function stopThrottling() {
    throttledEvents.forEach((h, t) => window.removeEventListener(t, h, { capture: true }));
    throttledEvents.clear();
  }

  // ==========================================================
  // Loop de medição de FPS
  // ==========================================================
  let rafId = null;
  let lastTime = performance.now(), frames = 0, lastFpsUpdate = lastTime;
  let currentFps = 60, lastFrameTime = 16.67;

  function fpsLoop(now) {
    if (!alive) return;
    frames++;
    lastFrameTime = now - lastTime;
    lastTime = now;

    if (now - lastFpsUpdate >= 500) {
      currentFps = Math.round((frames * 1000) / (now - lastFpsUpdate));
      frames = 0;
      lastFpsUpdate = now;
      UI.updateFps(currentFps, lastFrameTime);

      if (settings.autoLite && !settings.liteMode && currentFps < 25) {
        LiteMode.set(true);
      }
    }
    rafId = requestAnimationFrame(fpsLoop);
  }

  // ==========================================================
  // UI — LiveBooster [by SANG]
  // Construída com Shadow DOM (isolamento total de CSS do host,
  // sem depender de CDN externo — mais robusto e mais rápido).
  // ==========================================================
  const UI = {
    host: null,
    shadow: null,
    refs: {},

    build() {
      if (this.host) return;

      this.host = document.createElement('div');
      this.host.id = 'lb-panel';
      this.host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;';
      document.body.appendChild(this.host);

      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = this.template();
      this.cacheRefs();
      this.bindEvents();
      this.applyAccent(settings.accentColor);
      this.restorePosition();
      this.syncFromSettings();
      this.setVisible(settings.panelVisible);
      this.host.classList.toggle('lb-mini-mode', settings.panelMini);
    },

    template() {
      return `
        <style>${this.css()}</style>
        <div class="lb-card" part="card">
          <header class="lb-header" data-drag-handle>
            <span class="lb-logo">⚡</span>
            <div class="lb-title">
              <span class="lb-name">LiveBooster</span>
              <span class="lb-by">by SANG</span>
            </div>
            <button class="lb-collapse" data-action="collapse" title="Minimizar">–</button>
          </header>

          <div class="lb-body">
            <div class="lb-metrics">
              <div class="lb-ring-wrap">
                <svg class="lb-ring" viewBox="0 0 100 100">
                  <circle class="lb-ring-track" cx="50" cy="50" r="42"></circle>
                  <circle class="lb-ring-fill" cx="50" cy="50" r="42"></circle>
                </svg>
                <div class="lb-ring-label">
                  <span class="lb-fps-value" data-ref="fpsValue">--</span>
                  <span class="lb-fps-unit">FPS</span>
                </div>
              </div>
              <div class="lb-frametime" data-ref="frameTime">-- ms</div>
            </div>

            <nav class="lb-tabs">
              <button class="lb-tab active" data-tab="perf">Performance</button>
              <button class="lb-tab" data-tab="visual">Visual</button>
              <button class="lb-tab" data-tab="tema">Tema</button>
            </nav>

            <section class="lb-panel-tab active" data-panel="perf">
              ${this.rowToggle('force120Fps', 'Forçar 120 FPS', 'Tenta destravar o cap interno do jogo')}
              ${this.rowToggle('gpuBoost', 'GPU Boost', 'Prioriza GPU dedicada no canvas principal')}
              ${this.rowToggle('liteMode', 'Modo leve', 'Desativa efeitos visuais pesados')}
              ${this.rowToggle('autoLite', 'Auto modo leve', 'Ativa sozinho se o FPS cair abaixo de 25')}
            </section>

            <section class="lb-panel-tab" data-panel="visual">
              <div class="lb-row">
                <div class="lb-row-label">
                  <span class="lb-label-main">Upscaling</span>
                  <span class="lb-label-sub">Renderiza em resolução menor</span>
                </div>
                <div class="lb-row-controls">
                  <select class="lb-select" data-ref="upscaleFactor">
                    <option value="0.25">25%</option>
                    <option value="0.33">33%</option>
                    <option value="0.5">50%</option>
                    <option value="0.66">66%</option>
                    <option value="0.75">75%</option>
                  </select>
                  <label class="lb-switch">
                    <input type="checkbox" data-setting="upscaleEnabled">
                    <span class="lb-switch-track"></span>
                  </label>
                </div>
              </div>
            </section>

            <section class="lb-panel-tab" data-panel="tema">
              <div class="lb-row lb-row-column">
                <span class="lb-label-main">Cor de destaque</span>
                <div class="lb-swatches" data-ref="swatches">
                  ${['#00f0ff', '#a78bfa', '#34d399', '#fb7185', '#fbbf24'].map(c =>
                    `<button class="lb-swatch" style="--sw:${c}" data-color="${c}"></button>`
                  ).join('')}
                  <input type="color" class="lb-color-input" data-ref="colorInput" value="${settings.accentColor}">
                </div>
              </div>
            </section>
          </div>

          <footer class="lb-footer">
            <span>Alt+Shift+O para mostrar/ocultar</span>
          </footer>
        </div>

        <div class="lb-mini" data-ref="mini" title="Clique duas vezes para expandir">
          <span class="lb-mini-fps" data-ref="miniFps">--</span>
          <span class="lb-mini-unit">FPS</span>
        </div>
      `;
    },

    rowToggle(settingKey, label, sub) {
      return `
        <div class="lb-row">
          <div class="lb-row-label">
            <span class="lb-label-main">${label}</span>
            <span class="lb-label-sub">${sub}</span>
          </div>
          <label class="lb-switch">
            <input type="checkbox" data-setting="${settingKey}">
            <span class="lb-switch-track"></span>
          </label>
        </div>
      `;
    },

    css() {
      return `
        :host { all: initial; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        * { box-sizing: border-box; }

        .lb-card {
          width: 272px;
          border-radius: 16px;
          background: linear-gradient(165deg, rgba(10,12,20,0.94) 0%, rgba(16,18,30,0.92) 100%);
          border: 1px solid color-mix(in srgb, var(--lb-accent, #00f0ff) 22%, transparent);
          box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 24px color-mix(in srgb, var(--lb-accent, #00f0ff) 12%, transparent);
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
          color: #f4f6fb;
          overflow: hidden;
          transition: box-shadow .3s ease, border-color .3s ease;
          animation: lb-in .35s cubic-bezier(.16,1,.3,1);
        }
        @keyframes lb-in { from { opacity:0; transform: translateY(-8px) scale(.97); } to { opacity:1; transform:none; } }

        .lb-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 12px;
          cursor: move;
          user-select: none;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .lb-logo { font-size: 16px; filter: drop-shadow(0 0 6px var(--lb-accent, #00f0ff)); }
        .lb-title { display: flex; flex-direction: column; line-height: 1.1; flex: 1; }
        .lb-name { font-size: 13px; font-weight: 700; letter-spacing: .02em; }
        .lb-by { font-size: 9px; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,0.4); }
        .lb-collapse {
          all: unset; cursor: pointer; color: rgba(255,255,255,0.5);
          width: 20px; height: 20px; display:flex; align-items:center; justify-content:center;
          border-radius: 6px; font-size: 14px; line-height: 1;
        }
        .lb-collapse:hover { background: rgba(255,255,255,0.08); color: #fff; }

        .lb-body { padding: 14px 14px 4px; transition: max-height .25s ease, opacity .2s ease; }
        .lb-card.lb-collapsed .lb-body,
        .lb-card.lb-collapsed .lb-footer { display: none; }

        .lb-metrics { display: flex; flex-direction: column; align-items: center; padding-bottom: 10px; }
        .lb-ring-wrap { position: relative; width: 108px; height: 108px; }
        .lb-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
        .lb-ring-track { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 7; }
        .lb-ring-fill {
          fill: none; stroke: var(--lb-accent, #00f0ff); stroke-width: 7; stroke-linecap: round;
          stroke-dasharray: 264; stroke-dashoffset: 264;
          transition: stroke-dashoffset .4s ease, stroke .3s ease;
        }
        .lb-ring-label {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .lb-fps-value { font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
        .lb-fps-unit { font-size: 9px; letter-spacing: .1em; color: rgba(255,255,255,0.4); margin-top: -2px; }
        .lb-frametime { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 4px; }

        .lb-tabs { display: flex; gap: 4px; margin-bottom: 8px; background: rgba(255,255,255,0.04); border-radius: 10px; padding: 3px; }
        .lb-tab {
          all: unset; flex: 1; text-align: center; font-size: 11px; font-weight: 600;
          padding: 6px 0; border-radius: 8px; color: rgba(255,255,255,0.55); cursor: pointer;
          transition: background .2s ease, color .2s ease;
        }
        .lb-tab:hover { color: #fff; }
        .lb-tab.active { background: color-mix(in srgb, var(--lb-accent, #00f0ff) 18%, transparent); color: #fff; }

        .lb-panel-tab { display: none; padding-bottom: 8px; }
        .lb-panel-tab.active { display: block; }

        .lb-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 2px; gap: 10px;
        }
        .lb-row + .lb-row { border-top: 1px solid rgba(255,255,255,0.05); }
        .lb-row-column { flex-direction: column; align-items: stretch; gap: 8px; }
        .lb-row-label { display: flex; flex-direction: column; gap: 1px; }
        .lb-label-main { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); }
        .lb-label-sub { font-size: 10px; color: rgba(255,255,255,0.35); }
        .lb-row-controls { display: flex; align-items: center; gap: 8px; }

        .lb-switch { position: relative; width: 38px; height: 21px; display: inline-block; flex-shrink: 0; cursor: pointer; }
        .lb-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .lb-switch-track {
          position: absolute; inset: 0; border-radius: 999px; background: rgba(255,255,255,0.12);
          transition: background .2s ease;
        }
        .lb-switch-track::before {
          content: ''; position: absolute; width: 15px; height: 15px; left: 3px; top: 3px;
          border-radius: 50%; background: #fff; transition: transform .2s ease;
        }
        .lb-switch input:checked + .lb-switch-track { background: var(--lb-accent, #00f0ff); }
        .lb-switch input:checked + .lb-switch-track::before { transform: translateX(17px); }

        .lb-select {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: #fff; font-size: 11px; padding: 4px 6px; border-radius: 6px; outline: none;
        }
        .lb-select:hover { border-color: var(--lb-accent, #00f0ff); }

        .lb-swatches { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .lb-swatch {
          all: unset; width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
          background: var(--sw); border: 2px solid transparent; transition: transform .15s ease, border-color .15s ease;
        }
        .lb-swatch:hover { transform: scale(1.12); }
        .lb-swatch.active { border-color: #fff; }
        .lb-color-input {
          width: 28px; height: 22px; border: none; border-radius: 6px; background: none;
          cursor: pointer; padding: 0;
        }

        .lb-footer {
          padding: 8px 14px 10px; text-align: center; font-size: 9px;
          color: rgba(255,255,255,0.25); border-top: 1px solid rgba(255,255,255,0.05);
        }

        /* ---------- Modo mini (overlay estilo "in-game") ---------- */
        .lb-mini {
          display: none;
          align-items: baseline;
          gap: 4px;
          padding: 2px 4px;
          cursor: move;
          user-select: none;
          font-family: 'Consolas', 'SF Mono', 'Segoe UI', monospace;
          width: fit-content;
        }
        .lb-mini-fps {
          font-size: 15px;
          font-weight: 700;
          color: var(--lb-fps-color, #34d399);
          text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6);
        }
        .lb-mini-unit {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: .05em;
          color: rgba(255,255,255,0.65);
          text-shadow: 0 1px 2px rgba(0,0,0,0.9);
        }

        /* Quando minimizado: some o card, aparece só o overlay mini */
        :host(.lb-mini-mode) .lb-card { display: none; }
        :host(.lb-mini-mode) .lb-mini { display: flex; }
      `;
    },

    cacheRefs() {
      const s = this.shadow;
      this.refs.card = s.querySelector('.lb-card');
      this.refs.header = s.querySelector('.lb-header');
      this.refs.fpsValue = s.querySelector('[data-ref="fpsValue"]');
      this.refs.frameTime = s.querySelector('[data-ref="frameTime"]');
      this.refs.ringFill = s.querySelector('.lb-ring-fill');
      this.refs.collapseBtn = s.querySelector('[data-action="collapse"]');
      this.refs.tabs = Array.from(s.querySelectorAll('.lb-tab'));
      this.refs.panels = Array.from(s.querySelectorAll('.lb-panel-tab'));
      this.refs.toggles = Array.from(s.querySelectorAll('[data-setting]'));
      this.refs.upscaleFactor = s.querySelector('[data-ref="upscaleFactor"]');
      this.refs.swatches = Array.from(s.querySelectorAll('.lb-swatch'));
      this.refs.colorInput = s.querySelector('[data-ref="colorInput"]');
      this.refs.mini = s.querySelector('[data-ref="mini"]');
      this.refs.miniFps = s.querySelector('[data-ref="miniFps"]');
    },

    bindEvents() {
      // Tabs
      this.refs.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          this.refs.tabs.forEach(t => t.classList.remove('active'));
          this.refs.panels.forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          this.shadow.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
        });
      });

      // Toggles booleanos genéricos
      this.refs.toggles.forEach(input => {
        input.addEventListener('change', (e) => {
          const key = e.target.dataset.setting;
          this.onSettingToggle(key, e.target.checked);
        });
      });

      // Upscale factor
      this.refs.upscaleFactor.value = String(settings.upscaleFactor);
      this.refs.upscaleFactor.addEventListener('change', (e) => {
        Upscale.changeFactor(parseFloat(e.target.value));
      });

      // Cores
      this.refs.swatches.forEach(btn => {
        btn.addEventListener('click', () => this.setAccent(btn.dataset.color));
      });
      this.refs.colorInput.addEventListener('input', (e) => this.setAccent(e.target.value));

      // Collapse -> modo mini
      this.refs.collapseBtn.addEventListener('click', () => this.setMiniMode(true));
      this.refs.mini.addEventListener('dblclick', () => this.setMiniMode(false));

      // Drag
      this.attachDragHandle(this.refs.header);
      this.attachDragHandle(this.refs.mini);

      // Atalho global
      this._onKeyDown = (e) => {
        if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'o') {
          e.preventDefault();
          this.setVisible(!settings.panelVisible);
        }
      };
      document.addEventListener('keydown', this._onKeyDown);

      this._onVisibilityChange = () => {
        if (document.hidden && !settings.liteMode) LiteMode.set(true);
      };
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    },

    onSettingToggle(key, checked) {
      switch (key) {
        case 'force120Fps':
          settings.force120Fps = checked;
          checked ? FPSManager.start() : FPSManager.stop();
          saveSettings();
          break;
        case 'gpuBoost':
          settings.gpuBoost = checked;
          checked ? GpuBoost.apply() : GpuBoost.remove();
          saveSettings();
          break;
        case 'liteMode':
          LiteMode.set(checked);
          break;
        case 'autoLite':
          settings.autoLite = checked;
          saveSettings();
          break;
        case 'upscaleEnabled':
          Upscale.setEnabled(checked);
          break;
      }
    },

    setAccent(color) {
      settings.accentColor = color;
      this.applyAccent(color);
      saveSettings();
    },

    applyAccent(color) {
      if (this.host) this.host.style.setProperty('--lb-accent', color);
      this.refs.swatches?.forEach(sw => sw.classList.toggle('active', sw.dataset.color === color));
      if (this.refs.colorInput) this.refs.colorInput.value = color;
    },

    updateFps(fps, frameTime) {
      if (!this.refs.fpsValue) return;

      let color = '#34d399';
      if (fps < 25) color = '#fb7185';
      else if (fps < 50) color = '#fbbf24';

      // Painel completo (anel)
      this.refs.fpsValue.textContent = fps;
      this.refs.frameTime.textContent = frameTime.toFixed(1) + ' ms';
      this.refs.ringFill.style.stroke = color;
      this.refs.fpsValue.style.color = color;
      const pct = Math.min(1, fps / 60);
      this.refs.ringFill.style.strokeDashoffset = String(264 * (1 - pct));

      // Overlay mini (modo minimizado)
      if (this.refs.miniFps) {
        this.refs.miniFps.textContent = fps;
        this.refs.mini.style.setProperty('--lb-fps-color', color);
      }
    },

    syncFromSettings() {
      this.refs.toggles?.forEach(input => {
        const key = input.dataset.setting;
        if (key in settings) input.checked = settings[key];
      });
    },

    setVisible(visible) {
      settings.panelVisible = visible;
      if (this.host) this.host.style.display = visible ? 'block' : 'none';
      saveSettings();
    },

    restorePosition() {
      if (settings.panelPos && this.host) {
        this.host.style.left = settings.panelPos.left + 'px';
        this.host.style.top = settings.panelPos.top + 'px';
        this.host.style.right = 'auto';
      }
    },

    setMiniMode(on) {
      settings.panelMini = on;
      if (this.host) this.host.classList.toggle('lb-mini-mode', on);
      saveSettings();
    },

    attachDragHandle(handle) {
      const host = this.host;
      let dragging = false, moved = false, startX = 0, startY = 0;

      const onDown = (e) => {
        if (e.target.closest('button')) return;
        dragging = true;
        moved = false;
        const rect = host.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        moved = true;
        const left = e.clientX - startX;
        const top = e.clientY - startY;
        host.style.left = left + 'px';
        host.style.top = top + 'px';
        host.style.right = 'auto';
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        if (moved) {
          const rect = host.getBoundingClientRect();
          settings.panelPos = { left: rect.left, top: rect.top };
          saveSettings();
        }
      };

      handle.addEventListener('mousedown', onDown);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);

      if (!this._dragCleanups) this._dragCleanups = [];
      this._dragCleanups.push(() => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      });
    },

    destroy() {
      if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
      if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);
      if (this._dragCleanups) { this._dragCleanups.forEach(fn => fn()); this._dragCleanups = []; }
      if (this.host) { this.host.remove(); this.host = null; }
      this.shadow = null;
      this.refs = {};
    }
  };

  // ==========================================================
  // Inicialização
  // ==========================================================
  function init() {
    if (settings.gpuBoost) GpuBoost.apply();
    if (settings.force120Fps) FPSManager.start();

    rafId = requestAnimationFrame(fpsLoop);
    startCanvasObserver();
    ['mousemove', 'scroll', 'wheel', 'touchmove', 'pointermove', 'resize'].forEach(throttleEvent);

    if (settings.liteMode) LiteMode.set(true);
    if (settings.upscaleEnabled) { Upscale.scanAll(); Upscale.startObserver(); }

    UI.build();
  }

  if (document.body) {
    init();
  } else {
    const bootObserver = new MutationObserver(() => {
      if (document.body) { init(); bootObserver.disconnect(); }
    });
    bootObserver.observe(document.documentElement, { childList: true });
  }

  function kill() {
    alive = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    stopThrottling();
    stopCanvasObserver();
    Upscale.stopObserver();
    Upscale.removeAll();
    GpuBoost.remove();
    FPSManager.stop();

    const liteEl = document.getElementById('lb-lite-style');
    if (liteEl) liteEl.remove();

    UI.destroy();
  }

  function isAlive() { return alive; }

  window[INSTANCE_KEY] = {
    kill,
    isAlive,
    getState: () => ({ fps: currentFps, settings: { ...settings } }),
    setLiteMode: (on) => LiteMode.set(on),
    setUpscale: (on) => Upscale.setEnabled(on),
    togglePanel: () => UI.setVisible(!settings.panelVisible)
  };

})();
