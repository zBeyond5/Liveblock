(function () {
  'use strict';

  // ==========================================
  // Integração com o Hub
  // ==========================================
  const HUB_INSTANCE_KEY = '_optimizer';
  const HUB_MODULE_ID = 'optimizer';

  // Sinaliza que está vivo para o heartbeat do Hub
  let alive = true;

  // Se já existe uma instância, mata antes de recriar
  if (window[HUB_INSTANCE_KEY] && typeof window[HUB_INSTANCE_KEY].kill === 'function') {
    window[HUB_INSTANCE_KEY].kill();
  }

  // ==========================================
  // Configurações
  // ==========================================
  const STORAGE_KEY = 'hb-antilag-settings';
  const settings = Object.assign(
    { liteMode: false, autoLite: true, panelVisible: true },
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  );

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  // ==========================================
  // Painel de FPS
  // ==========================================
  let panel, fpsEl, frameEl, liteBtn, autoLiteCheckbox;
  let lastTime = performance.now();
  let frames = 0;
  let lastFpsUpdate = lastTime;
  let currentFps = 60;
  let rafId = null;

  function createPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'hb-antilag-panel';
    panel.style.cssText = `
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 999999;
      background: rgba(0,0,0,0.8);
      color: #0f0;
      font: 12px/1.4 monospace;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: move;
      user-select: none;
      min-width: 160px;
      display: ${settings.panelVisible ? 'block' : 'none'};
    `;
    panel.innerHTML = `
      <div id="hb-fps">FPS: --</div>
      <div id="hb-frametime">Frame: -- ms</div>
      <button id="hb-toggle-lite" style="margin-top:4px;width:100%;cursor:pointer;background:#222;color:#0f0;border:1px solid #0f0;border-radius:3px;padding:2px 0;">Modo leve: ${settings.liteMode ? 'ON' : 'OFF'}</button>
      <label style="display:flex;align-items:center;gap:4px;margin-top:4px;font-size:11px;">
        <input type="checkbox" id="hb-auto-lite" ${settings.autoLite ? 'checked' : ''}/>
        Auto-ativar se FPS cair
      </label>
    `;

    if (document.body) {
      document.body.appendChild(panel);
    } else {
      // Aguarda o body existir
      const observer = new MutationObserver(() => {
        if (document.body) {
          document.body.appendChild(panel);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }

    fpsEl = panel.querySelector('#hb-fps');
    frameEl = panel.querySelector('#hb-frametime');
    liteBtn = panel.querySelector('#hb-toggle-lite');
    autoLiteCheckbox = panel.querySelector('#hb-auto-lite');

    // Eventos
    liteBtn.addEventListener('click', () => setLiteMode(!settings.liteMode));
    autoLiteCheckbox.addEventListener('change', (e) => {
      settings.autoLite = e.target.checked;
      saveSettings();
    });

    // Drag
    makeDraggable(panel);

    // Inicia loop de FPS
    rafId = requestAnimationFrame(fpsLoop);
  }

  function makeDraggable(el) {
    let dragging = false, offX = 0, offY = 0;
    el.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
      dragging = true;
      offX = e.clientX - el.offsetLeft;
      offY = e.clientY - el.offsetTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = (e.clientX - offX) + 'px';
      el.style.top = (e.clientY - offY) + 'px';
      el.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function fpsLoop(now) {
    if (!alive) return;
    frames++;
    const delta = now - lastTime;
    lastTime = now;

    if (now - lastFpsUpdate >= 500) {
      currentFps = Math.round((frames * 1000) / (now - lastFpsUpdate));
      if (fpsEl) {
        fpsEl.textContent = `FPS: ${currentFps}`;
        fpsEl.style.color = currentFps >= 50 ? '#0f0' : currentFps >= 30 ? '#ff0' : '#f33';
      }
      if (frameEl) {
        frameEl.textContent = `Frame: ${delta.toFixed(1)} ms`;
      }
      frames = 0;
      lastFpsUpdate = now;

      if (settings.autoLite && !settings.liteMode && currentFps < 25) {
        setLiteMode(true);
      }
    }
    rafId = requestAnimationFrame(fpsLoop);
  }

  // ==========================================
  // Modo Leve (Lite Mode)
  // ==========================================
  const liteStyle = document.createElement('style');
  liteStyle.id = 'hb-lite-style';
  liteStyle.textContent = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      box-shadow: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      text-shadow: none !important;
      background-attachment: initial !important;
    }
    img, canvas, video {
      image-rendering: optimizeSpeed !important;
    }
    * {
      will-change: auto !important;
    }
  `;

  function setLiteMode(on) {
    settings.liteMode = on;
    if (on) {
      if (!document.getElementById('hb-lite-style')) {
        document.head.appendChild(liteStyle);
      }
      if (liteBtn) liteBtn.textContent = 'Modo leve: ON';
    } else {
      const existing = document.getElementById('hb-lite-style');
      if (existing) existing.remove();
      if (liteBtn) liteBtn.textContent = 'Modo leve: OFF';
    }
    saveSettings();
  }

  // ==========================================
  // Otimizações de eventos
  // ==========================================
  const throttledEvents = new Map();

  function throttleEvent(type) {
    if (throttledEvents.has(type)) return;
    let ticking = false;
    const handler = function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { ticking = false; });
      }
    };
    throttledEvents.set(type, handler);
    window.addEventListener(type, handler, { capture: true, passive: true });
  }

  ['mousemove', 'scroll', 'wheel', 'touchmove', 'pointermove', 'resize'].forEach(throttleEvent);

  // ==========================================
  // Otimização de Canvas
  // ==========================================
  function optimizeCanvas(c) {
    try {
      const ctx = c.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    } catch (e) { /* WebGL, ignora */ }
  }

  let canvasObserver = null;

  function startCanvasObserver() {
    if (canvasObserver) return;
    document.querySelectorAll('canvas').forEach(optimizeCanvas);
    canvasObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'CANVAS') optimizeCanvas(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('canvas').forEach(optimizeCanvas);
          }
        });
      }
    });
    if (document.body) {
      canvasObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ==========================================
  // Visibilidade da página
  // ==========================================
  function onVisibilityChange() {
    if (document.hidden) {
      if (!settings.liteMode) {
        setLiteMode(true);
      }
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ==========================================
  // Tecla de atalho para toggle do painel
  // ==========================================
  function onKeyDown(e) {
    // Alt+Shift+O = toggle painel
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      settings.panelVisible = !settings.panelVisible;
      if (panel) {
        panel.style.display = settings.panelVisible ? 'block' : 'none';
      }
      saveSettings();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // ==========================================
  // Inicialização
  // ==========================================
  function init() {
    createPanel();
    startCanvasObserver();
    if (settings.liteMode) {
      setLiteMode(true);
    }
  }

  // Aguarda o body se necessário
  if (document.body) {
    init();
  } else {
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        init();
        bodyObserver.disconnect();
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
  }

  // ==========================================
  // API para o Hub (kill, isAlive)
  // ==========================================
  function kill() {
    alive = false;

    // Para o loop de FPS
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // Remove listeners de eventos throttled
    throttledEvents.forEach((handler, type) => {
      window.removeEventListener(type, handler, { capture: true });
    });
    throttledEvents.clear();

    // Remove observer de canvas
    if (canvasObserver) {
      canvasObserver.disconnect();
      canvasObserver = null;
    }

    // Remove listeners
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('keydown', onKeyDown);

    // Remove estilos
    const existingStyle = document.getElementById('hb-lite-style');
    if (existingStyle) existingStyle.remove();

    // Remove painel
    if (panel && panel.parentNode) {
      panel.remove();
      panel = null;
    }

    // Limpa referências
    fpsEl = null;
    frameEl = null;
    liteBtn = null;
    autoLiteCheckbox = null;
  }

  function isAlive() {
    return alive;
  }

  // Expõe a instância para o Hub gerenciar
  window[HUB_INSTANCE_KEY] = {
    kill,
    isAlive,
    getFps: () => currentFps,
    getSettings: () => ({ ...settings }),
    setLiteMode,
    togglePanel: () => {
      settings.panelVisible = !settings.panelVisible;
      if (panel) panel.style.display = settings.panelVisible ? 'block' : 'none';
      saveSettings();
    }
  };

})();
