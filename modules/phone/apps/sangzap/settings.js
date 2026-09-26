// modules/phone/apps/sangzap/settings.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.settings) return;

    const ST = {};
    const AV_SIZE = 256;
    const JPEG_Q = 0.85;
    const MAX_FILE = 8 * 1024 * 1024;

    // ═══ CRUD ═══
    ST.get = async function(number) {
        try {
            const doc = await ctx.bridge.firestore.parseDoc('sangzap_profiles', number);
            return doc || { displayName: '', bio: '', recado: '', avatar: '', updatedAt: 0 };
        } catch(_) { return { displayName: '', bio: '', recado: '', avatar: '', updatedAt: 0 }; }
    };

    ST.save = async function(number, patch) {
        const doc = { ...patch, updatedAt: Date.now() };
        await ctx.bridge.firestore.request('PATCH', `/sangzap_profiles/${number}`, doc);
        if (patch.avatar !== undefined) {
            try {
                await ctx.bridge.firestore.request('PATCH', `/phone_numbers/${number}`, {
                    avatarUrl: patch.avatar || ''
                });
            } catch(_) {}
        }
        return doc;
    };

    // ═══ IMAGE PIPELINE ═══
    function cropSquare(img) {
        const sw = img.naturalWidth || img.width;
        const sh = img.naturalHeight || img.height;
        if (!sw || !sh) throw new Error('imagem vazia');
        const side = Math.min(sw, sh);
        const sx = (sw - side) / 2;
        const sy = (sh - side) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = AV_SIZE; canvas.height = AV_SIZE;
        const g = canvas.getContext('2d');
        try { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; } catch(_) {}
        g.drawImage(img, sx, sy, side, side, 0, 0, AV_SIZE, AV_SIZE);
        return canvas.toDataURL('image/jpeg', JPEG_Q);
    }

    function pickFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.cssText = 'position:fixed;top:-100px;left:-100px;width:0;height:0;opacity:0;';
            document.body.appendChild(input);
            let done = false;
            const fin = (f) => { if (done) return; done = true; try { input.remove(); } catch(_) {} resolve(f || null); };
            input.addEventListener('change', () => fin(input.files?.[0] || null));
            input.addEventListener('cancel', () => fin(null));
            setTimeout(() => { if (!done && (!input.files || !input.files.length)) fin(null); }, 60000);
            input.click();
        });
    }

    function loadImgFromFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => resolve({ img, url });
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load falhou')); };
            img.src = url;
        });
    }

    ST.pickAndCropSquare = async function() {
        const file = await pickFile();
        if (!file) return null;
        if (!/^image\//i.test(file.type)) { ctx.toast?.('Arquivo não é imagem', 'err'); return null; }
        if (file.size > MAX_FILE) { ctx.toast?.('Imagem muito grande', 'err'); return null; }
        const { img, url } = await loadImgFromFile(file);
        try { return cropSquare(img); }
        finally { try { URL.revokeObjectURL(url); } catch(_) {} }
    };

    // ═══ RENDER ═══
    ST.render = function(body, myNumber) {
        body.innerHTML = `<div class="sz-profile-loading">Carregando…</div>`;
        ST.get(myNumber).then(prof => {
            const avatar = prof.avatar
                ? `<img src="${S.escape(prof.avatar)}" alt="" />`
                : `<span class="sz-av-fallback">${S.escape((prof.displayName || myNumber || '?')[0].toUpperCase())}</span>`;

            body.innerHTML = `
                <div class="sz-settings">
                    <div class="sz-settings-hero">
                        <div class="sz-avatar sz-avatar-lg" id="szProfAv">${avatar}</div>
                        <div class="sz-settings-num">${S.escape(S.shortNum(myNumber))}</div>
                    </div>

                    <div class="sz-section">
                        <div class="sz-section-title">Perfil</div>
                        <input class="sz-input" id="szProfName" type="text" maxlength="32"
                            value="${S.escape(prof.displayName || '')}"
                            placeholder="Seu nome" />
                        <textarea class="sz-input sz-textarea" id="szProfBio" maxlength="140"
                            placeholder="Bio curta">${S.escape(prof.bio || '')}</textarea>
                        <div class="sz-profile-photo-actions">
                            <button class="sz-btn" id="szProfPick">Trocar foto</button>
                            <button class="sz-btn ghost" id="szProfClear">Remover</button>
                        </div>
                    </div>

                    <div class="sz-section">
                        <div class="sz-section-title">Recado</div>
                        <textarea class="sz-input sz-textarea" id="szProfRecado" maxlength="120"
                            placeholder="Uma frase que aparece no topo das conversas">${S.escape(prof.recado || '')}</textarea>
                        <div class="sz-field-hint">Visível para todos os contatos.</div>
                    </div>

                    <div class="sz-section">
                        <div class="sz-section-title">Aparência</div>
                        <div class="sz-option-row">
                            <div class="sz-option-label">Tema</div>
                            <div class="sz-radio-group" data-key="theme">
                                <button class="sz-radio${(prof.theme||'verde') === 'verde' ? ' active' : ''}" data-value="verde">Verde</button>
                                <button class="sz-radio${prof.theme === 'roxo' ? ' active' : ''}" data-value="roxo">Roxo</button>
                                <button class="sz-radio${prof.theme === 'azul' ? ' active' : ''}" data-value="azul">Azul</button>
                            </div>
                        </div>
                    </div>

                    <div class="sz-section">
                        <div class="sz-section-title">Privacidade</div>
                        <div class="sz-toggle-row">
                            <div class="sz-toggle-text">
                                <div class="sz-toggle-label">Confirmação de leitura</div>
                                <div class="sz-toggle-sub">Enviar ✓✓ quando ler</div>
                            </div>
                            <label class="sz-switch">
                                <input type="checkbox" id="szProfRead" ${prof.readReceipts !== false ? 'checked' : ''} />
                                <span class="sz-switch-track"></span>
                            </label>
                        </div>
                    </div>

                    <button class="sz-btn sz-btn-primary" id="szProfSave">Salvar</button>
                    <div class="sz-profile-foot">Sangzap · perfil local ao telefone</div>
                </div>
            `;

            const av = body.querySelector('#szProfAv');
            let pendingAvatar = null;
            let pendingTheme = prof.theme || 'verde';

            body.querySelector('#szProfPick').addEventListener('click', async () => {
                const dataUrl = await ST.pickAndCropSquare();
                if (!dataUrl) return;
                pendingAvatar = dataUrl;
                av.innerHTML = `<img src="${S.escape(dataUrl)}" alt="" />`;
                ctx.toast?.('Foto pronta — clique em Salvar', 'ok');
            });
            body.querySelector('#szProfClear').addEventListener('click', () => {
                pendingAvatar = '';
                av.innerHTML = `<span class="sz-av-fallback">${S.escape((body.querySelector('#szProfName').value || '?')[0].toUpperCase())}</span>`;
            });

            body.querySelectorAll('.sz-radio').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingTheme = btn.dataset.value;
                    body.querySelectorAll('.sz-radio').forEach(b => b.classList.toggle('active', b === btn));
                });
            });

            body.querySelector('#szProfSave').addEventListener('click', async () => {
                const name = body.querySelector('#szProfName').value.trim().slice(0, 32);
                const bio = body.querySelector('#szProfBio').value.trim().slice(0, 140);
                const recado = body.querySelector('#szProfRecado').value.trim().slice(0, 120);
                const readReceipts = body.querySelector('#szProfRead').checked;
                const patch = { displayName: name, bio, recado, theme: pendingTheme, readReceipts };
                if (pendingAvatar !== null) patch.avatar = pendingAvatar;
                try {
                    await ST.save(myNumber, patch);
                    pendingAvatar = null;
                    document.documentElement.dataset.szTheme = pendingTheme;
                    ctx.toast?.('Perfil salvo', 'ok');
                } catch(e) {
                    console.warn('[Sangzap/settings] save:', e);
                    ctx.toast?.('Falha ao salvar', 'err');
                }
            });
        });
    };

    S.settings = ST;
})();
