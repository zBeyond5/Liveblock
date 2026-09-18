// modules/iptv.js (Smart TV shell v2)
(function() {
    'use strict';
    const UID = '_iptv';
    if (window._iptv) return;

    const HLS_JS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
    const FONT_URL = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&display=swap';
    const CHANNELS_API_URL = 'https://iptv-org.github.io/api/channels.json';
    const STREAMS_API_URL = 'https://iptv-org.github.io/api/streams.json';
    const CATEGORIES_API_URL = 'https://iptv-org.github.io/api/categories.json';
    const JIKAN_TOP_ANIME_URL = 'https://api.jikan.moe/v4/top/anime?limit=24';
    const PAIS = 'BR';
    const PLAYLIST_URL = `https://iptv-org.github.io/iptv/countries/${PAIS.toLowerCase()}.m3u`;
    const FREE_TV_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

    const CACHE_PREFIX = 'iptv_';
    const FALHA_TTL_MS = 6 * 60 * 60 * 1000;
    const CONECTAR_TIMEOUT_MS = 9000;
    const MAX_TENTATIVAS_RECUPERACAO = 1;
    const CLOCK_TICK_MS = 1000;

    const ASPECT_RATIO = 16 / 9;
    const HEADER_HEIGHT = 56;
    const CONTROLBAR_HEIGHT = 76;
    const BORDER_TOTAL = 2;
    const MIN_VIDEO_W = 360;
    const MAX_VIDEO_W = 2400;
    const MIN_HOME_W = 620;
    const MAX_HOME_W = 1700;
    const MIN_HOME_H = 420;
    const MAX_HOME_H = 1050;

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

    // ---------- Estado ----------
    const estado = {
        favoritos: null, falhas: null, links: null,
        _dirty: false, _timeout: null, _carregado: false,
    };

    function _garantirEstadoCarregado() {
        if (estado._carregado) return;
        const favs = lerCache('favoritos', []);
        estado.favoritos = new Set(Array.isArray(favs) ? favs : []);
        const f = lerCache('falhas', {});
        estado.falhas = (f && typeof f === 'object') ? f : {};
        const l = lerCache('links-funcionais', {});
        estado.links = (l && typeof l === 'object') ? l : {};
        estado._carregado = true;
    }

    function persistirAgora() {
        if (!estado._carregado || !estado._dirty) return;
        if (estado._timeout) { clearTimeout(estado._timeout); estado._timeout = null; }
        salvarCache('favoritos', [...estado.favoritos]);
        salvarCache('falhas', estado.falhas);
        salvarCache('links-funcionais', estado.links);
        estado._dirty = false;
    }

    function persistirDebounced() {
        if (!estado._carregado) return;
        estado._dirty = true;
        if (estado._timeout) return;
        estado._timeout = setTimeout(persistirAgora, 500);
    }

    function obterFavoritos() { _garantirEstadoCarregado(); return estado.favoritos; }
    function toggleFavorito(id) {
        _garantirEstadoCarregado();
        if (estado.favoritos.has(id)) { estado.favoritos.delete(id); persistirDebounced(); return false; }
        estado.favoritos.add(id); persistirDebounced(); return true;
    }
    function ehFavorito(id) { _garantirEstadoCarregado(); return estado.favoritos.has(id); }

    function obterFalhas() { _garantirEstadoCarregado(); return estado.falhas; }
    function _tsDe(em) { return typeof em === 'number' ? em : Date.parse(em); }
    function obterStatusFalha(id) {
        _garantirEstadoCarregado();
        const registro = estado.falhas[id];
        if (!registro) return null;
        if (Date.now() - _tsDe(registro.em) > FALHA_TTL_MS) return null;
        return registro;
    }
    function marcarFalha(id, motivo) {
        _garantirEstadoCarregado();
        estado.falhas[id] = { em: Date.now(), motivo: motivo || 'desconhecido' };
        persistirDebounced();
    }
    function limparFalha(id) {
        _garantirEstadoCarregado();
        if (estado.falhas[id]) { delete estado.falhas[id]; persistirDebounced(); }
    }
    function formatarRelativoCurto(em) {
        const diffMin = Math.floor((Date.now() - _tsDe(em)) / 60000);
        if (diffMin < 1) return 'agora';
        if (diffMin < 60) return 'há ' + diffMin + ' min';
        return 'há ' + Math.floor(diffMin / 60) + 'h';
    }

    function obterLinksFuncionais() { _garantirEstadoCarregado(); return estado.links; }
    function salvarLinkFuncional(id, url) {
        _garantirEstadoCarregado();
        if (estado.links[id] === url) return;
        estado.links[id] = url;
        persistirDebounced();
    }

    let abortController = null;

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
            '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
            '<rect width="64" height="64" rx="12" fill="#1b1f26"/>' +
            '<text x="50%" y="53%" font-family="Quicksand,sans-serif" font-size="28" ' +
            'font-weight="700" fill="#22d3ee" text-anchor="middle" dominant-baseline="middle">' +
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
                atual = {
                    name: nomeMatch ? nomeMatch[1].trim() : '',
                    logo: logoMatch ? logoMatch[1] : '',
                    tvgId: idMatch ? idMatch[1] : '',
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
        const res = await fetch(url, { signal: abortController ? abortController.signal : undefined });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' (' + url + ')');
        return res.json();
    }
    async function buscarTexto(url) {
        const res = await fetch(url, { signal: abortController ? abortController.signal : undefined });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' (' + url + ')');
        return res.text();
    }

    // ---------- Carga de canais ----------
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

        const linksFuncionais = estado.links;
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

        return {
            canais: lista,
            categorias: Array.from(catsDisponiveis).sort((a, b) => a.localeCompare(b, 'pt-BR'))
        };
    }

    // ---------- INIT ----------
    function init() {
        if (window._iptv) return;

        _garantirEstadoCarregado();
        abortController = new AbortController();

        if (!document.querySelector('link[data-iptv-font]')) {
            const fl = document.createElement('link');
            fl.rel = 'stylesheet';
            fl.href = FONT_URL;
            fl.setAttribute('data-iptv-font', '1');
            document.head.appendChild(fl);
        }

        const style = document.createElement('style');
        style.setAttribute('data-iptv', '1');
        style.textContent = `
        @keyframes iptvSpin { to { transform: rotate(360deg); } }
        @keyframes iptvHdrShimmer {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
        }
        @keyframes iptvTitleShine { to { background-position: -200% center; } }
        @keyframes iptvHeroIn {
            from { opacity: 0; transform: translateY(14px) scale(.98); }
            to { opacity: 1; transform: none; }
        }
        @keyframes iptvAppIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: none; }
        }
        @keyframes iptvFocusPulse {
            0%, 100% { box-shadow: 0 0 0 2px rgba(255,255,255,.85), 0 0 40px rgba(34,211,238,.16), 0 20px 50px rgba(0,0,0,.6); }
            50% { box-shadow: 0 0 0 3px rgba(255,255,255,.95), 0 0 60px rgba(34,211,238,.3), 0 20px 50px rgba(0,0,0,.6); }
        }
        @keyframes iptvBreathe {
            0%, 100% { opacity: .4; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.15); }
        }

        #${UID} {
            --hub-cyan: #22d3ee;
            --hub-violet: #a78bfa;
            --hub-grad: linear-gradient(120deg, var(--hub-cyan), var(--hub-violet));
            --hub-ok: #34d399;
            --hub-err: #fb7185;
            --hub-muted: #8b8fa3;

            --tv-bg: #08090D;
            --tv-bg-elevated: #0F1116;
            --tv-bg-card: #14171F;
            --tv-bg-card-hover: #1B1F2A;
            --tv-border: rgba(255,255,255,.07);
            --tv-border-soft: rgba(255,255,255,.04);
            --tv-text: #F1F2F8;
            --tv-text-dim: #A0A6B8;
            --tv-text-faint: #5B6373;
            --tv-accent: var(--hub-cyan);
            --tv-accent-bright: #67e8f9;
            --tv-accent-soft: rgba(34,211,238,.14);
            --tv-danger: var(--hub-err);
            --tv-danger-soft: rgba(251,113,133,.15);
            --tv-star: #fbbf24;

            position: fixed;
            top: 60px; left: 60px;
            width: 1000px; height: 640px;
            box-sizing: border-box;
            font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 500;
            background: var(--tv-bg);
            color: var(--tv-text);
            border: 1px solid var(--tv-border);
            border-radius: 22px;
            overflow: hidden;
            z-index: 2147483000;
            display: flex;
            flex-direction: column;
            box-shadow:
                0 30px 80px rgba(0,0,0,.7),
                0 0 0 1px rgba(34,211,238,.08),
                0 0 40px rgba(34,211,238,.06);
            animation: iptvHeroIn .4s cubic-bezier(.16,1,.3,1);
        }

        /* ─── Header ─── */
        #${UID} .iptv-hdr {
            height: ${HEADER_HEIGHT}px;
            box-sizing: border-box;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 18px;
            cursor: grab;
            user-select: none;
            background: rgba(0,0,0,.18);
            border-bottom: 1px solid var(--tv-border);
            position: relative;
            overflow: hidden;
            transition: height .22s cubic-bezier(.4,0,.2,1), opacity .18s ease, border-bottom-width .22s;
        }
        #${UID} .iptv-hdr::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 2px;
            background: var(--hub-grad);
            background-size: 200% 100%;
            animation: iptvHdrShimmer 4s linear infinite;
            box-shadow: 0 0 12px rgba(34,211,238,.4);
        }
        #${UID}.header-hidden .iptv-hdr {
            height: 0;
            opacity: 0;
            border-bottom-width: 0;
        }
        #${UID} .iptv-hdr:active { cursor: grabbing; }

        #${UID} .iptv-hdr-left {
            display: flex;
            align-items: center;
            gap: 14px;
            min-width: 0;
        }
        #${UID} .iptv-clock {
            font-family: 'Fredoka', 'Quicksand', sans-serif;
            font-size: 17px;
            font-weight: 500;
            letter-spacing: .02em;
            color: var(--tv-text);
            font-variant-numeric: tabular-nums;
            text-shadow: 0 0 20px rgba(34,211,238,.15);
        }
        #${UID} .iptv-clock-sep {
            width: 1px;
            height: 18px;
            background: rgba(255,255,255,.1);
        }

        #${UID} .iptv-brand {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #${UID} .iptv-logo {
            width: 30px; height: 30px;
            border-radius: 9px;
            background: var(--tv-bg-card);
            border: 1px solid rgba(255,255,255,.08);
            display: grid;
            place-items: center;
            font-size: 14px;
            color: var(--hub-cyan);
            box-shadow: 0 0 14px rgba(34,211,238,.18);
        }
        #${UID} .iptv-title {
            font-family: 'Fredoka', 'Quicksand', sans-serif;
            font-weight: 600;
            font-size: 15px;
            letter-spacing: .12em;
            text-transform: uppercase;
            background: linear-gradient(100deg, var(--hub-cyan) 0%, var(--hub-violet) 35%, #fff 50%, var(--hub-violet) 65%, var(--hub-cyan) 100%);
            background-size: 220% auto;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: iptvTitleShine 3.2s linear infinite;
        }
        #${UID} .iptv-chip-br {
            font-family: 'Quicksand', sans-serif;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: .12em;
            color: var(--hub-cyan);
            background: var(--tv-accent-soft);
            border-radius: 6px;
            padding: 3px 8px;
        }

        #${UID} .iptv-actions { display: flex; gap: 6px; align-items: center; }
        #${UID} .iptv-btn {
            width: 34px; height: 34px;
            border-radius: 10px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.07);
            color: #c7cad6;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            font-size: 14px;
            transition: all .18s cubic-bezier(.16,1,.3,1);
            flex-shrink: 0;
        }
        #${UID} .iptv-btn:hover {
            color: #0b0b10;
            background: var(--hub-grad);
            border-color: transparent;
            box-shadow: 0 0 14px rgba(34,211,238,.35);
            transform: translateY(-1px);
        }
        #${UID} .iptv-btn:active { transform: translateY(0) scale(.94); }
        #${UID} .iptv-btn:focus-visible { outline: 2px solid var(--hub-cyan); outline-offset: 2px; }

        #${UID} .iptv-unhide {
            position: absolute;
            top: 10px; right: 10px; z-index: 15;
            width: 32px; height: 32px;
            border-radius: 10px;
            background: rgba(20,24,32,.85);
            border: 1px solid var(--tv-border);
            color: var(--tv-text-dim);
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            cursor: pointer;
            opacity: 0;
            transition: opacity .2s, background .15s, color .15s;
        }
        #${UID}.header-hidden .iptv-unhide { display: flex; }
        #${UID}:hover .iptv-unhide { opacity: 1; }
        #${UID} .iptv-unhide:hover { background: var(--hub-cyan); color: #0b0b10; }

        /* ─── Layout com sidebar ─── */
        #${UID} .iptv-body {
            flex: 1;
            min-height: 0;
            position: relative;
            display: flex;
            flex-direction: row;
        }

        #${UID} .iptv-sidebar {
            width: 76px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 18px 0 14px;
            gap: 6px;
            background: rgba(0,0,0,.28);
            border-right: 1px solid var(--tv-border);
            z-index: 5;
        }
        #${UID} .iptv-sidebar-btn {
            width: 46px; height: 46px;
            border: 0;
            border-radius: 14px;
            background: transparent;
            color: var(--tv-text-faint);
            display: grid;
            place-items: center;
            font-size: 19px;
            cursor: pointer;
            transition: all .18s cubic-bezier(.16,1,.3,1);
            position: relative;
        }
        #${UID} .iptv-sidebar-btn:hover {
            background: rgba(255,255,255,.06);
            color: var(--tv-text);
        }
        #${UID} .iptv-sidebar-btn.active {
            background: var(--tv-accent-soft);
            color: var(--hub-cyan);
            box-shadow: inset 0 0 0 1px rgba(34,211,238,.25);
        }
        #${UID} .iptv-sidebar-btn.active::before {
            content: '';
            position: absolute;
            left: -8px;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 22px;
            background: var(--hub-grad);
            border-radius: 3px;
            box-shadow: 0 0 12px rgba(34,211,238,.6);
        }
        #${UID} .iptv-sidebar-spacer { flex: 1; }

        #${UID} .iptv-main {
            flex: 1;
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        #${UID} .smart-home,
        #${UID} .smart-app-container,
        #${UID} .tv-home,
        #${UID} .tv-player { display: none; }
        #${UID}.vista-smart .smart-home { display: flex; }
        #${UID}.vista-app .smart-app-container { display: flex; }
        #${UID}.vista-home .tv-home { display: flex; }
        #${UID}.vista-player .tv-player { display: flex; }

        /* ─── Smart home ─── */
        #${UID} .smart-home {
            flex: 1;
            min-height: 0;
            flex-direction: column;
            padding: 20px 24px 20px;
            gap: 20px;
            overflow-y: auto;
            overflow-x: hidden;
        }
        #${UID} .smart-home::-webkit-scrollbar { width: 6px; }
        #${UID} .smart-home::-webkit-scrollbar-thumb {
            background: var(--tv-border);
            border-radius: 3px;
        }
        #${UID} .smart-home::-webkit-scrollbar-thumb:hover { background: var(--hub-cyan); }

        /* Hero */
        #${UID} .smart-hero {
            position: relative;
            height: 260px;
            flex-shrink: 0;
            border-radius: 22px;
            overflow: hidden;
            background: #0a0e1f;
            padding: 32px 36px;
            display: flex;
            align-items: flex-end;
            border: 1px solid rgba(255,255,255,.07);
            box-shadow:
                0 24px 60px rgba(0,0,0,.55),
                inset 0 1px 0 rgba(255,255,255,.06);
            animation: iptvHeroIn .5s cubic-bezier(.16,1,.3,1);
        }
        #${UID} .smart-hero-bg {
            position: absolute;
            inset: 0;
            background:
                radial-gradient(60% 90% at 12% 15%, rgba(34,211,238,.22) 0%, transparent 55%),
                radial-gradient(70% 100% at 88% 85%, rgba(167,139,250,.28) 0%, transparent 55%),
                linear-gradient(135deg, #0d1220 0%, #191a3a 50%, #241235 100%);
        }
        #${UID} .smart-hero-bg::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image:
                linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
            background-size: 34px 34px;
            -webkit-mask-image: radial-gradient(ellipse at 25% 60%, #000 0%, transparent 70%);
            mask-image: radial-gradient(ellipse at 25% 60%, #000 0%, transparent 70%);
        }
        #${UID} .smart-hero-bg::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(0deg, rgba(8,9,13,.94) 0%, transparent 55%);
        }
        #${UID} .smart-hero-art {
            position: absolute;
            right: -60px;
            top: -20px;
            width: 460px;
            height: 320px;
            opacity: .55;
            filter: drop-shadow(0 20px 60px rgba(0,0,0,.6));
            pointer-events: none;
        }
        #${UID} .smart-hero-content {
            position: relative;
            z-index: 1;
            max-width: 520px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        #${UID} .smart-hero-eyebrow {
            font-family: 'Quicksand', sans-serif;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .14em;
            text-transform: uppercase;
            color: var(--hub-cyan);
            text-shadow: 0 0 12px rgba(34,211,238,.5);
        }
        #${UID} .smart-hero-title {
            margin: 0;
            font-family: 'Fredoka', 'Quicksand', sans-serif;
            font-size: 42px;
            font-weight: 600;
            letter-spacing: -.02em;
            line-height: 1.02;
            color: #fff;
            text-shadow: 0 4px 18px rgba(0,0,0,.6);
        }
        #${UID} .smart-hero-title small {
            display: block;
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            font-weight: 500;
            letter-spacing: 0;
            color: rgba(255,255,255,.55);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: .18em;
        }
        #${UID} .smart-hero-desc {
            margin: 2px 0 6px;
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            font-weight: 500;
            color: rgba(255,255,255,.78);
            line-height: 1.55;
            max-width: 460px;
            text-shadow: 0 2px 8px rgba(0,0,0,.5);
        }
        #${UID} .smart-hero-cta {
            all: unset;
            margin-top: 4px;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 11px 22px;
            border-radius: 12px;
            background: #fff;
            color: #0b0b10;
            font-family: 'Quicksand', sans-serif;
            font-size: 13.5px;
            font-weight: 700;
            letter-spacing: .02em;
            cursor: pointer;
            width: fit-content;
            box-shadow: 0 8px 22px rgba(255,255,255,.18), inset 0 1px 0 rgba(255,255,255,.35);
            transition: transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s;
        }
        #${UID} .smart-hero-cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 30px rgba(255,255,255,.28), inset 0 1px 0 rgba(255,255,255,.45);
        }
        #${UID} .smart-hero-cta:focus-visible {
            outline: 2px solid var(--hub-cyan);
            outline-offset: 3px;
        }
        #${UID} .smart-hero-cta-icon {
            font-size: 10px;
            line-height: 1;
        }

        /* Section */
        #${UID} .smart-section {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        #${UID} .smart-section-title {
            font-family: 'Fredoka', 'Quicksand', sans-serif;
            font-size: 17px;
            font-weight: 500;
            letter-spacing: .01em;
            color: var(--tv-text);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #${UID} .smart-section-title::after {
            content: '';
            flex: 1;
            height: 1px;
            background: linear-gradient(90deg, rgba(255,255,255,.08), transparent);
        }

        /* App row */
        #${UID} .smart-row {
            display: flex;
            gap: 16px;
            overflow-x: auto;
            padding: 4px 2px 14px;
            scroll-behavior: smooth;
            scrollbar-width: none;
        }
        #${UID} .smart-row::-webkit-scrollbar { display: none; }

        /* App card (brand) */
        #${UID} .smart-app {
            all: unset;
            flex-shrink: 0;
            width: 190px;
            height: 118px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 16px;
            border-radius: 16px;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            background: var(--app-bg, linear-gradient(135deg, #1c1f28, #0e1017));
            border: 1px solid rgba(255,255,255,.08);
            box-shadow:
                0 10px 26px rgba(0,0,0,.4),
                inset 0 1px 0 rgba(255,255,255,.06);
            transition:
                transform .22s cubic-bezier(.16,1,.3,1),
                border-color .22s,
                box-shadow .22s;
            animation: iptvAppIn .35s cubic-bezier(.16,1,.3,1) backwards;
        }
        #${UID} .smart-app::before {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(80% 100% at 50% 0%, rgba(255,255,255,.14), transparent 60%);
            opacity: .5;
            pointer-events: none;
        }
        #${UID} .smart-app::after {
            content: '';
            position: absolute;
            top: 0; left: 12%; right: 12%;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent);
            opacity: .5;
        }
        #${UID} .smart-app:hover {
            transform: translateY(-5px);
            border-color: rgba(255,255,255,.22);
            box-shadow:
                0 20px 40px rgba(0,0,0,.5),
                inset 0 1px 0 rgba(255,255,255,.1);
        }
        #${UID} .smart-app:focus-visible,
        #${UID} .smart-app.focused {
            outline: none;
            transform: scale(1.05) translateY(-2px);
            border-color: rgba(255,255,255,.85);
            box-shadow:
                0 0 0 2px rgba(255,255,255,.9),
                0 0 50px rgba(34,211,238,.25),
                0 20px 50px rgba(0,0,0,.6);
            animation: iptvFocusPulse 2.4s ease-in-out infinite;
        }
        #${UID} .smart-app-icon {
            font-size: 30px;
            line-height: 1;
            position: relative;
            z-index: 1;
            filter: drop-shadow(0 6px 16px rgba(0,0,0,.6));
            transition: transform .22s cubic-bezier(.16,1,.3,1);
        }
        #${UID} .smart-app:focus-visible .smart-app-icon,
        #${UID} .smart-app.focused .smart-app-icon { transform: scale(1.1); }
        #${UID} .smart-app-name {
            font-family: 'Fredoka', 'Quicksand', sans-serif;
            font-size: 15px;
            font-weight: 600;
            letter-spacing: .01em;
            color: #fff;
            position: relative;
            z-index: 1;
            text-align: center;
            text-shadow: 0 2px 8px rgba(0,0,0,.55);
        }
        #${UID} .smart-app-tag {
            position: absolute;
            bottom: 8px; right: 10px;
            font-family: 'Quicksand', sans-serif;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: .1em;
            color: rgba(255,255,255,.55);
            text-transform: uppercase;
            z-index: 1;
        }

        /* ─── App containers ─── */
        #${UID} .smart-app-container {
            flex: 1;
            min-height: 0;
            flex-direction: column;
            position: relative;
            overflow: hidden;
            background: #000;
        }

        /* Splash para apps externos */
        #${UID} .app-splash {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 18px;
            padding: 40px;
            text-align: center;
            background: radial-gradient(80% 100% at 50% 0%, var(--splash-glow, rgba(34,211,238,.2)), transparent 60%), #06080d;
        }
        #${UID} .app-splash-icon {
            font-size: 72px;
            line-height: 1;
            filter: drop-shadow(0 12px 30px rgba(0,0,0,.6));
        }
        #${UID} .app-splash-title {
            font-family: 'Fredoka', 'Quicksand', sans-serif;
            font-size: 28px;
            font-weight: 600;
            color: #fff;
            letter-spacing: -.01em;
        }
        #${UID} .app-splash-desc {
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            color: rgba(255,255,255,.7);
            max-width: 420px;
            line-height: 1.55;
        }
        #${UID} .app-splash-btn {
            all: unset;
            padding: 12px 26px;
            border-radius: 12px;
            background: var(--hub-grad);
            color: #0b0b10;
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 10px 26px rgba(34,211,238,.35);
            transition: transform .18s;
        }
        #${UID} .app-splash-btn:hover { transform: translateY(-2px); }
        #${UID} .app-splash-btn:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }

        /* ─── Anime grid ─── */
        #${UID} .anime-wrap {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 22px 26px;
            background: radial-gradient(60% 80% at 50% 0%, rgba(167,139,250,.12), transparent 60%), #06080d;
        }
        #${UID} .anime-wrap::-webkit-scrollbar { width: 6px; }
        #${UID} .anime-wrap::-webkit-scrollbar-thumb { background: var(--tv-border); border-radius: 3px; }
        #${UID} .anime-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 18px;
            gap: 16px;
        }
        #${UID} .anime-title {
            font-family: 'Fredoka', 'Quicksand', sans-serif;
            font-size: 24px;
            font-weight: 600;
            color: #fff;
            letter-spacing: -.01em;
        }
        #${UID} .anime-title small {
            display: block;
            font-family: 'Quicksand', sans-serif;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .16em;
            color: var(--hub-violet);
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        #${UID} .anime-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 14px;
        }
        #${UID} .anime-card {
            all: unset;
            display: flex;
            flex-direction: column;
            gap: 8px;
            cursor: pointer;
            border-radius: 12px;
            overflow: hidden;
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.06);
            transition: transform .2s cubic-bezier(.16,1,.3,1), border-color .2s, background .2s;
            position: relative;
        }
        #${UID} .anime-card:hover {
            transform: translateY(-4px);
            border-color: rgba(167,139,250,.4);
            background: rgba(255,255,255,.06);
        }
        #${UID} .anime-card:focus-visible,
        #${UID} .anime-card.focused {
            outline: none;
            border-color: var(--hub-violet);
            box-shadow: 0 0 0 2px rgba(167,139,250,.55), 0 12px 30px rgba(0,0,0,.5);
        }
        #${UID} .anime-poster {
            aspect-ratio: 2 / 3;
            width: 100%;
            object-fit: cover;
            display: block;
            background: #10131a;
        }
        #${UID} .anime-name {
            padding: 0 10px 4px;
            font-family: 'Quicksand', sans-serif;
            font-size: 12px;
            font-weight: 700;
            color: var(--tv-text);
            line-height: 1.3;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
        #${UID} .anime-meta {
            padding: 0 10px 12px;
            font-family: 'Quicksand', sans-serif;
            font-size: 10.5px;
            font-weight: 500;
            color: var(--tv-text-faint);
        }
        #${UID} .anime-state {
            grid-column: 1 / -1;
            text-align: center;
            padding: 60px 20px;
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            color: var(--tv-text-faint);
        }

        /* ─── TV home ─── */
        #${UID} .tv-home {
            flex: 1;
            min-height: 0;
            flex-direction: column;
        }
        #${UID} .tv-toolbar {
            flex-shrink: 0;
            padding: 18px 24px 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        #${UID} .tv-search input {
            width: 100%;
            background: var(--tv-bg-card);
            border: 1px solid var(--tv-border);
            border-radius: 12px;
            padding: 12px 16px;
            color: var(--tv-text);
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            font-weight: 500;
            outline: none;
            box-sizing: border-box;
            transition: border-color .18s, box-shadow .18s;
        }
        #${UID} .tv-search input::placeholder { color: var(--tv-text-faint); }
        #${UID} .tv-search input:focus {
            border-color: var(--hub-cyan);
            box-shadow: 0 0 0 3px var(--tv-accent-soft);
        }

        #${UID} .tv-chips {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 2px;
            scrollbar-width: none;
        }
        #${UID} .tv-chips::-webkit-scrollbar { display: none; }
        #${UID} .tv-chip {
            flex-shrink: 0;
            font-family: 'Quicksand', sans-serif;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .02em;
            padding: 7px 16px;
            border-radius: 99px;
            cursor: pointer;
            white-space: nowrap;
            background: var(--tv-bg-card);
            border: 1px solid var(--tv-border);
            color: var(--tv-text-dim);
            transition: all .18s;
        }
        #${UID} .tv-chip:hover {
            border-color: var(--hub-cyan);
            color: var(--tv-text);
            background: var(--tv-bg-card-hover);
        }
        #${UID} .tv-chip.active {
            background: var(--hub-grad);
            color: #0b0b10;
            border-color: transparent;
            box-shadow: 0 4px 14px rgba(34,211,238,.3);
        }
        #${UID} .tv-chip:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        #${UID} .tv-chip.fav-chip {
            border-color: rgba(251,191,36,.35);
            color: var(--tv-star);
        }
        #${UID} .tv-chip.fav-chip.active {
            background: var(--tv-star);
            color: #1a1410;
            border-color: transparent;
        }

        #${UID} .tv-grid {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 8px 24px 24px;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 16px;
            align-content: start;
        }
        #${UID} .tv-grid::-webkit-scrollbar { width: 6px; }
        #${UID} .tv-grid::-webkit-scrollbar-thumb {
            background: var(--tv-border);
            border-radius: 3px;
        }
        #${UID} .tv-grid::-webkit-scrollbar-thumb:hover { background: var(--hub-cyan); }

        #${UID} .tv-tile {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 18px 12px 14px;
            border-radius: 14px;
            cursor: pointer;
            background: var(--tv-bg-card);
            border: 1px solid var(--tv-border-soft);
            transition:
                transform .2s cubic-bezier(.16,1,.3,1),
                background .2s,
                border-color .2s,
                box-shadow .2s;
        }
        #${UID} .tv-tile:hover {
            transform: translateY(-4px);
            background: var(--tv-bg-card-hover);
            border-color: rgba(255,255,255,.12);
        }
        #${UID} .tv-tile:focus-visible,
        #${UID} .tv-tile.focused {
            outline: none;
            transform: translateY(-4px) scale(1.04);
            background: var(--tv-bg-card-hover);
            border-color: var(--hub-cyan);
            box-shadow:
                0 0 0 2px rgba(34,211,238,.7),
                0 12px 32px rgba(0,0,0,.5),
                0 0 30px rgba(34,211,238,.2);
        }
        #${UID} .tv-tile.tv-tile-off { opacity: .35; }
        #${UID} .tv-tile-logo {
            width: 64px; height: 64px;
            border-radius: 12px;
            overflow: hidden;
            background: var(--tv-bg-elevated);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        #${UID} .tv-tile-logo img {
            width: 100%; height: 100%;
            object-fit: contain;
        }
        #${UID} .tv-tile-name {
            font-family: 'Quicksand', sans-serif;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            line-height: 1.3;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            color: var(--tv-text);
        }
        #${UID} .tv-tile-meta {
            font-family: 'Quicksand', sans-serif;
            font-size: 10.5px;
            font-weight: 500;
            color: var(--tv-text-faint);
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }
        #${UID} .tv-tile-badge {
            position: absolute;
            bottom: 8px; left: 50%;
            transform: translateX(-50%);
            font-family: 'Quicksand', sans-serif;
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: .06em;
            color: #ff8f8f;
            background: var(--tv-danger-soft);
            border: 1px solid rgba(251,113,133,.35);
            border-radius: 5px;
            padding: 2px 6px;
        }

        #${UID} .tv-star {
            position: absolute;
            top: 8px; right: 8px;
            width: 26px; height: 26px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            background: rgba(10,12,16,.6);
            border: 0;
            color: var(--tv-text-faint);
            cursor: pointer;
            transition: color .15s, transform .15s, background .15s;
        }
        #${UID} .tv-star:hover {
            transform: scale(1.15);
            background: rgba(10,12,16,.85);
        }
        #${UID} .tv-star.faved { color: var(--tv-star); }
        #${UID} .tv-star:focus-visible {
            outline: 2px solid #fff;
            outline-offset: 2px;
        }

        #${UID} .tv-loading,
        #${UID} .tv-empty {
            grid-column: 1 / -1;
            padding: 60px 20px;
            text-align: center;
            color: var(--tv-text-faint);
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            font-weight: 500;
        }
        #${UID} .tv-spin {
            width: 22px; height: 22px;
            border: 2px solid rgba(34,211,238,.2);
            border-top-color: var(--hub-cyan);
            border-radius: 50%;
            margin: 0 auto 14px;
            animation: iptvSpin .7s linear infinite;
        }

        /* ─── Player ─── */
        #${UID} .tv-player {
            flex: 1;
            min-height: 0;
            flex-direction: column;
        }
        #${UID} .tv-video-wrap {
            flex: 1;
            min-height: 0;
            position: relative;
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        #${UID} .tv-video-wrap video {
            width: 100%; height: 100%;
            object-fit: contain;
            display: block;
        }
        #${UID} .tv-placeholder {
            color: var(--tv-text-faint);
            font-family: 'Quicksand', sans-serif;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
            padding: 24px;
            line-height: 1.5;
        }

        #${UID} .tv-controlbar {
            height: ${CONTROLBAR_HEIGHT}px;
            flex-shrink: 0;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 0 24px;
            background: linear-gradient(0deg, rgba(15,18,25,.98), rgba(8,9,13,.95));
            border-top: 1px solid var(--tv-border);
            position: relative;
        }
        #${UID} .tv-controlbar::before {
            content: '';
            position: absolute;
            top: -1px; left: 15%; right: 15%;
            height: 1px;
            background: radial-gradient(ellipse at center, rgba(34,211,238,.5), transparent 70%);
        }
        #${UID} .tv-back {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border-radius: 12px;
            background: var(--tv-bg-card);
            border: 1px solid var(--tv-border);
            color: var(--tv-text);
            font-family: 'Quicksand', sans-serif;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: all .18s cubic-bezier(.16,1,.3,1);
        }
        #${UID} .tv-back:hover {
            background: var(--hub-grad);
            border-color: transparent;
            color: #0b0b10;
            box-shadow: 0 6px 20px rgba(34,211,238,.3);
            transform: translateY(-1px);
        }
        #${UID} .tv-back:focus-visible {
            outline: 2px solid #fff;
            outline-offset: 2px;
        }
        #${UID} .tv-now {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 14px;
        }
        #${UID} .tv-now-logo {
            width: 44px; height: 44px;
            border-radius: 10px;
            flex-shrink: 0;
            background: var(--tv-bg-card);
            object-fit: contain;
            border: 1px solid var(--tv-border-soft);
        }
        #${UID} .tv-now-text {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        #${UID} .tv-now-name {
            font-family: 'Quicksand', sans-serif;
            font-size: 15px;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--tv-text);
        }
        #${UID} .tv-now-meta {
            font-family: 'Quicksand', sans-serif;
            font-size: 11.5px;
            font-weight: 500;
            color: var(--tv-text-dim);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #${UID} .tv-controlbar .tv-star {
            position: static;
            flex-shrink: 0;
            background: var(--tv-bg-card);
            border: 1px solid var(--tv-border);
            width: 44px; height: 44px;
            border-radius: 12px;
            font-size: 16px;
        }
        #${UID} .tv-controlbar .tv-star:hover {
            background: var(--tv-bg-card-hover);
            transform: scale(1.05);
        }

        /* ─── Resize ─── */
        #${UID} .iptv-resize {
            position: absolute;
            right: 4px; bottom: 4px;
            width: 18px; height: 18px;
            cursor: nwse-resize;
            z-index: 20;
            opacity: .25;
            transition: opacity .18s;
            background: linear-gradient(135deg,
                transparent 46%,
                var(--hub-cyan) 46%, var(--hub-cyan) 50%,
                transparent 50%, transparent 60%,
                var(--hub-cyan) 60%, var(--hub-cyan) 64%,
                transparent 64%, transparent 74%,
                var(--hub-cyan) 74%, var(--hub-cyan) 78%,
                transparent 78%);
            border-radius: 0 0 20px 0;
        }
        #${UID} .iptv-resize:hover { opacity: 1; }
        `;
        document.head.appendChild(style);

        const win = document.createElement('div');
        win.id = UID;
        win.className = 'vista-smart';
        win.setAttribute('data-sang-ui', '');
        win.setAttribute('data-hub', '1');
        win.innerHTML = `
            <div class="iptv-hdr" id="${UID}hdr">
                <div class="iptv-hdr-left">
                    <span class="iptv-clock" id="${UID}clock">--:--</span>
                    <span class="iptv-clock-sep" aria-hidden="true"></span>
                    <div class="iptv-brand">
                        <span class="iptv-logo">▣</span>
                        <span class="iptv-title">IPTV</span>
                        <span class="iptv-chip-br">BR</span>
                    </div>
                </div>
                <div class="iptv-actions">
                    <div class="iptv-btn" id="${UID}actSearch" title="Buscar">⌕</div>
                    <div class="iptv-btn" id="${UID}actBell" title="Notificações">◔</div>
                    <div class="iptv-btn" id="${UID}actUser" title="Perfil">◐</div>
                    <div class="iptv-btn" id="${UID}home" title="Início">⌂</div>
                    <div class="iptv-btn" id="${UID}hdrToggle" title="Ocultar cabeçalho">▭</div>
                    <div class="iptv-btn" id="${UID}min" title="Minimizar">−</div>
                    <div class="iptv-btn" id="${UID}cls" title="Fechar">✕</div>
                </div>
            </div>
            <div class="iptv-body">
                <aside class="iptv-sidebar">
                    <button class="iptv-sidebar-btn active" data-nav="home" title="Início">⌂</button>
                    <button class="iptv-sidebar-btn" data-nav="search" title="Buscar">⌕</button>
                    <button class="iptv-sidebar-btn" data-nav="library" title="Biblioteca">▤</button>
                    <button class="iptv-sidebar-btn" data-nav="apps" title="Apps">▦</button>
                    <div class="iptv-sidebar-spacer"></div>
                    <button class="iptv-sidebar-btn" data-nav="downloads" title="Downloads">⤓</button>
                    <button class="iptv-sidebar-btn" data-nav="settings" title="Configurações">⚙</button>
                </aside>
                <div class="iptv-main">
                    <div class="smart-home" id="${UID}smart">
                        <div class="smart-hero">
                            <div class="smart-hero-bg" aria-hidden="true"></div>
                            <svg class="smart-hero-art" viewBox="0 0 400 300" aria-hidden="true">
                                <defs>
                                    <linearGradient id="${UID}heroArt" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stop-color="#22d3ee" stop-opacity=".6"/>
                                        <stop offset="100%" stop-color="#a78bfa" stop-opacity=".15"/>
                                    </linearGradient>
                                </defs>
                                <rect x="40" y="40" width="320" height="220" rx="16" fill="url(#${UID}heroArt)" opacity=".25"/>
                                <rect x="60" y="60" width="280" height="180" rx="12" fill="none" stroke="url(#${UID}heroArt)" stroke-width="1.5" opacity=".55"/>
                                <circle cx="200" cy="150" r="36" fill="none" stroke="url(#${UID}heroArt)" stroke-width="1.5" opacity=".7"/>
                                <path d="M188 138 L188 162 L208 150 Z" fill="url(#${UID}heroArt)" opacity=".8"/>
                            </svg>
                            <div class="smart-hero-content">
                                <span class="smart-hero-eyebrow" id="${UID}greet">Bom dia</span>
                                <h1 class="smart-hero-title">
                                    <small>Sua central de mídia</small>
                                    Bem-vindo ao IPTV
                                </h1>
                                <p class="smart-hero-desc">Canais abertos brasileiros ao vivo, streaming e anime — tudo em um só lugar. Escolha um app abaixo para começar.</p>
                                <button class="smart-hero-cta" type="button" data-app="tv">
                                    <span class="smart-hero-cta-icon" aria-hidden="true">▶</span>
                                    <span>Assistir agora</span>
                                </button>
                            </div>
                        </div>
                        <div class="smart-section">
                            <div class="smart-section-title">Seus apps</div>
                            <div class="smart-row" id="${UID}apps"></div>
                        </div>
                    </div>
                    <div class="smart-app-container" id="${UID}appContainer"></div>
                    <div class="tv-home">
                        <div class="tv-toolbar">
                            <div class="tv-search"><input type="text" id="${UID}search" placeholder="Buscar canal…" /></div>
                            <div class="tv-chips" id="${UID}filters"></div>
                        </div>
                        <div class="tv-grid" id="${UID}grid">
                            <div class="tv-loading"><div class="tv-spin"></div>Carregando canais…</div>
                        </div>
                    </div>
                    <div class="tv-player">
                        <div class="tv-video-wrap" id="${UID}video-wrap">
                            <div class="tv-placeholder">▶ Selecione um canal</div>
                        </div>
                        <div class="tv-controlbar">
                            <button class="tv-back" id="${UID}back">← Canais</button>
                            <div class="tv-now">
                                <img class="tv-now-logo" id="${UID}nowLogo" alt="" />
                                <div class="tv-now-text">
                                    <div class="tv-now-name" id="${UID}nowName">—</div>
                                    <div class="tv-now-meta" id="${UID}nowMeta"></div>
                                </div>
                            </div>
                            <button class="tv-star" id="${UID}nowStar" title="Favoritar">☆</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="iptv-unhide" id="${UID}unhide" title="Mostrar cabeçalho">▭</div>
            <div class="iptv-resize" id="${UID}resize"></div>
        `;
        document.body.appendChild(win);

        window._hubUI?.markProtected?.(win);

        const gridEl = win.querySelector('#' + UID + 'grid');
        const videoWrapEl = win.querySelector('#' + UID + 'video-wrap');
        const searchEl = win.querySelector('#' + UID + 'search');
        const filtersEl = win.querySelector('#' + UID + 'filters');
        const hdr = win.querySelector('#' + UID + 'hdr');
        const resizeHandle = win.querySelector('#' + UID + 'resize');
        const backBtn = win.querySelector('#' + UID + 'back');
        const appsRowEl = win.querySelector('#' + UID + 'apps');
        const greetEl = win.querySelector('#' + UID + 'greet');
        const appContainer = win.querySelector('#' + UID + 'appContainer');
        const clockEl = win.querySelector('#' + UID + 'clock');

        // ─── Relógio ───
        let clockTimer = null;
        let clockUltimo = '';
        function atualizarRelogio() {
            if (!clockEl) return;
            const d = new Date();
            const txt = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            if (txt !== clockUltimo) {
                clockEl.textContent = txt;
                clockUltimo = txt;
            }
        }
        atualizarRelogio();
        clockTimer = setInterval(atualizarRelogio, CLOCK_TICK_MS);

        let allChannels = [];
        let allCategories = [];
        let hls = null;
        let conectarTimeout = null;
        let chamadaAtual = 0;
        let filtroCategoria = null;
        let mostrarSoFavoritos = false;
        let termoBusca = '';
        let vista = 'smart';
        let layoutTimeout = null;

        const state = { winW: 1000, winHHome: 640 };

        // ---------- Apps registry ----------
        const apps = new Map();
        let appAtualId = null;
        let appCleanup = null;
        let focoEl = null;

        // TV Aberta (builtin)
        apps.set('tv', {
            id: 'tv',
            name: 'TV Aberta',
            icon: '📺',
            bg: 'linear-gradient(135deg, #0e7490, #164e63)',
            tag: 'BR',
            isBuiltin: true,
        });

        // Streaming apps (mount = splash com CTA)
        function registrarAppExterno(cfg) {
            apps.set(cfg.id, {
                id: cfg.id,
                name: cfg.name,
                icon: cfg.icon,
                bg: cfg.bg,
                tag: cfg.tag,
                glow: cfg.glow,
                desc: cfg.desc,
                url: cfg.url,
                mount(container) {
                    container.innerHTML = '';
                    const splash = document.createElement('div');
                    splash.className = 'app-splash';
                    splash.style.setProperty('--splash-glow', cfg.glow || 'rgba(34,211,238,.2)');

                    const icon = document.createElement('div');
                    icon.className = 'app-splash-icon';
                    icon.textContent = cfg.icon;

                    const title = document.createElement('div');
                    title.className = 'app-splash-title';
                    title.textContent = cfg.name;

                    const desc = document.createElement('div');
                    desc.className = 'app-splash-desc';
                    desc.textContent = cfg.desc || 'Abre o site em nova aba (embeds costumam ser bloqueados).';

                    const btn = document.createElement('button');
                    btn.className = 'app-splash-btn';
                    btn.type = 'button';
                    btn.textContent = 'Abrir ' + cfg.name;
                    btn.addEventListener('click', () => window.open(cfg.url, '_blank', 'noopener'));

                    splash.appendChild(icon);
                    splash.appendChild(title);
                    splash.appendChild(desc);
                    splash.appendChild(btn);
                    container.appendChild(splash);

                    return () => { /* nada a limpar */ };
                }
            });
        }

        registrarAppExterno({
            id: 'netflix',
            name: 'Netflix',
            icon: '🎬',
            bg: 'linear-gradient(135deg, #E50914, #7f0209)',
            glow: 'rgba(229,9,20,.35)',
            tag: 'ASSINATURA',
            desc: 'Filmes, séries e originais. Abre em nova aba.',
            url: 'https://www.netflix.com/browse',
        });
        registrarAppExterno({
            id: 'prime',
            name: 'Prime Video',
            icon: '📼',
            bg: 'linear-gradient(135deg, #00A8E1, #005f80)',
            glow: 'rgba(0,168,225,.35)',
            tag: 'ASSINATURA',
            desc: 'Originais Amazon, filmes e séries. Abre em nova aba.',
            url: 'https://www.primevideo.com/',
        });
        registrarAppExterno({
            id: 'youtube',
            name: 'YouTube',
            icon: '▶',
            bg: 'linear-gradient(135deg, #FF0000, #7f0000)',
            glow: 'rgba(255,0,0,.35)',
            tag: 'GRÁTIS',
            desc: 'Vídeos, clipes e lives. Abre em nova aba.',
            url: 'https://www.youtube.com/',
        });
        registrarAppExterno({
            id: 'disney',
            name: 'Disney+',
            icon: '🏰',
            bg: 'linear-gradient(135deg, #0C1445, #1a237e)',
            glow: 'rgba(26,35,126,.45)',
            tag: 'ASSINATURA',
            desc: 'Disney, Pixar, Marvel, Star Wars. Abre em nova aba.',
            url: 'https://www.disneyplus.com/',
        });
        registrarAppExterno({
            id: 'voot',
            name: 'Voot',
            icon: '🎭',
            bg: 'linear-gradient(135deg, #7C3AED, #4c1d95)',
            glow: 'rgba(124,58,237,.4)',
            tag: 'GRÁTIS',
            desc: 'Conteúdo indiano e reality shows. Abre em nova aba.',
            url: 'https://www.voot.com/',
        });

        // Anime (app com grid de pôsteres via Jikan)
        apps.set('anime', {
            id: 'anime',
            name: 'Anime',
            icon: '🎌',
            bg: 'linear-gradient(135deg, #F47521, #B54708)',
            glow: 'rgba(244,117,33,.4)',
            tag: 'NOVO',
            mount(container) {
                container.innerHTML = '';
                const wrap = document.createElement('div');
                wrap.className = 'anime-wrap';

                const head = document.createElement('div');
                head.className = 'anime-head';
                const h = document.createElement('div');
                h.className = 'anime-title';
                h.innerHTML = '<small>Anime</small>Top do momento';
                head.appendChild(h);
                wrap.appendChild(head);

                const grid = document.createElement('div');
                grid.className = 'anime-grid';
                grid.innerHTML = '<div class="anime-state"><div class="tv-spin"></div>Carregando animes…</div>';
                wrap.appendChild(grid);
                container.appendChild(wrap);

                let cancelado = false;
                const ac = new AbortController();
                const signal = ac.signal;

                fetch(JIKAN_TOP_ANIME_URL, { signal })
                    .then(r => {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                    })
                    .then(data => {
                        if (cancelado) return;
                        const lista = Array.isArray(data?.data) ? data.data : [];
                        if (!lista.length) {
                            grid.innerHTML = '<div class="anime-state">Nenhum anime encontrado.</div>';
                            return;
                        }
                        grid.innerHTML = '';
                        lista.forEach(a => {
                            const titulo = a.title_english || a.title || 'Anime';
                            const img = a.images?.jpg?.image_url || '';
                            const nota = a.score ? '★ ' + a.score.toFixed(1) : '—';
                            const ano = a.year || (a.aired?.prop?.from?.year) || '—';

                            const card = document.createElement('button');
                            card.className = 'anime-card';
                            card.type = 'button';
                            card.title = titulo;

                            const poster = document.createElement('img');
                            poster.className = 'anime-poster';
                            poster.loading = 'lazy';
                            poster.referrerPolicy = 'no-referrer';
                            poster.src = img;
                            poster.alt = '';

                            const nome = document.createElement('div');
                            nome.className = 'anime-name';
                            nome.textContent = titulo;

                            const meta = document.createElement('div');
                            meta.className = 'anime-meta';
                            meta.textContent = nota + ' · ' + ano;

                            card.appendChild(poster);
                            card.appendChild(nome);
                            card.appendChild(meta);

                            card.addEventListener('click', () => {
                                const q = encodeURIComponent(titulo);
                                window.open('https://www.crunchyroll.com/search?q=' + q, '_blank', 'noopener');
                            });

                            grid.appendChild(card);
                        });
                    })
                    .catch(e => {
                        if (cancelado || e.name === 'AbortError') return;
                        grid.innerHTML = '<div class="anime-state">⚠ Falha ao carregar animes.<br>' + escapeHtml(e.message) + '</div>';
                    });

                return () => {
                    cancelado = true;
                    try { ac.abort(); } catch (_) {}
                };
            }
        });

        function fecharAppAtual() {
            if (appCleanup) {
                try { appCleanup(); } catch (e) { console.warn('[IPTV] app cleanup falhou:', e); }
                appCleanup = null;
            }
            appContainer.innerHTML = '';
            appAtualId = null;
        }

        function abrirApp(id) {
            const app = apps.get(id);
            if (!app) return;
            if (appAtualId && appAtualId !== id) fecharAppAtual();
            appAtualId = id;
            setSidebarAtivo(id === 'tv' ? 'library' : 'apps');

            if (app.isBuiltin) {
                vista = 'home';
                win.classList.remove('vista-smart', 'vista-player', 'vista-app');
                win.classList.add('vista-home');
                aplicarLayout(true);
                return;
            }

            appContainer.innerHTML = '';
            win.classList.remove('vista-smart', 'vista-home', 'vista-player');
            win.classList.add('vista-app');
            vista = 'app';

            try {
                const r = app.mount?.(appContainer);
                appCleanup = typeof r === 'function' ? r : null;
            } catch (e) {
                console.warn('[IPTV] app mount falhou:', e);
                appContainer.innerHTML = '<div class="tv-empty">App indisponível.</div>';
            }
            aplicarLayout(true);
        }

        function irParaSmart() {
            if (vista === 'player') pararReproducao();
            if (vista === 'app') fecharAppAtual();
            vista = 'smart';
            win.classList.remove('vista-home', 'vista-player', 'vista-app');
            win.classList.add('vista-smart');
            setSidebarAtivo('home');
            renderApps();
            aplicarLayout(true);
        }

        function setSidebarAtivo(nav) {
            win.querySelectorAll('.iptv-sidebar-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.nav === nav);
            });
        }

        function renderApps() {
            const h = new Date().getHours();
            if (greetEl) greetEl.textContent = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
            appsRowEl.innerHTML = [...apps.values()].map((a, i) => `
                <button class="smart-app focused-target" data-app="${escapeHtml(a.id)}"
                        style="--app-bg:${a.bg || 'linear-gradient(135deg, #1c1f28, #0e1017)'};animation-delay:${Math.min(i * 40, 240)}ms"
                        type="button">
                    <div class="smart-app-icon">${a.icon || '📦'}</div>
                    <div class="smart-app-name">${escapeHtml(a.name)}</div>
                    ${a.tag ? `<span class="smart-app-tag">${escapeHtml(a.tag)}</span>` : ''}
                </button>
            `).join('');
            focarPrimeiro();
        }

        function focar(el) {
            if (focoEl) focoEl.classList.remove('focused');
            focoEl = el;
            if (focoEl) {
                focoEl.classList.add('focused');
                try { focoEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (_) {}
            }
        }

        function focarPrimeiro() {
            if (vista !== 'smart') return;
            const first = appsRowEl.querySelector('.smart-app');
            if (first) focar(first);
        }

        // ---------- Flush em unload ----------
        function aoDescarregar() { persistirAgora(); }
        window.addEventListener('beforeunload', aoDescarregar);
        window.addEventListener('pagehide', aoDescarregar);

        // ---------- Layout ----------
        function aplicarLayout(animar) {
            const headerVisible = !win.classList.contains('header-hidden');
            const headerH = headerVisible ? HEADER_HEIGHT : 0;

            win.style.transition = animar
                ? 'width .25s cubic-bezier(.4,0,.2,1), height .25s cubic-bezier(.4,0,.2,1)'
                : 'none';

            if (vista === 'player') {
                const videoW = state.winW - BORDER_TOTAL;
                const videoH = videoW / ASPECT_RATIO;
                const winH = videoH + headerH + CONTROLBAR_HEIGHT + BORDER_TOTAL;
                win.style.width = Math.round(state.winW) + 'px';
                win.style.height = Math.round(winH) + 'px';
            } else {
                win.style.width = Math.round(state.winW) + 'px';
                win.style.height = Math.round(state.winHHome) + 'px';
            }

            if (animar) {
                clearTimeout(layoutTimeout);
                layoutTimeout = setTimeout(() => {
                    if (!resizeState) win.style.transition = '';
                    layoutTimeout = null;
                }, 280);
            }
        }

        // ---------- Drag ----------
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

        // ---------- Resize ----------
        let resizeState = null;
        resizeHandle.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            resizeState = { startX: e.clientX, startY: e.clientY, startWinW: state.winW, startWinH: state.winHHome };
            win.style.transition = 'none';
        });
        function aoMoverResize(e) {
            if (!resizeState) return;
            const dx = e.clientX - resizeState.startX;
            const dy = e.clientY - resizeState.startY;

            if (vista === 'player') {
                const dyAsDx = dy * ASPECT_RATIO;
                const delta = Math.abs(dx) > Math.abs(dyAsDx) ? dx : dyAsDx;
                const minWinW = MIN_VIDEO_W + BORDER_TOTAL;
                const maxWinW = MAX_VIDEO_W + BORDER_TOTAL;
                state.winW = Math.max(minWinW, Math.min(maxWinW, resizeState.startWinW + delta));
            } else {
                state.winW = Math.max(MIN_HOME_W, Math.min(MAX_HOME_W, resizeState.startWinW + dx));
                state.winHHome = Math.max(MIN_HOME_H, Math.min(MAX_HOME_H, resizeState.startWinH + dy));
            }
            aplicarLayout(false);
        }
        function aoSoltarResize() {
            if (!resizeState) return;
            resizeState = null;
            win.style.transition = '';
        }
        document.addEventListener('mousemove', aoMoverResize);
        document.addEventListener('mouseup', aoSoltarResize);

        // ---------- Navegação home <-> player ----------
        function irParaPlayer() {
            vista = 'player';
            win.classList.remove('vista-smart', 'vista-home', 'vista-app');
            win.classList.add('vista-player');
            setSidebarAtivo('library');
            aplicarLayout(true);
        }
        function pararReproducao() {
            chamadaAtual++;
            clearTimeout(conectarTimeout);
            if (hls) { hls.destroy(); hls = null; }
            videoWrapEl.innerHTML = '<div class="tv-placeholder">▶ Selecione um canal</div>';
        }
        function voltarParaHome() {
            pararReproducao();
            vista = 'home';
            win.classList.remove('vista-smart', 'vista-player', 'vista-app');
            win.classList.add('vista-home');
            setSidebarAtivo('library');
            aplicarLayout(true);
        }
        backBtn.addEventListener('click', voltarParaHome);

        // ---------- Estrela ----------
        function sincronizarEstrela(id) {
            const fav = ehFavorito(id);
            win.querySelectorAll(`[data-star="${CSS.escape(id)}"]`).forEach(btn => {
                btn.textContent = fav ? '★' : '☆';
                btn.classList.toggle('faved', fav);
                btn.title = fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
            });
        }

        // ---------- Clique delegado ----------
        win.addEventListener('click', (e) => {
            const heroCta = e.target.closest('.smart-hero-cta');
            if (heroCta && vista === 'smart') {
                e.preventDefault();
                abrirApp(heroCta.dataset.app || 'tv');
                return;
            }
            const smartCard = e.target.closest('.smart-app');
            if (smartCard && vista === 'smart') {
                e.preventDefault();
                abrirApp(smartCard.dataset.app);
                return;
            }
            const sidebarBtn = e.target.closest('.iptv-sidebar-btn');
            if (sidebarBtn) {
                const nav = sidebarBtn.dataset.nav;
                if (nav === 'home') irParaSmart();
                else if (nav === 'library') abrirApp('tv');
                else if (nav === 'apps') { irParaSmart(); }
                else setSidebarAtivo(nav);
                return;
            }
            const starBtn = e.target.closest('.tv-star');
            if (starBtn && starBtn.dataset.star) {
                e.stopPropagation();
                const id = starBtn.dataset.star;
                toggleFavorito(id);
                sincronizarEstrela(id);
                if (mostrarSoFavoritos && vista === 'home') renderChannels();
                return;
            }
            const tile = e.target.closest('.tv-tile');
            if (tile && vista === 'home') {
                const canal = allChannels.find(c => c.id === tile.dataset.id);
                if (canal) playChannel(canal, tile);
            }
        });

        // ---------- Teclado ----------
        function aoTeclado(e) {
            if (win.style.display === 'none') return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

            if (e.key === 'Escape') {
                if (vista === 'player') { e.preventDefault(); voltarParaHome(); return; }
                if (vista === 'home' || vista === 'app') { e.preventDefault(); irParaSmart(); return; }
                return;
            }

            if (vista !== 'smart') return;

            if (e.key === 'Enter' && focoEl) {
                e.preventDefault();
                abrirApp(focoEl.dataset.app);
                return;
            }

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                const cards = [...appsRowEl.querySelectorAll('.smart-app')];
                if (!cards.length) return;
                e.preventDefault();
                const forward = (e.key === 'ArrowRight' || e.key === 'ArrowDown');
                const idx = focoEl ? cards.indexOf(focoEl) : -1;
                let next = idx + (forward ? 1 : -1);
                next = Math.max(0, Math.min(cards.length - 1, next));
                if (cards[next]) focar(cards[next]);
            }
        }
        document.addEventListener('keydown', aoTeclado);

        // ---------- Filtros ----------
        filtersEl.addEventListener('click', (e) => {
            const chip = e.target.closest('.tv-chip');
            if (!chip) return;
            if (chip.dataset.fav !== undefined) {
                mostrarSoFavoritos = !mostrarSoFavoritos;
            } else {
                const cat = chip.dataset.cat || null;
                filtroCategoria = cat === '' ? null : cat;
            }
            renderFiltros();
            renderChannels();
        });

        function renderFiltros() {
            const chips = [];
            chips.push(`<span class="tv-chip fav-chip${mostarSoFavoritosClass()}" data-fav="1">★ Favoritos</span>`);
            chips.push(`<span class="tv-chip${filtroCategoria === null ? ' active' : ''}" data-cat="">Todos</span>`);
            allCategories.forEach(cat => {
                const ativo = filtroCategoria === cat ? ' active' : '';
                chips.push(`<span class="tv-chip${ativo}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</span>`);
            });
            filtersEl.innerHTML = chips.join('');
        }

        function mostarSoFavoritosClass() { return mostrarSoFavoritos ? ' active' : ''; }

        function badgeFalhaHtml(id) {
            const registro = obterStatusFalha(id);
            if (!registro) return '';
            return '<span class="tv-tile-badge" title="Falhou ' + escapeHtml(formatarRelativoCurto(registro.em)) + '">OFFLINE</span>';
        }

        function renderChannels() {
            const q = termoBusca.toLowerCase();
            let filtered = allChannels;

            if (mostrarSoFavoritos) filtered = filtered.filter(c => estado.favoritos.has(c.id));
            if (filtroCategoria) filtered = filtered.filter(c => c.categorias.includes(filtroCategoria));
            if (q) {
                filtered = filtered.filter(c =>
                    c.name.toLowerCase().includes(q) ||
                    c.categoriaPrincipal.toLowerCase().includes(q)
                );
            }

            if (!filtered.length) {
                gridEl.innerHTML = '<div class="tv-empty">Nenhum canal encontrado.</div>';
                return;
            }

            const limit = q || filtroCategoria || mostrarSoFavoritos ? filtered.length : 300;
            const visiveis = filtered.slice(0, limit);

            const agora = Date.now();
            const falhas = estado.falhas;
            const favs = estado.favoritos;

            gridEl.innerHTML = visiveis.map(c => {
                const reg = falhas[c.id];
                let falhou = false;
                if (reg) {
                    const t = typeof reg.em === 'number' ? reg.em : Date.parse(reg.em);
                    falhou = (agora - t) < FALHA_TTL_MS;
                }
                const fav = favs.has(c.id);
                const logoSrc = c.logo || logoPlaceholder(c.name);
                const fallback = logoPlaceholder(c.name);
                const meta = c.categorias.slice(0, 2).join(' · ');
                return `
                <div class="tv-tile${falhou ? ' tv-tile-off' : ''}" data-id="${escapeHtml(c.id)}">
                    <button class="tv-star${fav ? ' faved' : ''}" data-star="${escapeHtml(c.id)}"
                            title="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${fav ? '★' : '☆'}</button>
                    <div class="tv-tile-logo">
                        <img src="${escapeHtml(logoSrc)}" alt="" loading="lazy" decoding="async"
                             referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallback}'"/>
                    </div>
                    <div class="tv-tile-name">${escapeHtml(c.name)}</div>
                    ${meta ? `<div class="tv-tile-meta">${escapeHtml(meta)}</div>` : ''}
                    ${badgeFalhaHtml(c.id)}
                </div>
            `;
            }).join('');
        }

        function atualizarControlbar(ch) {
            const nowLogo = win.querySelector('#' + UID + 'nowLogo');
            const nowName = win.querySelector('#' + UID + 'nowName');
            const nowMeta = win.querySelector('#' + UID + 'nowMeta');
            const nowStar = win.querySelector('#' + UID + 'nowStar');
            if (nowLogo) nowLogo.src = ch.logo || logoPlaceholder(ch.name);
            if (nowName) nowName.textContent = ch.name;
            if (nowMeta) nowMeta.textContent = ch.categorias.slice(0, 2).join(' · ');
            if (nowStar) {
                nowStar.dataset.star = ch.id;
                const fav = ehFavorito(ch.id);
                nowStar.textContent = fav ? '★' : '☆';
                nowStar.classList.toggle('faved', fav);
            }
        }

        // ---------- Reprodução com fallback ----------
        async function playChannel(ch, itemEl) {
            const minhaChamada = ++chamadaAtual;
            clearTimeout(conectarTimeout);

            irParaPlayer();
            atualizarControlbar(ch);

            const candidatos = ch.urls || [];
            if (!candidatos.length) {
                videoWrapEl.innerHTML = '<div class="tv-placeholder">⚠ Sem fonte disponível</div>';
                return;
            }

            let indice = 0;

            function sucesso(url) {
                if (minhaChamada !== chamadaAtual) return;
                clearTimeout(conectarTimeout);
                limparFalha(ch.id);
                salvarLinkFuncional(ch.id, url);
                if (itemEl) {
                    itemEl.classList.remove('tv-tile-off');
                    itemEl.querySelector('.tv-tile-badge')?.remove();
                }
            }

            function tudoFalhou() {
                if (minhaChamada !== chamadaAtual) return;
                marcarFalha(ch.id, 'todas-fontes');
                if (itemEl) {
                    itemEl.classList.add('tv-tile-off');
                    if (!itemEl.querySelector('.tv-tile-badge')) {
                        itemEl.insertAdjacentHTML('beforeend', badgeFalhaHtml(ch.id));
                    }
                }
                videoWrapEl.innerHTML = '<div class="tv-placeholder">⚠ Nenhuma fonte funcionou pra esse canal.<br>Volte e tente outro.</div>';
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
                videoWrapEl.innerHTML = '<div class="tv-placeholder"><div class="tv-spin"></div>Conectando' + rotulo + '…</div>';

                conectarTimeout = setTimeout(proximaFonte, CONECTAR_TIMEOUT_MS);

                try {
                    const Hls = await loadHlsJs();
                    if (minhaChamada !== chamadaAtual) return;

                    videoWrapEl.innerHTML = '<video id="' + UID + 'video" controls autoplay></video>';
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
                        videoWrapEl.innerHTML = '<div class="tv-placeholder">Seu navegador não suporta streams HLS.</div>';
                    }
                } catch (e) {
                    proximaFonte();
                }
            }

            tentar();
        }

        // ---------- Busca ----------
        let buscaDebounce = null;
        searchEl.addEventListener('input', () => {
            clearTimeout(buscaDebounce);
            buscaDebounce = setTimeout(() => {
                termoBusca = searchEl.value;
                renderChannels();
            }, 180);
        });

        // ---------- Header hide/unhide ----------
        function toggleHeader() {
            win.classList.toggle('header-hidden');
            aplicarLayout(true);
        }
        win.querySelector('#' + UID + 'hdrToggle').addEventListener('click', toggleHeader);
        win.querySelector('#' + UID + 'unhide').addEventListener('click', toggleHeader);

        // ---------- Header actions ----------
        win.querySelector('#' + UID + 'home').addEventListener('click', irParaSmart);
        win.querySelector('#' + UID + 'actSearch').addEventListener('click', () => {
            irParaSmart();
            setTimeout(() => searchEl?.focus?.(), 120);
        });
        win.querySelector('#' + UID + 'actBell').addEventListener('click', () => {
            // reservado
        });
        win.querySelector('#' + UID + 'actUser').addEventListener('click', () => {
            // reservado
        });

        // ---------- Carga inicial ----------
        aplicarLayout(false);
        irParaSmart();

        carregarDados()
            .then(({ canais, categorias }) => {
                if (abortController && abortController.signal.aborted) return;
                allChannels = canais;
                allCategories = categorias;
                renderFiltros();
                renderChannels();
                if (!canais.length) {
                    gridEl.innerHTML = '<div class="tv-empty">Nenhum canal BR disponível.</div>';
                }
            })
            .catch(e => {
                if (e && e.name === 'AbortError') return;
                gridEl.innerHTML = '<div class="tv-empty">⚠ Falha ao carregar canais.<br>' + escapeHtml(e.message) + '</div>';
            });

        // ---------- Minimizar / Fechar ----------
        function minimize() { win.style.display = 'none'; }
        function kill() {
            clearTimeout(conectarTimeout);
            clearTimeout(buscaDebounce);
            clearTimeout(layoutTimeout);
            if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
            chamadaAtual++;
            fecharAppAtual();
            if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
            if (abortController) { try { abortController.abort(); } catch (e) {} abortController = null; }
            persistirAgora();
            window.removeEventListener('beforeunload', aoDescarregar);
            window.removeEventListener('pagehide', aoDescarregar);
            document.removeEventListener('mousemove', aoMoverJanela);
            document.removeEventListener('mouseup', aoSoltarJanela);
            document.removeEventListener('mousemove', aoMoverResize);
            document.removeEventListener('mouseup', aoSoltarResize);
            document.removeEventListener('keydown', aoTeclado);
            win.remove();
            style.remove();
            delete window._iptv;
        }
        win.querySelector('#' + UID + 'min').addEventListener('click', minimize);
        win.querySelector('#' + UID + 'cls').addEventListener('click', kill);

        window._iptv = {
            kill,
            show: () => { win.style.display = 'flex'; aplicarLayout(false); },
            hide: () => { win.style.display = 'none'; },
            registrarApp: (cfg) => {
                if (!cfg || !cfg.id || apps.has(cfg.id)) return false;
                apps.set(cfg.id, cfg);
                if (vista === 'smart') renderApps();
                return true;
            },
            abrirApp,
            irParaSmart
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
