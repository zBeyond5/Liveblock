// modules/voz.js — fala vira texto no chat do Habbo
// v3: comandos ancorados (só match exato), prefixo "digitar" para forçar
// texto ao chat, backoff de reconexão, feedback de escuta, limpeza total
// no kill, modo manual como default, detector de frases cortadas.
(function() {
    'use strict';
    const UID = '_voz';
    if (window[UID]) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
        console.warn('[Voz] Web Speech API não suportada neste navegador.');
        return;
    }

    const STATE_KEY = 'sang_voz_state';
    const DEFAULT_CONFIG = {
        modo: 'manual',
        silencioMs: 2500,
        minChars: 2,
        lang: 'pt-BR',
        left: null,
        top: null
    };

    // ─── Persistência ───
    function loadConfig() {
        try {
            const raw = localStorage.getItem(STATE_KEY);
            return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
        } catch (_) { return { ...DEFAULT_CONFIG }; }
    }
    function saveConfig(c) {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(c)); } catch (_) {}
    }

    // ─── Utilidades ───
    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function normalize(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    // ═══════════════════════════════════════════════════════════════
    // COMANDOS
    // ═══════════════════════════════════════════════════════════════

    // Prefixo para forçar QUALQUER texto a ir ao chat, mesmo sendo comando.
    // Uso: "digitar enviar" → chat recebe "enviar"
    const PREFIXO_FORCAR_CHAT = /^(ditar|digitar|escrever|escreve|falar|fala)\s+(.+)$/i;

    // Comandos consumidos pelo PRÓPRIO módulo (não vão pro chat, não acionam outros)
    const COMANDOS_VOZ = [
        {
            re: /^(enviar?|envia|mandar?|manda|manda\s+isso|manda\s+essa|envia\s+isso|envia\s+essa|pode\s+enviar|pode\s+mandar)$/,
            acao: 'enviar'
        },
        {
            re: /^(cancelar?|cancela|apagar?|apaga|limpar?|limpa|limpa\s+isso|apaga\s+isso|descarta(r)?|descarta|deixa\s+pra\s+la|deixa\s+pra\s+lá)$/,
            acao: 'cancelar'
        }
    ];

    // Comandos pertencentes a OUTROS módulos. Se casarem, o texto é
    // silenciosamente descartado — o hub/módulo correspondente age.
    // Todos ancorados (^...$) para não capturar frases longas por engano.
    const COMANDOS_RESERVADOS = [
        // Hub: abrir/fechar módulos
        /^(abrir?|abre|abra|ativar?|ativa|ligar?|liga|iniciar?|inicia|fechar?|feche|fecha|desativar?|desativa|desligar?|desliga|parar?|para)\s+(o\s+|a\s+|os\s+|as\s+)?(menu|iptv|tv|youtube|yt|packet|blocklive|liveblock|adblock|bloqueador|booster|jogos|games|gameslive|photoswap|fotoswap|foto|prozilla|galeria|voz|chat|groq|gemini)$/,
        /^(mostrar?|mostra|esconder?|esconde|abrir?|abre|fechar?|fecha)\s+menu$/,
        /^menu$/,
        /^(modo\s+)?(voz|microfone|mic)$/,

        // Print / captura
        /^(tirar?|tira)\s+print$/,
        /^(capturar?|captura)\s+(a\s+)?tela$/,
        /^print$/,
        /^(salvar?|salva)\s+(na\s+pasta|solto|solta)$/,

        // Notas
        /^(criar?|cria|nova?|novo)\s+(anotacao|anotação|nota)$/,
        /^(salvar?|salva)\s+nota$/,
        /^(concluir?|conclui|finalizar?|finaliza)(\s+(nota|anotacao|anotação))?$/,
        /^anotacao$/,
        /^anotação$/,
        /^nota$/,

        // Genéricos
        /^(fechar?|fecha|confirmar?|confirma|voltar?|volta)(\s+(isso|tudo|janela|painel))?$/
    ];

    // Registro compartilhado — outros módulos podem adicionar padrões
    window._voiceCommands = window._voiceCommands || {
        _extras: [],
        adicionar(re) {
            if (re instanceof RegExp) this._extras.push(re);
        },
        tem(texto) {
            const n = normalize(texto);
            return COMANDOS_RESERVADOS.some(r => r.test(n))
                || this._extras.some(r => r.test(n));
        },
        acaoLocal(texto) {
            const n = normalize(texto);
            for (const cmd of COMANDOS_VOZ) {
                if (cmd.re.test(n)) return cmd.acao;
            }
            return null;
        },
        extrairForcarChat(texto) {
            const m = String(texto || '').match(PREFIXO_FORCAR_CHAT);
            return m ? m[2].trim() : null;
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // CHAT DO JOGO
    // ═══════════════════════════════════════════════════════════════

    function encontrarInputChat() {
        const candidatos = [
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
        for (const sel of candidatos) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
        }
        const inputs = [...document.querySelectorAll('input[type="text"], textarea')];
        return inputs.find(el => {
            const r = el.getBoundingClientRect();
            return r.top > window.innerHeight * 0.65 && el.offsetParent !== null;
        }) || null;
    }

    // React-safe: dispara setter nativo + eventos sintéticos
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
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, texto);
        else el.value = texto;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function pressEnter(el) {
        const opts = {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true
        };
        el.dispatchEvent(new KeyboardEvent('keydown', opts));
        el.dispatchEvent(new KeyboardEvent('keypress', opts));
        el.dispatchEvent(new KeyboardEvent('keyup', opts));
    }

    // ═══════════════════════════════════════════════════════════════
    // MÓDULO
    // ═══════════════════════════════════════════════════════════════

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
        .campo:last-of-type { margin-bottom: 0; }
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
        const posIni = {
            left: config.left ?? (window.innerWidth - 66),
            top: config.top ?? (window.innerHeight - 66)
        };
        fab.style.left = Math.max(0, Math.min(window.innerWidth - 56, posIni.left)) + 'px';
        fab.style.top = Math.max(0, Math.min(window.innerHeight - 56, posIni.top)) + 'px';
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
            <div class="ajuda">
                Fale <code>enviar</code> para forçar envio, <code>cancelar</code> para limpar.
                Se um texto bater exatamente com um comando do hub
                (<code>abrir iptv</code>, <code>tirar print</code>…), ele é filtrado
                e o outro módulo age.<br><br>
                Para forçar qualquer texto ao chat, use o prefixo
                <code>digitar</code>. Ex: <code>digitar enviar</code>.
            </div>
        `;
        root.appendChild(popover);

        const txtEl = preview.querySelector('#txt');
        const avisoEl = preview.querySelector('#aviso');
        const btnCancelar = preview.querySelector('#cancelar');
        const btnEnviar = preview.querySelector('#enviar');
        const nivelEl = fab.querySelector('.nivel');
        const cfgModo = popover.querySelector('#cfgModo');
        const cfgSilencio = popover.querySelector('#cfgSilencio');
        const cfgLang = popover.querySelector('#cfgLang');

        cfgModo.value = config.modo;
        cfgSilencio.value = String(config.silencioMs);
        cfgLang.value = config.lang;

        // ─── Estado ───
        let reconhecimento = null;
        let ativo = false;
        let textoFinal = '';
        let textoInterim = '';
        let ultimoResultadoEm = 0;
        let timerSilencio = null;
        let tentativasRestart = 0;
        let timerRestart = null;

        // ═══ Reconhecimento ═══
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
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    if (res.isFinal) textoFinal += res[0].transcript;
                    else interim += res[0].transcript;
                }
                textoInterim = interim;
                ultimoResultadoEm = Date.now();

                // Feedback visual
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
                if (!ativo) {
                    fab.classList.remove('ativo');
                    return;
                }
                tentativasRestart++;
                if (tentativasRestart > 8) {
                    console.warn('[Voz] Muitas falhas seguidas — desativando.');
                    desligar();
                    return;
                }
                const espera = Math.min(30000, 1000 * Math.pow(2, tentativasRestart - 1));
                if (timerRestart) clearTimeout(timerRestart);
                timerRestart = setTimeout(() => {
                    if (!ativo || !reconhecimento) return;
                    try { reconhecimento.start(); } catch (_) {}
                }, espera);
            };

            return r;
        }

        // ═══ Controle ═══
        function ligar() {
            if (ativo) return;
            textoFinal = '';
            textoInterim = '';
            ultimoResultadoEm = 0;
            tentativasRestart = 0;
            ativo = true;
            reconhecimento = criarRecognition();
            try {
                reconhecimento.start();
            } catch (e) {
                console.error('[Voz] Falha ao iniciar:', e);
                ativo = false;
                reconhecimento = null;
                return;
            }
            fab.classList.add('ativo');
            iniciarTimerSilencio();
        }

        function desligar() {
            ativo = false;
            if (timerRestart) { clearTimeout(timerRestart); timerRestart = null; }
            if (reconhecimento) {
                try {
                    reconhecimento.onend = null;
                    reconhecimento.stop();
                } catch (_) {}
                reconhecimento = null;
            }
            pararTimerSilencio();
            fab.classList.remove('ativo');
            fab.classList.remove('hearing');
            nivelEl.classList.remove('pico');
            textoFinal = '';
            textoInterim = '';
            renderPreview();
            preview.classList.remove('visivel');
        }

        function toggle() {
            if (ativo) desligar(); else ligar();
        }

        // ═══ Timer de silêncio (auto) ═══
        function iniciarTimerSilencio() {
            if (timerSilencio) return;
            timerSilencio = setInterval(() => {
                if (!ativo || config.modo !== 'auto') return;
                const texto = (textoFinal + textoInterim).trim();
                if (!texto || texto.length < config.minChars) return;
                if (terminaComConector(texto)) return;
                if (Date.now() - ultimoResultadoEm >= config.silencioMs) enviar(false);
            }, 220);
        }
        function pararTimerSilencio() {
            if (timerSilencio) { clearInterval(timerSilencio); timerSilencio = null; }
        }

        // Evita envio de frase cortada no meio
        const CONECTORES = new Set([
            'e', 'ou', 'mas', 'que', 'porque', 'pois', 'entao', 'então',
            'tambem', 'também', 'ainda', 'ja', 'já', 'se', 'quando', 'como',
            'para', 'pra', 'de', 'do', 'da', 'no', 'na', 'em', 'com', 'sem',
            'por', 'ao', 'aos', 'as', 'às', 'os', 'um', 'uma', 'uns', 'umas'
        ]);
        function terminaComConector(texto) {
            const palavras = normalize(texto).split(/\s+/);
            const ultima = palavras[palavras.length - 1];
            return CONECTORES.has(ultima);
        }

        // ═══ Render do preview ═══
        function renderPreview() {
            const textoCompleto = (textoFinal + textoInterim).trim();
            if (!textoCompleto || !ativo) {
                preview.classList.remove('visivel');
                avisoEl.textContent = '';
                avisoEl.className = 'aviso';
                return;
            }

            txtEl.innerHTML = escapeHtml(textoFinal) +
                (textoInterim ? `<span class="interim">${escapeHtml(textoInterim)}</span>` : '');
            const dot = preview.querySelector('.dot');
            dot.className = 'dot ' + (textoInterim ? 'interim' : 'final');

            // Aviso dinâmico
            const forcar = window._voiceCommands.extrairForcarChat(textoCompleto);
            if (forcar) {
                avisoEl.textContent = '→ vai pro chat';
                avisoEl.className = 'aviso forcar';
            } else if (window._voiceCommands.tem(textoCompleto)) {
                avisoEl.textContent = '⚠ comando reservado';
                avisoEl.className = 'aviso cmd';
            } else {
                avisoEl.textContent = '';
                avisoEl.className = 'aviso';
            }

            preview.classList.add('visivel');
        }

        function posicionarPreview() {
            const inputAlvo = encontrarInputChat();
            let left, top;
            if (inputAlvo) {
                const r = inputAlvo.getBoundingClientRect();
                left = Math.max(10, r.left);
                top = Math.max(10, r.top - 130);
            } else {
                left = window.innerWidth / 2 - 230;
                top = window.innerHeight - 240;
            }
            preview.style.left = Math.min(left, window.innerWidth - 470) + 'px';
            preview.style.top = Math.min(top, window.innerHeight - 140) + 'px';
        }

        // ═══ Envio ═══
        let tentativasEnvio = 0;

        function enviar(forcado) {
            if (tentativasEnvio >= 3) {
                tentativasEnvio = 0;
                console.warn('[Voz] Input do chat não apareceu após 3 tentativas.');
                avisoEl.textContent = '⚠ chat não encontrado';
                avisoEl.className = 'aviso cmd';
                return;
            }

            let texto = (textoFinal + textoInterim).trim();
            if (texto.length < config.minChars) return;

            // Prefixo "digitar X" força X ao chat, ignorando o filtro de comandos
            const forcar = window._voiceCommands.extrairForcarChat(texto);
            if (forcar) {
                texto = forcar;
            } else if (!forcado) {
                // Comando local do módulo?
                const acaoLocal = window._voiceCommands.acaoLocal(texto);
                if (acaoLocal === 'enviar') {
                    // Não é o caso — estamos já dentro de enviar. Só limpa e sai.
                    textoFinal = '';
                    textoInterim = '';
                    ultimoResultadoEm = 0;
                    renderPreview();
                    return;
                }
                if (acaoLocal === 'cancelar') {
                    cancelar();
                    return;
                }
                // Comando reservado de outro módulo?
                if (window._voiceCommands.tem(texto)) {
                    console.log('[Voz] Comando reservado filtrado:', texto);
                    textoFinal = '';
                    textoInterim = '';
                    ultimoResultadoEm = 0;
                    renderPreview();
                    return;
                }
            }

            const inputAlvo = encontrarInputChat();
            if (!inputAlvo) {
                tentativasEnvio++;
                setTimeout(() => enviar(forcado), 800);
                return;
            }
            tentativasEnvio = 0;

            // Respeita maxlength
            const maxLen = inputAlvo.getAttribute('maxlength')
                ? parseInt(inputAlvo.getAttribute('maxlength'), 10)
                : 200;
            if (texto.length > maxLen) texto = texto.slice(0, maxLen);

            // Não sobrescreve o que o usuário já estava digitando
            if (inputAlvo.value && inputAlvo.value.trim()) {
                const atual = inputAlvo.value.trim();
                const combinado = atual + ' ' + texto;
                texto = combinado.length > maxLen
                    ? combinado.slice(-maxLen)
                    : combinado;
            }

            setInputValue(inputAlvo, texto);
            inputAlvo.focus();
            setTimeout(() => pressEnter(inputAlvo), 80);

            textoFinal = '';
            textoInterim = '';
            ultimoResultadoEm = 0;
            renderPreview();
        }

        function cancelar() {
            textoFinal = '';
            textoInterim = '';
            ultimoResultadoEm = 0;
            tentativasEnvio = 0;
            renderPreview();
        }

        // ═══ Eventos do preview ═══
        btnEnviar.addEventListener('click', (e) => {
            e.stopPropagation();
            enviar(true);
        });
        btnCancelar.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelar();
        });

        // ═══ Eventos do FAB ═══
        let fabDrag = null, fabMoved = false;
        fab.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            fabDrag = {
                sx: e.clientX, sy: e.clientY,
                left: parseInt(fab.style.left, 10),
                top: parseInt(fab.style.top, 10)
            };
            fabMoved = false;
            try { fab.setPointerCapture(e.pointerId); } catch (_) {}
        });
        fab.addEventListener('pointermove', (e) => {
            if (!fabDrag) return;
            const dx = e.clientX - fabDrag.sx;
            const dy = e.clientY - fabDrag.sy;
            if (!fabMoved && Math.hypot(dx, dy) < 4) return;
            fabMoved = true;
            const nl = Math.max(0, Math.min(window.innerWidth - 56, fabDrag.left + dx));
            const nt = Math.max(0, Math.min(window.innerHeight - 56, fabDrag.top + dy));
            fab.style.left = nl + 'px';
            fab.style.top = nt + 'px';
        });
        fab.addEventListener('pointerup', (e) => {
            if (!fabDrag) return;
            try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
            if (!fabMoved) {
                toggle();
            } else {
                config.left = parseInt(fab.style.left, 10);
                config.top = parseInt(fab.style.top, 10);
                saveConfig(config);
            }
            fabDrag = null;
        });

        fab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const r = fab.getBoundingClientRect();
            popover.style.left = Math.max(10, Math.min(r.left - 280, window.innerWidth - 290)) + 'px';
            popover.style.top = Math.min(r.top, window.innerHeight - 360) + 'px';
            popover.classList.toggle('visivel');
        });

        // ═══ Config ═══
        cfgModo.addEventListener('change', () => {
            config.modo = cfgModo.value;
            saveConfig(config);
        });
        cfgSilencio.addEventListener('change', () => {
            config.silencioMs = parseInt(cfgSilencio.value, 10);
            saveConfig(config);
        });
        cfgLang.addEventListener('change', () => {
            config.lang = cfgLang.value;
            saveConfig(config);
            if (ativo) {
                desligar();
                setTimeout(ligar, 300);
            }
        });

        // ═══ Fecha popover ao clicar fora ═══
        function fecharPopoverAoClicarFora(e) {
            if (!popover.classList.contains('visivel')) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (path.includes(popover) || path.includes(fab)) return;
            popover.classList.remove('visivel');
        }
        document.addEventListener('pointerdown', fecharPopoverAoClicarFora, true);

        // ═══ Hotkeys ═══
        function estaDigitandoEmInput() {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
        }

        function onKeydown(e) {
            // Alt+V — toggle. Não dispara dentro de input
            if (e.altKey && e.key.toLowerCase() === 'v' && !estaDigitandoEmInput()) {
                e.preventDefault();
                e.stopPropagation();
                toggle();
                return;
            }
            // Escape — cancela o buffer (sem preventDefault, deixa o jogo processar)
            if (e.key === 'Escape' && ativo && (textoFinal || textoInterim)) {
                cancelar();
                return;
            }
            // Enter no modo manual — envia, mas só se não estiver digitando
            if (e.key === 'Enter' && ativo && config.modo === 'manual'
                && (textoFinal || textoInterim) && !estaDigitandoEmInput()) {
                e.preventDefault();
                e.stopPropagation();
                enviar(true);
            }
        }
        document.addEventListener('keydown', onKeydown, true);

        // ═══ Resize ═══
        function onWindowResize() {
            const l = parseInt(fab.style.left, 10);
            const t = parseInt(fab.style.top, 10);
            fab.style.left = Math.max(0, Math.min(window.innerWidth - 56, l)) + 'px';
            fab.style.top = Math.max(0, Math.min(window.innerHeight - 56, t)) + 'px';
            if (preview.classList.contains('visivel')) posicionarPreview();
        }
        window.addEventListener('resize', onWindowResize);

        // ═══ API pública ═══
        window[UID] = {
            kill() {
                desligar();
                document.removeEventListener('keydown', onKeydown, true);
                document.removeEventListener('pointerdown', fecharPopoverAoClicarFora, true);
                window.removeEventListener('resize', onWindowResize);
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
    else new MutationObserver((_, obs) => {
        if (document.body) { obs.disconnect(); init(); }
    }).observe(document.documentElement, { childList: true });
})();
