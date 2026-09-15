(function() {
    'use strict';
    const UID = '_groq';
    if (window[UID]) return;

    const GEOM_KEY = 'sang_panel_groq_state';
    const MIN_W = 380, MIN_H = 420;
    const MODELOS = [
        { id: 'llama-3.3-70b-versatile', nome: 'Llama 3.3 70B (equilibrado)' },
        { id: 'llama-3.1-8b-instant', nome: 'Llama 3.1 8B (mais rápido, 14k/dia)' },
        { id: 'openai/gpt-oss-120b', nome: 'GPT-OSS 120B (mais inteligente)' }
    ];

    function loadGeom() {
        try {
            const s = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null');
            if (s && typeof s.left === 'number') return s;
        } catch (_) {}
        return null;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function init() {
        if (window[UID]) return;

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
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0b0d12; border: 1px solid rgba(139,92,246,.2); border-radius: 14px;
            overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.7), 0 0 28px rgba(139,92,246,.08);
        }
        .hdr {
            height: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
            padding: 0 12px; cursor: grab; user-select: none; touch-action: none;
            border-bottom: 1px solid rgba(139,92,246,.12);
            background: linear-gradient(180deg, #1a1428, #0f0d18);
        }
        .hdr.dragging { cursor: grabbing; }
        .brand { display: flex; align-items: center; gap: 8px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #8b5cf6;
            box-shadow: 0 0 10px #8b5cf6, 0 0 20px rgba(139,92,246,.4); }
        .title { font-weight: 800; font-size: 12.5px; letter-spacing: .1em; color: #e8e0f5;
            font-family: "Courier New", monospace; text-transform: uppercase; }
        .actions { display: flex; gap: 6px; }
        .btn {
            width: 26px; height: 26px; border-radius: 7px;
            background: rgba(139,92,246,.1); border: 1px solid rgba(139,92,246,.22);
            color: #b8a8d8; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 12px; transition: all .15s;
        }
        .btn:hover { background: #8b5cf6; color: #fff; border-color: #8b5cf6; }
        .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .log {
            flex: 1; overflow-y: auto; padding: 14px 16px;
            display: flex; flex-direction: column; gap: 10px;
        }
        .log::-webkit-scrollbar { width: 5px; }
        .log::-webkit-scrollbar-thumb { background: rgba(139,92,246,.35); border-radius: 3px; }
        .msg {
            max-width: 84%; padding: 9px 13px; border-radius: 12px;
            font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;
        }
        .msg.user {
            align-self: flex-end; background: linear-gradient(135deg, #6d28d9, #8b5cf6);
            color: #fff; border-bottom-right-radius: 4px;
        }
        .msg.ia {
            align-self: flex-start; background: rgba(139,92,246,.08);
            border: 1px solid rgba(139,92,246,.16); color: #ddd6f3;
            border-bottom-left-radius: 4px;
        }
        .msg.sys {
            align-self: center; background: rgba(255,255,255,.04);
            color: #7a6a98; font-size: 10.5px; font-style: italic; padding: 6px 10px;
        }
        .msg.erro {
            align-self: center; background: rgba(255,80,80,.1);
            border: 1px solid rgba(255,80,80,.25); color: #ffb0b0; font-size: 11px;
        }
        .input-bar {
            display: flex; gap: 6px; padding: 10px 12px; flex-shrink: 0;
            border-top: 1px solid rgba(139,92,246,.12); background: rgba(0,0,0,.2);
        }
        .input-bar textarea {
            flex: 1; background: rgba(255,255,255,.04);
            border: 1px solid rgba(139,92,246,.18); border-radius: 9px;
            padding: 8px 11px; color: #e8e0f5; font-size: 12.5px; outline: none;
            resize: none; min-height: 38px; max-height: 110px;
            font-family: inherit; line-height: 1.4;
        }
        .input-bar textarea:focus { border-color: rgba(139,92,246,.5); }
        .input-bar textarea::placeholder { color: #5b4a78; }
        .input-bar button {
            background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            border: none; border-radius: 9px; padding: 0 16px;
            color: #fff; font-weight: 700; font-size: 11.5px; cursor: pointer;
            transition: filter .15s;
        }
        .input-bar button:hover:not(:disabled) { filter: brightness(1.15); }
        .input-bar button:disabled { opacity: .4; cursor: not-allowed; }
        .model-select {
            padding: 8px 12px; flex-shrink: 0; display: flex; align-items: center; gap: 8px;
            border-bottom: 1px solid rgba(139,92,246,.08);
        }
        .model-select select {
            flex: 1; background: #14101e; border: 1px solid rgba(139,92,246,.2);
            border-radius: 7px; padding: 6px 9px; color: #c8b8e8; font-size: 11px;
            outline: none; cursor: pointer;
        }
        .model-select select:focus { border-color: rgba(139,92,246,.5); }
        .spin {
            width: 16px; height: 16px; border: 2px solid rgba(139,92,246,.2);
            border-top-color: #8b5cf6; border-radius: 50%;
            animation: spin .7s linear infinite; display: inline-block; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .resize-handle {
            position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
            cursor: nwse-resize; touch-action: none;
            background: linear-gradient(135deg, transparent 50%, rgba(139,92,246,.3) 50%);
        }
        `;
        root.appendChild(style);

        const geom = loadGeom() || { left: 80, top: 80, width: 460, height: 580 };
        geom.width = Math.max(MIN_W, geom.width);
        geom.height = Math.max(MIN_H, geom.height);

        const state = {
            mensagens: [], // { role, content }
            modelo: MODELOS[0].id,
            enviando: false,
            abortController: null
        };

        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.style.left = geom.left + 'px';
        panel.style.top = geom.top + 'px';
        panel.style.width = geom.width + 'px';
        panel.style.height = geom.height + 'px';
        panel.innerHTML = `
            <div class="hdr" id="hdr">
                <div class="brand">
                    <span class="dot"></span>
                    <span class="title">Groq</span>
                </div>
                <div class="actions">
                    <button class="btn" id="btnKey" title="Configurar API key">⚙</button>
                    <button class="btn" id="btnClear" title="Limpar conversa">🗑</button>
                    <button class="btn" id="btnMin" title="Minimizar">−</button>
                    <button class="btn" id="btnCls" title="Fechar">✕</button>
                </div>
            </div>
            <div class="model-select">
                <select id="modelSel">
                    ${MODELOS.map(m => `<option value="${m.id}">${m.nome}</option>`).join('')}
                </select>
            </div>
            <div class="body">
                <div class="log" id="log"></div>
                <div class="input-bar">
                    <textarea id="input" rows="1" placeholder="Pergunte algo…"></textarea>
                    <button id="send">Enviar</button>
                </div>
            </div>
            <div class="resize-handle" id="resizeHandle"></div>
        `;
        root.appendChild(panel);

        // Impede vazamento de teclas pro jogo
        function stopProp(e) { e.stopPropagation(); }
        const LEAK_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput'];
        LEAK_EVENTS.forEach(t => host.addEventListener(t, t === 'keydown' ? (e) => {
            if (e.key === 'Escape' && !minimized) kill();
            e.stopPropagation();
        } : stopProp));

        const hdr = panel.querySelector('#hdr');
        const logEl = panel.querySelector('#log');
        const inputEl = panel.querySelector('#input');
        const sendBtn = panel.querySelector('#send');
        const modelSel = panel.querySelector('#modelSel');
        const resizeHandle = panel.querySelector('#resizeHandle');

        // ---- UI helpers ----
        function addMsg(tipo, texto) {
            const el = document.createElement('div');
            el.className = 'msg ' + tipo;
            el.textContent = texto;
            logEl.appendChild(el);
            logEl.scrollTop = logEl.scrollHeight;
            return el;
        }

        function addMsgHtml(tipo, html) {
            const el = document.createElement('div');
            el.className = 'msg ' + tipo;
            el.innerHTML = html;
            logEl.appendChild(el);
            logEl.scrollTop = logEl.scrollHeight;
            return el;
        }

        function limparLog() {
            logEl.innerHTML = '';
            state.mensagens = [];
            addMsg('sys', 'Conversa limpa. Pergunte algo.');
        }

        // ---- Enviar ----
        async function enviar() {
            const texto = inputEl.value.trim();
            if (!texto || state.enviando) return;

            // Verifica se o serviço está registrado
            if (!window._apis || !window._apis.groq) {
                addMsg('erro', 'Serviço "groq" não registrado no apis.js.');
                return;
            }

            // Verifica chave
            if (!window._apis.getKey('groq')) {
                addMsg('erro', 'Configure sua API key do Groq primeiro (⚙).');
                return;
            }

            state.enviando = true;
            sendBtn.disabled = true;
            inputEl.value = '';
            inputEl.style.height = 'auto';

            addMsg('user', texto);
            state.mensagens.push({ role: 'user', content: texto });

            const pendente = addMsgHtml('ia', '<span class="spin"></span>');

            if (state.abortController) state.abortController.abort();
            const controller = new AbortController();
            state.abortController = controller;

            try {
                const resposta = await window._apis.groq(
                    {
                        mensagens: state.mensagens,
                        modelo: state.modelo,
                        maxTokens: 2048
                    },
                    { signal: controller.signal, forceRefresh: true }
                );

                pendente.textContent = resposta;
                state.mensagens.push({ role: 'assistant', content: resposta });
            } catch (e) {
                if (e.name === 'AbortError') {
                    pendente.remove();
                } else {
                    pendente.className = 'msg erro';
                    pendente.textContent = '⚠ ' + (e.message || 'Erro na chamada');
                }
            } finally {
                state.enviando = false;
                sendBtn.disabled = false;
                inputEl.focus();
                logEl.scrollTop = logEl.scrollHeight;
            }
        }

        // ---- Eventos ----
        sendBtn.addEventListener('click', enviar);
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviar();
            }
        });
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(110, inputEl.scrollHeight) + 'px';
        });

        modelSel.addEventListener('change', () => {
            state.modelo = modelSel.value;
        });

        panel.querySelector('#btnClear').addEventListener('click', limparLog);

        panel.querySelector('#btnKey').addEventListener('click', () => {
            const atual = window._apis ? window._apis.getKey('groq') : '';
            const nova = window.prompt('Cole sua API key do Groq (console.groq.com/keys):', atual);
            if (nova === null) return;
            if (window._apis) {
                window._apis.setKey('groq', nova.trim());
                addMsg('sys', nova.trim() ? 'Chave salva.' : 'Chave removida.');
            }
        });

        // ---- Drag ----
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
            geom.left = dragStart.left + dx;
            geom.top = dragStart.top + dy;
            geom.left = Math.min(Math.max(0, geom.left), window.innerWidth - 100);
            geom.top = Math.min(Math.max(0, geom.top), window.innerHeight - 60);
            panel.style.left = geom.left + 'px';
            panel.style.top = geom.top + 'px';
        }
        function endDrag(e) {
            if (dragPointerId === null || (e && e.pointerId !== dragPointerId)) return;
            try { hdr.releasePointerCapture(dragPointerId); } catch (_) {}
            hdr.classList.remove('dragging');
            dragPointerId = null;
            if (dragMoved) salvarGeom();
        }
        hdr.addEventListener('pointerdown', onPointerDown);
        hdr.addEventListener('pointermove', onPointerMove);
        hdr.addEventListener('pointerup', endDrag);
        hdr.addEventListener('pointercancel', endDrag);

        // ---- Resize ----
        let resizePointerId = null, resizeStart = null;
        function onResizeDown(e) {
            e.stopPropagation();
            resizePointerId = e.pointerId;
            resizeStart = { mouseX: e.clientX, mouseY: e.clientY, width: geom.width, height: geom.height };
            resizeHandle.setPointerCapture(resizePointerId);
        }
        function onResizeMove(e) {
            if (resizePointerId === null || e.pointerId !== resizePointerId) return;
            geom.width = Math.max(MIN_W, resizeStart.width + (e.clientX - resizeStart.mouseX));
            geom.height = Math.max(MIN_H, resizeStart.height + (e.clientY - resizeStart.mouseY));
            panel.style.width = geom.width + 'px';
            panel.style.height = geom.height + 'px';
        }
        function endResize(e) {
            if (resizePointerId === null || (e && e.pointerId !== resizePointerId)) return;
            try { resizeHandle.releasePointerCapture(resizePointerId); } catch (_) {}
            resizePointerId = null;
            salvarGeom();
        }
        resizeHandle.addEventListener('pointerdown', onResizeDown);
        resizeHandle.addEventListener('pointermove', onResizeMove);
        resizeHandle.addEventListener('pointerup', endResize);
        resizeHandle.addEventListener('pointercancel', endResize);

        // ---- Persistência ----
        let saveTimer = null;
        function salvarGeom() {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                try { localStorage.setItem(GEOM_KEY, JSON.stringify(geom)); } catch (_) {}
            }, 300);
        }

        // ---- Minimizar / Fechar ----
        let minimized = false;
        panel.querySelector('#btnMin').addEventListener('click', () => {
            minimized = !minimized;
            panel.style.display = minimized ? 'none' : 'flex';
        });
        panel.querySelector('#btnCls').addEventListener('click', kill);

        function kill() {
            if (saveTimer) clearTimeout(saveTimer);
            if (state.abortController) state.abortController.abort();
            host.remove();
            delete window[UID];
        }

        window[UID] = {
            kill,
            show: () => { minimized = false; panel.style.display = 'flex'; },
            hide: () => { minimized = true; panel.style.display = 'none'; }
        };

        // Mensagem inicial
        addMsg('sys', 'Groq pronto. Modelo: ' + MODELOS[0].nome + '. Configure a key (⚙) se ainda não fez.');
    }

    if (document.body) {
        init();
    } else {
        new MutationObserver((_, obs) => {
            if (document.body) { obs.disconnect(); init(); }
        }).observe(document.documentElement, { childList: true });
    }
})();
