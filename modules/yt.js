
(function() {
    'use strict';
    const UID = '_yt';
    if (window._yt) return;

    function init() {
        if (window._yt) return;

        const style = document.createElement('style');
        style.setAttribute('data-yt', '1');
        style.textContent = `
        @keyframes ytlBreathe{0%,100%{box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 18px rgba(255,30,30,0.18),0 0 0 1px rgba(255,60,60,0.12)}
            50%{box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 34px rgba(255,30,30,0.4),0 0 0 1px rgba(255,60,60,0.3)}}

        #${UID}{position:fixed;top:70px;left:70px;width:640px;height:430px;min-width:340px;min-height:240px;
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
            padding:0 14px;color:#fff;font-weight:700;font-size:11px;cursor:pointer;transition:filter .15s}
        #${UID} .ytl-searchbar button:hover{filter:brightness(1.15)}

        #${UID} .ytl-body{flex:1;min-height:0;position:relative;background:#000}
        #${UID} .ytl-body iframe{width:100%;height:100%;border:0;border-radius:0 0 12px 12px}
        #${UID} .ytl-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            color:#7a5252;font-size:11.5px;text-align:center;padding:20px}
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
                <input type="text" id="${UID}input" placeholder="Cole o link ou ID do vídeo do YouTube…" />
                <button id="${UID}go">Play</button>
            </div>
            <div class="ytl-body" id="${UID}body">
                <div class="ytl-empty">Cole um link do YouTube acima e aperte Play</div>
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

        // Extrai o video ID de qualquer formato de link do YouTube
        function extractVideoId(input) {
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

        const body = win.querySelector('#' + UID + 'body');
        const input = win.querySelector('#' + UID + 'input');

        function playVideo() {
            const id = extractVideoId(input.value);
            if (!id) {
                body.innerHTML = '<div class="ytl-empty">Link inválido — cole uma URL ou ID de vídeo do YouTube</div>';
                return;
            }
            body.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        }

        win.querySelector('#' + UID + 'go').addEventListener('click', playVideo);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') playVideo(); });

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
