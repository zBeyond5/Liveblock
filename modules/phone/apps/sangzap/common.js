// modules/phone/apps/sangzap/common.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Sangzap/common] phone ctx ausente'); return; }
    if (window._sangzapCtx) return;

    const S = {};

    // ═══ IDS ═══
    S.chatIdFor = (a, b) => [String(a), String(b)].sort().join('-');
    S.groupChatId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    S.msgId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // ═══ FORMAT — TEMPO ═══
    S.fmtTime = function(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        if (d.toDateString() === now.toDateString()) return hh + ':' + mm;
        const dd = String(d.getDate()).padStart(2, '0');
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mo + ' ' + hh + ':' + mm;
    };
    S.fmtRelative = function(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 60000) return 'agora';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'min';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
        if (diff < 604800000) return Math.floor(diff / 86400000) + 'd';
        return S.fmtTime(ts);
    };
    S.timeAgo = function(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        const s = Math.floor(diff / 1000);
        if (s < 60) return 'agora';
        const m = Math.floor(s / 60);
        if (m < 60) return `há ${m} min`;
        const h = Math.floor(m / 60);
        if (h < 24) return `há ${h}h`;
        const d = Math.floor(h / 24);
        if (d < 7) return `há ${d}d`;
        return S.fmtTime(ts);
    };
    S.shortNum = (n) => String(n || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');

    // ═══ FORMAT — DURAÇÃO / TAMANHO ═══
    S.fmtDur = function(ms) {
        if (!Number.isFinite(ms) || ms < 0) return '0:00';
        const total = Math.floor(ms / 1000);
        const s = total % 60;
        const m = Math.floor(total / 60) % 60;
        const h = Math.floor(total / 3600);
        const ss = String(s).padStart(2, '0');
        if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + ss;
        return m + ':' + ss;
    };
    S.fmtBytes = function(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
        if (bytes < 1024) return Math.floor(bytes) + ' B';
        const units = ['KB', 'MB', 'GB'];
        let v = bytes / 1024, i = 0;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' ' + units[i];
    };

    // ═══ FORMAT — DATA / SEPARADORES ═══
    S.dateLabel = function(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const diff = Math.round((today - target) / 86400000);
        if (diff === 0) return 'Hoje';
        if (diff === 1) return 'Ontem';
        if (diff === 2) return 'Anteontem';
        if (d.getFullYear() === now.getFullYear()) {
            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        }
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    S.sameDay = function(a, b) {
        if (!a || !b) return false;
        const da = new Date(a), db = new Date(b);
        return da.getFullYear() === db.getFullYear()
            && da.getMonth() === db.getMonth()
            && da.getDate() === db.getDate();
    };
    S.withDateSeparators = function(messages) {
        if (!Array.isArray(messages)) return [];
        const out = [];
        let lastTs = 0;
        for (const m of messages) {
            if (!m || !m.sentAt) { out.push(m); continue; }
            if (!lastTs || !S.sameDay(lastTs, m.sentAt)) {
                out.push({ _sep: true, ts: m.sentAt, label: S.dateLabel(m.sentAt) });
            }
            out.push(m);
            lastTs = m.sentAt;
        }
        return out;
    };

    // ═══ TEXT — SANITIZE / ESCAPE ═══
    S.sanitize = (text) => String(text || '').slice(0, 4000);
    S.escape = ctx.esc || (s => String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]));

    // ═══ TEXT — MARKUP ═══
    const SLOT = '\uE000';
    function applyMarkup(t) {
        const slots = [];
        t = t.replace(/`([^`\n]+)`/g, (_, inner) => {
            const i = slots.length;
            slots.push(inner);
            return SLOT + i + SLOT;
        });
        t = t.replace(/(^|[^\w])\*([^\s\*](?:[^\*\n]*?[^\s\*])?)\*(?=[^\w]|$)/g, '$1<strong>$2</strong>');
        t = t.replace(/(^|[^\w])_([^\s_](?:[^_\n]*?[^\s_])?)_(?=[^\w]|$)/g, '$1<em>$2</em>');
        t = t.replace(/(^|[^\w])~([^\s~](?:[^~\n]*?[^\s~])?~)?/g, (m, pre, body) => {
            if (!body) return m;
            return pre + '<del>' + body.replace(/~$/, '') + '</del>';
        });
        t = t.replace(new RegExp(SLOT + '(\\d+)' + SLOT, 'g'), (_, i) =>
            '<code class="sz-code">' + slots[+i] + '</code>');
        return t;
    }

    // ═══ TEXT — LINKIFY + MENÇÕES + MARKUP ═══
    S.renderText = function(text, opts) {
        opts = opts || {};
        if (!text) return '';
        const s = S.escape(String(text));
        const myName = opts.myName ? String(opts.myName).toLowerCase() : '';

        const urlRe = /\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
        const parts = [];
        let last = 0, m;
        while ((m = urlRe.exec(s))) {
            if (m.index > last) parts.push({ u: false, v: s.slice(last, m.index) });
            let url = m[0];
            const tail = url.match(/[.,;:!?)\]}]+$/);
            if (tail) url = url.slice(0, -tail[0].length);
            parts.push({ u: true, v: url });
            last = m.index + url.length;
            urlRe.lastIndex = last;
        }
        if (last < s.length) parts.push({ u: false, v: s.slice(last) });

        return parts.map(p => {
            if (p.u) {
                const href = /^https?:/i.test(p.v) ? p.v : 'http://' + p.v;
                return `<a class="sz-link" href="${href}" target="_blank" rel="noopener noreferrer">${p.v}</a>`;
            }
            let t = p.v;
            t = t.replace(/(^|[^\w])@([\w\u00C0-\u017F]+)/g, (_, pre, name) => {
                const mine = myName && name.toLowerCase() === myName;
                return pre + `<span class="sz-mention"${mine ? ' data-me="1"' : ''}>@${name}</span>`;
            });
            t = applyMarkup(t);
            return t;
        }).join('');
    };

    // ═══ TEXT — PREVIEW ═══
    S.preview = function(msg) {
        if (!msg) return '';
        const kind = msg.kind || 'text';
        if (kind === 'audio') return '🎤 Áudio';
        if (kind === 'image') return '📷 Imagem';
        if (kind === 'video') return '🎬 Vídeo';
        if (kind === 'doc')   return '📄 Documento';
        if (kind === 'location') return '📍 Localização';
        if (kind === 'contact')  return '👤 Contato';
        if (kind === 'story-reply') return '💬 Respondeu ao story';
        if (kind === 'system') return msg.body || '';
        return S.sanitize(msg.body || '');
    };

    S.countUnread = function(messages, myNumber) {
        if (!Array.isArray(messages)) return 0;
        let n = 0;
        for (const m of messages) if (m && m.from !== myNumber && !m.readAt) n++;
        return n;
    };

    S.extractMentions = function(text) {
        const out = new Set();
        const re = /(^|[^\w])@([\w\u00C0-\u017F]+)/g;
        let m;
        while ((m = re.exec(String(text || '')))) out.add(m[2].toLowerCase());
        return [...out];
    };

    S.mentionsMe = function(text, myName) {
        if (!myName) return false;
        return S.extractMentions(text).includes(String(myName).toLowerCase());
    };

    S.recentEmojis = ['❤️', '😂', '😮', '😢', '👏', '🔥', '👍', '🎉'];

    // ═══ FIRESTORE ADAPTER ═══
    // O hub expõe Firestore REST cru. O Sangzap trabalha com objetos JS planos.
    // Este adapter traduz corpo ↔ campos, adiciona updateMask em PATCH, e
    // normaliza resposta de lista/doc único. Idempotente.
    (function installFirestoreAdapter() {
        const fs = ctx.bridge?.firestore;
        if (!fs || fs.__sangzapAdapted) {
            if (fs?.__sangzapAdapted) console.log('[Sangzap] Firestore adapter já instalado');
            else console.warn('[Sangzap] Firestore adapter não instalado — bridge.firestore ausente');
            return;
        }
        fs.__sangzapAdapted = true;
        const orig = fs.request.bind(fs);

        function toFsValue(v) {
            if (v === null || v === undefined) return { nullValue: null };
            if (typeof v === 'string')  return { stringValue: v };
            if (typeof v === 'boolean') return { booleanValue: v };
            if (typeof v === 'number') {
                return Number.isInteger(v)
                    ? { integerValue: String(v) }
                    : { doubleValue: v };
            }
            if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
            if (typeof v === 'object') {
                const fields = {};
                for (const k in v) fields[k] = toFsValue(v[k]);
                return { mapValue: { fields } };
            }
            return { nullValue: null };
        }

        function fromFsValue(v) {
            if (!v || typeof v !== 'object') return null;
            if ('nullValue' in v)    return null;
            if ('stringValue' in v)  return v.stringValue;
            if ('booleanValue' in v) return v.booleanValue;
            if ('integerValue' in v) return parseInt(v.integerValue, 10);
            if ('doubleValue' in v)  return v.doubleValue;
            if ('timestampValue' in v) return v.timestampValue;
            if ('arrayValue' in v)   return (v.arrayValue?.values || []).map(fromFsValue);
            if ('mapValue' in v) {
                const out = {};
                const f = v.mapValue?.fields || {};
                for (const k in f) out[k] = fromFsValue(f[k]);
                return out;
            }
            return null;
        }

        function docToObj(doc) {
            if (!doc || typeof doc !== 'object') return null;
            const id  = (doc.name || '').split('/').pop() || '';
            const fields = doc.fields || {};
            const data = {};
            for (const k in fields) data[k] = fromFsValue(fields[k]);
            return Object.assign({ id, data: () => ({ ...data }) }, data);
        }

        function bodyToFs(body) {
            if (!body || typeof body !== 'object') return body;
            if ('fields' in body && typeof body.fields === 'object') return body;
            const fields = {};
            for (const k in body) fields[k] = toFsValue(body[k]);
            return { fields };
        }

        fs.request = async function(method, path, body, extraQuery) {
            const m = String(method || 'GET').toUpperCase();
            let p = path || '';
            let q = extraQuery || '';

            const qi = p.indexOf('?');
            if (qi !== -1) {
                q = p.slice(qi + 1) + (q ? '&' + q : '');
                p = p.slice(0, qi);
            }

            let b = bodyToFs(body);

            if (m === 'PATCH' && b && b.fields) {
                const mask = Object.keys(b.fields)
                    .map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k))
                    .join('&');
                q = q ? q + '&' + mask : mask;
            }

            let res;
            try {
                res = await orig(m, p, b, q);
            } catch(e) {
                console.warn('[Sangzap/fs] ' + m + ' ' + p + ' falhou:', e.message);
                throw e;
            }

            if (res && typeof res === 'object') {
                if (Array.isArray(res.documents)) return res.documents.map(docToObj).filter(Boolean);
                if (res.name && res.fields) return docToObj(res);
                if (res.name && !res.fields) {
                    const id = (res.name || '').split('/').pop() || '';
                    return { id, data: () => ({}) };
                }
            }
            return res;
        };

        console.log('[Sangzap] Firestore adapter instalado');
    })();

    // ═══ RTDB ADAPTER (com auth anônima) ═══
    // O hub faz fetch cru sem `?auth=` — as rules do RTDB podem exigir autenticação.
    // Este adapter obtém um idToken anônimo do Identity Toolkit (mesmo projeto),
    // cacheia enquanto válido, e injeta `?auth=` em cada chamada ao RTDB.
    (function installRtdbAdapter() {
        const rtdb = ctx.bridge?.rtdb;
        if (!rtdb || rtdb.__sangzapAdapted) {
            if (rtdb?.__sangzapAdapted) console.log('[Sangzap] RTDB adapter já instalado');
            else console.warn('[Sangzap] RTDB adapter não instalado — bridge.rtdb ausente');
            return;
        }
        rtdb.__sangzapAdapted = true;

        const API_KEY = 'AIzaSyCffa6tw3mSzTJtq_u2AVz9w1PRnTAGJyI';
        const BASE = rtdb.url || 'https://sanghub-ecf46-default-rtdb.firebaseio.com';

        let _token = null;
        let _expiresAt = 0;
        let _authPromise = null;

        async function getToken() {
            if (_token && _expiresAt > Date.now()) return _token;
            if (_authPromise) return _authPromise;
            _authPromise = (async () => {
                try {
                    const res = await fetch(
                        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ returnSecureToken: true })
                        }
                    );
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const d = await res.json();
                    _token = d.idToken;
                    const ttl = Number(d.expiresIn) || 3600;
                    _expiresAt = Date.now() + ttl * 1000 - 60000;
                    return _token;
                } catch(e) {
                    console.warn('[Sangzap/rtdb] auth falhou:', e);
                    return null;
                } finally {
                    _authPromise = null;
                }
            })();
            return _authPromise;
        }

        function buildUrl(path, token) {
            let url = BASE + '/' + path + '.json';
            if (token) url += (url.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(token);
            return url;
        }

        async function request(method, path, body) {
            const token = await getToken();
            const url = buildUrl(path, token);
            const opts = { cache: 'no-store' };
            if (method) {
                opts.method = method;
                if (body !== undefined) {
                    opts.headers = { 'Content-Type': 'application/json' };
                    opts.body = JSON.stringify(body);
                }
            }
            const res = await fetch(url, opts);
            if (!res.ok) {
                if (res.status === 401 && token) {
                    _token = null;
                    _expiresAt = 0;
                }
                return null;
            }
            if (res.status === 204) return null;
            const text = await res.text();
            if (!text) return null;
            try { return JSON.parse(text); } catch(_) { return null; }
        }

        rtdb.get = (path) => request(null, path);
        rtdb.put = async (path, value) => {
            try {
                const r = await request('PUT', path, value);
                return r !== null || true;
            } catch(_) { return false; }
        };
        rtdb.post = async (path, value) => {
            try {
                await request('POST', path, value);
                return true;
            } catch(_) { return false; }
        };
        rtdb.del = async (path) => {
            try {
                await request('DELETE', path);
                return true;
            } catch(_) { return false; }
        };

        console.log('[Sangzap] RTDB adapter instalado');
    })();

    window._sangzapCtx = S;
})();
