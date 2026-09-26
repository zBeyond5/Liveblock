// modules/phone/home.js
// Tela de bloqueio (relógio + PIN) e home (grid, dock, páginas, drag, contexto).
// Não abre apps — chama P.apps.openApp via lazy.
(function() {
    'use strict';
    const ctx = window._phoneCtx = window._phoneCtx || {};
    const P   = ctx._phone   = ctx._phone   || {};
    if (!P.config || !P.core || !P.state) { console.warn('[Phone/home] pré-requisitos ausentes.'); return; }
    if (P.home) return;

    const C = P.config;
    const S = P.state;
    const el  = ctx.el;
    const esc = ctx.esc;

    // STATE INTERNO DA HOME (não compartilhado)
    let _layout = { pages: [new Array(C.PAGE_SIZE).fill(null)], dock: [] };
    let _layoutInitialized = false;

    let _homeCfg = {
        clockX: 0, clockY: 0,
        searchX: 0, searchY: 0,
        showClock: true, showSearch: true,
        iconSize: 'normal', gridGap: 'normal'
    };

    let _currentPage = 0;
    let _pinBuf      = '';
    let _dragSrc     = null;
    let _suppressClick = false;
    let _dragPageTimer = null;

    // STORAGE — layout
    (function _loadLayout() {
        try {
            const raw = localStorage.getItem(C.LS_LAYOUT);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return;

            if (Array.isArray(p.pages) && p.pages.length) {
                _layout.pages = p.pages.map(pg => {
                    const a = new Array(C.PAGE_SIZE).fill(null);
                    if (Array.isArray(pg)) pg.forEach((id, i) => { if (i < C.PAGE_SIZE && id) a[i] = id; });
                    return a;
                });
                _layoutInitialized = true;
            } else if (Array.isArray(p.grid)) {
                _layout.pages = [new Array(C.PAGE_SIZE).fill(null)];
                p.grid.forEach((id, i) => {
                    if (!id) return;
                    const page = Math.floor(i / C.PAGE_SIZE);
                    while (_layout.pages.length <= page) _layout.pages.push(new Array(C.PAGE_SIZE).fill(null));
                    _layout.pages[page][i % C.PAGE_SIZE] = id;
                });
                _layoutInitialized = true;
                _saveLayout();
            }
            if (Array.isArray(p.dock)) _layout.dock = p.dock.slice(0, C.MAX_DOCK_APPS);
        } catch(_) {}
    })();

    function _saveLayout() {
        try { localStorage.setItem(C.LS_LAYOUT, JSON.stringify(_layout)); } catch(_) {}
    }

    // STORAGE — homeCfg
    (function _loadHomeCfg() {
        try {
            const raw = localStorage.getItem(C.LS_HOME_CFG);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (p && typeof p === 'object') Object.assign(_homeCfg, p);
        } catch(_) {}
    })();

    function _saveHomeCfg() {
        try { localStorage.setItem(C.LS_HOME_CFG, JSON.stringify(_homeCfg)); } catch(_) {}
    }

    function _applyHomeCfg() {
        const home = S.frameEl?.querySelector('.ph-home');
        if (!home) return;
        home.dataset.iconSize = _homeCfg.iconSize;
        home.dataset.gridGap  = _homeCfg.gridGap;
    }

    // LOCK SCREEN
    function _renderLock() {
        P.core.showView('lock');
        const view = S.frameEl?.querySelector('#phViewLock');
        if (!view) return;

        const d   = new Date();
        const hh  = String(d.getHours()).padStart(2, '0');
        const mm  = String(d.getMinutes()).padStart(2, '0');
        const ds  = _fmtHomeDate(d);

        if (S.pinSet) {
            view.innerHTML = `
                <div class="ph-lock">
                    <div class="ph-lock-clock">
                        <div class="ph-lock-time" id="phLockTime">${hh}:${mm}</div>
                        <div class="ph-lock-date">${esc(ds)}</div>
                    </div>
                    <div class="ph-lock-mid">
                        <div class="ph-lock-pin-wrap ph-lock-pin" id="phLockPin">
                            <div class="ph-lock-pin-dots" id="phLockDots">
                                <span class="ph-lock-pin-dot"></span>
                                <span class="ph-lock-pin-dot"></span>
                                <span class="ph-lock-pin-dot"></span>
                                <span class="ph-lock-pin-dot"></span>
                            </div>
                            <div class="ph-lock-pin-label" id="phLockLabel">Digite o PIN</div>
                        </div>
                    </div>
                    <div class="ph-keypad" id="phLockPad"></div>
                </div>`;
            _wirePinPad(view, { onComplete: _tryUnlock });
            _updatePinDots(view, 0);
        } else {
            view.innerHTML = `
                <div class="ph-lock">
                    <div class="ph-lock-clock">
                        <div class="ph-lock-time" id="phLockTime">${hh}:${mm}</div>
                        <div class="ph-lock-date">${esc(ds)}</div>
                    </div>
                    <div class="ph-lock-mid">
                        <div class="ph-lock-swipe" id="phLockSwipe">
                            <span class="ph-lock-swipe-icon">${ctx.I.unlock}</span>
                            <span class="ph-lock-swipe-text">Toque para desbloquear</span>
                        </div>
                    </div>
                </div>`;
            view.querySelector('#phLockSwipe').addEventListener('click', _unlock);
        }
    }

    function _tryUnlock(pin) {
        if (pin === S.pinSet) {
            _pinBuf = '';
            try { ctx.tone.unlock(); } catch(_) {}
            _unlock();
        } else {
            try { ctx.tone.errorPin(); } catch(_) {}
            const view = S.frameEl.querySelector('#phViewLock');
            const wrap = view.querySelector('#phLockPin');
            const lbl  = view.querySelector('#phLockLabel');
            if (wrap) { wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); }
            if (lbl)  lbl.textContent = 'PIN incorreto';
            setTimeout(() => {
                _pinBuf = '';
                _updatePinDots(view, 0);
                if (lbl) lbl.textContent = 'Digite o PIN';
            }, 600);
        }
    }

    function _unlock() {
        _pinBuf = '';
        P.core.showView('home');
        _renderHome();
    }

    function _lock() {
        _pinBuf = '';
        _renderLock();
    }

    function _updatePinDots(view, count) {
        const dots = view.querySelectorAll('#phLockDots .ph-lock-pin-dot');
        dots.forEach((d, i) => d.classList.toggle('filled', i < count));
    }

    function _wirePinPad(view, opts) {
        const pad = view.querySelector('#phLockPad');
        if (!pad) return;
        const keys = [
            { d:'1',sub:'' }, { d:'2',sub:'ABC' }, { d:'3',sub:'DEF' },
            { d:'4',sub:'GHI' }, { d:'5',sub:'JKL' }, { d:'6',sub:'MNO' },
            { d:'7',sub:'PQRS' }, { d:'8',sub:'TUV' }, { d:'9',sub:'WXYZ' },
            { util:'back', svg: ctx.I.backspace }, { d:'0',sub:'' }, { util:'ok', svg:'✓' }
        ];
        pad.innerHTML = keys.map(k => k.util
            ? `<button class="ph-key util${k.util === 'ok' ? ' ok' : ''}" data-util="${k.util}">${k.svg}</button>`
            : `<button class="ph-key" data-digit="${k.d}"><span>${k.d}</span>${k.sub ? `<span class="sub">${k.sub}</span>` : ''}</button>`
        ).join('');
        pad.querySelectorAll('.ph-key').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed');
                if (btn.dataset.digit != null) {
                    try { ctx.tone.key(); } catch(_) {}
                    if (_pinBuf.length < 4) _pinBuf += btn.dataset.digit;
                } else if (btn.dataset.util === 'back') {
                    try { ctx.tone.key(); } catch(_) {}
                    _pinBuf = _pinBuf.slice(0, -1);
                } else if (btn.dataset.util === 'ok') {
                    if (_pinBuf.length === 4 && opts?.onComplete) opts.onComplete(_pinBuf);
                    return;
                }
                _updatePinDots(view, _pinBuf.length);
                if (_pinBuf.length === 4 && opts?.onComplete) {
                    const pin = _pinBuf;
                    setTimeout(() => opts.onComplete(pin), 60);
                }
            });
        });
    }

    // HOME
    function _renderHome() {
        P.core.showView('home');
        _syncLayout();

        const view = S.frameEl?.querySelector('#phViewHome');
        if (!view) return;

        const d  = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ds = _fmtHomeDate(d);

        const dockApps    = _resolveDockApps();
        const pagesCount  = _layout.pages.length;
        if (_currentPage >= pagesCount) _currentPage = Math.max(0, pagesCount - 1);

        const pagesHtml = _layout.pages.map((page, pi) => `
            <div class="ph-home-page" data-page="${pi}">
                <div class="ph-home-grid" data-page="${pi}">
                    ${page.map((appId, slot) => {
                        if (!appId) return `<div class="ph-home-slot" data-page="${pi}" data-slot="${slot}"></div>`;
                        const app = _resolveAppDef(appId);
                        if (!app)  return `<div class="ph-home-slot" data-page="${pi}" data-slot="${slot}"></div>`;
                        return _homeAppHtml(app, pi, slot);
                    }).join('')}
                </div>
            </div>`).join('');

        const dotsHtml = _layout.pages.map((_, i) =>
            `<span${i === _currentPage ? ' class="active"' : ''} data-dot="${i}"></span>`).join('');

        const dockHtml = [];
        for (let i = 0; i < C.MAX_DOCK_APPS; i++) {
            const a = dockApps[i];
            if (a) dockHtml.push(_homeAppHtml(a, -1, i, true));
            else   dockHtml.push(`<div class="ph-dock-slot" data-dock-slot="${i}"></div>`);
        }

        const clockStyle  = (_homeCfg.clockX  || _homeCfg.clockY)
            ? ` style="transform:translate(${_homeCfg.clockX}px,${_homeCfg.clockY}px)"` : '';
        const searchStyle = (_homeCfg.searchX || _homeCfg.searchY)
            ? ` style="transform:translate(${_homeCfg.searchX}px,${_homeCfg.searchY}px)"` : '';

        const clockHtml = _homeCfg.showClock
            ? `<div class="ph-home-clock"${clockStyle}>
                 <div class="ph-home-time" id="phHomeTime">${hh}:${mm}</div>
                 <div class="ph-home-date">${esc(ds)}</div>
               </div>` : '';
        const searchHtml = _homeCfg.showSearch
            ? `<label class="ph-home-search"${searchStyle}>
                 <input type="text" id="phHomeSearch" placeholder="Buscar" spellcheck="false" autocomplete="off" />
                 ${ctx.I.search}
               </label>` : '';

        view.innerHTML = `
            <div class="ph-home" data-icon-size="${_homeCfg.iconSize}" data-grid-gap="${_homeCfg.gridGap}">
                ${clockHtml}
                ${searchHtml}
                <div class="ph-home-pages-wrap" id="phPagesWrap">
                    <div class="ph-home-pages" id="phPages" style="transform:translateX(${-_currentPage * 100}%)">
                        ${pagesHtml}
                    </div>
                </div>
                <div class="ph-home-dots" id="phDots">${dotsHtml}</div>
                <div class="ph-dock" id="phDock">${dockHtml.join('')}</div>
            </div>`;

        _bindAppClicks(view.querySelectorAll('.ph-home-app'));
        _wireDrag(view);
        _wireSwipe(view);
        _wireDots(view);
        _wireHomeMovables(view);

        const search = view.querySelector('#phHomeSearch');
        if (search) search.addEventListener('input', () => _filterApps(search.value));
    }

    function _resolveDockApps() {
        return _layout.dock
            .map(id => _resolveAppDef(id))
            .filter(Boolean)
            .slice(0, C.MAX_DOCK_APPS);
    }

    // Resolve via apps.js — lazy porque carrega em paralelo.
    function _resolveAppDef(id) {
        return P.apps?.resolveAppDef?.(id) || null;
    }

    function _homeAppHtml(a, page, slot, isDock) {
        const icon   = a.icon || ctx.I.apps;
        const accent = a.accent || '#a78bfa';
        const bg     = a.bg || null;
        const style  = bg
            ? `background:${esc(bg)};border-color:transparent;color:#fff`
            : `color:${esc(accent)}`;
        const dataAttrs = isDock
            ? `data-dock-index="${slot}"`
            : `data-page="${page}" data-slot="${slot}"`;
        return `<button class="ph-home-app" data-app-id="${esc(a.id)}" ${dataAttrs} draggable="true">
            <span class="ph-home-app-icon" style="${style}">${icon}</span>
            <span class="ph-home-app-name">${esc(a.name || a.id)}</span>
        </button>`;
    }

    function _syncLayout() {
        const builtins = P.apps?.builtinFallbacks?.() || [];
        const all      = [...builtins, ...ctx.apps.all()];
        const validIds = new Set(all.map(a => a.id));

        let dirty = false;
        for (const page of _layout.pages) {
            for (let i = 0; i < page.length; i++) {
                if (page[i] && !validIds.has(page[i])) { page[i] = null; dirty = true; }
            }
        }
        const dockBefore = _layout.dock.length;
        _layout.dock = _layout.dock.filter(id => validIds.has(id));
        if (_layout.dock.length !== dockBefore) dirty = true;

        const present = new Set([..._layout.pages.flat().filter(Boolean), ..._layout.dock]);
        for (const a of all) {
            if (present.has(a.id)) continue;
            if (a.dock && _layout.dock.length < C.MAX_DOCK_APPS) {
                _layout.dock.push(a.id); present.add(a.id); dirty = true; continue;
            }
            let placed = false;
            for (const page of _layout.pages) {
                const idx = page.indexOf(null);
                if (idx !== -1) { page[idx] = a.id; placed = true; dirty = true; break; }
            }
            if (!placed) {
                const np = new Array(C.PAGE_SIZE).fill(null);
                np[0] = a.id;
                _layout.pages.push(np);
                dirty = true;
            }
        }
        if (!_layoutInitialized) _layoutInitialized = true;
        if (dirty) _saveLayout();
    }

    function _bindAppClicks(nodes) {
        nodes.forEach(b => {
            b.addEventListener('click', () => {
                if (_suppressClick) return;
                P.apps?.openApp?.(b.dataset.appId);
            });
        });
    }

    // DRAG & DROP
    function _clearDropHints() {
        S.frameEl?.querySelectorAll('.drop-before, .drop-after, .drag-over')
            .forEach(el => el.classList.remove('drop-before', 'drop-after', 'drag-over'));
    }

    function _handleDragEdge(e) {
        if (!_dragSrc) { _cancelDragPageTimer(); return; }
        const wrap = S.frameEl?.querySelector('#phPagesWrap');
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom) { _cancelDragPageTimer(); return; }
        const x = e.clientX - r.left;
        const EDGE = 42;
        let dir = 0;
        if (x < EDGE && _currentPage > 0) dir = -1;
        else if (x > r.width - EDGE && _currentPage < _layout.pages.length - 1) dir = 1;
        if (dir === 0) { _cancelDragPageTimer(); return; }
        if (_dragPageTimer) return;
        _dragPageTimer = setTimeout(() => {
            _dragPageTimer = null;
            _currentPage += dir;
            const pages = S.frameEl?.querySelector('#phPages');
            if (pages) {
                pages.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)';
                pages.style.transform  = `translateX(${-_currentPage * 100}%)`;
            }
            _renderDotsState();
        }, 420);
    }

    function _cancelDragPageTimer() {
        if (_dragPageTimer) { clearTimeout(_dragPageTimer); _dragPageTimer = null; }
    }

    function _wireDrag(container) {
        if (!container) return;

        container.querySelectorAll('.ph-home-slot').forEach(slotEl => {
            slotEl.addEventListener('dragover', e => {
                if (!_dragSrc) return;
                e.preventDefault(); e.stopPropagation();
                slotEl.classList.add('drag-over');
            });
            slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
            slotEl.addEventListener('drop', e => {
                if (!_dragSrc) return;
                e.preventDefault(); e.stopPropagation();
                slotEl.classList.remove('drag-over');
                _handleDrop(_dragSrc, {
                    kind: 'page',
                    page: parseInt(slotEl.dataset.page, 10),
                    slot: parseInt(slotEl.dataset.slot, 10)
                });
            });
        });

        container.querySelectorAll('.ph-dock-slot').forEach(slotEl => {
            slotEl.addEventListener('dragover', e => {
                if (!_dragSrc) return;
                e.preventDefault(); e.stopPropagation();
                slotEl.classList.add('drag-over');
            });
            slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
            slotEl.addEventListener('drop', e => {
                if (!_dragSrc) return;
                e.preventDefault(); e.stopPropagation();
                slotEl.classList.remove('drag-over');
                _handleDrop(_dragSrc, { kind: 'dock', index: parseInt(slotEl.dataset.dockSlot, 10) });
            });
        });

        container.querySelectorAll('.ph-home-app').forEach(btn => {
            btn.addEventListener('dragstart', e => {
                const id = btn.dataset.appId;
                const src = (btn.dataset.dockIndex != null)
                    ? { kind: 'dock', index: parseInt(btn.dataset.dockIndex, 10) }
                    : { kind: 'page', page: parseInt(btn.dataset.page, 10), slot: parseInt(btn.dataset.slot, 10) };
                _dragSrc = { id, src };
                _suppressClick = true;
                btn.classList.add('dragging');
                try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch(_) {}
            });
            btn.addEventListener('dragend', () => {
                _dragSrc = null;
                _cancelDragPageTimer();
                btn.classList.remove('dragging');
                _clearDropHints();
                setTimeout(() => { _suppressClick = false; }, 0);
            });
            btn.addEventListener('dragover', e => {
                if (!_dragSrc || _dragSrc.id === btn.dataset.appId) return;
                e.preventDefault(); e.stopPropagation();
                const r = btn.getBoundingClientRect();
                const before = (e.clientX - r.left) < r.width / 2;
                btn.classList.toggle('drop-before', before);
                btn.classList.toggle('drop-after', !before);
            });
            btn.addEventListener('dragleave', () => btn.classList.remove('drop-before', 'drop-after'));
            btn.addEventListener('drop', e => {
                if (!_dragSrc) return;
                e.preventDefault(); e.stopPropagation();
                btn.classList.remove('drop-before', 'drop-after');
                const dst = (btn.dataset.dockIndex != null)
                    ? { kind: 'dock', index: parseInt(btn.dataset.dockIndex, 10) }
                    : { kind: 'page', page: parseInt(btn.dataset.page, 10), slot: parseInt(btn.dataset.slot, 10) };
                _handleDrop(_dragSrc, dst);
            });
        });
    }

    function _handleDrop(src, dst) {
        if (!src || !src.src) return;
        const s = src.src;
        _dragSrc = null;

        if (s.kind === 'page' && s.page >= _layout.pages.length) return;
        if (dst.kind === 'page' && dst.page >= _layout.pages.length) return;

        if (s.kind === 'page' && dst.kind === 'page') {
            const a = _layout.pages[s.page][s.slot];
            const b = _layout.pages[dst.page][dst.slot];
            _layout.pages[dst.page][dst.slot] = a;
            _layout.pages[s.page][s.slot] = b;
        } else if (s.kind === 'dock' && dst.kind === 'page') {
            const a = _layout.dock[s.index];
            const b = _layout.pages[dst.page][dst.slot];
            _layout.pages[dst.page][dst.slot] = a;
            if (b) _layout.dock[s.index] = b; else _layout.dock.splice(s.index, 1);
        } else if (s.kind === 'page' && dst.kind === 'dock') {
            const a = _layout.pages[s.page][s.slot];
            const b = _layout.dock[dst.index];
            _layout.dock[dst.index] = a;
            if (b) _layout.pages[s.page][s.slot] = b; else _layout.pages[s.page][s.slot] = null;
        } else if (s.kind === 'dock' && dst.kind === 'dock') {
            const a = _layout.dock[s.index];
            const b = _layout.dock[dst.index];
            _layout.dock[dst.index] = a;
            _layout.dock[s.index] = b;
        }
        _saveLayout();
        _clearDropHints();
        _renderHome();
    }

    // SWIPE ENTRE PÁGINAS
    function _wireSwipe(view) {
        const wrap  = view.querySelector('#phPagesWrap');
        const pages = view.querySelector('#phPages');
        if (!wrap || !pages) return;

        let startX = 0, startY = 0, deltaX = 0, deltaY = 0;
        let active = false, decided = false, horizontal = false;
        const THRESHOLD = 0.22;

        const setTranslate = (px) => {
            const base = -_currentPage * wrap.clientWidth;
            pages.style.transition = 'none';
            pages.style.transform = `translateX(${base + px}px)`;
        };
        const resetTranslate = (withAnim) => {
            pages.style.transition = withAnim ? '' : 'none';
            pages.style.transform = `translateX(${-_currentPage * 100}%)`;
            if (!withAnim) requestAnimationFrame(() => { pages.style.transition = ''; });
        };

        wrap.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (e.target.closest('.ph-home-app')) return;
            active = true; decided = false; horizontal = false;
            startX = e.clientX; startY = e.clientY;
            deltaX = 0; deltaY = 0;
        });
        wrap.addEventListener('pointermove', e => {
            if (!active) return;
            deltaX = e.clientX - startX;
            deltaY = e.clientY - startY;
            if (!decided) {
                if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
                    decided = true;
                    horizontal = Math.abs(deltaX) > Math.abs(deltaY);
                    if (horizontal) wrap.setPointerCapture?.(e.pointerId);
                } else return;
            }
            if (!horizontal) return;
            const atStart = _currentPage === 0 && deltaX > 0;
            const atEnd   = _currentPage === _layout.pages.length - 1 && deltaX < 0;
            setTranslate((atStart || atEnd) ? deltaX * 0.32 : deltaX);
        });
        const finish = () => {
            if (!active) return;
            active = false;
            if (!horizontal) return;
            const w = wrap.clientWidth || 1;
            const ratio = deltaX / w;
            let target = _currentPage;
            if (ratio < -THRESHOLD && _currentPage < _layout.pages.length - 1) target = _currentPage + 1;
            else if (ratio > THRESHOLD && _currentPage > 0) target = _currentPage - 1;
            _currentPage = target;
            resetTranslate(true);
            _renderDotsState();
        };
        wrap.addEventListener('pointerup', finish);
        wrap.addEventListener('pointercancel', finish);
        wrap.addEventListener('pointerleave', finish);
    }

    function _wireDots(view) {
        view.querySelectorAll('#phDots span').forEach(dot => {
            dot.addEventListener('click', () => {
                const i = parseInt(dot.dataset.dot, 10);
                if (isNaN(i)) return;
                _currentPage = i;
                _renderHome();
            });
        });
    }

    function _renderDotsState() {
        const dots = S.frameEl?.querySelectorAll('#phDots span');
        if (dots) dots.forEach((d, i) => d.classList.toggle('active', i === _currentPage));
    }

    function _filterApps(q) {
        q = String(q || '').trim().toLowerCase();
        const grid = S.frameEl?.querySelector('.ph-home-page[data-page="0"] .ph-home-grid');
        if (!grid) return;
        if (!q) { _renderHome(); return; }
        const builtins = P.apps?.builtinFallbacks?.() || [];
        const all = [...builtins, ...ctx.apps.all()];
        const results = all.filter(a => (a.name || a.id).toLowerCase().includes(q));
        grid.innerHTML = results.length
            ? results.map((a, i) => _homeAppHtml(a, 0, i)).join('')
            : `<div class="ph-home-empty">Nada encontrado.</div>`;
        _bindAppClicks(grid.querySelectorAll('.ph-home-app'));
    }

    // RELÓGIO E BUSCA MÓVEIS
    function _wireHomeMovables(view) {
        const items = [
            { node: view.querySelector('.ph-home-clock'),  xKey: 'clockX',  yKey: 'clockY',  isSearch: false },
            { node: view.querySelector('.ph-home-search'), xKey: 'searchX', yKey: 'searchY', isSearch: true  }
        ];
        items.forEach(({ node, xKey, yKey, isSearch }) => {
            if (!node) return;
            let active = false, moved = false, pid = null;
            let startX = 0, startY = 0, baseX = 0, baseY = 0;

            const onMove = (e) => {
                if (!active || e.pointerId !== pid) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (!moved) {
                    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                    moved = true;
                    node.classList.add('dragging');
                    if (isSearch) { try { node.querySelector('input')?.blur(); } catch(_) {} }
                }
                e.preventDefault();
                node.style.transition = 'none';
                node.style.transform = `translate(${baseX + dx}px, ${baseY + dy}px)`;
            };
            const onUp = (e) => {
                if (!active || e.pointerId !== pid) return;
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
                const wasMoved = moved;
                const fx = baseX + (e.clientX - startX);
                const fy = baseY + (e.clientY - startY);
                active = false; moved = false; pid = null;
                node.classList.remove('dragging');
                node.style.transition = '';
                if (wasMoved) {
                    _homeCfg[xKey] = fx; _homeCfg[yKey] = fy;
                    _saveHomeCfg();
                    node.style.transform = `translate(${fx}px, ${fy}px)`;
                } else if (isSearch) {
                    try { node.querySelector('input')?.focus(); } catch(_) {}
                }
            };

            node.addEventListener('pointerdown', e => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                if (active) return;
                active = true; moved = false; pid = e.pointerId;
                startX = e.clientX; startY = e.clientY;
                baseX = _homeCfg[xKey] || 0;
                baseY = _homeCfg[yKey] || 0;
                document.addEventListener('pointermove', onMove, { passive: false });
                document.addEventListener('pointerup', onUp);
                document.addEventListener('pointercancel', onUp);
            });
        });
    }

    // MENU DE CONTEXTO
    function _closeHomeCtx() {
        ctx.root?.querySelector('.ph-ctx-menu')?.remove();
    }

    function _openHomeCtx(x, y) {
        _closeHomeCtx();
        const menu = document.createElement('div');
        menu.className = 'ph-ctx-menu';
        const szLabel  = { small:'Pequeno', normal:'Normal', large:'Grande'   }[_homeCfg.iconSize] || 'Normal';
        const gapLabel = { tight:'Compacto', normal:'Normal', wide:'Amplo'    }[_homeCfg.gridGap]  || 'Normal';
        menu.innerHTML = `
            <div class="ph-ctx-label">Home</div>
            <button class="ph-ctx-item" data-act="toggle-clock">
                <span>Mostrar relógio</span><span class="ctx-val">${_homeCfg.showClock ? 'on' : 'off'}</span>
            </button>
            <button class="ph-ctx-item" data-act="toggle-search">
                <span>Mostrar busca</span><span class="ctx-val">${_homeCfg.showSearch ? 'on' : 'off'}</span>
            </button>
            <div class="ph-ctx-sep"></div>
            <div class="ph-ctx-label">Aparência</div>
            <button class="ph-ctx-item" data-act="size">
                <span>Tamanho dos ícones</span><span class="ctx-val" data-val="size">${szLabel}</span>
            </button>
            <button class="ph-ctx-item" data-act="gap">
                <span>Espaçamento da grade</span><span class="ctx-val" data-val="gap">${gapLabel}</span>
            </button>
            <div class="ph-ctx-sep"></div>
            <button class="ph-ctx-item" data-act="reset-pos"><span>Repor posições</span></button>
            <button class="ph-ctx-item" data-act="reset-layout"><span>Restaurar grade</span></button>
        `;
        ctx.root.appendChild(menu);
        requestAnimationFrame(() => {
            const mw = menu.offsetWidth, mh = menu.offsetHeight;
            menu.style.left = Math.max(8, Math.min(x, window.innerWidth  - mw - 8)) + 'px';
            menu.style.top  = Math.max(8, Math.min(y, window.innerHeight - mh - 8)) + 'px';
        });

        const onDoc = (ev) => {
            if (!menu.contains(ev.target)) {
                _closeHomeCtx();
                document.removeEventListener('pointerdown', onDoc, true);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', onDoc, true), 0);

        menu.addEventListener('click', e => {
            const btn = e.target.closest('.ph-ctx-item');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'toggle-clock') {
                _homeCfg.showClock = !_homeCfg.showClock;
                _saveHomeCfg(); _closeHomeCtx(); _renderHome();
            } else if (act === 'toggle-search') {
                _homeCfg.showSearch = !_homeCfg.showSearch;
                _saveHomeCfg(); _closeHomeCtx(); _renderHome();
            } else if (act === 'size') {
                const seq = ['small', 'normal', 'large'];
                _homeCfg.iconSize = seq[(seq.indexOf(_homeCfg.iconSize) + 1) % seq.length];
                _saveHomeCfg();
                menu.querySelector('[data-val="size"]').textContent =
                    { small:'Pequeno', normal:'Normal', large:'Grande' }[_homeCfg.iconSize];
                _applyHomeCfg();
            } else if (act === 'gap') {
                const seq = ['tight', 'normal', 'wide'];
                _homeCfg.gridGap = seq[(seq.indexOf(_homeCfg.gridGap) + 1) % seq.length];
                _saveHomeCfg();
                menu.querySelector('[data-val="gap"]').textContent =
                    { tight:'Compacto', normal:'Normal', wide:'Amplo' }[_homeCfg.gridGap];
                _applyHomeCfg();
            } else if (act === 'reset-pos') {
                _homeCfg.clockX = _homeCfg.clockY = 0;
                _homeCfg.searchX = _homeCfg.searchY = 0;
                _saveHomeCfg(); _closeHomeCtx(); _renderHome();
            } else if (act === 'reset-layout') {
                try { localStorage.removeItem(C.LS_LAYOUT); } catch(_) {}
                _layout = { pages: [new Array(C.PAGE_SIZE).fill(null)], dock: [] };
                _layoutInitialized = false;
                _currentPage = 0;
                _syncLayout(); _saveLayout(); _closeHomeCtx(); _renderHome();
            }
        });
    }

    function _fmtHomeDate(d) {
        try {
            const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
            return s.charAt(0).toUpperCase() + s.slice(1);
        } catch(_) { return d.toDateString(); }
    }

    function _teardown() {
        _cancelDragPageTimer();
        try { document.removeEventListener('dragover', _handleDragEdge, true); }    catch(_) {}
        try { document.removeEventListener('dragend',  _cancelDragPageTimer, true); } catch(_) {}
        try { document.removeEventListener('drop',     _cancelDragPageTimer, true); } catch(_) {}
    }

    // Listeners de drag global (document) — registrados agora, removidos no teardown
    document.addEventListener('dragover', _handleDragEdge, true);
    document.addEventListener('dragend',  _cancelDragPageTimer, true);
    document.addEventListener('drop',     _cancelDragPageTimer, true);

    // EXPORT
    P.home = {
        renderLock:  _renderLock,
        renderHome:  _renderHome,
        unlock:      _unlock,
        lock:        _lock,
        openHomeCtx: _openHomeCtx,
        closeHomeCtx:_closeHomeCtx,
        applyHomeCfg:_applyHomeCfg,
        teardown:    _teardown
    };
})();
