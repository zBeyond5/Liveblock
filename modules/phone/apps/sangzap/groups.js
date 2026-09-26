// modules/phone/apps/sangzap/groups.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.groups) return;

    const G = {};

    G.create = async function(name, memberNums, avatar) {
        const myNumber = ctx.myNumber;
        const members = [...new Set([...memberNums, myNumber])];
        if (members.length < 3) throw new Error('mínimo 3 membros');
        const chatId = S.groupChatId();
        const now = Date.now();
        const doc = {
            kind: 'group',
            name: S.sanitize(name || 'Grupo').slice(0, 40),
            avatar: avatar || '',
            members,
            admins: [myNumber],
            createdAt: now,
            updatedAt: now,
            lastMessage: '',
            lastMessageAt: 0
        };
        await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, doc);
        await ctx.bridge.firestore.request('POST',
            `/sangzap_chats/${chatId}/messages?documentId=${S.msgId()}`,
            { from: myNumber, kind: 'system', body: 'Grupo criado', sentAt: now });
        return { id: chatId, ...doc };
    };

    G.addMember = async function(chatId, number) {
        const myNumber = ctx.myNumber;
        const doc = await ctx.bridge.firestore.parseDoc('sangzap_chats', chatId);
        if (!doc) return;
        const members = new Set(doc.members || []);
        if (members.has(number)) return;
        members.add(number);
        await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, {
            members: [...members], updatedAt: Date.now()
        });
        await ctx.bridge.firestore.request('POST',
            `/sangzap_chats/${chatId}/messages?documentId=${S.msgId()}`,
            { from: myNumber, kind: 'system',
              body: `${S.shortNum(number)} entrou`, sentAt: Date.now() });
    };

    G.removeMember = async function(chatId, number) {
        const myNumber = ctx.myNumber;
        const doc = await ctx.bridge.firestore.parseDoc('sangzap_chats', chatId);
        if (!doc) return;
        const members = (doc.members || []).filter(n => n !== number);
        await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, {
            members, updatedAt: Date.now()
        });
        const body = number === myNumber ? 'Você saiu' : `${S.shortNum(number)} saiu`;
        await ctx.bridge.firestore.request('POST',
            `/sangzap_chats/${chatId}/messages?documentId=${S.msgId()}`,
            { from: myNumber, kind: 'system', body, sentAt: Date.now() });
    };

    G.rename = async function(chatId, name) {
        await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, {
            name: S.sanitize(name || '').slice(0, 40), updatedAt: Date.now()
        });
    };

    G.setAvatar = async function(chatId, dataUrl) {
        await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, {
            avatar: dataUrl || '', updatedAt: Date.now()
        });
    };

    G.leave = async function(chatId) {
        await G.removeMember(chatId, ctx.myNumber);
    };

    S.groups = G;
})();
