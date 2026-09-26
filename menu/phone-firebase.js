
(function () {
    'use strict';
    if (!window._hubBridge) { console.warn('[Phone Firebase] hub ausente'); return; }
    if (window._hubBridge.phone) return;

    // ═══ CONFIG DO NOVO PROJETO ═══
    const PROJECT_ID = 'SEU_NOVO_PROJECT_ID';
    const API_KEY    = 'SUA_NOVA_WEB_API_KEY';
    const RTDB_URL   = 'https://SEU_NOVO_PROJECT-default-rtdb.firebaseio.com';
    const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
    const FS_AUTH_KEY = 'sanghub_phone_fs_auth';   // chave própria p/ não colidir com o hub

    function configured() {
        return PROJECT_ID !== 'SEU_NOVO_PROJECT_ID' && API_KEY !== 'SUA_NOVA_WEB_API_KEY';
    }

    // ═══ AUTH (mesmo padrão do hub, chave própria) ═══
    let _fsAuth = null;
    function _loadAuth() {
        try { return JSON.parse(localStorage.getItem(FS_AUTH_KEY) || 'null'); } catch(_) { return null; }
    }
    function _saveAuth(a) { try { localStorage.setItem(FS_AUTH_KEY, JSON.stringify(a)); } catch(_) {} }

    async function _signUp() {
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnSecureToken: true })
        });
        if (!res.ok) throw new Error('auth HTTP ' + res.status);
        const d = await res.json();
        const ttl = Number(d.expiresIn) || 3600;
        return { idToken: d.idToken, refreshToken: d.refreshToken, expiresAt: Date.now() + ttl * 1000 - 60000 };
    }
    async function _refresh(refreshToken) {
        const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
        });
        if (!res.ok) throw new Error('refresh HTTP ' + res.status);
        const d = await res.json();
        const ttl = Number(d.expires_in) || 3600;
        return { idToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + ttl * 1000 - 60000 };
    }
    async function _getToken() {
        _fsAuth = _fsAuth || _loadAuth();
        if (_fsAuth && _fsAuth.expiresAt > Date.now()) return _fsAuth.idToken;
        try {
            _fsAuth = (_fsAuth && _fsAuth.refreshToken) ? await _refresh(_fsAuth.refreshToken) : await _signUp();
        } catch(_) { _fsAuth = await _signUp(); }
        _saveAuth(_fsAuth);
        return _fsAuth.idToken;
    }

    // ═══ VALUE / PARSEDOC (mesma assinatura do hub) ═══
    function value(v) {
        if (v === null || v === undefined) return { nullValue: null };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        return { stringValue: String(v) };
    }
    function parseDoc(doc) {
        const out = {};
        const fields = doc?.fields || {};
        for (const k in fields) {
            const v = fields[k];
            const t = Object.keys(v)[0];
            out[k] = t === 'integerValue' ? parseInt(v[t], 10) : v[t];
        }
        return out;
    }

    // ═══ REQUEST (mesma assinatura do hub) ═══
    async function request(method, path, body, extraQuery) {
        if (!configured()) throw new Error('Phone Firestore não configurado');
        const token = await _getToken();
        const url = FS_BASE + path + (extraQuery ? '?' + extraQuery : '');
        const res = await fetch(url, {
            method,
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error('FS HTTP ' + res.status + ' (' + path + ')');
        if (res.status === 204) return null;
        return res.json();
    }

    // ═══ RTDB ═══
    function _rtdbUrl(path) { return RTDB_URL + '/' + path + '.json'; }
    async function rtdbGet(path) {
        try {
            const res = await fetch(_rtdbUrl(path), { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.json();
        } catch(_) { return null; }
    }
    async function rtdbPut(path, val) {
        try {
            const res = await fetch(_rtdbUrl(path), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(val)
            });
            return res.ok;
        } catch(_) { return false; }
    }
    async function rtdbPost(path, val) {
        try {
            const res = await fetch(_rtdbUrl(path), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(val)
            });
            return res.ok;
        } catch(_) { return false; }
    }
    async function rtdbDel(path) {
        try { await fetch(_rtdbUrl(path), { method: 'DELETE' }); } catch(_) {}
    }

    // ═══ EXPORT ═══
    window._hubBridge.phone = {
        firestore: { configured, value, parseDoc, request },
        rtdb: { url: RTDB_URL, get: rtdbGet, put: rtdbPut, post: rtdbPost, del: rtdbDel }
    };
})();
