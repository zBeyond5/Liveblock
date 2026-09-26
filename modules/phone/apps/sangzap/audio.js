// modules/phone/apps/sangzap/audio.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.audio) return;

    const A = {};
    const MAX_MS = 60000;
    const MAX_BYTES = 500 * 1024;
    const MIME = 'audio/webm;codecs=opus';

    let _rec = null, _chunks = [], _startTs = 0, _stopTimer = null;
    let _onState = null, _onDone = null;

    function supported() {
        return typeof MediaRecorder !== 'undefined' &&
               typeof navigator.mediaDevices?.getUserMedia === 'function';
    }

    A.start = async function(onState, onDone) {
        if (_rec) return false;
        if (!supported()) { ctx.toast?.('Gravação não suportada', 'err'); return false; }

        _onState = onState; _onDone = onDone;

        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch(_) { ctx.toast?.('Sem acesso ao microfone', 'err'); return false; }

        try {
            const mime = MediaRecorder.isTypeSupported(MIME) ? MIME : '';
            _rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
        } catch(_) {
            stream.getTracks().forEach(t => t.stop());
            ctx.toast?.('Falha ao gravar', 'err');
            return false;
        }

        _chunks = []; _startTs = Date.now();
        _onState?.('rec');

        _rec.ondataavailable = (e) => { if (e.data && e.data.size) _chunks.push(e.data); };
        _rec.onerror = () => { _cleanup(); _onState?.('idle'); };
        _rec.onstop = () => {
            const ms = Date.now() - _startTs;
            _cleanup(); _onState?.('idle');
            if (ms < 600) { ctx.toast?.('Muito curto', 'err'); return; }
            const blob = new Blob(_chunks, { type: _chunks[0]?.type || MIME });
            if (blob.size > MAX_BYTES) { ctx.toast?.('Áudio muito grande', 'err'); return; }
            const fr = new FileReader();
            fr.onload = () => {
                const b64 = String(fr.result || '').split(',')[1] || '';
                _onDone?.({ audio: b64, mime: blob.type, size: blob.size, duration: ms });
            };
            fr.onerror = () => ctx.toast?.('Falha ao ler áudio', 'err');
            fr.readAsDataURL(blob);
        };

        _rec.start(250);
        _stopTimer = setTimeout(() => A.stop(), MAX_MS);
        return true;
    };

    A.stop = function() {
        if (_stopTimer) { clearTimeout(_stopTimer); _stopTimer = null; }
        try { if (_rec && _rec.state === 'recording') _rec.stop(); } catch(_) {}
    };

    A.cancel = function() {
        if (_stopTimer) { clearTimeout(_stopTimer); _stopTimer = null; }
        _onDone = null;
        try { if (_rec && _rec.state === 'recording') _rec.stop(); } catch(_) {}
        setTimeout(() => { _chunks = []; }, 100);
    };

    A.isRecording = () => !!_rec;
    A.duration = () => (_rec ? Date.now() - _startTs : 0);

    function _cleanup() {
        try { _rec?.stream?.getTracks?.().forEach(t => t.stop()); } catch(_) {}
        _rec = null;
        if (_stopTimer) { clearTimeout(_stopTimer); _stopTimer = null; }
    }

    A.createPlayer = function(msg) {
        const wrap = document.createElement('div');
        wrap.className = 'sz-audio';
        const mime = msg.mime || 'audio/webm';
        const b64 = msg.audio || '';
        const src = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
        const dur = msg.duration || 0;

        const bars = 20;
        const seed = hashStr(String(msg.id || ''));
        const heights = [];
        for (let i = 0; i < bars; i++) heights.push(18 + ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280 * 22);
        const wave = heights.map(h => `<span style="height:${Math.round(h)}px"></span>`).join('');

        wrap.innerHTML = `
            <button class="sz-audio-btn" type="button" aria-label="Reproduzir">▶</button>
            <div class="sz-audio-wave">${wave}</div>
            <span class="sz-audio-time">${dur ? fmtDur(dur) : '--'}</span>
            <audio preload="metadata" src="${src}"></audio>
        `;

        const btn = wrap.querySelector('.sz-audio-btn');
        const audio = wrap.querySelector('audio');
        const time = wrap.querySelector('.sz-audio-time');
        const spans = wrap.querySelectorAll('.sz-audio-wave span');

        function fmtDur(ms) {
            const s = Math.floor(ms / 1000);
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        }

        btn.addEventListener('click', () => {
            if (audio.paused) audio.play().catch(() => {});
            else audio.pause();
        });
        audio.addEventListener('play', () => { btn.textContent = '❚❚'; });
        audio.addEventListener('pause', () => { btn.textContent = '▶'; });
        audio.addEventListener('ended', () => { btn.textContent = '▶'; paintProgress(0); });
        audio.addEventListener('timeupdate', () => {
            if (!audio.duration || !isFinite(audio.duration)) return;
            time.textContent = fmtDur(audio.currentTime * 1000);
            paintProgress(audio.currentTime / audio.duration);
        });
        audio.addEventListener('loadedmetadata', () => {
            if (isFinite(audio.duration)) time.textContent = fmtDur(audio.duration * 1000);
        });

        function paintProgress(ratio) {
            const n = Math.round(spans.length * ratio);
            spans.forEach((s, i) => s.classList.toggle('on', i < n));
        }

        return wrap;
    };

    function hashStr(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return Math.abs(h) || 1;
    }

    A.renderInto = function(bubble, msg) {
        const player = A.createPlayer(msg);
        bubble.appendChild(player);
    };

    S.audio = A;
})();
