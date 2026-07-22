(function() {
    'use strict';

    // ==========================================
    // MÓDULO 1: GERENCIAMENTO DE ESTADO (STORAGE)
    // ==========================================
    const Storage = {
        get(key, def) {
            try { return JSON.parse(localStorage.getItem(`hl_pro_${key}`)) || def; } catch { return def; }
        },
        set(key, val) {
            localStorage.setItem(`hl_pro_${key}`, JSON.stringify(val));
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
        fontSize: Storage.get('font_size', 14),
        showSend: true,
        showRecv: true
    };

    // ==========================================
    // MÓDULO 2: UTILITÁRIOS BINÁRIOS
    // ==========================================
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

    // ==========================================
    // MÓDULO 3: FIREWALL E FILTROS
    // ==========================================
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
                targetSet = AppState.blIds;
                targetArr = AppState.blPayloads;
                storeKeyId = 'bl_ids';
                storeKeyStr = 'bl_payloads';
            } else {
                targetSet = AppState.dropIds;
                targetArr = AppState.dropPayloads;
                storeKeyId = 'drop_ids';
                storeKeyStr = 'drop_payloads';
            }

            if (action === 'ADD_ID' && !isNaN(val)) { targetSet.add(Number(val)); Storage.set(storeKeyId, [...targetSet]); }
            if (action === 'ADD_STR' && val) { if (!targetArr.includes(val)) targetArr.push(val); Storage.set(storeKeyStr, targetArr); }
            if (action === 'REMOVE_ID' && !isNaN(val)) { targetSet.delete(Number(val)); Storage.set(storeKeyId, [...targetSet]); }
            if (action === 'REMOVE_STR' && val) { const idx = targetArr.indexOf(val); if (idx > -1) targetArr.splice(idx, 1); Storage.set(storeKeyStr, targetArr); }
            if (action === 'CLEAR') { targetSet.clear(); targetArr.length = 0; Storage.set(storeKeyId, []); Storage.set(storeKeyStr, []); }
        }
    };

    // ==========================================
    // MÓDULO 4: INBOUND TRANSFORMER
    // ==========================================
    const InboundTransformer = {
        rules: {},
        transform(data) {
            if (!(data instanceof ArrayBuffer)) return data;
            const view = new DataView(data);
            const header = view.getInt16(4, false);
            if (this.rules[header]) {
                const rule = this.rules[header];
                const ascii = Utils.bufferToString(data.slice(6));
                if (ascii.includes(rule.search)) {
                    const newAscii = ascii.replace(rule.search, rule.replace);
                    const encoder = new TextEncoder();
                    const newPayloadBytes = encoder.encode(newAscii);
                    const newTotalLen = 2 + newPayloadBytes.length;
                    const newBuffer = new ArrayBuffer(4 + newTotalLen);
                    const newView = new DataView(newBuffer);
                    newView.setInt32(0, newTotalLen, false);
                    newView.setInt16(4, header, false);
                    new Uint8Array(newBuffer).set(newPayloadBytes, 6);
                    return newBuffer;
                }
            }
            return data;
        }
    };

    // ==========================================
    // MÓDULO 5: FUNÇÃO DRAG (com correção de shadow)
    // ==========================================
    function makeDraggable(handleEl, targetEl) {
        let isDragging = false, offX, offY;
        handleEl.addEventListener('mousedown', function(e) {
            if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
            isDragging = true;
            const rect = targetEl.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            targetEl.style.left = (e.clientX - offX) + 'px';
            targetEl.style.top = (e.clientY - offY) + 'px';
            targetEl.style.right = 'auto';
            targetEl.style.bottom = 'auto';
            targetEl.style.transform = 'none';
        });
        document.addEventListener('mouseup', function() { isDragging = false; });
        handleEl.style.cursor = 'move';
        targetEl.style.willChange = 'transform';
    }

    // ==========================================
    // MÓDULO 6: TOOLBAR
    // ==========================================
    const Toolbar = (function() {
        const el = document.createElement('div');
        el.id = 'hl-toolbar';
        Object.assign(el.style, {
            position: 'fixed',
            top: '0',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 16px',
            background: '#0a0a0f',
            border: '1px solid #1a1a2e',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            zIndex: '100000',
            fontFamily: 'monospace',
            fontSize: '12px',
            userSelect: 'none',
            backdropFilter: 'blur(8px)'
        });

        const btnBase = {
            background: '#13131a',
            color: '#e1e1e6',
            border: '1px solid #1a1a2e',
            cursor: 'pointer',
            padding: '5px 12px',
            fontSize: '11px',
            fontFamily: 'monospace',
            borderRadius: '6px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            outline: 'none'
        };

        const btnAnalyzer = document.createElement('button');
        btnAnalyzer.textContent = '\uD83D\uDD0D Analyzer';
        Object.assign(btnAnalyzer.style, btnBase);

        const btnSender = document.createElement('button');
        btnSender.textContent = '\u26A1 Sender';
        Object.assign(btnSender.style, btnBase);

        const btnEye = document.createElement('button');
        btnEye.textContent = '\uD83D\uDC41\uFE0F';
        Object.assign(btnEye.style, btnBase, { padding: '5px 10px', fontSize: '13px' });
        btnEye.title = 'Mostrar/Ocultar tudo';

        let analyzerVisible = false;
        let senderVisible = false;

        function updateButtons() {
            if (analyzerVisible) {
                btnAnalyzer.style.background = '#6c63ff';
                btnAnalyzer.style.borderColor = '#6c63ff';
                btnAnalyzer.style.color = '#fff';
                btnAnalyzer.style.boxShadow = '0 0 10px rgba(108,99,255,0.3)';
            } else {
                btnAnalyzer.style.background = '#13131a';
                btnAnalyzer.style.borderColor = '#1a1a2e';
                btnAnalyzer.style.color = '#e1e1e6';
                btnAnalyzer.style.boxShadow = 'none';
            }
            if (senderVisible) {
                btnSender.style.background = '#6c63ff';
                btnSender.style.borderColor = '#6c63ff';
                btnSender.style.color = '#fff';
                btnSender.style.boxShadow = '0 0 10px rgba(108,99,255,0.3)';
            } else {
                btnSender.style.background = '#13131a';
                btnSender.style.borderColor = '#1a1a2e';
                btnSender.style.color = '#e1e1e6';
                btnSender.style.boxShadow = 'none';
            }
        }

        btnAnalyzer.addEventListener('mouseenter', () => { if (!analyzerVisible) btnAnalyzer.style.background = '#1a1a2e'; });
        btnAnalyzer.addEventListener('mouseleave', () => { if (!analyzerVisible) btnAnalyzer.style.background = '#13131a'; });
        btnSender.addEventListener('mouseenter', () => { if (!senderVisible) btnSender.style.background = '#1a1a2e'; });
        btnSender.addEventListener('mouseleave', () => { if (!senderVisible) btnSender.style.background = '#13131a'; });
        btnEye.addEventListener('mouseenter', () => { btnEye.style.background = '#1a1a2e'; });
        btnEye.addEventListener('mouseleave', () => { btnEye.style.background = '#13131a'; });

        btnAnalyzer.addEventListener('click', () => {
            analyzerVisible = !analyzerVisible;
            AnalyzerUI.setVisible(analyzerVisible);
            updateButtons();
        });

        btnSender.addEventListener('click', () => {
            senderVisible = !senderVisible;
            SenderUI.setVisible(senderVisible);
            updateButtons();
        });

        btnEye.addEventListener('click', () => {
            if (analyzerVisible || senderVisible) {
                analyzerVisible = false;
                senderVisible = false;
            } else {
                analyzerVisible = true;
                senderVisible = true;
            }
            AnalyzerUI.setVisible(analyzerVisible);
            SenderUI.setVisible(senderVisible);
            updateButtons();
        });

        el.appendChild(btnAnalyzer);
        el.appendChild(btnSender);
        el.appendChild(btnEye);

        makeDraggable(el, el);

        return { element: el };
    })();

    // Referência para comunicação Analyzer → Sender
    const SenderRef = { fill: null };

    // ==========================================
    // MÓDULO 7: ANALYZER UI
    // ==========================================
    const AnalyzerUI = (function() {
        const el = document.createElement('div');
        el.id = 'hl-analyzer';
        Object.assign(el.style, {
            position: 'fixed',
            top: '50px',
            left: '10px',
            width: '620px',
            maxHeight: 'calc(100vh - 70px)',
            background: '#13131a',
            color: '#e1e1e6',
            border: '1px solid #1a1a2e',
            zIndex: '99998',
            fontFamily: 'monospace',
            fontSize: '12px',
            borderRadius: '8px',
            display: 'none',
            flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        });

        el.innerHTML = `
            <div class="drag-header" style="
                background:#0a0a0f;padding:8px 12px;cursor:move;
                border-bottom:1px solid #1a1a2e;border-radius:8px 8px 0 0;
                font-weight:bold;display:flex;justify-content:space-between;align-items:center;
                font-size:12px;color:#e1e1e6;user-select:none;
            ">
                <span>\uD83D\uDD0D WS ANALYZER</span>
                <div style="display:flex;gap:5px;">
                    <button id="btnFontMinus" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1a1a2e;cursor:pointer;padding:2px 7px;border-radius:4px;font-size:11px;">A-</button>
                    <button id="btnFontPlus" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1a1a2e;cursor:pointer;padding:2px 7px;border-radius:4px;font-size:11px;">A+</button>
                </div>
            </div>
            <div id="analyzerBody" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
                <div style="padding:6px 10px;display:flex;gap:10px;align-items:center;background:#0a0a0f;border-bottom:1px solid #1a1a2e;">
                    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:#e1e1e6;">
                        <input type="checkbox" id="chkSend" checked style="accent-color:#00d4aa;"> \uD83D\uDCE4 Enviados
                    </label>
                    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:#e1e1e6;">
                        <input type="checkbox" id="chkRecv" checked style="accent-color:#6c63ff;"> \uD83D\uDCE5 Recebidos
                    </label>
                    <div style="flex:1;"></div>
                    <input id="logSearch" type="text" placeholder="Buscar nos logs..." style="
                        width:150px;background:#0a0a0f;color:#e1e1e6;
                        border:1px solid #1a1a2e;padding:4px 8px;font-size:11px;
                        border-radius:4px;font-family:monospace;outline:none;
                    ">
                </div>
                <div style="padding:6px 10px;display:flex;gap:6px;background:#0a0a0f;border-bottom:1px solid #1a1a2e;">
                    <button id="btnPauseLogs" style="
                        background:#1a1a2e;color:#e1e1e6;border:1px solid #1a1a2e;
                        cursor:pointer;padding:5px 10px;border-radius:6px;font-size:11px;
                        font-family:monospace;flex:1;transition:all 0.15s;
                    ">\u23F8 PAUSAR</button>
                    <button id="btnClearLogs" style="
                        background:#1a1a2e;color:#ff4757;border:1px solid #ff4757;
                        cursor:pointer;padding:5px 10px;border-radius:6px;font-size:11px;
                        font-family:monospace;flex:1;transition:all 0.15s;
                    ">\uD83D\uDDD1 LIMPAR</button>
                    <button id="btnCopyAll" style="
                        background:#1a1a2e;color:#00d4aa;border:1px solid #00d4aa;
                        cursor:pointer;padding:5px 10px;border-radius:6px;font-size:11px;
                        font-family:monospace;flex:1;transition:all 0.15s;
                    ">\uD83D\uDCCB COPIAR TUDO</button>
                </div>
                <div style="padding:6px 10px;background:#0a0a0f;text-align:center;border-bottom:1px solid #1a1a2e;">
                    <button id="btnKillSwitch" style="
                        background:#1a1a2e;color:#ff4757;border:2px solid #ff4757;
                        cursor:pointer;padding:8px;border-radius:6px;font-weight:bold;
                        width:100%;font-size:12px;font-family:monospace;transition:all 0.2s;
                    ">\u26A0\uFE0F HABILITAR KILL SWITCH</button>
                </div>
                <div id="logArea" style="flex:1;overflow-y:auto;padding:8px;min-height:200px;"></div>
                <div style="display:flex;background:#0a0a0f;border-top:1px solid #1a1a2e;min-height:120px;">
                    <div style="flex:1;padding:8px;border-right:1px solid #1a1a2e;display:flex;flex-direction:column;">
                        <div style="text-align:center;color:#6c63ff;font-weight:bold;margin-bottom:6px;font-size:11px;">\uD83D\uDC41\uFE0F OCULTAR DO LOG</div>
                        <div style="display:flex;gap:3px;margin-bottom:3px;">
                            <input id="vId" type="number" placeholder="ID" style="width:50px;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:3px;font-size:11px;border-radius:4px;">
                            <button id="btnAddVId" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">+</button>
                        </div>
                        <div style="display:flex;gap:3px;margin-bottom:4px;">
                            <input id="vStr" type="text" placeholder="HEX/Str" style="flex:1;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:3px;font-size:11px;border-radius:4px;">
                            <button id="btnAddVStr" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">+</button>
                        </div>
                        <div id="listV" style="flex:1;max-height:70px;overflow-y:auto;margin-bottom:4px;font-size:10px;"></div>
                        <button id="btnClrV" style="width:100%;background:#1a1a2e;color:#ff4757;border:1px solid #ff4757;cursor:pointer;padding:3px;border-radius:4px;font-size:10px;">LIMPAR TUDO</button>
                    </div>
                    <div style="flex:1;padding:8px;display:flex;flex-direction:column;">
                        <div style="text-align:center;color:#ff4757;font-weight:bold;margin-bottom:6px;font-size:11px;">\uD83D\uDED1 BLOQUEAR ENVIO</div>
                        <div style="display:flex;gap:3px;margin-bottom:3px;">
                            <input id="dId" type="number" placeholder="ID" style="width:50px;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:3px;font-size:11px;border-radius:4px;">
                            <button id="btnAddDId" style="background:#13131a;color:#ff4757;border:1px solid #ff4757;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">+</button>
                        </div>
                        <div style="display:flex;gap:3px;margin-bottom:4px;">
                            <input id="dStr" type="text" placeholder="HEX/Str" style="flex:1;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:3px;font-size:11px;border-radius:4px;">
                            <button id="btnAddDStr" style="background:#13131a;color:#ff4757;border:1px solid #ff4757;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">+</button>
                        </div>
                        <div id="listD" style="flex:1;max-height:70px;overflow-y:auto;margin-bottom:4px;font-size:10px;"></div>
                        <button id="btnClrD" style="width:100%;background:#1a1a2e;color:#ff4757;border:1px solid #ff4757;cursor:pointer;padding:3px;border-radius:4px;font-size:10px;">LIMPAR TUDO</button>
                    </div>
                </div>
            </div>
        `;

        makeDraggable(el.querySelector('.drag-header'), el);

        const logArea = el.querySelector('#logArea');
        logArea.style.fontSize = AppState.fontSize + 'px';

        // Font size
        el.querySelector('#btnFontPlus').onclick = () => {
            AppState.fontSize = Math.min(24, AppState.fontSize + 2);
            logArea.style.fontSize = AppState.fontSize + 'px';
            Storage.set('font_size', AppState.fontSize);
        };
        el.querySelector('#btnFontMinus').onclick = () => {
            AppState.fontSize = Math.max(8, AppState.fontSize - 2);
            logArea.style.fontSize = AppState.fontSize + 'px';
            Storage.set('font_size', AppState.fontSize);
        };

        // Kill Switch
        const btnKill = el.querySelector('#btnKillSwitch');
        btnKill.onclick = () => {
            AppState.killSwitchActive = !AppState.killSwitchActive;
            if (AppState.killSwitchActive) {
                btnKill.style.background = '#ff4757';
                btnKill.style.color = '#fff';
                btnKill.style.borderColor = '#ff4757';
                btnKill.textContent = '\uD83D\uDED1 KILL SWITCH ATIVO';
            } else {
                btnKill.style.background = '#1a1a2e';
                btnKill.style.color = '#ff4757';
                btnKill.style.borderColor = '#ff4757';
                btnKill.textContent = '\u26A0\uFE0F HABILITAR KILL SWITCH';
            }
        };

        // Pause
        const btnPause = el.querySelector('#btnPauseLogs');
        btnPause.onclick = () => {
            AppState.isPaused = !AppState.isPaused;
            if (AppState.isPaused) {
                btnPause.textContent = '\u25B6 CONTINUAR';
                btnPause.style.color = '#00d4aa';
                btnPause.style.borderColor = '#00d4aa';
            } else {
                btnPause.textContent = '\u23F8 PAUSAR';
                btnPause.style.color = '#e1e1e6';
                btnPause.style.borderColor = '#1a1a2e';
            }
        };

        // Clear / Copy All
        el.querySelector('#btnClearLogs').onclick = () => { logArea.innerHTML = ''; AppState.logs = []; };
        el.querySelector('#btnCopyAll').onclick = () => {
            if (AppState.logs.length === 0) return alert('Logs vazios.');
            const allText = AppState.logs.map(l => l.rawText).join('\n\n-----------------\n\n');
            navigator.clipboard.writeText(allText).then(() => alert(AppState.logs.length + ' logs copiados!'));
        };

        // Search & Filter
        const searchInp = el.querySelector('#logSearch');
        const chkSend = el.querySelector('#chkSend');
        const chkRecv = el.querySelector('#chkRecv');

        const refreshVisibility = () => {
            const q = searchInp.value.toLowerCase();
            for (const item of AppState.logs) {
                let visible = true;
                if (item.dir === 'SEND' && !AppState.showSend) visible = false;
                if (item.dir === 'RECV' && !AppState.showRecv) visible = false;
                if (q && !item.searchString.includes(q)) visible = false;
                item.el.style.display = visible ? 'block' : 'none';
            }
        };

        chkSend.onchange = () => { AppState.showSend = chkSend.checked; refreshVisibility(); };
        chkRecv.onchange = () => { AppState.showRecv = chkRecv.checked; refreshVisibility(); };
        searchInp.addEventListener('input', refreshVisibility);

        // Filter tags
        const createTag = (type, act, rawVal, displayVal) => {
            const d = document.createElement('div');
            Object.assign(d.style, {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#0a0a0f', border: '1px solid #1a1a2e',
                margin: '1px 0', padding: '1px 4px', fontSize: '10px',
                color: '#8a8a9a', borderRadius: '2px'
            });
            d.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:85%;">${displayVal}</span>
                <button style="color:#ff4757;background:none;border:none;cursor:pointer;font-weight:bold;padding:0 3px;">\u2715</button>`;
            d.querySelector('button').onclick = () => { PacketFilter.manageList(type, act, rawVal); renderFilters(); };
            return d;
        };

        const renderFilters = () => {
            const lv = el.querySelector('#listV'); lv.innerHTML = '';
            const ld = el.querySelector('#listD'); ld.innerHTML = '';
            AppState.blIds.forEach(id => lv.appendChild(createTag('VISUAL', 'REMOVE_ID', id, 'ID: ' + id)));
            AppState.blPayloads.forEach(s => lv.appendChild(createTag('VISUAL', 'REMOVE_STR', s, 'HEX: ' + s)));
            AppState.dropIds.forEach(id => ld.appendChild(createTag('DROP', 'REMOVE_ID', id, 'ID: ' + id)));
            AppState.dropPayloads.forEach(s => ld.appendChild(createTag('DROP', 'REMOVE_STR', s, 'HEX: ' + s)));
        };
        renderFilters();

        el.querySelector('#btnAddVId').onclick = () => { PacketFilter.manageList('VISUAL', 'ADD_ID', el.querySelector('#vId').value); el.querySelector('#vId').value = ''; renderFilters(); };
        el.querySelector('#btnAddVStr').onclick = () => { PacketFilter.manageList('VISUAL', 'ADD_STR', el.querySelector('#vStr').value); el.querySelector('#vStr').value = ''; renderFilters(); };
        el.querySelector('#btnClrV').onclick = () => { PacketFilter.manageList('VISUAL', 'CLEAR'); renderFilters(); };
        el.querySelector('#btnAddDId').onclick = () => { PacketFilter.manageList('DROP', 'ADD_ID', el.querySelector('#dId').value); el.querySelector('#dId').value = ''; renderFilters(); };
        el.querySelector('#btnAddDStr').onclick = () => { PacketFilter.manageList('DROP', 'ADD_STR', el.querySelector('#dStr').value); el.querySelector('#dStr').value = ''; renderFilters(); };
        el.querySelector('#btnClrD').onclick = () => { PacketFilter.manageList('DROP', 'CLEAR'); renderFilters(); };

        // Visibility
        const setVisible = (show) => { el.style.display = show ? 'flex' : 'none'; };

        // [+] Send button
        const createSendButton = (packet) => {
            const btn = document.createElement('button');
            btn.textContent = '[+]';
            btn.title = 'Preencher ID e HEX no Packet Sender';
            Object.assign(btn.style, {
                background: '#6c63ff', color: '#fff', border: 'none',
                cursor: 'pointer', padding: '1px 7px', marginLeft: '6px',
                fontSize: '11px', fontWeight: 'bold', borderRadius: '4px',
                transition: 'background 0.15s'
            });
            btn.addEventListener('mouseenter', () => { btn.style.background = '#7d74ff'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#6c63ff'; });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (SenderRef.fill) SenderRef.fill(packet.header, packet.payloadHex);
            });
            return btn;
        };

        // Expandable hex (>10KB)
        const MAX_DISPLAY_BYTES = 100;
        const makeExpandableHex = (fullHex, byteLength) => {
            if (byteLength <= 10000 || fullHex.length <= MAX_DISPLAY_BYTES * 3) {
                const hexDiv = document.createElement('div');
                hexDiv.style.cssText = 'word-break:break-all;color:#b0b0c0;letter-spacing:1px;';
                hexDiv.textContent = fullHex;
                return { element: hexDiv, full: fullHex };
            }

            const truncated = fullHex.substring(0, MAX_DISPLAY_BYTES * 3);
            const hexDiv = document.createElement('div');
            hexDiv.style.cssText = 'word-break:break-all;color:#b0b0c0;letter-spacing:1px;';
            hexDiv.textContent = truncated;

            const dots = document.createElement('span');
            dots.textContent = ' ... ';
            dots.style.color = '#8a8a9a';

            const expandBtn = document.createElement('button');
            expandBtn.textContent = `Expandir (${byteLength} bytes)`;
            Object.assign(expandBtn.style, {
                background: '#1a1a2e', color: '#6c63ff', border: '1px solid #6c63ff',
                cursor: 'pointer', padding: '1px 8px', fontSize: '10px',
                borderRadius: '4px', fontFamily: 'monospace', transition: 'background 0.15s'
            });
            expandBtn.addEventListener('click', () => {
                hexDiv.textContent = fullHex;
                dots.style.display = 'none';
                expandBtn.style.display = 'none';
            });

            const container = document.createElement('div');
            container.appendChild(hexDiv);
            container.appendChild(dots);
            container.appendChild(expandBtn);
            return { element: container, full: fullHex };
        };

        // Main log function
        const addLog = (packet, dir, isDropped) => {
            AppState.globalPacketCount++;
            const id = AppState.globalPacketCount;
            const time = new Date().toLocaleTimeString();
            const dirSym = dir === 'SEND' ? (isDropped ? '\u274C' : '\u27A1\uFE0F') : '\u2B05\uFE0F';

            let headerColor;
            if (isDropped) headerColor = '#ff4757';
            else if (dir === 'SEND') headerColor = '#00d4aa';
            else headerColor = '#6c63ff';

            const rawText = `${time} | Pacote #${id}\n${dirSym} ${dir} ID: ${packet.header} Tamanho: ${packet.byteLength} bytes\n${packet.fullHex}\n${packet.ascii}`;

            const el = document.createElement('div');
            el.style.cssText = 'border-bottom:1px solid #1a1a2e;margin-bottom:6px;padding-bottom:6px;';

            // Top line
            const topLine = document.createElement('div');
            topLine.style.cssText = 'display:flex;justify-content:space-between;align-items:center;color:#8a8a9a;font-size:0.85em;margin-bottom:4px;';

            const infoSpan = document.createElement('span');
            infoSpan.innerHTML = `${time} | Pacote #${id}${isDropped ? ' <strong style="color:#ff4757;">(DROPPED)</strong>' : ''}`;
            topLine.appendChild(infoSpan);

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex;gap:4px;align-items:center;';
            if (dir === 'SEND' && !isDropped) btnGroup.appendChild(createSendButton(packet));

            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copiar';
            Object.assign(copyBtn.style, {
                background: '#1a1a2e', color: '#8a8a9a', border: '1px solid #1a1a2e',
                cursor: 'pointer', fontSize: '0.85em', padding: '2px 8px',
                borderRadius: '4px', fontFamily: 'monospace', transition: 'all 0.15s'
            });
            copyBtn.addEventListener('mouseenter', () => { copyBtn.style.background = '#2a2a3e'; copyBtn.style.color = '#e1e1e6'; });
            copyBtn.addEventListener('mouseleave', () => { copyBtn.style.background = '#1a1a2e'; copyBtn.style.color = '#8a8a9a'; });
            copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(rawText); });
            btnGroup.appendChild(copyBtn);
            topLine.appendChild(btnGroup);
            el.appendChild(topLine);

            // ID line
            const idLine = document.createElement('div');
            idLine.style.cssText = `color:${headerColor};font-weight:bold;margin-bottom:3px;`;
            idLine.textContent = `${dirSym} ID: ${packet.header} | Tam: ${packet.byteLength} bytes`;
            el.appendChild(idLine);

            // Hex (with expand for large)
            const hexResult = makeExpandableHex(packet.fullHex, packet.byteLength);
            el.appendChild(hexResult.element);

            // ASCII
            const asciiDiv = document.createElement('div');
            asciiDiv.style.cssText = 'color:#8a8a9a;margin-top:2px;';
            asciiDiv.textContent = packet.ascii;
            el.appendChild(asciiDiv);

            // Visibility check
            const searchString = `${packet.header} ${packet.fullHex} ${packet.ascii}`.toLowerCase();
            const q = searchInp.value.toLowerCase();
            let visible = true;
            if (dir === 'SEND' && !AppState.showSend) visible = false;
            if (dir === 'RECV' && !AppState.showRecv) visible = false;
            if (q && !searchString.includes(q)) visible = false;
            if (!visible) el.style.display = 'none';

            logArea.appendChild(el);

            AppState.logs.push({ el, dir, searchString, rawText });

            // Limit logs
            while (AppState.logs.length > AppState.maxLogs) {
                const old = AppState.logs.shift();
                if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
            }

            // Auto-scroll
            const isScrolledToBottom = logArea.scrollHeight - logArea.clientHeight <= logArea.scrollTop + 40;
            if (isScrolledToBottom) logArea.scrollTop = logArea.scrollHeight;
        };

        return { element: el, setVisible, addLog };
    })();

    // ==========================================
    // MÓDULO 8: SENDER UI
    // ==========================================
    const SenderUI = (function() {
        const el = document.createElement('div');
        el.id = 'hl-sender';
        Object.assign(el.style, {
            position: 'fixed', top: '50px', right: '10px',
            width: '380px', background: '#13131a', color: '#e1e1e6',
            border: '1px solid #1a1a2e', zIndex: '99999',
            fontFamily: 'monospace', fontSize: '12px',
            borderRadius: '8px', display: 'none', flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        });

        el.innerHTML = `
            <div class="drag-header" style="
                background:#0a0a0f;padding:8px 12px;cursor:move;
                border-bottom:1px solid #1a1a2e;border-radius:8px 8px 0 0;
                font-weight:bold;font-size:12px;color:#e1e1e6;user-select:none;
            ">\u26A1 PACKET SENDER PRO</div>
            <div id="sndBody" style="display:flex;flex-direction:column;">
                <div style="padding:8px;display:flex;gap:6px;border-bottom:1px solid #1a1a2e;">
                    <select id="selProfile" style="flex:1;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:5px;border-radius:4px;font-size:11px;"></select>
                    <button id="btnNewProf" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1a1a2e;cursor:pointer;padding:5px 10px;border-radius:6px;font-size:11px;font-family:monospace;">+ Novo</button>
                </div>
                <div style="padding:8px;background:#0a0a0f;display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;gap:6px;">
                        <input id="sndId" type="number" placeholder="ID" style="width:60px;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:5px;border-radius:4px;font-size:11px;">
                        <input id="sndHex" type="text" placeholder="HEX Payload" style="flex:1;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:5px;border-radius:4px;font-size:11px;">
                        <button id="btnAddSnd" style="background:#00d4aa;color:#0a0a0f;border:none;cursor:pointer;padding:5px 12px;border-radius:6px;font-weight:bold;font-size:11px;">ADD</button>
                    </div>
                    <div style="display:flex;gap:6px;border-top:1px solid #1a1a2e;padding-top:8px;">
                        <input id="sndWaitMs" type="number" placeholder="Pausar (ms)" style="flex:1;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:5px;border-radius:4px;font-size:11px;">
                        <button id="btnAddWait" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1a1a2e;cursor:pointer;padding:5px 12px;border-radius:6px;font-size:11px;">+ WAIT</button>
                        <button id="btnAddJs" style="background:#1a1a2e;color:#00d4aa;border:1px solid #00d4aa;cursor:pointer;padding:5px 12px;border-radius:6px;font-size:11px;">+ JS</button>
                    </div>
                    <div id="sndList" style="max-height:180px;overflow-y:auto;border:1px solid #1a1a2e;padding:3px;min-height:50px;background:#0a0a0f;border-radius:4px;"></div>
                </div>
                <div style="padding:8px;background:#0a0a0f;border-top:1px solid #1a1a2e;display:flex;flex-direction:column;gap:6px;">
                    <div style="color:#6c63ff;font-weight:bold;text-align:center;font-size:11px;">\uD83D\uDCE5 SIMULAR PACOTE RECEBIDO</div>
                    <div style="display:flex;gap:6px;">
                        <input id="fakeId" type="number" placeholder="ID" style="width:60px;background:#0a0a0f;color:#6c63ff;border:1px solid #6c63ff;padding:5px;border-radius:4px;font-size:11px;">
                        <input id="fakeHex" type="text" placeholder="HEX Payload" style="flex:1;background:#0a0a0f;color:#6c63ff;border:1px solid #6c63ff;padding:5px;border-radius:4px;font-size:11px;">
                        <button id="btnFakeRecv" style="background:#6c63ff;color:#fff;border:none;cursor:pointer;padding:5px 10px;border-radius:6px;font-weight:bold;font-size:11px;">SIMULAR</button>
                    </div>
                </div>
                <div style="padding:8px;background:#0a0a0f;display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;align-items:center;">
                    <label style="font-size:11px;color:#8a8a9a;">Loop Delay: <input id="sndDelay" type="number" style="width:60px;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:3px;border-radius:4px;font-size:11px;"></label>
                    <label style="font-size:11px;color:#8a8a9a;">Qtd(0=Inf): <input id="sndQtd" type="number" style="width:40px;background:#0a0a0f;color:#e1e1e6;border:1px solid #1a1a2e;padding:3px;border-radius:4px;font-size:11px;"></label>
                    <button id="btnSpamAction" style="
                        background:#00d4aa;color:#0a0a0f;border:none;cursor:pointer;
                        padding:10px;font-weight:bold;width:100%;margin-top:5px;
                        border-radius:6px;font-size:13px;font-family:monospace;transition:all 0.15s;
                    ">\uD83D\uDE80 START SEQUENCE</button>
                </div>
            </div>
        `;

        makeDraggable(el.querySelector('.drag-header'), el);

        let isSpamming = false;
        const sleep = ms => new Promise(res => setTimeout(res, ms));

        const saveCurrentProfile = () => {
            Storage.set('profiles', AppState.profiles);
            Storage.set('current_profile', AppState.currentProfileId);
        };

        const renderProfiles = () => {
            const sel = el.querySelector('#selProfile');
            sel.innerHTML = '';
            for (const pid in AppState.profiles) {
                const opt = document.createElement('option');
                opt.value = pid;
                opt.textContent = AppState.profiles[pid].name;
                if (pid === AppState.currentProfileId) opt.selected = true;
                sel.appendChild(opt);
            }
        };

        const renderPackets = () => {
            const prof = AppState.profiles[AppState.currentProfileId];
            const list = el.querySelector('#sndList');
            list.innerHTML = '';
            prof.packets.forEach((pkt, index) => {
                const item = document.createElement('div');
                Object.assign(item.style, {
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: '#0a0a0f', padding: '4px', marginBottom: '2px',
                    border: '1px solid #1a1a2e', borderRadius: '4px', fontSize: '11px'
                });
                if (pkt.isDelay) {
                    item.innerHTML = `<span style="color:#8a8a9a;width:35px;font-weight:bold;text-align:center;">\u23F1\uFE0F</span><span style="flex:1;color:#8a8a9a;font-style:italic;">Aguardar ${pkt.ms}ms</span>`;
                } else if (pkt.isJs) {
                    const preview = pkt.code.length > 40 ? pkt.code.substring(0, 40) + '...' : pkt.code;
                    item.innerHTML = `<span style="color:#00d4aa;width:35px;font-weight:bold;text-align:center;">\uD83E\uDDE0</span><span style="flex:1;color:#00d4aa;font-style:italic;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">Exec JS: ${preview}</span>`;
                } else {
                    item.innerHTML = `<span style="color:#e1e1e6;width:35px;font-weight:bold;">${pkt.id}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8a8a9a;">${pkt.hex || '(vazio)'}</span>`;
                }
                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = 'display:flex;gap:2px;';
                btnGroup.innerHTML = `
                    <button class="up" style="background:#1a1a2e;color:#e1e1e6;border:none;cursor:pointer;padding:2px 6px;border-radius:3px;font-size:10px;">\u2191</button>
                    <button class="down" style="background:#1a1a2e;color:#e1e1e6;border:none;cursor:pointer;padding:2px 6px;border-radius:3px;font-size:10px;">\u2193</button>
                    <button class="del" style="background:#1a1a2e;color:#ff4757;border:1px solid #ff4757;cursor:pointer;padding:2px 6px;border-radius:3px;font-size:10px;">X</button>
                `;
                btnGroup.querySelector('.up').onclick = () => {
                    if (index > 0) { [prof.packets[index - 1], prof.packets[index]] = [prof.packets[index], prof.packets[index - 1]]; saveCurrentProfile(); renderPackets(); }
                };
                btnGroup.querySelector('.down').onclick = () => {
                    if (index < prof.packets.length - 1) { [prof.packets[index + 1], prof.packets[index]] = [prof.packets[index], prof.packets[index + 1]]; saveCurrentProfile(); renderPackets(); }
                };
                btnGroup.querySelector('.del').onclick = () => { prof.packets.splice(index, 1); saveCurrentProfile(); renderPackets(); };
                item.appendChild(btnGroup);
                list.appendChild(item);
            });
            el.querySelector('#sndDelay').value = prof.spamInterval;
            el.querySelector('#sndQtd').value = prof.spamQtd;
        };

        // Event bindings
        el.querySelector('#btnAddSnd').onclick = () => {
            const idVal = el.querySelector('#sndId').value;
            const hexVal = el.querySelector('#sndHex').value || '';
            if (idVal !== '' && !isNaN(Number(idVal))) {
                AppState.profiles[AppState.currentProfileId].packets.push({ id: Number(idVal), hex: hexVal });
                el.querySelector('#sndId').value = '';
                el.querySelector('#sndHex').value = '';
                saveCurrentProfile(); renderPackets();
            }
        };
        el.querySelector('#btnAddWait').onclick = () => {
            const ms = parseInt(el.querySelector('#sndWaitMs').value);
            if (!isNaN(ms) && ms > 0) {
                AppState.profiles[AppState.currentProfileId].packets.push({ isDelay: true, ms });
                el.querySelector('#sndWaitMs').value = '';
                saveCurrentProfile(); renderPackets();
            }
        };
        el.querySelector('#btnAddJs').onclick = () => {
            const jsCode = prompt('Insira o código JavaScript a ser executado na fila:');
            if (jsCode && jsCode.trim() !== '') {
                AppState.profiles[AppState.currentProfileId].packets.push({ isJs: true, code: jsCode.trim() });
                saveCurrentProfile(); renderPackets();
            }
        };
        el.querySelector('#btnFakeRecv').onclick = () => {
            if (!window.gameWS) return alert('Conecte-se ao jogo primeiro.');
            const idVal = el.querySelector('#fakeId').value;
            const hexVal = el.querySelector('#fakeHex').value || '';
            if (idVal !== '' && !isNaN(Number(idVal))) {
                const buffer = Utils.buildPacket(Number(idVal), hexVal);
                window.gameWS.dispatchEvent(new MessageEvent('message', { data: buffer }));
                el.querySelector('#fakeId').value = '';
                el.querySelector('#fakeHex').value = '';
            }
        };
        el.querySelector('#btnNewProf').onclick = () => {
            const name = prompt('Nome do novo perfil:');
            if (name) {
                const id = 'prof_' + Date.now();
                AppState.profiles[id] = { name, packets: [], spamInterval: 300, spamQtd: 1 };
                AppState.currentProfileId = id;
                saveCurrentProfile(); renderProfiles(); renderPackets();
            }
        };
        el.querySelector('#selProfile').onchange = (e) => { AppState.currentProfileId = e.target.value; saveCurrentProfile(); renderPackets(); };
        el.querySelector('#sndDelay').onchange = (e) => { AppState.profiles[AppState.currentProfileId].spamInterval = Number(e.target.value); saveCurrentProfile(); };
        el.querySelector('#sndQtd').onchange = (e) => { AppState.profiles[AppState.currentProfileId].spamQtd = Number(e.target.value); saveCurrentProfile(); };

        // Spam engine
        el.querySelector('#btnSpamAction').onclick = async function() {
            if (!window.gameWS) return alert('Conecte-se ao jogo primeiro.');
            const btn = el.querySelector('#btnSpamAction');
            const prof = AppState.profiles[AppState.currentProfileId];
            if (isSpamming) {
                isSpamming = false;
                btn.textContent = '\uD83D\uDE80 START SEQUENCE';
                btn.style.background = '#00d4aa'; btn.style.color = '#0a0a0f';
                return;
            }
            if (prof.packets.length === 0) return alert('Fila vazia.');
            isSpamming = true;
            btn.textContent = '\u23F9 STOP SEQUENCE';
            btn.style.background = '#ff4757'; btn.style.color = '#fff';
            let loops = 0;
            const inf = (prof.spamQtd === 0);
            while (isSpamming && (inf || loops < prof.spamQtd)) {
                for (const item of prof.packets) {
                    if (!isSpamming) break;
                    if (item.isDelay) { await sleep(item.ms); }
                    else if (item.isJs) {
                        try { eval(item.code); } catch (e) { console.error('[JS_ACTION] Erro:', e); }
                    } else {
                        const buffer = Utils.buildPacket(item.id, item.hex);
                        window.gameWS.send(buffer);
                    }
                }
                loops++;
                if (isSpamming && (inf || loops < prof.spamQtd)) await sleep(prof.spamInterval);
            }
            isSpamming = false;
            btn.textContent = '\uD83D\uDE80 START SEQUENCE';
            btn.style.background = '#00d4aa'; btn.style.color = '#0a0a0f';
        };

        const setVisible = (show) => { el.style.display = show ? 'flex' : 'none'; };

        const fillFields = (headerId, hexPayload) => {
            el.querySelector('#sndId').value = headerId;
            el.querySelector('#sndHex').value = hexPayload;
            // Visual feedback: pisca o botão ADD
            const addBtn = el.querySelector('#btnAddSnd');
            addBtn.style.background = '#fff';
            addBtn.style.color = '#0a0a0f';
            setTimeout(() => { addBtn.style.background = '#00d4aa'; addBtn.style.color = '#0a0a0f'; }, 200);
        };

        renderProfiles();
        renderPackets();
        SenderRef.fill = fillFields;

        return { element: el, setVisible };
    })();

    // ==========================================
    // MÓDULO 9: INICIALIZAÇÃO
    // ==========================================
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        #hl-analyzer::-webkit-scrollbar,
        #hl-sender::-webkit-scrollbar,
        #hl-analyzer *::-webkit-scrollbar,
        #hl-sender *::-webkit-scrollbar {
            width: 5px;
            height: 5px;
        }
        #hl-analyzer::-webkit-scrollbar-track,
        #hl-sender::-webkit-scrollbar-track,
        #hl-analyzer *::-webkit-scrollbar-track,
        #hl-sender *::-webkit-scrollbar-track {
            background: #0a0a0f;
        }
        #hl-analyzer::-webkit-scrollbar-thumb,
        #hl-sender::-webkit-scrollbar-thumb,
        #hl-analyzer *::-webkit-scrollbar-thumb,
        #hl-sender *::-webkit-scrollbar-thumb {
            background: #1a1a2e;
            border-radius: 3px;
        }
        #hl-analyzer::-webkit-scrollbar-thumb:hover,
        #hl-sender::-webkit-scrollbar-thumb:hover,
        #hl-analyzer *::-webkit-scrollbar-thumb:hover,
        #hl-sender *::-webkit-scrollbar-thumb:hover {
            background: #2a2a3e;
        }
    `;
    document.head.appendChild(styleEl);

    const fragment = document.createDocumentFragment();
    fragment.appendChild(Toolbar.element);
    fragment.appendChild(AnalyzerUI.element);
    fragment.appendChild(SenderUI.element);

    // Em MAIN world o document.body já deve existir na maioria dos casos
    // (run_at: document_end/idle). Fallback defensivo caso ainda não exista.
    if (document.body) {
        document.body.appendChild(fragment);
    } else {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(fragment));
    }

    // ==========================================
    // MÓDULO 10: INTERCEPTAÇÃO WEBSOCKET
    // ==========================================
    window.gameWS = null;

    const _recentPackets = new Map();

    const fastBufferHash = (buffer) => {
        const u8 = new Uint8Array(buffer);
        let hash = 0;
        const len = Math.min(u8.length, 64);
        for (let i = 0; i < len; i++) {
            hash = ((hash << 5) - hash) + u8[i];
            hash |= 0;
        }
        return `${buffer.byteLength}_${hash}`;
    };

    const isDuplicate = (data) => {
        if (!(data instanceof ArrayBuffer)) return false;
        const key = fastBufferHash(data);
        const now = Date.now();
        if (_recentPackets.has(key) && now - _recentPackets.get(key) < 50) return true;
        _recentPackets.set(key, now);
        if (_recentPackets.size > 100) {
            for (const [k, t] of _recentPackets) {
                if (now - t > 200) _recentPackets.delete(k);
            }
        }
        return false;
    };

    const handleTraffic = (data, dir, isDropped) => {
        if (AppState.isPaused) return;
        if (dir === 'RECV' && isDuplicate(data)) return;
        const packet = Utils.parseData(data);
        if (!packet) return;
        if (!PacketFilter.isVisualBlocked(packet)) {
            AnalyzerUI.addLog(packet, dir, !!isDropped);
        }
    };

    // Função unificada para processar dados inbound
    const processInboundData = async (rawData) => {
        // Converte Blob para ArrayBuffer se necessário
        let data = rawData;
        if (data instanceof Blob) {
            data = await data.arrayBuffer();
        }

        // Aplica transformação
        const modifiedData = InboundTransformer.transform(data);

        // Log no analyzer
        handleTraffic(modifiedData, 'RECV');

        // Retorna os dados processados e um novo evento
        return {
            data: modifiedData,
            createEvent: (originalEvent) => {
                return new MessageEvent('message', {
                    data: modifiedData,
                    origin: originalEvent?.origin,
                    lastEventId: originalEvent?.lastEventId,
                    source: originalEvent?.source,
                    ports: originalEvent?.ports
                });
            }
        };
    };

    // Hook no construtor para capturar gameWS na criação
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
        const ws = new OriginalWebSocket(...args);

        // Captura a instância assim que é criada
        if (!window.gameWS) {
            window.gameWS = ws;
            console.log('[HL PRO] WebSocket capturado na criação');
        }

        return ws;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;

    // Copia TODAS as propriedades estáticas do WebSocket original
    Object.keys(OriginalWebSocket).forEach(key => {
        window.WebSocket[key] = OriginalWebSocket[key];
    });

    // Hook send
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data) {
        if (!window.gameWS) window.gameWS = this;

        if (AppState.killSwitchActive) return;

        const packet = Utils.parseData(data);
        if (packet && PacketFilter.isNetworkDropped(packet)) {
            handleTraffic(data, 'SEND', true);
            return;
        }
        handleTraffic(data, 'SEND', false);
        return originalSend.call(this, data);
    };

    // Hook addEventListener
    const originalAddEventListener = WebSocket.prototype.addEventListener;
    WebSocket.prototype.addEventListener = function(type, listener, options) {
        if (type === 'message' && !listener._isHooked) {
            const self = this;

            if (!window.gameWS) window.gameWS = self;

            const wrapped = async function(event) {
                const processed = await processInboundData(event.data);
                const newEvent = processed.createEvent(event);
                return listener.call(self, newEvent);
            };
            wrapped._isHooked = true;

            return originalAddEventListener.call(this, type, wrapped, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    // Hook onmessage
    const onMessageDescriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    if (onMessageDescriptor) {
        Object.defineProperty(WebSocket.prototype, 'onmessage', {
            get() {
                return this._onmessage_original;
            },
            set(listener) {
                const self = this;

                if (!window.gameWS) window.gameWS = self;

                this._onmessage_original = listener;

                const wrapped = async function(event) {
                    const processed = await processInboundData(event.data);
                    const newEvent = processed.createEvent(event);
                    if (listener) {
                        return listener.call(self, newEvent);
                    }
                };

                if (onMessageDescriptor.set) {
                    onMessageDescriptor.set.call(this, wrapped);
                }
            },
            configurable: true
        });
    }

    // Tentar capturar WebSocket existente e seus listeners
    const tryCaptureExistingWebSocket = () => {
        const checkInterval = setInterval(() => {
            if (window.gameWS) {
                clearInterval(checkInterval);
                return;
            }

            const possibleRefs = ['ws', 'socket', 'gameSocket', 'connection', 'wsConnection'];
            for (const ref of possibleRefs) {
                if (window[ref] instanceof WebSocket && window[ref].readyState === WebSocket.OPEN) {
                    window.gameWS = window[ref];
                    console.log(`[HL PRO] WebSocket capturado via window.${ref}`);
                    clearInterval(checkInterval);
                    return;
                }
            }

            if (checkInterval._attempts === undefined) checkInterval._attempts = 0;
            if (++checkInterval._attempts > 100) {
                clearInterval(checkInterval);
                console.warn('[HL PRO] Não foi possível capturar WebSocket automaticamente. Conecte-se ao jogo primeiro.');
            }
        }, 100);
    };

    tryCaptureExistingWebSocket();

})();
