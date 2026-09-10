// ==UserScript==
// @name         LivePhoto
// @namespace    http://tampermonkey.net/
// @version      9.1.0-module
// @description  Substitui imagens. 
// @match        https://habblive.in/*
// @match        https://www.habblet.city/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
    "use strict";

    if (window.__hcprLoaded) return;
    window.__hcprLoaded = true;

    const GM_getValue = window.GM_getValue || function (key, fallback) {
        try {
            const raw = localStorage.getItem("livephoto_" + key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    };

    const GM_setValue = window.GM_setValue || function (key, value) {
        try {
            localStorage.setItem("livephoto_" + key, JSON.stringify(value));
        } catch {
            // ignora falha de storage
        }
    };

    const GM_addStyle = window.GM_addStyle || function (css) {
        const style = document.createElement("style");
        style.setAttribute("data-livephoto", "1");
        style.textContent = css;
        document.head.appendChild(style);
        return style;
    };

    const OUTPUT_SIZE = 320;
    const ICON_URL = "https://raw.githubusercontent.com/zBeyond5/assets/main/photo.png";

    const MIN_USER_SCALE = 0.2;
    const MAX_USER_SCALE = 8;

    const MIN_PANEL_SCALE = 0.7;
    const MAX_PANEL_SCALE = 1.7;

    const DRAG_HOLD_MS = 300;
    const DRAG_CANCEL_THRESHOLD = 6;

    // ---- Teardown (usado pelo kill do Hub) ----
    const teardownTasks = [];
    let handlePaste = null;

    // ------------------------------------------------------------------
    // Estado
    // ------------------------------------------------------------------

    const state = {
        active: GM_getValue("hcprActive", false),
        canvasMinSize: GM_getValue("hcprCanvasMinSize", 64),
        canvasSquareOnly: GM_getValue("hcprCanvasSquareOnly", true),
        panelHidden: GM_getValue("hcprPanelHidden", false),
        panelPos: GM_getValue("hcprPanelPos", null),
        panelScale: GM_getValue("hcprPanelScale", 1),
        reopenPos: GM_getValue("hcprReopenPos", null),
        image: null,
        blob: null,
        dataUrl: null,
        token: null,
        previewObjectUrl: null,
    };

    const view = {
        frameSize: 0,
        naturalWidth: 0,
        naturalHeight: 0,
        baseScale: 1,
        userScale: 1,
        offsetX: 0,
        offsetY: 0,
    };

    let renderOutputScheduled = false;

    // ------------------------------------------------------------------
    // Debug log
    // ------------------------------------------------------------------

    const debug = (() => {
        let logStore = GM_getValue("hcprDebugLog", []);
        let flushTimer = null;
        let dirty = false;

        function scheduleFlush() {
            dirty = true;
            if (flushTimer) return;

            flushTimer = setTimeout(() => {
                flushTimer = null;
                if (!dirty) return;
                dirty = false;

                try {
                    GM_setValue("hcprDebugLog", logStore);
                } catch (error) {
                    console.warn("[PhotoLive] falha ao salvar log", error);
                }
            }, 800);
        }

        return {
            add(type, data = {}) {
                try {
                    logStore.push({ time: new Date().toISOString(), type, data });

                    if (logStore.length > 300) {
                        logStore.shift();
                    }

                    scheduleFlush();
                    console.log(`[PhotoLive] ${type}`, data);
                } catch (error) {
                    console.warn("[PhotoLive] erro ao registrar log", error);
                }
            },

            clear() {
                logStore = [];
                dirty = false;

                if (flushTimer) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }

                try {
                    GM_setValue("hcprDebugLog", []);
                } catch (error) {
                    console.warn("[PhotoLive] falha ao limpar log", error);
                }
            },

            print() {
                console.table(logStore);
            },

            // ---- Destroy ----
            destroy() {
                if (flushTimer) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }
            },
        };
    })();

    function saveState() {
        try {
            GM_setValue("hcprActive", state.active);
            GM_setValue("hcprCanvasMinSize", state.canvasMinSize);
            GM_setValue("hcprCanvasSquareOnly", state.canvasSquareOnly);
            GM_setValue("hcprPanelHidden", state.panelHidden);
            GM_setValue("hcprPanelPos", state.panelPos);
            GM_setValue("hcprPanelScale", state.panelScale);
            GM_setValue("hcprReopenPos", state.reopenPos);
        } catch (error) {
            debug.add("state_save_error", { message: String(error) });
        }
    }

    // ------------------------------------------------------------------
    // Utilidades de upload
    // ------------------------------------------------------------------

    function isUploadRequest(url) {
        if (!url) return false;

        const normalized = String(url).toLowerCase();

        return [
            "/upload",
            "/photo",
            "/avatar",
            "/image",
            "/camera",
            "/profile",
        ].some((path) => normalized.includes(path));
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Falha ao ler a imagem processada."));

            reader.readAsDataURL(blob);
        });
    }

    function revokePreviewUrl() {
        if (state.previewObjectUrl) {
            URL.revokeObjectURL(state.previewObjectUrl);
            state.previewObjectUrl = null;
        }
    }

    // ------------------------------------------------------------------
    // Editor de posição/zoom + geração do PNG final 320x320
    // ------------------------------------------------------------------

    function computeContainScale(frameSize, width, height) {
        if (!frameSize || !width || !height) return 1;
        return Math.min(frameSize / width, frameSize / height);
    }

    function clampUserScale(scale) {
        return Math.min(MAX_USER_SCALE, Math.max(MIN_USER_SCALE, scale));
    }

    function clampOffsets() {
        const drawWidth = view.naturalWidth * view.baseScale * view.userScale;
        const drawHeight = view.naturalHeight * view.baseScale * view.userScale;
        const minOverlap = 24;

        const maxOffsetX = drawWidth / 2 + view.frameSize / 2 - minOverlap;
        const maxOffsetY = drawHeight / 2 + view.frameSize / 2 - minOverlap;

        view.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, view.offsetX));
        view.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, view.offsetY));
    }

    function applyPreviewTransform() {
        const preview = document.querySelector("#hcpr-preview");
        const zoomBadge = document.querySelector("#hcpr-zoom-badge");

        if (!preview || !view.naturalWidth) return;

        const displayWidth = view.naturalWidth * view.baseScale;
        const displayHeight = view.naturalHeight * view.baseScale;

        preview.style.width = `${displayWidth}px`;
        preview.style.height = `${displayHeight}px`;
        preview.style.transform =
            `translate(-50%, -50%) translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.userScale})`;

        if (zoomBadge) {
            zoomBadge.textContent = `${Math.round(view.userScale * 100)}%`;
        }
    }

    function renderOutputCanvas() {
        return new Promise((resolve, reject) => {
            try {
                if (!state.image || !view.frameSize) {
                    reject(new Error("Nenhuma imagem carregada."));
                    return;
                }

                const canvas = document.createElement("canvas");
                canvas.width = OUTPUT_SIZE;
                canvas.height = OUTPUT_SIZE;

                const ctx = canvas.getContext("2d");

                if (!ctx) {
                    reject(new Error("Canvas 2D não suportado neste navegador."));
                    return;
                }

                const exportRatio = OUTPUT_SIZE / view.frameSize;
                const drawWidth = view.naturalWidth * view.baseScale * view.userScale * exportRatio;
                const drawHeight = view.naturalHeight * view.baseScale * view.userScale * exportRatio;
                const centerX = OUTPUT_SIZE / 2 + view.offsetX * exportRatio;
                const centerY = OUTPUT_SIZE / 2 + view.offsetY * exportRatio;

                ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(
                    state.image,
                    centerX - drawWidth / 2,
                    centerY - drawHeight / 2,
                    drawWidth,
                    drawHeight
                );

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error("Não foi possível gerar o blob da imagem."));
                        return;
                    }

                    resolve(blob);
                }, "image/png");
            } catch (error) {
                reject(error);
            }
        });
    }

    let pendingRenderPromise = null;

    async function commitOutput() {
        try {
            state.blob = await renderOutputCanvas();
            state.dataUrl = await blobToDataUrl(state.blob);
        } catch (error) {
            debug.add("render_output_error", { message: String(error) });
        }
    }

    function scheduleRenderOutput() {
        if (renderOutputScheduled) return;
        renderOutputScheduled = true;

        if (pendingRenderPromise) {
            pendingRenderPromise.then(() => {
                renderOutputScheduled = false;
                scheduleRenderOutput();
            });
            return;
        }

        pendingRenderPromise = new Promise((resolve) => {
            const finish = () => {
                pendingRenderPromise = null;
                resolve();
            };
            const safetyTimer = setTimeout(finish, 1000);

            requestAnimationFrame(async () => {
                renderOutputScheduled = false;
                await commitOutput();
                clearTimeout(safetyTimer);
                finish();
            });
        });
    }

    async function ensureOutputReady() {
        if (!pendingRenderPromise) return;

        await Promise.race([
            pendingRenderPromise,
            new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);
    }

    // ------------------------------------------------------------------
    // Injeção em FormData / JSON
    // ------------------------------------------------------------------

    function findFileField(formData) {
        for (const [key, value] of formData.entries()) {
            const normalized = key.toLowerCase();

            const looksLikeFileKey =
                normalized.includes("file") ||
                normalized.includes("image") ||
                normalized.includes("photo") ||
                normalized.includes("avatar");

            const looksLikeFileValue = value instanceof Blob;

            if (looksLikeFileKey || looksLikeFileValue) {
                return key;
            }
        }

        return null;
    }

    function injectFormData(formData) {
        try {
            if (state.blob) {
                const fileField = findFileField(formData);

                if (fileField) {
                    formData.set(fileField, state.blob, "canvas-photo.png");
                } else {
                    formData.append("file", state.blob, "canvas-photo.png");
                }
            }

            if (state.token) {
                ["token", "upload_token", "access_token", "csrf_token"].forEach(
                    (field) => {
                        if (!formData.has(field)) {
                            formData.append(field, state.token);
                        }
                    }
                );
            }
        } catch (error) {
            debug.add("form_inject_error", { message: String(error) });
        }
    }

    function injectJson(body) {
        if (!body || typeof body !== "string") return body;

        try {
            const json = JSON.parse(body);

            if (!json || typeof json !== "object") return body;

            if (state.token) {
                ["token", "upload_token", "access_token", "csrf_token"].forEach(
                    (field) => {
                        if (field in json) {
                            json[field] = state.token;
                        }
                    }
                );
            }

            if (state.dataUrl) {
                ["file", "image", "photo"].forEach((field) => {
                    if (field in json) {
                        json[field] = state.dataUrl;
                    }
                });
            }

            return JSON.stringify(json);
        } catch (error) {
            debug.add("json_inject_error", { message: String(error) });
            return body;
        }
    }

    // ------------------------------------------------------------------
    // Hook de WebSocket
    // ------------------------------------------------------------------

    function setupWebSocketInterceptor() {
        const NativeWebSocket = window.WebSocket;

        if (!NativeWebSocket) {
            debug.add("websocket_unavailable");
            return;
        }

        class HookedWebSocket extends NativeWebSocket {
            constructor(...args) {
                super(...args);

                this.addEventListener("message", (event) => {
                    try {
                        if (typeof event.data !== "string") return;

                        const match = event.data.match(/@([a-f0-9]{64})\b/i);

                        if (!match) return;

                        state.token = match[1];
                        debug.add("connection_ready");
                        updateStatus("Conexão pronta", "success");
                    } catch (error) {
                        debug.add("ws_message_hook_error", { message: String(error) });
                    }
                });

                this.addEventListener("close", () => {
                    state.token = null;
                });
            }
        }

        window.WebSocket = HookedWebSocket;

        // ---- Teardown ----
        teardownTasks.push(() => {
            window.WebSocket = NativeWebSocket;
        });
    }

    // ------------------------------------------------------------------
    // Hook de fetch
    // ------------------------------------------------------------------

    function setupFetchInterceptor() {
        const originalFetch = window.fetch;

        if (typeof originalFetch !== "function") {
            debug.add("fetch_unavailable");
            return;
        }

        window.fetch = async function (input, init) {
            try {
                if (!state.active) {
                    return originalFetch.call(this, input, init);
                }

                const isRequestObject =
                    typeof Request !== "undefined" && input instanceof Request;

                const url = isRequestObject ? input.url : input?.url || input;

                if (!isUploadRequest(url)) {
                    return originalFetch.call(this, input, init);
                }

                debug.add("fetch_intercepted", {
                    method: (init && init.method) || (isRequestObject && input.method) || "GET",
                });

                await ensureOutputReady();

                if (isRequestObject) {
                    return rewriteRequestAndFetch(input, init, originalFetch, this);
                }

                const nextInit = { ...(init || {}) };

                if (nextInit.body instanceof FormData) {
                    injectFormData(nextInit.body);
                } else if (typeof nextInit.body === "string") {
                    nextInit.body = injectJson(nextInit.body);
                }

                updateStatus(
                    state.blob ? "Imagem substituída" : "Aguardando imagem",
                    state.blob ? "success" : "info"
                );

                return originalFetch.call(this, input, nextInit);
            } catch (error) {
                debug.add("fetch_hook_error", { message: String(error) });
                return originalFetch.call(this, input, init);
            }
        };

        // ---- Teardown ----
        teardownTasks.push(() => {
            window.fetch = originalFetch;
        });
    }

    async function rewriteRequestAndFetch(request, init, originalFetch, ctx) {
        try {
            const contentType = request.headers.get("content-type") || "";

            if (contentType.includes("multipart/form-data")) {
                debug.add("fetch_request_formdata_unsupported");
                return originalFetch.call(ctx, request, init);
            }

            const text = await request.clone().text();
            const body = injectJson(text);
            const rewritten = new Request(request, { body });

            return originalFetch.call(ctx, rewritten, init);
        } catch (error) {
            debug.add("fetch_request_rewrite_error", { message: String(error) });
            return originalFetch.call(ctx, request, init);
        }
    }

    // ------------------------------------------------------------------
    // Hook de XHR
    // ------------------------------------------------------------------

    function setupXhrInterceptor() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...args) {
            this.__hcprUrl = url;
            this.__hcprMethod = method;

            return originalOpen.call(this, method, url, ...args);
        };

        XMLHttpRequest.prototype.send = function (body) {
            if (state.active && isUploadRequest(this.__hcprUrl) && pendingRenderPromise) {
                const xhr = this;
                const capturedBody = body;
                let sent = false;
                const doSend = () => {
                    if (sent) return;
                    sent = true;
                    finalizeXhrSend(xhr, capturedBody);
                };
                pendingRenderPromise.then(doSend);
                setTimeout(doSend, 1200);
                return;
            }

            return finalizeXhrSend(this, body);
        };

        function finalizeXhrSend(xhr, body) {
            try {
                if (state.active && isUploadRequest(xhr.__hcprUrl)) {
                    debug.add("xhr_intercepted", { method: xhr.__hcprMethod || "GET" });

                    if (body instanceof FormData) {
                        injectFormData(body);
                    } else if (typeof body === "string") {
                        body = injectJson(body);
                    }

                    updateStatus(
                        state.blob ? "Imagem substituída" : "Aguardando imagem",
                        state.blob ? "success" : "info"
                    );
                }
            } catch (error) {
                debug.add("xhr_hook_error", { message: String(error) });
            }

            return originalSend.call(xhr, body);
        };

        // ---- Teardown ----
        teardownTasks.push(() => {
            XMLHttpRequest.prototype.open = originalOpen;
            XMLHttpRequest.prototype.send = originalSend;
        });
    }

    // ------------------------------------------------------------------
    // Hook de Canvas
    // ------------------------------------------------------------------

    function canvasMatchesFilter(canvas) {
        try {
            const { width, height } = canvas;

            if (!width || !height) return false;
            if (width < state.canvasMinSize || height < state.canvasMinSize) return false;
            if (state.canvasSquareOnly && width !== height) return false;

            return true;
        } catch {
            return false;
        }
    }

    function setupCanvasHooks() {
        const originalToBlob = HTMLCanvasElement.prototype.toBlob;
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
            try {
                if (state.active && (state.blob || pendingRenderPromise)) {
                    debug.add("canvas_toBlob_seen", {
                        width: this.width,
                        height: this.height,
                        matched: canvasMatchesFilter(this),
                    });

                    if (canvasMatchesFilter(this)) {
                        if (pendingRenderPromise) {
                            let called = false;
                            const doCallback = () => {
                                if (called) return;
                                called = true;
                                callback(state.blob);
                            };
                            pendingRenderPromise.then(doCallback);
                            setTimeout(doCallback, 1200);
                        } else {
                            setTimeout(() => callback(state.blob), 0);
                        }
                        return;
                    }
                }
            } catch (error) {
                debug.add("canvas_toBlob_hook_error", { message: String(error) });
            }

            return originalToBlob.call(this, callback, type, quality);
        };

        HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
            try {
                if (state.active && state.dataUrl) {
                    debug.add("canvas_toDataURL_seen", {
                        width: this.width,
                        height: this.height,
                        matched: canvasMatchesFilter(this),
                    });

                    if (canvasMatchesFilter(this)) {
                        return state.dataUrl;
                    }
                }
            } catch (error) {
                debug.add("canvas_toDataURL_hook_error", { message: String(error) });
            }

            return originalToDataURL.call(this, type, quality);
        };

        // ---- Teardown ----
        teardownTasks.push(() => {
            HTMLCanvasElement.prototype.toBlob = originalToBlob;
            HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
        });
    }

    // ------------------------------------------------------------------
    // UI — status
    // ------------------------------------------------------------------

    const STATUS_TO_STATE = {
        info: "idle",
        success: "ready",
        error: "error",
    };

    function updateStatus(message, type = "info") {
        const statusText = document.querySelector("#hcpr-status-text");
        const shell = document.querySelector("#hcpr-shell");

        if (statusText) statusText.textContent = message;
        if (shell) shell.dataset.state = STATUS_TO_STATE[type] || "idle";
    }

    // ------------------------------------------------------------------
    // UI — carregar/limpar/restaurar imagem
    // ------------------------------------------------------------------

    function getFrameSize(frameInner) {
        return frameInner.clientWidth || frameInner.getBoundingClientRect().width || OUTPUT_SIZE;
    }

    function getPanelScaleFactor() {
        return state.panelScale || 1;
    }

    function waitForStableLayout() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
    }

    async function initViewForImage(image, frameInner) {
        await waitForStableLayout();

        view.frameSize = getFrameSize(frameInner);
        view.naturalWidth = image.naturalWidth || image.width;
        view.naturalHeight = image.naturalHeight || image.height;
        view.baseScale = computeContainScale(view.frameSize, view.naturalWidth, view.naturalHeight);
        view.userScale = 1;
        view.offsetX = 0;
        view.offsetY = 0;

        debug.add("view_init", { frameSize: view.frameSize, baseScale: view.baseScale });
    }

    function resetView() {
        view.frameSize = 0;
        view.naturalWidth = 0;
        view.naturalHeight = 0;
        view.baseScale = 1;
        view.userScale = 1;
        view.offsetX = 0;
        view.offsetY = 0;
    }

    function restoreDefaultFraming() {
        if (!state.image) return;

        view.userScale = 1;
        view.offsetX = 0;
        view.offsetY = 0;

        applyPreviewTransform();
        scheduleRenderOutput();
        debug.add("view_restored_default");
    }

    let selectionGeneration = 0;

    async function handleSelectedFile(file, root) {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            updateStatus("Formato inválido", "error");
            return;
        }

        const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

        if (file.size > MAX_SOURCE_BYTES) {
            updateStatus("Imagem grande demais (máx. 25MB)", "error");
            return;
        }

        const mySelection = ++selectionGeneration;

        const preview = root.querySelector("#hcpr-preview");
        const emptyState = root.querySelector("#hcpr-empty");
        const fileName = root.querySelector("#hcpr-file-name");
        const frameInner = root.querySelector("#hcpr-frame-inner");
        const zoomBadge = root.querySelector("#hcpr-zoom-badge");
        const restoreButton = root.querySelector("#hcpr-restore");

        updateStatus("Processando imagem", "info");

        let objectUrl = null;

        try {
            const image = new Image();
            objectUrl = URL.createObjectURL(file);

            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
                image.src = objectUrl;
            });

            if (mySelection !== selectionGeneration) return;

            state.image = image;

            revokePreviewUrl();
            state.previewObjectUrl = URL.createObjectURL(file);

            if (preview) {
                preview.src = state.previewObjectUrl;
                preview.hidden = false;
            }

            if (emptyState) emptyState.hidden = true;
            if (fileName) fileName.textContent = file.name;
            if (zoomBadge) zoomBadge.hidden = false;
            if (restoreButton) restoreButton.hidden = false;

            await initViewForImage(image, frameInner);

            if (mySelection !== selectionGeneration) return;

            applyPreviewTransform();
            await commitOutput();

            if (mySelection !== selectionGeneration) return;

            updateStatus("Pronta · 320 × 320", "success");
            debug.add("image_ready", { type: file.type, size: file.size });
        } catch (error) {
            if (mySelection === selectionGeneration) {
                debug.add("image_error", { message: String(error) });
                updateStatus("Erro ao processar imagem", "error");
            }
        } finally {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
    }

    function clearPreview(root) {
        selectionGeneration++;
        revokePreviewUrl();
        state.image = null;
        state.blob = null;
        state.dataUrl = null;
        resetView();

        const preview = root.querySelector("#hcpr-preview");
        const emptyState = root.querySelector("#hcpr-empty");
        const fileName = root.querySelector("#hcpr-file-name");
        const zoomBadge = root.querySelector("#hcpr-zoom-badge");
        const restoreButton = root.querySelector("#hcpr-restore");

        if (preview) {
            preview.hidden = true;
            preview.style.transform = "";
            preview.style.width = "";
            preview.style.height = "";
        }

        if (emptyState) emptyState.hidden = false;
        if (fileName) fileName.textContent = "Nenhum arquivo selecionado";
        if (zoomBadge) zoomBadge.hidden = true;
        if (restoreButton) restoreButton.hidden = true;

        updateStatus("Imagem removida", "info");
        debug.add("image_reset");
    }

    // ------------------------------------------------------------------
    // UI — painel: arrastar e redimensionar
    // ------------------------------------------------------------------

    function setPanelHidden(hidden) {
        const shell = document.querySelector("#hcpr-tool");
        const reopen = document.querySelector("#hcpr-reopen");

        state.panelHidden = hidden;
        saveState();

        if (shell) shell.classList.toggle("hcpr-hidden", hidden);
        if (reopen) reopen.hidden = !hidden;
    }

    function applyPanelPosition(panel) {
        if (!state.panelPos) return;

        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.left = `${state.panelPos.left}px`;
        panel.style.top = `${state.panelPos.top}px`;
    }

    function applyPanelScale(panel) {
        panel.style.transform = `scale(${state.panelScale})`;
    }

    function applyReopenPosition(reopen) {
        if (!state.reopenPos) return;

        reopen.style.right = "auto";
        reopen.style.bottom = "auto";
        reopen.style.left = `${state.reopenPos.left}px`;
        reopen.style.top = `${state.reopenPos.top}px`;
    }

    function makePanelDraggable(handle, panel) {
        let dragging = false;
        let holdTimer = null;
        let pending = false;
        let startClientX = 0;
        let startClientY = 0;
        let startLeft = 0;
        let startTop = 0;

        function cancelPending() {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
            pending = false;
        }

        function beginDrag() {
            const rect = panel.getBoundingClientRect();

            dragging = true;
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = "auto";
            panel.style.bottom = "auto";
            panel.style.left = `${startLeft}px`;
            panel.style.top = `${startTop}px`;

            handle.classList.add("hcpr-dragging");
        }

        handle.addEventListener("pointerdown", (event) => {
            if (event.target.closest("#hcpr-close")) return;

            startClientX = event.clientX;
            startClientY = event.clientY;
            pending = true;

            handle.setPointerCapture(event.pointerId);

            holdTimer = setTimeout(() => {
                holdTimer = null;
                if (pending) beginDrag();
            }, DRAG_HOLD_MS);
        });

        handle.addEventListener("pointermove", (event) => {
            if (dragging) {
                const deltaX = event.clientX - startClientX;
                const deltaY = event.clientY - startClientY;

                const maxLeft = window.innerWidth - panel.offsetWidth - 4;
                const maxTop = window.innerHeight - panel.offsetHeight - 4;

                const nextLeft = Math.min(Math.max(startLeft + deltaX, 4), Math.max(4, maxLeft));
                const nextTop = Math.min(Math.max(startTop + deltaY, 4), Math.max(4, maxTop));

                panel.style.left = `${nextLeft}px`;
                panel.style.top = `${nextTop}px`;
                return;
            }

            if (pending) {
                const moved = Math.hypot(event.clientX - startClientX, event.clientY - startClientY);
                if (moved > DRAG_CANCEL_THRESHOLD) cancelPending();
            }
        });

        function endInteraction(event) {
            cancelPending();

            if (dragging) {
                dragging = false;
                handle.classList.remove("hcpr-dragging");

                state.panelPos = {
                    left: parseFloat(panel.style.left) || 0,
                    top: parseFloat(panel.style.top) || 0,
                };

                saveState();
            }

            try {
                handle.releasePointerCapture(event.pointerId);
            } catch {
                // ponteiro já liberado
            }
        }

        handle.addEventListener("pointerup", endInteraction);
        handle.addEventListener("pointercancel", endInteraction);
    }

    function makePanelResizable(handle, panel) {
        let resizing = false;
        let startClientX = 0;
        let startScale = 1;

        handle.addEventListener("pointerdown", (event) => {
            event.stopPropagation();

            resizing = true;
            startClientX = event.clientX;
            startScale = state.panelScale;

            handle.setPointerCapture(event.pointerId);
            handle.classList.add("hcpr-resizing");
        });

        handle.addEventListener("pointermove", (event) => {
            if (!resizing) return;

            const deltaX = event.clientX - startClientX;
            const nextScale = Math.min(
                MAX_PANEL_SCALE,
                Math.max(MIN_PANEL_SCALE, startScale + deltaX / 220)
            );

            state.panelScale = nextScale;
            applyPanelScale(panel);
        });

        function endResize(event) {
            if (!resizing) return;

            resizing = false;
            handle.classList.remove("hcpr-resizing");

            try {
                handle.releasePointerCapture(event.pointerId);
            } catch {
                // ponteiro já liberado
            }

            saveState();
        }

        handle.addEventListener("pointerup", endResize);
        handle.addEventListener("pointercancel", endResize);
    }

    function makeReopenDraggable(reopen) {
        let dragging = false;
        let holdTimer = null;
        let pending = false;
        let startClientX = 0;
        let startClientY = 0;
        let startLeft = 0;
        let startTop = 0;

        function cancelPending() {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
            pending = false;
        }

        function beginDrag() {
            const rect = reopen.getBoundingClientRect();

            dragging = true;
            startLeft = rect.left;
            startTop = rect.top;

            reopen.style.right = "auto";
            reopen.style.bottom = "auto";
            reopen.style.left = `${startLeft}px`;
            reopen.style.top = `${startTop}px`;

            reopen.classList.add("hcpr-dragging");
        }

        reopen.addEventListener("pointerdown", (event) => {
            startClientX = event.clientX;
            startClientY = event.clientY;
            pending = true;

            reopen.setPointerCapture(event.pointerId);

            holdTimer = setTimeout(() => {
                holdTimer = null;
                if (pending) beginDrag();
            }, DRAG_HOLD_MS);
        });

        reopen.addEventListener("pointermove", (event) => {
            if (dragging) {
                const deltaX = event.clientX - startClientX;
                const deltaY = event.clientY - startClientY;

                const maxLeft = window.innerWidth - reopen.offsetWidth - 4;
                const maxTop = window.innerHeight - reopen.offsetHeight - 4;

                const nextLeft = Math.min(Math.max(startLeft + deltaX, 4), Math.max(4, maxLeft));
                const nextTop = Math.min(Math.max(startTop + deltaY, 4), Math.max(4, maxTop));

                reopen.style.left = `${nextLeft}px`;
                reopen.style.top = `${nextTop}px`;
                return;
            }

            if (pending) {
                const moved = Math.hypot(event.clientX - startClientX, event.clientY - startClientY);
                if (moved > DRAG_CANCEL_THRESHOLD) cancelPending();
            }
        });

        function endInteraction(event) {
            const wasDragging = dragging;

            cancelPending();

            if (dragging) {
                dragging = false;
                reopen.classList.remove("hcpr-dragging");

                state.reopenPos = {
                    left: parseFloat(reopen.style.left) || 0,
                    top: parseFloat(reopen.style.top) || 0,
                };

                saveState();
            }

            try {
                reopen.releasePointerCapture(event.pointerId);
            } catch {
                // ponteiro já liberado
            }

            if (wasDragging) {
                reopen.dataset.suppressClick = "1";
                setTimeout(() => delete reopen.dataset.suppressClick, 0);
            }
        }

        reopen.addEventListener("pointerup", endInteraction);
        reopen.addEventListener("pointercancel", endInteraction);
    }

    // ------------------------------------------------------------------
    // UI — editor de pan/zoom da imagem
    // ------------------------------------------------------------------

    function bindImageEditor(root) {
        const frame = root.querySelector("#hcpr-frame");
        const frameInner = root.querySelector("#hcpr-frame-inner");

        let panning = false;
        let lastClientX = 0;
        let lastClientY = 0;

        frame.addEventListener("pointerdown", (event) => {
            if (!state.image) return;
            if (event.target.closest(".hcpr-link-button, .hcpr-frame-tool")) return;

            panning = true;
            lastClientX = event.clientX;
            lastClientY = event.clientY;

            frame.setPointerCapture(event.pointerId);
            frame.classList.add("hcpr-frame-panning");
        });

        frame.addEventListener("pointermove", (event) => {
            if (!panning) return;

            const scaleFactor = getPanelScaleFactor();

            view.offsetX += (event.clientX - lastClientX) / scaleFactor;
            view.offsetY += (event.clientY - lastClientY) / scaleFactor;
            lastClientX = event.clientX;
            lastClientY = event.clientY;

            clampOffsets();
            applyPreviewTransform();
            scheduleRenderOutput();
        });

        function endPan(event) {
            if (!panning) return;

            panning = false;
            frame.classList.remove("hcpr-frame-panning");

            try {
                frame.releasePointerCapture(event.pointerId);
            } catch {
                // ponteiro já liberado
            }
        }

        frame.addEventListener("pointerup", endPan);
        frame.addEventListener("pointercancel", endPan);

        frame.addEventListener(
            "wheel",
            (event) => {
                if (!state.image || !event.ctrlKey) return;

                event.preventDefault();

                const rect = frameInner.getBoundingClientRect();
                const scaleFactor = getPanelScaleFactor();
                const pointerX = (event.clientX - rect.left - rect.width / 2) / scaleFactor;
                const pointerY = (event.clientY - rect.top - rect.height / 2) / scaleFactor;

                const zoomFactor = Math.exp(-event.deltaY * 0.0018);
                const nextUserScale = clampUserScale(view.userScale * zoomFactor);

                const imagePointX = (pointerX - view.offsetX) / view.userScale;
                const imagePointY = (pointerY - view.offsetY) / view.userScale;

                view.userScale = nextUserScale;
                view.offsetX = pointerX - imagePointX * nextUserScale;
                view.offsetY = pointerY - imagePointY * nextUserScale;

                clampOffsets();
                applyPreviewTransform();
                scheduleRenderOutput();
            },
            { passive: false }
        );

        frame.addEventListener("dblclick", () => restoreDefaultFraming());

        const resizeObserver = new ResizeObserver((entries) => {
            if (!state.image) return;

            const entry = entries[0];
            const newFrameSize = entry.contentRect.width;

            if (!newFrameSize || newFrameSize === view.frameSize) return;

            const ratio = newFrameSize / view.frameSize;

            view.offsetX *= ratio;
            view.offsetY *= ratio;
            view.frameSize = newFrameSize;
            view.baseScale = computeContainScale(view.frameSize, view.naturalWidth, view.naturalHeight);

            clampOffsets();
            applyPreviewTransform();
            scheduleRenderOutput();
        });

        resizeObserver.observe(frameInner);
    }

    // ------------------------------------------------------------------
    // UI — montagem
    // ------------------------------------------------------------------

    function createInterface() {
        if (!document.body || document.querySelector("#hcpr-tool")) {
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.id = "hcpr-tool";

        wrapper.innerHTML = `
            <div class="hcpr-shell" id="hcpr-shell" data-state="idle">
                <header class="hcpr-header" id="hcpr-header">
                    <div class="hcpr-mark" aria-hidden="true">
                        <img src="${ICON_URL}" alt="" class="hcpr-mark-img">
                    </div>

                    <div class="hcpr-title">
                        <strong>LivePhoto [by SANG]</strong>
                        <span id="hcpr-status-text">Standby</span>
                    </div>

                    <button type="button" id="hcpr-close" class="hcpr-ghost-button" aria-label="Minimizar painel">
                        <svg viewBox="0 0 24 24" fill="none"><path d="M6 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                    </button>
                </header>

                <section class="hcpr-frame" id="hcpr-frame">
                    <div class="hcpr-frame-inner" id="hcpr-frame-inner">
                        <img id="hcpr-preview" alt="Prévia da imagem selecionada" hidden>

                        <div id="hcpr-empty" class="hcpr-empty">
                            <span>Arraste, cole (Ctrl+V) ou</span>
                            <label for="hcpr-file" class="hcpr-link-button">selecione um arquivo</label>
                        </div>

                        <button type="button" id="hcpr-restore" class="hcpr-frame-tool" aria-label="Restaurar enquadramento padrão" hidden>
                            <svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 1 1 2.7 6M4 12v5m0-5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>

                        <span class="hcpr-zoom-badge hcpr-mono" id="hcpr-zoom-badge" hidden>100%</span>

                        <span class="hcpr-corner hcpr-corner-tl"></span>
                        <span class="hcpr-corner hcpr-corner-tr"></span>
                        <span class="hcpr-corner hcpr-corner-bl"></span>
                        <span class="hcpr-corner hcpr-corner-br"></span>
                    </div>
                </section>

                <div class="hcpr-readout">
                    <span>saída fixa</span>
                    <span class="hcpr-mono">320 × 320</span>
                    <span class="hcpr-readout-sep">·</span>
                    <span>arraste pra mover, ctrl+scroll pra zoom</span>
                </div>

                <input id="hcpr-file" class="hcpr-file-input" type="file" accept="image/png,image/jpeg,image/webp">

                <div class="hcpr-primary-row">
                    <div class="hcpr-primary-label">
                        <strong>Ativo</strong>
                        <span id="hcpr-file-name">Nenhum arquivo selecionado</span>
                    </div>

                    <label class="hcpr-switch">
                        <input id="hcpr-active" type="checkbox" ${state.active ? "checked" : ""}>
                        <span class="hcpr-slider"></span>
                    </label>
                </div>

                <details class="hcpr-disclosure">
                    <summary>
                        <span>Ajustes</span>
                        <svg class="hcpr-chevron" viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </summary>

                    <div class="hcpr-disclosure-body">
                        <div class="hcpr-setting-row">
                            <span>Somente canvas quadrado</span>
                            <label class="hcpr-switch hcpr-switch-sm">
                                <input id="hcpr-square-only" type="checkbox" ${state.canvasSquareOnly ? "checked" : ""}>
                                <span class="hcpr-slider"></span>
                            </label>
                        </div>

                        <div class="hcpr-setting-row">
                            <span>Tamanho mínimo do canvas</span>
                            <div class="hcpr-number-field">
                                <input id="hcpr-min-size" class="hcpr-mono" type="number" min="1" step="1" value="${state.canvasMinSize}">
                                <span class="hcpr-mono hcpr-unit">px</span>
                            </div>
                        </div>

                        <div class="hcpr-text-actions">
                            <button type="button" id="hcpr-logs" class="hcpr-text-button">Diagnóstico</button>
                            <button type="button" id="hcpr-clear-logs" class="hcpr-text-button">Limpar log</button>
                            <button type="button" id="hcpr-reset" class="hcpr-text-button hcpr-text-button-danger">Resetar imagem</button>
                        </div>
                    </div>
                </details>

                <div class="hcpr-resize-handle" id="hcpr-resize-handle" aria-hidden="true"></div>
            </div>
        `;

        const reopen = document.createElement("button");
        reopen.type = "button";
        reopen.id = "hcpr-reopen";
        reopen.setAttribute("aria-label", "Abrir painel PhotoLive");
        reopen.hidden = !state.panelHidden;
        reopen.innerHTML = `<img src="${ICON_URL}" alt="" class="hcpr-reopen-img">`;

        document.body.appendChild(wrapper);
        document.body.appendChild(reopen);

        applyPanelPosition(wrapper);
        applyPanelScale(wrapper);
        applyReopenPosition(reopen);

        if (state.panelHidden) {
            wrapper.classList.add("hcpr-hidden");
        }

        bindInterface(wrapper, reopen);
    }

    function bindInterface(root, reopen) {
        const fileInput = root.querySelector("#hcpr-file");
        const frame = root.querySelector("#hcpr-frame");
        const header = root.querySelector("#hcpr-header");
        const resizeHandle = root.querySelector("#hcpr-resize-handle");
        const activeToggle = root.querySelector("#hcpr-active");
        const squareOnlyToggle = root.querySelector("#hcpr-square-only");
        const minSizeInput = root.querySelector("#hcpr-min-size");
        const closeButton = root.querySelector("#hcpr-close");
        const logsButton = root.querySelector("#hcpr-logs");
        const clearLogsButton = root.querySelector("#hcpr-clear-logs");
        const resetButton = root.querySelector("#hcpr-reset");
        const restoreButton = root.querySelector("#hcpr-restore");

        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            handleSelectedFile(file, root);
        });

        ["dragenter", "dragover"].forEach((eventName) => {
            frame.addEventListener(eventName, (event) => {
                event.preventDefault();
                frame.classList.add("hcpr-frame-dragging");
            });
        });

        ["dragleave", "drop"].forEach((eventName) => {
            frame.addEventListener(eventName, (event) => {
                event.preventDefault();
                frame.classList.remove("hcpr-frame-dragging");
            });
        });

        frame.addEventListener("drop", (event) => {
            const file = event.dataTransfer?.files?.[0];
            if (file) handleSelectedFile(file, root);
        });

        // ---- Paste listener (referência guardada p/ remover no kill) ----
        handlePaste = (event) => {
            if (state.panelHidden) return;

            const items = event.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (!item.type.startsWith("image/")) continue;

                const file = item.getAsFile();
                if (!file) continue;

                event.preventDefault();
                handleSelectedFile(file, root);
                updateStatus("Imagem colada", "info");
                break;
            }
        };
        document.addEventListener("paste", handlePaste);

        activeToggle.addEventListener("change", () => {
            state.active = activeToggle.checked;
            saveState();

            updateStatus(
                state.active ? "Substituição ativada" : "Substituição pausada",
                state.active ? "success" : "info"
            );

            debug.add(state.active ? "tool_enabled" : "tool_disabled");
        });

        squareOnlyToggle.addEventListener("change", () => {
            state.canvasSquareOnly = squareOnlyToggle.checked;
            saveState();
            debug.add("canvas_filter_changed", { squareOnly: state.canvasSquareOnly });
        });

        minSizeInput.addEventListener("change", () => {
            const parsed = parseInt(minSizeInput.value, 10);
            const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

            state.canvasMinSize = safeValue;
            minSizeInput.value = String(safeValue);
            saveState();

            debug.add("canvas_min_size_changed", { minSize: safeValue });
        });

        closeButton.addEventListener("click", () => setPanelHidden(true));
        reopen.addEventListener("click", () => {
            if (reopen.dataset.suppressClick) return;
            setPanelHidden(false);
        });

        logsButton.addEventListener("click", () => {
            debug.print();
            updateStatus("Diagnóstico no console", "info");
        });

        clearLogsButton.addEventListener("click", () => {
            debug.clear();
            updateStatus("Log limpo", "info");
        });

        resetButton.addEventListener("click", () => clearPreview(root));
        restoreButton.addEventListener("click", () => restoreDefaultFraming());

        makePanelDraggable(header, root);
        makePanelResizable(resizeHandle, root);
        makeReopenDraggable(reopen);
        bindImageEditor(root);
    }

    GM_addStyle(`
        :root {
            --hcpr-bg: #121316;
            --hcpr-panel: #17181c;
            --hcpr-elevated: #1d1f24;
            --hcpr-border: #2a2c31;
            --hcpr-text: #eceef0;
            --hcpr-muted: #888c94;
            --hcpr-accent: #5eead4;
            --hcpr-warn: #ff7a59;
            --hcpr-radius: 14px;
            --hcpr-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
            --hcpr-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
        }

        #hcpr-tool {
            all: initial;
            position: fixed;
            z-index: 2147483647;
            right: 22px;
            bottom: 22px;
            width: 296px;
            color: var(--hcpr-text);
            font-family: var(--hcpr-sans);
            transform-origin: top left;
        }

        #hcpr-tool *, #hcpr-tool *::before, #hcpr-tool *::after {
            box-sizing: border-box;
        }

        #hcpr-tool.hcpr-hidden { display: none; }

        .hcpr-shell {
            position: relative;
            overflow: visible;
            border: 1px solid var(--hcpr-border);
            border-radius: var(--hcpr-radius);
            background: var(--hcpr-bg);
            box-shadow: 0 20px 60px rgba(0, 0, 0, .4), 0 6px 18px rgba(0, 0, 0, .22);
        }

        .hcpr-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 14px 12px;
            border-radius: var(--hcpr-radius) var(--hcpr-radius) 0 0;
            cursor: grab;
            touch-action: none;
            user-select: none;
        }

        .hcpr-header.hcpr-dragging { cursor: grabbing; }

        .hcpr-mark {
            display: grid;
            flex: 0 0 auto;
            width: 30px;
            height: 30px;
            place-items: center;
            overflow: hidden;
            border: 1px solid var(--hcpr-border);
            border-radius: 9px;
            color: var(--hcpr-muted);
            background: var(--hcpr-panel);
            transition: border-color .2s ease;
        }

        .hcpr-mark-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .hcpr-shell[data-state="ready"] .hcpr-mark {
            border-color: color-mix(in srgb, var(--hcpr-accent) 40%, var(--hcpr-border));
        }

        .hcpr-shell[data-state="error"] .hcpr-mark {
            border-color: color-mix(in srgb, var(--hcpr-warn) 40%, var(--hcpr-border));
        }

        .hcpr-title {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            min-width: 0;
            gap: 2px;
        }

        .hcpr-title strong {
            font-size: 12.5px;
            font-weight: 650;
            letter-spacing: -.01em;
        }

        .hcpr-title span {
            overflow: hidden;
            color: var(--hcpr-muted);
            font-size: 10px;
            text-overflow: ellipsis;
            white-space: nowrap;
            transition: color .2s ease;
        }

        .hcpr-shell[data-state="ready"] .hcpr-title span { color: var(--hcpr-accent); }
        .hcpr-shell[data-state="error"] .hcpr-title span { color: var(--hcpr-warn); }

        .hcpr-ghost-button {
            display: grid;
            flex: 0 0 auto;
            width: 26px;
            height: 26px;
            padding: 0;
            place-items: center;
            border: 0;
            border-radius: 8px;
            color: var(--hcpr-muted);
            background: transparent;
            cursor: pointer;
        }

        .hcpr-ghost-button svg { width: 15px; height: 15px; }
        .hcpr-ghost-button:hover { color: var(--hcpr-text); background: var(--hcpr-panel); }

        .hcpr-frame { padding: 0 14px; }

        .hcpr-frame-inner {
            position: relative;
            aspect-ratio: 1 / 1;
            overflow: hidden;
            border-radius: 10px;
            background:
                linear-gradient(45deg, var(--hcpr-elevated) 25%, transparent 25%),
                linear-gradient(-45deg, var(--hcpr-elevated) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, var(--hcpr-elevated) 75%),
                linear-gradient(-45deg, transparent 75%, var(--hcpr-elevated) 75%),
                var(--hcpr-panel);
            background-position: 0 0, 0 7px, 7px -7px, -7px 0;
            background-size: 14px 14px;
            transition: filter .15s ease;
        }

        .hcpr-frame-inner img {
            position: absolute;
            top: 50%;
            left: 50%;
            max-width: none;
            transform-origin: center;
            will-change: transform;
            pointer-events: none;
        }

        .hcpr-frame { cursor: default; }
        .hcpr-frame:has(#hcpr-preview:not([hidden])) { cursor: grab; touch-action: none; }
        .hcpr-frame-panning { cursor: grabbing !important; }
        .hcpr-frame-dragging .hcpr-frame-inner { filter: brightness(1.15); }

        .hcpr-empty {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            gap: 4px;
            color: var(--hcpr-muted);
            font-size: 10.5px;
            text-align: center;
        }

        .hcpr-link-button { color: var(--hcpr-accent); cursor: pointer; }
        .hcpr-link-button:hover { text-decoration: underline; }

        .hcpr-frame-tool {
            position: absolute;
            top: 8px;
            left: 8px;
            display: grid;
            width: 24px;
            height: 24px;
            padding: 0;
            place-items: center;
            border: 1px solid var(--hcpr-border);
            border-radius: 7px;
            color: var(--hcpr-text);
            background: rgba(18, 19, 22, .82);
            cursor: pointer;
        }

        .hcpr-frame-tool svg { width: 13px; height: 13px; }
        .hcpr-frame-tool:hover { color: var(--hcpr-accent); border-color: color-mix(in srgb, var(--hcpr-accent) 40%, var(--hcpr-border)); }

        .hcpr-zoom-badge {
            position: absolute;
            right: 8px;
            bottom: 8px;
            padding: 3px 6px;
            border: 1px solid var(--hcpr-border);
            border-radius: 6px;
            color: var(--hcpr-text);
            background: rgba(18, 19, 22, .82);
            font-size: 9.5px;
        }

        .hcpr-corner {
            position: absolute;
            width: 16px;
            height: 16px;
            border: 2px solid var(--hcpr-border);
            transition: border-color .2s ease;
            pointer-events: none;
        }

        .hcpr-shell[data-state="ready"] .hcpr-corner { border-color: var(--hcpr-accent); }
        .hcpr-shell[data-state="error"] .hcpr-corner { border-color: var(--hcpr-warn); }

        .hcpr-corner-tl { top: 6px; left: 6px; border-width: 2px 0 0 2px; border-radius: 4px 0 0 0; }
        .hcpr-corner-tr { top: 6px; right: 6px; border-width: 2px 2px 0 0; border-radius: 0 4px 0 0; }
        .hcpr-corner-bl { bottom: 6px; left: 6px; border-width: 0 0 2px 2px; border-radius: 0 0 0 4px; }
        .hcpr-corner-br { bottom: 6px; right: 6px; border-width: 0 2px 2px 0; border-radius: 0 0 4px 0; }

        .hcpr-readout {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            justify-content: center;
            gap: 5px;
            padding: 9px 14px 2px;
            color: var(--hcpr-muted);
            font-size: 9.5px;
            text-align: center;
        }

        .hcpr-mono { font-family: var(--hcpr-mono); }

        .hcpr-readout .hcpr-mono {
            color: var(--hcpr-text);
            font-size: 10.5px;
            letter-spacing: .2px;
        }

        .hcpr-readout-sep { opacity: .5; }

        .hcpr-file-input { display: none; }

        .hcpr-primary-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px;
        }

        .hcpr-primary-label {
            display: flex;
            flex-direction: column;
            min-width: 0;
            gap: 2px;
        }

        .hcpr-primary-label strong { font-size: 12px; font-weight: 600; }

        .hcpr-primary-label span {
            overflow: hidden;
            color: var(--hcpr-muted);
            font-size: 10px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .hcpr-switch { position: relative; display: block; flex: 0 0 auto; width: 34px; height: 19px; }
        .hcpr-switch-sm { width: 28px; height: 16px; }
        .hcpr-switch input { width: 1px; height: 1px; opacity: 0; }

        .hcpr-slider {
            position: absolute;
            inset: 0;
            border: 1px solid var(--hcpr-border);
            border-radius: 99px;
            background: var(--hcpr-panel);
            cursor: pointer;
            transition: background .2s ease, border-color .2s ease;
        }

        .hcpr-slider::before {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 13px;
            height: 13px;
            border-radius: 50%;
            background: var(--hcpr-muted);
            content: "";
            transition: transform .2s ease, background .2s ease;
        }

        .hcpr-switch-sm .hcpr-slider::before { width: 11px; height: 11px; }

        .hcpr-switch input:checked + .hcpr-slider {
            border-color: color-mix(in srgb, var(--hcpr-accent) 45%, var(--hcpr-border));
            background: color-mix(in srgb, var(--hcpr-accent) 20%, var(--hcpr-panel));
        }

        .hcpr-switch input:checked + .hcpr-slider::before {
            background: var(--hcpr-accent);
            transform: translateX(15px);
        }

        .hcpr-switch-sm input:checked + .hcpr-slider::before { transform: translateX(12px); }

        .hcpr-switch input:focus-visible + .hcpr-slider {
            outline: 2px solid var(--hcpr-accent);
            outline-offset: 2px;
        }

        .hcpr-disclosure { border-top: 1px solid var(--hcpr-border); }

        .hcpr-disclosure summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 11px 14px;
            color: var(--hcpr-muted);
            font-size: 11px;
            cursor: pointer;
            list-style: none;
        }

        .hcpr-disclosure summary::-webkit-details-marker { display: none; }
        .hcpr-disclosure summary:hover { color: var(--hcpr-text); }

        .hcpr-chevron { width: 14px; height: 14px; transition: transform .18s ease; }
        .hcpr-disclosure[open] .hcpr-chevron { transform: rotate(180deg); }

        .hcpr-disclosure-body {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 0 14px 14px;
        }

        .hcpr-setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            font-size: 11px;
            color: var(--hcpr-muted);
        }

        .hcpr-number-field {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 4px 8px;
            border: 1px solid var(--hcpr-border);
            border-radius: 7px;
            background: var(--hcpr-panel);
        }

        .hcpr-number-field input {
            width: 44px;
            border: 0;
            background: transparent;
            color: var(--hcpr-text);
            font-size: 11px;
            text-align: right;
        }

        .hcpr-number-field input:focus-visible { outline: none; }
        .hcpr-unit { color: var(--hcpr-muted); font-size: 10px; }

        .hcpr-text-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 4px 14px;
            padding-top: 4px;
            border-top: 1px solid var(--hcpr-border);
        }

        .hcpr-text-button {
            padding: 6px 0;
            border: 0;
            background: transparent;
            color: var(--hcpr-muted);
            font-size: 10.5px;
            cursor: pointer;
        }

        .hcpr-text-button:hover { color: var(--hcpr-text); text-decoration: underline; }
        .hcpr-text-button-danger:hover { color: var(--hcpr-warn); }

        .hcpr-resize-handle {
            position: absolute;
            right: 2px;
            bottom: 2px;
            width: 16px;
            height: 16px;
            border-bottom: 2px solid var(--hcpr-border);
            border-right: 2px solid var(--hcpr-border);
            border-radius: 0 0 6px 0;
            cursor: nwse-resize;
            touch-action: none;
        }

        .hcpr-resize-handle:hover,
        .hcpr-resize-handle.hcpr-resizing {
            border-color: var(--hcpr-accent);
        }

        #hcpr-reopen {
            all: initial;
            position: fixed;
            z-index: 2147483647;
            right: 22px;
            bottom: 22px;
            display: grid;
            width: 42px;
            height: 42px;
            place-items: center;
            overflow: hidden;
            border: 1px solid var(--hcpr-border);
            border-radius: 12px;
            background: var(--hcpr-bg);
            box-shadow: 0 12px 30px rgba(0, 0, 0, .35);
            cursor: pointer;
            font-family: var(--hcpr-sans);
            touch-action: none;
            user-select: none;
        }

        #hcpr-reopen.hcpr-dragging { cursor: grabbing; box-shadow: 0 0 0 3px color-mix(in srgb, var(--hcpr-accent) 45%, transparent), 0 12px 30px rgba(0, 0, 0, .35); }

        .hcpr-reopen-img { width: 100%; height: 100%; object-fit: cover; display: block; }

        #hcpr-reopen:hover { border-color: color-mix(in srgb, var(--hcpr-accent) 40%, var(--hcpr-border)); }

        @media (max-width: 480px) {
            #hcpr-tool { right: 12px; bottom: 12px; left: 12px !important; top: auto !important; width: auto; }
            #hcpr-reopen { right: 12px; bottom: 12px; }
        }
    `);

    // ------------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------------

    try { setupWebSocketInterceptor(); } catch (error) { debug.add("websocket_setup_error", { message: String(error) }); }
    try { setupFetchInterceptor(); } catch (error) { debug.add("fetch_setup_error", { message: String(error) }); }
    try { setupXhrInterceptor(); } catch (error) { debug.add("xhr_setup_error", { message: String(error) }); }
    try { setupCanvasHooks(); } catch (error) { debug.add("canvas_setup_error", { message: String(error) }); }

    function waitForBody() {
        if (document.body) {
            createInterface();
        } else {
            requestAnimationFrame(waitForBody);
        }
    }

    waitForBody();

    debug.add("script_initialized");

    // ---- Kill ----
    function kill() {
        teardownTasks.forEach((fn) => {
            try {
                fn();
            } catch (error) {
                console.warn("[PhotoLive] falha no teardown", error);
            }
        });
        teardownTasks.length = 0;

        if (handlePaste) {
            document.removeEventListener("paste", handlePaste);
            handlePaste = null;
        }

        document.querySelector("#hcpr-tool")?.remove();
        document.querySelector("#hcpr-reopen")?.remove();
        document.querySelectorAll('style[data-livephoto]').forEach((el) => el.remove());

        debug.destroy();
        window.__hcprLoaded = false;
    }

    window._livePhoto = { kill };
})();
