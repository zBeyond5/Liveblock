
(function() {
    'use strict';
    const UID = '_iptv';
    if (window._iptv) return;

    const HLS_JS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
    const CHANNELS_API_URL = 'https://iptv-org.github.io/api/channels.json';
    const STREAMS_API_URL = 'https://iptv-org.github.io/api/streams.json';
    const PAIS = 'BR'; // ISO 3166-1 alpha-2
    const PLAYLIST_INDEX_URL = `https://iptv-org.github.io/iptv/countries/${PAIS.toLowerCase()}.m3u`;
    const FREE_TV_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

    const CACHE_PREFIX = 'iptv_';
    const FALHA_TTL_MS = 6 * 60 * 60 * 1000;
    const CONECTAR_TIMEOUT_MS = 9000;
    const MAX_TENTATIVAS_RECUPERACAO = 1;

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

    // ---------- Cache de falhas por canal ----------
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

    // ---------- Link que funcionou por canal ----------
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

    // Avatar SVG com a inicial do canal — substitui logo quebrada sem "buraco" visual.
    // Cacheado por letra para não recalcular em toda renderização.
    const _avatarCache = new Map();
    function logoPlaceholder(nome) {
        const letra = (String(nome || '?').trim().charAt(0) || '?').toUpperCase();
        if (_avatarCache.has(letra)) return _avatarCache.get(letra);
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44">' +
            '<rect width="44" height="44" rx="6" fill="#241010"/>' +
            '<text x="50%" y="52%" font-family="system-ui,sans-serif" font-size="20" ' +
            'font-weight="800" fill="#ff8080" text-anchor="middle" dominant-baseline="middle">' +
            escapeHtml(letra) +
            '</text></svg>';
        const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        _avatarCache.set(letra, uri);
        return uri;
    }

    // ---------- Parser M3U ----------
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

    // ---------- Carga de canais (só BR) ----------
    async function carregarCanais() {
        const [resCh, resSt, resM3u, resFreeTv] = await Promise.allSettled([
            buscarJson(CHANNELS_API_URL),
            buscarJson(STREAMS_API_URL),
            buscarTexto(PLAYLIST_INDEX_URL),
            buscarTexto(FREE_TV_URL),
        ]);

        if (resCh.status !== 'fulfilled' || resSt.status !== 'fulfilled') {
            throw new Error('Falha ao carregar dados principais do iptv-org');
        }
        const channels = resCh.value;
        const streams = resSt.value;

        // Logos: extraídas do tvg-logo da playlist BR.
        const logoPorId = new Map();
        if (resM3u.status === 'fulfilled') {
            parseM3U(resM3u.value).forEach(c => {
                if (c.tvgId && c.logo && !logoPorId.has(c.tvgId)) logoPorId.set(c.tvgId, c.logo);
            });
        }

        // Fonte secundária de streams (match por nome normalizado).
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

            // Filtro de país — aceita string ou array (a API variou entre versões).
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

            lista.push({
                id: c.id,
                name: c.name,
                logo: logoPorId.get(c.id) || c.logo || (matchFreeTv && matchFreeTv.logo) || '',
                country: c.country || '',
                category: Array.isArray(c.categories) && c.categories.length ? c.categories[0] : '',
                urls: candidatos,
            });
        }

        lista.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        return lista;
    }

    function init() {
        if (window._iptv) return;

        const style = document.createElement('style');
        style.setAttribute('data-iptv', '1');
        style.textContent = `
        @keyframes iptvBreathe{0%,100%{box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 18px rgba(255,30,30,0.18),0 0 0 1px rgba(255,60,60,0.12)}
            50%{box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 34px rgba(255,30,30,0.4),0 0 0 1px rgba(255,60,60,0.3)}}
        @keyframes iptvSpin{to{transform:rotate(360deg)}}

        #${UID}{position:fixed;top:70px;left:70px;width:760px;height:480px;min-width:400px;min-height:280px;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            background:linear-gradient(175deg,rgba(18,10,10,0.94),rgba(8,4,4,0.98));backdrop-filter:blur(16px) saturate(140%);
            border:1px solid rgba(255,60,60,0.18);border-radius:18px;overflow:hidden;
            z-index:2147483000;display:flex;flex-direction:column;resize:both;
            animation:iptvBreathe 4.5s ease-in-out infinite}

        #${UID} .iptv-hdr{height:38px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
            padding:0 12px;cursor:grab;user-select:none;border-bottom:1px solid rgba(255,60,60,0.12)}
        #${UID} .iptv-hdr:active{cursor:grabbing}
        #${UID} .iptv-brand{display:flex;align-items:center;gap:8px}
        #${UID} .iptv-dot{width:8px;height:8px;border-radius:50%;background:#ff2d2d;box-shadow:0 0 8px rgba(255,45,45,0.9)}
        #${UID} .iptv-title{font-weight:800;font-size:12.5px;letter-spacing:.06em;color:#ffecec}
        #${UID} .iptv-actions{display:flex;gap:6px}
        #${UID} .iptv-btn{width:24px;height:24px;border-radius:7px;background:rgba(255,60,60,0.08);
            border:1px solid rgba(255,60,60,0.18);color:#ffb3b3;display:flex;align-items:center;justify-content:center;
            cursor:pointer;font-size:12px;transition:all .18s ease}
        #${UID} .iptv-btn:hover{background:#ff2d2d;color:#1a0505;border-color:transparent;box-shadow:0 0 12px rgba(255,45,45,0.5)}

        #${UID} .iptv-main{flex:1;min-height:0;display:flex}
        #${UID} .iptv-list{width:230px;flex-shrink:0;border-right:1px solid rgba(255,60,60,0.1);
            display:flex;flex-direction:column;min-height:0}
        #${UID} .iptv-search{padding:8px;flex-shrink:0}
        #${UID} .iptv-search input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,60,60,0.15);
            border-radius:8px;padding:6px 9px;color:#fff;font-size:11px;outline:none;box-sizing:border-box}
        #${UID} .iptv-search input:focus{border-color:rgba(255,60,60,0.5)}
        #${UID} .iptv-channels{flex:1;overflow-y:auto;padding:0 6px 6px}
        #${UID} .iptv-channels::-webkit-scrollbar{width:5px}
        #${UID} .iptv-channels::-webkit-scrollbar-thumb{background:rgba(255,45,45,0.4);border-radius:3px}
        #${UID} .iptv-ch{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;cursor:pointer;
            font-size:11px;color:#e5d0d0;transition:background .15s, opacity .15s}
        #${UID} .iptv-ch:hover{background:rgba(255,45,45,0.12)}
        #${UID} .iptv-ch.active{background:rgba(255,45,45,0.2);color:#fff;font-weight:700}
        #${UID} .iptv-ch.iptv-ch-falhou{opacity:.42}
        #${UID} .iptv-ch img{width:22px;height:22px;object-fit:contain;border-radius:4px;flex-shrink:0;background:rgba(255,255,255,0.05)}
        #${UID} .iptv-ch-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
        #${UID} .iptv-ch-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .iptv-ch-meta{font-size:9px;color:#8b6b6b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .iptv-badge-off{flex-shrink:0;font-size:8.5px;font-weight:800;letter-spacing:.04em;color:#ff8080;
            background:rgba(255,45,45,0.15);border:1px solid rgba(255,45,45,0.3);border-radius:5px;padding:1px 5px}
        #${UID} .iptv-loading,#${UID} .iptv-err{padding:16px;text-align:center;color:#8b6b6b;font-size:11px}
        #${UID} .iptv-spin{width:16px;height:16px;border:2px solid rgba(255,45,45,0.25);border-top-color:#ff2d2d;
            border-radius:50%;margin:0 auto 8px;animation:iptvSpin .7s linear infinite}

        #${UID} .iptv-player{flex:1;min-width:0;position:relative;background:#000;display:flex;align-items:center;justify-content:center}
        #${UID} .iptv-player video{width:100%;height:100%;object-fit:contain}
        #${UID} .iptv-placeholder{color:#7a5252;font-size:11.5px;text-align:center;padding:20px}
        `;
        document.head.appendChild(style);

        const win = document.createElement('div');
        win.id = UID;
        win.innerHTML = `
            <div class="iptv-hdr" id="${UID}hdr">
                <div class="iptv-brand"><span class="iptv-dot"></span><span class="iptv-title">IPTV · BR</span></div>
                <div class="iptv-actions">
                    <div class="iptv-btn" id="${UID}min" title="Minimizar">−</div>
                    <div class="iptv-btn" id="${UID}cls" title="Fechar">✕</div>
                </div>
            </div>
            <div class="iptv-main">
                <div class="iptv-list">
                    <div class="iptv-search"><input type="text" id="${UID}search" placeholder="Buscar canal ou categoria…" /></div>
                    <div class="iptv-channels" id="${UID}channels"><div class="iptv-loading"><div class="iptv-spin"></div>Carregando lista…</div></div>
                </div>
                <div class="iptv-player" id="${UID}player">
                    <div class="iptv-placeholder">Selecione um canal na lista ao lado</div>
                </div>
            </div>
        `;
        document.body.appendChild(win);

        // ---- Drag ----
        let drag = null;
        const hdr = win.querySelector('#' + UID + 'hdr');
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

        const channelsEl = win.querySelector('#' + UID + 'channels');
        const playerEl = win.querySelector('#' + UID + 'player');
        const searchEl = win.querySelector('#' + UID + 'search');

        let allChannels = [];
        let hls = null;
        let conectarTimeout = null;
        let chamadaAtual = 0;

        function badgeFalhaHtml(id) {
            const registro = obterStatusFalha(id);
            if (!registro) return '';
            return '<span class="iptv-badge-off" title="Falhou ' + escapeHtml(formatarRelativoCurto(registro.em)) + '">OFFLINE</span>';
        }

        function renderChannels(filter) {
            const q = (filter || '').toLowerCase();
            const filtered = q
                ? allChannels.filter(c =>
                      c.name.toLowerCase().includes(q) ||
                      c.country.toLowerCase().includes(q) ||
                      c.category.toLowerCase().includes(q)
                  )
                : allChannels.slice(0, 300);

            if (!filtered.length) {
                channelsEl.innerHTML = '<div class="iptv-err">Nenhum canal encontrado.</div>';
                return;
            }

            channelsEl.innerHTML = filtered.map((c) => {
                const falhou = !!obterStatusFalha(c.id);
                const meta = [c.country, c.category].filter(Boolean).join(' · ');
                const logoSrc = c.logo || logoPlaceholder(c.name);
                const fallback = logoPlaceholder(c.name);
                return `
                <div class="iptv-ch${falhou ? ' iptv-ch-falhou' : ''}" data-id="${escapeHtml(c.id)}">
                    <img src="${escapeHtml(logoSrc)}" alt=""
                         loading="lazy" decoding="async" referrerpolicy="no-referrer"
                         onerror="this.onerror=null;this.src='${fallback}'"/>
                    <span class="iptv-ch-info">
                        <span class="iptv-ch-name">${escapeHtml(c.name)}</span>
                        ${meta ? `<span class="iptv-ch-meta">${escapeHtml(meta)}</span>` : ''}
                    </span>
                    ${badgeFalhaHtml(c.id)}
                </div>
            `;
            }).join('');
            channelsEl.querySelectorAll('.iptv-ch').forEach(el => {
                el.addEventListener('click', () => {
                    const canal = allChannels.find(c => c.id === el.dataset.id);
                    if (canal) playChannel(canal, el);
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
                playerEl.innerHTML = '<div class="iptv-placeholder">⚠️ Nenhuma fonte disponível pra esse canal.</div>';
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
                playerEl.innerHTML = '<div class="iptv-placeholder">⚠️ Nenhuma fonte funcionou pra esse canal.<br>Tente outro.</div>';
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
                playerEl.innerHTML = '<div class="iptv-placeholder"><div class="iptv-spin" style="margin:0 auto 10px"></div>Conectando' + rotulo + '…</div>';

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
                        playerEl.innerHTML = '<div class="iptv-placeholder">Seu navegador não suporta streams HLS.</div>';
                    }
                } catch (e) {
                    proximaFonte();
                }
            }

            tentar();
        }

        let buscaDebounce = null;
        searchEl.addEventListener('input', () => {
            clearTimeout(buscaDebounce);
            buscaDebounce = setTimeout(() => renderChannels(searchEl.value), 180);
        });

        carregarCanais()
            .then(lista => {
                allChannels = lista;
                renderChannels('');
                if (!lista.length) {
                    channelsEl.innerHTML = '<div class="iptv-err">Nenhum canal brasileiro com stream disponível no momento.</div>';
                }
            })
            .catch(e => {
                channelsEl.innerHTML = '<div class="iptv-err">⚠️ Falha ao carregar lista de canais.<br>' + escapeHtml(e.message) + '</div>';
            });

        function minimize() { win.style.display = 'none'; }
        function kill() {
            clearTimeout(conectarTimeout);
            clearTimeout(buscaDebounce);
            chamadaAtual++;
            if (hls) hls.destroy();
            document.removeEventListener('mousemove', aoMoverJanela);
            document.removeEventListener('mouseup', aoSoltarJanela);
            win.remove();
            style.remove();
            delete window._iptv;
        }
        win.querySelector('#' + UID + 'min').addEventListener('click', minimize);
        win.querySelector('#' + UID + 'cls').addEventListener('click', kill);

        window._iptv = { kill, show: () => { win.style.display = 'flex'; } };
    }

    if (document.body) {
        init();
    } else {
        const iv = setInterval(() => {
            if (document.body) { clearInterval(iv); init(); }
        }, 80);
    }
})();
