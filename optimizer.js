(function() {
    'use strict';

    if (window._optimizer) {
        try { if (typeof window._optimizer.kill === 'function') window._optimizer.kill(); } catch(e) {}
        delete window._optimizer;
    }

    const state = {
        fpsHistory: [],
        lastFrameTime: performance.now(),
        intervals: [],
        enabled: true,
        aggressiveMode: false,            // Modo turbo ativado manualmente
        cleanThreshold: 2 * 60 * 1000,    // 2 minutos (normal) → 1 min (agressivo)
        domCleanThreshold: 4 * 60 * 1000, // 4 minutos → 2 min (agressivo)
        fpsCheckInterval: 2000,           // 2 segundos
        memoryLimit: 150 * 1024 * 1024,   // 150 MB (aciona GC forçado)
        maxLogEntries: 150,               // redução drástica de logs
        maxLocalStorageSize: 2 * 1024 * 1024 // 2 MB estimado (se possível medir)
    };

    // Lista rigorosa de chaves protegidas (nunca serão limpas)
    const PROTECTED_KEYS = new Set([
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
        '_k_count',
        '_rpg_state_v4',               // protege estado do RPG
        'campo_minado_progresso_v2',   // protege progresso do Campo Minado
        'campo_minado_ranking_v2'
    ]);

    // ==================== FUNÇÕES DE OTIMIZAÇÃO ====================

    function getFPS() {
        const now = performance.now();
        const delta = now - state.lastFrameTime;
        state.lastFrameTime = now;
        if (delta <= 0) return 60;
        const fps = 1000 / delta;
        state.fpsHistory.push(fps);
        if (state.fpsHistory.length > 20) state.fpsHistory.shift(); // janela menor para resposta rápida
        return Math.round(state.fpsHistory.reduce((a, b) => a + b, 0) / state.fpsHistory.length);
    }

    function getMemoryUsage() {
        if (performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        return null;
    }

    function forceGC() {
        if (window.gc) {
            try { window.gc(); } catch(e) {}
        }
        // Alocação/desalocação forçada para estimular o GC
        for (let i = 0; i < 5; i++) {
            const arr = new ArrayBuffer(512 * 1024); // 512 KB cada
            arr; // referência logo se perde
        }
    }

    function aggressiveLocalStorageCleanup() {
        let cleaned = 0;
        const now = Date.now();

        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (PROTECTED_KEYS.has(key)) continue;

            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;

                // Remove entradas que são arrays/objetos enormes
                const val = JSON.parse(raw);
                if (val && typeof val === 'object') {
                    // Se tiver campo de timestamp e for muito antigo (> 1 hora), remove completamente
                    if (val.timestamp && now - val.timestamp > 3600000) {
                        localStorage.removeItem(key);
                        cleaned++;
                        continue;
                    }
                    // Se for array com mais de 500 itens, trunca
                    if (Array.isArray(val) && val.length > 500) {
                        localStorage.setItem(key, JSON.stringify(val.slice(-200)));
                        cleaned++;
                    }
                    // Se for objeto com logs, trunca
                    if (val.logs && Array.isArray(val.logs) && val.logs.length > state.maxLogEntries) {
                        val.logs = val.logs.slice(-state.maxLogEntries);
                        localStorage.setItem(key, JSON.stringify(val));
                        cleaned++;
                    }
                }
                // Remove strings muito grandes (> 200KB) que não são protegidas
                if (raw.length > 200 * 1024) {
                    localStorage.removeItem(key);
                    cleaned++;
                }
            } catch(e) {}
        }
        if (cleaned > 0) console.log('🧹 [Otimizador] localStorage agressivo: ' + cleaned + ' entradas limpas');
    }

    function aggressiveDOMCleanup() {
        let removed = 0;
        // Remove nós de script órfãos que foram injetados por módulos
        document.querySelectorAll('script[data-module]').forEach(el => {
            if (!el.parentNode || el.textContent === '') {
                el.remove();
                removed++;
            }
        });

        // Remove elementos com estilo display:none que são muitos (> 300)
        const hidden = document.querySelectorAll('[style*="display: none"], [style*="display:none"]');
        if (hidden.length > 300) {
            for (let i = 300; i < hidden.length; i++) {
                hidden[i].remove();
                removed++;
            }
        }

        // Limpa containers de log conhecidos (SA, HL) se crescerem demais
        const logContainers = document.querySelectorAll('#sa-logArea, #hl-logArea, #saLog');
        logContainers.forEach(container => {
            while (container.children.length > 150) {
                container.firstChild.remove();
                removed++;
            }
        });

        if (removed > 0) console.log('🧹 [Otimizador] DOM agressivo: ' + removed + ' elementos removidos');
    }

    function checkMemoryAndReact() {
        const usage = getMemoryUsage();
        if (usage && usage > state.memoryLimit) {
            console.warn('⚠️ [Otimizador] Memória alta detectada (' + Math.round(usage/1048576) + ' MB). Forçando GC e limpando.');
            forceGC();
            aggressiveLocalStorageCleanup();
            aggressiveDOMCleanup();
        }
    }

    function onLowFPS(fps) {
        console.warn('⚠️ [Otimizador] FPS baixo (' + fps + '). Executando ações de emergência.');
        forceGC();
        aggressiveDOMCleanup();
        // Se modo agressivo, também limpa localStorage
        if (state.aggressiveMode) aggressiveLocalStorageCleanup();
    }

    // ==================== CONTROLE DE CICLOS ====================

    function startAllIntervals() {
        stopAllIntervals(); // Evita duplicação

        state.intervals.push(setInterval(() => {
            if (!state.enabled) return;
            const fps = getFPS();
            if (fps < 30 && fps > 0) {
                onLowFPS(fps);
            } else {
                checkMemoryAndReact(); // Verifica memória mesmo com FPS ok
            }
        }, state.fpsCheckInterval));

        state.intervals.push(setInterval(() => {
            if (!state.enabled) return;
            aggressiveLocalStorageCleanup();
        }, state.cleanThreshold));

        state.intervals.push(setInterval(() => {
            if (!state.enabled) return;
            aggressiveDOMCleanup();
        }, state.domCleanThreshold));

        // Limpeza extra em modo agressivo
        if (state.aggressiveMode) {
            state.intervals.push(setInterval(() => {
                if (!state.enabled) return;
                aggressiveDOMCleanup();
                aggressiveLocalStorageCleanup();
            }, 30000)); // 30 segundos
        }
    }

    function stopAllIntervals() {
        state.intervals.forEach(clearInterval);
        state.intervals = [];
    }

    function enableAggressiveMode(enable) {
        state.aggressiveMode = !!enable;
        if (state.aggressiveMode) {
            state.cleanThreshold = 60000;       // 1 min
            state.domCleanThreshold = 120000;   // 2 min
            state.maxLogEntries = 80;
            console.log('🔥 [Otimizador] Modo turbo ATIVADO');
        } else {
            state.cleanThreshold = 2 * 60 * 1000;
            state.domCleanThreshold = 4 * 60 * 1000;
            state.maxLogEntries = 150;
            console.log('🟡 [Otimizador] Modo turbo DESATIVADO');
        }
        stopAllIntervals();
        startAllIntervals();
    }

    // ==================== API PÚBLICA ====================

    function start() {
        state.enabled = true;
        startAllIntervals();
        console.log('🟢 [Otimizador] Iniciado (agressivo). Intervalos: localStorage a cada ' + (state.cleanThreshold/60000).toFixed(1) + 'min, DOM a cada ' + (state.domCleanThreshold/60000).toFixed(1) + 'min');
    }

    function stop() {
        state.enabled = false;
        stopAllIntervals();
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
        forceGC,
        cleanNow: () => { aggressiveLocalStorageCleanup(); aggressiveDOMCleanup(); },
        aggressive: enableAggressiveMode,
        _state: state
    };

    // Inicialização automática
    start();

})();
