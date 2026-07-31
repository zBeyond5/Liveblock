// ==Module: Fireworks Playground==
// Fogos de artifício interativos com física real (gravidade, trilhas, delta-time).
// Autocontido — não depende de HTML/CSS externos. Segue o padrão instanceKey.

(function () {
  const KEY = '_fireworks';

  if (window[KEY]) {
    window[KEY].destroy();
  }

  const PALETTES = [
    ['#ff3b3b', '#ff9d3b', '#ffe83b'],
    ['#3bafff', '#3bffe8', '#9d3bff'],
    ['#ff3bd6', '#ff3b7a', '#ffbf3b'],
    ['#3bff6a', '#a4ff3b', '#3bffc7'],
    ['#ffffff', '#cfe8ff', '#8ec5ff'],
  ];

  const STATE = {
    root: null,
    canvas: null,
    ctx: null,
    rafId: null,
    particles: [],
    shells: [],
    lastTime: performance.now(),
    autoLaunch: true,
    autoTimer: 0,
    gravity: 380,
    running: true,
    soundEnabled: false,
    audioCtx: null,
  };

  function injectStyle() {
    if (document.getElementById('fireworks-module-style')) return;
    const style = document.createElement('style');
    style.id = 'fireworks-module-style';
    style.textContent = `
      .fw-canvas {
        position: fixed;
        inset: 0;
        z-index: 999997;
        pointer-events: none;
      }
      .fw-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999998;
        background: rgba(15, 15, 20, 0.75);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        padding: 12px 14px;
        font-family: -apple-system, 'Segoe UI', sans-serif;
        color: #eee;
        width: 220px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        pointer-events: auto;
        user-select: none;
      }
      .fw-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 10px;
        cursor: move;
        letter-spacing: 0.3px;
      }
      .fw-close {
        cursor: pointer;
        opacity: 0.6;
        transition: opacity .15s;
        padding: 0 4px;
      }
      .fw-close:hover { opacity: 1; color: #ff5b5b; }
      .fw-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        margin: 6px 0;
        opacity: 0.9;
      }
      .fw-btn {
        background: linear-gradient(135deg, #ff6a3b, #ff3bd6);
        border: none;
        color: white;
        font-size: 12px;
        font-weight: 600;
        padding: 7px 0;
        border-radius: 7px;
        width: 100%;
        cursor: pointer;
        margin-top: 8px;
        transition: transform .1s, filter .15s;
      }
      .fw-btn:hover { filter: brightness(1.15); }
      .fw-btn:active { transform: scale(0.96); }
      .fw-toggle {
        position: relative;
        width: 34px;
        height: 18px;
        background: rgba(255,255,255,0.15);
        border-radius: 20px;
        cursor: pointer;
        transition: background .2s;
      }
      .fw-toggle.on { background: #3bff6a; }
      .fw-toggle-dot {
        position: absolute;
        top: 2px; left: 2px;
        width: 14px; height: 14px;
        background: white;
        border-radius: 50%;
        transition: left .2s;
      }
      .fw-toggle.on .fw-toggle-dot { left: 18px; }
      .fw-hint {
        font-size: 10px;
        opacity: 0.5;
        margin-top: 8px;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  function resize() {
    STATE.canvas.width = window.innerWidth;
    STATE.canvas.height = window.innerHeight;
  }

  function buildDOM() {
    const canvas = document.createElement('canvas');
    canvas.className = 'fw-canvas';
    document.body.appendChild(canvas);
    STATE.canvas = canvas;
    STATE.ctx = canvas.getContext('2d');
    resize();

    const panel = document.createElement('div');
    panel.className = 'fw-panel';
    panel.innerHTML = `
      <div class="fw-panel-header">
        <span>🎆 Fireworks</span>
        <span class="fw-close">✕</span>
      </div>
      <div class="fw-row">
        <span>Auto-lançar</span>
        <div class="fw-toggle on" data-toggle="auto"><div class="fw-toggle-dot"></div></div>
      </div>
      <div class="fw-row">
        <span>Clique na tela</span>
        <span style="opacity:.6">🚀 lança</span>
      </div>
      <button class="fw-btn" data-action="burst">Salva de 8 fogos</button>
      <div class="fw-hint">Clique em qualquer lugar da página pra lançar um foguete manualmente.</div>
    `;
    document.body.appendChild(panel);
    STATE.root = panel;

    panel.querySelector('.fw-close').onclick = () => window[KEY].destroy();
    panel.querySelector('[data-toggle="auto"]').onclick = (e) => {
      STATE.autoLaunch = !STATE.autoLaunch;
      e.currentTarget.classList.toggle('on', STATE.autoLaunch);
    };
    panel.querySelector('[data-action="burst"]').onclick = () => {
      for (let i = 0; i < 8; i++) {
        setTimeout(() => launchShell(), i * 120);
      }
    };

    // arrastar painel
    const header = panel.querySelector('.fw-panel-header');
    let dragging = false, offX = 0, offY = 0;
    header.addEventListener('mousedown', (e) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
    });
    STATE._onMove = (e) => {
      if (!dragging) return;
      panel.style.left = (e.clientX - offX) + 'px';
      panel.style.top = (e.clientY - offY) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    STATE._onUp = () => dragging = false;
    document.addEventListener('mousemove', STATE._onMove);
    document.addEventListener('mouseup', STATE._onUp);

    STATE._onClick = (e) => {
      if (panel.contains(e.target)) return;
      launchShell(e.clientX);
    };
    document.addEventListener('click', STATE._onClick);

    STATE._onResize = resize;
    window.addEventListener('resize', STATE._onResize);
  }

  function launchShell(targetX) {
    const x = targetX ?? (Math.random() * STATE.canvas.width * 0.7 + STATE.canvas.width * 0.15);
    const targetY = Math.random() * STATE.canvas.height * 0.35 + STATE.canvas.height * 0.15;
    STATE.shells.push({
      x, y: STATE.canvas.height,
      targetY,
      vy: -(Math.random() * 200 + 520),
      color: '#fff9d6',
      trail: [],
    });
  }

  function explode(shell) {
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const count = 60 + Math.floor(Math.random() * 40);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.1;
      const speed = Math.random() * 220 + 120;
      STATE.particles.push({
        x: shell.x, y: shell.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: Math.random() * 0.4 + 0.55,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: Math.random() * 2 + 1.5,
      });
    }
  }

  function update(dt) {
    // shells subindo
    for (let i = STATE.shells.length - 1; i >= 0; i--) {
      const s = STATE.shells[i];
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 8) s.trail.shift();
      s.vy += STATE.gravity * 0.35 * dt;
      s.y += s.vy * dt;
      if (s.vy >= -40 || s.y <= s.targetY) {
        explode(s);
        STATE.shells.splice(i, 1);
      }
    }
    // particulas explodidas
    for (let i = STATE.particles.length - 1; i >= 0; i--) {
      const p = STATE.particles[i];
      p.vy += STATE.gravity * dt;
      p.vx *= 0.988;
      p.vy *= 0.988;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) STATE.particles.splice(i, 1);
    }

    if (STATE.autoLaunch) {
      STATE.autoTimer -= dt;
      if (STATE.autoTimer <= 0) {
        launchShell();
        STATE.autoTimer = Math.random() * 1.4 + 0.8;
      }
    }
  }

  function draw() {
    const { ctx, canvas } = STATE;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(5,5,10,0.22)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter';

    STATE.shells.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.trail.forEach((t, idx) => {
        idx === 0 ? ctx.moveTo(t.x, t.y) : ctx.lineTo(t.x, t.y);
      });
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    });

    STATE.particles.forEach(p => {
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!STATE.running) return;
    const dt = Math.min((now - STATE.lastTime) / 1000, 0.05);
    STATE.lastTime = now;
    update(dt);
    draw();
    STATE.rafId = requestAnimationFrame(loop);
  }

  function init() {
    injectStyle();
    buildDOM();
    STATE.lastTime = performance.now();
    STATE.rafId = requestAnimationFrame(loop);
    launchShell();
  }

  function destroy() {
    STATE.running = false;
    if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
    if (STATE._onClick) document.removeEventListener('click', STATE._onClick);
    if (STATE._onMove) document.removeEventListener('mousemove', STATE._onMove);
    if (STATE._onUp) document.removeEventListener('mouseup', STATE._onUp);
    if (STATE._onResize) window.removeEventListener('resize', STATE._onResize);
    if (STATE.canvas) STATE.canvas.remove();
    if (STATE.root) STATE.root.remove();
    delete window[KEY];
  }

  window[KEY] = { init, destroy, launchShell, state: STATE };
  init();
})();
