(function () {
  'use strict';
  const _galeria = 'sangGaleriaAnotacoes';
  if (window[_galeria]) { try { window[_galeria].kill(); } catch (e) {} }

  const DB_NAME = 'ga_module_db', STORE = 'photos', FOLDER_STORE = 'folders';
  const NOTES_KEY = 'ga_module_notes_v1', POS_KEY = 'ga_module_pos_v1';
  const cleanup = [];
  const on = (t, type, fn, opt) => { t.addEventListener(type, fn, opt); cleanup.push(() => t.removeEventListener(type, fn, opt)); };

  function belongsToModule(e) {
    if (e.target === host) return true;
    return typeof e.composedPath === 'function' && e.composedPath().includes(host);
  }
  const stopIfOurs = (e) => { if (belongsToModule(e)) e.stopImmediatePropagation(); };
  ['keydown', 'keyup', 'keypress', 'input', 'beforeinput'].forEach((t) => on(window, t, stopIfOurs, true));

  function openDb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FOLDER_STORE)) db.createObjectStore(FOLDER_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  const dbGetAllPhotos = async () => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).getAll(); r.onsuccess = () => res(r.result.sort((a, b) => b.createdAt - a.createdAt)); r.onerror = () => rej(r.error); }); };
  const dbPutPhoto = async (p) => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(p); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const dbDeletePhoto = async (id) => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const dbGetAllFolders = async () => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(FOLDER_STORE, 'readonly'); const r = tx.objectStore(FOLDER_STORE).getAll(); r.onsuccess = () => res(r.result.sort((a, b) => a.createdAt - b.createdAt)); r.onerror = () => rej(r.error); }); };
  const dbPutFolder = async (f) => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(FOLDER_STORE, 'readwrite'); tx.objectStore(FOLDER_STORE).put(f); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const dbDeleteFolder = async (id) => {
    const db = await openDb();
    const toDelete = (await dbGetAllPhotos()).filter((p) => p.folderId === id);
    return new Promise((res, rej) => {
      const tx = db.transaction([FOLDER_STORE, STORE], 'readwrite');
      tx.objectStore(FOLDER_STORE).delete(id);
      const ps = tx.objectStore(STORE);
      toDelete.forEach((p) => ps.delete(p.id));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  };

  const loadNotes = () => { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { return []; } };
  const saveNotes = (n) => localStorage.setItem(NOTES_KEY, JSON.stringify(n));
  const loadPos = () => { try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && typeof p.left === 'number') return p; } catch {} return null; };
  const savePos = (left, top) => localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const clamp = (v, mn, mx) => Math.min(Math.max(v, mn), mx);

  const ICONS = {
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.3"/></svg>`,
    note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/><path d="M9 12h6M9 16h6"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>`,
    chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L19 7"/></svg>`,
  };

  const host = document.createElement('div');
  host.id = 'ga-module-host';
  Object.assign(host.style, { all: 'initial', position: 'fixed', zIndex: '2147483000' });
  (document.body || document.documentElement).appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.toggle{width:52px;height:52px;border-radius:16px;background:linear-gradient(160deg,#C99383,#B77E6E);border:none;cursor:grab;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(90,60,45,.28);color:#FBF7F1;transition:transform .18s ease,box-shadow .18s ease;touch-action:none}
.toggle:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(90,60,45,.32)}
.toggle.dragging{cursor:grabbing;transform:none}
.toggle svg{width:22px;height:22px;pointer-events:none}
.panel{position:absolute;width:320px;max-width:min(320px,92vw);background:#FBF7F1;border:1px solid #E9E0D3;border-radius:18px;box-shadow:0 18px 40px rgba(70,50,35,.22);display:none;flex-direction:column;overflow:hidden}
.panel.open{display:flex}
.titlebar{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 8px 16px;cursor:grab;touch-action:none;user-select:none}
.titlebar.dragging{cursor:grabbing}
.titlebar .title{font-size:14.5px;font-weight:700;color:#6E4B3B;letter-spacing:.2px}
.head{display:flex;align-items:center;justify-content:space-between;padding:0 14px 10px;border-bottom:1px solid #EFE7D9}
.tabs{display:flex;gap:6px}
.tab{border:none;background:transparent;cursor:pointer;padding:7px 11px;border-radius:10px;font-size:13px;font-weight:600;color:#8B7E6E;display:flex;align-items:center;gap:6px;transition:background .15s ease,color .15s ease}
.tab svg{width:15px;height:15px}
.tab.active{background:#EFE1D8;color:#6E4B3B}
.close-btn{border:none;background:transparent;cursor:pointer;color:#A99B8A;padding:4px;border-radius:8px}
.close-btn:hover{background:#F1E9DC;color:#6E4B3B}
.close-btn svg{width:16px;height:16px}
.body{padding:12px 14px 14px;overflow-y:auto;flex:1}
.body::-webkit-scrollbar{width:6px}
.body::-webkit-scrollbar-thumb{background:#E3D8C7;border-radius:6px}
.breadcrumb{display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:12.5px;font-weight:600;color:#8B7E6E}
.breadcrumb button{border:none;background:transparent;cursor:pointer;color:#B77E6E;display:flex;align-items:center;padding:2px;border-radius:6px}
.breadcrumb button:hover{background:#F1E9DC}
.breadcrumb button svg{width:14px;height:14px}
.breadcrumb .current{color:#6E4B3B}
.actions-row{display:flex;gap:7px;margin-bottom:10px}
.action-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:9px;border-radius:12px;border:1.5px dashed #D9C7B4;background:#FFFDFB;color:#8F7C68;font-size:12px;font-weight:600;cursor:pointer;transition:border-color .15s ease,color .15s ease}
.action-btn:hover{border-color:#C99383;color:#B77E6E}
.action-btn svg{width:14px;height:14px}
input[type=file]{display:none}
.new-folder-row{display:flex;gap:6px;margin-bottom:10px}
.new-folder-row input{flex:1;border:1.5px solid #E3D8C7;border-radius:10px;padding:7px 10px;font-size:12.5px;color:#4A4239;outline:none;background:#FFFDFB}
.new-folder-row input:focus{border-color:#C99383}
.new-folder-row button{border:none;border-radius:10px;width:32px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.new-folder-row .confirm{background:#90A88C;color:#fff}
.new-folder-row .cancel{background:#F1E9DC;color:#8B7E6E}
.new-folder-row svg{width:14px;height:14px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.thumb{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;background:#F1E9DC}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumb .del{position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:7px;background:rgba(60,40,30,.55);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;opacity:0;transition:opacity .12s ease}
.thumb:hover .del{opacity:1}
.thumb .del svg{width:11px;height:11px}
.folder-tile{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;background:#F3E9DC;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid #EAD9C4}
.folder-tile:hover{background:#EFE1D0}
.folder-tile svg{width:26px;height:26px;color:#B77E6E}
.folder-tile .fname{font-size:10.5px;font-weight:700;color:#6E4B3B;text-align:center;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.folder-tile .fcount{font-size:9px;color:#A99584}
.folder-tile .del{position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:6px;background:rgba(60,40,30,.55);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;opacity:0;transition:opacity .12s ease}
.folder-tile:hover .del{opacity:1}
.folder-tile .del svg{width:10px;height:10px;color:#fff}
.empty{text-align:center;color:#B3A392;font-size:12.5px;padding:22px 6px;line-height:1.5;grid-column:1/-1}
.toast{position:absolute;left:50%;bottom:12px;transform:translate(-50%,8px);background:#6E4B3B;color:#FBF7F1;font-size:12px;font-weight:600;padding:7px 14px;border-radius:20px;opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;white-space:nowrap}
.toast.show{opacity:1;transform:translate(-50%,0)}
.lightbox{position:fixed;inset:0;background:rgba(40,28,22,.55);display:none;align-items:center;justify-content:center;z-index:10}
.lightbox.open{display:flex}
.lightbox img{max-width:88%;max-height:82%;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.4)}
.lightbox .close-btn{position:absolute;top:16px;right:16px;color:#fff;background:rgba(255,255,255,.15)}
.lightbox .close-btn:hover{background:rgba(255,255,255,.28);color:#fff}
.add-note{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px;border-radius:12px;margin-bottom:10px;border:none;background:#EFE1D8;color:#6E4B3B;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s ease}
.add-note:hover{background:#E8D5C6}
.add-note svg{width:13px;height:13px}
.note{background:#FFFDFB;border:1px solid #EFE7D9;border-left:3px solid #90A88C;border-radius:10px;padding:9px 10px;margin-bottom:8px}
.note textarea{width:100%;border:none;resize:none;background:transparent;font-size:13px;color:#4A4239;line-height:1.45;font-family:inherit;min-height:40px;outline:none}
.note-foot{display:flex;align-items:center;justify-content:space-between;margin-top:4px}
.note-time{font-size:10.5px;color:#B3A392}
.note-del{border:none;background:transparent;cursor:pointer;color:#C4A995;padding:3px;border-radius:6px}
.note-del:hover{background:#F5EBDE;color:#B77E6E}
.note-del svg{width:12px;height:12px}
</style>
<button class="toggle" title="Galeria e anotações">${ICONS.camera}</button>
<div class="panel">
<div class="titlebar"><span class="title">Galeria</span><button class="close-btn" data-close>${ICONS.close}</button></div>
<div class="head"><div class="tabs"><button class="tab active" data-tab="gallery">${ICONS.camera} Fotos</button><button class="tab" data-tab="notes">${ICONS.note} Notas</button></div></div>
<div class="body">
<div class="view" data-view="gallery">
<div class="breadcrumb" style="display:none"><button class="bc-back">${ICONS.chevronLeft}</button><span class="bc-root">Início</span><span>/</span><span class="current bc-name"></span></div>
<div class="actions-row"><label class="action-btn">${ICONS.plus} Adicionar fotos<input type="file" accept="image/*" multiple></label><button class="action-btn new-folder-btn">${ICONS.folder} Nova pasta</button></div>
<div class="new-folder-row" style="display:none"><input type="text" maxlength="40" placeholder="Nome da pasta"><button class="confirm">${ICONS.check}</button><button class="cancel">${ICONS.close}</button></div>
<div class="grid"></div>
</div>
<div class="view" data-view="notes" style="display:none"><button class="add-note">${ICONS.plus} Nova nota</button><div class="notes-list"></div></div>
</div>
<div class="toast"></div>
</div>
<div class="lightbox"><button class="close-btn" data-lb-close>${ICONS.close}</button><img src="" alt=""></div>`;

  const $ = (s) => shadow.querySelector(s);
  const toggleBtn = $('.toggle'), panel = $('.panel'), titlebar = $('.titlebar'), closeBtn = $('[data-close]');
  const tabs = shadow.querySelectorAll('.tab'), views = shadow.querySelectorAll('.view'), grid = $('.grid');
  const fileInput = $('input[type=file]'), lightbox = $('.lightbox'), lightboxImg = lightbox.querySelector('img'), lbClose = $('[data-lb-close]');
  const addNoteBtn = $('.add-note'), notesList = $('.notes-list');
  const breadcrumb = $('.breadcrumb'), bcBack = $('.bc-back'), bcRoot = $('.bc-root'), bcName = $('.bc-name');
  const newFolderBtn = $('.new-folder-btn'), newFolderRow = $('.new-folder-row');
  const newFolderInput = newFolderRow.querySelector('input'), newFolderConfirm = newFolderRow.querySelector('.confirm'), newFolderCancel = newFolderRow.querySelector('.cancel');
  const toastEl = $('.toast');

  let currentFolderId = null, toastTimer = null;
  function showToast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600); }

  function applyHostPosition(left, top) {
    const r = host.getBoundingClientRect(), w = r.width || 52, h = r.height || 52;
    left = clamp(left, 4, window.innerWidth - w - 4);
    top = clamp(top, 4, window.innerHeight - h - 4);
    Object.assign(host.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
  }
  function initPosition() {
    const saved = loadPos();
    if (saved) applyHostPosition(saved.left, saved.top);
    else applyHostPosition(window.innerWidth - 72, window.innerHeight - 72);
  }
  function positionPanel() {
    const tr = toggleBtn.getBoundingClientRect(), gap = 8;
    const spaceBelow = window.innerHeight - tr.bottom - gap, spaceAbove = tr.top - gap;
    const spaceRight = window.innerWidth - tr.left;
    const up = spaceAbove > spaceBelow, left = spaceRight < 340;
    panel.style.top = up ? 'auto' : (tr.height + gap) + 'px';
    panel.style.bottom = up ? (tr.height + gap) + 'px' : 'auto';
    panel.style.left = left ? 'auto' : '0';
    panel.style.right = left ? '0' : 'auto';
    const avail = (up ? spaceAbove : spaceBelow) - 4;
    panel.style.maxHeight = clamp(avail, 220, Math.min(window.innerHeight * 0.75, 620)) + 'px';
  }
  const onResize = () => { const r = host.getBoundingClientRect(); applyHostPosition(r.left, r.top); if (panel.classList.contains('open')) positionPanel(); };
  on(window, 'resize', onResize);

  function makeDraggable(handle, onClick) {
    let dragging = false, moved = false, sx = 0, sy = 0, sl = 0, st = 0;
    on(handle, 'pointerdown', (e) => {
      if (e.button) return;
      dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
      const r = host.getBoundingClientRect(); sl = r.left; st = r.top;
      handle.setPointerCapture(e.pointerId); handle.classList.add('dragging');
    });
    on(handle, 'pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
      if (!moved) return;
      applyHostPosition(sl + dx, st + dy);
      if (panel.classList.contains('open')) positionPanel();
    });
    const end = () => {
      if (!dragging) return;
      dragging = false; handle.classList.remove('dragging');
      if (moved) { const r = host.getBoundingClientRect(); savePos(r.left, r.top); }
      else if (onClick) onClick();
    };
    on(handle, 'pointerup', end);
    on(handle, 'pointercancel', end);
  }
  makeDraggable(toggleBtn, () => { panel.classList.toggle('open'); if (panel.classList.contains('open')) positionPanel(); });
  makeDraggable(titlebar);

  on(closeBtn, 'click', () => panel.classList.remove('open'));
  tabs.forEach((tab) => on(tab, 'click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    views.forEach((v) => { v.style.display = v.dataset.view === tab.dataset.tab ? 'block' : 'none'; });
  }));

  const fmtDate = (ts) => { const d = new Date(ts); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

  function updateBreadcrumb(folders) {
    if (currentFolderId === null) { breadcrumb.style.display = 'none'; newFolderBtn.style.display = 'flex'; return; }
    const f = folders.find((x) => x.id === currentFolderId);
    breadcrumb.style.display = 'flex'; bcName.textContent = f ? f.name : ''; newFolderBtn.style.display = 'none';
  }

  async function renderGallery() {
    const [photos, folders] = await Promise.all([dbGetAllPhotos(), dbGetAllFolders()]);
    updateBreadcrumb(folders);
    grid.innerHTML = '';
    if (currentFolderId === null) {
      for (const f of folders) {
        const count = photos.filter((p) => p.folderId === f.id).length;
        const div = document.createElement('div');
        div.className = 'folder-tile';
        div.innerHTML = `${ICONS.folder}<span class="fname"></span><span class="fcount">${count} foto${count === 1 ? '' : 's'}</span><button class="del">${ICONS.trash}</button>`;
        div.querySelector('.fname').textContent = f.name;
        div.addEventListener('click', () => { currentFolderId = f.id; renderGallery(); });
        div.querySelector('.del').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Excluir a pasta "${f.name}" e todas as fotos dentro dela?`)) { await dbDeleteFolder(f.id); showToast('Pasta excluída'); renderGallery(); }
        });
        grid.appendChild(div);
      }
    }
    const visible = photos.filter((p) => (p.folderId || null) === currentFolderId);
    if (!visible.length && (currentFolderId !== null || !folders.length)) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = currentFolderId !== null ? 'Pasta vazia.<br>Adicione fotos ou cole com Ctrl+V.' : 'Sem fotos ainda.<br>Adicione a primeira acima ou cole com Ctrl+V.';
      grid.appendChild(empty);
    }
    for (const p of visible) {
      const div = document.createElement('div');
      div.className = 'thumb';
      div.innerHTML = `<img src="${p.dataUrl}" alt=""><button class="del">${ICONS.trash}</button>`;
      div.querySelector('img').addEventListener('click', () => { lightboxImg.src = p.dataUrl; lightbox.classList.add('open'); });
      div.querySelector('.del').addEventListener('click', async (e) => { e.stopPropagation(); await dbDeletePhoto(p.id); renderGallery(); });
      grid.appendChild(div);
    }
  }

  on(bcRoot, 'click', () => { currentFolderId = null; renderGallery(); });
  on(bcBack, 'click', () => { currentFolderId = null; renderGallery(); });
  on(newFolderBtn, 'click', () => { newFolderRow.style.display = 'flex'; newFolderInput.value = ''; newFolderInput.focus(); });

  async function confirmNewFolder() {
    const name = newFolderInput.value.trim();
    if (!name) return newFolderInput.focus();
    await dbPutFolder({ id: uid(), name, createdAt: Date.now() });
    newFolderRow.style.display = 'none'; showToast('Pasta criada'); renderGallery();
  }
  on(newFolderConfirm, 'click', confirmNewFolder);
  on(newFolderCancel, 'click', () => { newFolderRow.style.display = 'none'; });
  on(newFolderInput, 'keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') confirmNewFolder(); if (e.key === 'Escape') newFolderRow.style.display = 'none'; });

  on(fileInput, 'change', async () => {
    const files = Array.from(fileInput.files || []);
    for (const file of files) { const dataUrl = await fileToDataUrl(file); await dbPutPhoto({ id: uid(), dataUrl, name: file.name, createdAt: Date.now(), folderId: currentFolderId }); }
    fileInput.value = '';
    if (files.length) showToast(files.length > 1 ? 'Fotos adicionadas' : 'Foto adicionada');
    renderGallery();
  });

  on(lbClose, 'click', () => lightbox.classList.remove('open'));
  on(lightbox, 'click', (e) => { if (e.target === lightbox) lightbox.classList.remove('open'); });

  // Cola imagem 
  const onPaste = async (e) => {
    if (!panel.classList.contains('open')) return;
    const activeTab = shadow.querySelector('.tab.active');
    if (!activeTab || activeTab.dataset.tab !== 'gallery') return;
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    const imgs = Array.from(items).filter((it) => it.type && it.type.startsWith('image/'));
    if (!imgs.length) return;
    e.preventDefault(); e.stopPropagation();
    let pasted = 0;
    for (const item of imgs) {
      const file = item.getAsFile();
      if (!file) continue;
      const dataUrl = await fileToDataUrl(file);
      await dbPutPhoto({ id: uid(), dataUrl, name: 'colada-' + Date.now(), createdAt: Date.now(), folderId: currentFolderId });
      pasted++;
    }
    if (pasted) { showToast(pasted > 1 ? 'Fotos coladas' : 'Foto colada'); renderGallery(); }
  };
  on(window, 'paste', onPaste, true);

  function renderNotes() {
    const notes = loadNotes().sort((a, b) => b.updatedAt - a.updatedAt);
    if (!notes.length) { notesList.innerHTML = '<div class="empty">Nenhuma nota ainda.</div>'; return; }
    notesList.innerHTML = '';
    for (const n of notes) {
      const div = document.createElement('div');
      div.className = 'note';
      div.innerHTML = `<textarea placeholder="Escreva aqui...">${n.text}</textarea><div class="note-foot"><span class="note-time">${fmtDate(n.updatedAt)}</span><button class="note-del">${ICONS.trash}</button></div>`;
      const textarea = div.querySelector('textarea');
      ['keydown', 'keyup', 'keypress', 'input'].forEach((t) => textarea.addEventListener(t, (e) => e.stopPropagation()));
      let debounce;
      textarea.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const all = loadNotes(), idx = all.findIndex((x) => x.id === n.id);
          if (idx > -1) { all[idx].text = textarea.value; all[idx].updatedAt = Date.now(); saveNotes(all); div.querySelector('.note-time').textContent = fmtDate(all[idx].updatedAt); }
        }, 400);
      });
      div.querySelector('.note-del').addEventListener('click', () => { saveNotes(loadNotes().filter((x) => x.id !== n.id)); renderNotes(); });
      notesList.appendChild(div);
    }
  }
  on(addNoteBtn, 'click', () => {
    const all = loadNotes();
    all.push({ id: uid(), text: '', createdAt: Date.now(), updatedAt: Date.now() });
    saveNotes(all); renderNotes();
    const first = notesList.querySelector('textarea');
    if (first) first.focus();
  });

  initPosition();
  renderGallery();
  renderNotes();

  window[_galeria] = {
    kill() {
      cleanup.forEach((fn) => { try { fn(); } catch (e) {} });
      host.remove();
      delete window[_galeria];
    },
  };
})();
