// Teclado + toque. Toque: metade esquerda/direita da tela desvia, dois dedos freiam.
// Os listeners de toque ficam na janela porque as telas de título/fim cobrem o canvas.
export class Input {
  constructor(el) {
    this.left = false; this.right = false; this.up = false; this.down = false;
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
    window.addEventListener('blur', () => { this.left = this.right = this.up = this.down = false; });

    const touchUpdate = () => {
      let l = false, r = false;
      for (const x of this.touches.values()) { if (x < window.innerWidth / 2) l = true; else r = true; }
      this.left = l; this.right = r;
      this.down = this.touches.size >= 2 && l && r;
    };
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this.touches.set(t.identifier, t.clientX);
      touchUpdate();
      if (this.onAny) this.onAny();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this.touches.set(t.identifier, t.clientX);
      touchUpdate();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) this.touches.delete(t.identifier); touchUpdate(); };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('mousedown', () => { if (this.onAny) this.onAny(); });
  }

  set(code, v) {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.left = v; break;
      case 'ArrowRight': case 'KeyD': this.right = v; break;
      case 'ArrowUp': case 'KeyW': this.up = v; break;
      case 'ArrowDown': case 'KeyS': this.down = v; break;
    }
  }

  get steer() { return (this.right ? 1 : 0) - (this.left ? 1 : 0); }
}
