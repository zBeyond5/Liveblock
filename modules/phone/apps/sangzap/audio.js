// modules/phone/apps/sangzap/audio.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.audio) return;

    // ═══ CONFIG ═══
    const A = {};
    const MAX_MS       = 60_000;
    const MAX_BYTES    = 500 * 1024;
    const MIN_MS       = 700;
    const PEAK_BARS    = 48;
    const LEVEL_HZ     = 30;
    const CANCEL_DX    = -70;   // deslizar pra esquerda o suficiente
    const LOCK_DY      = -80;   // deslizar pra cima o suficiente

    const MIME_CANDIDATES = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4'
    ];

    // ═══ STATE ═══
    let _session = null;                // sessão ativa (recorder)
    const _urlCache = new Map();        // msgId -> objectURL

    // ═══ UTIL ═══
    function pickMime() {
        if (typeof MediaRecorder === 'undefined') return '';
        for (const m of MIME_CANDIDATES) {
            try { if (MediaRecorder.isTypeSupported(m)) return m; } catch(_) {}
        }
        return '';
    }

    function b64FromBlob(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => {
                const s = String(fr.result || '');
                const i = s.indexOf(',');
                resolve(i >= 0 ? s.slice(i + 1) : '');
            };
            fr.onerror = () => reject(new Error('read falhou'));
            fr.readAsDataURL(blob);
        });
    }

    function fmtDur(ms) {
        const s = Math.max(0, Math.floor((ms || 0) / 1000));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    A.fmtDur = fmtDur;

    // ═══ PEAKS ═══
    async function computePeaks(blob, bars = PEAK_BARS) {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            const ac = new AC();
            try {
                const buf = await blob.arrayBuffer();
                const decoded = await ac.decodeAudioData(buf.slice(0));
                const ch = decoded.getChannelData(0);
                const total = ch.length || 1;
                const step = Math.max(1, Math.floor(total / bars));
                const peaks = new Array(bars).fill(0);
                let max = 0;
                for (let i = 0; i < bars; i++) {
                    const start = i * step;
                    const end = Math.min(start + step, total);
                    let local = 0;
                    const sub = Math.max(1, Math.floor((end - start) / 40));
                    for (let j = start; j < end; j += sub) {
                        const v = Math.abs(ch[j]);
                        if (v > local) local = v;
                    }
                    peaks[i] = local;
                    if (local > max) max = local;
                }
                if (max > 0) for (let i = 0; i < bars; i++) peaks[i] = peaks[i] / max;
                return peaks;
            } finally {
                try { ac.close(); } catch(_) {}
            }
        } catch(e) {
            console.warn('[Sangzap/audio] computePeaks:', e);
            return null;
        }
    }

    // ═══ WAV FALLBACK ═══
    function encodeWav(chunks, sampleRate) {
        let total = 0;
        for (const c of chunks) total += c.length;
        const bps = 2;
        const buffer = new ArrayBuffer(44 + total * bps);
        const view = new DataView(buffer);
        const w = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
        w(0, 'RIFF');
        view.setUint32(4, 36 + total * bps, true);
        w(8, 'WAVE');
        w(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * bps, true);
        view.setUint16(32, bps, true);
        view.setUint16(34, 16, true);
        w(36, 'data');
        view.setUint32(40, total * bps, true);
        let off = 44;
        for (const c of chunks) {
            for (let i = 0; i < c.length; i++) {
                const s = Math.max(-1, Math.min(1, c[i]));
                view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                off += 2;
            }
        }
        return new Blob([buffer], { type: 'audio/wav' });
    }

    function createWavSession(stream) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('AudioContext indisponível');
        const ac = new AC();
        const source = ac.createMediaStreamSource(stream);
        const processor = ac.createScriptProcessor(4096, 1, 1);
        const chunks = [];
        let paused = false;
        processor.onaudioprocess = (e) => {
            if (paused) return;
            chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        source.connect(processor);
        processor.connect(ac.destination);
        return {
            mime: 'audio/wav',
            supportsPause: true,
            start() {},
            stop() {
                try { processor.disconnect(); } catch(_) {}
                try { source.disconnect(); } catch(_) {}
                const blob = encodeWav(chunks, ac.sampleRate);
                try { ac.close(); } catch(_) {}
                return Promise.resolve(blob);
            },
            pause() { paused = true; },
            resume() { paused = false; }
        };
    }

    // ═══ MEDIARECORDER ═══
    function createMediaSession(stream, mime) {
        const rec = new MediaRecorder(stream, mime
            ? { mimeType: mime, audioBitsPerSecond: 64000 }
            : { audioBitsPerSecond: 64000 });
        const chunks = [];
        let stopResolve = null;
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
            const type = chunks[0]?.type || mime || 'audio/webm';
            const blob = new Blob(chunks, { type });
            if (stopResolve) stopResolve(blob);
        };
        return {
            mime: mime || 'audio/webm',
            supportsPause: typeof rec.pause === 'function' && typeof rec.resume === 'function',
            start() { rec.start(250); },
            stop() {
                return new Promise((resolve) => {
                    stopResolve = resolve;
                    try { if (rec.state !== 'inactive') rec.stop(); }
                    catch(_) { resolve(new Blob(chunks, { type: mime || 'audio/webm' })); }
                });
            },
            pause() { try { if (rec.state === 'recording') rec.pause(); } catch(_) {} },
            resume() { try { if (rec.state === 'paused') rec.resume(); } catch(_) {} }
        };
    }

    // ═══ LEVEL METER ═══
    function makeMeter(stream) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return { read: () => 0, stop() {} };
        try {
            const ac = new AC();
            const src = ac.createMediaStreamSource(stream);
            const analyser = ac.createAnalyser();
            analyser.fftSize = 512;
            src.connect(analyser);
            const buf = new Uint8Array(analyser.fftSize);
            return {
                read() {
                    analyser.getByteTimeDomainData(buf);
                    let sum = 0;
                    for (let i = 0; i < buf.length; i++) {
                        const v = (buf[i] - 128) / 128;
                        sum += v * v;
                    }
                    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
                },
                stop() {
                    try { src.disconnect(); } catch(_) {}
                    try { ac.close(); } catch(_) {}
                }
            };
        } catch(_) { return { read: () => 0, stop() {} }; }
    }

    // ═══ SESSION FACTORY ═══
    async function acquireStream() {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia ausente');
        return await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    function makeBackend(stream) {
        const mime = pickMime();
        if (typeof MediaRecorder !== 'undefined') {
            try { return createMediaSession(stream, mime); } catch(_) {}
        }
        return createWavSession(stream);
    }

    // ═══ PUBLIC — STATE ═══
    A.isRecording = () => !!_session;
    A.isPaused    = () => _session?.state === 'paused';
    A.isLocked    = () => _session?.state === 'locked';
    A.duration    = function() {
        if (!_session) return 0;
        let t = Date.now() - _session.startedAt - _session.pausedTotal;
        if (_session.state === 'paused') t -= (Date.now() - _session.pausedAt);
        return Math.max(0, t);
    };

    // ═══ PUBLIC — STOP / CANCEL / PAUSE / RESUME ═══
    A.stop = async function() {
        const session = _session;
        if (!session || session.completed) return;
        session.completed = true;
        const duration = A.duration();
        session.onState?.('processing', { duration });

        let blob;
        try { blob = await session.backend.stop(); }
        catch(e) {
            session.cleanup();
            session.onError?.('Falha ao finalizar');
            return;
        }
        session.cleanup();

        if (duration < MIN_MS) { session.onError?.('Muito curto'); return; }
        if (!blob || blob.size < 100) { session.onError?.('Áudio vazio'); return; }
        if (blob.size > MAX_BYTES) { session.onError?.('Áudio muito grande'); return; }

        let b64;
        try { b64 = await b64FromBlob(blob); }
        catch(_) { session.onError?.('Falha ao ler áudio'); return; }

        const peaks = await computePeaks(blob);

        const payload = {
            audio: b64,
            mime: blob.type || session.backend.mime || 'audio/webm',
            size: blob.size,
            duration,
            peaks: peaks || null
        };
        try { session.onDone?.(payload); } catch(e) { console.warn('[Sangzap/audio] onDone:', e); }
    };

    A.cancel = function() {
        const session = _session;
        if (!session || session.completed) return;
        session.completed = true;
        try { session.backend.stop(); } catch(_) {}
        session.cleanup();
        session.onCancel?.();
    };

    A.pause = function() {
        const session = _session;
        if (!session || session.state !== 'locked') return false;
        if (!session.backend.supportsPause) return false;
        try { session.backend.pause(); } catch(_) { return false; }
        session.pausedAt = Date.now();
        session.state = 'paused';
        session.onState?.('paused', { duration: A.duration() });
        return true;
    };

    A.resume = function() {
        const session = _session;
        if (!session || session.state !== 'paused') return false;
        try { session.backend.resume(); } catch(_) { return false; }
        session.pausedTotal += Date.now() - session.pausedAt;
        session.pausedAt = 0;
        session.state = 'locked';
        session.onState?.('locked', { duration: A.duration() });
        return true;
    };

    // ═══ PUBLIC — GESTURE ═══
    A.startGesture = function(opts) {
        const trigger = opts?.trigger;
        if (!trigger) return false;
        if (trigger.dataset.szAudioBound === '1') return true;
        trigger.dataset.szAudioBound = '1';

        trigger.addEventListener('pointerdown', (ev) => {
            if (_session) return;
            if (ev.pointerType === 'mouse' && ev.button !== 0) return;
            ev.preventDefault();
            _beginGesture(ev, trigger, opts);
        });
        return true;
    };

    async function _beginGesture(downEv, trigger, opts) {
        const {
            onState = () => {},
            onDone = () => {},
            onCancel = () => {},
            onError = (m) => ctx.toast?.(m, 'err'),
            onLevel = null
        } = opts || {};

        const originX = downEv.clientX;
        const originY = downEv.clientY;
        const pointerId = downEv.pointerId;

        let releasedEarly = false;
        let earlyReleasedAt = null;

        function earlyUp() { releasedEarly = true; earlyReleasedAt = performance.now(); }

        document.addEventListener('pointerup', earlyUp, { once: true });
        try { trigger.setPointerCapture(pointerId); } catch(_) {}

        // adquire stream
        let stream;
        try { stream = await acquireStream(); }
        catch(_) {
            document.removeEventListener('pointerup', earlyUp);
            onError('Sem acesso ao microfone');
            return;
        }

        // se o usuário soltou durante o await, aborta
        if (releasedEarly && performance.now() - earlyReleasedAt < 150) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }

        // backend
        let backend;
        try { backend = makeBackend(stream); }
        catch(e) {
            stream.getTracks().forEach(t => t.stop());
            onError('Falha ao iniciar gravação');
            return;
        }

        const meter = makeMeter(stream);
        const startedAt = Date.now();

        const session = {
            backend, stream, meter, startedAt,
            state: 'rec',             // rec | cancel | locked | paused | processing
            pausedAt: 0, pausedTotal: 0,
            pointerId, originX, originY,
            completed: false,
            onState, onDone, onCancel, onError, onLevel
        };
        _session = session;

        backend.start();
        onState('rec', { duration: 0, level: 0, supportsPause: !!backend.supportsPause });

        // ── level loop ──
        let levelRAF = null;
        let lastEmit = 0;
        function levelLoop() {
            if (_session !== session) return;
            levelRAF = requestAnimationFrame(levelLoop);
            const now = performance.now();
            if (now - lastEmit < 1000 / LEVEL_HZ) return;
            lastEmit = now;
            if (session.state === 'paused' || session.state === 'processing') return;
            const lvl = meter.read();
            onLevel?.(lvl);
            onState(session.state, { duration: A.duration(), level: lvl, supportsPause: !!backend.supportsPause });
            if (A.duration() >= MAX_MS && session.state !== 'processing') A.stop();
        }
        levelRAF = requestAnimationFrame(levelLoop);
        session.levelRAF = levelRAF;

        // ── gesture listeners ──
        function onMove(ev) {
            if (ev.pointerId !== pointerId) return;
            if (session.state === 'locked' || session.state === 'paused' || session.state === 'processing') return;
            const dx = ev.clientX - originX;
            const dy = ev.clientY - originY;
            let next = 'rec';
            if (dy < LOCK_DY) next = 'locked';
            else if (dx < CANCEL_DX) next = 'cancel';
            if (next !== session.state) {
                session.state = next;
                if (next === 'locked') {
                    try { trigger.releasePointerCapture(pointerId); } catch(_) {}
                }
                onState(next, { duration: A.duration(), dx, dy });
            } else {
                onState(session.state, { duration: A.duration(), dx, dy });
            }
        }
        function onUp(ev) {
            if (ev.pointerId !== pointerId) return;
            _detach();
            if (session.state === 'locked' || session.state === 'paused') return;
            if (session.state === 'cancel') { A.cancel(); return; }
            A.stop();
        }
        function onCancelGesture(ev) {
            if (ev.pointerId !== pointerId) return;
            _detach();
            if (session.state !== 'locked' && session.state !== 'paused') A.cancel();
        }
        function _detach() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onCancelGesture);
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onCancelGesture);

        // cleanup idempotente (referenciado por stop/cancel)
        session.cleanup = () => {
            _detach();
            document.removeEventListener('pointerup', earlyUp);
            if (session.levelRAF) { try { cancelAnimationFrame(session.levelRAF); } catch(_) {} }
            try { meter.stop(); } catch(_) {}
            try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
            if (_session === session) _session = null;
        };
    }

    // ═══ PUBLIC — LEGACY (compat até o shell ser atualizado) ═══
    A.start = async function(onState, onDone) {
        // Shim: sem gesto, sem lock. Só grava até stop() manual ou MAX_MS.
        if (_session) return false;
        let stream;
        try { stream = await acquireStream(); }
        catch(_) { ctx.toast?.('Sem acesso ao microfone', 'err'); return false; }

        let backend;
        try { backend = makeBackend(stream); }
        catch(_) { stream.getTracks().forEach(t => t.stop()); ctx.toast?.('Falha ao gravar', 'err'); return false; }

        const meter = makeMeter(stream);
        const session = {
            backend, stream, meter,
            startedAt: Date.now(),
            state: 'rec',
            pausedAt: 0, pausedTotal: 0,
            completed: false,
            onState: onState || (() => {}),
            onDone: onDone || (() => {}),
            onCancel: () => {},
            onError: (m) => ctx.toast?.(m, 'err'),
            onLevel: null
        };
        _session = session;
        backend.start();
        session.onState('rec', { duration: 0 });

        let raf = null;
        function loop() {
            if (_session !== session) return;
            raf = requestAnimationFrame(loop);
            session.onState(session.state, { duration: A.duration() });
            if (A.duration() >= MAX_MS) A.stop();
        }
        raf = requestAnimationFrame(loop);
        session.levelRAF = raf;
        session.cleanup = () => {
            if (session.levelRAF) try { cancelAnimationFrame(session.levelRAF); } catch(_) {}
            try { meter.stop(); } catch(_) {}
            try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
            if (_session === session) _session = null;
        };
        return true;
    };

    // ═══ CACHE ═══
    function getSrcFor(msg) {
        if (!msg) return '';
        const id = msg.id || '';
        if (id && _urlCache.has(id)) return _urlCache.get(id);
        const b64 = msg.audio || '';
        if (!b64) return '';
        if (b64.startsWith('data:')) return b64;
        try {
            const bin = atob(b64);
            const len = bin.length;
            const arr = new Uint8Array(len);
            for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
            const blob = new Blob([arr], { type: msg.mime || 'audio/webm' });
            const url = URL.createObjectURL(blob);
            if (id) _urlCache.set(id, url);
            return url;
        } catch(e) {
            console.warn('[Sangzap/audio] decode falhou:', e);
            return '';
        }
    }

    A.revokeCache = function(msgId) {
        if (!msgId) return;
        const url = _urlCache.get(msgId);
        if (url) { try { URL.revokeObjectURL(url); } catch(_) {} _urlCache.delete(msgId); }
    };

    A.clearCache = function() {
        for (const url of _urlCache.values()) {
            try { URL.revokeObjectURL(url); } catch(_) {}
        }
        _urlCache.clear();
    };

    // ═══ PLAYER ═══
    const RATES = [1, 1.5, 2];

    function fallbackPeaks(seed, n) {
        let h = 2166136261;
        const s = String(seed || '');
        for (let i = 0; i < s.length; i++) h = ((h ^ s.charCodeAt(i)) * 16777619) >>> 0;
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            h = (h * 1103515245 + 12345) >>> 0;
            out[i] = 0.2 + ((h >>> 16) & 0xff) / 255 * 0.7;
        }
        return out;
    }

    A.createPlayer = function(msg) {
        const wrap = document.createElement('div');
        wrap.className = 'sz-audio';
        if (!msg) return wrap;

        const peaks = Array.isArray(msg.peaks) && msg.peaks.length
            ? msg.peaks
            : fallbackPeaks(msg.id, PEAK_BARS);
        const realPeaks = Array.isArray(msg.peaks) && msg.peaks.length > 0;

        const dur = msg.duration || 0;
        const src = getSrcFor(msg);

        const bars = peaks.map(h => {
            const px = Math.max(3, Math.round(3 + h * 20));
            return `<span style="height:${px}px"></span>`;
        }).join('');

        wrap.innerHTML = `
            <button class="sz-audio-btn" type="button" aria-label="Reproduzir">▶</button>
            <div class="sz-audio-wave" role="slider" tabindex="0" aria-label="Posição" data-real="${realPeaks ? '1' : '0'}">${bars}</div>
            <span class="sz-audio-time">${dur ? fmtDur(dur) : '--:--'}</span>
            <button class="sz-audio-rate" type="button" title="Velocidade" aria-label="Velocidade">1x</button>
            <audio preload="metadata" src="${src}"></audio>
        `;

        const btn = wrap.querySelector('.sz-audio-btn');
        const rateBtn = wrap.querySelector('.sz-audio-rate');
        const audio = wrap.querySelector('audio');
        const time = wrap.querySelector('.sz-audio-time');
        const wave = wrap.querySelector('.sz-audio-wave');
        const spans = wrap.querySelectorAll('.sz-audio-wave span');

        if (!src) {
            btn.disabled = true;
            btn.textContent = '×';
            rateBtn.disabled = true;
            return wrap;
        }

        let rateIdx = 0;

        function paintProgress(ratio) {
            ratio = Math.max(0, Math.min(1, ratio || 0));
            const n = Math.round(spans.length * ratio);
            for (let i = 0; i < spans.length; i++) {
                spans[i].classList.toggle('on', i < n);
            }
        }

        function setPlayingUI(playing) {
            btn.textContent = playing ? '❚❚' : '▶';
            wrap.classList.toggle('playing', playing);
        }

        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (audio.paused) audio.play().catch(() => {});
            else audio.pause();
        });

        rateBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            rateIdx = (rateIdx + 1) % RATES.length;
            const r = RATES[rateIdx];
            audio.playbackRate = r;
            rateBtn.textContent = r + 'x';
        });

        wave.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            const rect = wave.getBoundingClientRect();
            if (!rect.width) return;
            const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            if (isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime = ratio * audio.duration;
                paintProgress(ratio);
                time.textContent = fmtDur(audio.currentTime * 1000);
            }
        });
        wave.addEventListener('keydown', (ev) => {
            if (!isFinite(audio.duration) || audio.duration <= 0) return;
            if (ev.key === 'ArrowLeft')  audio.currentTime = Math.max(0, audio.currentTime - 5);
            if (ev.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
            if (ev.key === ' ') { ev.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
        });

        audio.addEventListener('play',  () => setPlayingUI(true));
        audio.addEventListener('pause', () => setPlayingUI(false));
        audio.addEventListener('ended', () => { setPlayingUI(false); paintProgress(0); time.textContent = fmtDur(dur); });
        audio.addEventListener('loadedmetadata', () => {
            if (isFinite(audio.duration) && audio.duration > 0) {
                time.textContent = fmtDur(audio.duration * 1000);
            }
        });
        audio.addEventListener('timeupdate', () => {
            if (!isFinite(audio.duration) || audio.duration <= 0) return;
            const ratio = audio.currentTime / audio.duration;
            time.textContent = fmtDur(audio.currentTime * 1000);
            paintProgress(ratio);
        });
        audio.addEventListener('error', () => {
            btn.disabled = true;
            btn.textContent = '×';
            wrap.classList.add('error');
        });

        return wrap;
    };

    A.renderInto = function(bubble, msg) {
        if (!bubble || !msg) return null;
        if (bubble.dataset.audioRendered === String(msg.id || '')) return null;
        const player = A.createPlayer(msg);
        bubble.appendChild(player);
        bubble.dataset.audioRendered = String(msg.id || '');
        return player;
    };

    S.audio = A;
})();
