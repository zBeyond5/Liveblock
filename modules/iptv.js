// modules/iptv.js — injetado pelo Sang Hub
// v7: UI refeita como smart TV — home em grade cheia de canais (estilo launcher),
// tela de player separada (grade some, só o vídeo fica em foco), tema
// grafite/azul. Navegação só por mouse. Lógica de dados/fallback/cache mantida.
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
    const HEADER_HEIGHT = 44;
    const CONTROLBAR_HEIGHT = 58;
    const BORDER_TOTAL = 2; // 1px cada lado
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
            '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
            '<rect width="64" height="64" rx="10" fill="#1b1f26"/>' +
            '<text x="50%" y="53%" font-family="system-ui,sans-serif" font-size="26" ' +
            'font-weight="700" fill="#3b82f6" text-anchor="middle" dominant-baseline="middle">' +
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

        :root{
            --tv-bg:#0a0c10;--tv-bg-elevated:#12151b;--tv-bg-card:#181c24;--tv-bg-card-hover:#20252f;
            --tv-border:#252b36;--tv-border-soft:#1a1f28;
            --tv-text:#e7ebf3;--tv-text-dim:#8a93a3;--tv-text-faint:#5b6373;
            --tv-accent:#3b82f6;--tv-accent-bright:#60a5fa;--tv-accent-soft:rgba(59,130,246,.16);
            --tv-danger:#ef4444;--tv-danger-soft:rgba(239,68,68,.15);
            --tv-star:#f5b942;
        }

        /* ===== Container principal ===== */
        #${UID}{position:fixed;top:60px;left:60px;width:1000px;height:640px;
            box-sizing:border-box;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
            background:var(--tv-bg);color:var(--tv-text);
            border:1px solid var(--tv-border);border-radius:14px;overflow:hidden;
            z-index:2147483000;display:flex;flex-direction:column;
            box-shadow:0 26px 64px rgba(0,0,0,.65),0 0 0 1px rgba(59,130,246,.10),0 0 26px rgba(59,130,246,.08);
        }

        /* ===== Header ===== */
        #${UID} .iptv-hdr{height:${HEADER_HEIGHT}px;box-sizing:border-box;flex-shrink:0;
            display:flex;align-items:center;justify-content:space-between;
            padding:0 14px;cursor:grab;user-select:none;
            background:linear-gradient(180deg,#141820,#0e1116);
            border-bottom:1px solid var(--tv-border);overflow:hidden;
            transition:height .22s cubic-bezier(.4,0,.2,1),border-bottom-width .22s cubic-bezier(.4,0,.2,1),opacity .18s ease}
        #${UID}.header-hidden .iptv-hdr{height:0;border-bottom-width:0;opacity:0}
        #${UID} .iptv-hdr:active{cursor:grabbing}
        #${UID} .iptv-brand{display:flex;align-items:center;gap:9px}
        #${UID} .iptv-title{font-weight:800;font-size:13px;letter-spacing:.02em;color:var(--tv-text)}
        #${UID} .iptv-chip-br{font-size:9.5px;font-weight:700;letter-spacing:.05em;color:var(--tv-accent-bright);
            background:var(--tv-accent-soft);border-radius:5px;padding:2px 6px}
        #${UID} .iptv-actions{display:flex;gap:6px;align-items:center}
        #${UID} .iptv-btn{width:26px;height:26px;border-radius:7px;background:var(--tv-bg-card);
            border:1px solid var(--tv-border);color:var(--tv-text-dim);
            display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;
            transition:all .15s ease}
        #${UID} .iptv-btn:hover{background:var(--tv-accent);color:#fff;border-color:var(--tv-accent)}
        #${UID} .iptv-btn.active{background:var(--tv-accent);color:#fff;border-color:var(--tv-accent)}

        #${UID} .iptv-unhide{position:absolute;top:8px;right:8px;z-index:15;
            width:26px;height:26px;border-radius:7px;background:rgba(20,24,32,.8);
            border:1px solid var(--tv-border);color:var(--tv-text-dim);
            display:none;align-items:center;justify-content:center;font-size:12px;cursor:pointer;
            opacity:0;transition:opacity .2s,background .15s,color .15s}
        #${UID}.header-hidden .iptv-unhide{display:flex}
        #${UID}:hover .iptv-unhide{opacity:1}
        #${UID} .iptv-unhide:hover{background:var(--tv-accent);color:#fff}

        /* ===== Body ===== */
        #${UID} .iptv-body{flex:1;min-height:0;position:relative;display:flex;flex-direction:column}
        #${UID}.vista-home .tv-player{display:none}
        #${UID}.vista-player .tv-home{display:none}

        /* ===== Home (grade) ===== */
        #${UID} .tv-home{flex:1;min-height:0;display:flex;flex-direction:column}

        #${UID} .tv-toolbar{flex-shrink:0;padding:12px 16px 8px;display:flex;flex-direction:column;gap:9px}
        #${UID} .tv-search input{width:100%;background:var(--tv-bg-card);
            border:1px solid var(--tv-border);border-radius:8px;padding:9px 12px;
            color:var(--tv-text);font-size:12.5px;outline:none;box-sizing:border-box;
            transition:border-color .15s,box-shadow .15s}
        #${UID} .tv-search input::placeholder{color:var(--tv-text-faint)}
        #${UID} .tv-search input:focus{border-color:var(--tv-accent);box-shadow:0 0 0 3px var(--tv-accent-soft)}

        #${UID} .tv-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}
        #${UID} .tv-chips::-webkit-scrollbar{height:4px}
        #${UID} .tv-chips::-webkit-scrollbar-thumb{background:var(--tv-border);border-radius:2px}
        #${UID} .tv-chip{flex-shrink:0;font-size:10.5px;font-weight:600;
            padding:5px 12px;border-radius:99px;cursor:pointer;white-space:nowrap;
            background:var(--tv-bg-card);border:1px solid var(--tv-border);color:var(--tv-text-dim);
            transition:all .15s ease}
        #${UID} .tv-chip:hover{border-color:var(--tv-accent-bright);color:var(--tv-text)}
        #${UID} .tv-chip.active{background:var(--tv-accent);color:#fff;border-color:var(--tv-accent)}
        #${UID} .tv-chip.fav-chip{border-color:rgba(245,185,66,.35);color:var(--tv-star)}
        #${UID} .tv-chip.fav-chip.active{background:var(--tv-star);color:#1a1410;border-color:var(--tv-star)}

        #${UID} .tv-grid{flex:1;min-height:0;overflow-y:auto;padding:6px 16px 18px;
            display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:12px;
            align-content:start}
        #${UID} .tv-grid::-webkit-scrollbar{width:6px}
        #${UID} .tv-grid::-webkit-scrollbar-thumb{background:var(--tv-border);border-radius:3px}
        #${UID} .tv-grid::-webkit-scrollbar-thumb:hover{background:var(--tv-accent)}

        #${UID} .tv-tile{position:relative;display:flex;flex-direction:column;align-items:center;
            gap:7px;padding:12px 8px 9px;border-radius:12px;cursor:pointer;
            background:var(--tv-bg-card);border:1px solid var(--tv-border-soft);
            transition:transform .15s cubic-bezier(.4,0,.2,1),background .15s,border-color .15s,box-shadow .15s}
        #${UID} .tv-tile:hover{transform:translateY(-3px) scale(1.03);background:var(--tv-bg-card-hover);
            border-color:var(--tv-accent);box-shadow:0 10px 28px rgba(0,0,0,.5),0 0 0 1px var(--tv-accent-soft)}
        #${UID} .tv-tile.tv-tile-off{opacity:.4}
        #${UID} .tv-tile-logo{width:52px;height:52px;border-radius:10px;overflow:hidden;
            background:var(--tv-bg-elevated);display:flex;align-items:center;justify-content:center}
        #${UID} .tv-tile-logo img{width:100%;height:100%;object-fit:contain}
        #${UID} .tv-tile-name{font-size:11px;font-weight:600;text-align:center;line-height:1.3;
            max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;
            -webkit-line-clamp:2;-webkit-box-orient:vertical}
        #${UID} .tv-tile-meta{font-size:9px;color:var(--tv-text-faint);text-align:center;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        #${UID} .tv-tile-badge{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);
            font-size:7.5px;font-weight:800;letter-spacing:.05em;color:#ff8f8f;
            background:var(--tv-danger-soft);border:1px solid rgba(239,68,68,.35);
            border-radius:5px;padding:1px 5px}

        #${UID} .tv-star{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;font-size:12px;
            background:rgba(10,12,16,.55);border:0;color:var(--tv-text-faint);cursor:pointer;
            transition:color .15s,transform .15s,background .15s}
        #${UID} .tv-star:hover{transform:scale(1.15);background:rgba(10,12,16,.8)}
        #${UID} .tv-star.faved{color:var(--tv-star)}

        #${UID} .tv-loading,#${UID} .tv-empty{grid-column:1/-1;padding:30px 10px;text-align:center;
            color:var(--tv-text-faint);font-size:12px}
        #${UID} .tv-spin{width:18px;height:18px;border:2px solid rgba(59,130,246,.2);
            border-top-color:var(--tv-accent);border-radius:50%;margin:0 auto 10px;
            animation:iptvSpin .7s linear infinite}

        /* ===== Player ===== */
        #${UID} .tv-player{flex:1;min-height:0;display:flex;flex-direction:column}
        #${UID} .tv-video-wrap{flex:1;min-height:0;position:relative;background:#000;
            display:flex;align-items:center;justify-content:center;overflow:hidden}
        #${UID} .tv-video-wrap video{width:100%;height:100%;object-fit:contain;display:block}
        #${UID} .tv-placeholder{color:var(--tv-text-faint);font-size:12.5px;text-align:center;padding:20px}

        #${UID} .tv-controlbar{height:${CONTROLBAR_HEIGHT}px;flex-shrink:0;box-sizing:border-box;
            display:flex;align-items:center;gap:12px;padding:0 14px;
            background:linear-gradient(0deg,#141820,#0e1116);border-top:1px solid var(--tv-border)}
        #${UID} .tv-back{flex-shrink:0;display:flex;align-items:center;gap:6px;
            padding:8px 13px;border-radius:8px;background:var(--tv-bg-card);
            border:1px solid var(--tv-border);color:var(--tv-text);font-size:11.5px;font-weight:600;
            cursor:pointer;transition:all .15s}
        #${UID} .tv-back:hover{background:var(--tv-accent);border-color:var(--tv-accent);color:#fff}
        #${UID} .tv-now{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
        #${UID} .tv-now-logo{width:32px;height:32px;border-radius:7px;flex-shrink:0;
            background:var(--tv-bg-card);object-fit:contain}
        #${UID} .tv-now-text{min-width:0;display:flex;flex-direction:column;gap:1px}
        #${UID} .tv-now-name{font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .tv-now-meta{font-size:10px;color:var(--tv-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .tv-controlbar .tv-star{position:static;flex-shrink:0;background:var(--tv-bg-card);
            border:1px solid var(--tv-border);width:34px;height:34px}

        /* ===== Resize handle ===== */
        #${UID} .iptv-resize{position:absolute;right:3px;bottom:3px;width:16px;height:16px;
            cursor:nwse-resize;z-index:20;opacity:.3;transition:opacity .15s;
            background:linear-gradient(135deg,transparent 48%,var(--tv-accent-bright) 48%,var(--tv-accent-bright) 52%,transparent 52%,
                                                transparent 62%,var(--tv-accent-bright) 62%,var(--tv-accent-bright) 66%,transparent 66%,
                                                transparent 76%,var(--tv-accent-bright) 76%,var(--tv-accent-bright) 80%,transparent 80%)}
        #${UID} .iptv-resize:hover{opacity:1}
        `;
        document.head.appendChild(style);

        const win = document.createElement('div');
        win.id = UID;
        win.className = 'vista-home';
        win.innerHTML = `
            <div class="iptv-hdr" id="${UID}hdr">
                <div class="iptv-brand">
                    <span class="iptv-title">IPTV</span>
                    <span class="iptv-chip-br">BR</span>
                </div>
                <div class="iptv-actions">
                    <div class="iptv-btn" id="${UID}hdrToggle" title="Ocultar cabeçalho">▭</div>
                    <div class="iptv-btn" id="${UID}min" title="Minimizar">−</div>
                    <div class="iptv-btn" id="${UID}cls" title="Fechar">✕</div>
                </div>
            </div>
            <div class="iptv-body">
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
            <div class="iptv-unhide" id="${UID}unhide" title="Mostrar cabeçalho">▭</div>
            <div class="iptv-resize" id="${UID}resize"></div>
        `;
        document.body.appendChild(win);

        // ---- Elementos ----
        const gridEl = win.querySelector('#' + UID + 'grid');
        const videoWrapEl = win.querySelector('#' + UID + 'video-wrap');
        const searchEl = win.querySelector('#' + UID + 'search');
        const filtersEl = win.querySelector('#' + UID + 'filters');
        const hdr = win.querySelector('#' + UID + 'hdr');
        const resizeHandle = win.querySelector('#' + UID + 'resize');
        const backBtn = win.querySelector('#' + UID + 'back');

        let allChannels = [];
        let allCategories = [];
        let hls = null;
        let conectarTimeout = null;
        let chamadaAtual = 0;
        let filtroCategoria = null;
        let mostrarSoFavoritos = false;
        let termoBusca = '';
        let vista = 'home'; // 'home' | 'player'

        const state = { winW: 1000, winHHome: 640 };

        // ---- Layout ----
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

            if (animar) setTimeout(() => { if (!resizeState) win.style.transition = ''; }, 280);
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

        // ---- Resize: livre na home, travado em 16:9 no player ----
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

        // ---- Navegação home <-> player ----
        function irParaPlayer() {
            vista = 'player';
            win.classList.remove('vista-home');
            win.classList.add('vista-player');
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
            win.classList.remove('vista-player');
            win.classList.add('vista-home');
            aplicarLayout(true);
        }
        backBtn.addEventListener('click', voltarParaHome);

        // ---- Estrela (favorito) — sincroniza grade + barra do player ----
        function sincronizarEstrela(id) {
            const fav = ehFavorito(id);
            win.querySelectorAll(`[data-star="${id}"]`).forEach(btn => {
                btn.textContent = fav ? '★' : '☆';
                btn.classList.toggle('faved', fav);
                btn.title = fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
            });
        }

        // ---- Clique delegado: estrela e tiles ----
        win.addEventListener('click', (e) => {
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

        // ---- Filtros (delegado) ----
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
            chips.push(`<span class="tv-chip fav-chip${mostrarSoFavoritos ? ' active' : ''}" data-fav="1">★ Favoritos</span>`);
            chips.push(`<span class="tv-chip${filtroCategoria === null ? ' active' : ''}" data-cat="">Todos</span>`);
            allCategories.forEach(cat => {
                const ativo = filtroCategoria === cat ? ' active' : '';
                chips.push(`<span class="tv-chip${ativo}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</span>`);
            });
            filtersEl.innerHTML = chips.join('');
        }

        function badgeFalhaHtml(id) {
            const registro = obterStatusFalha(id);
            if (!registro) return '';
            return '<span class="tv-tile-badge" title="Falhou ' + escapeHtml(formatarRelativoCurto(registro.em)) + '">OFFLINE</span>';
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
                gridEl.innerHTML = '<div class="tv-empty">Nenhum canal encontrado.</div>';
                return;
            }

            const limit = q || filtroCategoria || mostrarSoFavoritos ? filtered.length : 300;
            const visiveis = filtered.slice(0, limit);

            gridEl.innerHTML = visiveis.map(c => {
                const falhou = !!obterStatusFalha(c.id);
                const fav = ehFavorito(c.id);
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

        // ---- Reprodução com fallback em cascata ----
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

        // ---- Busca ----
        let buscaDebounce = null;
        searchEl.addEventListener('input', () => {
            clearTimeout(buscaDebounce);
            buscaDebounce = setTimeout(() => {
                termoBusca = searchEl.value;
                renderChannels();
            }, 180);
        });

        // ---- Header hide/unhide ----
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
                    gridEl.innerHTML = '<div class="tv-empty">Nenhum canal BR disponível.</div>';
                }
            })
            .catch(e => {
                gridEl.innerHTML = '<div class="tv-empty">⚠ Falha ao carregar canais.<br>' + escapeHtml(e.message) + '</div>';
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
