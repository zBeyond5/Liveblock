// modules/groq.js — Sang AI (backend Groq) com visão
(function() {
    'use strict';
    const UID = '_groq';
    if (window[UID]) return;

    const GEOM_KEY  = 'sang_panel_groq_state';
    const MODEL_KEY = 'sang_groq_model';
    const MIN_W = 440, MIN_H = 520;
    const KEYS_URL = 'https://console.groq.com/keys';
    const FONT_URL = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap';
    const MAX_IMG_DIM = 1024;
    const MAX_IMG_MB = 3.5;

    const MODELOS = [
        { id: 'openai/gpt-oss-120b',      nome: 'SangMax',   tag: 'inteligente', vision: false },
        { id: 'openai/gpt-oss-20b',       nome: 'Padrão',    tag: 'equilibrado', vision: false },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct',     nome: 'Llama 4 Scout',    tag: 'visão',  vision: true },
        { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', nome: 'Llama 4 Maverick', tag: 'visão+', vision: true },
        { id: 'qwen/qwen3-32b',           nome: 'Qwen 3 32B',     tag: 'alternativo', vision: false }
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
        const codeBlocks = [];
        t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const id = `\u0000CB${codeBlocks.length}\u0000`;
            codeBlocks.push({ lang, code: code.replace(/\n$/, '') });
            return id;
        });

        const linhas = t.split('\n');
        const out = [];
        const lista = [];
        const fecharListas = () => { while (lista.length) out.push(`</${lista.pop()}>`); };

        let i = 0;
        while (i < linhas.length) {
            const linha = linhas[i];

            const cb = linha.match(/^\u0000CB(\d+)\u0000$/);
            if (cb) {
                fecharListas();
                const b = codeBlocks[+cb[1]];
                const la = b.lang ? ` data-lang="${escapeHtml(b.lang)}"` : '';
                out.push(`<pre${la}><code>${b.code}</code></pre>`);
                i++; continue;
            }
            const h = linha.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (h) { fecharListas(); const n = h[1].length; out.push(`<h${n}>${mdInline(h[2])}</h${n}>`); i++; continue; }
            if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(linha)) { fecharListas(); out.push('<hr>'); i++; continue; }
            if (linha.includes('|') && linhas[i + 1] && /^\s*\|?\s*:?-+:?/.test(linhas[i + 1])) {
                fecharListas();
                const bloco = [];
                while (i < linhas.length && linhas[i].includes('|')) { bloco.push(linhas[i]); i++; }
                out.push(mdTable(bloco));
                continue;
            }
            const ul = linha.match(/^\s*[-*+]\s+(.+)$/);
            if (ul) {
                if (lista[lista.length - 1] !== 'ul') { fecharListas(); out.push('<ul>'); lista.push('ul'); }
                out.push(`<li>${mdInline(ul[1])}</li>`); i++; continue;
            }
            const ol = linha.match(/^\s*\d+\.\s+(.+)$/);
            if (ol) {
                if (lista[lista.length - 1] !== 'ol') { fecharListas(); out.push('<ol>'); lista.push('ol'); }
                out.push(`<li>${mdInline(ol[1])}</li>`); i++; continue;
            }
            const bq = linha.match(/^\s*>\s?(.*)$/);
            if (bq) { fecharListas(); out.push(`<blockquote>${mdInline(bq[1])}</blockquote>`); i++; continue; }
            if (!linha.trim()) { fecharListas(); i++; continue; }
            fecharListas();
            out.push(`<p>${mdInline(linha)}</p>`);
            i++;
        }
        fecharListas();
        return out.join('');
    }

    // ─── Imagem: redimensionar antes de enviar ───
    function processarImagem(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    if (width > MAX_IMG_DIM || height > MAX_IMG_DIM) {
                        const r = Math.min(MAX_IMG_DIM / width, MAX_IMG_DIM / height);
                        width = Math.round(width * r);
                        height = Math.round(height * r);
                    }
                    const cv = document.createElement('canvas');
                    cv.width = width; cv.height = height;
                    const ctx = cv.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const isPng = file.type === 'image/png';
                    const mime = isPng ? 'image/png' : 'image/jpeg';
                    let dataUrl;
                    try { dataUrl = cv.toDataURL(mime, 0.85); }
                    catch (_) { dataUrl = e.target.result; }

                    const bytes = Math.ceil(dataUrl.length * 0.75);
                    if (bytes > MAX_IMG_MB * 1024 * 1024) {
                        return reject(new Error('Imagem muito grande após compressão (' + (bytes/1024/1024).toFixed(1) + 'MB)'));
                    }
                    resolve({
                        id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                        dataUrl,
                        name: file.name || 'imagem',
                        size: bytes,
                        w: width, h: height
                    });
                };
                img.onerror = () => reject(new Error('Falha ao carregar imagem'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
            reader.readAsDataURL(file);
        });
    }

    // ─── Init ───
    function init() {
        if (window[UID]) return;

        if (!document.querySelector('link[data-sang-font]')) {
            const fl = document.createElement('link');
            fl.rel = 'stylesheet'; fl.href = FONT_URL;
            fl.setAttribute('data-sang-font', '1');
            document.head.appendChild(fl);
        }

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
            font-family: 'Geist', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            letter-spacing: -0.005em;
            background: linear-gradient(175deg, #16121f 0%, #0b0912 100%);
            border: 1px solid rgba(167,139,250,.24);
            border-radius: 18px; overflow: hidden;
            box-shadow: 0 24px 60px rgba(0,0,0,.78), 0 0 0 1px rgba(167,139,250,.06), 0 0 44px rgba(139,92,246,.1);
            transition: box-shadow .2s;
        }
        .panel.dragover {
            box-shadow: 0 24px 60px rgba(0,0,0,.78), 0 0 0 2px rgba(167,139,250,.6), 0 0 60px rgba(139,92,246,.35);
        }

        /* ─── Header ─── */
        .hdr {
            height: 56px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 16px;
            cursor: grab; user-select: none; touch-action: none;
            background: linear-gradient(180deg, #211a38 0%, #15101f 100%);
            position: relative; overflow: hidden;
        }
        .hdr::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
            background: linear-gradient(90deg, transparent 0%, #a78bfa 20%, #ec4899 50%, #a78bfa 80%, transparent 100%);
            background-size: 200% 100%;
            animation: hdrShift 3.6s linear infinite;
            box-shadow: 0 0 12px rgba(167,139,250,.5);
        }
        @keyframes hdrShift { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        .hdr::after {
            content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
            background: linear-gradient(90deg, transparent 4%, rgba(167,139,250,.4) 50%, transparent 96%);
        }
        .hdr.dragging { cursor: grabbing; }
        .brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .dot {
            width: 10px; height: 10px; border-radius: 50%;
            background: radial-gradient(circle at 32% 28%, #f3e8ff, #a855f7 55%, #6d28d9);
            box-shadow: 0 0 12px rgba(168,85,247,.85), 0 0 26px rgba(168,85,247,.4), inset 0 0 4px rgba(255,255,255,.5);
            animation: dotPulse 2.4s ease-in-out infinite;
        }
        @keyframes dotPulse {
            0%,100% { box-shadow: 0 0 12px rgba(168,85,247,.85), 0 0 26px rgba(168,85,247,.4), inset 0 0 4px rgba(255,255,255,.5); }
            50% { box-shadow: 0 0 18px rgba(168,85,247,1), 0 0 36px rgba(168,85,247,.65), inset 0 0 6px rgba(255,255,255,.75); }
        }
        .title {
            font-weight: 800; font-size: 15px;
            letter-spacing: .13em; text-transform: uppercase;
            background: linear-gradient(100deg, #f5efff 0%, #c4b5fd 45%, #f0abfc 100%);
            -webkit-background-clip: text; background-clip: text;
            color: transparent;
            filter: drop-shadow(0 0 14px rgba(167,139,250,.35));
            white-space: nowrap;
        }
        .actions { display: flex; gap: 6px; flex-shrink: 0; }
        .btn {
            width: 30px; height: 30px; border-radius: 9px;
            background: rgba(167,139,250,.09); border: 1px solid rgba(167,139,250,.16);
            color: #c4b5fd;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 13px;
            transition: all .2s cubic-bezier(.34,1.56,.64,1);
        }
        .btn:hover {
            background: linear-gradient(135deg, #a855f7, #7c3aed);
            color: #fff; border-color: rgba(255,255,255,.18);
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(168,85,247,.5), 0 0 0 1px rgba(167,139,250,.35);
        }
        .btn:active { transform: translateY(0) scale(.94); }

        /* ─── Model select ─── */
        .bar {
            padding: 10px 14px; flex-shrink: 0;
            border-bottom: 1px solid rgba(167,139,250,.08);
            background: rgba(0,0,0,.15);
        }
        .bar select {
            width: 100%;
            font-family: 'Geist', sans-serif;
            font-weight: 500; font-size: 12px;
            background: #14101e;
            border: 1px solid rgba(167,139,250,.2);
            border-radius: 9px;
            padding: 9px 34px 9px 12px;
            color: #ddd6f3;
            outline: none; cursor: pointer; appearance: none;
            background-image: linear-gradient(45deg, transparent 50%, #a78bfa 50%), linear-gradient(135deg, #a78bfa 50%, transparent 50%);
            background-position: calc(100% - 17px) center, calc(100% - 12px) center;
            background-size: 5px 5px, 5px 5px;
            background-repeat: no-repeat;
            transition: border-color .2s, box-shadow .2s;
        }
        .bar select:hover { border-color: rgba(167,139,250,.4); }
        .bar select:focus { border-color: rgba(167,139,250,.65); box-shadow: 0 0 0 3px rgba(167,139,250,.14); }

        /* ─── Log ─── */
        .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .log {
            flex: 1; overflow-y: auto; padding: 16px 16px 14px;
            display: flex; flex-direction: column; gap: 12px;
            scroll-behavior: smooth;
        }
        .log::-webkit-scrollbar { width: 6px; }
        .log::-webkit-scrollbar-thumb { background: rgba(167,139,250,.3); border-radius: 3px; }
        .log::-webkit-scrollbar-thumb:hover { background: rgba(167,139,250,.55); }

        /* ─── Messages ─── */
        .msg {
            max-width: 88%; padding: 11px 14px; border-radius: 14px;
            font-family: 'Geist', sans-serif;
            font-size: 13px; line-height: 1.6;
            word-wrap: break-word; overflow-wrap: break-word;
            animation: msgIn .32s cubic-bezier(.34,1.56,.64,1);
            transform-origin: var(--origin, bottom left);
            user-select: text; -webkit-user-select: text;
            cursor: text;
            position: relative;
        }
        @keyframes msgIn {
            0% { opacity: 0; transform: translateY(8px) scale(.94); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .msg.user {
            --origin: bottom right;
            align-self: flex-end;
            background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
            color: #fff; border-bottom-right-radius: 5px;
            box-shadow: 0 4px 18px rgba(168,85,247,.3);
            font-weight: 500;
            white-space: pre-wrap;
        }
        .msg.user .user-imgs {
            display: grid; gap: 4px; margin-top: 8px;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        }
        .msg.user .user-imgs img {
            width: 100%; height: 80px; object-fit: cover;
            border-radius: 8px; cursor: zoom-in;
            border: 1px solid rgba(255,255,255,.25);
            transition: transform .15s;
        }
        .msg.user .user-imgs img:hover { transform: scale(1.03); }
        .msg.ia {
            align-self: flex-start;
            background: linear-gradient(135deg, rgba(139,92,246,.11), rgba(167,139,250,.06));
            border: 1px solid rgba(167,139,250,.18);
            color: #eae4fb;
            border-bottom-left-radius: 5px;
        }
        .msg.sys {
            align-self: center; background: rgba(255,255,255,.03);
            color: #8a7aa8; font-size: 11px; font-style: italic;
            padding: 6px 12px; border-radius: 20px; max-width: 90%;
            border: 1px solid rgba(255,255,255,.05);
            user-select: none;
        }
        .msg.erro {
            align-self: center; background: rgba(251,113,133,.08);
            border: 1px solid rgba(251,113,133,.25); color: #fda4af;
            font-size: 11.5px; padding: 8px 12px;
        }

        .msg-actions {
            position: absolute; top: 6px; right: 6px;
            display: flex; gap: 4px;
            opacity: 0; transition: opacity .18s;
        }
        .msg.ia:hover .msg-actions { opacity: 1; }
        .msg-action {
            width: 24px; height: 24px; border-radius: 6px;
            background: rgba(20,16,30,.9);
            border: 1px solid rgba(167,139,250,.25);
            color: #c4b5fd;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 11px; font-family: inherit;
            transition: all .15s;
            user-select: none;
        }
        .msg-action:hover { background: #8b5cf6; color: #fff; transform: scale(1.08); }
        .msg-action.ok { background: rgba(52,211,153,.9); color: #052e1a; }

        /* ─── Markdown ─── */
        .msg.ia p { margin: 0 0 8px; }
        .msg.ia p:last-child { margin-bottom: 0; }
        .msg.ia h1, .msg.ia h2, .msg.ia h3, .msg.ia h4, .msg.ia h5, .msg.ia h6 {
            margin: 12px 0 6px; font-weight: 700; color: #f3eeff;
            line-height: 1.35; letter-spacing: -0.01em;
        }
        .msg.ia h1 { font-size: 16px; }
        .msg.ia h2 { font-size: 14.5px; }
        .msg.ia h3 { font-size: 13.5px; }
        .msg.ia h4, .msg.ia h5, .msg.ia h6 { font-size: 13px; }
        .msg.ia h1:first-child, .msg.ia h2:first-child, .msg.ia h3:first-child { margin-top: 0; }
        .msg.ia ul, .msg.ia ol { margin: 6px 0; padding-left: 20px; }
        .msg.ia li { margin: 3px 0; }
        .msg.ia li::marker { color: #a78bfa; }
        .msg.ia strong { color: #f8f4ff; font-weight: 700; }
        .msg.ia em { color: #ddd2ff; font-style: italic; }
        .msg.ia del { color: #8a7aa8; text-decoration: line-through; }
        .msg.ia code {
            background: rgba(167,139,250,.14);
            border: 1px solid rgba(167,139,250,.2);
            padding: 1.5px 6px; border-radius: 5px;
            font-family: 'Geist Mono', ui-monospace, "SF Mono", Menlo, Consolas, monospace;
            font-size: 12px; color: #e9d5ff;
        }
        .msg.ia pre {
            background: #0a0712; border: 1px solid rgba(167,139,250,.2);
            border-radius: 10px; padding: 12px 14px;
            margin: 8px 0; overflow-x: auto; position: relative;
        }
        .msg.ia pre code {
            background: none; border: none; padding: 0;
            font-family: 'Geist Mono', ui-monospace, "SF Mono", Menlo, Consolas, monospace;
            font-size: 12px; color: #d8ceff; line-height: 1.55;
            white-space: pre;
        }
        .msg.ia pre[data-lang]::before {
            content: attr(data-lang);
            position: absolute; top: 5px; right: 9px;
            font-family: 'Geist Mono', monospace;
            font-size: 9.5px; color: #6b5a88;
            text-transform: uppercase; letter-spacing: .09em;
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
            margin: 8px 0; padding: 5px 12px;
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
            font-size: 12px; width: 100%;
            border-radius: 8px; overflow: hidden;
        }
        .msg.ia th, .msg.ia td {
            border: 1px solid rgba(167,139,250,.15);
            padding: 6px 10px; text-align: left;
        }
        .msg.ia th { background: rgba(167,139,250,.1); color: #e9d5ff; font-weight: 700; }
        .msg.ia tr:nth-child(even) td { background: rgba(167,139,250,.03); }

        /* ─── Typing ─── */
        .typing {
            align-self: flex-start;
            padding: 13px 17px; border-radius: 14px;
            background: linear-gradient(135deg, rgba(139,92,246,.11), rgba(167,139,250,.06));
            border: 1px solid rgba(167,139,250,.18);
            border-bottom-left-radius: 5px;
            display: flex; align-items: center; gap: 5px;
            animation: msgIn .3s ease-out;
        }
        .typing span {
            width: 7px; height: 7px; border-radius: 50%;
            background: #a78bfa;
            box-shadow: 0 0 8px rgba(167,139,250,.6);
            animation: bounce 1.2s ease-in-out infinite;
        }
        .typing span:nth-child(2) { animation-delay: .15s; }
        .typing span:nth-child(3) { animation-delay: .3s; }
        @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); opacity: .35; }
            30% { transform: translateY(-6px); opacity: 1; }
        }

        /* ─── Empty ─── */
        .empty {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 10px;
            padding: 30px 24px; text-align: center;
            color: #7a6a98; font-size: 12.5px;
            user-select: none;
        }
        .empty-icon {
            font-size: 46px; opacity: .6;
            animation: float 3.2s ease-in-out infinite;
            filter: drop-shadow(0 0 20px rgba(167,139,250,.5));
        }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .empty-title { color: #e2d5ff; font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
        .empty-hint { font-size: 12px; max-width: 280px; line-height: 1.55; color: #8a7aa8; }

        /* ─── Attach strip ─── */
        .attach-strip {
            display: none;
            padding: 10px 14px 0;
            gap: 8px;
            overflow-x: auto;
            flex-shrink: 0;
        }
        .attach-strip.visivel { display: flex; }
        .attach-strip::-webkit-scrollbar { height: 5px; }
        .attach-strip::-webkit-scrollbar-thumb { background: rgba(167,139,250,.3); border-radius: 3px; }

        .attach-thumb {
            position: relative; flex-shrink: 0;
            width: 68px; height: 68px;
            border-radius: 10px; overflow: hidden;
            background: #0a0712;
            border: 1px solid rgba(167,139,250,.35);
            animation: thumbIn .28s cubic-bezier(.34,1.56,.64,1);
            box-shadow: 0 4px 14px rgba(0,0,0,.4);
        }
        @keyframes thumbIn {
            0% { opacity: 0; transform: scale(.7); }
            100% { opacity: 1; transform: scale(1); }
        }
        .attach-thumb img {
            width: 100%; height: 100%; object-fit: cover;
            cursor: zoom-in; display: block;
        }
        .attach-thumb .rm {
            position: absolute; top: 3px; right: 3px;
            width: 18px; height: 18px; border-radius: 50%;
            background: rgba(0,0,0,.75); border: 1px solid rgba(255,255,255,.2);
            color: #fff; font-size: 10px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; padding: 0;
            transition: all .15s;
        }
        .attach-thumb .rm:hover { background: #ef4444; border-color: #fca5a5; transform: scale(1.15); }

        /* ─── Input bar ─── */
        .input-bar {
            display: flex; gap: 8px;
            padding: 12px 14px 14px;
            flex-shrink: 0;
            border-top: 1px solid rgba(167,139,250,.1);
            background: linear-gradient(180deg, rgba(20,16,30,.45), rgba(10,7,18,.75));
            position: relative;
            align-items: flex-end;
        }
        .input-bar::before {
            content: ''; position: absolute; top: -1px; left: 12%; right: 12%; height: 1px;
            background: radial-gradient(ellipse at center, rgba(167,139,250,.5), transparent 70%);
        }

        .attach-btn {
            width: 42px; height: 42px; border-radius: 12px;
            flex-shrink: 0;
            background: rgba(167,139,250,.1);
            border: 1px solid rgba(167,139,250,.22);
            color: #c4b5fd;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 17px;
            transition: all .2s cubic-bezier(.34,1.56,.64,1);
        }
        .attach-btn:hover {
            background: linear-gradient(135deg, #a855f7, #7c3aed);
            color: #fff; border-color: transparent;
            transform: translateY(-2px);
            box-shadow: 0 6px 18px rgba(168,85,247,.45);
        }
        .attach-btn:active { transform: translateY(0) scale(.95); }
        .attach-btn.ativo {
            background: linear-gradient(135deg, #a855f7, #7c3aed);
            color: #fff; border-color: transparent;
        }

        .input-bar textarea {
            flex: 1;
            background: rgba(15,11,24,.85);
            border: 1px solid rgba(167,139,250,.22);
            border-radius: 12px;
            padding: 11px 14px;
            color: #f3eeff;
            font-family: 'Geist', sans-serif;
            font-size: 13.5px; line-height: 1.5;
            letter-spacing: -0.005em;
            outline: none; resize: none;
            min-height: 42px; max-height: 130px;
            box-shadow: inset 0 1px 2px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.02);
            transition: border-color .25s, box-shadow .25s, background .25s;
        }
        .input-bar textarea:hover { border-color: rgba(167,139,250,.35); }
        .input-bar textarea:focus {
            border-color: rgba(167,139,250,.75);
            background: rgba(22,15,34,.95);
            box-shadow: inset 0 1px 2px rgba(0,0,0,.35), 0 0 0 3px rgba(167,139,250,.16), 0 0 24px rgba(167,139,250,.22);
        }
        .input-bar textarea::placeholder { color: #5b4a78; font-weight: 400; }

        .send-btn {
            min-width: 90px; height: 42px;
            padding: 0 18px;
            border-radius: 12px;
            background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
            border: none; color: #fff;
            font-family: 'Geist', sans-serif;
            font-weight: 700; font-size: 12.5px;
            letter-spacing: .015em;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            gap: 6px;
            position: relative; overflow: hidden;
            box-shadow: 0 4px 16px rgba(168,85,247,.4), inset 0 1px 0 rgba(255,255,255,.18);
            transition: all .22s cubic-bezier(.34,1.56,.64,1);
            flex-shrink: 0;
        }
        .send-btn::before {
            content: ''; position: absolute; inset: 0;
            background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,.3) 50%, transparent 60%);
            transform: translateX(-100%);
            transition: transform .55s cubic-bezier(.4,0,.2,1);
        }
        .send-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 26px rgba(168,85,247,.55), inset 0 1px 0 rgba(255,255,255,.25);
        }
        .send-btn:hover:not(:disabled)::before { transform: translateX(100%); }
        .send-btn:active:not(:disabled) { transform: translateY(0) scale(.97); }
        .send-btn:disabled { opacity: .55; cursor: not-allowed; }

        .send-btn.stop {
            background: linear-gradient(135deg, #ef4444, #b91c1c);
            box-shadow: 0 4px 16px rgba(239,68,68,.4), inset 0 1px 0 rgba(255,255,255,.15);
            min-width: 90px;
        }
        .send-btn.stop:hover { box-shadow: 0 8px 26px rgba(239,68,68,.55); }
        .send-btn .send-icon { width: 14px; height: 14px; transition: transform .22s cubic-bezier(.34,1.56,.64,1); }
        .send-btn:hover:not(:disabled):not(.stop) .send-icon { transform: translateX(2px); }
        .send-btn .send-label { display: inline; }
        .send-btn.loading .send-label,
        .send-btn.loading .send-icon { display: none; }
        .send-btn.loading .send-spin {
            display: block;
            width: 15px; height: 15px;
            border: 2px solid rgba(255,255,255,.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin .7s linear infinite;
        }
        .send-btn .send-spin { display: none; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ─── Lightbox ─── */
        .lightbox {
            position: absolute; inset: 0; z-index: 40;
            background: rgba(0,0,0,.9);
            backdrop-filter: blur(6px);
            display: none; align-items: center; justify-content: center;
            padding: 24px;
            animation: fadeIn .2s ease-out;
            cursor: zoom-out;
        }
        .lightbox.visivel { display: flex; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .lightbox img {
            max-width: 100%; max-height: 100%;
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,.9);
            animation: lbIn .28s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes lbIn { 0% { transform: scale(.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }

        /* ─── Modal key ─── */
        .modal-overlay {
            position: absolute; inset: 0; z-index: 30;
            background: rgba(6,4,12,.8);
            backdrop-filter: blur(5px);
            display: none; align-items: center; justify-content: center;
            padding: 20px;
            animation: fadeIn .18s ease-out;
        }
        .modal-overlay.visivel { display: flex; }
        .modal {
            background: linear-gradient(175deg, #1a1428, #100c1a);
            border: 1px solid rgba(167,139,250,.3);
            border-radius: 16px; padding: 24px 22px;
            width: 100%; max-width: 340px;
            box-shadow: 0 20px 50px rgba(0,0,0,.75), 0 0 0 1px rgba(167,139,250,.08);
            animation: modalIn .28s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes modalIn {
            0% { opacity: 0; transform: translateY(12px) scale(.95); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .modal-icon { font-size: 34px; text-align: center; margin-bottom: 10px; filter: drop-shadow(0 0 14px rgba(167,139,250,.55)); }
        .modal h3 { margin: 0 0 4px; font-size: 15px; color: #f0e8ff; text-align: center; font-weight: 700; }
        .modal p { margin: 0 0 16px; font-size: 11.5px; color: #8b8fa3; text-align: center; line-height: 1.5; }
        .url-hint {
            display: flex; align-items: center; gap: 6px;
            background: rgba(167,139,250,.08);
            border: 1px solid rgba(167,139,250,.2);
            border-radius: 9px; padding: 9px 11px;
            margin-bottom: 13px;
            transition: background .15s, border-color .15s;
        }
        .url-hint:hover { background: rgba(167,139,250,.14); border-color: rgba(167,139,250,.35); }
        .url-hint a {
            flex: 1; color: #c4b5fd; font-size: 11.5px;
            text-decoration: none; font-weight: 600;
            word-break: break-all;
            font-family: 'Geist Mono', monospace;
        }
        .url-hint a:hover { color: #e9d5ff; }
        .copy-btn {
            flex-shrink: 0; background: transparent; border: none;
            color: #a78bfa; cursor: pointer; font-size: 14px;
            padding: 2px 6px; border-radius: 5px;
            transition: all .15s;
        }
        .copy-btn:hover { background: rgba(167,139,250,.2); transform: scale(1.12); }
        .copy-btn.copiado { color: #34d399; }
        .modal input {
            width: 100%; background: #0d0a14;
            border: 1px solid rgba(167,139,250,.22); border-radius: 9px;
            padding: 11px 13px; color: #f0e8ff; font-size: 12.5px;
            outline: none;
            font-family: 'Geist Mono', ui-monospace, monospace;
            transition: border-color .2s, box-shadow .2s;
        }
        .modal input:focus { border-color: rgba(167,139,250,.65); box-shadow: 0 0 0 3px rgba(167,139,250,.14); }
        .modal-actions { display: flex; gap: 8px; margin-top: 15px; }
        .modal-actions button {
            flex: 1; padding: 10px 14px; border-radius: 9px;
            font-family: 'Geist', sans-serif; font-size: 12.5px; font-weight: 700;
            cursor: pointer; border: 1px solid transparent;
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
            box-shadow: 0 4px 14px rgba(168,85,247,.35);
        }
        .modal-actions .save:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(168,85,247,.5); }
        .modal-actions .save:active { transform: scale(.97); }

        .resize-handle {
            position: absolute; right: 0; bottom: 0; width: 18px; height: 18px;
            cursor: nwse-resize; touch-action: none;
            background: linear-gradient(135deg, transparent 45%, rgba(167,139,250,.35) 45%, rgba(167,139,250,.35) 52%, transparent 52%, transparent 62%, rgba(167,139,250,.35) 62%, rgba(167,139,250,.35) 69%, transparent 69%, transparent 79%, rgba(167,139,250,.35) 79%, rgba(167,139,250,.35) 86%, transparent 86%);
        }

        .toast {
            position: absolute; bottom: 88px; left: 50%;
            transform: translateX(-50%) translateY(8px);
            padding: 8px 16px; border-radius: 10px;
            background: rgba(15,10,25,.96);
            border: 1px solid rgba(251,113,133,.4);
            color: #fda4af;
            font-size: 11.5px; font-weight: 600;
            opacity: 0; pointer-events: none;
            transition: opacity .22s, transform .22s;
            z-index: 25;
            max-width: 80%;
            text-align: center;
        }
        .toast.visivel { opacity: 1; transform: translateX(-50%) translateY(0); }
        `;
        root.appendChild(style);

        const geom = loadGeom() || { left: 80, top: 80, width: 500, height: 640 };
        geom.width = Math.max(MIN_W, geom.width);
        geom.height = Math.max(MIN_H, geom.height);

        const state = {
            mensagens: [],
            modelo: loadModel(),
            enviando: false,
            abortController: null,
            jaTemMensagem: false,
            anexos: []
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
                    ${MODELOS.map(m => `<option value="${m.id}"${m.id === state.modelo ? ' selected' : ''}>${m.nome} · ${m.tag}${m.vision ? ' 👁' : ''}</option>`).join('')}
                </select>
            </div>
            <div class="body">
                <div class="log" id="log"></div>
                <div class="attach-strip" id="attachStrip"></div>
                <div class="input-bar">
                    <button class="attach-btn" id="attachBtn" title="Anexar imagem (ou cole/arraste)">📎</button>
                    <textarea id="input" rows="1" placeholder="Pergunte algo…"></textarea>
                    <button class="send-btn" id="send">
                        <span class="send-label">Enviar</span>
                        <svg class="send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                        </svg>
                        <span class="send-spin"></span>
                    </button>
                </div>
            </div>
            <input type="file" id="fileInput" accept="image/*" multiple hidden />
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
            <div class="lightbox" id="lightbox"><img id="lightboxImg" alt="" /></div>
            <div class="toast" id="toast"></div>
            <div class="resize-handle" id="resizeHandle"></div>
        `;
        root.appendChild(panel);

        const LEAK_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput'];
        LEAK_EVENTS.forEach(t => host.addEventListener(t, e => e.stopPropagation()));

        const $ = s => panel.querySelector(s);
        const hdr = $('#hdr'), logEl = $('#log'), inputEl = $('#input'), sendBtn = $('#send');
        const modelSel = $('#modelSel'), rz = $('#resizeHandle');
        const modal = $('#modalKey'), keyInput = $('#keyInput');
        const attachBtn = $('#attachBtn'), fileInput = $('#fileInput');
        const attachStrip = $('#attachStrip');
        const lightbox = $('#lightbox'), lightboxImg = $('#lightboxImg');
        const toastEl = $('#toast');

        // ─── Toast ───
        let toastTm = null;
        function mostrarToast(msg) {
            toastEl.textContent = msg;
            toastEl.classList.add('visivel');
            clearTimeout(toastTm);
            toastTm = setTimeout(() => toastEl.classList.remove('visivel'), 2600);
        }

        // ─── Lightbox ───
        function abrirLightbox(dataUrl) {
            lightboxImg.src = dataUrl;
            lightbox.classList.add('visivel');
        }
        lightbox.addEventListener('click', () => lightbox.classList.remove('visivel'));

        // ─── UI helpers ───
        function renderEmpty() {
            if (state.jaTemMensagem) return;
            logEl.innerHTML = `
                <div class="empty">
                    <div class="empty-icon">✨</div>
                    <div class="empty-title">Oi! Como posso ajudar?</div>
                    <div class="empty-hint">Pergunte qualquer coisa ou anexe uma imagem clicando em 📎.</div>
                </div>`;
        }
        function limparEmpty() {
            const empty = logEl.querySelector('.empty');
            if (empty) empty.remove();
            state.jaTemMensagem = true;
        }

        function addMsgUser(texto, imgs) {
            limparEmpty();
            const el = document.createElement('div');
            el.className = 'msg user';
            if (texto) el.appendChild(document.createTextNode(texto));
            if (imgs && imgs.length) {
                const wrap = document.createElement('div');
                wrap.className = 'user-imgs';
                imgs.forEach(img => {
                    const i = document.createElement('img');
                    i.src = img.dataUrl;
                    i.alt = img.name;
                    i.addEventListener('click', () => abrirLightbox(img.dataUrl));
                    wrap.appendChild(i);
                });
                el.appendChild(wrap);
            }
            logEl.appendChild(el);
            logEl.scrollTop = logEl.scrollHeight;
            return el;
        }

        function addMsgIA(texto) {
            limparEmpty();
            const el = document.createElement('div');
            el.className = 'msg ia';
            el.innerHTML = mdRender(texto);

            const acts = document.createElement('div');
            acts.className = 'msg-actions';

            const btnCopy = document.createElement('button');
            btnCopy.className = 'msg-action';
            btnCopy.innerHTML = '📋';
            btnCopy.title = 'Copiar';
            btnCopy.addEventListener('click', e => {
                e.stopPropagation();
                const ok = () => {
                    btnCopy.innerHTML = '✓';
                    btnCopy.classList.add('ok');
                    setTimeout(() => { btnCopy.innerHTML = '📋'; btnCopy.classList.remove('ok'); }, 1400);
                };
                copiarTexto(texto, ok);
            });

            const btnRegen = document.createElement('button');
            btnRegen.className = 'msg-action';
            btnRegen.innerHTML = '↻';
            btnRegen.title = 'Regerar resposta';
            btnRegen.addEventListener('click', e => {
                e.stopPropagation();
                regenerar();
            });

            acts.appendChild(btnCopy);
            acts.appendChild(btnRegen);
            el.appendChild(acts);

            logEl.appendChild(el);
            logEl.scrollTop = logEl.scrollHeight;
            return el;
        }

        function addMsgSys(texto) {
            limparEmpty();
            const el = document.createElement('div');
            el.className = 'msg sys';
            el.textContent = texto;
            logEl.appendChild(el);
            logEl.scrollTop = logEl.scrollHeight;
            return el;
        }

        function addMsgErro(texto) {
            limparEmpty();
            const el = document.createElement('div');
            el.className = 'msg erro';
            el.textContent = texto;
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

        function copiarTexto(texto, onOk) {
            try {
                navigator.clipboard.writeText(texto).then(onOk).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = texto;
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); onOk(); } catch (_) {}
                    ta.remove();
                });
            } catch (_) {}
        }

        // ─── Anexos ───
        function renderAnexos() {
            attachStrip.innerHTML = '';
            if (!state.anexos.length) {
                attachStrip.classList.remove('visivel');
                attachBtn.classList.remove('ativo');
                return;
            }
            attachStrip.classList.add('visivel');
            attachBtn.classList.add('ativo');
            state.anexos.forEach(a => {
                const w = document.createElement('div');
                w.className = 'attach-thumb';
                const im = document.createElement('img');
                im.src = a.dataUrl;
                im.alt = a.name;
                im.title = a.name;
                im.addEventListener('click', () => abrirLightbox(a.dataUrl));
                const rm = document.createElement('button');
                rm.className = 'rm';
                rm.textContent = '✕';
                rm.title = 'Remover';
                rm.addEventListener('click', e => {
                    e.stopPropagation();
                    state.anexos = state.anexos.filter(x => x.id !== a.id);
                    renderAnexos();
                    atualizarModeloParaVisao();
                });
                w.appendChild(im);
                w.appendChild(rm);
                attachStrip.appendChild(w);
            });
        }

        async function anexarArquivo(file) {
            if (!file || !file.type.startsWith('image/')) return;
            if (state.anexos.length >= 5) {
                mostrarToast('Máximo de 5 imagens por vez.');
                return;
            }
            try {
                const a = await processarImagem(file);
                state.anexos.push(a);
                renderAnexos();
                atualizarModeloParaVisao();
            } catch (e) {
                mostrarToast('❌ ' + (e.message || 'Falha ao anexar'));
            }
        }

        function atualizarModeloParaVisao() {
            if (!state.anexos.length) return;
            const atual = MODELOS.find(m => m.id === state.modelo);
            if (atual && atual.vision) return;
            // Auto-switch para primeiro modelo de visão
            const visao = MODELOS.find(m => m.vision);
            if (visao) {
                state.modelo = visao.id;
                saveModel(state.modelo);
                modelSel.value = visao.id;
                addMsgSys('👁 Modelo trocado para ' + visao.nome + ' (suporta imagens).');
            }
        }

        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            for (const f of fileInput.files) anexarArquivo(f);
            fileInput.value = '';
        });

        // Colar imagem
        inputEl.addEventListener('paste', e => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const files = [];
            for (const item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const f = item.getAsFile();
                    if (f) files.push(f);
                }
            }
            if (files.length) {
                e.preventDefault();
                files.forEach(anexarArquivo);
            }
        });

        // Arrastar & soltar
        let dragDepth = 0;
        panel.addEventListener('dragenter', e => {
            if (!e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            dragDepth++;
            panel.classList.add('dragover');
        });
        panel.addEventListener('dragover', e => {
            if (!e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
        });
        panel.addEventListener('dragleave', e => {
            if (!e.dataTransfer?.types?.includes('Files')) return;
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) panel.classList.remove('dragover');
        });
        panel.addEventListener('drop', e => {
            e.preventDefault();
            dragDepth = 0;
            panel.classList.remove('dragover');
            if (!e.dataTransfer?.files?.length) return;
            for (const f of e.dataTransfer.files) {
                if (f.type.startsWith('image/')) anexarArquivo(f);
            }
        });

        // ─── Modal key ───
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
                addMsgSys('✓ Chave salva. Pode conversar!');
                setTimeout(() => inputEl.focus(), 100);
            } else {
                addMsgSys('Chave removida.');
            }
        }
        function copiarUrl() {
            const btn = $('#copyUrl');
            copiarTexto(KEYS_URL, () => {
                btn.classList.add('copiado');
                btn.textContent = '✓';
                setTimeout(() => { btn.classList.remove('copiado'); btn.textContent = '📋'; }, 1400);
            });
        }

        // ─── Chamada da API ───
        async function chamarAPI() {
            const controller = new AbortController();
            state.abortController = controller;
            state.enviando = true;

            sendBtn.classList.add('loading', 'stop');
            sendBtn.querySelector('.send-label').textContent = 'Parar';

            const indicador = addTyping();

            try {
                const resposta = await window._apis.groq(
                    {
                        mensagens: state.mensagens,
                        modelo: state.modelo,
                        maxTokens: 4096
                    },
                    { signal: controller.signal, forceRefresh: true }
                );

                indicador.remove();
                addMsgIA(resposta);
                state.mensagens.push({ role: 'assistant', content: resposta });
            } catch (e) {
                indicador.remove();
                if (e.name === 'AbortError') {
                    addMsgSys('Geração interrompida.');
                } else {
                    addMsgErro('⚠ ' + (e.message || 'Erro na chamada'));
                }
            } finally {
                state.enviando = false;
                state.abortController = null;
                sendBtn.classList.remove('loading', 'stop');
                sendBtn.querySelector('.send-label').textContent = 'Enviar';
                inputEl.focus();
            }
        }

        // ─── Enviar ───
        async function enviar() {
            if (state.enviando) return;

            const texto = inputEl.value.trim();
            const imgs = state.anexos.slice();
            if (!texto && !imgs.length) return;

            if (!window._apis?.groq) {
                addMsgErro('Serviço não registrado. Recarregue a página.');
                return;
            }
            if (!window._apis.getKey('groq')) {
                abrirModal();
                return;
            }

            // Monta conteúdo
            let content;
            if (imgs.length) {
                content = [];
                if (texto) content.push({ type: 'text', text: texto });
                imgs.forEach(i => content.push({ type: 'image_url', image_url: { url: i.dataUrl } }));
            } else {
                content = texto;
            }

            inputEl.value = '';
            inputEl.style.height = 'auto';
            state.anexos = [];
            renderAnexos();

            addMsgUser(texto, imgs);
            state.mensagens.push({ role: 'user', content });

            await chamarAPI();
        }

        // ─── Regerar ───
        async function regenerar() {
            if (state.enviando) return;
            const ultima = state.mensagens[state.mensagens.length - 1];
            if (ultima?.role === 'assistant') {
                state.mensagens.pop();
                const ias = logEl.querySelectorAll('.msg.ia');
                if (ias.length) ias[ias.length - 1].remove();
            }
            if (!state.mensagens.some(m => m.role === 'user')) return;
            await chamarAPI();
        }

        // ─── Parar ───
        function parar() {
            if (state.abortController) {
                state.abortController.abort();
            }
        }

        // ─── Eventos ───
        sendBtn.addEventListener('click', () => {
            if (state.enviando) parar();
            else enviar();
        });

        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (state.enviando) return;
                enviar();
            }
            if (e.key === 'Escape' && state.enviando) {
                e.preventDefault();
                parar();
            }
        });
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(130, inputEl.scrollHeight) + 'px';
        });

        modelSel.addEventListener('change', () => {
            state.modelo = modelSel.value;
            saveModel(state.modelo);
            atualizarModeloParaVisao();
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
        modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });

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
