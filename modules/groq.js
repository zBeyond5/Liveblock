(function() {
    'use strict';
    const UID = '_groq';
    if (window[UID]) return;

    const GEOM_KEY  = 'sang_panel_groq_state';
    const MODEL_KEY = 'sang_groq_model';
    const MIN_W = 420, MIN_H = 480;
    const KEYS_URL = 'https://console.groq.com/keys';

    const MODELOS = [
        { id: 'openai/gpt-oss-120b', nome: 'SangMax', tag: 'inteligente' },
        { id: 'openai/gpt-oss-20b',  nome: 'Standard',  tag: 'equilibrado' },
    ];

    const loadGeom = () => {
        try {
            const s = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null');
            if (s && typeof s.left === 'number') return s;
        } catch (_) {}
        return null;
    };
    const loadModel = () => {
        try { return localStorage.getItem(MODEL_KEY) || MODELOS[0].id; }
        catch (_) { return MODELOS[0].id; }
    };
    const saveModel = id => { try { localStorage.setItem(MODEL_KEY, id); } catch (_) {} };

    const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    // ─── Markdown ───
    function mdInline(t) {
        return t
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
            .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>')
            .replace(/~~([^~]+)~~/g, '<del>$1</del>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }

    function mdTable(linhas) {
        const cells = linhas.map(l => {
            let s = l.trim();
            if (s.startsWith('|')) s = s.slice(1);
            if (s.endsWith('|')) s = s.slice(0, -1);
            return s.split('|').map(c => c.trim());
        });
        if (cells.length < 2) return '';
        const header = cells[0];
        const body = cells.slice(2);
        let html = '<table><thead><tr>';
        header.forEach(h => { html += `<th>${mdInline(h)}</th>`; });
        html += '</tr></thead><tbody>';
        body.forEach(row => {
            html += '<tr>';
            row.forEach(c => { html += `<td>${mdInline(c)}</td>`; });
            html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    function mdRender(texto) {
        let t = escapeHtml(texto);

        // Fenced code blocks → placeholder
        const codeBlocks = [];
        t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const id = `\u0000CB${codeBlocks.length}\u0000`;
            codeBlocks.push({ lang, code: code.replace(/\n$/, '') });
            return id;
        });

        const linhas = t.split('\n');
        const out = [];
        const lista = [];

        const fecharListas = () => {
            while (lista.length) out.push(`</${lista.pop()}>`);
        };

        let i = 0;
        while (i < linhas.length) {
            const linha = linhas[i];

            // Code block placeholder
            const cb = linha.match(/^\u0000CB(\d+)\u0000$/);
            if (cb) {
                fecharListas();
                const bloco = codeBlocks[+cb[1]];
                const langAttr = bloco.lang ? ` data-lang="${escapeHtml(bloco.lang)}"` : '';
                out.push(`<pre${langAttr}><code>${bloco.code}</code></pre>`);
                i++; continue;
            }

            // Header
            const h = linha.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (h) {
                fecharListas();
                const n = h[1].length;
                out.push(`<h${n}>${mdInline(h[2])}</h${n}>`);
                i++; continue;
            }

            // HR
            if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(linha)) {
                fecharListas();
                out.push('<hr>');
                i++; continue;
            }

            // Table
            if (linha.includes('|') && linhas[i + 1] && /^\s*\|?\s*:?-+:?/.test(linhas[i + 1])) {
                fecharListas();
                const bloco = [];
                while (i < linhas.length && linhas[i].includes('|')) {
                    bloco.push(linhas[i]);
                    i++;
                }
                out.push(mdTable(bloco));
                continue;
            }

            // Unordered list
            const ul = linha.match(/^\s*[-*+]\s+(.+)$/);
            if (ul) {
                if (lista[lista.length - 1] !== 'ul') {
                    fecharListas();
                    out.push('<ul>');
                    lista.push('ul');
                }
                out.push(`<li>${mdInline(ul[1])}</li>`);
                i++; continue;
            }

            // Ordered list
            const ol = linha.match(/^\s*\d+\.\s+(.+)$/);
            if (ol) {
                if (lista[lista.length - 1] !== 'ol') {
                    fecharListas();
                    out.push('<ol>');
                    lista.push('ol');
                }
                out.push(`<li>${mdInline(ol[1])}</li>`);
                i++; continue;
            }

            // Blockquote
            const bq = linha.match(/^\s*>\s?(.*)$/);
            if (bq) {
                fecharListas();
                out.push(`<blockquote>${mdInline(bq[1])}</blockquote>`);
                i++; continue;
            }

            // Blank
            if (!linha.trim()) {
                fecharListas();
                i++; continue;
            }

            // Paragraph
            fecharListas();
            out.push(`<p>${mdInline(linha)}</p>`);
            i++;
        }
        fecharListas();
        return out.join('');
    }

    // ─── Init ───
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
            background: linear-gradient(175deg, #16121f 0%, #0b0912 100%);
            border: 1px solid rgba(167,139,250,.22);
            border-radius: 16px; overflow: hidden;
            box-shadow: 0 24px 60px rgba(0,0,0,.75), 0 0 40px rgba(139,92,246,.06);
        }

        /* ─── Header ─── */
        .hdr {
            height: 46px; flex-shrink: 0; display: flex; align-items: center;
            justify-content: space-between; padding: 0 14px;
            cursor: grab; user-select: none; touch-action: none;
            border-bottom: 1px solid rgba(167,139,250,.12);
            background: linear-gradient(180deg, #1d1730, #110e1c);
            position: relative;
        }
        .hdr::after {
            content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(167,139,250,.35), transparent);
        }
        .hdr.dragging { cursor: grabbing; }
        .brand { display: flex; align-items: center; gap: 9px; }
        .dot {
            width: 9px; height: 9px; border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, #c4b5fd, #8b5cf6);
            box-shadow: 0 0 12px #8b5cf6, 0 0 22px rgba(139,92,246,.4);
            animation: breathe 2.6s ease-in-out infinite;
        }
        @keyframes breathe {
            0%,100% { box-shadow: 0 0 12px #8b5cf6, 0 0 22px rgba(139,92,246,.4); }
            50%     { box-shadow: 0 0 16px #a78bfa, 0 0 30px rgba(167,139,250,.6); }
        }
        .title {
            font-weight: 800; font-size: 12.5px; letter-spacing: .16em;
            color: #e8e0f5; font-family: "Courier New", monospace; text-transform: uppercase;
        }
        .actions { display: flex; gap: 5px; }
        .btn {
            width: 28px; height: 28px; border-radius: 8px;
            background: rgba(167,139,250,.08); border: 1px solid rgba(167,139,250,.18);
            color: #b8a8d8; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 12px;
            transition: all .18s cubic-bezier(.34,1.56,.64,1);
        }
        .btn:hover {
            background: #8b5cf6; color: #fff; border-color: #8b5cf6;
            transform: translateY(-1px); box-shadow: 0 4px 12px rgba(139,92,246,.35);
        }
        .btn:active { transform: translateY(0) scale(.94); }

        /* ─── Model select ─── */
        .bar {
            padding: 9px 12px; flex-shrink: 0;
            border-bottom: 1px solid rgba(167,139,250,.08);
            background: rgba(0,0,0,.15);
        }
        .bar select {
            width: 100%; background: #14101e;
            border: 1px solid rgba(167,139,250,.2); border-radius: 8px;
            padding: 7px 32px 7px 10px; color: #c8b8e8; font-size: 11.5px;
            outline: none; cursor: pointer; appearance: none;
            background-image: linear-gradient(45deg, transparent 50%, #a78bfa 50%),
                              linear-gradient(135deg, #a78bfa 50%, transparent 50%);
            background-position: calc(100% - 16px) center, calc(100% - 11px) center;
            background-size: 5px 5px, 5px 5px;
            background-repeat: no-repeat;
            transition: border-color .2s, box-shadow .2s;
        }
        .bar select:focus {
            border-color: rgba(167,139,250,.6);
            box-shadow: 0 0 0 3px rgba(167,139,250,.12);
        }

        /* ─── Log ─── */
        .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .log {
            flex: 1; overflow-y: auto; padding: 16px 16px 12px;
            display: flex; flex-direction: column; gap: 12px;
            scroll-behavior: smooth;
        }
        .log::-webkit-scrollbar { width: 6px; }
        .log::-webkit-scrollbar-thumb {
            background: rgba(167,139,250,.3); border-radius: 3px;
        }
        .log::-webkit-scrollbar-thumb:hover { background: rgba(167,139,250,.55); }

        /* ─── Messages ─── */
        .msg {
            max-width: 88%; padding: 11px 14px; border-radius: 14px;
            font-size: 12.5px; line-height: 1.6;
            word-wrap: break-word; overflow-wrap: break-word;
            animation: msgIn .32s cubic-bezier(.34,1.56,.64,1);
            transform-origin: var(--origin, bottom left);
            user-select: text; -webkit-user-select: text;
            cursor: text;
            position: relative;
        }
        @keyframes msgIn {
            0%   { opacity: 0; transform: translateY(8px) scale(.94); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .msg.user {
            --origin: bottom right;
            align-self: flex-end;
            background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
            color: #fff; border-bottom-right-radius: 5px;
            box-shadow: 0 4px 16px rgba(168,85,247,.25);
            white-space: pre-wrap;
        }
        .msg.ia {
            align-self: flex-start;
            background: linear-gradient(135deg, rgba(139,92,246,.1), rgba(167,139,250,.06));
            border: 1px solid rgba(167,139,250,.18); color: #e6e1f5;
            border-bottom-left-radius: 5px;
        }
        .msg.sys {
            align-self: center; background: rgba(255,255,255,.03);
            color: #7a6a98; font-size: 10.5px; font-style: italic;
            padding: 6px 12px; border-radius: 20px; max-width: 90%;
            border: 1px solid rgba(255,255,255,.04);
            user-select: none;
        }
        .msg.erro {
            align-self: center; background: rgba(251,113,133,.08);
            border: 1px solid rgba(251,113,133,.25); color: #fda4af;
            font-size: 11px; padding: 8px 12px;
        }

        /* Botão copiar em mensagens da IA */
        .copy-msg {
            position: absolute; top: 6px; right: 6px;
            width: 24px; height: 24px; border-radius: 6px;
            background: rgba(20,16,30,.9);
            border: 1px solid rgba(167,139,250,.25);
            color: #c4b5fd;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 11px; font-family: inherit;
            opacity: 0; transition: opacity .18s, transform .15s, background .15s;
            user-select: none;
        }
        .msg.ia:hover .copy-msg { opacity: 1; }
        .copy-msg:hover { background: #8b5cf6; color: #fff; transform: scale(1.08); }
        .copy-msg.ok { background: rgba(52,211,153,.9); color: #052e1a; opacity: 1; }

        /* ─── Markdown ─── */
        .msg.ia p { margin: 0 0 8px; }
        .msg.ia p:last-child { margin-bottom: 0; }
        .msg.ia h1, .msg.ia h2, .msg.ia h3,
        .msg.ia h4, .msg.ia h5, .msg.ia h6 {
            margin: 12px 0 6px; font-weight: 700; color: #f3eeff;
            line-height: 1.35;
        }
        .msg.ia h1 { font-size: 15px; }
        .msg.ia h2 { font-size: 14px; }
        .msg.ia h3 { font-size: 13px; }
        .msg.ia h4, .msg.ia h5, .msg.ia h6 { font-size: 12.5px; }
        .msg.ia h1:first-child, .msg.ia h2:first-child, .msg.ia h3:first-child { margin-top: 0; }
        .msg.ia ul, .msg.ia ol {
            margin: 6px 0; padding-left: 20px;
        }
        .msg.ia li { margin: 2px 0; }
        .msg.ia li::marker { color: #a78bfa; }
        .msg.ia strong { color: #f5efff; font-weight: 700; }
        .msg.ia em { color: #d8ceff; font-style: italic; }
        .msg.ia del { color: #8a7aa8; text-decoration: line-through; }
        .msg.ia code {
            background: rgba(167,139,250,.14);
            border: 1px solid rgba(167,139,250,.2);
            padding: 1px 6px; border-radius: 5px;
            font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
            font-size: 11.5px; color: #e9d5ff;
        }
        .msg.ia pre {
            background: #0a0712;
            border: 1px solid rgba(167,139,250,.2);
            border-radius: 9px; padding: 12px 14px;
            margin: 8px 0; overflow-x: auto;
            position: relative;
        }
        .msg.ia pre code {
            background: none; border: none; padding: 0;
            font-size: 11.5px; color: #d8ceff; line-height: 1.5;
            white-space: pre;
        }
        .msg.ia pre[data-lang]::before {
            content: attr(data-lang);
            position: absolute; top: 4px; right: 8px;
            font-size: 9px; color: #6b5a88;
            text-transform: uppercase; letter-spacing: .08em;
            font-family: ui-monospace, monospace;
        }
        .msg.ia pre::-webkit-scrollbar { height: 5px; }
        .msg.ia pre::-webkit-scrollbar-thumb { background: rgba(167,139,250,.3); border-radius: 3px; }
        .msg.ia a {
            color: #c4b5fd; text-decoration: underline;
            text-decoration-color: rgba(196,181,253,.4);
            text-underline-offset: 2px;
            transition: color .15s, text-decoration-color .15s;
        }
        .msg.ia a:hover { color: #e9d5ff; text-decoration-color: #e9d5ff; }
        .msg.ia blockquote {
            margin: 8px 0; padding: 4px 12px;
            border-left: 3px solid rgba(167,139,250,.5);
            color: #c8b8e8; font-style: italic;
            background: rgba(167,139,250,.05);
            border-radius: 0 6px 6px 0;
        }
        .msg.ia hr {
            border: 0; height: 1px; margin: 12px 0;
            background: linear-gradient(90deg, transparent, rgba(167,139,250,.3), transparent);
        }
        .msg.ia table {
            border-collapse: collapse; margin: 8px 0;
            font-size: 11.5px; width: 100%;
            border-radius: 8px; overflow: hidden;
        }
        .msg.ia th, .msg.ia td {
            border: 1px solid rgba(167,139,250,.15);
            padding: 6px 10px; text-align: left;
        }
        .msg.ia th {
            background: rgba(167,139,250,.1);
            color: #e9d5ff; font-weight: 700;
        }
        .msg.ia tr:nth-child(even) td { background: rgba(167,139,250,.03); }

        /* ─── Typing indicator ─── */
        .typing {
            align-self: flex-start;
            padding: 12px 16px; border-radius: 14px;
            background: linear-gradient(135deg, rgba(139,92,246,.1), rgba(167,139,250,.06));
            border: 1px solid rgba(167,139,250,.18);
            border-bottom-left-radius: 5px;
            display: flex; align-items: center; gap: 4px;
            animation: msgIn .3s ease-out;
        }
        .typing span {
            width: 6px; height: 6px; border-radius: 50%;
            background: #a78bfa;
            animation: bounce 1.2s ease-in-out infinite;
        }
        .typing span:nth-child(2) { animation-delay: .15s; }
        .typing span:nth-child(3) { animation-delay: .3s; }
        @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); opacity: .35; }
            30%           { transform: translateY(-6px); opacity: 1; }
        }

        /* ─── Empty state ─── */
        .empty {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 10px;
            padding: 30px 24px; text-align: center;
            color: #7a6a98; font-size: 12px;
            user-select: none;
        }
        .empty-icon { font-size: 42px; opacity: .55; animation: float 3s ease-in-out infinite; }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .empty-title { color: #d8ceff; font-weight: 700; font-size: 14px; }
        .empty-hint { font-size: 11px; max-width: 260px; line-height: 1.55; }

        /* ─── Input bar ─── */
        .input-bar {
            display: flex; gap: 8px; padding: 12px;
            flex-shrink: 0;
            border-top: 1px solid rgba(167,139,250,.1);
            background: rgba(0,0,0,.22);
        }
        .input-bar textarea {
            flex: 1; background: rgba(255,255,255,.04);
            border: 1px solid rgba(167,139,250,.18); border-radius: 10px;
            padding: 9px 12px; color: #e8e0f5; font-size: 12.5px; outline: none;
            resize: none; min-height: 40px; max-height: 120px;
            font-family: inherit; line-height: 1.45;
            transition: border-color .2s, box-shadow .2s;
        }
        .input-bar textarea:focus {
            border-color: rgba(167,139,250,.55);
            box-shadow: 0 0 0 3px rgba(167,139,250,.1);
        }
        .input-bar textarea::placeholder { color: #5b4a78; }

        .send-btn {
            background: linear-gradient(135deg, #a855f7, #7c3aed);
            border: none; border-radius: 10px; padding: 0 18px;
            color: #fff; font-weight: 700; font-size: 12px;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all .18s cubic-bezier(.34,1.56,.64,1);
            min-width: 78px;
        }
        .send-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(168,85,247,.4);
        }
        .send-btn:active:not(:disabled) { transform: translateY(0) scale(.97); }
        .send-btn:disabled { opacity: .55; cursor: not-allowed; }
        .send-btn .spinner {
            width: 14px; height: 14px;
            border: 2px solid rgba(255,255,255,.3);
            border-top-color: #fff; border-radius: 50%;
            animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ─── Modal API key ─── */
        .modal-overlay {
            position: absolute; inset: 0; z-index: 30;
            background: rgba(6,4,12,.78);
            backdrop-filter: blur(4px);
            display: none; align-items: center; justify-content: center;
            padding: 20px;
            animation: fadeIn .18s ease-out;
        }
        .modal-overlay.visivel { display: flex; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal {
            background: linear-gradient(175deg, #1a1428, #100c1a);
            border: 1px solid rgba(167,139,250,.3);
            border-radius: 14px; padding: 22px 20px;
            width: 100%; max-width: 340px;
            box-shadow: 0 20px 50px rgba(0,0,0,.7);
            animation: modalIn .28s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes modalIn {
            0%   { opacity: 0; transform: translateY(12px) scale(.95); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .modal-icon {
            font-size: 32px; text-align: center; margin-bottom: 8px;
            filter: drop-shadow(0 0 12px rgba(167,139,250,.5));
        }
        .modal h3 {
            margin: 0 0 4px; font-size: 14px; color: #e8e0f5;
            text-align: center; font-weight: 700;
        }
        .modal p {
            margin: 0 0 14px; font-size: 11px; color: #8b8fa3;
            text-align: center; line-height: 1.5;
        }
        .url-hint {
            display: flex; align-items: center; gap: 6px;
            background: rgba(167,139,250,.08);
            border: 1px solid rgba(167,139,250,.2);
            border-radius: 8px; padding: 8px 10px;
            margin-bottom: 12px;
            transition: background .15s;
        }
        .url-hint:hover { background: rgba(167,139,250,.14); }
        .url-hint a {
            flex: 1; color: #c4b5fd; font-size: 11.5px;
            text-decoration: none; font-weight: 600;
            word-break: break-all;
        }
        .url-hint a:hover { color: #e9d5ff; }
        .copy-btn {
            flex-shrink: 0; background: transparent; border: none;
            color: #a78bfa; cursor: pointer; font-size: 14px;
            padding: 2px 6px; border-radius: 5px;
            transition: all .15s;
        }
        .copy-btn:hover { background: rgba(167,139,250,.2); transform: scale(1.1); }
        .copy-btn.copiado { color: #34d399; }

        .modal input {
            width: 100%; background: #0d0a14;
            border: 1px solid rgba(167,139,250,.22); border-radius: 8px;
            padding: 10px 12px; color: #e8e0f5; font-size: 12.5px;
            outline: none; font-family: ui-monospace, "SF Mono", Menlo, monospace;
            transition: border-color .2s, box-shadow .2s;
        }
        .modal input:focus {
            border-color: rgba(167,139,250,.6);
            box-shadow: 0 0 0 3px rgba(167,139,250,.12);
        }
        .modal-actions { display: flex; gap: 8px; margin-top: 14px; }
        .modal-actions button {
            flex: 1; padding: 9px 14px; border-radius: 8px;
            font-size: 12px; font-weight: 700; cursor: pointer;
            font-family: inherit; border: 1px solid transparent;
            transition: all .18s cubic-bezier(.34,1.56,.64,1);
        }
        .modal-actions .cancel {
            background: rgba(255,255,255,.05); color: #b8a8d8;
            border-color: rgba(255,255,255,.1);
        }
        .modal-actions .cancel:hover { background: rgba(255,255,255,.1); }
        .modal-actions .save {
            background: linear-gradient(135deg, #a855f7, #7c3aed);
            color: #fff;
        }
        .modal-actions .save:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 18px rgba(168,85,247,.4);
        }
        .modal-actions .save:active { transform: scale(.97); }

        /* ─── Resize ─── */
        .resize-handle {
            position: absolute; right: 0; bottom: 0; width: 18px; height: 18px;
            cursor: nwse-resize; touch-action: none;
            background:
                linear-gradient(135deg, transparent 45%, rgba(167,139,250,.35) 45%, rgba(167,139,250,.35) 52%, transparent 52%,
                                transparent 62%, rgba(167,139,250,.35) 62%, rgba(167,139,250,.35) 69%, transparent 69%,
                                transparent 79%, rgba(167,139,250,.35) 79%, rgba(167,139,250,.35) 86%, transparent 86%);
        }
        `;
        root.appendChild(style);

        const geom = loadGeom() || { left: 80, top: 80, width: 480, height: 600 };
        geom.width = Math.max(MIN_W, geom.width);
        geom.height = Math.max(MIN_H, geom.height);

        const state = {
            mensagens: [],
            modelo: loadModel(),
            enviando: false,
            abortController: null,
            jaTemMensagem: false
        };

        if (!MODELOS.some(m => m.id === state.modelo)) {
            state.modelo = MODELOS[0].id;
            saveModel(state.modelo);
        }

        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.style.cssText = `left:${geom.left}px;top:${geom.top}px;width:${geom.width}px;height:${geom.height}px`;
        panel.innerHTML = `
            <div class="hdr" id="hdr">
                <div class="brand">
                    <span class="dot"></span>
                    <span class="title">Sang AI</span>
                </div>
                <div class="actions">
                    <button class="btn" id="btnKey" title="Configurar API key">⚙</button>
                    <button class="btn" id="btnClear" title="Limpar conversa">🗑</button>
                    <button class="btn" id="btnMin" title="Minimizar">−</button>
                    <button class="btn" id="btnCls" title="Fechar">✕</button>
                </div>
            </div>
            <div class="bar">
                <select id="modelSel">
                    ${MODELOS.map(m => `<option value="${m.id}"${m.id === state.modelo ? ' selected' : ''}>${m.nome} · ${m.tag}</option>`).join('')}
                </select>
            </div>
            <div class="body">
                <div class="log" id="log"></div>
                <div class="input-bar">
                    <textarea id="input" rows="1" placeholder="Pergunte algo…"></textarea>
                    <button class="send-btn" id="send">Enviar</button>
                </div>
            </div>
            <div class="modal-overlay" id="modalKey">
                <div class="modal">
                    <div class="modal-icon">🔑</div>
                    <h3>Chave de acesso</h3>
                    <p>Cole a chave <code>gsk_...</code> para ativar a Sang AI</p>
                    <div class="url-hint">
                        <a href="${KEYS_URL}" target="_blank" rel="noopener">${KEYS_URL.replace('https://', '')}</a>
                        <button class="copy-btn" id="copyUrl" title="Copiar link">📋</button>
                    </div>
                    <input type="password" id="keyInput" placeholder="gsk_..." autocomplete="off" spellcheck="false" />
                    <div class="modal-actions">
                        <button class="cancel" id="modalCancel">Cancelar</button>
                        <button class="save" id="modalSave">Salvar</button>
                    </div>
                </div>
            </div>
            <div class="resize-handle" id="resizeHandle"></div>
        `;
        root.appendChild(panel);

        // Bloqueia vazamento de teclas pro jogo
        const LEAK_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput'];
        LEAK_EVENTS.forEach(t => host.addEventListener(t, e => e.stopPropagation()));

        const $ = s => panel.querySelector(s);
        const hdr = $('#hdr'), logEl = $('#log'), inputEl = $('#input'), sendBtn = $('#send');
        const modelSel = $('#modelSel'), rz = $('#resizeHandle');
        const modal = $('#modalKey'), keyInput = $('#keyInput');

        // ─── UI helpers ───
        function renderEmpty() {
            if (state.jaTemMensagem) return;
            logEl.innerHTML = `
                <div class="empty">
                    <div class="empty-icon">✨</div>
                    <div class="empty-title">Oi! Como posso ajudar?</div>
                    <div class="empty-hint">Pergunte qualquer coisa — vou responder rapidinho.</div>
                </div>`;
        }

        function limparEmpty() {
            const empty = logEl.querySelector('.empty');
            if (empty) empty.remove();
            state.jaTemMensagem = true;
        }

        function addMsg(tipo, texto, opts) {
            opts = opts || {};
            limparEmpty();
            const el = document.createElement('div');
            el.className = 'msg ' + tipo;
            if (opts.md) el.innerHTML = mdRender(texto);
            else el.textContent = texto;

            if (tipo === 'ia' && opts.md) {
                const btn = document.createElement('button');
                btn.className = 'copy-msg';
                btn.innerHTML = '📋';
                btn.title = 'Copiar resposta';
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const raw = texto;
                    const ok = () => {
                        btn.innerHTML = '✓';
                        btn.classList.add('ok');
                        setTimeout(() => {
                            btn.innerHTML = '📋';
                            btn.classList.remove('ok');
                        }, 1400);
                    };
                    try {
                        navigator.clipboard.writeText(raw).then(ok).catch(() => {
                            const ta = document.createElement('textarea');
                            ta.value = raw;
                            document.body.appendChild(ta);
                            ta.select();
                            try { document.execCommand('copy'); ok(); } catch (_) {}
                            ta.remove();
                        });
                    } catch (_) {}
                });
                el.appendChild(btn);
            }

            logEl.appendChild(el);
            logEl.scrollTop = logEl.scrollHeight;
            return el;
        }

        function addTyping() {
            limparEmpty();
            const el = document.createElement('div');
            el.className = 'typing';
            el.innerHTML = '<span></span><span></span><span></span>';
            logEl.appendChild(el);
            logEl.scrollTop = logEl.scrollHeight;
            return el;
        }

        function limparConversa() {
            logEl.innerHTML = '';
            state.mensagens = [];
            state.jaTemMensagem = false;
            renderEmpty();
        }

        // ─── Modal ───
        function abrirModal() {
            keyInput.value = window._apis?.getKey('groq') || '';
            modal.classList.add('visivel');
            setTimeout(() => keyInput.focus(), 80);
        }
        function fecharModal() {
            modal.classList.remove('visivel');
            keyInput.value = '';
        }
        function salvarKey() {
            const v = keyInput.value.trim();
            if (!window._apis) return;
            window._apis.setKey('groq', v);
            fecharModal();
            if (v) {
                addMsg('sys', '✓ Chave salva. Pode conversar!');
                setTimeout(() => inputEl.focus(), 100);
            } else {
                addMsg('sys', 'Chave removida.');
            }
        }
        function copiarUrl() {
            const btn = $('#copyUrl');
            const ok = () => {
                btn.classList.add('copiado');
                btn.textContent = '✓';
                setTimeout(() => {
                    btn.classList.remove('copiado');
                    btn.textContent = '📋';
                }, 1400);
            };
            try {
                navigator.clipboard.writeText(KEYS_URL).then(ok).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = KEYS_URL;
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); ok(); } catch (_) {}
                    ta.remove();
                });
            } catch (_) {}
        }

        // ─── Enviar ───
        async function enviar() {
            const texto = inputEl.value.trim();
            if (!texto || state.enviando) return;

            if (!window._apis?.groq) {
                addMsg('erro', 'Serviço não registrado. Recarregue a página.');
                return;
            }
            if (!window._apis.getKey('groq')) {
                abrirModal();
                return;
            }

            state.enviando = true;
            inputEl.value = '';
            inputEl.style.height = 'auto';

            addMsg('user', texto);
            state.mensagens.push({ role: 'user', content: texto });

            const indicador = addTyping();
            sendBtn.innerHTML = '<span class="spinner"></span>';
            sendBtn.disabled = true;

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

                indicador.remove();
                addMsg('ia', resposta, { md: true });
                state.mensagens.push({ role: 'assistant', content: resposta });
            } catch (e) {
                indicador.remove();
                if (e.name === 'AbortError') {
                    // silencioso
                } else {
                    addMsg('erro', '⚠ ' + (e.message || 'Erro na chamada'));
                }
            } finally {
                state.enviando = false;
                sendBtn.innerHTML = 'Enviar';
                sendBtn.disabled = false;
                inputEl.focus();
            }
        }

        // ─── Eventos ───
        sendBtn.addEventListener('click', enviar);
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviar();
            }
        });
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(120, inputEl.scrollHeight) + 'px';
        });

        modelSel.addEventListener('change', () => {
            state.modelo = modelSel.value;
            saveModel(state.modelo);
        });

        $('#btnClear').addEventListener('click', limparConversa);
        $('#btnKey').addEventListener('click', abrirModal);
        $('#modalCancel').addEventListener('click', fecharModal);
        $('#modalSave').addEventListener('click', salvarKey);
        $('#copyUrl').addEventListener('click', copiarUrl);
        keyInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); salvarKey(); }
            if (e.key === 'Escape') { e.preventDefault(); fecharModal(); }
        });
        modal.addEventListener('click', e => {
            if (e.target === modal) fecharModal();
        });

        // ─── Drag ───
        let dragId = null, dragStart = null, dragMoved = false;
        const DRAG_THRESHOLD = 3;
        hdr.addEventListener('pointerdown', e => {
            if (e.target.closest('.btn')) return;
            dragId = e.pointerId;
            dragMoved = false;
            dragStart = { mx: e.clientX, my: e.clientY, left: geom.left, top: geom.top };
            hdr.setPointerCapture(dragId);
            hdr.classList.add('dragging');
        });
        hdr.addEventListener('pointermove', e => {
            if (dragId === null || e.pointerId !== dragId) return;
            const dx = e.clientX - dragStart.mx, dy = e.clientY - dragStart.my;
            if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            dragMoved = true;
            geom.left = Math.min(Math.max(0, dragStart.left + dx), window.innerWidth - 100);
            geom.top = Math.min(Math.max(0, dragStart.top + dy), window.innerHeight - 60);
            panel.style.left = geom.left + 'px';
            panel.style.top = geom.top + 'px';
        });
        const endDrag = e => {
            if (dragId === null || (e && e.pointerId !== dragId)) return;
            try { hdr.releasePointerCapture(dragId); } catch (_) {}
            hdr.classList.remove('dragging');
            dragId = null;
            if (dragMoved) salvarGeom();
        };
        hdr.addEventListener('pointerup', endDrag);
        hdr.addEventListener('pointercancel', endDrag);

        // ─── Resize ───
        let rzId = null, rzStart = null;
        rz.addEventListener('pointerdown', e => {
            e.stopPropagation();
            rzId = e.pointerId;
            rzStart = { mx: e.clientX, my: e.clientY, w: geom.width, h: geom.height };
            rz.setPointerCapture(rzId);
        });
        rz.addEventListener('pointermove', e => {
            if (rzId === null || e.pointerId !== rzId) return;
            geom.width = Math.max(MIN_W, rzStart.w + (e.clientX - rzStart.mx));
            geom.height = Math.max(MIN_H, rzStart.h + (e.clientY - rzStart.my));
            panel.style.width = geom.width + 'px';
            panel.style.height = geom.height + 'px';
        });
        const endRz = e => {
            if (rzId === null || (e && e.pointerId !== rzId)) return;
            try { rz.releasePointerCapture(rzId); } catch (_) {}
            rzId = null;
            salvarGeom();
        };
        rz.addEventListener('pointerup', endRz);
        rz.addEventListener('pointercancel', endRz);

        // ─── Persistência ───
        let saveTimer = null;
        function salvarGeom() {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                try { localStorage.setItem(GEOM_KEY, JSON.stringify(geom)); } catch (_) {}
            }, 300);
        }

        // ─── Minimizar / Fechar ───
        let minimizado = false;
        $('#btnMin').addEventListener('click', () => {
            minimizado = !minimizado;
            panel.style.display = minimizado ? 'none' : 'flex';
        });
        $('#btnCls').addEventListener('click', kill);

        function kill() {
            if (saveTimer) clearTimeout(saveTimer);
            if (state.abortController) state.abortController.abort();
            host.remove();
            delete window[UID];
        }

        window[UID] = {
            kill,
            show() { minimizado = false; panel.style.display = 'flex'; },
            hide() { minimizado = true;  panel.style.display = 'none'; }
        };

        // ─── Init ───
        renderEmpty();
        if (!window._apis?.getKey('groq')) {
            setTimeout(abrirModal, 400);
        }
    }

    if (document.body) init();
    else new MutationObserver((_, obs) => {
        if (document.body) { obs.disconnect(); init(); }
    }).observe(document.documentElement, { childList: true });
})();
