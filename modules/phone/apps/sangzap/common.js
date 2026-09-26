// modules/phone/apps/sangzap/common.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Sangzap/common] phone ctx ausente'); return; }
    if (window._sangzapCtx) return;

    const S = {};

    // ═══ IDS ═══
    S.chatIdFor = function(a, b) {
        const [x, y] = [String(a), String(b)].sort();
        return x + '-' + y;
    };
    S.groupChatId = function() {
        return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    };
    S.msgId = function() {
        return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    };

    // ═══ FORMAT ═══
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
    S.shortNum = function(n) {
        return String(n || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');
    };

    // ═══ TEXT ═══
    S.sanitize = function(text) {
        return String(text || '').slice(0, 4000);
    };
    S.escape = ctx.esc || (s => String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]));

    // ═══ PREVIEW ═══
    S.preview = function(msg) {
        if (!msg) return '';
        const kind = msg.kind || 'text';
        if (kind === 'audio') return '🎤 Áudio';
        if (kind === 'image') return '📷 Imagem';
        if (kind === 'system') return msg.body || '';
        return S.sanitize(msg.body || '');
    };

    // ═══ UNREAD ═══
    S.countUnread = function(messages, myNumber) {
        if (!Array.isArray(messages)) return 0;
        let n = 0;
        for (const m of messages) {
            if (m && m.from !== myNumber && !m.readAt) n++;
        }
        return n;
    };

    window._sangzapCtx = S;
    window._sangzapCtx.__booted = true;
})();
