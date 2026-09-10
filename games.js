// ==UserScript==
// @name         Games
// @namespace    devchris
// @version      9.1-module
// @description  Hub de jogos com lista puxada de um manifest no GitHub + jogos temporários locais; painel arrastável e scrollável; overlay arrastável/redimensionável (16:9); FAB arrastável após segurar o clique; detecta bloqueio de embed e cai pra nova aba. (módulo SangHub — instanceKey: _games)
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      github.com
// @connect      api.github.com
// @noframes
// ==/UserScript==
(function () {
  'use strict';

  if (window.__glLoaded) return;
  window.__glLoaded = true;

  // ---- Teardown (usado pelo kill do Hub) ----
  const teardownListeners = [];
  function onDoc(evento, handler) {
    document.addEventListener(evento, handler);
    teardownListeners.push(() => document.removeEventListener(evento, handler));
  }

  // ======= CONFIGURAÇÃO =======
  const MANIFEST_URL = 'https://raw.githubusercontent.com/zBeyond5/GamesHUB/refs/heads/main/TMGames/manifest.json';

  const TIMEOUT_DETECCAO_MS = 4000;
  const TIMEOUT_MANIFEST_MS = 8000;
  const LARGURA_MIN = 280;
  const ALTURA_MIN = 200;
  const RAZAO_16_9 = 16 / 9;
  const PAINEL_ALTURA_MAX_VH = 78; 
  const FAB_SEGURAR_MS = 200; 

  const PREFIXO_LOG = '[Game Launcher]';
  const GM_SINCRONO = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const GM_ASSINCRONO = typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function' && typeof GM.setValue === 'function';

  if (!GM_SINCRONO && !GM_ASSINCRONO) {
    console.warn(
      `${PREFIXO_LOG} GM_setValue/GM_getValue não disponíveis (verifique os @grant no gerenciador de userscripts). ` +
      `Usando localStorage como fallback — isso persiste só neste domínio.`
    );
  }

  // ================= ESTILO =================
  function injetarEstilos() {
    if (document.getElementById('gl-estilos')) return;
    const style = document.createElement('style');
    style.id = 'gl-estilos';
    style.textContent = `
:root {
  --gl-accent: #3b82f6;
  --gl-accent-2: #60a5fa;
  --gl-accent-glow: rgba(59, 130, 246, 0.55);
  --gl-bg: #0a0e17;
  --gl-bg-elevated: #101728;
  --gl-bg-card: #141d33;
  --gl-bg-card-hover: #182446;
  --gl-border: #22314f;
  --gl-border-soft: #1a2440;
  --gl-text: #e8ecf6;
  --gl-text-dim: #8a94ab;
  --gl-danger: #ef4444;
  --gl-danger-soft: rgba(239, 68, 68, 0.15);
  --gl-success: #22c55e;
  --gl-success-soft: rgba(34, 197, 94, 0.15);
  --gl-warn: #f59e0b;
  --gl-warn-soft: rgba(245, 158, 11, 0.12);
  --gl-radius: 12px;
  --gl-radius-sm: 8px;
  --gl-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
}
.gl-scope, .gl-scope * { box-sizing: border-box; font-family: var(--gl-font); }
.gl-scope { color: var(--gl-text); }

@keyframes gl-fade-in { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes gl-fade-in-center { from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@keyframes gl-pulse-ring {
  0%   { box-shadow: 0 0 0 0 var(--gl-accent-glow), 0 4px 18px rgba(0,0,0,0.5); }
  70%  { box-shadow: 0 0 0 10px rgba(59,130,246,0), 0 4px 18px rgba(0,0,0,0.5); }
  100% { box-shadow: 0 0 0 0 rgba(59,130,246,0), 0 4px 18px rgba(0,0,0,0.5); }
}
@keyframes gl-spin { to { transform: rotate(360deg); } }

.gl-fab {
  position: fixed; z-index: 999999; width: 56px; height: 56px; border-radius: 50%;
  background: linear-gradient(145deg, var(--gl-accent), #1d4ed8);
  border: 1px solid rgba(255,255,255,0.15);
  color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; user-select: none;
  animation: gl-pulse-ring 2.8s infinite;
  transition: transform 150ms ease, filter 150ms ease, box-shadow 150ms ease;
}
.gl-fab:hover { transform: scale(1.06); filter: brightness(1.1); }
.gl-fab.gl-fab-liberado {
  cursor: grab; box-shadow: 0 0 0 3px rgba(59,130,246,0.45), 0 4px 18px rgba(0,0,0,0.5);
  animation: none;
}
.gl-fab.gl-fab-arrastando { cursor: grabbing; transform: scale(0.97); animation: none; }
.gl-fab svg { width: 26px; height: 26px; pointer-events: none; }

.gl-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--gl-border); border-radius: var(--gl-radius-sm);
  background: var(--gl-bg-elevated); color: var(--gl-text);
  font-size: 12px; font-weight: 600; padding: 8px 12px; cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, transform 100ms ease, filter 150ms ease;
}
.gl-btn:hover { border-color: var(--gl-accent-2); filter: brightness(1.08); }
.gl-btn:active { transform: scale(0.97); }
.gl-btn:disabled { opacity: 0.5; cursor: default; transform: none; }
.gl-btn-primary { background: linear-gradient(145deg, var(--gl-accent), #1d4ed8); border-color: transparent; color: #fff; }
.gl-btn-danger { background: var(--gl-danger-soft); border-color: rgba(239,68,68,0.35); color: #fca5a5; }
.gl-btn-icon { padding: 7px; border-radius: var(--gl-radius-sm); }
.gl-btn-icon svg { width: 15px; height: 15px; }
.gl-btn-play { background: var(--gl-success-soft); border-color: rgba(34,197,94,0.4); color: #86efac; }

.gl-input {
  width: 100%; background: var(--gl-bg); color: var(--gl-text);
  border: 1px solid var(--gl-border); border-radius: var(--gl-radius-sm);
  padding: 9px 11px; font-size: 12.5px; outline: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.gl-input:focus { border-color: var(--gl-accent); box-shadow: 0 0 0 3px rgba(59,130,246,0.18); }
.gl-input::placeholder { color: var(--gl-text-dim); }

.gl-backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(5, 8, 15, 0.65); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.gl-card {
  width: 280px; background: var(--gl-bg-elevated); border: 1px solid var(--gl-border);
  border-radius: var(--gl-radius); padding: 18px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(59,130,246,0.08);
  animation: gl-fade-in 160ms ease;
}
.gl-card-title { font-size: 14px; font-weight: 700; letter-spacing: 0.2px; margin-bottom: 3px; display: flex; align-items: center; gap: 7px; }
.gl-card-title svg { width: 16px; height: 16px; color: var(--gl-accent-2); }
.gl-card-sub { font-size: 11px; color: var(--gl-text-dim); margin-bottom: 12px; line-height: 1.4; }
.gl-card-error { color: var(--gl-danger); font-size: 11px; min-height: 14px; margin: 2px 0 8px; }
.gl-card-row { display: flex; gap: 8px; margin-top: 4px; }
.gl-field { margin-bottom: 8px; }

.gl-panel {
  position: fixed; z-index: 2147483647;
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 360px; max-height: ${PAINEL_ALTURA_MAX_VH}vh; display: flex; flex-direction: column;
  background: var(--gl-bg-elevated); border: 1px solid var(--gl-border);
  border-radius: var(--gl-radius); overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.06);
  animation: gl-fade-in-center 180ms ease;
}
.gl-panel.gl-no-transform { transform: none; }
.gl-panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 13px 14px; background: var(--gl-bg-card);
  border-bottom: 1px solid var(--gl-border-soft); flex-shrink: 0;
  cursor: move; user-select: none;
}
.gl-panel-title { font-size: 13.5px; font-weight: 700; letter-spacing: 0.3px; display: flex; align-items: center; gap: 8px; pointer-events: none; }
.gl-panel-title svg { width: 17px; height: 17px; color: var(--gl-accent-2); }
.gl-panel-actions { display: flex; gap: 6px; }
.gl-spin { animation: gl-spin 800ms linear infinite; }

.gl-banner {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 9px 14px; font-size: 11px; color: #fcd34d; background: var(--gl-warn-soft);
  border-bottom: 1px solid var(--gl-border-soft); flex-shrink: 0;
}
.gl-banner svg { width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px; color: var(--gl-warn); }

.gl-list { overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0; padding: 10px; display: flex; flex-direction: column; gap: 7px; }
.gl-list::-webkit-scrollbar { width: 8px; }
.gl-list::-webkit-scrollbar-thumb { background: var(--gl-border); border-radius: 8px; }

.gl-empty { color: var(--gl-text-dim); font-size: 12px; padding: 30px 10px; text-align: center; line-height: 1.5; }

.gl-game-card {
  display: flex; align-items: center; gap: 10px; padding: 9px; border-radius: var(--gl-radius-sm);
  background: var(--gl-bg-card); border: 1px solid transparent;
  transition: background 150ms ease, border-color 150ms ease, transform 100ms ease;
}
.gl-game-card:hover { border-color: var(--gl-border); transform: translateY(-1px); }
.gl-thumb {
  width: 50px; height: 50px; flex-shrink: 0; border-radius: 10px;
  background: var(--gl-bg); display: flex; align-items: center; justify-content: center;
  overflow: hidden; color: var(--gl-accent-2); border: 1px solid var(--gl-border-soft);
  padding: 5px;
}
.gl-thumb img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
.gl-thumb svg { width: 20px; height: 20px; }
.gl-filtro-bar { display: flex; gap: 8px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--gl-border-soft); background: var(--gl-bg-elevated); flex-shrink: 0; }
.gl-select {
  flex: 1; background: var(--gl-bg); color: var(--gl-text); border: 1px solid var(--gl-border);
  border-radius: var(--gl-radius-sm); padding: 7px 9px; font-size: 12px; outline: none;
}
.gl-select:focus { border-color: var(--gl-accent); }
.gl-hover-info {
  position: fixed; z-index: 2147483647; max-width: 220px;
  background: var(--gl-bg-elevated); border: 1px solid var(--gl-border); border-radius: var(--gl-radius-sm);
  padding: 10px 12px; font-size: 11.5px; line-height: 1.6; color: var(--gl-text);
  box-shadow: 0 16px 40px rgba(0,0,0,0.55); pointer-events: none;
}
.gl-hover-info-title { font-weight: 700; font-size: 12.5px; margin-bottom: 5px; }
.gl-hover-info-row { display: flex; justify-content: space-between; gap: 12px; color: var(--gl-text-dim); }
.gl-hover-info-row span:last-child { color: var(--gl-text); text-align: right; }
.gl-game-info { flex: 1; min-width: 0; }
.gl-game-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gl-game-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; flex-wrap: wrap; }
.gl-badge {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase;
  padding: 2px 6px; border-radius: 5px; display: inline-flex; align-items: center; gap: 3px;
}
.gl-badge-ok { background: var(--gl-success-soft); color: #86efac; }
.gl-badge-bloqueado { background: var(--gl-danger-soft); color: #fca5a5; }
.gl-badge-neutro { background: rgba(148,163,184,0.15); color: #cbd5e1; }
.gl-tag { font-size: 9.5px; color: var(--gl-text-dim); }
.gl-game-actions { display: flex; gap: 6px; flex-shrink: 0; }

.gl-panel-footer { border-top: 1px solid var(--gl-border-soft); padding: 11px 12px; background: var(--gl-bg-card); flex-shrink: 0; }

.gl-overlay {
  position: fixed; z-index: 2147483647;
  background: var(--gl-bg); display: flex; flex-direction: column;
  border: 1px solid var(--gl-border); border-radius: var(--gl-radius); overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.06);
  transition: left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease, border-radius 180ms ease;
}
.gl-overlay.gl-no-transition { transition: none; }
.gl-overlay-bar {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--gl-bg-card); padding: 7px 8px 7px 12px;
  cursor: move; user-select: none; flex-shrink: 0; border-bottom: 1px solid var(--gl-border-soft);
}
.gl-overlay-title { font-size: 12px; font-weight: 600; color: var(--gl-text-dim); pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.gl-overlay-title svg { width: 13px; height: 13px; color: var(--gl-accent-2); flex-shrink: 0; }
.gl-overlay-controls { display: flex; gap: 4px; flex-shrink: 0; }
.gl-overlay-body { flex: 1; position: relative; min-height: 0; overflow: hidden; }
.gl-overlay-body iframe { width: 100%; height: 100%; border: none; display: block; }
.gl-resize-handle {
  position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; z-index: 10;
  cursor: nwse-resize;
}
.gl-resize-handle::after {
  content: ''; position: absolute; right: 4px; bottom: 4px; width: 9px; height: 9px;
  background: linear-gradient(135deg, transparent 50%, var(--gl-border) 50%);
  border-radius: 0 0 3px 0; transition: background 150ms ease;
}
.gl-resize-handle:hover::after { background: linear-gradient(135deg, transparent 50%, var(--gl-accent) 50%); }
.gl-dica {
  position: absolute; top: 44px; right: 8px; z-index: 20; max-width: 220px;
  background: var(--gl-bg-elevated); color: var(--gl-text); font-size: 11.5px; line-height: 1.4;
  padding: 9px 11px; border-radius: var(--gl-radius-sm); border: 1px solid var(--gl-border);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5); animation: gl-fade-in 150ms ease;
}
    `;
    document.head.appendChild(style);
  }

  // ================= ÍCONES =================
  function icone(nome, tamanho) {
    const t = tamanho || 18;
    const mapa = {
      gamepad: '<path d="M6 11h4M8 9v4"/><circle cx="16" cy="10.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12.5" r="0.6" fill="currentColor" stroke="none"/><rect x="2" y="7" width="20" height="10" rx="5"/>',
      fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
      play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
      voltar: '<path d="M15 18l-6-6 6-6"/>',
      somOn: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a9 9 0 0 1 0 12"/>',
      somOff: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>',
      minimizar: '<path d="M5 12h14"/>',
      maximizar: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
      restaurar: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
      atualizar: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>',
      mais: '<path d="M12 5v14M5 12h14"/>',
      lixeira: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
      alerta: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
      check: '<path d="M20 6 9 17l-5-5"/>',
      bloqueio: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      baixar: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
      relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    };
    return `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${mapa[nome] || ''}</svg>`;
  }

  // ---------- Storage (GM_* síncrona ou GM.* assíncrona, com backup em localStorage) ----------
  async function lerStorage(chave, padrao) {
    let bruto = null;
    try {
      if (GM_SINCRONO) bruto = GM_getValue(chave, null);
      else if (GM_ASSINCRONO) bruto = await GM.getValue(chave, null);
    } catch (e) {
      console.error(`${PREFIXO_LOG} erro ao ler "${chave}" via GM storage:`, e);
    }
    if (bruto === null || bruto === undefined) {
      try {
        bruto = localStorage.getItem('launcher-backup-' + chave) || localStorage.getItem(chave);
      } catch (e) { /* localStorage indisponível */ }
    }
    if (bruto === null || bruto === undefined) return padrao;
    try {
      return typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
    } catch (e) {
      console.error(`${PREFIXO_LOG} erro ao interpretar "${chave}":`, e, bruto);
      return padrao;
    }
  }

  async function salvarStorage(chave, valor) {
    const json = JSON.stringify(valor);
    try {
      if (GM_SINCRONO) GM_setValue(chave, json);
      else if (GM_ASSINCRONO) await GM.setValue(chave, json);
    } catch (e) {
      console.error(`${PREFIXO_LOG} erro ao salvar "${chave}" via GM storage:`, e);
    }
    try {
      localStorage.setItem('launcher-backup-' + chave, json);
    } catch (e) {
      console.error(`${PREFIXO_LOG} erro ao salvar backup de "${chave}" em localStorage:`, e);
    }
  }

  async function carregarConfigJanela() {
    const padrao = { x: null, y: null, w: 480, h: 360, maximizado: false };
    return { ...padrao, ...(await lerStorage('launcher-layout', padrao)) };
  }
  function salvarConfigJanela(cfg) {
    salvarStorage('launcher-layout', cfg);
  }

  async function carregarPosicaoFab() {
    return await lerStorage('launcher-fab-pos', null);
  }
  function salvarPosicaoFab(pos) {
    salvarStorage('launcher-fab-pos', pos);
  }

  async function carregarPosicaoPainel() {
    return await lerStorage('launcher-painel-pos', null); // { left, top } — null = centralizado
  }
  function salvarPosicaoPainel(pos) {
    salvarStorage('launcher-painel-pos', pos);
  }

  function gerarId(prefixo) {
    return (prefixo || 'g') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- Estatísticas de uso (tempo jogado, vezes jogado, última sessão) ----------
  async function carregarEstatisticas() {
    const dados = await lerStorage('launcher-estatisticas', {});
    return dados && typeof dados === 'object' ? dados : {};
  }
  function salvarEstatisticas(dados) {
    salvarStorage('launcher-estatisticas', dados);
  }
  async function registrarSessao(jogoId, duracaoMs) {
    if (!jogoId || !duracaoMs || duracaoMs < 3000) return; // ignora sessões muito curtas (clique acidental)
    const estatisticas = await carregarEstatisticas();
    const atual = estatisticas[jogoId] || { tempoJogadoMs: 0, vezesJogado: 0, ultimaSessaoEm: null };
    atual.tempoJogadoMs = (atual.tempoJogadoMs || 0) + duracaoMs;
    atual.vezesJogado = (atual.vezesJogado || 0) + 1;
    atual.ultimaSessaoEm = new Date().toISOString();
    estatisticas[jogoId] = atual;
    salvarEstatisticas(estatisticas);
  }
  function formatarDuracao(ms) {
    if (!ms || ms < 60000) return '< 1 min';
    const minutos = Math.floor(ms / 60000);
    const horas = Math.floor(minutos / 60);
    const minRestantes = minutos % 60;
    return horas > 0 ? `${horas}h ${minRestantes}min` : `${minutos}min`;
  }
  function formatarRelativo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `há ${diffHoras}h`;
    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias === 1) return 'ontem';
    if (diffDias < 30) return `há ${diffDias} dias`;
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  // ---------- Exportar manifest.json (jogos do manifest + temporários) ----------
  function paraSlug(texto) {
    return (
      (texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '') || 'jogo'
    );
  }
  async function exportarManifestArquivo() {
    const manifest = await carregarJogosManifest(false);
    const temporarios = await carregarJogosTemporarios();
    const jogosManifest = Array.isArray(manifest.jogos) ? manifest.jogos : [];
    const todos = [...jogosManifest, ...temporarios];

    const idsUsados = new Set();
    const exportado = todos.map((j) => {
      const base = paraSlug(j.nome);
      let id = base, contador = 2;
      while (idsUsados.has(id)) id = `${base}-${contador++}`;
      idsUsados.add(id);
      const obj = { id, nome: j.nome, url: j.url };
      if (j.imagem) obj.imagem = j.imagem;
      if (j.genero) obj.genero = j.genero;
      if (j.adicionadoEm) obj.adicionadoEm = j.adicionadoEm;
      return obj;
    });

    const json = JSON.stringify(exportado, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manifest.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- Manifest remoto (fonte principal da lista de jogos) ----------
  function buscarTexto(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: timeoutMs,
          onload: (res) => {
            clearTimeout(timer);
            if (res.status >= 200 && res.status < 300) resolve(res.responseText);
            else reject(new Error('status ' + res.status));
          },
          onerror: () => { clearTimeout(timer); reject(new Error('erro de rede')); },
          ontimeout: () => { clearTimeout(timer); reject(new Error('timeout')); },
        });
      } else {
        const controlador = new AbortController();
        const timer = setTimeout(() => controlador.abort(), timeoutMs);
        fetch(url, { signal: controlador.signal, cache: 'no-store' })
          .then((res) => {
            clearTimeout(timer);
            if (!res.ok) throw new Error('status ' + res.status);
            return res.text();
          })
          .then(resolve)
          .catch(reject);
      }
    });
  }

  function normalizarUrlManifest(url) {
    const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    return url;
  }

  function normalizarJogoManifest(item) {
    if (!item || typeof item.nome !== 'string' || typeof item.url !== 'string') return null;
    let url = item.url.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let imagem = typeof item.imagem === 'string' ? item.imagem.trim() : '';
    if (imagem && !/^https?:\/\//i.test(imagem)) imagem = 'https://' + imagem;
    const genero = typeof item.genero === 'string' && item.genero.trim() ? item.genero.trim() : null;
    const adicionadoEm = typeof item.adicionadoEm === 'string' && item.adicionadoEm.trim() ? item.adicionadoEm.trim() : null;
    return {
      id: typeof item.id === 'string' && item.id ? 'manifest-' + item.id : gerarId('manifest-'),
      nome: item.nome.trim(),
      url,
      imagem: imagem || null,
      genero,
      adicionadoEm,
      origem: 'manifest',
      status: 'nao-testado',
      ultimoTeste: null,
    };
  }

  // Busca o manifest no GitHub; em caso de falha usa o último cache salvo localmente.
  // Observação: entradas de "unity_games" no manifest não são suportadas por este
  // launcher (jogos WebGL exportados de engine costumam ter CORS restrito nos
  // assets e/ou exigir isolamento de origem que uma página de terceiros não tem),
  // então são ignoradas silenciosamente aqui.
  async function carregarJogosManifest(forcarAtualizacao) {
    const cacheBruto = await lerStorage('launcher-manifest-cache', { jogos: [], atualizadoEm: null, erro: null });
    const cache = { ...cacheBruto, jogos: Array.isArray(cacheBruto.jogos) ? cacheBruto.jogos : [] };
    if (!forcarAtualizacao && cache.jogos.length) {
      atualizarManifestEmSegundoPlano();
      return cache;
    }
    try {
      const url = normalizarUrlManifest(MANIFEST_URL);
      const texto = await buscarTexto(url, TIMEOUT_MANIFEST_MS);
      if (texto.trim().startsWith('<')) {
        throw new Error(
          'a URL devolveu HTML em vez de JSON — confira se MANIFEST_URL aponta pro link "raw" ' +
          '(raw.githubusercontent.com), e não pra página normal do arquivo no GitHub.'
        );
      }
      const bruto = JSON.parse(texto);
      const listaBruta = Array.isArray(bruto) ? bruto : Array.isArray(bruto.jogos) ? bruto.jogos : null;
      if (!listaBruta) throw new Error('formato inválido: esperava um array ou { "jogos": [...] }');
      const jogos = listaBruta.map(normalizarJogoManifest).filter(Boolean);
      const novoCache = { jogos, atualizadoEm: new Date().toISOString(), erro: null };
      salvarStorage('launcher-manifest-cache', novoCache);
      return novoCache;
    } catch (e) {
      console.error(`${PREFIXO_LOG} falha ao buscar manifest:`, e);
      const comErro = { ...cache, erro: String(e.message || e) };
      salvarStorage('launcher-manifest-cache', comErro);
      return comErro;
    }
  }

  let atualizandoEmSegundoPlano = false;
  function atualizarManifestEmSegundoPlano() {
    if (atualizandoEmSegundoPlano) return;
    atualizandoEmSegundoPlano = true;
    carregarJogosManifest(true).finally(() => { atualizandoEmSegundoPlano = false; });
  }

  // ---------- Jogos temporários (adicionados localmente, não vêm do manifest) ----------
  async function carregarJogosTemporarios() {
    const lista = await lerStorage('launcher-jogos-temporarios', []);
    return Array.isArray(lista) ? lista : [];
  }
  function salvarJogosTemporarios(lista) {
    salvarStorage('launcher-jogos-temporarios', lista);
  }

  function statusInfo(status) {
    if (status === 'ok') return { icone: 'check', classe: 'gl-badge-ok', texto: 'Funcionou' };
    if (status === 'bloqueado') return { icone: 'bloqueio', classe: 'gl-badge-bloqueado', texto: 'Bloqueado' };
    return { icone: null, classe: 'gl-badge-neutro', texto: 'Não testado' };
  }

  // ---------- Modal simples pra adicionar um jogo temporário ----------
  function abrirModalJogoTemporario(aoConfirmar) {
    if (document.getElementById('gl-temp-modal')) return;
    injetarEstilos();

    const fundo = document.createElement('div');
    fundo.id = 'gl-temp-modal';
    fundo.className = 'gl-scope gl-backdrop';

    const card = document.createElement('div');
    card.className = 'gl-card';

    const titulo = document.createElement('div');
    titulo.className = 'gl-card-title';
    titulo.innerHTML = `${icone('mais', 16)} Jogo temporário`;

    const legenda = document.createElement('div');
    legenda.className = 'gl-card-sub';
    legenda.textContent = 'Fica salvo só neste dispositivo, separado da lista do manifest.';

    const campoNome = document.createElement('div');
    campoNome.className = 'gl-field';
    const inputNome = document.createElement('input');
    inputNome.className = 'gl-input';
    inputNome.placeholder = 'Nome do jogo';
    campoNome.appendChild(inputNome);

    const campoUrl = document.createElement('div');
    campoUrl.className = 'gl-field';
    const inputUrl = document.createElement('input');
    inputUrl.className = 'gl-input';
    inputUrl.placeholder = 'https://...';
    campoUrl.appendChild(inputUrl);

    const campoImagem = document.createElement('div');
    campoImagem.className = 'gl-field';
    const inputImagem = document.createElement('input');
    inputImagem.className = 'gl-input';
    inputImagem.placeholder = 'URL da imagem (opcional)';
    campoImagem.appendChild(inputImagem);

    const campoGenero = document.createElement('div');
    campoGenero.className = 'gl-field';
    const inputGenero = document.createElement('input');
    inputGenero.className = 'gl-input';
    inputGenero.placeholder = 'Gênero (opcional) — ex: Corrida, RPG';
    campoGenero.appendChild(inputGenero);

    const erro = document.createElement('div');
    erro.className = 'gl-card-error';

    const linhaBotoes = document.createElement('div');
    linhaBotoes.className = 'gl-card-row';

    const confirmarBtn = document.createElement('button');
    confirmarBtn.className = 'gl-btn gl-btn-primary';
    confirmarBtn.style.flex = '1';
    confirmarBtn.textContent = 'Adicionar';

    const cancelarBtn = document.createElement('button');
    cancelarBtn.className = 'gl-btn';
    cancelarBtn.style.flex = '1';
    cancelarBtn.textContent = 'Cancelar';

    card.appendChild(titulo);
    card.appendChild(legenda);
    card.appendChild(campoNome);
    card.appendChild(campoUrl);
    card.appendChild(campoImagem);
    card.appendChild(campoGenero);
    card.appendChild(erro);
    linhaBotoes.appendChild(confirmarBtn);
    linhaBotoes.appendChild(cancelarBtn);
    card.appendChild(linhaBotoes);
    fundo.appendChild(card);
    document.body.appendChild(fundo);
    inputNome.focus();

    function fechar() {
      fundo.remove();
      document.removeEventListener('keydown', aoTeclar);
    }
    function aoTeclar(e) {
      if (e.key === 'Escape') fechar();
      if (e.key === 'Enter') confirmarBtn.click();
    }
    onDoc('keydown', aoTeclar);
    cancelarBtn.addEventListener('click', fechar);
    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });

    confirmarBtn.addEventListener('click', () => {
      const nome = inputNome.value.trim();
      let url = inputUrl.value.trim();
      if (!nome || !url) {
        erro.textContent = 'Preencha nome e URL.';
        return;
      }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      let imagem = inputImagem.value.trim();
      if (imagem && !/^https?:\/\//i.test(imagem)) imagem = 'https://' + imagem;
      const genero = inputGenero.value.trim();
      fechar();
      aoConfirmar({
        id: gerarId('temp-'),
        nome,
        url,
        imagem: imagem || null,
        genero: genero || null,
        adicionadoEm: new Date().toISOString(),
        origem: 'temporario',
        status: 'nao-testado',
        ultimoTeste: null,
      });
    });
  }

  // ---------- Painel de lista de jogos (arrastável, scrollável) ----------
  async function abrirPainelJogos() {
    if (document.getElementById('gl-painel')) return;
    injetarEstilos();

    const painel = document.createElement('div');
    painel.id = 'gl-painel';
    painel.className = 'gl-scope gl-panel';

    const posSalva = await carregarPosicaoPainel();
    if (posSalva && typeof posSalva.left === 'number' && typeof posSalva.top === 'number') {
      const left = Math.max(4, Math.min(posSalva.left, window.innerWidth - 40));
      const top = Math.max(4, Math.min(posSalva.top, window.innerHeight - 40));
      painel.classList.add('gl-no-transform');
      painel.style.left = left + 'px';
      painel.style.top = top + 'px';
    }

    const cabecalho = document.createElement('div');
    cabecalho.className = 'gl-panel-header';

    const titulo = document.createElement('span');
    titulo.className = 'gl-panel-title';
    titulo.innerHTML = `${icone('gamepad', 17)} Jogos`;

    const botoesCabecalho = document.createElement('div');
    botoesCabecalho.className = 'gl-panel-actions';

    const atualizarBtn = document.createElement('button');
    atualizarBtn.className = 'gl-btn gl-btn-icon';
    atualizarBtn.title = 'Atualizar lista do manifest';
    atualizarBtn.innerHTML = icone('atualizar', 15);
    atualizarBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    atualizarBtn.addEventListener('click', async () => {
      atualizarBtn.disabled = true;
      atualizarBtn.querySelector('svg').classList.add('gl-spin');
      await carregarJogosManifest(true);
      atualizarBtn.disabled = false;
      atualizarBtn.querySelector('svg').classList.remove('gl-spin');
      renderizarLista();
    });

    const baixarBtn = document.createElement('button');
    baixarBtn.className = 'gl-btn gl-btn-icon';
    baixarBtn.title = 'Baixar manifest.json (jogos do manifest + temporários)';
    baixarBtn.innerHTML = icone('baixar', 15);
    baixarBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    baixarBtn.addEventListener('click', () => exportarManifestArquivo());

    const fecharBtn = document.createElement('button');
    fecharBtn.className = 'gl-btn gl-btn-icon gl-btn-danger';
    fecharBtn.title = 'Fechar';
    fecharBtn.innerHTML = icone('fechar', 15);
    fecharBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    fecharBtn.addEventListener('click', fecharPainel);

    botoesCabecalho.appendChild(baixarBtn);
    botoesCabecalho.appendChild(atualizarBtn);
    botoesCabecalho.appendChild(fecharBtn);
    cabecalho.appendChild(titulo);
    cabecalho.appendChild(botoesCabecalho);

    const avisoManifest = document.createElement('div');
    avisoManifest.className = 'gl-banner';
    avisoManifest.style.display = 'none';

    const barraFiltro = document.createElement('div');
    barraFiltro.className = 'gl-filtro-bar';
    const seletorGenero = document.createElement('select');
    seletorGenero.className = 'gl-select';
    seletorGenero.addEventListener('mousedown', (e) => e.stopPropagation());
    seletorGenero.addEventListener('change', () => {
      generoSelecionado = seletorGenero.value;
      aplicarFiltroErenderizar();
    });
    barraFiltro.appendChild(seletorGenero);

    const lista = document.createElement('div');
    lista.className = 'gl-list';

    const rodape = document.createElement('div');
    rodape.className = 'gl-panel-footer';
    const addTempBtn = document.createElement('button');
    addTempBtn.className = 'gl-btn gl-btn-primary';
    addTempBtn.style.width = '100%';
    addTempBtn.innerHTML = `${icone('mais', 14)} Adicionar jogo temporário`;
    addTempBtn.addEventListener('click', () => {
      abrirModalJogoTemporario(async (novoJogo) => {
        const temporarios = await carregarJogosTemporarios();
        temporarios.push(novoJogo);
        salvarJogosTemporarios(temporarios);
        renderizarLista();
      });
    });
    rodape.appendChild(addTempBtn);

    painel.appendChild(cabecalho);
    painel.appendChild(avisoManifest);
    painel.appendChild(barraFiltro);
    painel.appendChild(lista);
    painel.appendChild(rodape);
    document.body.appendChild(painel);
    onDoc('keydown', aoTeclarEscPainel);

    // ---- arrastar o painel pela barra de cabeçalho ----
    let arrastandoPainel = false, offPX = 0, offPY = 0;
    cabecalho.addEventListener('mousedown', (e) => {
      if (e.target !== cabecalho && e.target !== titulo && !titulo.contains(e.target)) return;
      arrastandoPainel = true;
      const rect = painel.getBoundingClientRect();
      painel.classList.add('gl-no-transform');
      painel.style.left = rect.left + 'px';
      painel.style.top = rect.top + 'px';
      offPX = e.clientX - rect.left;
      offPY = e.clientY - rect.top;
      e.preventDefault();
    });
    function aoMoverPainel(e) {
      if (!arrastandoPainel) return;
      let novoX = e.clientX - offPX;
      let novoY = e.clientY - offPY;
      novoX = Math.max(4, Math.min(novoX, window.innerWidth - painel.offsetWidth - 4));
      novoY = Math.max(4, Math.min(novoY, window.innerHeight - painel.offsetHeight - 4));
      painel.style.left = novoX + 'px';
      painel.style.top = novoY + 'px';
    }
    function aoSoltarPainel() {
      if (!arrastandoPainel) return;
      arrastandoPainel = false;
      salvarPosicaoPainel({ left: parseInt(painel.style.left, 10), top: parseInt(painel.style.top, 10) });
    }
    window.addEventListener('mousemove', aoMoverPainel);
    window.addEventListener('mouseup', aoSoltarPainel);

    function aoTeclarEscPainel(e) {
      if (e.key === 'Escape') fecharPainel();
    }
    function fecharPainel() {
      esconderInfoHover();
      painel.remove();
      document.removeEventListener('keydown', aoTeclarEscPainel);
      window.removeEventListener('mousemove', aoMoverPainel);
      window.removeEventListener('mouseup', aoSoltarPainel);
    }

    let generoSelecionado = 'todos';
    let ultimaListaCombinada = [];
    let estatisticasCache = {};
    let elementoTooltip = null;

    function esconderInfoHover() {
      if (elementoTooltip) {
        elementoTooltip.remove();
        elementoTooltip = null;
      }
    }
    function mostrarInfoHover(card, jogo, estat) {
      esconderInfoHover();
      const tip = document.createElement('div');
      tip.className = 'gl-scope gl-hover-info';

      const titulo = document.createElement('div');
      titulo.className = 'gl-hover-info-title';
      titulo.textContent = jogo.nome;
      tip.appendChild(titulo);

      function linhaInfo(label, valor) {
        const row = document.createElement('div');
        row.className = 'gl-hover-info-row';
        const l = document.createElement('span');
        l.textContent = label;
        const v = document.createElement('span');
        v.textContent = valor;
        row.appendChild(l);
        row.appendChild(v);
        tip.appendChild(row);
      }
      if (jogo.genero) linhaInfo('Gênero', jogo.genero);
      linhaInfo('Tempo jogado', formatarDuracao(estat.tempoJogadoMs || 0));
      linhaInfo('Vezes jogado', String(estat.vezesJogado || 0));
      linhaInfo('Última vez', estat.ultimaSessaoEm ? formatarRelativo(estat.ultimaSessaoEm) : 'nunca');

      document.body.appendChild(tip);
      const rectCard = card.getBoundingClientRect();
      const rectTip = tip.getBoundingClientRect();
      let left = rectCard.right + 10;
      if (left + rectTip.width > window.innerWidth - 8) left = rectCard.left - rectTip.width - 10;
      left = Math.max(8, left);
      let top = rectCard.top;
      if (top + rectTip.height > window.innerHeight - 8) top = window.innerHeight - rectTip.height - 8;
      top = Math.max(8, top);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
      elementoTooltip = tip;
    }
    lista.addEventListener('scroll', esconderInfoHover);

    function popularFiltroGenero(jogos) {
      const generosUnicos = Array.from(
        new Set(jogos.map((j) => (j.genero || '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const valorAtual = seletorGenero.value || 'todos';
      seletorGenero.innerHTML = '';
      const optTodos = document.createElement('option');
      optTodos.value = 'todos';
      optTodos.textContent = 'Todos os gêneros';
      seletorGenero.appendChild(optTodos);
      generosUnicos.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        seletorGenero.appendChild(opt);
      });
      seletorGenero.value = generosUnicos.includes(valorAtual) || valorAtual === 'todos' ? valorAtual : 'todos';
      generoSelecionado = seletorGenero.value;
    }

    function miniaturaJogo(jogo) {
      const wrap = document.createElement('div');
      wrap.className = 'gl-thumb';
      if (jogo.imagem) {
        const img = document.createElement('img');
        img.src = jogo.imagem;
        img.alt = jogo.nome;
        img.addEventListener('error', () => {
          img.remove();
          wrap.innerHTML = icone('gamepad', 20);
        });
        wrap.appendChild(img);
      } else {
        wrap.innerHTML = icone('gamepad', 20);
      }
      return wrap;
    }

    function linhaJogo(jogo, permiteRemover, estat) {
      const linha = document.createElement('div');
      linha.className = 'gl-game-card';
      linha.addEventListener('mouseenter', () => mostrarInfoHover(linha, jogo, estat || {}));
      linha.addEventListener('mouseleave', esconderInfoHover);
      linha.appendChild(miniaturaJogo(jogo));

      const info = document.createElement('div');
      info.className = 'gl-game-info';
      const nome = document.createElement('div');
      nome.className = 'gl-game-name';
      nome.textContent = jogo.nome;
      const meta = document.createElement('div');
      meta.className = 'gl-game-meta';
      const si = statusInfo(jogo.status);
      const badge = document.createElement('span');
      badge.className = 'gl-badge ' + si.classe;
      badge.innerHTML = (si.icone ? icone(si.icone, 10) : '') + si.texto;
      meta.appendChild(badge);
      if (jogo.genero) {
        const tagGenero = document.createElement('span');
        tagGenero.className = 'gl-tag';
        tagGenero.textContent = jogo.genero;
        meta.appendChild(tagGenero);
      }
      if (jogo.origem === 'temporario') {
        const tag = document.createElement('span');
        tag.className = 'gl-tag';
        tag.textContent = 'temporário';
        meta.appendChild(tag);
      }
      info.appendChild(nome);
      info.appendChild(meta);

      const acoes = document.createElement('div');
      acoes.className = 'gl-game-actions';

      const jogarBtn = document.createElement('button');
      jogarBtn.className = 'gl-btn gl-btn-icon gl-btn-play';
      jogarBtn.title = 'Jogar';
      jogarBtn.innerHTML = icone('play', 14);
      jogarBtn.addEventListener('click', () => {
        fecharPainel();
        abrirJogo(jogo, async (novoStatus) => {
          jogo.status = novoStatus;
          jogo.ultimoTeste = new Date().toISOString();
          if (jogo.origem === 'temporario') {
            const temporarios = await carregarJogosTemporarios();
            const idx = temporarios.findIndex((j) => j.id === jogo.id);
            if (idx !== -1) {
              temporarios[idx] = jogo;
              salvarJogosTemporarios(temporarios);
            }
          }
          // status de jogos do manifest não é persistido de volta no manifest remoto,
          // só reflete na sessão atual.
        });
      });
      acoes.appendChild(jogarBtn);

      if (permiteRemover) {
        const removerBtn = document.createElement('button');
        removerBtn.className = 'gl-btn gl-btn-icon gl-btn-danger';
        removerBtn.title = 'Remover';
        removerBtn.innerHTML = icone('lixeira', 14);
        removerBtn.addEventListener('click', async () => {
          const temporarios = (await carregarJogosTemporarios()).filter((j) => j.id !== jogo.id);
          salvarJogosTemporarios(temporarios);
          renderizarLista();
        });
        acoes.appendChild(removerBtn);
      }

      linha.appendChild(info);
      linha.appendChild(acoes);
      return linha;
    }

    function aplicarFiltroErenderizar() {
      esconderInfoHover();
      lista.innerHTML = '';
      let jogosFiltrados = ultimaListaCombinada;
      if (generoSelecionado !== 'todos') {
        jogosFiltrados = jogosFiltrados.filter((j) => (j.genero || '').trim() === generoSelecionado);
      }
      if (!jogosFiltrados.length) {
        lista.innerHTML =
          '<div class="gl-empty">' +
          (generoSelecionado !== 'todos'
            ? 'Nenhum jogo nesse gênero.'
            : 'Nenhum jogo disponível.<br>Configure o manifest ou adicione um jogo temporário.') +
          '</div>';
        return;
      }
      jogosFiltrados.forEach((jogo) => {
        lista.appendChild(linhaJogo(jogo, jogo.origem === 'temporario', estatisticasCache[jogo.id]));
      });
    }

    async function renderizarLista() {
      lista.innerHTML = '<div class="gl-empty">Carregando...</div>';

      const [manifest, temporarios, estatisticas] = await Promise.all([
        carregarJogosManifest(false),
        carregarJogosTemporarios(),
        carregarEstatisticas(),
      ]);
      estatisticasCache = estatisticas || {};

      if (manifest.erro) {
        avisoManifest.style.display = 'flex';
        avisoManifest.innerHTML = icone('alerta', 14) + '<span>' + (
          manifest.atualizadoEm
            ? `Não deu pra atualizar o manifest agora (usando cache de ${new Date(manifest.atualizadoEm).toLocaleString()}).`
            : `Não deu pra carregar o manifest: ${manifest.erro}`
        ) + '</span>';
      } else {
        avisoManifest.style.display = 'none';
      }

      const jogosManifest = Array.isArray(manifest.jogos) ? manifest.jogos : [];
      const jogosTemp = Array.isArray(temporarios) ? temporarios : [];

      // mais recentes primeiro; jogos sem "adicionadoEm" (ex: manifest antigo) vão pro fim
      ultimaListaCombinada = [...jogosManifest, ...jogosTemp].sort((a, b) => {
        const da = a.adicionadoEm ? new Date(a.adicionadoEm).getTime() : 0;
        const db = b.adicionadoEm ? new Date(b.adicionadoEm).getTime() : 0;
        return db - da;
      });

      popularFiltroGenero(ultimaListaCombinada);
      aplicarFiltroErenderizar();
    }

    renderizarLista();
  }

  // ---------- Janela flutuante do jogo ----------
  async function abrirJogo(jogo, aoMudarStatus) {
    if (document.getElementById('gl-overlay')) return;
    injetarEstilos();

    const cfg = await carregarConfigJanela();
    const larguraInicial = Math.min(Math.max(cfg.w, LARGURA_MIN), window.innerWidth - 20);
    const alturaInicial = Math.min(Math.max(cfg.h, ALTURA_MIN), window.innerHeight - 20);
    const xInicial = cfg.x !== null ? Math.min(cfg.x, window.innerWidth - larguraInicial) : (window.innerWidth - larguraInicial) / 2;
    const yInicial = cfg.y !== null ? Math.min(cfg.y, window.innerHeight - alturaInicial) : (window.innerHeight - alturaInicial) / 2;

    const overlay = document.createElement('div');
    overlay.id = 'gl-overlay';
    overlay.className = 'gl-scope gl-overlay gl-no-transition';
    overlay.style.left = xInicial + 'px';
    overlay.style.top = yInicial + 'px';
    overlay.style.width = larguraInicial + 'px';
    overlay.style.height = alturaInicial + 'px';
    overlay.style.minWidth = LARGURA_MIN + 'px';
    overlay.style.minHeight = ALTURA_MIN + 'px';
    requestAnimationFrame(() => overlay.classList.remove('gl-no-transition'));

    let maximizado = !!cfg.maximizado;
    let estadoAntesMaximizar = null;

    const barra = document.createElement('div');
    barra.className = 'gl-overlay-bar';

    const status = document.createElement('span');
    status.className = 'gl-overlay-title';
    status.innerHTML = `${icone('gamepad', 13)} <span>${jogo.nome} — Carregando...</span>`;

    const controles = document.createElement('div');
    controles.className = 'gl-overlay-controls';

    function botao(nomeIcone, titulo, extraClasse) {
      const b = document.createElement('button');
      b.className = 'gl-btn gl-btn-icon' + (extraClasse ? ' ' + extraClasse : '');
      b.title = titulo;
      b.innerHTML = icone(nomeIcone, 14);
      return b;
    }

    const voltarBtn = botao('voltar', 'Voltar pro menu de jogos');
    const mutarBtn = botao('somOn', 'Mutar (script não alcança áudio de outra origem — clique pra ver como mutar pelo navegador)');
    const minimizarBtn = botao('minimizar', 'Minimizar');
    const maximizarBtn = botao('maximizar', 'Maximizar');
    const fecharBtn = botao('fechar', 'Fechar', 'gl-btn-danger');

    controles.appendChild(voltarBtn);
    controles.appendChild(mutarBtn);
    controles.appendChild(minimizarBtn);
    controles.appendChild(maximizarBtn);
    controles.appendChild(fecharBtn);
    barra.appendChild(status);
    barra.appendChild(controles);

    const corpo = document.createElement('div');
    corpo.className = 'gl-overlay-body';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('allow', 'autoplay; fullscreen');

    corpo.appendChild(iframe);

    const alca = document.createElement('div');
    alca.className = 'gl-resize-handle';
    alca.title = 'Arraste para redimensionar (trava em 16:9). Segure Shift para redimensionar livremente.';
    corpo.appendChild(alca);

    overlay.appendChild(barra);
    overlay.appendChild(corpo);
    document.body.appendChild(overlay);

    const capa = document.createElement('div');
    capa.style.cssText = 'position: absolute; inset: 0; z-index: 5; display: none;';
    corpo.appendChild(capa);

    let carregou = false;
    iframe.addEventListener('load', () => {
      carregou = true;
      status.innerHTML = `${icone('gamepad', 13)} <span>${jogo.nome}</span>`;
      if (aoMudarStatus) aoMudarStatus('ok');
    });

    iframe.src = jogo.url;
    setTimeout(() => {
      if (!carregou) {
        fecharJogo();
        window.open(jogo.url, '_blank');
        if (aoMudarStatus) aoMudarStatus('bloqueado');
      }
    }, TIMEOUT_DETECCAO_MS);

    function estadoAtual() {
      return {
        x: parseInt(overlay.style.left, 10),
        y: parseInt(overlay.style.top, 10),
        w: parseInt(overlay.style.width, 10),
        h: parseInt(overlay.style.height, 10),
        maximizado,
      };
    }

    function fecharJogo() {
      salvarConfigJanela(estadoAtual());
      overlay.remove();
      document.removeEventListener('keydown', aoTeclarEsc);
    }

    function aoTeclarEsc(e) {
      if (e.key === 'Escape') fecharJogo();
    }
    onDoc('keydown', aoTeclarEsc);

    fecharBtn.addEventListener('click', fecharJogo);
    voltarBtn.addEventListener('click', () => {
      fecharJogo();
      abrirPainelJogos();
    });

    let mutado = false;
    let dicaTimeout = null;
    function mostrarDica(texto) {
      let dica = overlay.querySelector('#gl-dica');
      if (!dica) {
        dica = document.createElement('div');
        dica.id = 'gl-dica';
        dica.className = 'gl-dica';
        corpo.appendChild(dica);
      }
      dica.textContent = texto;
      dica.style.display = 'block';
      clearTimeout(dicaTimeout);
      dicaTimeout = setTimeout(() => { dica.style.display = 'none'; }, 6000);
    }
    mutarBtn.addEventListener('click', () => {
      mutado = !mutado;
      let conseguiuMutarDireto = false;
      try {
        const doc = iframe.contentDocument;
        doc.querySelectorAll('audio, video').forEach((m) => { m.muted = mutado; });
        conseguiuMutarDireto = true;
      } catch (e) {
        conseguiuMutarDireto = false;
      }
      mutarBtn.innerHTML = icone(mutado ? 'somOff' : 'somOn', 14);
      if (!conseguiuMutarDireto) {
        mostrarDica(
          mutado
            ? 'O navegador bloqueia mutar áudio de sites de outra origem por script. Clique com o botão direito na aba do navegador → "Silenciar site" (ou clique no ícone de alto-falante na própria aba).'
            : 'Pra reativar o som, use a mesma opção na aba do navegador ("Silenciar site" de novo).'
        );
      }
    });

    let minimizado = false;
    let alturaAntesMinimizar = alturaInicial;
    minimizarBtn.addEventListener('click', () => {
      minimizado = !minimizado;
      if (minimizado) {
        alturaAntesMinimizar = parseInt(overlay.style.height, 10);
        overlay.style.height = barra.offsetHeight + 'px';
        minimizarBtn.innerHTML = icone('maximizar', 14);
        minimizarBtn.title = 'Restaurar';
      } else {
        overlay.style.height = alturaAntesMinimizar + 'px';
        minimizarBtn.innerHTML = icone('minimizar', 14);
        minimizarBtn.title = 'Minimizar';
      }
    });

    function aplicarMaximizado() {
      if (maximizado) {
        estadoAntesMaximizar = {
          x: overlay.style.left, y: overlay.style.top,
          w: overlay.style.width, h: overlay.style.height,
        };
        overlay.style.left = '0px';
        overlay.style.top = '0px';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.borderRadius = '0';
        maximizarBtn.innerHTML = icone('restaurar', 14);
        maximizarBtn.title = 'Restaurar';
      } else if (estadoAntesMaximizar) {
        overlay.style.left = estadoAntesMaximizar.x;
        overlay.style.top = estadoAntesMaximizar.y;
        overlay.style.width = estadoAntesMaximizar.w;
        overlay.style.height = estadoAntesMaximizar.h;
        overlay.style.borderRadius = '';
        maximizarBtn.innerHTML = icone('maximizar', 14);
        maximizarBtn.title = 'Maximizar';
      }
    }
    maximizarBtn.addEventListener('click', () => {
      maximizado = !maximizado;
      aplicarMaximizado();
    });
    if (maximizado) aplicarMaximizado();

    let arrastando = false, offX = 0, offY = 0;
    barra.addEventListener('mousedown', (e) => {
      if (maximizado || (e.target !== barra && e.target !== status && !status.contains(e.target))) return;
      arrastando = true;
      overlay.classList.add('gl-no-transition');
      capa.style.display = 'block';
      offX = e.clientX - overlay.offsetLeft;
      offY = e.clientY - overlay.offsetTop;
      e.preventDefault();
    });

    let redimensionando = false, startX = 0, startY = 0, startW = 0, startH = 0;
    alca.addEventListener('mousedown', (e) => {
      if (maximizado) return;
      redimensionando = true;
      overlay.classList.add('gl-no-transition');
      capa.style.display = 'block';
      startX = e.clientX;
      startY = e.clientY;
      startW = overlay.offsetWidth;
      startH = overlay.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
      if (arrastando) {
        let novoX = e.clientX - offX;
        let novoY = e.clientY - offY;
        novoX = Math.max(0, Math.min(novoX, window.innerWidth - overlay.offsetWidth));
        novoY = Math.max(0, Math.min(novoY, window.innerHeight - overlay.offsetHeight));
        overlay.style.left = novoX + 'px';
        overlay.style.top = novoY + 'px';
      } else if (redimensionando) {
        let novaW = startW + (e.clientX - startX);
        let novaH;
        const livre = e.shiftKey;

        if (livre) {
          novaH = startH + (e.clientY - startY);
        } else {
          const alturaBarra = barra.offsetHeight;
          const alturaCorpo16x9 = novaW / RAZAO_16_9;
          novaH = alturaCorpo16x9 + alturaBarra;
        }

        novaW = Math.max(LARGURA_MIN, Math.min(novaW, window.innerWidth - overlay.offsetLeft));
        novaH = Math.max(ALTURA_MIN, Math.min(novaH, window.innerHeight - overlay.offsetTop));

        if (!livre) {
          const alturaBarra = barra.offsetHeight;
          const larguraMaxima = window.innerWidth - overlay.offsetLeft;
          const alturaMaxima = window.innerHeight - overlay.offsetTop;
          const wPelaAltura = (novaH - alturaBarra) * RAZAO_16_9;
          const hPelaLargura = (novaW / RAZAO_16_9) + alturaBarra;
          if (hPelaLargura <= alturaMaxima) {
            novaH = hPelaLargura;
          } else {
            novaW = Math.min(wPelaAltura, larguraMaxima);
            novaH = alturaMaxima;
          }
        }

        overlay.style.width = novaW + 'px';
        overlay.style.height = novaH + 'px';
        if (!minimizado) alturaAntesMinimizar = novaH;
      }
    });

    window.addEventListener('mouseup', () => {
      if (arrastando || redimensionando) {
        salvarConfigJanela(estadoAtual());
      }
      arrastando = false;
      redimensionando = false;
      overlay.classList.remove('gl-no-transition');
      capa.style.display = 'none';
    });
  }

  // ---------- Botão flutuante (FAB) — clique normal abre o painel;
  // segurar o clique por FAB_SEGURAR_MS libera o modo arrastável ----------
  async function criarBotaoFlutuante() {
    if (document.getElementById('gl-fab')) return;
    injetarEstilos();

    const btn = document.createElement('button');
    btn.id = 'gl-fab';
    btn.className = 'gl-scope gl-fab';
    btn.title = 'Jogos (segure para arrastar)';
    btn.innerHTML = icone('gamepad', 26);

    const posSalva = await carregarPosicaoFab();
    if (posSalva && typeof posSalva.left === 'number' && typeof posSalva.top === 'number') {
      btn.style.left = posSalva.left + 'px';
      btn.style.top = posSalva.top + 'px';
    } else {
      btn.style.bottom = '20px';
      btn.style.right = '20px';
    }

    document.body.appendChild(btn);

    let timerSegurar = null;
    let dragLiberado = false;
    let arrastando = false;
    let moveuDurante = false;
    let offX = 0, offY = 0;

    function liberarDrag() {
      dragLiberado = true;
      btn.classList.add('gl-fab-liberado');
      if (navigator.vibrate) navigator.vibrate(15); // feedback tátil em telas touch, ignorado silenciosamente no resto
    }

    function resetarEstado() {
      clearTimeout(timerSegurar);
      timerSegurar = null;
      dragLiberado = false;
      arrastando = false;
      moveuDurante = false;
      btn.classList.remove('gl-fab-liberado', 'gl-fab-arrastando');
    }

    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // só botão esquerdo
      moveuDurante = false;
      dragLiberado = false;
      const rect = btn.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;

      timerSegurar = setTimeout(liberarDrag, FAB_SEGURAR_MS);
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragLiberado) return;
      if (!arrastando) {
        arrastando = true;
        btn.classList.add('gl-fab-arrastando');
        // trava a posição atual em left/top antes de começar a mover
        const rect = btn.getBoundingClientRect();
        btn.style.left = rect.left + 'px';
        btn.style.top = rect.top + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }
      moveuDurante = true;
      let novoX = e.clientX - offX;
      let novoY = e.clientY - offY;
      novoX = Math.max(4, Math.min(novoX, window.innerWidth - btn.offsetWidth - 4));
      novoY = Math.max(4, Math.min(novoY, window.innerHeight - btn.offsetHeight - 4));
      btn.style.left = novoX + 'px';
      btn.style.top = novoY + 'px';
    });

    window.addEventListener('mouseup', () => {
      const foiDrag = dragLiberado && moveuDurante;
      if (foiDrag) {
        salvarPosicaoFab({ left: parseInt(btn.style.left, 10), top: parseInt(btn.style.top, 10) });
      }
      resetarEstado();
    });

    btn.addEventListener('click', () => {
      if (dragLiberado && moveuDurante) return; // foi um drag, não um clique
      clearTimeout(timerSegurar);
      abrirPainelJogos();
    });
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Abrir lista de jogos', abrirPainelJogos);
    GM_registerMenuCommand('Atualizar manifest agora', () => carregarJogosManifest(true));
  }

  injetarEstilos();
  criarBotaoFlutuante();
  // Busca o manifest assim que a página carrega
  carregarJogosManifest(false);

  // ---- Kill (chamado pelo Hub via instanceKey) ----
  function kill() {
    teardownListeners.forEach((fn) => {
      try { fn(); } catch (e) {}
    });
    teardownListeners.length = 0;

    document.getElementById('gl-fab')?.remove();
    document.getElementById('gl-painel')?.remove();
    document.getElementById('gl-overlay')?.remove();
    document.getElementById('gl-temp-modal')?.remove();
    document.getElementById('gl-estilos')?.remove();

    window.__glLoaded = false;
  }

  window._games = { kill };
})();
