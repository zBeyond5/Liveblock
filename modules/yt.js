(function () {
    'use strict';
    const UID = '_yt';
    if (window[UID]) return;

    const STORAGE_KEY = 'sang_panel_yt_state';

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (
                typeof s.left === 'number' && typeof s.top === 'number' &&
                typeof s.width === 'number' && typeof s.height === 'number'
            ) return s;
        } catch (_) {}
        return null;
    }

    function init() {
        if (window[UID]) return;

        // ---- Host + Shadow DOM (isola de CSS do jogo, evita reflow custoso por especificidade externa) ----
        const host = document.createElement('div');
        host.id = UID + '_host';
        host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483000;';
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
        :host { all: initial; }
        @media (prefers-reduced-motion: no-preference) {
            @keyframes breathe {
                0%,100% { box-shadow:0 20px 50px rgba(0,0,0,.6),0 0 18px rgba(255,30,30,.18),0 0 0 1px rgba(255,60,60,.12); }
                50%     { box-shadow:0 20px 50px rgba(0,0,0,.6),0 0 34px rgba(255,30,30,.4),0 0 0 1px rgba(255,60,60,.3); }
            }
            .panel { animation: breathe 4.5s ease-in-out infinite; }
        }
        .panel {
            position: fixed;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(175deg, rgba(18,10,10,.94), rgba(8,4,4,.98));
            backdrop-filter: blur(16px) saturate(140%);
            border: 1px solid rgba(255,60,60,.18);
            border-radius: 18px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            /* resize:both nativo removido: usamos ResizeObserver + handle próprio,
               pra ter controle e persistência do tamanho sem custo extra de layout */
            contain: layout style paint; /* isola reflow/repaint do resto da página */
        }
        .hdr {
            height: 38px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 12px; cursor: grab; user-select: none; touch-action: none;
            border-bottom: 1px solid rgba(255,60,60,.12);
        }
        .hdr.dragging { cursor: grabbing; }
        .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #ff2d2d; box-shadow: 0 0 8px rgba(255,45,45,.9); flex-shrink: 0; }
        .title { font-weight: 800; font-size: 12.5px; letter-spacing: .06em; color: #ffecec; white-space: nowrap; }
        .actions { display: flex; gap: 6px; flex-shrink: 0; }
        .btn {
            width: 24px; height: 24px; border-radius: 7px;
            background: rgba(255,60,60,.08); border: 1px solid rgba(255,60,60,.18);
            color: #ffb3b3; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 12px; transition: background .18s ease, color .18s ease, box-shadow .18s ease;
        }
        .btn:hover, .btn:focus-visible { background: #ff2d2d; color: #1a0505; border-color: transparent; box-shadow: 0 0 12px rgba(255,45,45,.5); outline: none; }
        .body { flex: 1; min-height: 0; position: relative; background: #000; }
        .resize-handle {
            position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
            cursor: nwse-resize; touch-action: none;
            background: linear-gradient(135deg, transparent 50%, rgba(255,60,60,.35) 50%);
        }
        `;
        root.appendChild(style);

        // ---- Estado inicial (persistido ou default) ----
        const saved = loadState();
        const MIN_W = 420, MIN_H = 320;
        const state = saved || { left: 70, top: 70, width: 800, height: 520 };
        clampState(state);

        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.style.left = state.left + 'px';
        panel.style.top = state.top + 'px';
        panel.style.width = state.width + 'px';
        panel.style.height = state.height + 'px';
        panel.innerHTML = `
            <div class="hdr" id="hdr">
                <div class="brand"><span class="dot"></span><span class="title">PAINEL</span></div>
                <div class="actions">
                    <div class="btn" id="btnMin" role="button" tabindex="0" aria-label="Minimizar">−</div>
                    <div class="btn" id="btnCls" role="button" tabindex="0" aria-label="Fechar">✕</div>
                </div>
            </div>
            <div class="body" id="body">
                <!-- conteúdo do módulo entra aqui -->
            </div>
            <div class="resize-handle" id="resizeHandle" aria-hidden="true"></div>
        `;
        root.appendChild(panel);

        const hdr = panel.querySelector('#hdr');
        const btnMin = panel.querySelector('#btnMin');
        const btnCls = panel.querySelector('#btnCls');
        const resizeHandle = panel.querySelector('#resizeHandle');

        function clampState(s) {
            s.width = Math.max(MIN_W, s.width);
            s.height = Math.max(MIN_H, s.height);
            const maxLeft = Math.max(0, window.innerWidth - s.width);
            const maxTop = Math.max(0, window.innerHeight - s.height);
            s.left = Math.min(Math.max(0, s.left), maxLeft);
            s.top = Math.min(Math.max(0, s.top), maxTop);
        }

        // ---- Persistência
        let saveTimer = null;
        function scheduleSave() {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
            }, 300);
        }

        // ---- Drag (Pointer Events + setPointerCapture, com threshold pra evitar drag fantasma) ----
        let dragPointerId = null;
        let dragStart = null; // { mouseX, mouseY, left, top }
        let dragMoved = false;
        const DRAG_THRESHOLD = 3;

        function onPointerDown(e) {
            if (e.target.closest('.btn')) return;
            dragPointerId = e.pointerId;
            dragMoved = false;
            dragStart = { mouseX: e.clientX, mouseY: e.clientY, left: state.left, top: state.top };
            hdr.setPointerCapture(dragPointerId);
            hdr.classList.add('dragging');
        }

        function onPointerMove(e) {
            if (dragPointerId === null || e.pointerId !== dragPointerId) return;
            const dx = e.clientX - dragStart.mouseX;
            const dy = e.clientY - dragStart.mouseY;
            if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            dragMoved = true;

            state.left = dragStart.left + dx;
            state.top = dragStart.top + dy;
            clampState(state);
            panel.style.left = state.left + 'px';
            panel.style.top = state.top + 'px';
        }

        function endDrag(e) {
            if (dragPointerId === null || (e && e.pointerId !== dragPointerId)) return;
            try { hdr.releasePointerCapture(dragPointerId); } catch (_) {}
            hdr.classList.remove('dragging');
            dragPointerId = null;
            if (dragMoved) scheduleSave();
        }

        hdr.addEventListener('pointerdown', onPointerDown);
        hdr.addEventListener('pointermove', onPointerMove);
        hdr.addEventListener('pointerup', endDrag);
        hdr.addEventListener('pointercancel', endDrag);

        // ---- Resize (handle próprio via Pointer Events, sem `resize:both` nativo) ----
        let resizePointerId = null;
        let resizeStart = null; // { mouseX, mouseY, width, height }

        function onResizeDown(e) {
            e.stopPropagation();
            resizePointerId = e.pointerId;
            resizeStart = { mouseX: e.clientX, mouseY: e.clientY, width: state.width, height: state.height };
            resizeHandle.setPointerCapture(resizePointerId);
        }

        function onResizeMove(e) {
            if (resizePointerId === null || e.pointerId !== resizePointerId) return;
            const dx = e.clientX - resizeStart.mouseX;
            const dy = e.clientY - resizeStart.mouseY;
            state.width = resizeStart.width + dx;
            state.height = resizeStart.height + dy;
            clampState(state);
            panel.style.width = state.width + 'px';
            panel.style.height = state.height + 'px';
        }

        function endResize(e) {
            if (resizePointerId === null || (e && e.pointerId !== resizePointerId)) return;
            try { resizeHandle.releasePointerCapture(resizePointerId); } catch (_) {}
            resizePointerId = null;
            scheduleSave();
        }

        resizeHandle.addEventListener('pointerdown', onResizeDown);
        resizeHandle.addEventListener('pointermove', onResizeMove);
        resizeHandle.addEventListener('pointerup', endResize);
        resizeHandle.addEventListener('pointercancel', endResize);

        // ---- Reclamp 
        function onWindowResize() {
            clampState(state);
            panel.style.left = state.left + 'px';
            panel.style.top = state.top + 'px';
            panel.style.width = state.width + 'px';
            panel.style.height = state.height + 'px';
        }
        window.addEventListener('resize', onWindowResize);

        // ---- Minimizar / Fechar ----
        let minimized = false;
        function toggleMinimize() {
            minimized = !minimized;
            panel.style.display = minimized ? 'none' : 'flex';
        }
        function onKeydownActivate(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
        }
        btnMin.addEventListener('click', toggleMinimize);
        btnMin.addEventListener('keydown', onKeydownActivate);
        btnCls.addEventListener('click', kill);
        btnCls.addEventListener('keydown', onKeydownActivate);

        // ---- Esc fecha (só quando o painel está visível e focado no host) ----
        function onKeyDown(e) {
            if (e.key === 'Escape' && !minimized) kill();
        }
        document.addEventListener('keydown', onKeyDown);

        // ---- kill(): limpa TUDO — listeners globais, observers, timers, DOM ----
        function kill() {
            if (saveTimer) clearTimeout(saveTimer);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onWindowResize);

            hdr.removeEventListener('pointerdown', onPointerDown);
            hdr.removeEventListener('pointermove', onPointerMove);
            hdr.removeEventListener('pointerup', endDrag);
            hdr.removeEventListener('pointercancel', endDrag);

            resizeHandle.removeEventListener('pointerdown', onResizeDown);
            resizeHandle.removeEventListener('pointermove', onResizeMove);
            resizeHandle.removeEventListener('pointerup', endResize);
            resizeHandle.removeEventListener('pointercancel', endResize);

            host.remove();
            delete window[UID];
        }

        window[UID] = {
            kill,
            show: () => { minimized = false; panel.style.display = 'flex'; },
            hide: () => { minimized = true; panel.style.display = 'none'; },
            get body() { return panel.querySelector('#body'); } // ponto de extensão pro conteúdo do módulo
        };
    }

    if (document.body) {
        init();
    } else {
        // observer em vez de setInterval: dispara uma única vez, sem polling
        new MutationObserver((_, obs) => {
            if (document.body) { obs.disconnect(); init(); }
        }).observe(document.documentElement, { childList: true });
    }
})();
