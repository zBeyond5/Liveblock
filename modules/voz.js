(function() {
    'use strict';
    const UID = '_voz';
    if (window[UID]) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
        console.warn('[Voz] Web Speech API não suportada.');
        return;
    }

    const STATE_KEY = 'sang_voz_state';
    const DEFAULT_CONFIG = {
        modo: 'manual',
        silencioMs: 2500,
        minChars: 2,
        lang: 'pt-BR',
        left: null,
        top: null,
        pontuacao: 'pausa',
        pausaVirgulaMs: 550
    };

    // ─── Persistência ───
    const loadConfig = () => {
        try {
            const raw = localStorage.getItem(STATE_KEY);
            return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
        } catch { return { ...DEFAULT_CONFIG }; }
    };
    const saveConfig = c => {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(c)); } catch {}
    };

    // ─── Utilidades ───
    const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
    const normalize = s => String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // ═══ COMANDOS ═══
    const PREFIXO_FORCAR_CHAT = /^(ditar|digitar|escrever|escreve|falar|fala)\s+(.+)$/i;

    const COMANDOS_VOZ = [
        { re: /^(enviar?|envia|mandar?|manda|manda\s+isso|manda\s+essa|envia\s+isso|envia\s+essa|pode\s+enviar|pode\s+mandar)$/, acao: 'enviar' },
        { re: /^(cancelar?|cancela|apagar?|apaga|limpar?|limpa|limpa\s+isso|apaga\s+isso|descarta(r)?|descarta|deixa\s+pra\s+la|deixa\s+pra\s+lá)$/, acao: 'cancelar' }
    ];

    const COMANDOS_RESERVADOS = [
        /^(abrir?|abre|abra|ativar?|ativa|ligar?|liga|iniciar?|inicia|fechar?|feche|fecha|desativar?|desativa|desligar?|desliga|parar?|para)\s+(o\s+|a\s+|os\s+|as\s+)?(menu|iptv|tv|youtube|yt|packet|blocklive|liveblock|adblock|bloqueador|booster|jogos|games|gameslive|photoswap|fotoswap|foto|prozilla|galeria|voz|chat|groq|gemini)$/,
        /^(mostrar?|mostra|esconder?|esconde|abrir?|abre|fechar?|fecha)\s+menu$/,
        /^menu$/,
        /^(modo\s+)?(voz|microfone|mic)$/,
        /^(tirar?|tira)\s+print$/,
        /^(capturar?|captura)\s+(a\s+)?tela$/,
        /^print$/,
        /^(salvar?|salva)\s+(na\s+pasta|solto|solta)$/,
        /^(criar?|cria|nova?|novo)\s+(anotacao|anotação|nota)$/,
        /^(salvar?|salva)\s+nota$/,
        /^(concluir?|conclui|finalizar?|finaliza)(\s+(nota|anotacao|anotação))?$/,
        /^anotacao$/,
        /^anotação$/,
        /^nota$/,
        /^(fechar?|fecha|confirmar?|confirma|voltar?|volta)(\s+(isso|tudo|janela|painel))?$/
    ];

    window._voiceCommands = window._voiceCommands || {
        _extras: [],
        adicionar(re) { if (re instanceof RegExp) this._extras.push(re); },
        tem(texto) {
            const n = normalize(texto);
            return COMANDOS_RESERVADOS.some(r => r.test(n)) || this._extras.some(r => r.test(n));
        },
        acaoLocal(texto) {
            const n = normalize(texto);
            for (const cmd of COMANDOS_VOZ) if (cmd.re.test(n)) return cmd.acao;
            return null;
        },
        extrairForcarChat(texto) {
            const m = String(texto || '').match(PREFIXO_FORCAR_CHAT);
            return m ? m[2].trim() : null;
        }
    };

    // ═══ CHAT DO JOGO ═══
    function encontrarInputChat() {
        const sels = [
            'input[placeholder*="onversa"]',
            'input[placeholder*="alar"]',
            'input[placeholder*="ensagem"]',
            'input[placeholder*="hat"]',
            'input[placeholder*="escreva"]',
            '.chat-input input',
            '.chatbox input',
            '.chat input',
            'input[type="text"][maxlength]'
        ];
        for (const sel of sels) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
        }
        return [...document.querySelectorAll('input[type="text"], textarea')]
            .find(el => el.getBoundingClientRect().top > window.innerHeight * 0.65 && el.offsetParent) || null;
    }

    function setInputValue(el, texto) {
        if (el.isContentEditable) {
            el.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('insertText', false, texto);
            return;
        }
        const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc?.set) desc.set.call(el, texto); else el.value = texto;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function pressEnter(el) {
        const o = { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true };
        el.dispatchEvent(new KeyboardEvent('keydown', o));
        el.dispatchEvent(new KeyboardEvent('keypress', o));
        el.dispatchEvent(new KeyboardEvent('keyup', o));
    }

    // ═══ MÓDULO ═══
    function init() {
        const config = loadConfig();

        const host = document.createElement('div');
        host.id = UID + '_host';
        host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483000;';
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; }

        .fab {
            position: fixed; width: 46px; height: 46px; border-radius: 50%;
            background: linear-gradient(135deg, #1e1e28, #2a2a3a);
            border: 2px solid rgba(255,255,255,.12);
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; user-select: none; touch-action: none;
            box-shadow: 0 6px 20px rgba(0,0,0,.5);
            transition: transform .15s, background .15s, border-color .15s;
            color: #b8b8d0;
        }
        .fab:hover { transform: scale(1.08); color: #fff; }
        .fab.ativo {
            background: linear-gradient(135deg, #ef4444, #b91c1c);
            border-color: #fca5a5; color: #fff;
            animation: pulse 1.5s ease-in-out infinite;
        }
        .fab.hearing { animation: pulse 1.5s ease-in-out infinite, hear .35s ease-out; }
        @keyframes pulse {
            0%,100% { box-shadow: 0 6px 20px rgba(239,68,68,.4), 0 0 0 0 rgba(239,68,68,.6); }
            50% { box-shadow: 0 6px 20px rgba(239,68,68,.6), 0 0 0 14px rgba(239,68,68,0); }
        }
        @keyframes hear { 0% { transform: scale(1.14); } 100% { transform: scale(1); } }
        .fab svg { width: 22px; height: 22px; pointer-events: none; }

        .nivel {
            position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
            width: 3px; height: 3px; border-radius: 2px; background: #fca5a5;
            opacity: 0; transition: opacity .2s, height .15s;
        }
        .fab.ativo .nivel { opacity: 1; }
        .nivel.pico { height: 11px; }

        .preview {
            position: fixed;
            background: rgba(15,15,20,.96);
            border: 1px solid rgba(139,92,246,.3);
            border-radius: 10px;
            padding: 10px 14px;
            color: #e8e8f0;
            font-size: 13px;
            font-family: -apple-system, system-ui, sans-serif;
            max-width: 460px; min-width: 220px;
            box-shadow: 0 8px 28px rgba(0,0,0,.7), 0 0 18px rgba(139,92,246,.2);
            display: none;
            backdrop-filter: blur(10px);
            z-index: 2147483000;
        }
        .preview.visivel { display: block; }
        .preview-hdr {
            display: flex; align-items: center; gap: 8px;
            font-size: 10px; color: #8b8fa3; margin-bottom: 6px;
            text-transform: uppercase; letter-spacing: .06em; font-weight: 700;
        }
        .preview-hdr .dot { width: 7px; height: 7px; border-radius: 50%; }
        .preview-hdr .dot.interim { background: #f5b942; animation: pulse 1s infinite; }
        .preview-hdr .dot.final   { background: #34d399; }
        .preview-hdr .aviso {
            margin-left: auto; font-size: 9px; font-weight: 700;
            padding: 2px 6px; border-radius: 4px;
            text-transform: none; letter-spacing: 0;
        }
        .preview-hdr .aviso.cmd {
            color: #f5b942; background: rgba(245,185,66,.12);
            border: 1px solid rgba(245,185,66,.3);
        }
        .preview-hdr .aviso.forcar {
            color: #22d3ee; background: rgba(34,211,238,.12);
            border: 1px solid rgba(34,211,238,.3);
        }
        .preview-texto { line-height: 1.4; word-break: break-word; min-height: 1.4em; }
        .preview-texto .interim { color: #8b8fa3; font-style: italic; }
        .preview-acoes {
            display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end;
        }
        .preview-acoes button {
            background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
            color: #e8e8f0; border-radius: 6px; padding: 4px 12px;
            font-size: 11px; cursor: pointer; font-family: inherit; font-weight: 600;
            transition: background .15s;
        }
        .preview-acoes button:hover { background: rgba(255,255,255,.16); }
        .preview-acoes button.primario {
            background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            border-color: transparent;
        }
        .preview-acoes button.primario:hover { filter: brightness(1.15); }

        .popover {
            position: fixed;
            background: rgba(15,15,20,.98);
            border: 1px solid rgba(139,92,246,.25);
            border-radius: 12px;
            padding: 14px;
            color: #e8e8f0;
            font-size: 12px;
            font-family: -apple-system, system-ui, sans-serif;
            width: 270px;
            box-shadow: 0 12px 32px rgba(0,0,0,.8);
            display: none;
            z-index: 2147483001;
        }
        .popover.visivel { display: block; }
        .popover h3 {
            margin: 0 0 12px; font-size: 11px; font-weight: 800;
            text-transform: uppercase; letter-spacing: .08em; color: #a78bfa;
        }
        .campo { margin-bottom: 11px; }
        .campo label {
            display: block; font-size: 9.5px; color: #8b8fa3;
            text-transform: uppercase; letter-spacing: .05em;
            margin-bottom: 4px; font-weight: 700;
        }
        .campo select {
            width: 100%; background: #14141e; border: 1px solid rgba(255,255,255,.12);
            border-radius: 6px; padding: 7px 9px; color: #e8e8f0;
            font-size: 12px; font-family: inherit; outline: none; cursor: pointer;
        }
        .campo select:focus { border-color: #8b5cf6; }
        .ajuda {
            font-size: 10px; color: #8b8fa3; line-height: 1.55;
            border-top: 1px solid rgba(255,255,255,.06);
            padding-top: 10px; margin-top: 12px;
        }
        .ajuda code {
            background: rgba(255,255,255,.06); padding: 1px 4px;
            border-radius: 3px; font-size: 9.5px;
            font-family: ui-monospace, Menlo, Consolas, monospace;
        }
        `;
        root.appendChild(style);

        // ─── FAB ───
        const fab = document.createElement('div');
        fab.className = 'fab';
        fab.title = 'Voz → Chat (Alt+V) · clique direito = opções';
        fab.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span class="nivel"></span>`;
        const pos = {
            left: config.left ?? (window.innerWidth - 66),
            top: config.top ?? (window.innerHeight - 66)
        };
        fab.style.left = Math.max(0, Math.min(window.innerWidth - 56, pos.left)) + 'px';
        fab.style.top = Math.max(0, Math.min(window.innerHeight - 56, pos.top)) + 'px';
        root.appendChild(fab);

        // ─── Preview ───
        const preview = document.createElement('div');
        preview.className = 'preview';
        preview.innerHTML = `
            <div class="preview-hdr">
                <span class="dot final"></span>
                <span>Transcrição</span>
                <span class="aviso" id="aviso"></span>
            </div>
            <div class="preview-texto" id="txt"></div>
            <div class="preview-acoes">
                <button id="cancelar">Cancelar</button>
                <button id="enviar" class="primario">Enviar</button>
            </div>
        `;
        root.appendChild(preview);

        // ─── Popover ───
        const popover = document.createElement('div');
        popover.className = 'popover';
        popover.innerHTML = `
            <h3>Voz → Texto</h3>
            <div class="campo">
                <label>Modo de envio</label>
                <select id="cfgModo">
                    <option value="manual">Manual (Enter/botão)</option>
                    <option value="auto">Automático (pausa)</option>
                </select>
            </div>
            <div class="campo">
                <label>Pausa antes de enviar</label>
                <select id="cfgSilencio">
                    <option value="1800">1,8 segundos</option>
                    <option value="2500">2,5 segundos</option>
                    <option value="3500">3,5 segundos</option>
                    <option value="5000">5 segundos</option>
                </select>
            </div>
            <div class="campo">
                <label>Idioma</label>
                <select id="cfgLang">
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="pt-PT">Português (Portugal)</option>
                    <option value="en-US">English (US)</option>
                    <option value="es-ES">Español</option>
                </select>
            </div>
            <div class="campo">
                <label>Pontuação</label>
                <select id="cfgPontuacao">
                    <option value="off">Nenhuma</option>
                    <option value="pausa">Vírgula nas pausas</option>
                    <option value="groq">Formatar com Groq</option>
                </select>
            </div>
            <div class="ajuda">
                Fale <code>enviar</code> para forçar envio, <code>cancelar</code> para limpar.
                Comandos do hub (<code>abrir iptv</code>, <code>tirar print</code>…) são
                filtrados automaticamente.<br><br>
                Para forçar qualquer texto ao chat, use <code>digitar</code>.
                Ex: <code>digitar enviar</code>.
            </div>
        `;
        root.appendChild(popover);

        const txtEl = preview.querySelector('#txt');
        const avisoEl = preview.querySelector('#aviso');
        const nivelEl = fab.querySelector('.nivel');
        const cfgModo = popover.querySelector('#cfgModo');
        const cfgSilencio = popover.querySelector('#cfgSilencio');
        const cfgLang = popover.querySelector('#cfgLang');
        const cfgPontuacao = popover.querySelector('#cfgPontuacao');

        cfgModo.value = config.modo;
        cfgSilencio.value = String(config.silencioMs);
        cfgLang.value = config.lang;
        cfgPontuacao.value = config.pontuacao;

        // ─── Estado ───
        let rec = null;
        let ativo = false;
        let textoFinal = '';
        let textoInterim = '';
        let ultimoResultadoEm = 0;
        let timerSilencio = null;
        let tentativasRestart = 0;
        let timerRestart = null;
        let enviando = false;
        let enviandoGen = 0;

        // ─── Reconhecimento ───
        function criarRecognition() {
            const r = new SpeechRecognitionAPI();
            r.lang = config.lang;
            r.continuous = true;
            r.interimResults = true;
            r.maxAlternatives = 1;

            r.onstart = () => {
                tentativasRestart = 0;
                ativo = true;
                fab.classList.add('ativo');
            };

            r.onresult = (event) => {
                const agora = Date.now();
                const tevePausa = ultimoResultadoEm &&
                    (agora - ultimoResultadoEm) > config.pausaVirgulaMs;

                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    if (res.isFinal) {
                        const trecho = res[0].transcript.trim();
                        if (!trecho) continue;

                        if (config.pontuacao !== 'off' && tevePausa && textoFinal.trim()
                            && !/[.,!?;:]\s*$/.test(textoFinal.trimEnd())) {
                            textoFinal = textoFinal.trimEnd() + ', ';
                        } else if (textoFinal && !textoFinal.endsWith(' ')) {
                            textoFinal += ' ';
                        }
                        textoFinal += trecho;
                    } else {
                        interim += res[0].transcript;
                    }
                }
                textoInterim = interim;
                ultimoResultadoEm = agora;

                fab.classList.add('hearing');
                nivelEl.classList.add('pico');
                setTimeout(() => {
                    fab.classList.remove('hearing');
                    nivelEl.classList.remove('pico');
                }, 350);

                renderPreview();
                posicionarPreview();
            };

            r.onerror = (e) => {
                const tipo = e.error;
                if (tipo === 'no-speech' || tipo === 'aborted') return;
                if (tipo === 'not-allowed' || tipo === 'service-not-allowed') {
                    console.warn('[Voz] Permissão de microfone negada.');
                    desligar();
                    return;
                }
                if (tipo === 'network') {
                    console.warn('[Voz] Erro de rede — vai tentar reconectar.');
                    return;
                }
                console.warn('[Voz] Erro:', tipo);
            };

            r.onend = () => {
                if (!ativo) { fab.classList.remove('ativo'); return; }
                tentativasRestart++;
                if (tentativasRestart > 8) {
                    console.warn('[Voz] Muitas falhas seguidas — desativando.');
                    desligar();
                    return;
                }
                const espera = Math.min(30000, 1000 * Math.pow(2, tentativasRestart - 1));
                if (timerRestart) clearTimeout(timerRestart);
                timerRestart = setTimeout(() => {
                    if (!ativo || !rec) return;
                    try { rec.start(); } catch {}
                }, espera);
            };

            return r;
        }

        // ─── Controle ───
        function ligar() {
            if (ativo) return;
            textoFinal = '';
            textoInterim = '';
            ultimoResultadoEm = 0;
            tentativasRestart = 0;
            ativo = true;
            rec = criarRecognition();
            try { rec.start(); }
            catch (e) {
                console.error('[Voz] Falha ao iniciar:', e);
                ativo = false;
                rec = null;
                return;
            }
            fab.classList.add('ativo');
            iniciarTimerSilencio();
        }

        function desligar() {
            enviandoGen++;
            ativo = false;
            if (timerRestart) { clearTimeout(timerRestart); timerRestart = null; }
            if (rec) {
                try { rec.onend = null; rec.stop(); } catch {}
                rec = null;
            }
            pararTimerSilencio();
            fab.classList.remove('ativo', 'hearing');
            nivelEl.classList.remove('pico');
            textoFinal = '';
            textoInterim = '';
            renderPreview();
            preview.classList.remove('visivel');
        }

        function toggle() { if (ativo) desligar(); else ligar(); }

        // ─── Timer de silêncio ───
        function iniciarTimerSilencio() {
            if (timerSilencio) return;
            timerSilencio = setInterval(() => {
                if (!ativo || config.modo !== 'auto') return;
                const t = (textoFinal + textoInterim).trim();
                if (!t || t.length < config.minChars) return;
                if (terminaComConector(t)) return;
                if (Date.now() - ultimoResultadoEm >= config.silencioMs) enviar(false);
            }, 220);
        }
        function pararTimerSilencio() {
            if (timerSilencio) { clearInterval(timerSilencio); timerSilencio = null; }
        }

        const CONECTORES = new Set([
            'e','ou','mas','que','porque','pois','entao','então','tambem','também',
            'ainda','ja','já','se','quando','como','para','pra','de','do','da',
            'no','na','em','com','sem','por','ao','aos','as','às','os','um','uma','uns','umas'
        ]);
        function terminaComConector(t) {
            const p = normalize(t).split(/\s+/);
            return CONECTORES.has(p[p.length - 1]);
        }

        // ─── Preview ───
        function renderPreview() {
            const completo = (textoFinal + textoInterim).trim();
            if (!completo || !ativo) {
                preview.classList.remove('visivel');
                avisoEl.textContent = '';
                avisoEl.className = 'aviso';
                return;
            }
            txtEl.innerHTML = escapeHtml(textoFinal) +
                (textoInterim ? `<span class="interim">${escapeHtml(textoInterim)}</span>` : '');
            preview.querySelector('.dot').className = 'dot ' + (textoInterim ? 'interim' : 'final');

            const forcar = window._voiceCommands.extrairForcarChat(completo);
            if (forcar) {
                avisoEl.textContent = '→ vai pro chat';
                avisoEl.className = 'aviso forcar';
            } else if (window._voiceCommands.tem(completo)) {
                avisoEl.textContent = '⚠ comando reservado';
                avisoEl.className = 'aviso cmd';
            } else {
                avisoEl.textContent = '';
                avisoEl.className = 'aviso';
            }

            preview.classList.add('visivel');
        }

        function posicionarPreview() {
            const inp = encontrarInputChat();
            let left, top;
            if (inp) {
                const r = inp.getBoundingClientRect();
                left = Math.max(10, r.left);
                top = Math.max(10, r.top - 130);
            } else {
                left = window.innerWidth / 2 - 230;
                top = window.innerHeight - 240;
            }
            preview.style.left = Math.min(left, window.innerWidth - 470) + 'px';
            preview.style.top = Math.min(top, window.innerHeight - 140) + 'px';
        }

        // ─── Formatação via Groq ───
        async function formatarComGroq(texto) {
            if (!window._apis?.groq || !window._apis.getKey?.('groq')) return texto;
            try {
                const r = await window._apis.groq({
                    prompt:
                        'Reescreva o texto abaixo corrigindo ortografia e adicionando pontuação ' +
                        '(vírgulas, pontos, interrogações quando fizer sentido). Não mude o sentido, ' +
                        'não adicione conteúdo novo, mantenha o tom informal. Responda apenas com o ' +
                        'texto corrigido, sem aspas nem comentários.\n\n' + texto,
                    maxTokens: 400,
                    temperature: 0.2
                });
                return (r && r.trim()) ? r.trim().replace(/^["']|["']$/g, '') : texto;
            } catch (e) {
                console.warn('[Voz] Formatação Groq falhou:', e);
                return texto;
            }
        }

        // ─── Envio ───
        async function enviar(forcado) {
            if (enviando) return;

            let texto = (textoFinal + textoInterim).trim();
            if (texto.length < config.minChars) return;

            const forcarPrefixo = window._voiceCommands.extrairForcarChat(texto);
            if (forcarPrefixo) {
                texto = forcarPrefixo;
            } else if (!forcado) {
                const acao = window._voiceCommands.acaoLocal(texto);
                if (acao === 'enviar') {
                    textoFinal = ''; textoInterim = ''; ultimoResultadoEm = 0;
                    renderPreview(); return;
                }
                if (acao === 'cancelar') { cancelar(); return; }
                if (window._voiceCommands.tem(texto)) {
                    console.log('[Voz] Comando reservado filtrado:', texto);
                    textoFinal = ''; textoInterim = ''; ultimoResultadoEm = 0;
                    renderPreview(); return;
                }
            }

            enviando = true;
            const gen = ++enviandoGen;

            try {
                if (config.pontuacao === 'groq' && !forcarPrefixo) {
                    avisoEl.textContent = '✨ formatando…';
                    avisoEl.className = 'aviso forcar';
                    const formatado = await formatarComGroq(texto);
                    if (gen !== enviandoGen) return;
                    if (formatado && formatado !== texto) {
                        texto = formatado;
                        textoFinal = formatado;
                        textoInterim = '';
                        renderPreview();
                    }
                }

                for (let tentativa = 0; tentativa < 3; tentativa++) {
                    if (gen !== enviandoGen) return;

                    const inp = encontrarInputChat();
                    if (inp) {
                        const maxLen = inp.getAttribute('maxlength')
                            ? parseInt(inp.getAttribute('maxlength'), 10) : 200;
                        let final = texto.length > maxLen ? texto.slice(0, maxLen) : texto;

                        if (inp.value && inp.value.trim()) {
                            const combinado = inp.value.trim() + ' ' + final;
                            final = combinado.length > maxLen
                                ? combinado.slice(-maxLen) : combinado;
                        }

                        setInputValue(inp, final);
                        inp.focus();
                        setTimeout(() => pressEnter(inp), 80);

                        textoFinal = ''; textoInterim = ''; ultimoResultadoEm = 0;
                        renderPreview();
                        return;
                    }
                    await new Promise(r => setTimeout(r, 800));
                }

                avisoEl.textContent = '⚠ chat não encontrado';
                avisoEl.className = 'aviso cmd';
            } finally {
                enviando = false;
            }
        }

        function cancelar() {
            enviandoGen++;
            textoFinal = '';
            textoInterim = '';
            ultimoResultadoEm = 0;
            renderPreview();
        }

        // ─── Eventos preview ───
        preview.querySelector('#enviar').addEventListener('click', e => {
            e.stopPropagation();
            enviar(true);
        });
        preview.querySelector('#cancelar').addEventListener('click', e => {
            e.stopPropagation();
            cancelar();
        });

        // ─── FAB ───
        let fabDrag = null, fabMoved = false;
        fab.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            fabDrag = {
                sx: e.clientX, sy: e.clientY,
                left: parseInt(fab.style.left, 10),
                top: parseInt(fab.style.top, 10)
            };
            fabMoved = false;
            try { fab.setPointerCapture(e.pointerId); } catch {}
        });
        fab.addEventListener('pointermove', e => {
            if (!fabDrag) return;
            const dx = e.clientX - fabDrag.sx;
            const dy = e.clientY - fabDrag.sy;
            if (!fabMoved && Math.hypot(dx, dy) < 4) return;
            fabMoved = true;
            fab.style.left = Math.max(0, Math.min(window.innerWidth - 56, fabDrag.left + dx)) + 'px';
            fab.style.top = Math.max(0, Math.min(window.innerHeight - 56, fabDrag.top + dy)) + 'px';
        });
        fab.addEventListener('pointerup', e => {
            if (!fabDrag) return;
            try { fab.releasePointerCapture(e.pointerId); } catch {}
            if (!fabMoved) toggle();
            else {
                config.left = parseInt(fab.style.left, 10);
                config.top = parseInt(fab.style.top, 10);
                saveConfig(config);
            }
            fabDrag = null;
        });
        fab.addEventListener('contextmenu', e => {
            e.preventDefault();
            const r = fab.getBoundingClientRect();
            popover.style.left = Math.max(10, Math.min(r.left - 280, window.innerWidth - 290)) + 'px';
            popover.style.top = Math.min(r.top, window.innerHeight - 420) + 'px';
            popover.classList.toggle('visivel');
        });

        // ─── Config ───
        cfgModo.addEventListener('change', () => { config.modo = cfgModo.value; saveConfig(config); });
        cfgSilencio.addEventListener('change', () => { config.silencioMs = parseInt(cfgSilencio.value, 10); saveConfig(config); });
        cfgLang.addEventListener('change', () => {
            config.lang = cfgLang.value;
            saveConfig(config);
            if (ativo) { desligar(); setTimeout(ligar, 300); }
        });
        cfgPontuacao.addEventListener('change', () => {
            config.pontuacao = cfgPontuacao.value;
            saveConfig(config);
        });

        // ─── Popover fecha ao clicar fora ───
        function fecharPopoverFora(e) {
            if (!popover.classList.contains('visivel')) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (path.includes(popover) || path.includes(fab)) return;
            popover.classList.remove('visivel');
        }
        document.addEventListener('pointerdown', fecharPopoverFora, true);

        // ─── Hotkeys ───
        const estaDigitando = () => {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
        };

        function onKeydown(e) {
            if (e.altKey && e.key.toLowerCase() === 'v' && !estaDigitando()) {
                e.preventDefault(); e.stopPropagation(); toggle(); return;
            }
            if (e.key === 'Escape' && ativo && (textoFinal || textoInterim)) {
                cancelar(); return;
            }
            if (e.key === 'Enter' && ativo && config.modo === 'manual'
                && (textoFinal || textoInterim) && !estaDigitando()) {
                e.preventDefault(); e.stopPropagation(); enviar(true);
            }
        }
        document.addEventListener('keydown', onKeydown, true);

        // ─── Resize ───
        function onResize() {
            const l = parseInt(fab.style.left, 10);
            const t = parseInt(fab.style.top, 10);
            fab.style.left = Math.max(0, Math.min(window.innerWidth - 56, l)) + 'px';
            fab.style.top = Math.max(0, Math.min(window.innerHeight - 56, t)) + 'px';
            if (preview.classList.contains('visivel')) posicionarPreview();
        }
        window.addEventListener('resize', onResize);

        // ─── API ───
        window[UID] = {
            kill() {
                desligar();
                document.removeEventListener('keydown', onKeydown, true);
                document.removeEventListener('pointerdown', fecharPopoverFora, true);
                window.removeEventListener('resize', onResize);
                if (timerRestart) clearTimeout(timerRestart);
                if (timerSilencio) clearInterval(timerSilencio);
                host.remove();
                delete window[UID];
            },
            show() { fab.style.display = 'flex'; },
            hide() { fab.style.display = 'none'; },
            toggle,
            get ativo() { return ativo; }
        };
    }

    if (document.body) init();
    else new MutationObserver((_, o) => {
        if (document.body) { o.disconnect(); init(); }
    }).observe(document.documentElement, { childList: true });
})();
