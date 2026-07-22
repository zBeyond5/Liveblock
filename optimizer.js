(function() {
    'use strict';

    if (window._optimizer) {
        try { if (typeof window._optimizer.kill === 'function') window._optimizer.kill(); } catch(e) {}
        delete window._optimizer;
    }

    const state = {
        fpsHistory: [],
        lastFrameTime: performance.now(),
        fpsCheckInterval: null,
        cacheCleanInterval: null,
        domCleanInterval: null,
        enabled: true,
        cleanThreshold: 5 * 60 * 1000,
        maxLogEntries: 300
    };

    function getFPS() {
        const now = performance.now();
        const delta = now - state.lastFrameTime;
        state.lastFrameTime = now;
        if (delta <= 0) return 60;
        const fps = 1000 / delta;
        state.fpsHistory.push(fps);
        if (state.fpsHistory.length > 30) state.fpsHistory.shift();
        return Math.round(state.fpsHistory.reduce((a, b) => a + b, 0) / state.fpsHistory.length);
    }

    function cleanLocalStorage() {
        let cleaned = 0;
        const protectedKeys = [
            'sanghub_manifest_cache',
            'sanghub_version_cache',
            'hl_pro_bl_ids',
            'hl_pro_bl_payloads',
            'hl_pro_drop_ids',
            'hl_pro_drop_payloads',
            'hl_pro_profiles',
            'hl_pro_current_profile',
            'hl_pro_font_size',
            'sa_bl_ids',
            'sa_bl_payloads',
            'sa_drop_ids',
            'sa_drop_payloads',
            'sa_profiles',
            'sa_current_profile',
            'sa_font_size',
            '_k_session',
            '_k_count'
        ];

        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (protectedKeys.includes(key)) continue;

            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const val = JSON.parse(raw);
                if (val && typeof val === 'object') {
                    if (val.logs && Array.isArray(val.logs) && val.logs.length > state.maxLogEntries) {
                        val.logs = val.logs.slice(-state.maxLogEntries);
                        localStorage.setItem(key, JSON.stringify(val));
                        cleaned++;
                    }
                    if (Array.isArray(val) && val.length > state.maxLogEntries * 2) {
                        localStorage.setItem(key, JSON.stringify(val.slice(-state.maxLogEntries)));
                        cleaned++;
                    }
                }
            } catch(e) {}
        }
        if (cleaned > 0) console.log('🧹 [Otimizador] localStorage limpo:', cleaned, 'entradas reduzidas');
    }

    function cleanDOM() {
        let removed = 0;
        document.querySelectorAll('script[data-module]').forEach(el => {
            if (!el.parentNode) { removed++; }
        });
        const logContainers = document.querySelectorAll('#sa-logArea, #hl-logArea, #saLog');
        logContainers.forEach(container => {
            while (container.children.length > 250) {
                container.firstChild.remove();
                removed++;
            }
        });
        if (removed > 0) console.log('🧹 [Otimizador] DOM limpo:', removed, 'elementos');
    }

    function safeGC() {
        if (window.gc) {
            try { window.gc(); } catch(e) {}
        }
        const empty = new ArrayBuffer(0);
        for (let i = 0; i < 3; i++) {
            const arr = new ArrayBuffer(1024 * 1024);
        }
    }

    function periodicCleanup() {
        if (!state.enabled) return;
        cleanLocalStorage();
        cleanDOM();
    }

    function start() {
        state.fpsCheckInterval = setInterval(() => {
            const fps = getFPS();
            if (fps < 20 && fps > 0) {
                safeGC();
            }
        }, 5000);
        state.cacheCleanInterval = setInterval(periodicCleanup, state.cleanThreshold);
        state.domCleanInterval = setInterval(cleanDOM, state.cleanThreshold * 2);
        console.log('🟢 [Otimizador] Iniciado — modo seguro (sem interferência nos módulos)');
    }

    function stop() {
        if (state.fpsCheckInterval) clearInterval(state.fpsCheckInterval);
        if (state.cacheCleanInterval) clearInterval(state.cacheCleanInterval);
        if (state.domCleanInterval) clearInterval(state.domCleanInterval);
        state.enabled = false;
        console.log('🔴 [Otimizador] Parado');
    }

    function kill() {
        stop();
        delete window._optimizer;
    }

    window._optimizer = {
        kill,
        start,
        stop,
        getFPS,
        cleanNow: periodicCleanup
    };

    start();
})();
