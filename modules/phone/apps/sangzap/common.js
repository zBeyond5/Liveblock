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
    S.shortNum = (n) => String(n || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');

    // ═══ TEXT ═══
    S.sanitize = (text) => String(text || '').slice(0, 4000);
    S.escape = ctx.esc || (s => String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]));

    S.preview = function(msg) {
        if (!msg) return '';
        const kind = msg.kind || 'text';
        if (kind === 'audio') return '🎤 Áudio';
        if (kind === 'image') return '📷 Imagem';
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

    // ═══ RECENTES ═══
    S.recentEmojis = ['❤️', '😂', '😮', '😢', '👏', '🔥', '👍', '🎉'];

    // ═══ TIME-AGO (PT-BR) ═══
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

    // ═══ MENÇÕES ═══
    S.extractMentions = function(text) {
        const out = new Set();
        const re = /@([\w\u00C0-\u017F]+)/g;
        let m;
        while ((m = re.exec(text))) out.add(m[1].toLowerCase());
        return [...out];
    };

    window._sangzapCtx = S;
})();
