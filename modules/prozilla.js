// modules/puter.js — injetado pelo Sang Hub
// Integração com a SDK oficial do Puter (https://js.puter.com/v2/).
// Substitui o iframe bloqueado por X-Frame-Options por chamadas diretas à API.
(function() {
    'use strict';
    const UID = '_puter';
    if (window._puter) return;

    const PUTER_SDK_URL = 'https://js.puter.com/v2/';

    function loadPuterSdk() {
        return new Promise((resolve, reject) => {
            if (window.puter) return resolve(window.puter);
            const s = document.createElement('script');
            s.src = PUTER_SDK_URL;
            s.onload = () => {
                // A SDK às vezes demora um tick pra anexar em window.puter
                const tentar = (tentativas) => {
                    if (window.puter) return resolve(window.puter);
                    if (tentativas <= 0) return reject(new Error('SDK carregada mas puter indisponível'));
                    setTimeout(() => tentar(tentativas - 1), 100);
                };
                tentar(20);
            };
            s.onerror = () => reject(new Error('Falha ao carregar SDK do Puter'));
            document.head.appendChild(s);
        });
    }

    function init() {
        if (window._puter) return;

        const style = document.createElement('style');
        style.setAttribute('data-puter', '1');
        style.textContent = `
        @keyframes ptSpin{to{transform:rotate(360deg)}}

        #${UID}{position:fixed;top:70px;left:70px;width:720px;height:520px;min-width:420px;min-height:320px;
            box-sizing:border-box;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            background:linear-gradient(175deg,rgba(14,16,22,0.97),rgba(6,8,12,0.99));
            backdrop-filter:blur(16px) saturate(140%);
            border:1px solid rgba(120,160,255,0.16);border-radius:16px;overflow:hidden;
            z-index:2147483000;display:flex;flex-direction:column;resize:both;
            box-shadow:0 24px 60px rgba(0,0,0,0.7),0 0 32px rgba(80,140,255,0.10)}

        #${UID} .pt-hdr{height:40px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
            padding:0 12px;cursor:grab;user-select:none;
            background:linear-gradient(180deg,#1a2030,#10141d);
            border-bottom:1px solid rgba(120,160,255,0.12)}
        #${UID} .pt-hdr:active{cursor:grabbing}
        #${UID} .pt-brand{display:flex;align-items:center;gap:9px;min-width:0}
        #${UID} .pt-dot{width:8px;height:8px;border-radius:50%;background:#5b8bff;
            box-shadow:0 0 10px #5b8bff,0 0 20px rgba(91,139,255,0.4);flex-shrink:0}
        #${UID} .pt-title{font-weight:800;font-size:12px;letter-spacing:.14em;color:#e0e8ff;
            font-family:"Courier New",monospace;text-transform:uppercase}
        #${UID} .pt-user{font-size:10px;color:#8a9bc4;margin-left:8px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
        #${UID} .pt-actions{display:flex;gap:6px;flex-shrink:0}
        #${UID} .pt-btn{height:26px;min-width:26px;padding:0 8px;border-radius:7px;
            background:rgba(91,139,255,0.1);border:1px solid rgba(91,139,255,0.22);
            color:#b8c8f0;display:flex;align-items:center;justify-content:center;
            cursor:pointer;font-size:11px;font-weight:600;transition:all .15s ease;
            white-space:nowrap}
        #${UID} .pt-btn:hover{background:#5b8bff;color:#0a1020;border-color:#5b8bff;
            box-shadow:0 0 14px rgba(91,139,255,0.5)}
        #${UID} .pt-btn.ativo{background:rgba(91,139,255,0.28);border-color:rgba(91,139,255,0.5);color:#fff}

        #${UID} .pt-tabs{display:flex;gap:4px;padding:8px 10px;flex-shrink:0;
            border-bottom:1px solid rgba(120,160,255,0.08)}
        #${UID} .pt-tab{font-size:10px;font-weight:700;letter-spacing:.05em;padding:5px 12px;border-radius:6px;
            background:rgba(255,255,255,0.03);border:1px solid rgba(91,139,255,0.14);color:#7a8aa8;
            cursor:pointer;text-transform:uppercase;transition:all .15s}
        #${UID} .pt-tab:hover{border-color:rgba(91,139,255,0.4);color:#d8e0f8}
        #${UID} .pt-tab.ativo{background:rgba(91,139,255,0.22);border-color:rgba(91,139,255,0.45);color:#fff}

        #${UID} .pt-body{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}

        /* ---- Chat ---- */
        #${UID} .pt-chat{flex:1;min-height:0;display:flex;flex-direction:column}
        #${UID} .pt-chat-log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
        #${UID} .pt-chat-log::-webkit-scrollbar{width:5px}
        #${UID} .pt-chat-log::-webkit-scrollbar-thumb{background:rgba(91,139,255,0.35);border-radius:3px}
        #${UID} .pt-msg{max-width:82%;padding:9px 12px;border-radius:12px;font-size:12px;
            line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
        #${UID} .pt-msg.user{align-self:flex-end;background:linear-gradient(135deg,#3a5fbf,#2a4a9e);color:#fff;
            border-bottom-right-radius:4px}
        #${UID} .pt-msg.ia{align-self:flex-start;background:rgba(91,139,255,0.08);
            border:1px solid rgba(91,139,255,0.14);color:#d8e0f8;border-bottom-left-radius:4px}
        #${UID} .pt-msg.sys{align-self:center;background:rgba(255,255,255,0.04);color:#7a8aa8;
            font-size:10.5px;font-style:italic;padding:6px 10px}
        #${UID} .pt-msg.erro{align-self:center;background:rgba(255,80,80,0.1);
            border:1px solid rgba(255,80,80,0.25);color:#ffb0b0;font-size:11px}

        #${UID} .pt-chat-input{display:flex;gap:6px;padding:10px 12px;flex-shrink:0;
            border-top:1px solid rgba(120,160,255,0.1);background:rgba(0,0,0,0.2)}
        #${UID} .pt-chat-input textarea{flex:1;background:rgba(255,255,255,0.04);
            border:1px solid rgba(91,139,255,0.18);border-radius:9px;
            padding:8px 11px;color:#e8eefc;font-size:12px;outline:none;resize:none;
            min-height:38px;max-height:110px;font-family:inherit;line-height:1.4}
        #${UID} .pt-chat-input textarea:focus{border-color:rgba(91,139,255,0.5);
            box-shadow:0 0 0 2px rgba(91,139,255,0.12)}
        #${UID} .pt-chat-input textarea::placeholder{color:#5b6a88}
        #${UID} .pt-chat-input button{background:linear-gradient(135deg,#5b8bff,#3a5fbf);
            border:none;border-radius:9px;padding:0 16px;color:#fff;font-weight:700;
            font-size:11px;cursor:pointer;transition:filter .15s;white-space:nowrap}
        #${UID} .pt-chat-input button:hover:not(:disabled){filter:brightness(1.15)}
        #${UID} .pt-chat-input button:disabled{opacity:.4;cursor:not-allowed}

        /* ---- Arquivos ---- */
        #${UID} .pt-files{flex:1;min-height:0;display:flex;flex-direction:column}
        #${UID} .pt-files-bar{display:flex;gap:6px;padding:10px 12px;flex-shrink:0;
            border-bottom:1px solid rgba(120,160,255,0.1)}
        #${UID} .pt-files-bar input{flex:1;background:rgba(255,255,255,0.04);
            border:1px solid rgba(91,139,255,0.18);border-radius:8px;
            padding:7px 10px;color:#e8eefc;font-size:11px;outline:none}
        #${UID} .pt-files-bar input:focus{border-color:rgba(91,139,255,0.5)}
        #${UID} .pt-files-list{flex:1;overflow-y:auto;padding:6px}
        #${UID} .pt-files-list::-webkit-scrollbar{width:5px}
        #${UID} .pt-files-list::-webkit-scrollbar-thumb{background:rgba(91,139,255,0.35);border-radius:3px}
        #${UID} .pt-file{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:7px;
            font-size:11.5px;color:#c8d4ec;cursor:default;transition:background .12s}
        #${UID} .pt-file:hover{background:rgba(91,139,255,0.08)}
        #${UID} .pt-file .pt-file-icon{width:22px;text-align:center;font-size:14px;flex-shrink:0}
        #${UID} .pt-file .pt-file-nome{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .pt-file .pt-file-meta{font-size:9.5px;color:#6b7a98;flex-shrink:0}
        #${UID} .pt-file .pt-file-del{background:none;border:0;color:#6b7a98;cursor:pointer;
            padding:2px 4px;border-radius:4px;font-size:12px;transition:all .15s}
        #${UID} .pt-file .pt-file-del:hover{background:rgba(255,80,80,0.15);color:#ff9090}

        /* ---- Conta ---- */
        #${UID} .pt-conta{flex:1;min-height:0;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:14px;padding:24px}
        #${UID} .pt-conta-avatar{width:64px;height:64px;border-radius:50%;
            background:linear-gradient(135deg,#5b8bff,#3a5fbf);
            display:flex;align-items:center;justify-content:center;
            font-size:26px;font-weight:800;color:#fff;
            box-shadow:0 0 32px rgba(91,139,255,0.35)}
        #${UID} .pt-conta-nome{font-size:15px;font-weight:700;color:#e8eefc}
        #${UID} .pt-conta-user{font-size:11.5px;color:#8a9bc4}
        #${UID} .pt-conta-status{font-size:10.5px;color:#6b7a98;margin-top:-6px}

        /* ---- Comuns ---- */
        #${UID} .pt-vazio{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
            gap:8px;color:#6b7a98;font-size:11.5px;text-align:center;padding:20px}
        #${UID} .pt-spin{width:18px;height:18px;border:2px solid rgba(91,139,255,0.2);
            border-top-color:#5b8bff;border-radius:50%;animation:ptSpin .7s linear infinite}
        #${UID} .pt-oculto{display:none !important}
        `;
        document.head.appendChild(style);

        const win = document.createElement('div');
        win.id = UID;
        win.innerHTML = `
            <div class="pt-hdr" id="${UID}hdr">
                <div class="pt-brand">
                    <span class="pt-dot"></span>
                    <span class="pt-title">Puter</span>
                    <span class="pt-user" id="${UID}userLabel"></span>
                </div>
                <div class="pt-actions">
                    <div class="pt-btn" id="${UID}login" title="Entrar / Sair">👤</div>
                    <div class="pt-btn" id="${UID}min" title="Minimizar">−</div>
                    <div class="pt-btn" id="${UID}cls" title="Fechar">✕</div>
                </div>
            </div>
            <div class="pt-tabs">
                <div class="pt-tab ativo" data-tab="chat">Chat IA</div>
                <div class="pt-tab" data-tab="files">Arquivos</div>
                <div class="pt-tab" data-tab="conta">Conta</div>
            </div>
            <div class="pt-body">

                <div class="pt-chat" id="${UID}view-chat">
                    <div class="pt-chat-log" id="${UID}chatLog">
                        <div class="pt-msg sys">Converse com GPT, Claude, Gemini e outros via Puter. Precisa estar logado.</div>
                    </div>
                    <div class="pt-chat-input">
                        <textarea id="${UID}chatInput" rows="1" placeholder="Pergunte algo…"></textarea>
                        <button id="${UID}chatSend">Enviar</button>
                    </div>
                </div>

                <div class="pt-files pt-oculto" id="${UID}view-files">
                    <div class="pt-files-bar">
                        <input type="text" id="${UID}fileNome" placeholder="nome do arquivo.txt" />
                        <button class="pt-btn" id="${UID}fileNovo">+ Novo</button>
                        <button class="pt-btn" id="${UID}fileAtualizar">↻</button>
                    </div>
                    <div class="pt-files-list" id="${UID}filesList">
                        <div class="pt-vazio">Faça login e clique em ↻ pra listar seus arquivos.</div>
                    </div>
                </div>

                <div class="pt-conta pt-oculto" id="${UID}view-conta">
                    <div class="pt-conta-avatar" id="${UID}contaAvatar">?</div>
                    <div class="pt-conta-nome" id="${UID}contaNome">Visitante</div>
                    <div class="pt-conta-user" id="${UID}contaUser">—</div>
                    <div class="pt-conta-status" id="${UID}contaStatus">Não autenticado</div>
                    <button class="pt-btn" id="${UID}contaBtn" style="padding:0 16px;height:32px;font-size:12px">Entrar com Puter</button>
                </div>

            </div>
        `;
        document.body.appendChild(win);

        // ---- Elementos ----
        const hdr = win.querySelector('#' + UID + 'hdr');
        const userLabel = win.querySelector('#' + UID + 'userLabel');
        const chatLog = win.querySelector('#' + UID + 'chatLog');
        const chatInput = win.querySelector('#' + UID + 'chatInput');
        const chatSend = win.querySelector('#' + UID + 'chatSend');
        const filesList = win.querySelector('#' + UID + 'filesList');
        const fileNome = win.querySelector('#' + UID + 'fileNome');
        const contaAvatar = win.querySelector('#' + UID + 'contaAvatar');
        const contaNome = win.querySelector('#' + UID + 'contaNome');
        const contaUser = win.querySelector('#' + UID + 'contaUser');
        const contaStatus = win.querySelector('#' + UID + 'contaStatus');
        const contaBtn = win.querySelector('#' + UID + 'contaBtn');

        let puter = null;
        let usuarioAtual = null;

        // ---- Drag ----
        let drag = null;
        hdr.addEventListener('mousedown', e => {
            if (e.target.closest('.pt-btn')) return;
            const r = win.getBoundingClientRect();
            drag = { x: e.clientX - r.left, y: e.clientY - r.top };
        });
        function aoMover(e) {
            if (!drag) return;
            win.style.left = Math.max(0, e.clientX - drag.x) + 'px';
            win.style.top = Math.max(0, e.clientY - drag.y) + 'px';
        }
        function aoSoltar() { drag = null; }
        document.addEventListener('mousemove', aoMover);
        document.addEventListener('mouseup', aoSoltar);

        // ---- Abas ----
        win.querySelectorAll('.pt-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                win.querySelectorAll('.pt-tab').forEach(t => t.classList.remove('ativo'));
                tab.classList.add('ativo');
                const alvo = tab.dataset.tab;
                win.querySelector('#' + UID + 'view-chat').classList.toggle('pt-oculto', alvo !== 'chat');
                win.querySelector('#' + UID + 'view-files').classList.toggle('pt-oculto', alvo !== 'files');
                win.querySelector('#' + UID + 'view-conta').classList.toggle('pt-oculto', alvo !== 'conta');
                if (alvo === 'files' && usuarioAtual) listarArquivos();
            });
        });

        // ---- Helpers de UI ----
        function addMsg(tipo, texto) {
            const el = document.createElement('div');
            el.className = 'pt-msg ' + tipo;
            el.textContent = texto;
            chatLog.appendChild(el);
            chatLog.scrollTop = chatLog.scrollHeight;
            return el;
        }

        function atualizarConta(info) {
            usuarioAtual = info;
            const nome = info?.username || info?.email?.split('@')[0] || null;
            if (nome) {
                userLabel.textContent = nome;
                contaAvatar.textContent = nome.charAt(0).toUpperCase();
                contaNome.textContent = info.username || 'Usuário';
                contaUser.textContent = info.email || info.username || '—';
                contaStatus.textContent = 'Autenticado';
                contaBtn.textContent = 'Sair';
            } else {
                userLabel.textContent = '';
                contaAvatar.textContent = '?';
                contaNome.textContent = 'Visitante';
                contaUser.textContent = '—';
                contaStatus.textContent = 'Não autenticado';
                contaBtn.textContent = 'Entrar com Puter';
            }
        }

        // ---- Ações de conta ----
        async function login() {
            if (!puter) return;
            try {
                await puter.auth.signIn();
                const info = await puter.auth.getUser();
                atualizarConta(info);
                addMsg('sys', 'Login efetuado como ' + (info?.username || info?.email || 'usuário'));
            } catch (e) {
                addMsg('erro', 'Login cancelado ou falhou: ' + (e?.message || e));
            }
        }
        async function logout() {
            if (!puter) return;
            try {
                await puter.auth.signOut();
                atualizarConta(null);
                filesList.innerHTML = '<div class="pt-vazio">Faça login e clique em ↻ pra listar seus arquivos.</div>';
                addMsg('sys', 'Sessão encerrada.');
            } catch (e) {
                addMsg('erro', 'Falha ao sair: ' + (e?.message || e));
            }
        }
        function alternarLogin() {
            if (usuarioAtual) logout(); else login();
        }

        win.querySelector('#' + UID + 'login').addEventListener('click', alternarLogin);
        contaBtn.addEventListener('click', alternarLogin);

        // ---- Chat IA ----
        async function enviarChat() {
            const texto = chatInput.value.trim();
            if (!texto) return;
            if (!puter) { addMsg('erro', 'SDK ainda carregando…'); return; }

            addMsg('user', texto);
            chatInput.value = '';
            chatInput.style.height = 'auto';
            chatSend.disabled = true;

            const pendente = addMsg('ia', '…');

            try {
                const resposta = await puter.ai.chat(texto);
                const conteudo = typeof resposta === 'string'
                    ? resposta
                    : (resposta?.message?.content ?? resposta?.text ?? JSON.stringify(resposta));
                pendente.textContent = conteudo;
            } catch (e) {
                pendente.className = 'pt-msg erro';
                pendente.textContent = 'Erro: ' + (e?.message || e);
            } finally {
                chatSend.disabled = false;
                chatLog.scrollTop = chatLog.scrollHeight;
                chatInput.focus();
            }
        }
        chatSend.addEventListener('click', enviarChat);
        chatInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarChat();
            }
        });
        // Auto-resize do textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(110, chatInput.scrollHeight) + 'px';
        });

        // ---- Arquivos ----
        async function listarArquivos() {
            if (!puter) { filesList.innerHTML = '<div class="pt-vazio">SDK ainda carregando…</div>'; return; }
            if (!usuarioAtual) {
                filesList.innerHTML = '<div class="pt-vazio">Faça login pra ver seus arquivos.</div>';
                return;
            }
            filesList.innerHTML = '<div class="pt-vazio"><div class="pt-spin"></div>Carregando…</div>';
            try {
                const itens = await puter.fs.readdir('/');
                if (!itens.length) {
                    filesList.innerHTML = '<div class="pt-vazio">Nenhum arquivo na raiz.</div>';
                    return;
                }
                filesList.innerHTML = '';
                itens.forEach(item => {
                    const nome = item.name || item.path?.split('/').pop() || '(sem nome)';
                    const ehPasta = item.is_dir || item.isDir;
                    const tamanho = typeof item.size === 'number'
                        ? (item.size < 1024 ? item.size + ' B'
                          : item.size < 1048576 ? (item.size/1024).toFixed(1) + ' KB'
                          : (item.size/1048576).toFixed(1) + ' MB')
                        : '';
                    const linha = document.createElement('div');
                    linha.className = 'pt-file';
                    linha.innerHTML = `
                        <span class="pt-file-icon">${ehPasta ? '📁' : '📄'}</span>
                        <span class="pt-file-nome"></span>
                        <span class="pt-file-meta">${tamanho}</span>
                    `;
                    linha.querySelector('.pt-file-nome').textContent = nome;
                    if (!ehPasta) {
                        const del = document.createElement('button');
                        del.className = 'pt-file-del';
                        del.textContent = '🗑';
                        del.title = 'Apagar';
                        del.addEventListener('click', async () => {
                            if (!confirm('Apagar "' + nome + '"?')) return;
                            try {
                                await puter.fs.delete('/' + nome);
                                listarArquivos();
                            } catch (e) {
                                alert('Erro ao apagar: ' + (e?.message || e));
                            }
                        });
                        linha.appendChild(del);
                    }
                    filesList.appendChild(linha);
                });
            } catch (e) {
                filesList.innerHTML = '<div class="pt-vazio">Erro ao listar: ' + (e?.message || e) + '</div>';
            }
        }

        async function criarArquivo() {
            if (!puter) { alert('SDK ainda carregando…'); return; }
            if (!usuarioAtual) { alert('Faça login primeiro.'); return; }
            const nome = fileNome.value.trim();
            if (!nome) { alert('Digite um nome.'); return; }
            const conteudo = prompt('Conteúdo do arquivo "' + nome + '":', '');
            if (conteudo === null) return;
            try {
                await puter.fs.write('/' + nome, conteudo);
                fileNome.value = '';
                listarArquivos();
            } catch (e) {
                alert('Erro ao criar: ' + (e?.message || e));
            }
        }

        win.querySelector('#' + UID + 'fileNovo').addEventListener('click', criarArquivo);
        win.querySelector('#' + UID + 'fileAtualizar').addEventListener('click', listarArquivos);

        // ---- Carregar SDK e restaurar sessão ----
        addMsg('sys', 'Carregando SDK do Puter…');
        loadPuterSdk()
            .then(async (sdk) => {
                puter = sdk;
                addMsg('sys', 'SDK pronta.');
                try {
                    if (await puter.auth.isSignedIn()) {
                        const info = await puter.auth.getUser();
                        atualizarConta(info);
                        addMsg('sys', 'Sessão restaurada — ' + (info?.username || info?.email || ''));
                    } else {
                        atualizarConta(null);
                    }
                } catch (e) {
                    atualizarConta(null);
                }
            })
            .catch(e => {
                addMsg('erro', 'Falha ao carregar SDK: ' + (e?.message || e));
            });

        // ---- Minimizar / Fechar ----
        function minimize() { win.style.display = 'none'; }
        function kill() {
            document.removeEventListener('mousemove', aoMover);
            document.removeEventListener('mouseup', aoSoltar);
            win.remove();
            style.remove();
            delete window._puter;
        }
        win.querySelector('#' + UID + 'min').addEventListener('click', minimize);
        win.querySelector('#' + UID + 'cls').addEventListener('click', kill);

        window._puter = {
            kill,
            show: () => { win.style.display = 'flex'; },
            get sdk() { return puter; }
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
