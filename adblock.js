(() => {
  if (window.__liveBlock?.destroy) window.__liveBlock.destroy();

  const STORAGE_KEY = "liveblock-config-v1";
  const ICON_URL = "https://habbo.city/habbo-imaging/walkgif?figure=hd-180-1.lg-3116-1198-92.ch-989999893-2023-1035.fa-990003751-2070.hr-802-39.sh-295-62.ea-990002655-64.cc-990002809-100&direction=2&head_direction=3&gesture=sml&action=wav&size=l";

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  })();

  const state = {
    enabled: saved.enabled ?? true,
    logsEnabled: saved.logsEnabled ?? true,
    removeDom: saved.removeDom ?? true,
    minimized: saved.minimized ?? false,
    activeTab: saved.activeTab ?? "controls",
    blockedFetch: 0,
    blockedXhr: 0,
    logs: [],
    startedAt: Date.now(),
    position: saved.position ?? null,
    patterns: [
      /securepubads/i,
      /doubleclick\.net/i,
      /googlesyndication/i,
      /googleads/i,
      /gampad\/ads/i,
      /\/ads\?/i,
      /ping\?e=1/i,
      /div-gpt-ad/i
    ]
  };

  const selectors = [
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "[id*='div-gpt-ad']",
    "[class*='banner']",
    "[id*='banner']",
    "[class*='advert']",
    "[id*='advert']",
    "[class*='promo']",
    "[id*='promo']"
  ].join(",");

  const match = (url) => state.patterns.some(rx => rx.test(String(url || "")));

  const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const saveState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: state.enabled,
        logsEnabled: state.logsEnabled,
        removeDom: state.removeDom,
        minimized: state.minimized,
        activeTab: state.activeTab,
        position: state.position
      }));
    } catch {}
  };

  let renderLogs = () => {};
  let renderStats = () => {};
  let showToast = () => {};

  const pushLog = (type, text, force = false) => {
    if (!state.logsEnabled && !force) return;
    const time = new Date().toLocaleTimeString();
    state.logs.unshift({ time, type, text });
    if (state.logs.length > 250) state.logs.length = 250;
    renderLogs();
    renderStats();
  };

  const removeAds = () => {
    if (!state.enabled || !state.removeDom) return;
    let count = 0;
    document.querySelectorAll(selectors).forEach((el) => {
      el.remove();
      count++;
    });
    if (count) {
      pushLog("DOM", `Removidos ${count} elemento(s)`);
      showToast(`${count} elemento(s) removido(s)`);
    }
  };

  const originalConsoleLog = console.log.bind(console);

  const NativeFetch = window.fetch;
  window.fetch = function (...args) {
    const url = args[0]?.url || args[0];
    if (state.enabled && match(url)) {
      state.blockedFetch++;
      pushLog("FETCH", String(url));
      originalConsoleLog("[liveblock] fetch bloqueado:", url);
      showToast("Fetch bloqueado");
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return NativeFetch.apply(this, args);
  };

  const NativeXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new NativeXHR();
    let blocked = false;
    let blockedUrl = "";

    const open = xhr.open;
    const send = xhr.send;

    xhr.open = function (method, url, ...rest) {
      blocked = state.enabled && match(url);
      blockedUrl = String(url || "");
      if (blocked) {
        state.blockedXhr++;
        pushLog("XHR", blockedUrl);
        originalConsoleLog("[liveblock] xhr bloqueado:", blockedUrl);
        showToast("XHR bloqueado");
        return;
      }
      return open.call(this, method, url, ...rest);
    };

    xhr.send = function (...args) {
      if (blocked) {
        setTimeout(() => {
          xhr.onreadystatechange && xhr.onreadystatechange();
          xhr.onload && xhr.onload();
          xhr.onloadend && xhr.onloadend();
        }, 0);
        return;
      }
      return send.apply(this, args);
    };

    return xhr;
  };

  const observer = new MutationObserver(removeAds);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const style = document.createElement("style");
  style.textContent = `
    @keyframes liveblock-pop {
      from { opacity: 0; transform: translateY(-8px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes liveblock-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(96,165,250,.25); }
      50% { box-shadow: 0 0 0 8px rgba(96,165,250,0); }
    }
    @keyframes liveblock-shimmer {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(120%); }
    }

    #liveblock-ui {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 390px;
      color: #e6eefc;
      background:
        radial-gradient(circle at top left, rgba(96,165,250,.18), transparent 32%),
        radial-gradient(circle at bottom right, rgba(52,211,153,.12), transparent 28%),
        linear-gradient(180deg, #0f172a 0%, #0a1020 100%);
      border: 1px solid rgba(148,163,184,.16);
      border-radius: 18px;
      z-index: 2147483647;
      overflow: hidden;
      user-select: none;
      backdrop-filter: blur(12px);
      box-shadow: 0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04);
      animation: liveblock-pop .24s ease-out;
    }

    #liveblock-ui * { box-sizing: border-box; }
    #liveblock-ui.minimized .lb-body { display: none; }

    #liveblock-ui .lb-header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 14px 12px;
      cursor: move;
      border-bottom: 1px solid rgba(148,163,184,.12);
      background: linear-gradient(90deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
      overflow: hidden;
    }

    #liveblock-ui .lb-header::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, transparent 25%, rgba(255,255,255,.08) 50%, transparent 75%);
      animation: liveblock-shimmer 3.8s linear infinite;
      pointer-events: none;
    }

    #liveblock-ui .lb-brand {
    display: flex;
    align-items: center;
    gap: 12px; 
    position: relative;
    z-index: 1;
    }

    #liveblock-ui .lb-icon {
    height: 58px;   /* aumenta a imagem */
    width: auto;    /* mantém proporção */
    max-width: 58px;
    object-fit: contain;
    display: block;
    flex-shrink: 0;
    transform: translateY(-6px);
    filter: drop-shadow(0 4px 10px rgba(0,0,0,.35));
    }

    #liveblock-ui .lb-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    #liveblock-ui .lb-title {
      font-weight: 900;
      letter-spacing: .2px;
      color: #f8fbff;
      text-shadow: 0 0 18px rgba(96,165,250,.18);
    }

    #liveblock-ui .lb-timer {
      color: #8fb3ff;
      font-size: 12px;
    }

    #liveblock-ui .lb-actions {
      display: flex;
      gap: 8px;
      position: relative;
      z-index: 1;
    }

    #liveblock-ui button {
      border: 0;
      border-radius: 11px;
      padding: 8px 10px;
      cursor: pointer;
      font: inherit;
      transition: transform .14s ease, opacity .14s ease, background .18s ease, box-shadow .18s ease;
    }

    #liveblock-ui button:hover { transform: translateY(-1px); }
    #liveblock-ui button:active { transform: translateY(0); }

    #liveblock-ui .mini-btn {
      background: rgba(30,41,59,.95);
      color: #dbe7ff;
      min-width: 34px;
      padding: 6px 10px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
    }

    #liveblock-ui .lb-body {
      padding: 12px;
      animation: liveblock-pop .18s ease-out;
    }

    #liveblock-ui .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      padding: 2px;
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(148,163,184,.1);
      border-radius: 14px;
    }

    #liveblock-ui .tab {
      flex: 1;
      background: transparent;
      color: #c9d8f1;
      font-weight: 800;
      border-radius: 10px;
    }

    #liveblock-ui .tab.active {
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      color: white;
      box-shadow: 0 8px 22px rgba(37,99,235,.28);
    }

    #liveblock-ui .panel { display: none; }
    #liveblock-ui .panel.active { display: block; }

    #liveblock-ui .stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 12px;
    }

    #liveblock-ui .stat {
      position: relative;
      overflow: hidden;
      background: linear-gradient(180deg, rgba(17,24,39,.9), rgba(15,23,42,.95));
      border: 1px solid rgba(148,163,184,.12);
      border-radius: 14px;
      padding: 12px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
    }

    #liveblock-ui .stat::before {
      content: "";
      position: absolute;
      top: -18px;
      right: -18px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(96,165,250,.09);
      filter: blur(2px);
    }

    #liveblock-ui .stat span {
      color: #95a8ca;
      font-size: 12px;
    }

    #liveblock-ui .stat strong {
      display: block;
      font-size: 22px;
      margin-top: 6px;
      color: #f8fbff;
    }

    #liveblock-ui .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 11px 0;
      border-top: 1px solid rgba(255,255,255,.05);
    }

    #liveblock-ui .row:first-child { border-top: 0; }

    #liveblock-ui .toggle {
      min-width: 100px;
      font-weight: 900;
      animation: liveblock-pulse 2.6s infinite;
    }

    #liveblock-ui .toggle.on {
      background: linear-gradient(135deg, #10b981, #34d399);
      color: #042318;
      box-shadow: 0 8px 18px rgba(16,185,129,.24);
    }

    #liveblock-ui .toggle.off {
      background: linear-gradient(135deg, #ef4444, #f87171);
      color: white;
      box-shadow: 0 8px 18px rgba(239,68,68,.22);
      animation: none;
    }

    #liveblock-ui .ghost {
      background: rgba(30,41,59,.92);
      color: #e5eefc;
      border: 1px solid rgba(148,163,184,.09);
    }

    #liveblock-ui .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    #liveblock-ui .actions button {
      flex: 1;
      font-weight: 800;
    }

    #liveblock-ui .logs {
      height: 320px;
      overflow: auto;
      background: linear-gradient(180deg, rgba(7,12,22,.95), rgba(10,16,27,.98));
      border: 1px solid rgba(148,163,184,.1);
      border-radius: 14px;
      padding: 8px;
      scrollbar-width: thin;
    }

    #liveblock-ui .log {
      padding: 9px 10px;
      border-radius: 12px;
      margin-bottom: 8px;
      background: rgba(17,24,39,.85);
      border: 1px solid rgba(148,163,184,.08);
      word-break: break-word;
      animation: liveblock-pop .16s ease-out;
    }

    #liveblock-ui .log small {
      display: block;
      color: #87a0c8;
      margin-bottom: 4px;
    }

    #liveblock-ui .log-type {
      display: inline-block;
      min-width: 60px;
      font-weight: 900;
      color: #7dd3fc;
    }

    #liveblock-ui .empty {
      color: #8aa0c3;
      text-align: center;
      padding: 30px 12px;
    }

    #liveblock-ui .lb-toast-wrap {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 12px;
      display: flex;
      justify-content: center;
      pointer-events: none;
      z-index: 20;
    }

    #liveblock-ui .lb-toast {
      opacity: 0;
      transform: translateY(10px);
      transition: opacity .2s ease, transform .2s ease;
      background: rgba(15,23,42,.96);
      color: #f8fbff;
      border: 1px solid rgba(148,163,184,.16);
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      max-width: 100%;
      text-align: center;
    }

    #liveblock-ui .lb-toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "liveblock-ui";
  root.innerHTML = `
    <div class="lb-header">
      <div class="lb-brand">
        <img class="lb-icon" src="${ICON_URL}" alt="icon">
        <div class="lb-title-wrap">
          <div class="lb-title">LiveBlock - [By Sang]</div>
          <div class="lb-timer" id="lb-timer">Ativo ha 00:00:00</div>
        </div>
      </div>
      <div class="lb-actions">
        <button class="mini-btn" id="lb-min">_</button>
        <button class="mini-btn" id="lb-close">x</button>
      </div>
    </div>
    <div class="lb-body">
      <div class="tabs">
        <button class="tab active" data-tab="controls">Controles</button>
        <button class="tab" data-tab="logs">Logs</button>
      </div>

      <div class="panel active" data-panel="controls">
        <div class="stats">
          <div class="stat"><span>Fetch bloqueado</span><strong id="lb-fetch">0</strong></div>
          <div class="stat"><span>XHR bloqueado</span><strong id="lb-xhr">0</strong></div>
        </div>

        <div class="row">
          <span>Status geral</span>
          <button class="toggle on" id="lb-enabled">Ativo</button>
        </div>
        <div class="row">
          <span>Logs</span>
          <button class="toggle on" id="lb-logs-enabled">Ligado</button>
        </div>
        <div class="row">
          <span>Limpeza DOM</span>
          <button class="toggle on" id="lb-dom-enabled">Ligado</button>
        </div>

        <div class="actions">
          <button class="ghost" id="lb-clean">Limpar agora</button>
          <button class="ghost" id="lb-clear-logs">Limpar logs</button>
        </div>
      </div>

      <div class="panel" data-panel="logs">
        <div class="logs" id="lb-logs"></div>
      </div>
    </div>

    <div class="lb-toast-wrap">
      <div class="lb-toast" id="lb-toast"></div>
    </div>
  `;
  document.body.appendChild(root);

  if (state.position) {
    root.style.left = state.position.left + "px";
    root.style.top = state.position.top + "px";
    root.style.right = "auto";
  }

  root.classList.toggle("minimized", state.minimized);

  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => Array.from(root.querySelectorAll(sel));

  let toastTimer = null;
  showToast = (message) => {
    const toast = $("#lb-toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  };

  renderStats = () => {
    $("#lb-fetch").textContent = String(state.blockedFetch);
    $("#lb-xhr").textContent = String(state.blockedXhr);
  };

  renderLogs = () => {
    const box = $("#lb-logs");
    if (!state.logs.length) {
      box.innerHTML = `<div class="empty">Sem logs ainda.</div>`;
      return;
    }
    box.innerHTML = state.logs.map(item => `
      <div class="log">
        <small>${item.time}</small>
        <div><span class="log-type">${item.type}</span> ${escapeHtml(item.text)}</div>
      </div>
    `).join("");
  };

  const setToggle = (button, on, onText = "Ligado", offText = "Desligado") => {
    button.textContent = on ? onText : offText;
    button.classList.toggle("on", on);
    button.classList.toggle("off", !on);
  };

  const renderControls = () => {
    setToggle($("#lb-enabled"), state.enabled, "Ativo", "Pausado");
    setToggle($("#lb-logs-enabled"), state.logsEnabled, "Ligado", "Desligado");
    setToggle($("#lb-dom-enabled"), state.removeDom, "Ligado", "Desligado");
    renderStats();
    saveState();
  };

  const renderTabs = () => {
    $$(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === state.activeTab));
    $$("[data-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === state.activeTab));
    saveState();
  };

  $("#lb-enabled").onclick = () => {
    state.enabled = !state.enabled;
    pushLog("STATE", `Bloqueio geral ${state.enabled ? "ativado" : "pausado"}`, true);
    showToast(state.enabled ? "Bloqueio ativado" : "Bloqueio pausado");
    renderControls();
  };

  $("#lb-logs-enabled").onclick = () => {
    state.logsEnabled = !state.logsEnabled;
    pushLog("STATE", `Logs ${state.logsEnabled ? "ativados" : "desativados"}`, true);
    showToast(state.logsEnabled ? "Logs ativados" : "Logs desativados");
    renderControls();
  };

  $("#lb-dom-enabled").onclick = () => {
    state.removeDom = !state.removeDom;
    pushLog("STATE", `Limpeza DOM ${state.removeDom ? "ativada" : "desativada"}`, true);
    showToast(state.removeDom ? "Limpeza DOM ativada" : "Limpeza DOM desativada");
    renderControls();
  };

  $("#lb-clean").onclick = () => {
    pushLog("ACTION", "Limpeza manual executada", true);
    showToast("Limpeza manual executada");
    removeAds();
  };

  $("#lb-clear-logs").onclick = () => {
    state.logs = [];
    renderLogs();
    pushLog("STATE", "Logs limpos", true);
    showToast("Logs limpos");
  };

  $("#lb-min").onclick = () => {
    state.minimized = !state.minimized;
    root.classList.toggle("minimized", state.minimized);
    saveState();
    pushLog("STATE", `Janela ${state.minimized ? "minimizada" : "restaurada"}`, true);
  };

  $("#lb-close").onclick = () => destroy();

  $$(".tab").forEach(btn => {
    btn.onclick = () => {
      state.activeTab = btn.dataset.tab;
      renderTabs();
    };
  });

  let drag = null;
  $(".lb-header").addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    const rect = root.getBoundingClientRect();
    drag = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    root.style.left = rect.left + "px";
    root.style.top = rect.top + "px";
    root.style.right = "auto";
  });

  const onMove = (e) => {
    if (!drag) return;
    const left = Math.max(0, e.clientX - drag.x);
    const top = Math.max(0, e.clientY - drag.y);
    root.style.left = left + "px";
    root.style.top = top + "px";
    state.position = { left, top };
  };

  const onUp = () => {
    if (drag) saveState();
    drag = null;
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);

  root.addEventListener("dblclick", (e) => {
    if (!e.target.closest(".lb-header")) return;
    state.minimized = !state.minimized;
    root.classList.toggle("minimized", state.minimized);
    saveState();
    pushLog("STATE", `Janela ${state.minimized ? "minimizada" : "restaurada"}`, true);
  });

  const timer = setInterval(() => {
    $("#lb-timer").textContent = `Ativo ha ${fmtTime(Date.now() - state.startedAt)}`;
  }, 1000);

  function destroy() {
    clearInterval(timer);
    clearTimeout(toastTimer);
    observer.disconnect();
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    root.remove();
    style.remove();
    window.__liveBlock = null;
  }

  window.__liveBlock = { state, root, destroy, removeAds, pushLog };

  renderControls();
  renderTabs();
  renderLogs();
  renderStats();
  removeAds();
  pushLog("UI", "Painel carregado", true);
  showToast("Painel carregado");
})();
