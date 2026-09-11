// modules/iptv.js — injetado pelo Sang Hub
// Usa hls.js (MIT) via CDN pra tocar streams HLS (.m3u8) do iptv-org/iptv
(function() {
    'use strict';
    const UID = '_iptv';
    if (window._iptv) return;

    const HLS_JS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
    const PLAYLIST_INDEX_URL = 'https://iptv-org.github.io/iptv/index.m3u';

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

    // Parser simples de M3U: extrai pares {name, logo, group, url}
    function parseM3U(text) {
        const lines = text.split('\n');
        const channels = [];
        let current = null;
        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith('#EXTINF')) {
                const nameMatch = line.match(/,(.*)$/);
                const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                const groupMatch = line.match(/group-title="([^"]*)"/);
                current = {
                    name: nameMatch ? nameMatch[1].trim() : 'Sem nome',
                    logo: logoMatch ? logoMatch[1] : '',
                    group: groupMatch ? groupMatch[1] : 'Outros'
                };
            } else if (line && !line.startsWith('#') && current) {
                current.url = line;
                channels.push(current);
                current = null;
            }
        }
        return channels;
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
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
            font-size:11px;color:#e5d0d0;transition:background .15s}
        #${UID} .iptv-ch:hover{background:rgba(255,45,45,0.12)}
        #${UID} .iptv-ch.active{background:rgba(255,45,45,0.2);color:#fff;font-weight:700}
        #${UID} .iptv-ch img{width:22px;height:22px;object-fit:contain;border-radius:4px;flex-shrink:0;background:rgba(255,255,255,0.05)}
        #${UID} .iptv-ch span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
                <div class="iptv-brand"><span class="iptv-dot"></span><span class="iptv-title">IPTV</span></div>
                <div class="iptv-actions">
                    <div class="iptv-btn" id="${UID}min" title="Minimizar">−</div>
                    <div class="iptv-btn" id="${UID}cls" title="Fechar">✕</div>
                </div>
            </div>
            <div class="iptv-main">
                <div class="iptv-list">
                    <div class="iptv-search"><input type="text" id="${UID}search" placeholder="Buscar canal…" /></div>
                    <div class="iptv-channels" id="${UID}channels"><div class="iptv-loading"><div class="iptv-spin"></div>Carregando lista…</div></div>
                </div>
                <div class="iptv-player" id="${UID}player">
                    <div class="iptv-placeholder">Selecione um canal na lista ao lado</div>
                </div>
            </div>
        `;
        document.body.appendChild(win);

        // Drag pelo header
        let drag = null;
        const hdr = win.querySelector('#' + UID + 'hdr');
        hdr.addEventListener('mousedown', e => {
            if (e.target.closest('.iptv-btn')) return;
            const r = win.getBoundingClientRect();
            drag = { x: e.clientX - r.left, y: e.clientY - r.top };
        });
        document.addEventListener('mousemove', e => {
            if (!drag) return;
            win.style.left = Math.max(0, e.clientX - drag.x) + 'px';
            win.style.top = Math.max(0, e.clientY - drag.y) + 'px';
        });
        document.addEventListener('mouseup', () => { drag = null; });

        const channelsEl = win.querySelector('#' + UID + 'channels');
        const playerEl = win.querySelector('#' + UID + 'player');
        const searchEl = win.querySelector('#' + UID + 'search');

        let allChannels = [];
        let hls = null;

        function renderChannels(filter) {
            const q = (filter || '').toLowerCase();
            const filtered = q ? allChannels.filter(c => c.name.toLowerCase().includes(q)) : allChannels.slice(0, 300);
            channelsEl.innerHTML = filtered.map((c, i) => `
                <div class="iptv-ch" data-idx="${allChannels.indexOf(c)}">
                    ${c.logo ? `<img src="${c.logo}" alt="" onerror="this.style.display='none'"/>` : '<span style="width:22px"></span>'}
                    <span>${escapeHtml(c.name)}</span>
                </div>
            `).join('');
            channelsEl.querySelectorAll('.iptv-ch').forEach(el => {
                el.addEventListener('click', () => playChannel(parseInt(el.dataset.idx, 10)));
            });
        }

        async function playChannel(idx) {
            const ch = allChannels[idx];
            if (!ch) return;

            channelsEl.querySelectorAll('.iptv-ch').forEach(el => el.classList.remove('active'));
            const activeEl = channelsEl.querySelector(`[data-idx="${idx}"]`);
            if (activeEl) activeEl.classList.add('active');

            playerEl.innerHTML = '<div class="iptv-placeholder"><div class="iptv-spin" style="margin:0 auto 10px"></div>Conectando…</div>';

            try {
                const Hls = await loadHlsJs();
                playerEl.innerHTML = '<video id="' + UID + 'video" controls autoplay></video>';
                const video = document.getElementById(UID + 'video');

                if (hls) { hls.destroy(); hls = null; }

                if (Hls.isSupported()) {
                    hls = new Hls();
                    hls.loadSource(ch.url);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            playerEl.innerHTML = '<div class="iptv-placeholder">⚠️ Canal indisponível ou stream offline.<br>Tente outro.</div>';
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Safari toca HLS nativamente
                    video.src = ch.url;
                } else {
                    playerEl.innerHTML = '<div class="iptv-placeholder">Seu navegador não suporta streams HLS.</div>';
                }
            } catch (e) {
                playerEl.innerHTML = '<div class="iptv-placeholder">⚠️ Erro ao carregar player: ' + escapeHtml(e.message) + '</div>';
            }
        }

        searchEl.addEventListener('input', () => renderChannels(searchEl.value));

        // Carrega a lista pública do iptv-org (mesmo domínio: iptv-org.github.io, sem proxy)
        fetch(PLAYLIST_INDEX_URL)
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(text => {
                allChannels = parseM3U(text);
                renderChannels('');
            })
            .catch(e => {
                channelsEl.innerHTML = '<div class="iptv-err">⚠️ Falha ao carregar lista de canais.<br>' + escapeHtml(e.message) + '</div>';
            });

        function minimize() { win.style.display = 'none'; }
        function kill() {
            if (hls) hls.destroy();
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
