// modules/phone/notes.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Phone/notes] shell não inicializado.'); return; }
    if (ctx.notes._loaded) return;
    ctx.notes._loaded = true;

    const bridge = window._hubBridge;
    if (!bridge) return;

    // ═══ CONFIG ═══
    const COL_NOTES = 'phone_notes';
    const NOTES_POLL_MS = 9000;
    const LS_PLAYED_NOTES = 'sanghub_phone_notes_played';

    // ═══ STATE ═══
    let _rec = null;
    let _recChunks = [];
    let _recTarget = null;
    let _recStartedAt = 0;
    let _recTimer = null;
    let _notesPollTimer = null;
    let _playedNotes = new Set();

    const esc = ctx.esc;
    const el = ctx.el;
    const I = ctx.I;
    const tone = ctx.tone;

    function fmtDur(ms) {
        const s = Math.floor(ms / 1000), m = Math.floor(s / 60), ss = s % 60;
        return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    }
    function fmtNumber(n) {
        if (!n) return '';
        const clean = String(n).replace(/\D/g, '');
        if (clean.length !== 6) return clean;
        return clean.slice(0, 3) + '-' + clean.slice(3);
    }
    function b64ToBlob(b64, mime) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mime || 'audio/webm' });
    }
    function blobToB64(blob) {
        return new Promise(resolve => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result).split(',')[1] || '');
            r.readAsDataURL(blob);
        });
    }

    function loadPlayed() {
        try {
            const raw = localStorage.getItem(LS_PLAYED_NOTES);
            _playedNotes = new Set(raw ? JSON.parse(raw) : []);
        } catch(_) { _playedNotes = new Set(); }
    }
    function savePlayed() {
        const arr = Array.from(_playedNotes).slice(-120);
        _playedNotes = new Set(arr);
        try { localStorage.setItem(LS_PLAYED_NOTES, JSON.stringify(arr)); } catch(_) {}
    }

    // ═══ GRAVAÇÃO ═══
    function _wireNoteButton(btn, target) {
        btn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (_rec) return;
            _startNote(target, btn);
            try { btn.setPointerCapture(e.pointerId); } catch(_) {}
        });
        btn.addEventListener('pointerup', (e) => {
            e.stopPropagation();
            if (!_rec || _recTarget?.number !== target.number) return;
            const r = btn.getBoundingClientRect();
            const inside = e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
            if (inside) _sendNote();
            else _cancelNote();
        });
        btn.addEventListener('pointercancel', (e) => {
            e.stopPropagation();
            if (_rec && _recTarget?.number === target.number) _cancelNote();
        });
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    async function _startNote(target, btn) {
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch(e) { ctx.toast('Microfone negado', 'err'); return; }
        _recChunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        try { _rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }); }
        catch(e) { _rec = new MediaRecorder(stream); }
        _recTarget = target;
        _recStartedAt = Date.now();
        _rec.ondataavailable = (e) => { if (e.data.size > 0) _recChunks.push(e.data); };
        _rec.onerror = () => _cancelNote();
        try { _rec.start(); } catch(e) { _rec = null; stream.getTracks().forEach(t => t.stop()); return; }
        _rec._stream = stream;
        if (btn) btn.classList.add('recording');
        ctx.setRecording?.(true);
        _renderRecOverlay();
        tone.recStart();
        if (_recTimer) clearInterval(_recTimer);
        _recTimer = setInterval(() => {
            const elt = ctx.root?.querySelector('#phRecTimer');
            if (elt) elt.textContent = fmtDur(Date.now() - _recStartedAt);
        }, 250);
    }

    function _renderRecOverlay() {
        if (!ctx.screenEl) return;
        const target = _recTarget || {};
        const ov = el('div', { class: 'ph-rec-overlay', id: 'phRecOverlay' });
        ov.innerHTML = `
            <div class="ph-rec-circle">${I.mic}</div>
            <div class="ph-rec-waves"><span></span><span></span><span></span><span></span><span></span></div>
            <div class="ph-rec-info">
                <div class="name">${esc(target.name || fmtNumber(target.number))}</div>
                <div class="timer" id="phRecTimer">00:00</div>
                <div class="hint">Solte para enviar · arraste para fora para cancelar</div>
            </div>
        `;
        ctx.screenEl.appendChild(ov);
    }

    async function _sendNote() {
        if (!_rec) return;
        const rec = _rec;
        const target = _recTarget;
        const chunks = _recChunks;
        const stream = rec._stream;
        _rec = null; _recTarget = null; _recChunks = [];
        if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
        ctx.setRecording?.(false);
        ctx.root?.querySelectorAll('.ph-note-btn.recording').forEach(b => b.classList.remove('recording'));
        ctx.root?.querySelector('#phRecOverlay')?.remove();

        return new Promise((resolve) => {
            rec.onstop = async () => {
                if (stream) try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
                const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
                if (blob.size < 800) { ctx.toast('Gravação muito curta', 'err'); return resolve(); }
                if (blob.size > 700 * 1024) { ctx.toast('Recado muito longo (max ~3min)', 'err'); return resolve(); }
                tone.recSend();
                ctx.toast('Enviando recado…', 'ok');
                try {
                    const b64 = await blobToB64(blob);
                    const fields = {
                        fromNumber: bridge.firestore.value(ctx.myNumber || ''),
                        fromName: bridge.firestore.value(bridge.player?.name || ''),
                        fromAvatar: bridge.firestore.value(bridge.player?.avatarUrl || ''),
                        toNumber: bridge.firestore.value(target.number),
                        mimeType: bridge.firestore.value(blob.type || 'audio/webm'),
                        audio: bridge.firestore.value(b64),
                        size: bridge.firestore.value(blob.size),
                        createdAt: bridge.firestore.value(Date.now())
                    };
                    await bridge.firestore.request('POST', '/' + COL_NOTES, { fields });
                    ctx.toast('Recado enviado', 'ok');
                } catch(e) { ctx.toast('Falha ao enviar', 'err'); }
                resolve();
            };
            try { rec.stop(); } catch(e) { resolve(); }
        });
    }

    function _cancelNote() {
        const rec = _rec;
        const stream = rec?._stream;
        _rec = null; _recTarget = null; _recChunks = [];
        if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
        ctx.setRecording?.(false);
        ctx.root?.querySelectorAll('.ph-note-btn.recording').forEach(b => b.classList.remove('recording'));
        ctx.root?.querySelector('#phRecOverlay')?.remove();
        if (rec && rec.state !== 'inactive') { try { rec.onstop = null; rec.stop(); } catch(_) {} }
        if (stream) try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
        tone.recCancel();
        ctx.toast('Cancelado', 'err');
    }

    // ═══ RECEBER ═══
    function _startNotesPoll() {
        if (_notesPollTimer) return;
        _notesPollTimer = setInterval(_pollNotes, NOTES_POLL_MS);
        setTimeout(_pollNotes, 3000);
    }
    function _stopPoll() { if (_notesPollTimer) { clearInterval(_notesPollTimer); _notesPollTimer = null; } }

    async function _pollNotes() {
        if (!ctx.myNumber) return;
        try {
            const data = await bridge.firestore.request('GET', '/' + COL_NOTES);
            const docs = data?.documents || [];
            const incoming = [];
            for (const d of docs) {
                const id = d.name.split('/').pop();
                if (_playedNotes.has(id)) continue;
                const parsed = { id, ...bridge.firestore.parseDoc(d) };
                if (parsed.toNumber !== ctx.myNumber) continue;
                if (parsed.fromNumber === ctx.myNumber) continue;
                if (parsed.fromNumber && ctx.contacts.isBlocked?.(parsed.fromNumber)) { _playedNotes.add(id); continue; }
                incoming.push(parsed);
            }
            incoming.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            for (const note of incoming) {
                _playedNotes.add(note.id);
                ctx.setNotifDot?.(true);
                await _playNote(note);
            }
            savePlayed();
        } catch(_) {}
    }

    function _playNote(note) {
        return new Promise(resolve => {
            try {
                const blob = b64ToBlob(note.audio, note.mimeType);
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.autoplay = true;
                ctx.toast('Recado de ' + (note.fromName || fmtNumber(note.fromNumber)), 'ok');
                if (ctx.getMinimized()) ctx.setMinimized(false);
                audio.onended = () => { URL.revokeObjectURL(url); setTimeout(() => ctx.setNotifDot?.(false), 400); resolve(); };
                audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                audio.play().catch(() => resolve());
                window._phoneNoteEl = audio;
            } catch(_) { resolve(); }
        });
    }

    // ═══ ESTILO ═══
    ctx.appendStyle(`
        .ph-rec-overlay {
            position: absolute; inset: 0;
            background: radial-gradient(circle at 50% 60%, rgba(251,113,133,.22), rgba(16,14,32,.97) 55%);
            backdrop-filter: blur(10px);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 18px; z-index: 10; animation: phFadeIn .22s ease; padding: 30px;
        }
        .ph-rec-circle {
            width: 120px; height: 120px; border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, rgba(251,113,133,.4), rgba(244,114,182,.22));
            border: 2px solid rgba(251,113,133,.6);
            display: flex; align-items: center; justify-content: center;
            color: #fff; position: relative;
            box-shadow: 0 20px 60px rgba(251,113,133,.3), inset 0 1px 0 rgba(255,255,255,.18);
        }
        .ph-rec-circle svg { width: 40px; height: 40px; }
        .ph-rec-circle::after {
            content: ''; position: absolute; inset: -8px; border-radius: 50%;
            border: 2px solid rgba(251,113,133,.32);
            animation: phRingGlow 1.6s ease-in-out infinite;
        }
        .ph-rec-waves { display: flex; align-items: center; gap: 4px; height: 34px; }
        .ph-rec-waves span {
            width: 4px; height: 100%;
            background: linear-gradient(180deg, #fb7185, #f472b6);
            border-radius: 2px;
            transform-origin: center;
            animation: phRecWave 0.9s ease-in-out infinite;
        }
        .ph-rec-waves span:nth-child(1){ animation-delay: 0s;   height: 40%; }
        .ph-rec-waves span:nth-child(2){ animation-delay: .1s;  height: 70%; }
        .ph-rec-waves span:nth-child(3){ animation-delay: .2s;  height: 100%; }
        .ph-rec-waves span:nth-child(4){ animation-delay: .15s; height: 60%; }
        .ph-rec-waves span:nth-child(5){ animation-delay: .05s; height: 45%; }
        .ph-rec-info { text-align: center; color: #f1f2f8; }
        .ph-rec-info .name { font-size: 13px; font-weight: 800; margin-bottom: 4px; }
        .ph-rec-info .timer { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; color: #fca5b1; letter-spacing: .04em; }
        .ph-rec-info .hint { font-size: 10px; color: #a8aec4; margin-top: 8px; }
    `);

    // ═══ INIT ═══
    loadPlayed();

    // ═══ EXPORTAR ═══
    Object.assign(ctx.notes, {
        wireNoteButton: _wireNoteButton,
        startNotesPoll: _startNotesPoll,
        stopPoll: _stopPoll,
        sendNote: _sendNote,
        cancelNote: _cancelNote
    });
})();
