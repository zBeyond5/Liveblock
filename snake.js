(function () {
  const KEY = '_snake';

  // Evita instância duplicada se o módulo for recarregado
  if (window[KEY]) {
    window[KEY].destroy();
  }

  const STATE = {
    root: null,
    canvas: null,
    ctx: null,
    interval: null,
    snake: [{ x: 10, y: 10 }],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: { x: 15, y: 15 },
    score: 0,
    grid: 20,
    tiles: 20,
    running: true,
  };

  function injectStyle() {
    if (document.getElementById('snake-module-style')) return;
    const style = document.createElement('style');
    style.id = 'snake-module-style';
    style.textContent = `
      .snake-module-wrapper {
        position: fixed;
        top: 60px;
        right: 20px;
        z-index: 999999;
        background: #111;
        border: 2px solid #0f0;
        border-radius: 8px;
        padding: 10px;
        font-family: monospace;
        color: #0f0;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      .snake-module-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        font-size: 13px;
        cursor: move;
      }
      .snake-module-close {
        cursor: pointer;
        color: #f55;
        font-weight: bold;
        padding: 0 4px;
      }
      .snake-module-canvas {
        display: block;
        background: #000;
        border: 1px solid #0f0;
      }
    `;
    document.head.appendChild(style);
  }

  function buildDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'snake-module-wrapper';

    const header = document.createElement('div');
    header.className = 'snake-module-header';
    header.innerHTML = `<span>🐍 Snake — <span id="snake-score">0</span></span>`;
    const closeBtn = document.createElement('span');
    closeBtn.className = 'snake-module-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => window[KEY].destroy();
    header.appendChild(closeBtn);

    const canvas = document.createElement('canvas');
    canvas.className = 'snake-module-canvas';
    canvas.width = STATE.tiles * STATE.grid;
    canvas.height = STATE.tiles * STATE.grid;

    wrapper.appendChild(header);
    wrapper.appendChild(canvas);
    document.body.appendChild(wrapper);

    // arrastar pela header
    let dragging = false, offX = 0, offY = 0;
    header.addEventListener('mousedown', (e) => {
      dragging = true;
      offX = e.clientX - wrapper.offsetLeft;
      offY = e.clientY - wrapper.offsetTop;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      wrapper.style.left = (e.clientX - offX) + 'px';
      wrapper.style.top = (e.clientY - offY) + 'px';
      wrapper.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => dragging = false);

    STATE.root = wrapper;
    STATE.canvas = canvas;
    STATE.ctx = canvas.getContext('2d');
  }

  function randomFood() {
    STATE.food = {
      x: Math.floor(Math.random() * STATE.tiles),
      y: Math.floor(Math.random() * STATE.tiles),
    };
  }

  function tick() {
    if (!STATE.running) return;
    STATE.dir = STATE.nextDir;
    const head = {
      x: STATE.snake[0].x + STATE.dir.x,
      y: STATE.snake[0].y + STATE.dir.y,
    };

    if (
      head.x < 0 || head.y < 0 ||
      head.x >= STATE.tiles || head.y >= STATE.tiles ||
      STATE.snake.some(s => s.x === head.x && s.y === head.y)
    ) {
      STATE.running = false;
      draw();
      return;
    }

    STATE.snake.unshift(head);

    if (head.x === STATE.food.x && head.y === STATE.food.y) {
      STATE.score += 10;
      document.getElementById('snake-score').textContent = STATE.score;
      randomFood();
    } else {
      STATE.snake.pop();
    }

    draw();
  }

  function draw() {
    const { ctx, canvas, grid } = STATE;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#f55';
    ctx.fillRect(STATE.food.x * grid, STATE.food.y * grid, grid - 2, grid - 2);

    ctx.fillStyle = '#0f0';
    STATE.snake.forEach(s => ctx.fillRect(s.x * grid, s.y * grid, grid - 2, grid - 2));

    if (!STATE.running) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f55';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
      ctx.font = '12px monospace';
      ctx.fillText('clique pra reiniciar', canvas.width / 2, canvas.height / 2 + 20);
    }
  }

  function handleKey(e) {
    const map = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const next = map[e.key];
    if (!next) return;
    // impede virar 180 graus direto
    if (next.x === -STATE.dir.x && next.y === -STATE.dir.y) return;
    STATE.nextDir = next;
    e.preventDefault();
  }

  function handleRestart() {
    if (STATE.running) return;
    STATE.snake = [{ x: 10, y: 10 }];
    STATE.dir = { x: 1, y: 0 };
    STATE.nextDir = { x: 1, y: 0 };
    STATE.score = 0;
    STATE.running = true;
    document.getElementById('snake-score').textContent = 0;
    randomFood();
    draw();
  }

  function init() {
    injectStyle();
    buildDOM();
    randomFood();
    draw();

    STATE._onKey = handleKey;
    STATE._onClick = handleRestart;
    document.addEventListener('keydown', STATE._onKey);
    STATE.canvas.addEventListener('click', STATE._onClick);

    STATE.interval = setInterval(tick, 120);
  }

  function destroy() {
    if (STATE.interval) clearInterval(STATE.interval);
    if (STATE._onKey) document.removeEventListener('keydown', STATE._onKey);
    if (STATE.root) STATE.root.remove();
    delete window[KEY];
  }

  window[KEY] = { init, destroy, state: STATE };
  init();
})();
