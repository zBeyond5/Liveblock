// modules/iptv.js — injetado pelo Sang Hub
// v6: 16:9 aplicado à ÁREA DO VÍDEO (não à janela toda). CRT removido do player.
// Botão para ocultar o cabeçalho. Glow sutil nas bordas.
(function() {
    'use strict';
    const UID = '_iptv';
    if (window._iptv) return;

    const HLS_JS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
    const CHANNELS_API_URL = 'https://iptv-org.github.io/api/channels.json';
    const STREAMS_API_URL = 'https://iptv-org.github.io/api/streams.json';
    const CATEGORIES_API_URL = 'https://iptv-org.github.io/api/categories.json';
    const PAIS = 'BR';
    const PLAYLIST_URL = `https://iptv-org.github.io/iptv/countries/${PAIS.toLowerCase()}.m3u`;
    const FREE_TV_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

    const CACHE_PREFIX = 'iptv_';
    const FALHA_TTL_MS = 6 * 60 * 60 * 1000;
    const CONECTAR_TIMEOUT_MS = 9000;
    const MAX_TENTATIVAS_RECUPERACAO = 1;

    // Constantes de layout — batem com o CSS abaixo
    const ASPECT_RATIO = 16 / 9;
    const HEADER_HEIGHT = 42;
    const LIST_WIDTH = 240;
    const BORDER_TOTAL = 6; // 3px cada lado
    const MIN_VIDEO_W = 320;
    const MAX_VIDEO_W = 2400;

    // ---------- Storage ----------
    function lerCache(chave, padrao) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + chave);
            return raw === null ? padrao : JSON.parse(raw);
        } catch (e) { return padrao; }
    }
    function salvarCache(chave, valor) {
        try { localStorage.setItem(CACHE_PREFIX + chave, JSON.stringify(valor)); } catch (e) {}
    }

    // ---------- Favoritos ----------
    function obterFavoritos() {
        const dados = lerCache('favoritos', []);
        return Array.isArray(dados) ? dados : [];
    }
    function toggleFavorito(id) {
        const favs = obterFavoritos();
        const idx = favs.indexOf(id);
        if (idx === -1) favs.push(id);
        else favs.splice(idx, 1);
        salvarCache('favoritos', favs);
        return idx === -1;
    }
    function ehFavorito(id) {
        return obterFavoritos().includes(id);
    }

    // ---------- Cache de falhas ----------
    function obterFalhas() {
        const dados = lerCache('falhas', {});
        return dados && typeof dados === 'object' ? dados : {};
    }
    function obterStatusFalha(id) {
        const falhas = obterFalhas();
        const registro = falhas[id];
        if (!registro) return null;
        if (Date.now() - new Date(registro.em).getTime() > FALHA_TTL_MS) return null;
        return registro;
    }
    function marcarFalha(id, motivo) {
        const falhas = obterFalhas();
        falhas[id] = { em: new Date().toISOString(), motivo: motivo || 'desconhecido' };
        salvarCache('falhas', falhas);
    }
    function limparFalha(id) {
        const falhas = obterFalhas();
        if (falhas[id]) { delete falhas[id]; salvarCache('falhas', falhas); }
    }
    function formatarRelativoCurto(iso) {
        const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (diffMin < 60) return 'há ' + diffMin + ' min';
        return 'há ' + Math.floor(diffMin / 60) + 'h';
    }

    // ---------- Link funcional ----------
    function obterLinksFuncionais() {
        const dados = lerCache('links-funcionais', {});
        return dados && typeof dados === 'object' ? dados : {};
    }
    function salvarLinkFuncional(id, url) {
        const dados = obterLinksFuncionais();
        dados[id] = url;
        salvarCache('links-funcionais', dados);
    }

    function loadHlsJs() {
        return new Promise((resolve, reject) => {
            if (window.Hls) return resolve(window.Hls);
            const s = document.createElement('script');
            s.src = HLS_JS_CDN;
            s.onload = () => resolve(window.Hls);
            s.onerror = () => reject(new Error('Falha ao carregar hls.js'));
            document.head.appendChild(s);
        });
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function normalizarNome(nome) {
        return (nome || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
    }

    const _avatarCache = new Map();
    function logoPlaceholder(nome) {
        const letra = (String(nome || '?').trim().charAt(0) || '?').toUpperCase();
        if (_avatarCache.has(letra)) return _avatarCache.get(letra);
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44">' +
            '<rect width="44" height="44" rx="6" fill="#3d2b1f"/>' +
            '<text x="50%" y="52%" font-family="system-ui,sans-serif" font-size="20" ' +
            'font-weight="800" fill="#ff8c42" text-anchor="middle" dominant-baseline="middle">' +
            escapeHtml(letra) +
            '</text></svg>';
        const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        _avatarCache.set(letra, uri);
        return uri;
    }

    function parseM3U(text) {
        const lines = text.split('\n');
        const canais = [];
        let atual = null;
        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith('#EXTINF')) {
                const nomeMatch = line.match(/,(.*)$/);
                const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                const idMatch = line.match(/tvg-id="([^"]*)"/);
                const grpMatch = line.match(/group-title="([^"]*)"/);
                atual = {
                    name: nomeMatch ? nomeMatch[1].trim() : '',
                    logo: logoMatch ? logoMatch[1] : '',
                    tvgId: idMatch ? idMatch[1] : '',
                    grupo: grpMatch ? grpMatch[1] : '',
                };
            } else if (line && !line.startsWith('#') && atual) {
                atual.url = line;
                canais.push(atual);
                atual = null;
            }
        }
        return canais;
    }

    async function buscarJson(url) {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' (' + url + ')');
        return res.json();
    }
    async function buscarTexto(url) {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' (' + url + ')');
        return res.text();
    }

    // ---------- Carga de canais + categorias ----------
    async function carregarDados() {
        const [resCh, resSt, resM3u, resFreeTv, resCat] = await Promise.allSettled([
            buscarJson(CHANNELS_API_URL),
            buscarJson(STREAMS_API_URL),
            buscarTexto(PLAYLIST_URL),
            buscarTexto(FREE_TV_URL),
            buscarJson(CATEGORIES_API_URL),
        ]);

        if (resCh.status !== 'fulfilled' || resSt.status !== 'fulfilled') {
            throw new Error('Falha ao carregar dados principais do iptv-org');
        }
        const channels = resCh.value;
        const streams = resSt.value;

        const nomeCategoria = new Map();
        if (resCat.status === 'fulfilled' && Array.isArray(resCat.value)) {
            resCat.value.forEach(c => {
                if (c && c.id) nomeCategoria.set(c.id, c.name || c.id);
            });
        }

        const logoPorId = new Map();
        if (resM3u.status === 'fulfilled') {
            parseM3U(resM3u.value).forEach(c => {
                if (c.tvgId && c.logo && !logoPorId.has(c.tvgId)) logoPorId.set(c.tvgId, c.logo);
            });
        }

        const freeTvPorNome = new Map();
        if (resFreeTv.status === 'fulfilled') {
            parseM3U(resFreeTv.value).forEach(c => {
                const chave = normalizarNome(c.name);
                if (chave && !freeTvPorNome.has(chave)) freeTvPorNome.set(chave, c);
            });
        }

        const urlsPorCanal = new Map();
        for (const s of streams) {
            if (!s.channel || !s.url) continue;
            if (!urlsPorCanal.has(s.channel)) urlsPorCanal.set(s.channel, []);
            const lista = urlsPorCanal.get(s.channel);
            if (!lista.includes(s.url)) lista.push(s.url);
        }

        const linksFuncionais = obterLinksFuncionais();

        const lista = [];
        for (const c of channels) {
            if (c.closed || c.is_nsfw) continue;

            const paises = Array.isArray(c.country) ? c.country : [c.country];
            const ehBR = paises.some(p => (p || '').toUpperCase() === PAIS);
            if (!ehBR) continue;

            const candidatos = (urlsPorCanal.get(c.id) || []).slice();

            const matchFreeTv = freeTvPorNome.get(normalizarNome(c.name));
            if (matchFreeTv && matchFreeTv.url && !candidatos.includes(matchFreeTv.url)) {
                candidatos.push(matchFreeTv.url);
            }

            if (!candidatos.length) continue;

            const linkSalvo = linksFuncionais[c.id];
            if (linkSalvo && candidatos.includes(linkSalvo) && candidatos[0] !== linkSalvo) {
                candidatos.splice(candidatos.indexOf(linkSalvo), 1);
                candidatos.unshift(linkSalvo);
            }

            const cats = (Array.isArray(c.categories) ? c.categories : [])
                .map(id => nomeCategoria.get(id) || id)
                .filter(Boolean);

            lista.push({
                id: c.id,
                name: c.name,
                logo: logoPorId.get(c.id) || c.logo || (matchFreeTv && matchFreeTv.logo) || '',
                country: c.country || '',
                categorias: cats,
                categoriaPrincipal: cats[0] || '',
                urls: candidatos,
            });
        }

        lista.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        const catsDisponiveis = new Set();
        lista.forEach(c => c.categorias.forEach(cat => catsDisponiveis.add(cat)));

        return { canais: lista, categorias: Array.from(catsDisponiveis).sort() };
    }

    function init() {
        if (window._iptv) return;

        const style = document.createElement('style');
        style.setAttribute('data-iptv', '1');
        style.textContent = `
        @keyframes iptvSpin{to{transform:rotate(360deg)}}

        /* ===== Container principal =====
           O tamanho real é setado via JS (aplicarLayout). CSS aqui é só fallback. */
        #${UID}{position:fixed;top:70px;left:70px;width:966px;height:453px;
            box-sizing:border-box;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            background:#1a1410;
            border:3px solid #3d2b1f;border-radius:12px;overflow:hidden;
            z-index:2147483000;display:flex;flex-direction:column;
            box-shadow:
                0 20px 50px rgba(0,0,0,0.75),
                0 0 0 1px rgba(255,140,66,0.12),
                0 0 28px rgba(255,140,66,0.10),
                inset 0 0 0 1px rgba(255,140,66,0.10),
                inset 0 0 22px rgba(255,140,66,0.05);
        }

        /* ===== Header retrô ===== */
        #${UID} .iptv-hdr{height:${HEADER_HEIGHT}px;box-sizing:border-box;flex-shrink:0;
            display:flex;align-items:center;justify-content:space-between;
            padding:0 12px;cursor:grab;user-select:none;
            background:linear-gradient(180deg,#2a1f18 0%,#1a1410 100%);
            border-bottom:2px solid #3d2b1f;overflow:hidden;
            transition:height .22s cubic-bezier(.4,0,.2,1),
                       border-bottom-width .22s cubic-bezier(.4,0,.2,1),
                       opacity .18s ease}
        #${UID}.header-hidden .iptv-hdr{height:0;border-bottom-width:0;opacity:0}
        #${UID} .iptv-hdr:active{cursor:grabbing}
        #${UID} .iptv-brand{display:flex;align-items:center;gap:10px}
        #${UID} .iptv-led{width:7px;height:7px;border-radius:50%;background:#ff2d2d;
            box-shadow:0 0 10px #ff2d2d,0 0 20px rgba(255,45,45,0.4)}
        #${UID} .iptv-title{font-weight:800;font-size:12px;letter-spacing:.18em;color:#e8d5b7;
            font-family:"Courier New",monospace;text-transform:uppercase}
        #${UID} .iptv-actions{display:flex;gap:6px;align-items:center}
        #${UID} .iptv-btn{width:26px;height:26px;border-radius:6px;
            background:linear-gradient(180deg,#3d2b1f,#2a1f18);
            border:1px solid #4a3527;color:#e8d5b7;
            display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;
            transition:all .15s ease}
        #${UID} .iptv-btn:hover{background:#ff8c42;color:#1a1410;border-color:#ff8c42;
            box-shadow:0 0 12px rgba(255,140,66,0.6)}
        #${UID} .iptv-btn.active{background:#ff8c42;color:#1a1410;border-color:#ff8c42}

        /* Botão flutuante que aparece quando o header está oculto */
        #${UID} .iptv-unhide{position:absolute;top:8px;right:8px;z-index:15;
            width:26px;height:26px;border-radius:6px;
            background:rgba(61,43,31,0.75);
            border:1px solid rgba(255,140,66,0.3);
            color:#e8d5b7;display:none;align-items:center;justify-content:center;
            font-size:12px;cursor:pointer;
            opacity:0;transition:opacity .2s, background .15s, box-shadow .15s}
        #${UID}.header-hidden .iptv-unhide{display:flex}
        #${UID}:hover .iptv-unhide{opacity:1}
        #${UID} .iptv-unhide:hover{background:#ff8c42;color:#1a1410;border-color:#ff8c42;
            box-shadow:0 0 12px rgba(255,140,66,0.6)}

        /* ===== Layout ===== */
        #${UID} .iptv-main{flex:1;min-height:0;display:flex;position:relative}

        /* ===== Lista lateral (minimizável) ===== */
        #${UID} .iptv-list{width:${LIST_WIDTH}px;flex-shrink:0;
            border-right:2px solid #3d2b1f;
            display:flex;flex-direction:column;min-height:0;
            background:linear-gradient(180deg,#1e1712,#16100c);
            overflow:hidden;
            transition:width .25s cubic-bezier(.4,0,.2,1),
                       border-right-width .25s cubic-bezier(.4,0,.2,1)}
        #${UID} .iptv-main.list-hidden .iptv-list{width:0;border-right-width:0}

        #${UID} .iptv-search{padding:10px 10px 6px;flex-shrink:0}
        #${UID} .iptv-search input{width:100%;background:#0f0b08;
            border:1px solid #3d2b1f;border-radius:6px;padding:7px 10px;
            color:#e8d5b7;font-size:11px;outline:none;box-sizing:border-box;
            font-family:"Courier New",monospace}
        #${UID} .iptv-search input::placeholder{color:#6b5a4a}
        #${UID} .iptv-search input:focus{border-color:#ff8c42;box-shadow:0 0 8px rgba(255,140,66,0.3)}

        #${UID} .iptv-filters{display:flex;flex-wrap:wrap;gap:4px;padding:0 10px 8px;flex-shrink:0;
            max-height:80px;overflow-y:auto}
        #${UID} .iptv-filters::-webkit-scrollbar{width:3px}
        #${UID} .iptv-filters::-webkit-scrollbar-thumb{background:#3d2b1f;border-radius:2px}
        #${UID} .iptv-chip{font-size:9px;font-weight:700;letter-spacing:.04em;
            padding:3px 8px;border-radius:10px;cursor:pointer;
            background:#2a1f18;border:1px solid #3d2b1f;color:#8b7a6a;
            text-transform:uppercase;transition:all .15s ease;white-space:nowrap}
        #${UID} .iptv-chip:hover{border-color:#ff8c42;color:#e8d5b7}
        #${UID} .iptv-chip.active{background:#ff8c42;color:#1a1410;border-color:#ff8c42}
        #${UID} .iptv-chip.fav-chip{border-color:#ffd700;color:#ffd700}
        #${UID} .iptv-chip.fav-chip.active{background:#ffd700;color:#1a1410}

        #${UID} .iptv-channels{flex:1;overflow-y:auto;padding:0 6px 8px}
        #${UID} .iptv-channels::-webkit-scrollbar{width:5px}
        #${UID} .iptv-channels::-webkit-scrollbar-thumb{background:#3d2b1f;border-radius:3px}
        #${UID} .iptv-channels::-webkit-scrollbar-thumb:hover{background:#ff8c42}

        #${UID} .iptv-ch{display:flex;align-items:center;gap:8px;
            padding:7px 8px;border-radius:6px;cursor:pointer;
            font-size:11px;color:#d4c4b0;transition:background .12s, opacity .12s}
        #${UID} .iptv-ch:hover{background:rgba(255,140,66,0.1)}
        #${UID} .iptv-ch.active{background:rgba(255,140,66,0.18);color:#fff}
        #${UID} .iptv-ch.iptv-ch-falhou{opacity:.4}
        #${UID} .iptv-ch img{width:22px;height:22px;object-fit:contain;border-radius:4px;
            flex-shrink:0;background:#0f0b08}
        #${UID} .iptv-ch-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
        #${UID} .iptv-ch-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .iptv-ch-meta{font-size:9px;color:#6b5a4a;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .iptv-star{flex-shrink:0;font-size:13px;color:#4a3527;cursor:pointer;
            transition:color .15s, transform .15s;background:none;border:0;padding:0 2px}
        #${UID} .iptv-star:hover{transform:scale(1.2)}
        #${UID} .iptv-star.faved{color:#ffd700;text-shadow:0 0 6px rgba(255,215,0,0.5)}
        #${UID} .iptv-badge-off{flex-shrink:0;font-size:8px;font-weight:800;
            letter-spacing:.04em;color:#ff8080;background:rgba(255,45,45,0.15);
            border:1px solid rgba(255,45,45,0.3);border-radius:4px;padding:1px 4px}

        #${UID} .iptv-loading,#${UID} .iptv-err{padding:16px;text-align:center;
            color:#6b5a4a;font-size:11px;font-family:"Courier New",monospace}
        #${UID} .iptv-spin{width:16px;height:16px;
            border:2px solid rgba(255,140,66,0.2);border-top-color:#ff8c42;
            border-radius:50%;margin:0 auto 8px;animation:iptvSpin .7s linear infinite}

        /* ===== Player — SEM overlay CRT ===== */
        #${UID} .iptv-player{flex:1;min-width:0;position:relative;background:#000;
            display:flex;align-items:center;justify-content:center;overflow:hidden;
            /* leve vinheta interna pra dar sensação de "tela embutida" sem cobrir o vídeo */
            box-shadow:inset 0 0 24px rgba(0,0,0,0.55)}
        #${UID} .iptv-player video{width:100%;height:100%;object-fit:contain;display:block}
        #${UID} .iptv-placeholder{color:#6b5a4a;font-size:12px;text-align:center;padding:20px;
            font-family:"Courier New",monospace}

        /* ===== Handle de resize ===== */
        #${UID} .iptv-resize{position:absolute;right:4px;bottom:4px;width:18px;height:18px;
            cursor:nwse-resize;z-index:20;
            background:linear-gradient(135deg,transparent 48%,#ff8c42 48%,#ff8c42 52%,transparent 52%,
                                                transparent 62%,#ff8c42 62%,#ff8c42 66%,transparent 66%,
                                                transparent 76%,#ff8c42 76%,#ff8c42 80%,transparent 80%);
            opacity:.35;transition:opacity .15s}
        #${UID} .iptv-resize:hover{opacity:1}
        `;
        document.head.appendChild(style);

        const win = document.createElement('div');
        win.id = UID;
        win.innerHTML = `
            <div class="iptv-hdr" id="${UID}hdr">
                <div class="iptv-brand">
                    <span class="iptv-led"></span>
                    <span class="iptv-title">IPTV · BR</span>
                </div>
                <div class="iptv-actions">
                    <div class="iptv-btn" id="${UID}hdrToggle" title="Ocultar cabeçalho">▭</div>
                    <div class="iptv-btn" id="${UID}listToggle" title="Ocultar lista">◧</div>
                    <div class="iptv-btn" id="${UID}min" title="Minimizar">−</div>
                    <div class="iptv-btn" id="${UID}cls" title="Fechar">✕</div>
                </div>
            </div>
            <div class="iptv-main" id="${UID}main">
                <div class="iptv-list">
                    <div class="iptv-search">
                        <input type="text" id="${UID}search" placeholder="buscar canal…" />
                    </div>
                    <div class="iptv-filters" id="${UID}filters"></div>
                    <div class="iptv-channels" id="${UID}channels">
                        <div class="iptv-loading"><div class="iptv-spin"></div>carregando…</div>
                    </div>
                </div>
                <div class="iptv-player" id="${UID}player">
                    <div class="iptv-placeholder">▶ selecione um canal</div>
                </div>
            </div>
            <div class="iptv-unhide" id="${UID}unhide" title="Mostrar cabeçalho">▭</div>
            <div class="iptv-resize" id="${UID}resize"></div>
        `;
        document.body.appendChild(win);

        // ---- Elementos ----
        const mainEl = win.querySelector('#' + UID + 'main');
        const channelsEl = win.querySelector('#' + UID + 'channels');
        const playerEl = win.querySelector('#' + UID + 'player');
        const searchEl = win.querySelector('#' + UID + 'search');
        const filtersEl = win.querySelector('#' + UID + 'filters');
        const hdr = win.querySelector('#' + UID + 'hdr');
        const resizeHandle = win.querySelector('#' + UID + 'resize');

        let allChannels = [];
        let allCategories = [];
        let hls = null;
        let conectarTimeout = null;
        let chamadaAtual = 0;
        let filtroCategoria = null;
        let mostrarSoFavoritos = false;
        let termoBusca = '';

        // Estado de tamanho — a janela toda em pixels (border-box)
        const state = { winW: 966 };

        // ---- Layout: calcula janela a partir do estado ----
        function aplicarLayout(animar) {
            const listVisible = !mainEl.classList.contains('list-hidden');
            const headerVisible = !win.classList.contains('header-hidden');
            const listW = listVisible ? LIST_WIDTH : 0;
            const headerH = headerVisible ? HEADER_HEIGHT : 0;

            // Largura do vídeo = largura da janela - bordas - lista
            const videoW = state.winW - BORDER_TOTAL - listW;
            const videoH = videoW * 9 / 16;
            const winH = videoH + headerH + BORDER_TOTAL;

            win.style.transition = animar
                ? 'width .25s cubic-bezier(.4,0,.2,1), height .25s cubic-bezier(.4,0,.2,1)'
                : 'none';
            win.style.width = Math.round(state.winW) + 'px';
            win.style.height = Math.round(winH) + 'px';
            if (animar) {
                setTimeout(() => { if (!resizeState) win.style.transition = ''; }, 280);
            }
        }

        // ---- Drag do header ----
        let drag = null;
        hdr.addEventListener('mousedown', e => {
            if (e.target.closest('.iptv-btn')) return;
            const r = win.getBoundingClientRect();
            drag = { x: e.clientX - r.left, y: e.clientY - r.top };
        });
        function aoMoverJanela(e) {
            if (!drag) return;
            win.style.left = Math.max(0, e.clientX - drag.x) + 'px';
            win.style.top = Math.max(0, e.clientY - drag.y) + 'px';
        }
        function aoSoltarJanela() { drag = null; }
        document.addEventListener('mousemove', aoMoverJanela);
        document.addEventListener('mouseup', aoSoltarJanela);

        // ---- Resize travado em 16:9 (na ÁREA DO VÍDEO) ----
        let resizeState = null;
        resizeHandle.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            const listVisible = !mainEl.classList.contains('list-hidden');
            resizeState = {
                startX: e.clientX,
                startY: e.clientY,
                startWinW: state.winW,
                listVisible,
            };
            win.style.transition = 'none';
        });
        function aoMoverResize(e) {
            if (!resizeState) return;
            const dx = e.clientX - resizeState.startX;
            const dy = e.clientY - resizeState.startY;

            // Converte o movimento vertical para equivalente horizontal (16:9),
            // e usa o eixo com maior magnitude para dirigir o tamanho.
            const dyAsDx = dy * ASPECT_RATIO;
            const delta = Math.abs(dx) > Math.abs(dyAsDx) ? dx : dyAsDx;

            const listW = resizeState.listVisible ? LIST_WIDTH : 0;
            const minWinW = MIN_VIDEO_W + BORDER_TOTAL + listW;
            const maxWinW = MAX_VIDEO_W + BORDER_TOTAL + listW;

            let novoWinW = resizeState.startWinW + delta;
            novoWinW = Math.max(minWinW, Math.min(maxWinW, novoWinW));
            state.winW = novoWinW;
            aplicarLayout(false);
        }
        function aoSoltarResize() {
            if (!resizeState) return;
            resizeState = null;
            win.style.transition = '';
        }
        document.addEventListener('mousemove', aoMoverResize);
        document.addEventListener('mouseup', aoSoltarResize);

        // ---- Render: chips de filtro ----
        function renderFiltros() {
            const chips = [];
            chips.push(`<span class="iptv-chip fav-chip${mostrarSoFavoritos ? ' active' : ''}" data-fav="1">★ favoritos</span>`);
            chips.push(`<span class="iptv-chip${filtroCategoria === null ? ' active' : ''}" data-cat="">todos</span>`);
            allCategories.forEach(cat => {
                const ativo = filtroCategoria === cat ? ' active' : '';
                chips.push(`<span class="iptv-chip${ativo}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</span>`);
            });
            filtersEl.innerHTML = chips.join('');

            filtersEl.querySelectorAll('.iptv-chip').forEach(el => {
                el.addEventListener('click', () => {
                    if (el.dataset.fav) {
                        mostrarSoFavoritos = !mostrarSoFavoritos;
                    } else {
                        const cat = el.dataset.cat || null;
                        filtroCategoria = cat === '' ? null : cat;
                    }
                    renderFiltros();
                    renderChannels();
                });
            });
        }

        // ---- Render: lista de canais ----
        function badgeFalhaHtml(id) {
            const registro = obterStatusFalha(id);
            if (!registro) return '';
            return '<span class="iptv-badge-off" title="Falhou ' + escapeHtml(formatarRelativoCurto(registro.em)) + '">OFF</span>';
        }

        function renderChannels() {
            const q = termoBusca.toLowerCase();
            let filtered = allChannels;

            if (mostrarSoFavoritos) {
                const favs = obterFavoritos();
                filtered = filtered.filter(c => favs.includes(c.id));
            }
            if (filtroCategoria) {
                filtered = filtered.filter(c => c.categorias.includes(filtroCategoria));
            }
            if (q) {
                filtered = filtered.filter(c =>
                    c.name.toLowerCase().includes(q) ||
                    c.categoriaPrincipal.toLowerCase().includes(q)
                );
            }

            if (!filtered.length) {
                channelsEl.innerHTML = '<div class="iptv-err">nenhum canal encontrado</div>';
                return;
            }

            const limit = q || filtroCategoria || mostrarSoFavoritos ? filtered.length : 300;
            const visiveis = filtered.slice(0, limit);

            channelsEl.innerHTML = visiveis.map(c => {
                const falhou = !!obterStatusFalha(c.id);
                const fav = ehFavorito(c.id);
                const logoSrc = c.logo || logoPlaceholder(c.name);
                const fallback = logoPlaceholder(c.name);
                const meta = c.categorias.slice(0, 2).join(' · ');
                return `
                <div class="iptv-ch${falhou ? ' iptv-ch-falhou' : ''}" data-id="${escapeHtml(c.id)}">
                    <img src="${escapeHtml(logoSrc)}" alt=""
                         loading="lazy" decoding="async" referrerpolicy="no-referrer"
                         onerror="this.onerror=null;this.src='${fallback}'"/>
                    <span class="iptv-ch-info">
                        <span class="iptv-ch-name">${escapeHtml(c.name)}</span>
                        ${meta ? `<span class="iptv-ch-meta">${escapeHtml(meta)}</span>` : ''}
                    </span>
                    <button class="iptv-star${fav ? ' faved' : ''}" data-star="${escapeHtml(c.id)}"
                            title="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${fav ? '★' : '☆'}</button>
                    ${badgeFalhaHtml(c.id)}
                </div>
            `;
            }).join('');

            channelsEl.querySelectorAll('.iptv-ch').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.iptv-star')) return;
                    const canal = allChannels.find(c => c.id === el.dataset.id);
                    if (canal) playChannel(canal, el);
                });
            });

            channelsEl.querySelectorAll('.iptv-star').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.star;
                    const agoraFav = toggleFavorito(id);
                    btn.textContent = agoraFav ? '★' : '☆';
                    btn.classList.toggle('faved', agoraFav);
                    if (mostrarSoFavoritos) renderChannels();
                });
            });
        }

        // ---- Reprodução com fallback em cascata ----
        async function playChannel(ch, itemEl) {
            const minhaChamada = ++chamadaAtual;
            clearTimeout(conectarTimeout);

            channelsEl.querySelectorAll('.iptv-ch').forEach(el => el.classList.remove('active'));
            if (itemEl) itemEl.classList.add('active');

            const candidatos = ch.urls || [];
            if (!candidatos.length) {
                playerEl.innerHTML = '<div class="iptv-placeholder">⚠ sem fonte disponível</div>';
                return;
            }

            let indice = 0;

            function sucesso(url) {
                if (minhaChamada !== chamadaAtual) return;
                clearTimeout(conectarTimeout);
                limparFalha(ch.id);
                salvarLinkFuncional(ch.id, url);
                if (itemEl) {
                    itemEl.classList.remove('iptv-ch-falhou');
                    itemEl.querySelector('.iptv-badge-off')?.remove();
                }
            }

            function tudoFalhou() {
                if (minhaChamada !== chamadaAtual) return;
                marcarFalha(ch.id, 'todas-fontes');
                if (itemEl) {
                    itemEl.classList.add('iptv-ch-falhou');
                    if (!itemEl.querySelector('.iptv-badge-off')) {
                        itemEl.insertAdjacentHTML('beforeend', badgeFalhaHtml(ch.id));
                    }
                }
                playerEl.innerHTML = '<div class="iptv-placeholder">⚠ nenhuma fonte funcionou</div>';
            }

            function proximaFonte() {
                if (minhaChamada !== chamadaAtual) return;
                clearTimeout(conectarTimeout);
                if (hls) { hls.destroy(); hls = null; }
                indice++;
                tentar();
            }

            async function tentar() {
                if (minhaChamada !== chamadaAtual) return;
                if (indice >= candidatos.length) { tudoFalhou(); return; }

                const url = candidatos[indice];
                let tentativasRecuperacao = 0;
                const rotulo = candidatos.length > 1 ? ` (${indice + 1}/${candidatos.length})` : '';
                playerEl.innerHTML = '<div class="iptv-placeholder"><div class="iptv-spin"></div>conectando' + rotulo + '</div>';

                conectarTimeout = setTimeout(proximaFonte, CONECTAR_TIMEOUT_MS);

                try {
                    const Hls = await loadHlsJs();
                    if (minhaChamada !== chamadaAtual) return;

                    playerEl.innerHTML = '<video id="' + UID + 'video" controls autoplay></video>';
                    const video = document.getElementById(UID + 'video');
                    video.addEventListener('playing', () => sucesso(url), { once: true });

                    if (hls) { hls.destroy(); hls = null; }

                    if (Hls.isSupported()) {
                        const instancia = new Hls();
                        hls = instancia;
                        instancia.loadSource(url);
                        instancia.attachMedia(video);
                        instancia.on(Hls.Events.ERROR, (event, data) => {
                            if (minhaChamada !== chamadaAtual || hls !== instancia) return;
                            if (!data.fatal) return;

                            if (tentativasRecuperacao < MAX_TENTATIVAS_RECUPERACAO) {
                                tentativasRecuperacao++;
                                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { instancia.startLoad(); return; }
                                if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { instancia.recoverMediaError(); return; }
                            }
                            proximaFonte();
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.addEventListener('error', proximaFonte, { once: true });
                        video.src = url;
                    } else {
                        clearTimeout(conectarTimeout);
                        playerEl.innerHTML = '<div class="iptv-placeholder">navegador sem suporte a HLS</div>';
                    }
                } catch (e) {
                    proximaFonte();
                }
            }

            tentar();
        }

        // ---- Eventos de UI ----
        let buscaDebounce = null;
        searchEl.addEventListener('input', () => {
            clearTimeout(buscaDebounce);
            buscaDebounce = setTimeout(() => {
                termoBusca = searchEl.value;
                renderChannels();
            }, 180);
        });

        // Toggle: ocultar lista (afeta a largura da janela por causa do 16:9)
        win.querySelector('#' + UID + 'listToggle').addEventListener('click', (e) => {
            const viraOculto = !mainEl.classList.contains('list-hidden');

            // Se vamos ocultar a lista, mantém a janela: o vídeo cresce horizontalmente.
            // Se vamos mostrar, mantém a janela: o vídeo encolhe e cede espaço.
            // Em ambos os casos o estado winW permanece; aplicarLayout recalcula.
            mainEl.classList.toggle('list-hidden');
            e.currentTarget.classList.toggle('active', mainEl.classList.contains('list-hidden'));

            // Se a janela ficaria menor que o mínimo, ajusta o winW pro mínimo
            const listW = mainEl.classList.contains('list-hidden') ? 0 : LIST_WIDTH;
            const minWinW = MIN_VIDEO_W + BORDER_TOTAL + listW;
            if (state.winW < minWinW) state.winW = minWinW;

            aplicarLayout(true);
        });

        // Toggle: ocultar header
        function toggleHeader() {
            win.classList.toggle('header-hidden');
            aplicarLayout(true);
        }
        win.querySelector('#' + UID + 'hdrToggle').addEventListener('click', toggleHeader);
        win.querySelector('#' + UID + 'unhide').addEventListener('click', toggleHeader);

        // ---- Carga inicial ----
        aplicarLayout(false);

        carregarDados()
            .then(({ canais, categorias }) => {
                allChannels = canais;
                allCategories = categorias;
                renderFiltros();
                renderChannels();
                if (!canais.length) {
                    channelsEl.innerHTML = '<div class="iptv-err">nenhum canal BR disponível</div>';
                }
            })
            .catch(e => {
                channelsEl.innerHTML = '<div class="iptv-err">⚠ falha ao carregar<br>' + escapeHtml(e.message) + '</div>';
            });

        // ---- Minimizar / Fechar ----
        function minimize() { win.style.display = 'none'; }
        function kill() {
            clearTimeout(conectarTimeout);
            clearTimeout(buscaDebounce);
            chamadaAtual++;
            if (hls) hls.destroy();
            document.removeEventListener('mousemove', aoMoverJanela);
            document.removeEventListener('mouseup', aoSoltarJanela);
            document.removeEventListener('mousemove', aoMoverResize);
            document.removeEventListener('mouseup', aoSoltarResize);
            win.remove();
            style.remove();
            delete window._iptv;
        }
        win.querySelector('#' + UID + 'min').addEventListener('click', minimize);
        win.querySelector('#' + UID + 'cls').addEventListener('click', kill);

        window._iptv = {
            kill,
            show: () => { win.style.display = 'flex'; aplicarLayout(false); }
        };
    }

    if (document.body) {
        init();
    } else {
        const iv = setInterval(() => {
            if (document.body) { clearInterval(iv); init(); }
        }, 80);
    }
})();
