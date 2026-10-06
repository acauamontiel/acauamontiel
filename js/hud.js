// HUD em DOM, estilo Gran Turismo (PS1).
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), course: $('hud-course'), score: $('hud-score'), combo: $('hud-combo'),
      speed: $('hud-speed'), gear: $('hud-gear'), dist: $('hud-dist'), motos: $('hud-motos'),
      health: $('hud-health'), popup: $('hud-popup'), banner: $('hud-banner'),
      title: $('title'), gameover: $('gameover'), loading: $('loading'), titleBest: $('title-best'),
      goScore: $('go-score'), goDist: $('go-dist'), goMotos: $('go-motos'), goBest: $('go-best'),
    };
    this.popupTimer = 0;
  }

  show(name) {
    this.el.hud.classList.toggle('hidden', name !== 'hud');
    this.el.title.classList.toggle('hidden', name !== 'title');
    this.el.gameover.classList.toggle('hidden', name !== 'gameover');
    this.el.loading.classList.add('hidden');
  }

  update(s) {
    this.el.score.textContent = String(Math.floor(s.score)).padStart(6, '0');
    this.el.speed.textContent = String(Math.round(s.speed * 3.6));
    this.el.gear.textContent = String(s.gear);
    this.el.dist.textContent = (s.dist / 1000).toFixed(2) + ' km';
    this.el.motos.textContent = String(s.motos);
    this.el.health.style.width = Math.max(0, s.health) + '%';
    this.el.combo.textContent = s.combo > 1 ? `COMBO x${s.combo}` : '';
    if (this.courseName !== s.course) {
      this.courseName = s.course;
      this.el.course.textContent = s.course;
    }
  }

  popup(text, bad = false) {
    const p = this.el.popup;
    p.textContent = text;
    p.classList.toggle('bad', bad);
    p.classList.remove('show');
    void p.offsetWidth; // reinicia a animação
    p.classList.add('show');
  }

  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  gameOver(s, best) {
    this.el.goScore.textContent = String(Math.floor(s.score));
    this.el.goDist.textContent = (s.dist / 1000).toFixed(2) + ' km';
    this.el.goMotos.textContent = String(s.motos);
    this.el.goBest.textContent = String(Math.floor(best));
    this.show('gameover');
  }

  setBest(best) {
    this.el.titleBest.textContent = best > 0 ? `MELHOR PONTUAÇÃO: ${Math.floor(best)}` : '';
  }
}
