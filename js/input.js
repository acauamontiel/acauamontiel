// Teclado + botões de toque na tela (ver bindTouchControls).
export class Input {
  constructor(el) {
    this.left = false; this.right = false; this.up = false; this.down = false; this.brake = false;
    this.pressed = new Set();
    this.onAny = null;
    this.onKey = null;
    this.touches = new Map();

    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      this.set(e.code, true);
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (this.onKey) this.onKey(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.set(e.code, false));
    window.addEventListener('blur', () => { this.left = this.right = this.up = this.down = this.brake = false; });

    // Toque fora dos botões só serve para começar/continuar (os botões ficam ocultos nas telas).
    el.addEventListener('touchstart', () => { if (this.onAny) this.onAny(); }, { passive: true });
    el.addEventListener('mousedown', () => { if (this.onAny) this.onAny(); });
  }

  /**
   * Botões de toque na tela: cada botão segura sua própria tecla enquanto o dedo estiver nele,
   * com multitoque (GÁS + FREIO + seta ao mesmo tempo).
   */
  bindTouchControls(container) {
    for (const btn of container.querySelectorAll('.tbtn')) {
      const key = btn.dataset.k;
      const press = (e) => { e.preventDefault(); this[key] = true; btn.classList.add('on'); try { btn.setPointerCapture(e.pointerId); } catch { /* ok */ } };
      const release = () => { this[key] = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  set(code, v) {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.left = v; break;
      case 'ArrowRight': case 'KeyD': this.right = v; break;
      case 'ArrowUp': case 'KeyW': this.up = v; break;
      case 'ArrowDown': case 'KeyS': this.down = v; break;
      case 'Space': this.brake = v; break;
    }
  }

  get steer() { return (this.right ? 1 : 0) - (this.left ? 1 : 0); }
}
