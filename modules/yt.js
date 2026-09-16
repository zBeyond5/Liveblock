// modules/yt.js — YouTube embed
(function () {
    'use strict';
    const UID = '_yt';
    if (window[UID]) return;

    // CONFIG
    const GEOM_KEY = 'sang_panel_yt_state';
    const APIKEY_KEY = 'sang_yt_api_key';
    const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
    const MIN_W = 460, MIN_H = 280;
    const MAX_W = 2400;
    const RESULTS_W = 260;

    // IA
    const IA_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
    const IA_MODEL = 'openai/gpt-oss-20b';
    const IA_TIMEOUT_MS = 5000;
    const IA_SYSTEM = `Você é um normalizador de comandos de voz para o YouTube. Sua ÚNICA função é transformar pedidos em linguagem natural numa query curta de busca no YouTube.

## Regras de saída (obrigatórias)
1. Responda com UMA linha só, sem quebras.
2. Sem aspas, crases, markdown ou prefixo ("Query:", "Busca:", "→").
3. Sem pontuação final (nada de ponto, vírgula, exclamação, interrogação).
4. Entre 2 e 6 palavras-chave essenciais, sem conectores soltos ("de", "com", "o", "a" no fim).
5. Preserve o idioma da fala original — não traduza.
6. Preserve nomes próprios, marcas, artistas e títulos exatos como o usuário falou.
7. Se a fala NÃO for sobre buscar, tocar ou assistir um vídeo/música, responda EXATAMENTE: NULL
8. Se for ambíguo, responda NULL. É melhor errar pro lado conservador.

## Quando responder NULL
- Perguntas gerais: "qual a capital da frança", "quanto é 2+2", "quem descobriu o brasil"
- Comandos do Hub: "abre o iptv", "fecha o menu", "liga o booster", "desativa o packet"
- Conversa: "oi", "tudo bem?", "bom dia", "valeu"
- Controle de voz: "aumenta o volume", "para", "cancela", "limpa isso", "manda"
- Qualquer coisa que não seja claramente pedido de vídeo ou música

## Exemplos

Pedido: coloca o vídeo do leo stronda com o cariani
Saída: leo stronda cariani

Pedido: quero ouvir metallica
Saída: metallica

Pedido: aquele vídeo do cara caindo de skate
Saída: queda skate compilado

Pedido: me mostra o trailer do gta 6
Saída: gta 6 trailer

Pedido: toca aquela música do linkin park que fala de dor
Saída: linkin park numb

Pedido: coloca o clipe da taylor swift
Saída: taylor swift clipe

Pedido: quero ver o vídeo do luba explicando javascript
Saída: luba javascript

Pedido: bota um funk pra tocar
Saída: funk 2024

Pedido: coloca a música que o cara canta no telhado de novo
Saída: música telhado

Pedido: youtube the weeknd blinding lights
Saída: the weeknd blinding lights

Pedido: abre o iptv
Saída: NULL

Pedido: qual a capital da frança
Saída: NULL

Pedido: oi tudo bem
Saída: NULL

Pedido: fecha o menu
Saída: NULL

Pedido: quanto é 2 mais 2
Saída: NULL

Pedido: cancela isso
Saída: NULL

Responda APENAS a saída. Nada mais antes ou depois.`;

    // VOZ
    const YT_WAKE = ['youtube', 'yt'];
    const YT_VERBOS = /\b(coloca|colocar|toca|tocar|p[oõ]e|bota|abre|abrir|busca|buscar|pesquisa|pesquisar|procura|procurar|mostra|mostrar|quero\s+ver|quero\s+ouvir)\b/i;
    const YT_MIDIA  = /\b(v[ií]deo|v[ií]deozinho|clipe|m[uú]sica)\b/i;

    // HELPERS
    function loadGeom() {
        try {
            const s = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null');
            if (s && typeof s.left === 'number' && typeof s.top === 'number' &&
                typeof s.width === 'number' && typeof s.height === 'number') return s;
        } catch (_) {}
        return null;
    }

    function extractVideoId(raw) {
        const v = String(raw || '').trim();
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        for (const re of patterns) { const m = v.match(re); if (m) return m[1]; }
        return null;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    // Pega a chave do Groq de `sang_api_keys` (mesmo storage usado pelo resto
    // do ecossistema). Caminho principal: wrapper global `_apis`. Fallback:
    // leitura direta do JSON `{ groq: "gsk_..." }`.
    function getGroqKey() {
        try {
            const viaApis = window._apis?.getKey?.('groq');
            if (viaApis) return viaApis;
        } catch (_) {}

        try {
            const raw = localStorage.getItem('sang_api_keys');
            if (!raw) return '';
            const obj = JSON.parse(raw);
            const v = obj?.groq;
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object' && typeof v.key === 'string') return v.key;
        } catch (_) {}

        return '';
    }

    // ─── Parser de linguagem natural ───
    function interpretar(fala) {
        const t = String(fala || '').trim();
        if (!t) return { tipo: null, valor: '' };

        const vid = extractVideoId(t);
        if (vid) return { tipo: 'video', valor: vid };

        const wakeRe = new RegExp('^(?:' + YT_WAKE.join('|') + ')\\s+(.+)$', 'i');
        const wake = t.match(wakeRe);
        if (wake) return { tipo: 'query', valor: wake[1].trim() };

        if (YT_VERBOS.test(t) && YT_MIDIA.test(t)) {
            const limpo = t
                .replace(/^(?:coloca|colocar|toca|tocar|p[oõ]e|bota|abre|abrir|busca|buscar|pesquisa|pesquisar|procura|procurar|mostra|mostrar)\b\s*/i, '')
                .replace(/\b(?:pra|para)\s+(?:mim|mim\s+ver)\b\s*/i, '')
                .replace(/^o\s+/i, '')
                .replace(/^(?:v[ií]deo|clipe|m[uú]sica)\s+(?:do|da|de|com)\s+/i, '')
                .trim();
            return { tipo: 'query', valor: limpo || t };
        }

        return { tipo: null, valor: t };
    }

    // ─── IA: chamada direta ao Groq ───
    // Fala livre → query curta de busca. Retorna null se não for sobre vídeo.
    async function normalizarComIA(fala) {
        const key = getGroqKey();
        if (!key) return null;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), IA_TIMEOUT_MS);
        try {
            const res = await fetch(IA_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: IA_MODEL,
                    messages: [
                        { role: 'system', content: IA_SYSTEM },
                        { role: 'user', content: String(fala || '') }
                    ],
                    max_tokens: 60,
                    temperature: 0.1,
                    top_p: 0.9,
                    reasoning_effort: 'low'
                }),
                signal: ctrl.signal
            });

            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const bruto = data?.choices?.[0]?.message?.content || '';

            // Limpa: tira aspas/crases das pontas, prefixos tipo "Query:",
            // travessões, e pega só a primeira linha não-vazia.
            const linhas = String(bruto).split('\n').map(l => l.trim()).filter(Boolean);
            if (!linhas.length) return null;

            const limpo = linhas[0]
                .replace(/^["'`]+|["'`]+$/g, '')
                .replace(/^(?:query|busca|sa[íi]da|resposta|output|→)\s*[:\-]?\s*/i, '')
                .replace(/^[-–—]\s*/, '')
                .trim();

            if (!limpo) return null;

            // Canoniza pra comparar com NULL: tira pontuação final.
            const canonico = limpo.replace(/[.,;:!?]+$/, '').trim();

            // Qualquer variante de "null"/"nada"/"nenhum" vira descarte.
            if (/^(null|none|nada|nenhum[a]?|n\/a|na)$/i.test(canonico)) return null;

            // Se sobrar mais de 8 palavras, provavelmente a IA ignorou o formato.
            if (canonico.split(/\s+/).length > 8) {
                console.warn('[YouTube] IA devolveu query longa, usando mesmo assim:', canonico);
            }

            return canonico;
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.warn('[YouTube] Normalização IA falhou:', e);
            }
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    function init() {
        if (window[UID]) return;

        // DOM
        const host = document.createElement('div');
        host.id = UID + '_host';
        host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483000;';
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel {
            position: fixed; display: flex; flex-direction: column;
            font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f0f0f; border: 1px solid rgba(255,255,255,.08); border-radius: 12px;
            overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.6);
            contain: layout style paint;
        }
        .hdr {
            height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
            padding: 0 10px; cursor: grab; user-select: none; touch-action: none;
            border-bottom: 1px solid rgba(255,255,255,.06); background: #181818;
        }
        .hdr.dragging { cursor: grabbing; }
        .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .logo { width: 20px; height: 14px; border-radius: 4px; background: #ff0000; position: relative; flex-shrink: 0; }
        .logo::after { content: ''; position: absolute; left: 7px; top: 3px; border: 4px solid transparent; border-left-color: #fff; }
        .title { font-weight: 700; font-size: 13px; color: #fff; white-space: nowrap; }
        .actions { display: flex; gap: 6px; flex-shrink: 0; }
        .btn {
            width: 26px; height: 26px; border-radius: 50%; background: transparent; border: none;
            color: #aaa; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 13px; transition: background .15s, color .15s;
        }
        .btn:hover, .btn:focus-visible { background: rgba(255,255,255,.12); color: #fff; outline: none; }
        .btn.active { background: rgba(62,166,255,.18); color: #3ea6ff; }
        .searchbar { display: flex; gap: 8px; padding: 8px 10px; flex-shrink: 0; background: #0f0f0f; }
        .searchbar input {
            flex: 1; background: #121212; border: 1px solid rgba(255,255,255,.15); border-radius: 20px;
            padding: 7px 14px; color: #fff; font-size: 13px; outline: none;
        }
        .searchbar input:focus { border-color: #3ea6ff; }
        .searchbar input::placeholder { color: #888; }
        .searchbar button {
            background: #222; border: 1px solid rgba(255,255,255,.1); border-radius: 20px;
            padding: 0 16px; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .searchbar button:hover { background: #303030; }
        .body { flex: 1; min-height: 0; display: flex; background: #000; }
        .player { flex: 1; min-width: 0; position: relative; background: #000; }
        .player iframe { width: 100%; height: 100%; border: 0; }
        .results {
            width: ${RESULTS_W}px; flex-shrink: 0; overflow-y: auto; background: #0f0f0f;
            border-left: 1px solid rgba(255,255,255,.06);
        }
        .results.hidden { display: none; }
        .results::-webkit-scrollbar { width: 4px; }
        .results::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
        .item { display: flex; gap: 8px; padding: 8px; cursor: pointer; transition: background .12s; }
        .item:hover { background: rgba(255,255,255,.06); }
        .item img { width: 88px; height: 50px; object-fit: cover; border-radius: 6px; flex-shrink: 0; background: #222; }
        .item-info { flex: 1; min-width: 0; }
        .item-title { font-size: 12px; color: #f1f1f1; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .item-channel { font-size: 10.5px; color: #aaa; margin-top: 3px; }
        .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: #888; font-size: 12px; text-align: center; padding: 20px; }
        .empty.flow { position: static; height: 100%; }
        .spin { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.2); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .resize-handle {
            position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; touch-action: none;
            background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,.2) 50%);
        }
        `;
        root.appendChild(style);

        // STATE
        const geom = loadGeom() || { left: 70, top: 70, width: 820, height: 540 };
        const state = { searchController: null, results: [], resultsVisible: true };
        let minimized = false;

        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `
            <div class="hdr" id="hdr">
                <div class="brand"><div class="logo"></div><span class="title">YouTube</span></div>
                <div class="actions">
                    <button class="btn" id="btnToggle" title="Mostrar/ocultar lista de resultados" aria-label="Alternar painel de resultados">▤</button>
                    <button class="btn" id="btnKey" title="Configurar API key" aria-label="Configurar API key">⚙</button>
                    <button class="btn" id="btnMin" title="Minimizar" aria-label="Minimizar">−</button>
                    <button class="btn" id="btnCls" title="Fechar" aria-label="Fechar">✕</button>
                </div>
            </div>
            <div class="searchbar">
                <input type="text" id="input" placeholder="Pesquisar ou colar um link do YouTube" aria-label="Buscar no YouTube" />
                <button id="btnGo">Buscar</button>
            </div>
            <div class="body" id="body">
                <div class="player" id="playerWrap">
                    <div class="empty">Pesquise um vídeo ou cole um link do YouTube acima</div>
                </div>
                <div class="results" id="results"></div>
            </div>
            <div class="resize-handle" id="resizeHandle" aria-hidden="true"></div>
        `;
        root.appendChild(panel);

        const hdr = panel.querySelector('#hdr');
        const btnToggle = panel.querySelector('#btnToggle');
        const btnKey = panel.querySelector('#btnKey');
        const btnMin = panel.querySelector('#btnMin');
        const btnCls = panel.querySelector('#btnCls');
        const input = panel.querySelector('#input');
        const btnGo = panel.querySelector('#btnGo');
        const playerWrap = panel.querySelector('#playerWrap');
        const resultsEl = panel.querySelector('#results');
        const resizeHandle = panel.querySelector('#resizeHandle');
        const searchbarEl = panel.querySelector('.searchbar');

        function onHostKeydown(e) {
            if (e.key === 'Escape' && !minimized) { kill(); return; }
            e.stopPropagation();
        }
        function stopProp(e) { e.stopPropagation(); }
        const LEAK_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput'];
        LEAK_EVENTS.forEach(t => host.addEventListener(t, t === 'keydown' ? onHostKeydown : stopProp));

        // Geometria & 16:9
        function chromeHeight() {
            const h = hdr.getBoundingClientRect().height + searchbarEl.getBoundingClientRect().height;
            return h + 2;
        }

        function computeHeightForWidth(width) {
            const resultsW = state.resultsVisible ? RESULTS_W : 0;
            const playerW = width - resultsW - 2;
            if (playerW <= 0) return MIN_H;
            return Math.round(playerW * 9 / 16 + chromeHeight());
        }

        function clampGeom(s) {
            s.width = Math.max(MIN_W, Math.min(MAX_W, s.width));
            s.height = Math.max(MIN_H, s.height);
            s.left = Math.min(Math.max(0, s.left), Math.max(0, window.innerWidth - s.width));
            s.top = Math.min(Math.max(0, s.top), Math.max(0, window.innerHeight - s.height));
        }

        function applySize(width, applyPos) {
            geom.width = Math.max(MIN_W, Math.min(MAX_W, width));
            geom.height = computeHeightForWidth(geom.width);
            clampGeom(geom);
            panel.style.width = geom.width + 'px';
            panel.style.height = geom.height + 'px';
            if (applyPos) {
                panel.style.left = geom.left + 'px';
                panel.style.top = geom.top + 'px';
            }
        }

        applySize(geom.width, true);

        // STORAGE
        let saveTimer = null;
        function scheduleSaveGeom() {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                try { localStorage.setItem(GEOM_KEY, JSON.stringify(geom)); } catch (_) {}
            }, 300);
        }

        function getYtApiKey() {
            try { return localStorage.getItem(APIKEY_KEY) || ''; } catch (_) { return ''; }
        }

        function garantirVisivel() {
            if (minimized) {
                minimized = false;
                panel.style.display = 'flex';
            }
        }

        // PLAYER
        function loadVideo(videoId) {
            const params = 'autoplay=1&rel=0&iv_load_policy=3&playsinline=1&modestbranding=1';
            playerWrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?${params}"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
        }

        // SEARCH
        async function runSearch(query) {
            const key = getYtApiKey();
            if (!key) {
                resultsEl.innerHTML = `<div class="empty flow">Configure sua API key do YouTube (⚙) para buscar.<br>Ou cole um link direto do vídeo.</div>`;
                return;
            }

            if (state.searchController) state.searchController.abort();
            const controller = new AbortController();
            state.searchController = controller;

            resultsEl.innerHTML = `<div class="empty flow"><div class="spin"></div></div>`;

            const url = `${SEARCH_ENDPOINT}?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
            try {
                const res = await fetch(url, { signal: controller.signal });
                const data = await res.json();
                if (!res.ok) {
                    const msg = data?.error?.message || 'Erro na busca';
                    resultsEl.innerHTML = `<div class="empty flow">${escapeHtml(msg)}</div>`;
                    return;
                }

                const items = data.items || [];
                state.results = items.map(it => ({
                    id: it.id.videoId,
                    title: it.snippet.title,
                    channel: it.snippet.channelTitle,
                    thumb: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url
                }));

                if (!state.results.length) {
                    resultsEl.innerHTML = `<div class="empty flow">Nenhum resultado.</div>`;
                    return;
                }

                if (!state.resultsVisible) {
                    state.resultsVisible = true;
                    resultsEl.classList.remove('hidden');
                    btnToggle.classList.remove('active');
                    applySize(geom.width, false);
                    scheduleSaveGeom();
                }

                resultsEl.innerHTML = state.results.map((v, i) => `
                    <div class="item" data-index="${i}">
                        <img src="${v.thumb}" alt="" loading="lazy" />
                        <div class="item-info">
                            <div class="item-title">${escapeHtml(v.title)}</div>
                            <div class="item-channel">${escapeHtml(v.channel)}</div>
                        </div>
                    </div>
                `).join('');

                resultsEl.querySelectorAll('.item').forEach(el => {
                    el.addEventListener('click', () => {
                        const v = state.results[parseInt(el.dataset.index, 10)];
                        if (v) { loadVideo(v.id); input.value = `https://youtu.be/${v.id}`; }
                    });
                });

                loadVideo(state.results[0].id);
                input.value = `https://youtu.be/${state.results[0].id}`;
            } catch (e) {
                if (e.name === 'AbortError') return;
                resultsEl.innerHTML = `<div class="empty flow">Falha na busca.</div>`;
            }
        }

        function runAction() {
            const value = input.value.trim();
            if (!value) return;
            const videoId = extractVideoId(value);
            if (videoId) {
                loadVideo(videoId);
                resultsEl.innerHTML = '';
                if (state.resultsVisible) {
                    state.resultsVisible = false;
                    resultsEl.classList.add('hidden');
                    btnToggle.classList.add('active');
                    applySize(geom.width, false);
                    scheduleSaveGeom();
                }
                return;
            }
            runSearch(value);
        }

        // EVENTS
        btnGo.addEventListener('click', runAction);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') runAction(); });

        btnKey.addEventListener('click', () => {
            const current = getYtApiKey();
            const next = window.prompt('Cole sua API key do YouTube Data API v3 (Google Cloud Console):', current);
            if (next === null) return;
            try { localStorage.setItem(APIKEY_KEY, next.trim()); } catch (_) {}
        });

        function toggleResults() {
            state.resultsVisible = !state.resultsVisible;
            resultsEl.classList.toggle('hidden', !state.resultsVisible);
            btnToggle.classList.toggle('active', !state.resultsVisible);
            applySize(geom.width, false);
            scheduleSaveGeom();
        }
        btnToggle.addEventListener('click', toggleResults);

        // Drag
        let dragPointerId = null, dragStart = null, dragMoved = false;
        const DRAG_THRESHOLD = 3;

        function onPointerDown(e) {
            if (e.target.closest('.btn')) return;
            dragPointerId = e.pointerId;
            dragMoved = false;
            dragStart = { mouseX: e.clientX, mouseY: e.clientY, left: geom.left, top: geom.top };
            hdr.setPointerCapture(dragPointerId);
            hdr.classList.add('dragging');
        }
        function onPointerMove(e) {
            if (dragPointerId === null || e.pointerId !== dragPointerId) return;
            const dx = e.clientX - dragStart.mouseX, dy = e.clientY - dragStart.mouseY;
            if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            dragMoved = true;
            geom.left = dragStart.left + dx; geom.top = dragStart.top + dy;
            clampGeom(geom);
            panel.style.left = geom.left + 'px'; panel.style.top = geom.top + 'px';
        }
        function endDrag(e) {
            if (dragPointerId === null || (e && e.pointerId !== dragPointerId)) return;
            try { hdr.releasePointerCapture(dragPointerId); } catch (_) {}
            hdr.classList.remove('dragging');
            dragPointerId = null;
            if (dragMoved) scheduleSaveGeom();
        }
        hdr.addEventListener('pointerdown', onPointerDown);
        hdr.addEventListener('pointermove', onPointerMove);
        hdr.addEventListener('pointerup', endDrag);
        hdr.addEventListener('pointercancel', endDrag);

        // Resize 16:9
        let resizePointerId = null, resizeStart = null;
        function onResizeDown(e) {
            e.stopPropagation();
            resizePointerId = e.pointerId;
            resizeStart = { mouseX: e.clientX, mouseY: e.clientY, width: geom.width };
            resizeHandle.setPointerCapture(resizePointerId);
        }
        function onResizeMove(e) {
            if (resizePointerId === null || e.pointerId !== resizePointerId) return;
            const dx = e.clientX - resizeStart.mouseX;
            const dy = e.clientY - resizeStart.mouseY;
            const dyAsDx = dy * 16 / 9;
            const delta = Math.abs(dx) > Math.abs(dyAsDx) ? dx : dyAsDx;
            applySize(resizeStart.width + delta, false);
        }
        function endResize(e) {
            if (resizePointerId === null || (e && e.pointerId !== resizePointerId)) return;
            try { resizeHandle.releasePointerCapture(resizePointerId); } catch (_) {}
            resizePointerId = null;
            scheduleSaveGeom();
        }
        resizeHandle.addEventListener('pointerdown', onResizeDown);
        resizeHandle.addEventListener('pointermove', onResizeMove);
        resizeHandle.addEventListener('pointerup', endResize);
        resizeHandle.addEventListener('pointercancel', endResize);

        function onWindowResize() {
            clampGeom(geom);
            panel.style.left = geom.left + 'px'; panel.style.top = geom.top + 'px';
            panel.style.width = geom.width + 'px'; panel.style.height = geom.height + 'px';
        }
        window.addEventListener('resize', onWindowResize);

        // Minimizar / fechar
        function toggleMinimize() { minimized = !minimized; panel.style.display = minimized ? 'none' : 'flex'; }
        btnMin.addEventListener('click', toggleMinimize);
        btnCls.addEventListener('click', kill);

        // ─── API interna ───
        function tocar(videoId) {
            if (!videoId) return false;
            garantirVisivel();
            loadVideo(videoId);
            input.value = `https://youtu.be/${videoId}`;
            return true;
        }

        function pesquisar(query) {
            const q = String(query || '').trim();
            if (!q) return false;
            garantirVisivel();
            input.value = q;
            runSearch(q);
            return true;
        }

        // Fala → vídeo ou busca. Parser local primeiro; se não casar, IA.
        async function tocarPorFala(fala) {
            const p = interpretar(fala);
            if (p.tipo === 'video') return tocar(p.valor);
            if (p.tipo === 'query') return pesquisar(p.valor);

            const viaIA = await normalizarComIA(fala);
            if (viaIA) return pesquisar(viaIA);

            return false;
        }

        // ─── Integração voz.js ───
        let vozHandler = null;

        function deveInterceptar(texto, meta) {
            const wake = meta?.wake?.toLowerCase();
            if (wake === 'youtube' || wake === 'yt') return true;

            const t = String(texto || '').trim();
            if (!t) return false;
            if (extractVideoId(t)) return true;

            const wakeRe = new RegExp('^(?:' + YT_WAKE.join('|') + ')\\s+', 'i');
            if (wakeRe.test(t)) return true;

            if (YT_VERBOS.test(t) && YT_MIDIA.test(t)) return true;

            return false;
        }

        function registrarHandlerVoz() {
            if (!window._voiceCommands?.registrar) return false;
            if (vozHandler) return true;
            vozHandler = (texto, n, meta) => {
                if (!deveInterceptar(texto, meta)) return false;
                // tocarPorFala é async (pode chamar a IA). O dispatcher do voz.js
                // precisa de resposta síncrona, então consumimos já e deixamos a
                // Promise seguir em background.
                tocarPorFala(texto);
                return true;
            };
            window._voiceCommands.registrar(/.*/, vozHandler, 0);
            return true;
        }

        function limparHandlerVoz() {
            if (vozHandler && window._voiceCommands?.remover) {
                window._voiceCommands.remover(vozHandler);
            }
            vozHandler = null;
        }

        registrarHandlerVoz();
        window.addEventListener('sang:voz-ready', registrarHandlerVoz);
        window.addEventListener('sang:voz-state', registrarHandlerVoz);

        function kill() {
            limparHandlerVoz();
            window.removeEventListener('sang:voz-ready', registrarHandlerVoz);
            window.removeEventListener('sang:voz-state', registrarHandlerVoz);

            if (saveTimer) clearTimeout(saveTimer);
            if (state.searchController) state.searchController.abort();
            window.removeEventListener('resize', onWindowResize);

            hdr.removeEventListener('pointerdown', onPointerDown);
            hdr.removeEventListener('pointermove', onPointerMove);
            hdr.removeEventListener('pointerup', endDrag);
            hdr.removeEventListener('pointercancel', endDrag);

            resizeHandle.removeEventListener('pointerdown', onResizeDown);
            resizeHandle.removeEventListener('pointermove', onResizeMove);
            resizeHandle.removeEventListener('pointerup', endResize);
            resizeHandle.removeEventListener('pointercancel', endResize);

            playerWrap.innerHTML = '';
            host.remove();
            delete window[UID];
        }

        window[UID] = {
            kill,
            show: garantirVisivel,
            hide: () => { minimized = true; panel.style.display = 'none'; },
            tocar,
            pesquisar,
            tocarPorFala,
            interpretar
        };
    }

    // INIT
    if (document.body) {
        init();
    } else {
        new MutationObserver((_, obs) => {
            if (document.body) { obs.disconnect(); init(); }
        }).observe(document.documentElement, { childList: true });
    }
})();
