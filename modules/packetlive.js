(function() {
    'use strict';
    const UID = '_analyzer';
    if (window[UID]) { try { window[UID].kill(); } catch(e) {} }

    // ─── Cleanup global ───
    const cleanup = [];
    const on = (target, type, fn, opts) => {
        target.addEventListener(type, fn, opts);
        cleanup.push(() => { try { target.removeEventListener(type, fn, opts); } catch(e) {} });
    };
    let _alive = true;

    // ─── Storage ───
    const Storage = {
        get(key, def) {
            try {
                const raw = localStorage.getItem(`hl_pro_${key}`);
                if (raw === null) return def;
                return JSON.parse(raw);
            } catch (e) { return def; }
        },
        set(key, val) {
            try { localStorage.setItem(`hl_pro_${key}`, JSON.stringify(val)); } catch (e) {}
        }
    };

    const AppState = {
        blIds: new Set(Storage.get('bl_ids', [])),
        blPayloads: Storage.get('bl_payloads', []),
        dropIds: new Set(Storage.get('drop_ids', [])),
        dropPayloads: Storage.get('drop_payloads', []),
        profiles: Storage.get('profiles', { default: { name: 'Padrão', packets: [], spamInterval: 300, spamQtd: 1 } }),
        currentProfileId: Storage.get('current_profile', 'default'),
        globalPacketCount: 0,
        logs: [],
        maxLogs: 2000,
        isPaused: false,
        killSwitchActive: false,
        fontSize: Storage.get('font_size', 13),
        showSend: true,
        showRecv: true,
        dicionario: Storage.get('dicionario', {}),  // { [id]: { count, primeiro, ultimo, tamanhoMedio, descricao? } }
        chatIA: []  // histórico da conversa com a IA (em memória, não persiste)
    };

    // ─── Utilitários binários ───
    const Utils = {
        bufferToHex(buffer) {
            if (!buffer || buffer.byteLength === 0) return '';
            return Array.from(new Uint8Array(buffer))
                .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
        },
        bufferToString(buffer) {
            if (!buffer || buffer.byteLength === 0) return '';
            return new TextDecoder('utf-8').decode(buffer).replace(/[^\x20-\x7E]/g, '\u00B7');
        },
        buildPacket(headerId, hexPayloadStr) {
            const cleanHex = hexPayloadStr.replace(/[^0-9A-Fa-f]/g, '');
            const payloadLen = cleanHex.length / 2;
            const buffer = new ArrayBuffer(4 + 2 + payloadLen);
            const view = new DataView(buffer);
            view.setInt32(0, 2 + payloadLen, false);
            view.setInt16(4, headerId, false);
            const u8 = new Uint8Array(buffer);
            for (let i = 0; i < payloadLen; i++) {
                u8[6 + i] = parseInt(cleanHex.substr(i * 2, 2), 16);
            }
            return buffer;
        },
        parseData(data) {
            if (!(data instanceof ArrayBuffer) || data.byteLength < 6) return null;
            const view = new DataView(data);
            const header = view.getInt16(4, false);
            const fullHex = this.bufferToHex(data);
            const payloadBuf = data.slice(6);
            const payloadHex = this.bufferToHex(payloadBuf);
            return {
                header,
                fullHex,
                payloadHex,
                ascii: this.bufferToString(payloadBuf),
                byteLength: data.byteLength
            };
        }
    };

    // ─── Firewall e filtros ───
    const PacketFilter = {
        isVisualBlocked(packet) {
            if (AppState.blIds.has(packet.header)) return true;
            const cleanPacketHex = packet.fullHex.replace(/\s/g, '').toUpperCase();
            for (const rule of AppState.blPayloads) {
                if (cleanPacketHex.includes(rule.replace(/\s/g, '').toUpperCase()) || packet.ascii.includes(rule)) {
                    return true;
                }
            }
            return false;
        },
        isNetworkDropped(packet) {
            if (AppState.dropIds.has(packet.header)) return true;
            const cleanPacketHex = packet.fullHex.replace(/\s/g, '').toUpperCase();
            for (const rule of AppState.dropPayloads) {
                if (cleanPacketHex.includes(rule.replace(/\s/g, '').toUpperCase()) || packet.ascii.includes(rule)) {
                    return true;
                }
            }
            return false;
        },
        manageList(type, action, val) {
            let targetSet, targetArr, storeKeyId, storeKeyStr;
            if (type === 'VISUAL') {
                targetSet = AppState.blIds; targetArr = AppState.blPayloads;
                storeKeyId = 'bl_ids'; storeKeyStr = 'bl_payloads';
            } else {
                targetSet = AppState.dropIds; targetArr = AppState.dropPayloads;
                storeKeyId = 'drop_ids'; storeKeyStr = 'drop_payloads';
            }
            if (action === 'ADD_ID' && !isNaN(val)) { targetSet.add(Number(val)); Storage.set(storeKeyId, [...targetSet]); }
            if (action === 'ADD_STR' && val) { if (!targetArr.includes(val)) targetArr.push(val); Storage.set(storeKeyStr, targetArr); }
            if (action === 'REMOVE_ID' && !isNaN(val)) { targetSet.delete(Number(val)); Storage.set(storeKeyId, [...targetSet]); }
            if (action === 'REMOVE_STR' && val) { const idx = targetArr.indexOf(val); if (idx > -1) targetArr.splice(idx, 1); Storage.set(storeKeyStr, targetArr); }
            if (action === 'CLEAR') { targetSet.clear(); targetArr.length = 0; Storage.set(storeKeyId, []); Storage.set(storeKeyStr, []); }
        }
    };

    // ─── Inbound transformer (pass-through) ───
    const InboundTransformer = {
        rules: {},
        transform(data) { return data; }
    };

    // ═══════════════════════════════════════════════════════════════
    // SANG AI SERVICE — toda comunicação com Groq passa por aqui
    // ═══════════════════════════════════════════════════════════════
    const SangAI = {
        disponivel() {
            return !!(window._apis?.groq && window._apis.getKey?.('groq'));
        },

        async _chamar(systemPrompt, userContent, opts = {}) {
            if (!this.disponivel()) throw new Error('Sang AI não configurada');
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
            try {
                const r = await window._apis.groq({
                    mensagens: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent }
                    ],
                    maxTokens: opts.maxTokens || 500,
                    temperature: opts.temperature ?? 0.3
                }, { signal: ctrl.signal, forceRefresh: true });
                return (r || '').trim();
            } finally {
                clearTimeout(timer);
            }
        },

        async analisarPacote(packet) {
            return this._chamar(
                'Você analisa pacotes de rede de um jogo online estilo Habbo. ' +
                'Responda em português, direto, sem introdução. Máximo 4 frases. ' +
                'Explique: (1) o que o pacote parece fazer, (2) o que os bytes representam, ' +
                '(3) se é comum ou suspeito. Se não souber, diga "provável" ou "possível".',
                `ID: ${packet.header}\nTamanho: ${packet.byteLength} bytes\n` +
                `Hex: ${packet.fullHex}\nASCII: ${packet.ascii || '(binário)'}`,
                { maxTokens: 350 }
            );
        },

        async analisarSequencia(packets) {
            const linhas = packets.slice(0, 30).map(p =>
                `[${p.dir}] ID ${p.header} (${p.byteLength}b): ${p.fullHex.slice(0, 120)}`
            ).join('\n');
            return this._chamar(
                'Você analisa uma sequência de pacotes de rede de um jogo online estilo Habbo. ' +
                'Responda em português, direto, sem introdução. Máximo 5 frases. ' +
                'Conte a "história" da sequência: o que está acontecendo entre cliente e servidor.',
                `Últimos ${packets.length} pacotes:\n\n${linhas}`,
                { maxTokens: 500 }
            );
        },

        async criarFiltroLinguagemNatural(descricao, amostras) {
            const amostrasTxt = amostras.slice(0, 20).map(p =>
                `ID ${p.header} (${p.byteLength}b) ASCII: "${p.ascii.slice(0, 40)}"`
            ).join('\n');
            return this._chamar(
                'Você converte comandos em português em regras de filtro para um analisador de pacotes. ' +
                'Responda SOMENTE com JSON válido, sem markdown, sem comentários.\n' +
                'Formato: {"ids":[123],"strings":["ABC"],"motivo":"..."}\n' +
                '- "ids": array de IDs numéricos (pode ser vazio)\n' +
                '- "strings": array de strings para buscar no hex/ascii (pode ser vazio)\n' +
                '- "motivo": explicação curta da regra',
                `Comando: "${descricao}"\n\nAmostras recentes:\n${amostrasTxt}`,
                { maxTokens: 300, temperature: 0.2 }
            );
        },

        async gerarJs(descricao, contexto) {
            return this._chamar(
                'Você gera código JavaScript para uma fila de ações em um analisador de pacotes de jogo. ' +
                'O código roda dentro de uma função assíncrona com acesso a:\n' +
                '- window.gameWS.send(buffer) para enviar pacotes\n' +
                '- sleep(ms) para aguardar\n' +
                '- Utils.buildPacket(id, hexPayload) para montar pacotes\n\n' +
                'Responda SOMENTE com o código JS, sem markdown, sem comentários explicativos, ' +
                'sem bloco de código. Use uma linha só se possível.',
                `Pedido: "${descricao}"\n\nContexto: ${contexto || 'nenhum'}`,
                { maxTokens: 400, temperature: 0.2 }
            );
        },

        async chatLivre(mensagem, contextoPacotes) {
            const ctx = contextoPacotes && contextoPacotes.length
                ? '\n\nContexto — últimos pacotes capturados:\n' +
                  contextoPacotes.slice(0, 15).map(p =>
                      `[${p.dir}] ID ${p.header} (${p.byteLength}b): ${p.fullHex.slice(0, 80)}`
                  ).join('\n')
                : '';
            return this._chamar(
                'Você é Sang AI, assistente embutida num analisador de pacotes de rede de jogo online ' +
                '(estilo Habbo). Responda em português, direto. Você pode ajudar a entender pacotes, ' +
                'sugerir filtros, explicar o protocolo, gerar comandos. Seja útil e específica.',
                mensagem + ctx,
                { maxTokens: 600 }
            );
        }
    };

    // ─── Helpers de janela ───
    function clampToViewport(targetEl, x, y) {
        const rect = targetEl.getBoundingClientRect();
        const margin = 40;
        const maxX = window.innerWidth - margin;
        const maxY = window.innerHeight - margin;
        const minX = margin - rect.width;
        const minY = 0;
        return {
            x: Math.min(Math.max(x, minX), maxX),
            y: Math.min(Math.max(y, minY), maxY)
        };
    }

    function makeDraggable(handleEl, targetEl, storageKey) {
        let isDragging = false, offX, offY;
        if (storageKey) {
            const saved = Storage.get(storageKey + '_pos', null);
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
                targetEl.style.left = saved.left + 'px';
                targetEl.style.top = saved.top + 'px';
                targetEl.style.right = 'auto';
                targetEl.style.bottom = 'auto';
                targetEl.style.transform = 'none';
            }
        }
        on(handleEl, 'mousedown', function(e) {
            if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
            isDragging = true;
            const rect = targetEl.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
        });
        on(document, 'mousemove', function(e) {
            if (!isDragging) return;
            const clamped = clampToViewport(targetEl, e.clientX - offX, e.clientY - offY);
            targetEl.style.left = clamped.x + 'px';
            targetEl.style.top = clamped.y + 'px';
            targetEl.style.right = 'auto';
            targetEl.style.bottom = 'auto';
            targetEl.style.transform = 'none';
        });
        on(document, 'mouseup', function() {
            if (!isDragging) return;
            isDragging = false;
            if (storageKey) {
                Storage.set(storageKey + '_pos', {
                    left: parseInt(targetEl.style.left, 10) || 0,
                    top: parseInt(targetEl.style.top, 10) || 0
                });
            }
        });
        handleEl.style.cursor = 'move';
    }

    function makeResizable(targetEl, { minW = 320, minH = 200, maxW = 1200, maxH = 1000, storageKey } = {}) {
        if (storageKey) {
            const saved = Storage.get(storageKey + '_size', null);
            if (saved && saved.w && saved.h) {
                targetEl.style.width = Math.min(Math.max(saved.w, minW), maxW) + 'px';
                targetEl.style.height = Math.min(Math.max(saved.h, minH), maxH) + 'px';
            }
        }
        const grip = document.createElement('div');
        grip.className = 'resize-grip';
        Object.assign(grip.style, {
            position: 'absolute', right: '0', bottom: '0', width: '18px', height: '18px',
            cursor: 'nwse-resize', zIndex: '5',
            background: 'linear-gradient(135deg, transparent 45%, #a78bfa 45%, #a78bfa 52%, transparent 52%, transparent 62%, #a78bfa 62%, #a78bfa 69%, transparent 69%, transparent 79%, #a78bfa 79%, #a78bfa 86%, transparent 86%)',
            opacity: '0.4', transition: 'opacity 0.15s'
        });
        on(grip, 'mouseenter', () => { grip.style.opacity = '1'; });
        on(grip, 'mouseleave', () => { grip.style.opacity = '0.4'; });
        targetEl.appendChild(grip);

        let resizing = false, startX, startY, startW, startH;
        on(grip, 'mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resizing = true;
            startX = e.clientX; startY = e.clientY;
            const rect = targetEl.getBoundingClientRect();
            startW = rect.width; startH = rect.height;
        });
        on(document, 'mousemove', (e) => {
            if (!resizing) return;
            const newW = Math.min(Math.max(startW + (e.clientX - startX), minW), maxW);
            const newH = Math.min(Math.max(startH + (e.clientY - startY), minH), maxH);
            targetEl.style.width = newW + 'px';
            targetEl.style.height = newH + 'px';
            targetEl.style.maxHeight = 'none';
        });
        on(document, 'mouseup', () => {
            if (!resizing) return;
            resizing = false;
            if (storageKey) {
                const rect = targetEl.getBoundingClientRect();
                Storage.set(storageKey + '_size', { w: Math.round(rect.width), h: Math.round(rect.height) });
            }
        });
    }

    function createCloseButton(onClose) {
        const btn = document.createElement('button');
        btn.textContent = '\u2715';
        btn.title = 'Fechar';
        Object.assign(btn.style, {
            background: 'transparent', color: '#8a8a9a', border: 'none',
            cursor: 'pointer', fontSize: '14px', padding: '2px 6px',
            borderRadius: '4px', transition: 'all 0.15s', marginLeft: '4px'
        });
        on(btn, 'mouseenter', () => { btn.style.background = '#ef4444'; btn.style.color = '#fff'; });
        on(btn, 'mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = '#8a8a9a'; });
        on(btn, 'click', (e) => { e.stopPropagation(); onClose(); });
        return btn;
    }

    // ─── Toolbar ───
    const Toolbar = (function() {
        const el = document.createElement('div');
        el.id = 'hl-toolbar';
        Object.assign(el.style, {
            position: 'fixed', top: '0', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px',
            background: '#0a0a0f', border: '1px solid #1a1a2e', borderTop: 'none',
            borderRadius: '0 0 8px 8px', zIndex: '100000',
            fontFamily: 'monospace', fontSize: '12px', userSelect: 'none',
            backdropFilter: 'blur(8px)'
        });

        const btnBase = {
            background: '#13131a', color: '#e1e1e6', border: '1px solid #1a1a2e',
            cursor: 'pointer', padding: '5px 12px', fontSize: '11px',
            fontFamily: 'monospace', borderRadius: '6px', transition: 'all 0.15s ease',
            whiteSpace: 'nowrap', outline: 'none'
        };

        const btnAnalyzer = document.createElement('button');
        btnAnalyzer.textContent = '\uD83D\uDD0D Analyzer';
        btnAnalyzer.title = 'Atalho: Ctrl+Alt+A';
        Object.assign(btnAnalyzer.style, btnBase);

        const btnSender = document.createElement('button');
        btnSender.textContent = '\u26A1 Sender';
        btnSender.title = 'Atalho: Ctrl+Alt+S';
        Object.assign(btnSender.style, btnBase);

        const btnEye = document.createElement('button');
        btnEye.textContent = '\uD83D\uDC41\uFE0F';
        Object.assign(btnEye.style, btnBase, { padding: '5px 10px', fontSize: '13px' });
        btnEye.title = 'Mostrar/Ocultar tudo (Ctrl+Alt+Q)';

        let analyzerVisible = false;
        let senderVisible = false;

        function highlight(btn, on_) {
            if (on_) {
                btn.style.background = 'linear-gradient(135deg, #6c63ff, #a855f7)';
                btn.style.borderColor = 'transparent';
                btn.style.color = '#fff';
                btn.style.boxShadow = '0 0 10px rgba(108,99,255,0.35)';
            } else {
                btn.style.background = '#13131a';
                btn.style.borderColor = '#1a1a2e';
                btn.style.color = '#e1e1e6';
                btn.style.boxShadow = 'none';
            }
        }

        function updateButtons() {
            highlight(btnAnalyzer, analyzerVisible);
            highlight(btnSender, senderVisible);
        }

        function setAnalyzerVisible(show) {
            analyzerVisible = show;
            AnalyzerUI.setVisible(analyzerVisible);
            updateButtons();
        }
        function setSenderVisible(show) {
            senderVisible = show;
            SenderUI.setVisible(senderVisible);
            updateButtons();
        }
        function toggleAnalyzer() { setAnalyzerVisible(!analyzerVisible); }
        function toggleSender() { setSenderVisible(!senderVisible); }
        function toggleBoth() {
            const anyVisible = analyzerVisible || senderVisible;
            setAnalyzerVisible(!anyVisible);
            setSenderVisible(!anyVisible);
        }

        on(btnAnalyzer, 'click', toggleAnalyzer);
        on(btnSender, 'click', toggleSender);
        on(btnEye, 'click', toggleBoth);

        el.appendChild(btnAnalyzer);
        el.appendChild(btnSender);
        el.appendChild(btnEye);

        makeDraggable(el, el, 'toolbar');

        on(document, 'keydown', (e) => {
            if (!e.altKey || !e.ctrlKey) return;
            const tag = (e.target && e.target.tagName) || '';
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
            if (e.code === 'KeyA') { e.preventDefault(); toggleAnalyzer(); }
            else if (e.code === 'KeyS') { e.preventDefault(); toggleSender(); }
            else if (e.code === 'KeyQ') { e.preventDefault(); toggleBoth(); }
        });

        return { element: el, setAnalyzerVisible, setSenderVisible, toggleAnalyzer, toggleSender, toggleBoth };
    })();

    const SenderRef = { fill: null };

    // ═══════════════════════════════════════════════════════════════
    // ANALYZER UI — com tabs (Log | Filtros | IA)
    // ═══════════════════════════════════════════════════════════════
    const AnalyzerUI = (function() {
        const el = document.createElement('div');
        el.id = 'hl-analyzer';
        Object.assign(el.style, {
            position: 'fixed', top: '50px', left: '10px',
            width: '720px', height: '640px',
            maxHeight: 'calc(100vh - 70px)',
            background: '#0f0f16', color: '#e1e1e6',
            border: '1px solid #1e1e2e', zIndex: '99998',
            fontFamily: 'monospace', fontSize: '12px',
            borderRadius: '10px', display: 'none', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.06)'
        });

        el.innerHTML = `
            <!-- Header -->
            <div class="drag-header" style="
                background:linear-gradient(180deg, #12121c 0%, #0a0a12 100%);
                padding:11px 14px;cursor:move;
                border-bottom:1px solid #1e1e2e;border-radius:10px 10px 0 0;
                font-weight:bold;display:flex;justify-content:space-between;align-items:center;
                font-size:12px;color:#e1e1e6;user-select:none;letter-spacing:0.05em;
            ">
                <span style="display:flex;align-items:center;gap:10px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#00d4aa;
                        box-shadow:0 0 8px #00d4aa,0 0 16px rgba(0,212,170,0.5);"></span>
                    <span style="background:linear-gradient(90deg,#e1e1e6,#8a8a9a);
                        -webkit-background-clip:text;background-clip:text;color:transparent;">
                        SANG ANALYZER
                    </span>
                </span>
                <div id="analyzerHeaderBtns" style="display:flex;gap:5px;align-items:center;">
                    <button id="btnFontMinus" title="Diminuir fonte" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">A−</button>
                    <button id="btnFontPlus" title="Aumentar fonte" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">A+</button>
                </div>
            </div>

            <!-- Tabs -->
            <div id="analyzerTabs" style="display:flex;background:#0a0a12;border-bottom:1px solid #1e1e2e;padding:0 8px;gap:2px;">
                <button class="az-tab active" data-tab="log" style="
                    background:transparent;color:#e1e1e6;border:none;cursor:pointer;
                    padding:10px 16px;font-size:11px;font-family:monospace;
                    letter-spacing:0.05em;position:relative;transition:color 0.15s;
                    outline:none;
                ">📋 LOG</button>
                <button class="az-tab" data-tab="filtros" style="
                    background:transparent;color:#8a8a9a;border:none;cursor:pointer;
                    padding:10px 16px;font-size:11px;font-family:monospace;
                    letter-spacing:0.05em;position:relative;transition:color 0.15s;
                    outline:none;
                ">🛡️ FILTROS</button>
                <button class="az-tab" data-tab="ia" style="
                    background:transparent;color:#8a8a9a;border:none;cursor:pointer;
                    padding:10px 16px;font-size:11px;font-family:monospace;
                    letter-spacing:0.05em;position:relative;transition:color 0.15s;
                    outline:none;
                ">✨ SANG AI</button>
            </div>

            <!-- Pane: LOG -->
            <div id="paneLog" style="display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                <div style="padding:8px 12px;display:flex;gap:12px;align-items:center;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#00d4aa;font-weight:600;">
                        <input type="checkbox" id="chkSend" checked style="accent-color:#00d4aa;cursor:pointer;"> ENVIADOS
                    </label>
                    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#6c63ff;font-weight:600;">
                        <input type="checkbox" id="chkRecv" checked style="accent-color:#6c63ff;cursor:pointer;"> RECEBIDOS
                    </label>
                    <div style="flex:1;min-width:0;">
                        <input id="logSearch" type="text"
                            placeholder="🔍 Filtrar por ID, hex, texto…"
                            style="width:100%;background:#13131a;color:#e1e1e6;
                            border:1px solid #1e1e2e;padding:6px 10px;font-size:11px;
                            border-radius:6px;font-family:monospace;outline:none;box-sizing:border-box;">
                    </div>
                    <span id="logCounter" style="font-size:10px;color:#8a8a9a;white-space:nowrap;">0 logs</span>
                </div>

                <div style="padding:6px 12px;display:flex;gap:6px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <button id="btnPauseLogs" class="az-action" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;font-family:monospace;transition:all 0.15s;">⏸ PAUSAR</button>
                    <button id="btnCopyAll" class="az-action" style="flex:1;background:#13131a;color:#00d4aa;border:1px solid #1e1e2e;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;font-family:monospace;transition:all 0.15s;">📋 COPIAR</button>
                    <button id="btnClearLogs" class="az-action" style="flex:1;background:#13131a;color:#ef4444;border:1px solid #1e1e2e;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;font-family:monospace;transition:all 0.15s;">🗑 LIMPAR</button>
                    <button id="btnKillSwitch" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;transition:all 0.2s;white-space:nowrap;">⚠️ DROP ALL</button>
                </div>

                <div id="logArea" style="flex:1;overflow-y:auto;padding:10px;min-height:80px;"></div>
            </div>

            <!-- Pane: FILTROS -->
            <div id="paneFiltros" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;padding:14px;gap:14px;">
                <div style="display:flex;gap:14px;flex:1;min-height:0;">
                    <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#13131a;border:1px solid #1e1e2e;border-radius:8px;padding:12px;">
                        <div style="color:#6c63ff;font-weight:bold;margin-bottom:10px;font-size:11px;letter-spacing:0.05em;display:flex;align-items:center;gap:6px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:#6c63ff;"></span>
                            OCULTAR DO LOG
                        </div>
                        <div style="font-size:10px;color:#6a6a7a;margin-bottom:8px;line-height:1.5;">
                            Some da visualização — o pacote ainda trafega normalmente.
                        </div>
                        <div style="display:flex;gap:4px;margin-bottom:6px;">
                            <input id="vId" type="number" placeholder="ID" style="width:70px;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddVId" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div style="display:flex;gap:4px;margin-bottom:8px;">
                            <input id="vStr" type="text" placeholder="HEX ou texto no payload" style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;min-width:0;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddVStr" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div id="listV" style="flex:1;overflow-y:auto;margin-bottom:8px;font-size:10px;"></div>
                        <button id="btnClrV" style="width:100%;background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:5px;border-radius:5px;font-size:10px;transition:all 0.15s;">LIMPAR TUDO</button>
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#13131a;border:1px solid #1e1e2e;border-radius:8px;padding:12px;">
                        <div style="color:#ef4444;font-weight:bold;margin-bottom:10px;font-size:11px;letter-spacing:0.05em;display:flex;align-items:center;gap:6px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span>
                            BLOQUEAR ENVIO
                        </div>
                        <div style="font-size:10px;color:#6a6a7a;margin-bottom:8px;line-height:1.5;">
                            Impede o pacote de sair — o servidor nunca o recebe.
                        </div>
                        <div style="display:flex;gap:4px;margin-bottom:6px;">
                            <input id="dId" type="number" placeholder="ID" style="width:70px;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddDId" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div style="display:flex;gap:4px;margin-bottom:8px;">
                            <input id="dStr" type="text" placeholder="HEX ou texto no payload" style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;min-width:0;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddDStr" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div id="listD" style="flex:1;overflow-y:auto;margin-bottom:8px;font-size:10px;"></div>
                        <button id="btnClrD" style="width:100%;background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:5px;border-radius:5px;font-size:10px;transition:all 0.15s;">LIMPAR TUDO</button>
                    </div>
                </div>

                <!-- Linguagem natural -->
                <div style="background:linear-gradient(135deg, rgba(168,85,247,0.08), rgba(108,99,255,0.05));
                    border:1px solid rgba(168,85,247,0.25);border-radius:8px;padding:12px;">
                    <div style="color:#c4b5fd;font-weight:bold;font-size:11px;letter-spacing:0.05em;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                        ✨ CRIAR FILTRO COM LINGUAGEM NATURAL
                    </div>
                    <div style="display:flex;gap:6px;">
                        <input id="nlFiltro" type="text"
                            placeholder="Ex: esconde pacotes de movimento, bloqueia chat…"
                            style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid rgba(168,85,247,0.3);
                            padding:8px 10px;font-size:11px;border-radius:6px;outline:none;
                            font-family:monospace;box-sizing:border-box;min-width:0;">
                        <button id="btnNlFiltro" style="background:linear-gradient(135deg,#a855f7,#6c63ff);
                            color:#fff;border:none;cursor:pointer;padding:8px 16px;border-radius:6px;
                            font-weight:bold;font-size:11px;font-family:monospace;white-space:nowrap;">GERAR</button>
                    </div>
                    <div id="nlFiltroResultado" style="margin-top:8px;font-size:10.5px;color:#8a8a9a;line-height:1.5;"></div>
                </div>
            </div>

            <!-- Pane: IA -->
            <div id="paneIA" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                <div id="iaChat" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:0;"></div>
                <div style="padding:8px 12px;background:#0a0a12;border-top:1px solid #1e1e2e;display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="ia-quick" style="background:#13131a;color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">Últimos 10 pacotes</button>
                    <button class="ia-quick" style="background:#13131a;color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">Sugerir filtros</button>
                    <button class="ia-quick" style="background:#13131a;color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">Detectar anomalias</button>
                    <button class="ia-quick" style="background:#13131a;color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">O que é ID 4521?</button>
                </div>
                <div style="padding:10px 12px;background:#0a0a12;border-top:1px solid #1e1e2e;display:flex;gap:6px;align-items:flex-end;">
                    <textarea id="iaInput" rows="1"
                        placeholder="Pergunte algo ou descreva o que procura…"
                        style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;
                        padding:8px 10px;font-size:11.5px;border-radius:6px;outline:none;
                        font-family:monospace;resize:none;min-height:36px;max-height:100px;
                        box-sizing:border-box;line-height:1.4;"></textarea>
                    <button id="iaSend" style="background:linear-gradient(135deg,#a855f7,#6c63ff);
                        color:#fff;border:none;cursor:pointer;padding:8px 16px;border-radius:6px;
                        font-weight:bold;font-size:11px;font-family:monospace;white-space:nowrap;
                        transition:all 0.15s;">ENVIAR</button>
                </div>
            </div>
        `;

        makeDraggable(el.querySelector('.drag-header'), el, 'analyzer');
        makeResizable(el, { minW: 520, minH: 420, maxW: 1300, maxH: 1000, storageKey: 'analyzer' });

        const closeBtn = createCloseButton(() => Toolbar.setAnalyzerVisible(false));
        el.querySelector('#analyzerHeaderBtns').appendChild(closeBtn);

        // ─── Referências ───
        const logArea = el.querySelector('#logArea');
        logArea.style.fontSize = AppState.fontSize + 'px';
        const logCounter = el.querySelector('#logCounter');
        const searchInp = el.querySelector('#logSearch');
        const chkSend = el.querySelector('#chkSend');
        const chkRecv = el.querySelector('#chkRecv');

        // ─── Tabs ───
        const tabs = el.querySelectorAll('.az-tab');
        const panes = {
            log: el.querySelector('#paneLog'),
            filtros: el.querySelector('#paneFiltros'),
            ia: el.querySelector('#paneIA')
        };
        const tabUnderline = 'position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,#a855f7,#6c63ff);border-radius:2px;';

        function setActiveTab(name) {
            tabs.forEach(t => {
                const isActive = t.dataset.tab === name;
                t.classList.toggle('active', isActive);
                t.style.color = isActive ? '#e1e1e6' : '#8a8a9a';
                // Underline
                let underline = t.querySelector('.az-underline');
                if (isActive && !underline) {
                    underline = document.createElement('span');
                    underline.className = 'az-underline';
                    underline.style.cssText = tabUnderline;
                    t.appendChild(underline);
                } else if (!isActive && underline) {
                    underline.remove();
                }
            });
            Object.keys(panes).forEach(k => {
                panes[k].style.display = (k === name) ? (k === 'log' ? 'flex' : k === 'filtros' ? 'flex' : 'flex') : 'none';
            });
            if (name === 'ia') {
                panes.ia.style.flexDirection = 'column';
                if (!panes.ia.dataset.iniciado) {
                    panes.ia.dataset.iniciado = '1';
                    iaInit();
                }
            }
        }

        tabs.forEach(t => on(t, 'click', () => setActiveTab(t.dataset.tab)));
        // Marca underline inicial
        setTimeout(() => setActiveTab('log'), 0);

        // ─── Fonte ───
        on(el.querySelector('#btnFontPlus'), 'click', () => {
            AppState.fontSize = Math.min(24, AppState.fontSize + 1);
            logArea.style.fontSize = AppState.fontSize + 'px';
            Storage.set('font_size', AppState.fontSize);
        });
        on(el.querySelector('#btnFontMinus'), 'click', () => {
            AppState.fontSize = Math.max(9, AppState.fontSize - 1);
            logArea.style.fontSize = AppState.fontSize + 'px';
            Storage.set('font_size', AppState.fontSize);
        });

        // ─── Kill switch ───
        const btnKill = el.querySelector('#btnKillSwitch');
        on(btnKill, 'click', () => {
            AppState.killSwitchActive = !AppState.killSwitchActive;
            if (AppState.killSwitchActive) {
                btnKill.style.background = '#ef4444';
                btnKill.style.color = '#fff';
                btnKill.textContent = '🛑 DROP ATIVO';
            } else {
                btnKill.style.background = '#13131a';
                btnKill.style.color = '#ef4444';
                btnKill.textContent = '⚠️ DROP ALL';
            }
        });

        // ─── Pause ───
        const btnPause = el.querySelector('#btnPauseLogs');
        on(btnPause, 'click', () => {
            AppState.isPaused = !AppState.isPaused;
            if (AppState.isPaused) {
                btnPause.textContent = '▶ CONTINUAR';
                btnPause.style.color = '#00d4aa';
                btnPause.style.borderColor = '#00d4aa';
            } else {
                btnPause.textContent = '⏸ PAUSAR';
                btnPause.style.color = '#e1e1e6';
                btnPause.style.borderColor = '#1e1e2e';
            }
        });

        // ─── Clear / Copy ───
        on(el.querySelector('#btnClearLogs'), 'click', () => {
            logArea.innerHTML = '';
            AppState.logs = [];
            logCounter.textContent = '0 logs';
        });
        on(el.querySelector('#btnCopyAll'), 'click', () => {
            if (AppState.logs.length === 0) return;
            const allText = AppState.logs.map(l => l.rawText).join('\n\n-----------------\n\n');
            navigator.clipboard.writeText(allText);
        });

        // ─── Filtro de visibilidade ───
        function refreshVisibility() {
            const q = searchInp.value.toLowerCase();
            let visibleCount = 0;
            for (const item of AppState.logs) {
                let visible = true;
                if (item.dir === 'SEND' && !AppState.showSend) visible = false;
                if (item.dir === 'RECV' && !AppState.showRecv) visible = false;
                if (q && !item.searchString.includes(q)) visible = false;
                item.el.style.display = visible ? 'block' : 'none';
                if (visible) visibleCount++;
            }
            logCounter.textContent = visibleCount + ' de ' + AppState.logs.length;
        }
        on(chkSend, 'change', () => { AppState.showSend = chkSend.checked; refreshVisibility(); });
        on(chkRecv, 'change', () => { AppState.showRecv = chkRecv.checked; refreshVisibility(); });
        on(searchInp, 'input', refreshVisibility);

        // ─── Tags de filtro ───
        function createTag(type, act, rawVal, displayVal, cor) {
            const d = document.createElement('div');
            Object.assign(d.style, {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#0a0a12', border: '1px solid #1e1e2e',
                margin: '2px 0', padding: '3px 7px', fontSize: '10px',
                color: '#b8b8c8', borderRadius: '4px'
            });
            const span = document.createElement('span');
            span.textContent = displayVal;
            span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:85%;font-family:monospace;';
            d.appendChild(span);
            const btn = document.createElement('button');
            btn.textContent = '✕';
            btn.style.cssText = `color:${cor};background:none;border:none;cursor:pointer;font-weight:bold;padding:0 3px;`;
            on(btn, 'click', () => { PacketFilter.manageList(type, act, rawVal); renderFilters(); });
            d.appendChild(btn);
            return d;
        }

        function renderFilters() {
            const lv = el.querySelector('#listV'); lv.innerHTML = '';
            const ld = el.querySelector('#listD'); ld.innerHTML = '';
            AppState.blIds.forEach(id => lv.appendChild(createTag('VISUAL', 'REMOVE_ID', id, 'ID ' + id, '#6c63ff')));
            AppState.blPayloads.forEach(s => lv.appendChild(createTag('VISUAL', 'REMOVE_STR', s, 'HEX ' + s, '#6c63ff')));
            AppState.dropIds.forEach(id => ld.appendChild(createTag('DROP', 'REMOVE_ID', id, 'ID ' + id, '#ef4444')));
            AppState.dropPayloads.forEach(s => ld.appendChild(createTag('DROP', 'REMOVE_STR', s, 'HEX ' + s, '#ef4444')));

            if (!AppState.blIds.size && !AppState.blPayloads.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#5a5a6a;font-size:10px;text-align:center;padding:14px;font-style:italic;';
                empty.textContent = 'Nenhum filtro — tudo aparece no log.';
                lv.appendChild(empty);
            }
            if (!AppState.dropIds.size && !AppState.dropPayloads.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#5a5a6a;font-size:10px;text-align:center;padding:14px;font-style:italic;';
                empty.textContent = 'Nenhum bloqueio — todo envio passa.';
                ld.appendChild(empty);
            }
        }
        renderFilters();

        on(el.querySelector('#btnAddVId'), 'click', () => { PacketFilter.manageList('VISUAL', 'ADD_ID', el.querySelector('#vId').value); el.querySelector('#vId').value = ''; renderFilters(); });
        on(el.querySelector('#btnAddVStr'), 'click', () => { PacketFilter.manageList('VISUAL', 'ADD_STR', el.querySelector('#vStr').value); el.querySelector('#vStr').value = ''; renderFilters(); });
        on(el.querySelector('#btnClrV'), 'click', () => { PacketFilter.manageList('VISUAL', 'CLEAR'); renderFilters(); });
        on(el.querySelector('#btnAddDId'), 'click', () => { PacketFilter.manageList('DROP', 'ADD_ID', el.querySelector('#dId').value); el.querySelector('#dId').value = ''; renderFilters(); });
        on(el.querySelector('#btnAddDStr'), 'click', () => { PacketFilter.manageList('DROP', 'ADD_STR', el.querySelector('#dStr').value); el.querySelector('#dStr').value = ''; renderFilters(); });
        on(el.querySelector('#btnClrD'), 'click', () => { PacketFilter.manageList('DROP', 'CLEAR'); renderFilters(); });

        // ─── Filtro em linguagem natural ───
        const nlInput = el.querySelector('#nlFiltro');
        const nlBtn = el.querySelector('#btnNlFiltro');
        const nlResult = el.querySelector('#nlFiltroResultado');

        async function gerarFiltroNL() {
            const desc = nlInput.value.trim();
            if (!desc) return;
            if (!SangAI.disponivel()) {
                nlResult.innerHTML = '<span style="color:#ef4444;">⚠ Sang AI não configurada. Abra o módulo Sang AI e cole sua chave.</span>';
                return;
            }
            nlBtn.disabled = true;
            nlBtn.textContent = '⏳';
            nlResult.innerHTML = '<span style="color:#8a8a9a;">Consultando Sang AI…</span>';
            try {
                // Pega amostras recentes pra dar contexto
                const amostras = AppState.logs.slice(-20).map(l => ({
                    header: l.packet.header,
                    byteLength: l.packet.byteLength,
                    ascii: l.packet.ascii
                }));
                const resp = await SangAI.criarFiltroLinguagemNatural(desc, amostras);
                const limpo = resp.replace(/```json|```/g, '').trim();
                let dados;
                try { dados = JSON.parse(limpo); }
                catch (e) {
                    nlResult.innerHTML = `<span style="color:#ef4444;">Resposta inválida da IA: ${limpo.slice(0, 200)}</span>`;
                    return;
                }

                const ids = Array.isArray(dados.ids) ? dados.ids : [];
                const strings = Array.isArray(dados.strings) ? dados.strings : [];
                const motivo = dados.motivo || '';

                // Aplica em VISUAL por padrão
                ids.forEach(id => PacketFilter.manageList('VISUAL', 'ADD_ID', String(id)));
                strings.forEach(s => PacketFilter.manageList('VISUAL', 'ADD_STR', s));
                renderFilters();

                nlResult.innerHTML =
                    `<span style="color:#00d4aa;">✓ Aplicado em OCULTAR DO LOG</span>` +
                    (motivo ? `<br><span style="color:#8a8a9a;">${motivo}</span>` : '') +
                    (ids.length ? `<br><span style="color:#6c63ff;">IDs: ${ids.join(', ')}</span>` : '') +
                    (strings.length ? `<br><span style="color:#6c63ff;">Strings: ${strings.join(', ')}</span>` : '');
                nlInput.value = '';
            } catch (e) {
                nlResult.innerHTML = `<span style="color:#ef4444;">Erro: ${e.message || e}</span>`;
            } finally {
                nlBtn.disabled = false;
                nlBtn.textContent = 'GERAR';
            }
        }
        on(nlBtn, 'click', gerarFiltroNL);
        on(nlInput, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); gerarFiltroNL(); } });

        // ─── IA Chat ───
        const iaChat = el.querySelector('#iaChat');
        const iaInput = el.querySelector('#iaInput');
        const iaSendBtn = el.querySelector('#iaSend');
        let iaPronto = false;

        function iaInit() {
            if (iaPronto) return;
            iaPronto = true;
            iaAdd('ia',
                'Oi! Sou a **Sang AI** aqui no Analyzer. Posso:\n\n' +
                '• Explicar pacotes individuais (clica no 🧠 de qualquer pacote)\n' +
                '• Analisar os últimos N pacotes de uma vez\n' +
                '• Sugerir filtros com base no tráfego\n' +
                '• Responder perguntas sobre IDs específicos\n\n' +
                'Pergunta à vontade.'
            );
            if (!SangAI.disponivel()) {
                iaAdd('erro', 'Sang AI não configurada. Abra o módulo Sang AI e cole sua chave da Groq.');
            }
        }

        function iaAdd(tipo, texto) {
            const el_ = document.createElement('div');
            el_.style.cssText = 'max-width:88%;padding:10px 14px;border-radius:12px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;animation:iaMsgIn 0.28s cubic-bezier(0.34,1.56,0.64,1);';
            if (tipo === 'user') {
                el_.style.background = 'linear-gradient(135deg,#6c63ff,#a855f7)';
                el_.style.color = '#fff';
                el_.style.alignSelf = 'flex-end';
                el_.style.borderBottomRightRadius = '4px';
            } else if (tipo === 'ia') {
                el_.style.background = 'rgba(168,85,247,0.08)';
                el_.style.border = '1px solid rgba(168,85,247,0.2)';
                el_.style.color = '#e9d5ff';
                el_.style.alignSelf = 'flex-start';
                el_.style.borderBottomLeftRadius = '4px';
            } else if (tipo === 'erro') {
                el_.style.background = 'rgba(239,68,68,0.08)';
                el_.style.border = '1px solid rgba(239,68,68,0.25)';
                el_.style.color = '#fca5a5';
                el_.style.alignSelf = 'center';
                el_.style.fontSize = '11px';
            } else if (tipo === 'sys') {
                el_.style.background = 'rgba(255,255,255,0.03)';
                el_.style.color = '#8a7aa8';
                el_.style.alignSelf = 'center';
                el_.style.fontSize = '10.5px';
                el_.style.fontStyle = 'italic';
                el_.style.padding = '6px 12px';
                el_.style.borderRadius = '20px';
            }
            // Markdown simples pra negrito
            el_.innerHTML = texto
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code style="background:rgba(168,85,247,0.15);padding:1px 5px;border-radius:4px;font-size:11px;color:#e9d5ff;">$1</code>');
            iaChat.appendChild(el_);
            iaChat.scrollTop = iaChat.scrollHeight;
            return el_;
        }

        function iaAddLoading() {
            const el_ = document.createElement('div');
            el_.style.cssText = 'align-self:flex-start;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:12px;border-bottom-left-radius:4px;padding:12px 16px;display:flex;gap:5px;animation:iaMsgIn 0.28s;';
            el_.innerHTML = '<span class="ia-dot"></span><span class="ia-dot"></span><span class="ia-dot"></span>';
            iaChat.appendChild(el_);
            iaChat.scrollTop = iaChat.scrollHeight;
            return el_;
        }

        async function iaEnviar(texto) {
            if (!texto.trim()) return;
            if (!SangAI.disponivel()) {
                iaAdd('erro', 'Sang AI não configurada.');
                return;
            }
            iaAdd('user', texto);
            iaInput.value = '';
            iaInput.style.height = 'auto';
            iaSendBtn.disabled = true;
            const load = iaAddLoading();
            try {
                const amostras = AppState.logs.slice(-15).map(l => ({
                    dir: l.dir,
                    header: l.packet.header,
                    byteLength: l.packet.byteLength,
                    fullHex: l.packet.fullHex
                }));
                const resp = await SangAI.chatLivre(texto, amostras);
                load.remove();
                iaAdd('ia', resp);
            } catch (e) {
                load.remove();
                iaAdd('erro', 'Erro: ' + (e.message || e));
            } finally {
                iaSendBtn.disabled = false;
                iaInput.focus();
            }
        }

        on(iaSendBtn, 'click', () => iaEnviar(iaInput.value));
        on(iaInput, 'keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); iaEnviar(iaInput.value); }
        });
        on(iaInput, 'input', () => {
            iaInput.style.height = 'auto';
            iaInput.style.height = Math.min(100, iaInput.scrollHeight) + 'px';
        });

        // ─── Quick actions da IA ───
        el.querySelectorAll('.ia-quick').forEach(btn => {
            on(btn, 'click', async () => {
                const txt = btn.textContent.trim();
                if (txt === 'Últimos 10 pacotes') {
                    if (AppState.logs.length === 0) { iaAdd('sys', 'Nenhum pacote capturado ainda.'); return; }
                    const pack = AppState.logs.slice(-10).map(l => ({
                        dir: l.dir, header: l.packet.header, byteLength: l.packet.byteLength, fullHex: l.packet.fullHex
                    }));
                    iaAdd('user', 'Analisa os últimos 10 pacotes.');
                    iaSendBtn.disabled = true;
                    const load = iaAddLoading();
                    try {
                        const resp = await SangAI.analisarSequencia(pack);
                        load.remove();
                        iaAdd('ia', resp);
                    } catch (e) {
                        load.remove();
                        iaAdd('erro', 'Erro: ' + (e.message || e));
                    } finally {
                        iaSendBtn.disabled = false;
                    }
                } else if (txt === 'Sugerir filtros') {
                    iaEnviar('Olhando os últimos pacotes, sugere 2-3 filtros úteis pra reduzir ruído no log. Formato: lista curta com o motivo.');
                } else if (txt === 'Detectar anomalias') {
                    iaEnviar('Olhando os últimos pacotes, tem algo anormal? Pacotes com tamanho incomum, IDs raros, ou sequências estranhas.');
                } else if (txt === 'O que é ID 4521?') {
                    iaEnviar('O que costuma ser o ID 4521 no protocolo Habbo?');
                }
            });
        });

        // ─── Botões nos pacotes ───
        function createSendButton(packet) {
            const btn = document.createElement('button');
            btn.textContent = '↗';
            btn.title = 'Enviar ID e HEX para o Sender';
            Object.assign(btn.style, {
                background: '#6c63ff', color: '#fff', border: 'none',
                cursor: 'pointer', padding: '2px 8px', marginLeft: '4px',
                fontSize: '11px', fontWeight: 'bold', borderRadius: '4px',
                transition: 'background 0.15s'
            });
            on(btn, 'mouseenter', () => { btn.style.background = '#7d74ff'; });
            on(btn, 'mouseleave', () => { btn.style.background = '#6c63ff'; });
            on(btn, 'click', (e) => {
                e.stopPropagation();
                if (SenderRef.fill) SenderRef.fill(packet.header, packet.payloadHex);
            });
            return btn;
        }

        function createAnalyzeButton(packet, container) {
            if (!SangAI.disponivel()) return null;
            const btn = document.createElement('button');
            btn.textContent = '🧠';
            btn.title = 'Explicar com Sang AI';
            Object.assign(btn.style, {
                background: 'linear-gradient(135deg,#a855f7,#6c63ff)', color: '#fff', border: 'none',
                cursor: 'pointer', padding: '2px 8px', marginLeft: '4px',
                fontSize: '11px', fontWeight: 'bold', borderRadius: '4px',
                transition: 'background 0.15s'
            });
            on(btn, 'click', async (e) => {
                e.stopPropagation();
                btn.textContent = '⏳';
                btn.disabled = true;
                try {
                    const analise = await SangAI.analisarPacote(packet);
                    const old = container.querySelector('.ai-info');
                    if (old) old.remove();
                    if (!analise) return;
                    const div = document.createElement('div');
                    div.className = 'ai-info';
                    div.style.cssText =
                        'margin-top:8px;padding:9px 12px;background:rgba(168,85,247,0.08);' +
                        'border-left:3px solid #a855f7;border-radius:0 6px 6px 0;' +
                        'color:#e9d5ff;font-size:0.9em;line-height:1.55;white-space:pre-wrap;';
                    div.textContent = analise;
                    container.appendChild(div);
                } catch (err) {
                    // Silencioso — o log já mostra erro de rede
                } finally {
                    btn.textContent = '🧠';
                    btn.disabled = false;
                }
            });
            return btn;
        }

        const MAX_DISPLAY_BYTES = 100;
        function makeExpandableHex(fullHex, byteLength) {
            if (byteLength <= 10000 || fullHex.length <= MAX_DISPLAY_BYTES * 3) {
                const hexDiv = document.createElement('div');
                hexDiv.style.cssText = 'word-break:break-all;color:#b0b0c0;letter-spacing:0.06em;line-height:1.5;font-size:0.95em;';
                hexDiv.textContent = fullHex;
                return hexDiv;
            }
            const truncated = fullHex.substring(0, MAX_DISPLAY_BYTES * 3);
            const hexDiv = document.createElement('div');
            hexDiv.style.cssText = 'word-break:break-all;color:#b0b0c0;letter-spacing:0.06em;line-height:1.5;font-size:0.95em;';
            hexDiv.textContent = truncated;

            const expandBtn = document.createElement('button');
            expandBtn.textContent = `Mostrar tudo (${byteLength} bytes)`;
            Object.assign(expandBtn.style, {
                background: '#1e1e2e', color: '#6c63ff', border: '1px solid #6c63ff',
                cursor: 'pointer', padding: '2px 8px', fontSize: '10px',
                borderRadius: '4px', fontFamily: 'monospace', marginTop: '4px'
            });
            on(expandBtn, 'click', () => {
                hexDiv.textContent = fullHex;
                expandBtn.remove();
            });

            const container = document.createElement('div');
            container.appendChild(hexDiv);
            container.appendChild(expandBtn);
            return container;
        }

        // ─── Registrar pacote no dicionário ───
        function atualizarDicionario(packet) {
            const id = packet.header;
            const d = AppState.dicionario[id];
            if (!d) {
                AppState.dicionario[id] = {
                    count: 1,
                    primeiro: Date.now(),
                    ultimo: Date.now(),
                    tamanhoMedio: packet.byteLength,
                    sample: packet.fullHex.slice(0, 200)
                };
            } else {
                d.count++;
                d.ultimo = Date.now();
                d.tamanhoMedio = Math.round((d.tamanhoMedio * (d.count - 1) + packet.byteLength) / d.count);
            }
            // Persiste a cada 50 pacotes pra não sobrecarregar
            if (AppState.globalPacketCount % 50 === 0) {
                Storage.set('dicionario', AppState.dicionario);
            }
        }

        // ─── Adicionar log ───
        function addLog(packet, dir, isDropped) {
            AppState.globalPacketCount++;
            const id = AppState.globalPacketCount;
            const time = new Date().toLocaleTimeString();

            atualizarDicionario(packet);

            let borderColor, idColor, dirLabel;
            if (isDropped) {
                borderColor = '#ef4444'; idColor = '#ef4444'; dirLabel = '❌ DROP';
            } else if (dir === 'SEND') {
                borderColor = '#00d4aa'; idColor = '#00d4aa'; dirLabel = '➡ SEND';
            } else {
                borderColor = '#6c63ff'; idColor = '#6c63ff'; dirLabel = '⬅ RECV';
            }

            const rawText = `${time} | Pacote #${id}\n${dirLabel} ID: ${packet.header} | ${packet.byteLength} bytes\n${packet.fullHex}\n${packet.ascii}`;

            const item = document.createElement('div');
            item.style.cssText =
                `border-left:3px solid ${borderColor};` +
                'background:#13131a;border-radius:0 6px 6px 0;' +
                'margin-bottom:8px;padding:9px 11px;' +
                'animation:iaMsgIn 0.22s ease-out;';

            // Topo
            const top = document.createElement('div');
            top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;';

            const left = document.createElement('div');
            left.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.85em;color:#8a8a9a;flex-wrap:wrap;';

            const numBadge = document.createElement('span');
            numBadge.textContent = '#' + id;
            numBadge.style.cssText = 'background:#1e1e2e;color:#8a8a9a;padding:1px 6px;border-radius:4px;font-size:0.9em;';
            left.appendChild(numBadge);

            const timeSpan = document.createElement('span');
            timeSpan.textContent = time;
            left.appendChild(timeSpan);

            if (isDropped) {
                const dropBadge = document.createElement('span');
                dropBadge.textContent = 'DROPPED';
                dropBadge.style.cssText = 'background:rgba(239,68,68,0.15);color:#ef4444;padding:1px 6px;border-radius:4px;font-weight:bold;font-size:0.9em;';
                left.appendChild(dropBadge);
            }

            top.appendChild(left);

            const right = document.createElement('div');
            right.style.cssText = 'display:flex;gap:4px;align-items:center;';

            if (dir === 'SEND' && !isDropped) right.appendChild(createSendButton(packet));

            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋';
            copyBtn.title = 'Copiar pacote';
            Object.assign(copyBtn.style, {
                background: '#1e1e2e', color: '#8a8a9a', border: '1px solid #1e1e2e',
                cursor: 'pointer', fontSize: '11px', padding: '2px 8px',
                borderRadius: '4px', fontFamily: 'monospace', transition: 'all 0.15s'
            });
            on(copyBtn, 'mouseenter', () => { copyBtn.style.background = '#2a2a3e'; copyBtn.style.color = '#e1e1e6'; });
            on(copyBtn, 'mouseleave', () => { copyBtn.style.background = '#1e1e2e'; copyBtn.style.color = '#8a8a9a'; });
            on(copyBtn, 'click', () => { navigator.clipboard.writeText(rawText); });
            right.appendChild(copyBtn);

            top.appendChild(right);
            item.appendChild(top);

            // ID + tamanho + analyze
            const idWrap = document.createElement('div');
            idWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;';

            const idLine = document.createElement('div');
            idLine.style.cssText = `color:${idColor};font-weight:bold;font-size:0.95em;`;
            idLine.textContent = `${dirLabel} · ID ${packet.header} · ${packet.byteLength} bytes`;
            idWrap.appendChild(idLine);

            const analyzeBtn = createAnalyzeButton(packet, item);
            if (analyzeBtn) idWrap.appendChild(analyzeBtn);

            item.appendChild(idWrap);

            // Hex
            const hexWrap = document.createElement('div');
            hexWrap.style.cssText = 'margin-bottom:4px;';
            hexWrap.appendChild(makeExpandableHex(packet.fullHex, packet.byteLength));
            item.appendChild(hexWrap);

            // ASCII
            const asciiDiv = document.createElement('div');
            asciiDiv.style.cssText = 'color:#6a6a7a;font-size:0.9em;font-style:italic;';
            asciiDiv.textContent = packet.ascii || '(binário)';
            item.appendChild(asciiDiv);

            // Visibilidade
            const searchString = `${packet.header} ${packet.fullHex} ${packet.ascii}`.toLowerCase();
            const q = searchInp.value.toLowerCase();
            let visible = true;
            if (dir === 'SEND' && !AppState.showSend) visible = false;
            if (dir === 'RECV' && !AppState.showRecv) visible = false;
            if (q && !searchString.includes(q)) visible = false;
            if (!visible) item.style.display = 'none';

            logArea.appendChild(item);
            AppState.logs.push({ el: item, dir, searchString, rawText, packet });

            while (AppState.logs.length > AppState.maxLogs) {
                const old = AppState.logs.shift();
                if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
            }

            const isScrolledToBottom = logArea.scrollHeight - logArea.clientHeight <= logArea.scrollTop + 40;
            if (isScrolledToBottom) logArea.scrollTop = logArea.scrollHeight;

            logCounter.textContent = AppState.logs.length + ' logs';
        }

        function setVisible(show) {
            el.style.display = show ? 'flex' : 'none';
            if (show) {
                const rect = el.getBoundingClientRect();
                const clamped = clampToViewport(el, rect.left, rect.top);
                el.style.left = clamped.x + 'px';
                el.style.top = clamped.y + 'px';
            }
        }

        return { element: el, setVisible, addLog };
    })();

    // ═══════════════════════════════════════════════════════════════
    // SENDER UI — com geração de JS por linguagem natural
    // ═══════════════════════════════════════════════════════════════
    const SenderUI = (function() {
        const el = document.createElement('div');
        el.id = 'hl-sender';
        Object.assign(el.style, {
            position: 'fixed', top: '50px', right: '10px',
            width: '440px', background: '#0f0f16', color: '#e1e1e6',
            border: '1px solid #1e1e2e', zIndex: '99999',
            fontFamily: 'monospace', fontSize: '12px',
            borderRadius: '10px', display: 'none', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.06)'
        });

        el.innerHTML = `
            <div class="drag-header" style="
                background:linear-gradient(180deg, #12121c 0%, #0a0a12 100%);
                padding:11px 14px;cursor:move;
                border-bottom:1px solid #1e1e2e;border-radius:10px 10px 0 0;
                font-weight:bold;font-size:12px;color:#e1e1e6;user-select:none;
                display:flex;justify-content:space-between;align-items:center;
                letter-spacing:0.05em;
            ">
                <span style="display:flex;align-items:center;gap:10px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#6c63ff;
                        box-shadow:0 0 8px #6c63ff,0 0 16px rgba(108,99,255,0.5);"></span>
                    <span style="background:linear-gradient(90deg,#e1e1e6,#8a8a9a);
                        -webkit-background-clip:text;background-clip:text;color:transparent;">
                        SANG SENDER
                    </span>
                </span>
                <div id="senderHeaderBtns"></div>
            </div>
            <div id="sndBody" style="display:flex;flex-direction:column;flex:1;overflow-y:auto;min-height:0;">

                <!-- Perfil -->
                <div style="padding:10px 12px;display:flex;gap:6px;border-bottom:1px solid #1e1e2e;background:#0a0a12;">
                    <select id="selProfile" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;cursor:pointer;"></select>
                    <button id="btnNewProf" title="Novo perfil" style="background:#1e1e2e;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:7px 12px;border-radius:6px;font-size:11px;font-family:monospace;">+ NOVO</button>
                </div>

                <!-- Adicionar pacote -->
                <div style="padding:10px 12px;background:#0a0a12;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #1e1e2e;">
                    <div style="display:flex;gap:6px;">
                        <input id="sndId" type="number" placeholder="ID" style="width:70px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;box-sizing:border-box;">
                        <input id="sndHex" type="text" placeholder="Payload em HEX" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnAddSnd" style="background:#00d4aa;color:#0a0a0f;border:none;cursor:pointer;padding:7px 14px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;">ADD</button>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <input id="sndWaitMs" type="number" placeholder="Pausar (ms)" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnAddWait" title="Adicionar pausa na fila" style="background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:7px 12px;border-radius:6px;font-size:11px;font-family:monospace;">+ WAIT</button>
                        <button id="btnAddJs" title="Executar JS no meio da fila" style="background:#13131a;color:#00d4aa;border:1px solid #00d4aa;cursor:pointer;padding:7px 12px;border-radius:6px;font-size:11px;font-family:monospace;">+ JS</button>
                    </div>
                    <!-- Gerar JS por linguagem natural -->
                    <div style="display:flex;gap:6px;padding-top:6px;border-top:1px dashed rgba(168,85,247,0.2);">
                        <input id="nlJs" type="text" placeholder="✨ Descreva a ação — ex: dançar 3x com pausa 500ms"
                            style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid rgba(168,85,247,0.3);padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnNlJs" style="background:linear-gradient(135deg,#a855f7,#6c63ff);color:#fff;border:none;cursor:pointer;padding:7px 14px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;white-space:nowrap;">GERAR</button>
                    </div>
                </div>

                <!-- Fila -->
                <div style="padding:10px 12px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <div style="font-size:10px;color:#8a8a9a;margin-bottom:6px;letter-spacing:0.05em;">FILA DE ENVIO</div>
                    <div id="sndList" style="max-height:220px;overflow-y:auto;border:1px solid #1e1e2e;padding:4px;min-height:70px;background:#13131a;border-radius:6px;"></div>
                </div>

                <!-- Simular recebimento -->
                <div style="padding:10px 12px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <div style="color:#6c63ff;font-weight:bold;text-align:center;font-size:11px;margin-bottom:6px;letter-spacing:0.04em;">📥 SIMULAR RECEBIMENTO</div>
                    <div style="display:flex;gap:6px;">
                        <input id="fakeId" type="number" placeholder="ID" style="width:70px;background:#13131a;color:#6c63ff;border:1px solid #6c63ff;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;box-sizing:border-box;">
                        <input id="fakeHex" type="text" placeholder="Payload em HEX" style="flex:1;background:#13131a;color:#6c63ff;border:1px solid #6c63ff;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnFakeRecv" style="background:#6c63ff;color:#fff;border:none;cursor:pointer;padding:7px 12px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;">SIM</button>
                    </div>
                </div>

                <!-- Config + Start -->
                <div style="padding:10px 12px;background:#0a0a12;display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;gap:8px;align-items:center;">
                        <label style="flex:1;font-size:11px;color:#8a8a9a;">Delay loop (ms)
                            <input id="sndDelay" type="number" style="width:70px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:6px;box-sizing:border-box;">
                        </label>
                        <label style="flex:1;font-size:11px;color:#8a8a9a;">Qtd (0 = ∞)
                            <input id="sndQtd" type="number" style="width:50px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:6px;box-sizing:border-box;">
                        </label>
                    </div>
                    <button id="btnSpamAction" style="
                        background:linear-gradient(135deg,#00d4aa,#00a88a);color:#0a0a0f;border:none;cursor:pointer;
                        padding:12px;font-weight:bold;width:100%;
                        border-radius:8px;font-size:13px;font-family:monospace;transition:all 0.15s;
                        letter-spacing:0.05em;
                    ">🚀 INICIAR SEQUÊNCIA</button>
                </div>
            </div>
        `;

        makeDraggable(el.querySelector('.drag-header'), el, 'sender');
        makeResizable(el, { minW: 380, minH: 420, maxW: 800, maxH: 1000, storageKey: 'sender' });

        const closeBtn = createCloseButton(() => Toolbar.setSenderVisible(false));
        el.querySelector('#senderHeaderBtns').appendChild(closeBtn);

        let isSpamming = false;
        let spamRunId = 0;
        const sleep = ms => new Promise(res => setTimeout(res, ms));

        function saveCurrentProfile() {
            Storage.set('profiles', AppState.profiles);
            Storage.set('current_profile', AppState.currentProfileId);
        }

        function renderProfiles() {
            const sel = el.querySelector('#selProfile');
            sel.innerHTML = '';
            for (const pid in AppState.profiles) {
                const opt = document.createElement('option');
                opt.value = pid;
                opt.textContent = AppState.profiles[pid].name;
                if (pid === AppState.currentProfileId) opt.selected = true;
                sel.appendChild(opt);
            }
        }

        function renderPackets() {
            const prof = AppState.profiles[AppState.currentProfileId];
            const list = el.querySelector('#sndList');
            list.innerHTML = '';
            if (prof.packets.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#5a5a6a;font-size:11px;text-align:center;padding:16px;font-style:italic;';
                empty.textContent = 'Fila vazia — adicione pacotes acima.';
                list.appendChild(empty);
                return;
            }
            prof.packets.forEach((pkt, index) => {
                const item = document.createElement('div');
                Object.assign(item.style, {
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#0a0a12', padding: '5px 7px', marginBottom: '3px',
                    border: '1px solid #1e1e2e', borderRadius: '5px', fontSize: '11px'
                });

                const icon = document.createElement('span');
                icon.style.cssText = 'width:22px;text-align:center;flex-shrink:0;font-weight:bold;';
                const content = document.createElement('span');
                content.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

                if (pkt.isDelay) {
                    icon.textContent = '⏱';
                    icon.style.color = '#8a8a9a';
                    content.style.color = '#8a8a9a';
                    content.style.fontStyle = 'italic';
                    content.textContent = `Aguardar ${pkt.ms}ms`;
                } else if (pkt.isJs) {
                    icon.textContent = '🧠';
                    icon.style.color = '#00d4aa';
                    content.style.color = '#00d4aa';
                    content.style.fontStyle = 'italic';
                    const preview = pkt.code.length > 45 ? pkt.code.substring(0, 45) + '…' : pkt.code;
                    content.textContent = `JS: ${preview}`;
                } else {
                    icon.textContent = pkt.id;
                    icon.style.color = '#e1e1e6';
                    content.style.color = '#8a8a9a';
                    content.textContent = pkt.hex || '(vazio)';
                }
                item.appendChild(icon);
                item.appendChild(content);

                const btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:2px;flex-shrink:0;';

                const mkBtn = (txt, title, cor) => {
                    const b = document.createElement('button');
                    b.textContent = txt;
                    b.title = title;
                    b.style.cssText = `background:#1e1e2e;color:${cor};border:none;cursor:pointer;padding:3px 7px;border-radius:4px;font-size:10px;`;
                    return b;
                };

                const btnUp = mkBtn('↑', 'Mover para cima', '#e1e1e6');
                on(btnUp, 'click', () => {
                    if (index > 0) {
                        [prof.packets[index - 1], prof.packets[index]] = [prof.packets[index], prof.packets[index - 1]];
                        saveCurrentProfile(); renderPackets();
                    }
                });

                const btnDown = mkBtn('↓', 'Mover para baixo', '#e1e1e6');
                on(btnDown, 'click', () => {
                    if (index < prof.packets.length - 1) {
                        [prof.packets[index + 1], prof.packets[index]] = [prof.packets[index], prof.packets[index + 1]];
                        saveCurrentProfile(); renderPackets();
                    }
                });

                const btnDel = mkBtn('✕', 'Remover', '#ef4444');
                btnDel.style.border = '1px solid #ef4444';
                on(btnDel, 'click', () => {
                    prof.packets.splice(index, 1);
                    saveCurrentProfile(); renderPackets();
                });

                btns.appendChild(btnUp);
                btns.appendChild(btnDown);
                btns.appendChild(btnDel);
                item.appendChild(btns);

                list.appendChild(item);
            });
            el.querySelector('#sndDelay').value = prof.spamInterval;
            el.querySelector('#sndQtd').value = prof.spamQtd;
        }

        on(el.querySelector('#btnAddSnd'), 'click', () => {
            const idVal = el.querySelector('#sndId').value;
            const hexVal = el.querySelector('#sndHex').value || '';
            if (idVal !== '' && !isNaN(Number(idVal))) {
                AppState.profiles[AppState.currentProfileId].packets.push({ id: Number(idVal), hex: hexVal });
                el.querySelector('#sndId').value = '';
                el.querySelector('#sndHex').value = '';
                saveCurrentProfile(); renderPackets();
            }
        });

        on(el.querySelector('#btnAddWait'), 'click', () => {
            const ms = parseInt(el.querySelector('#sndWaitMs').value);
            if (!isNaN(ms) && ms > 0) {
                AppState.profiles[AppState.currentProfileId].packets.push({ isDelay: true, ms });
                el.querySelector('#sndWaitMs').value = '';
                saveCurrentProfile(); renderPackets();
            }
        });

        on(el.querySelector('#btnAddJs'), 'click', () => {
            const jsCode = prompt('Insira o código JavaScript a ser executado na fila:');
            if (jsCode && jsCode.trim() !== '') {
                AppState.profiles[AppState.currentProfileId].packets.push({ isJs: true, code: jsCode.trim() });
                saveCurrentProfile(); renderPackets();
            }
        });

        // ─── Gerar JS via IA ───
        const nlJs = el.querySelector('#nlJs');
        const btnNlJs = el.querySelector('#btnNlJs');

        async function gerarJsNL() {
            const desc = nlJs.value.trim();
            if (!desc) return;
            if (!SangAI.disponivel()) {
                alert('Sang AI não configurada. Abra o módulo Sang AI e cole sua chave.');
                return;
            }
            btnNlJs.disabled = true;
            btnNlJs.textContent = '⏳';
            try {
                const ctx = `Perfil atual "${AppState.profiles[AppState.currentProfileId].name}" com ${AppState.profiles[AppState.currentProfileId].packets.length} itens na fila.`;
                const codigo = await SangAI.gerarJs(desc, ctx);
                const limpo = codigo.replace(/```js|```javascript|```/g, '').trim();
                if (!limpo) {
                    alert('A IA não retornou código.');
                    return;
                }
                const confirma = confirm(`Código gerado:\n\n${limpo}\n\nAdicionar à fila?`);
                if (confirma) {
                    AppState.profiles[AppState.currentProfileId].packets.push({ isJs: true, code: limpo });
                    saveCurrentProfile(); renderPackets();
                    nlJs.value = '';
                }
            } catch (e) {
                alert('Erro: ' + (e.message || e));
            } finally {
                btnNlJs.disabled = false;
                btnNlJs.textContent = 'GERAR';
            }
        }
        on(btnNlJs, 'click', gerarJsNL);
        on(nlJs, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); gerarJsNL(); } });

        on(el.querySelector('#btnFakeRecv'), 'click', () => {
            if (!window.gameWS) return;
            const idVal = el.querySelector('#fakeId').value;
            const hexVal = el.querySelector('#fakeHex').value || '';
            if (idVal !== '' && !isNaN(Number(idVal))) {
                const buffer = Utils.buildPacket(Number(idVal), hexVal);
                window.gameWS.dispatchEvent(new MessageEvent('message', { data: buffer }));
                el.querySelector('#fakeId').value = '';
                el.querySelector('#fakeHex').value = '';
            }
        });

        on(el.querySelector('#btnNewProf'), 'click', () => {
            const name = prompt('Nome do novo perfil:');
            if (name && name.trim()) {
                const id = 'prof_' + Date.now();
                AppState.profiles[id] = { name: name.trim(), packets: [], spamInterval: 300, spamQtd: 1 };
                AppState.currentProfileId = id;
                saveCurrentProfile(); renderProfiles(); renderPackets();
            }
        });

        on(el.querySelector('#selProfile'), 'change', (e) => {
            AppState.currentProfileId = e.target.value;
            saveCurrentProfile(); renderPackets();
        });
        on(el.querySelector('#sndDelay'), 'change', (e) => {
            AppState.profiles[AppState.currentProfileId].spamInterval = Number(e.target.value) || 300;
            saveCurrentProfile();
        });
        on(el.querySelector('#sndQtd'), 'change', (e) => {
            AppState.profiles[AppState.currentProfileId].spamQtd = Number(e.target.value) || 0;
            saveCurrentProfile();
        });

        // ─── Motor de spam ───
        on(el.querySelector('#btnSpamAction'), 'click', async function() {
            if (!window.gameWS) return;
            const btn = el.querySelector('#btnSpamAction');
            const prof = AppState.profiles[AppState.currentProfileId];

            if (isSpamming) {
                isSpamming = false;
                spamRunId++;
                btn.textContent = '🚀 INICIAR SEQUÊNCIA';
                btn.style.background = 'linear-gradient(135deg,#00d4aa,#00a88a)';
                btn.style.color = '#0a0a0f';
                return;
            }
            if (prof.packets.length === 0) return;

            isSpamming = true;
            const myRunId = ++spamRunId;
            btn.textContent = '⏹ PARAR SEQUÊNCIA';
            btn.style.background = 'linear-gradient(135deg,#ef4444,#b91c1c)';
            btn.style.color = '#fff';

            let loops = 0;
            const inf = (prof.spamQtd === 0);

            while (isSpamming && myRunId === spamRunId && (inf || loops < prof.spamQtd)) {
                for (const item of prof.packets) {
                    if (!isSpamming || myRunId !== spamRunId) break;
                    if (item.isDelay) {
                        await sleep(item.ms);
                    } else if (item.isJs) {
                        try { eval(item.code); } catch (e) { console.error('[JS_ACTION] Erro:', e); }
                    } else {
                        if (!window.gameWS) break;
                        const buffer = Utils.buildPacket(item.id, item.hex);
                        window.gameWS.send(buffer);
                    }
                }
                loops++;
                if (isSpamming && myRunId === spamRunId && (inf || loops < prof.spamQtd)) {
                    await sleep(prof.spamInterval);
                }
            }

            if (myRunId === spamRunId) {
                isSpamming = false;
                btn.textContent = '🚀 INICIAR SEQUÊNCIA';
                btn.style.background = 'linear-gradient(135deg,#00d4aa,#00a88a)';
                btn.style.color = '#0a0a0f';
            }
        });

        function setVisible(show) {
            el.style.display = show ? 'flex' : 'none';
            if (show) {
                const rect = el.getBoundingClientRect();
                const clamped = clampToViewport(el, rect.left, rect.top);
                el.style.left = clamped.x + 'px';
                el.style.top = clamped.y + 'px';
            }
        }

        function fillFields(headerId, hexPayload) {
            el.querySelector('#sndId').value = headerId;
            el.querySelector('#sndHex').value = hexPayload;
            const addBtn = el.querySelector('#btnAddSnd');
            addBtn.style.background = '#fff';
            setTimeout(() => { addBtn.style.background = '#00d4aa'; }, 200);
        }

        renderProfiles();
        renderPackets();
        SenderRef.fill = fillFields;

        return { element: el, setVisible };
    })();

    // ─── Estilos globais ───
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        @keyframes iaMsgIn {
            0% { opacity: 0; transform: translateY(6px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes iaDot {
            0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
            30% { opacity: 1; transform: translateY(-4px); }
        }
        .ia-dot {
            width: 6px; height: 6px; border-radius: 50%; background: #a855f7;
            display: inline-block; animation: iaDot 1.2s ease-in-out infinite;
        }
        .ia-dot:nth-child(2) { animation-delay: 0.15s; }
        .ia-dot:nth-child(3) { animation-delay: 0.3s; }

        #hl-analyzer::-webkit-scrollbar,
        #hl-sender::-webkit-scrollbar,
        #hl-analyzer *::-webkit-scrollbar,
        #hl-sender *::-webkit-scrollbar { width: 6px; height: 6px; }

        #hl-analyzer::-webkit-scrollbar-track,
        #hl-sender::-webkit-scrollbar-track,
        #hl-analyzer *::-webkit-scrollbar-track,
        #hl-sender *::-webkit-scrollbar-track { background: #0a0a12; }

        #hl-analyzer::-webkit-scrollbar-thumb,
        #hl-sender::-webkit-scrollbar-thumb,
        #hl-analyzer *::-webkit-scrollbar-thumb,
        #hl-sender *::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 3px; }

        #hl-analyzer::-webkit-scrollbar-thumb:hover,
        #hl-sender::-webkit-scrollbar-thumb:hover,
        #hl-analyzer *::-webkit-scrollbar-thumb:hover,
        #hl-sender *::-webkit-scrollbar-thumb:hover { background: #2a2a3e; }

        #hl-analyzer input:focus,
        #hl-sender input:focus,
        #hl-analyzer textarea:focus,
        #hl-sender textarea:focus,
        #hl-analyzer select:focus,
        #hl-sender select:focus {
            border-color: #6c63ff !important;
            box-shadow: 0 0 0 2px rgba(108,99,255,0.15);
        }
        #hl-analyzer button:disabled,
        #hl-sender button:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    document.head.appendChild(styleEl);
    cleanup.push(() => { try { styleEl.remove(); } catch(e) {} });

    // ─── Anexar ao DOM ───
    const fragment = document.createDocumentFragment();
    fragment.appendChild(Toolbar.element);
    fragment.appendChild(AnalyzerUI.element);
    fragment.appendChild(SenderUI.element);
    document.body.appendChild(fragment);

    on(window, 'resize', () => {
        [AnalyzerUI.element, SenderUI.element].forEach((panel) => {
            if (panel.style.display === 'none') return;
            const rect = panel.getBoundingClientRect();
            const clamped = clampToViewport(panel, rect.left, rect.top);
            panel.style.left = clamped.x + 'px';
            panel.style.top = clamped.y + 'px';
        });
    });

    // ─── WebSocket via Hub ───
    if (!window._hubSocket) {
        console.error('[Analyzer] window._hubSocket não encontrado. Carregue via Sang Hub.');
        while (cleanup.length) { const fn = cleanup.pop(); try { fn(); } catch(e) {} }
        return;
    }

    const _recentPackets = new Map();

    function fastBufferHash(buffer) {
        const u8 = new Uint8Array(buffer);
        let hash = 0;
        const len = u8.length;
        const step = len <= 256 ? 1 : Math.max(1, Math.floor(len / 64));
        for (let i = 0; i < len; i += step) {
            hash = ((hash << 5) - hash) + u8[i];
            hash |= 0;
        }
        return `${len}_${hash}`;
    }

    function isDuplicate(data) {
        if (!(data instanceof ArrayBuffer)) return false;
        const key = fastBufferHash(data);
        const now = Date.now();
        if (_recentPackets.has(key) && now - _recentPackets.get(key) < 50) return true;
        _recentPackets.set(key, now);
        if (_recentPackets.size > 200) {
            for (const [k, t] of _recentPackets) {
                if (now - t > 200) _recentPackets.delete(k);
            }
        }
        return false;
    }

    function handleTraffic(data, dir, isDropped) {
        if (!_alive) return;
        if (AppState.isPaused) return;
        if (dir === 'RECV' && isDuplicate(data)) return;
        const packet = Utils.parseData(data);
        if (!packet) return;
        if (!PacketFilter.isVisualBlocked(packet)) {
            AnalyzerUI.addLog(packet, dir, !!isDropped);
        }
    }

    function wrapSend(ws) {
        if (!ws || ws._analyzerSendWrapped) return;
        ws._analyzerSendWrapped = true;
        const originalSend = ws.send.bind(ws);
        ws._analyzerOriginalSend = originalSend;
        ws.send = function(data) {
            if (!_alive) return originalSend(data);
            if (AppState.killSwitchActive) return;
            const packet = Utils.parseData(data);
            if (packet && PacketFilter.isNetworkDropped(packet)) {
                handleTraffic(data, 'SEND', true);
                return;
            }
            handleTraffic(data, 'SEND', false);
            return originalSend(data);
        };
    }

    async function handleInbound(event) {
        if (!_alive) return;
        let data = event.data;
        if (data instanceof Blob) {
            try { data = await data.arrayBuffer(); } catch(e) { return; }
        }
        const modifiedData = InboundTransformer.transform(data);
        handleTraffic(modifiedData, 'RECV');
    }

    window.gameWS = window._hubSocket.getActive();
    if (window.gameWS) wrapSend(window.gameWS);

    window._hubSocket.onConnect((ws) => {
        if (!_alive) return;
        window.gameWS = ws;
        wrapSend(ws);
    });

    window._hubSocket.onMessage((event, ws) => {
        if (!_alive) return;
        if (ws !== window.gameWS) return;
        handleInbound(event);
    });

    // ─── API pública ───
    function kill() {
        _alive = false;
        try { delete window[UID]; } catch(e) {}

        // Restaura send original
        try {
            if (window.gameWS && window.gameWS._analyzerSendWrapped) {
                if (window.gameWS._analyzerOriginalSend) {
                    window.gameWS.send = window.gameWS._analyzerOriginalSend;
                }
                delete window.gameWS._analyzerSendWrapped;
                delete window.gameWS._analyzerOriginalSend;
            }
        } catch(e) {}

        // Persiste dicionário final
        try { Storage.set('dicionario', AppState.dicionario); } catch(e) {}

        // Remove listeners
        while (cleanup.length) { const fn = cleanup.pop(); try { fn(); } catch(e) {} }

        // Remove DOM
        try {
            [Toolbar.element, AnalyzerUI.element, SenderUI.element].forEach(el => {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            });
        } catch(e) {}
    }

    window[UID] = { kill };
})();
