(function() {
    'use strict';
    const UID = '_yt';
    if (window._yt) return;

    // Importa a biblioteca yt-search-lib dinamicamente
    async function loadYtSearchLib() {
        if (window.YouTubeClient) return window.YouTubeClient;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `
                import YouTubeClient from 'https://cdn.jsdelivr.net/npm/yt-search-lib/+esm';
                window.YouTubeClient = YouTubeClient;
                window.dispatchEvent(new Event('yt-search-lib-ready'));
            `;
            document.head.appendChild(script);
            window.addEventListener('yt-search-lib-ready', () => resolve(window.YouTubeClient), { once: true });
            setTimeout(() => reject(new Error('Timeout ao carregar yt-search-lib')), 10000);
        });
    }

    function init() {
        if (window._yt) return;

        const style = document.createElement('style');
        style.setAttribute('data-yt', '1');
        style.textContent = `
        @keyframes ytlBreathe{0%,100%{box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 18px rgba(255,30,30,0.18),0 0 0 1px rgba(255,60,60,0.12)}
            50%{box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 34px rgba(255,30,30,0.4),0 0 0 1px rgba(255,60,60,0.3)}}

        #${UID}{position:fixed;top:70px;left:70px;width:800px;height:520px;min-width:420px;min-height:320px;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            background:linear-gradient(175deg,rgba(18,10,10,0.94),rgba(8,4,4,0.98));backdrop-filter:blur(16px) saturate(140%);
            border:1px solid rgba(255,60,60,0.18);border-radius:18px;overflow:hidden;
            z-index:2147483000;display:flex;flex-direction:column;resize:both;
            animation:ytlBreathe 4.5s ease-in-out infinite}

        #${UID} .ytl-hdr{height:38px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
            padding:0 12px;cursor:grab;user-select:none;border-bottom:1px solid rgba(255,60,60,0.12)}
        #${UID} .ytl-hdr:active{cursor:grabbing}
        #${UID} .ytl-brand{display:flex;align-items:center;gap:8px;min-width:0}
        #${UID} .ytl-dot{width:8px;height:8px;border-radius:50%;background:#ff2d2d;box-shadow:0 0 8px rgba(255,45,45,0.9);flex-shrink:0}
        #${UID} .ytl-title{font-weight:800;font-size:12.5px;letter-spacing:.06em;color:#ffecec;white-space:nowrap}
        #${UID} .ytl-actions{display:flex;gap:6px;flex-shrink:0}
        #${UID} .ytl-btn{width:24px;height:24px;border-radius:7px;background:rgba(255,60,60,0.08);
            border:1px solid rgba(255,60,60,0.18);color:#ffb3b3;display:flex;align-items:center;justify-content:center;
            cursor:pointer;font-size:12px;transition:all .18s ease}
        #${UID} .ytl-btn:hover{background:#ff2d2d;color:#1a0505;border-color:transparent;box-shadow:0 0 12px rgba(255,45,45,0.5)}

        #${UID} .ytl-searchbar{display:flex;gap:6px;padding:8px 10px;flex-shrink:0;border-bottom:1px solid rgba(255,60,60,0.1)}
        #${UID} .ytl-searchbar input{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,60,60,0.15);
            border-radius:9px;padding:7px 10px;color:#fff;font-size:11.5px;outline:none}
        #${UID} .ytl-searchbar input::placeholder{color:#8b6b6b}
        #${UID} .ytl-searchbar input:focus{border-color:rgba(255,60,60,0.5);box-shadow:0 0 0 2px rgba(255,45,45,0.12)}
        #${UID} .ytl-searchbar button{background:linear-gradient(120deg,#ff2d2d,#c41414);border:none;border-radius:9px;
            padding:0 14px;color:#fff;font-weight:700;font-size:11px;cursor:pointer;transition:filter .15s;white-space:nowrap}
        #${UID} .ytl-searchbar button:hover{filter:brightness(1.15)}

        #${UID} .ytl-body{flex:1;min-height:0;position:relative;background:#000;display:flex}
        #${UID} .ytl-player-wrap{flex:1;min-width:0;position:relative}
        #${UID} .ytl-player-wrap iframe{width:100%;height:100%;border:0}
        #${UID} .ytl-results{width:260px;flex-shrink:0;border-left:1px solid rgba(255,60,60,0.1);
            display:flex;flex-direction:column;min-height:0;overflow-y:auto;background:rgba(255,255,255,0.02)}
        #${UID} .ytl-results::-webkit-scrollbar{width:4px}
        #${UID} .ytl-results::-webkit-scrollbar-thumb{background:rgba(255,45,45,0.3);border-radius:2px}
        #${UID} .ytl-result-item{display:flex;gap:8px;padding:8px;border-bottom:1px solid rgba(255,60,60,0.06);
            cursor:pointer;transition:background .15s}
        #${UID} .ytl-result-item:hover{background:rgba(255,45,45,0.1)}
        #${UID} .ytl-result-item img{width:80px;height:45px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#111}
        #${UID} .ytl-result-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
        #${UID} .ytl-result-title{font-size:10px;color:#d4c4b0;line-height:1.3;
            display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        #${UID} .ytl-result-meta{font-size:9px;color:#6b5a4a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        #${UID} .ytl-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            color:#7a5252;font-size:11.5px;text-align:center;padding:20px}
        #${UID} .ytl-spin{width:16px;height:16px;border:2px solid rgba(255,45,45,0.25);border-top-color:#ff2d2d;
            border-radius:50%;margin:0 auto 8px;animation:ytlSpin .7s linear infinite}
        @keyframes ytlSpin{to{transform:rotate(360deg)}}
        `;
        document.head.appendChild(style);

        const win = document.createElement('div');
        win.id = UID;
        win.innerHTML = `
            <div class="ytl-hdr" id="${UID}hdr">
                <div class="ytl-brand"><span class="ytl-dot"></span><span class="ytl-title">YOUTUBE</span></div>
                <div class="ytl-actions">
                    <div class="ytl-btn" id="${UID}min" title="Minimizar">−</div>
                    <div class="ytl-btn" id="${UID}cls" title="Fechar">✕</div>
                </div>
            </div>
            <div class="ytl-searchbar">
                <input type="text" id="${UID}input" placeholder="Pesquise vídeos ou cole um link do YouTube…" />
                <button id="${UID}go">Buscar</button>
            </div>
            <div class="ytl-body" id="${UID}body">
                <div class="ytl-player-wrap" id="${UID}playerWrap">
                    <div class="ytl-empty">Pesquise ou cole um link do YouTube acima</div>
                </div>
                <div class="ytl-results" id="${UID}results"></div>
            </div>
        `;
        document.body.appendChild(win);

        // Drag pelo header
        let drag = null;
        const hdr = win.querySelector('#' + UID + 'hdr');
        hdr.addEventListener('mousedown', e => {
            if (e.target.closest('.ytl-btn')) return;
            const r = win.getBoundingClientRect();
            drag = { x: e.clientX - r.left, y: e.clientY - r.top };
        });
        document.addEventListener('mousemove', e => {
            if (!drag) return;
            win.style.left = Math.max(0, e.clientX - drag.x) + 'px';
            win.style.top = Math.max(0, e.clientY - drag.y) + 'px';
        });
        document.addEventListener('mouseup', () => { drag = null; });

        const body = win.querySelector('#' + UID + 'body');
        const playerWrap = win.querySelector('#' + UID + 'playerWrap');
        const resultsEl = win.querySelector('#' + UID + 'results');
        const input = win.querySelector('#' + UID + 'input');
        const goBtn = win.querySelector('#' + UID + 'go');

        let ytClient = null;
        let resultadosAtuais = [];

        // Inicializa o cliente de busca
        (async () => {
            try {
                const YTClient = await loadYtSearchLib();
                ytClient = new YTClient({
                    proxyUrl: 'https://api.allorigins.win/raw?url=',
                    useCache: true,
                    cacheMaxAge: 3600000 // 1 hora
                });
            } catch (e) {
                console.warn('Falha ao carregar yt-search-lib:', e);
            }
        })();

        // Extrai ID de vídeo de qualquer formato
        function extrairVideoId(input) {
            input = input.trim();
            const patterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
                /^([a-zA-Z0-9_-]{11})$/
            ];
            for (const re of patterns) {
                const m = input.match(re);
                if (m) return m[1];
            }
            return null;
        }

        // Carrega um vídeo no player
        function carregarVideo(videoId) {
            const params = [
                'autoplay=1', 'controls=1', 'rel=0', 'iv_load_policy=3',
                'playsinline=1', 'enablejsapi=1'
            ].join('&');
            playerWrap.innerHTML = `<iframe
                src="https://www.youtube.com/embed/${videoId}?${params}"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowfullscreen></iframe>`;
        }

        // Realiza a busca
        async function buscar(termo) {
            if (!ytClient) {
                resultsEl.innerHTML = '<div class="ytl-empty" style="position:static;padding:20px">Biblioteca de busca ainda carregando…</div>';
                return;
            }

            resultsEl.innerHTML = '<div class="ytl-empty" style="position:static;padding:20px"><div class="ytl-spin"></div>Buscando…</div>';

            try {
                const resultados = await ytClient.search(termo, { limit: 15 });
                resultadosAtuais = resultados;

                if (!resultados.length) {
                    resultsEl.innerHTML = '<div class="ytl-empty" style="position:static;padding:20px">Nenhum resultado encontrado.</div>';
                    return;
                }

                resultsEl.innerHTML = resultados.map((v, i) => `
                    <div class="ytl-result-item" data-index="${i}">
                        <img src="${v.thumbnail_url}" alt="" loading="lazy"/>
                        <div class="ytl-result-info">
                            <div class="ytl-result-title">${v.title}</div>
                            <div class="ytl-result-meta">${v.channel_name || ''}</div>
                        </div>
                    </div>
                `).join('');

                resultsEl.querySelectorAll('.ytl-result-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const idx = parseInt(el.dataset.index, 10);
                        const video = resultadosAtuais[idx];
                        if (video) {
                            carregarVideo(video.videoId);
                            input.value = video.link;
                        }
                    });
                });

                // Auto-carrega o primeiro resultado
                if (resultados.length > 0) {
                    carregarVideo(resultados[0].videoId);
                    input.value = resultados[0].link;
                }
            } catch (e) {
                resultsEl.innerHTML = '<div class="ytl-empty" style="position:static;padding:20px">Falha na busca.<br>' + (e.message || '') + '</div>';
            }
        }

        // Ação principal: decide entre busca ou link direto
        function acaoPrincipal() {
            const valor = input.value.trim();
            if (!valor) return;

            const videoId = extrairVideoId(valor);
            if (videoId) {
                carregarVideo(videoId);
                resultsEl.innerHTML = ''; // Limpa a lista de resultados
                return;
            }

            // Se não for um link, trata como termo de busca
            buscar(valor);
        }

        goBtn.addEventListener('click', acaoPrincipal);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') acaoPrincipal(); });

        function minimize() { win.style.display = 'none'; }
        function kill() {
            win.remove();
            style.remove();
            delete window._yt;
        }
        win.querySelector('#' + UID + 'min').addEventListener('click', minimize);
        win.querySelector('#' + UID + 'cls').addEventListener('click', kill);

        window._yt = { kill, show: () => { win.style.display = 'flex'; } };
    }

    if (document.body) {
        init();
    } else {
        const iv = setInterval(() => {
            if (document.body) { clearInterval(iv); init(); }
        }, 80);
    }
})();
