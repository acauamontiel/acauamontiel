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
      goKicker: $('go-kicker'), goTitle: $('go-title'), goPress: $('go-press'),
      courseSub: document.querySelector('.course-sub'),
      touch: $('touch'),
    };
    this.popupTimer = 0;
    this.isTouch = new URLSearchParams(location.search).has('touch') || window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch');
  }

  show(name) {
    this.el.hud.classList.toggle('hidden', name !== 'hud');
    this.el.touch.classList.toggle('hidden', !(name === 'hud' && this.isTouch));
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
    if (this.courseName !== s.course || this.phase !== s.phase) {
      this.courseName = s.course; this.phase = s.phase;
      this.el.course.textContent = s.course;
      this.el.courseSub.textContent = `FASE ${s.phase + 1}/${s.phases} · PELOTAS · RS`;
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

  /** Tela de resultado: fim de jogo, fim de fase ou chegada. */
  overlay({ kicker, title, press }, s, best) {
    this.el.goKicker.textContent = kicker;
    this.el.goTitle.innerHTML = title;
    this.el.goPress.textContent = press;
    this.el.goScore.textContent = String(Math.floor(s.score));
    this.el.goDist.textContent = (s.dist / 1000).toFixed(2) + ' km';
    this.el.goMotos.textContent = String(s.motos);
    this.el.goBest.textContent = String(Math.floor(best));
    this.show('gameover');
  }

  gameOver(s, best) {
    this.overlay({ kicker: 'FIM DE JOGO', title: 'ASTRA NO<br>CONSERTO', press: 'ENTER OU TOQUE PARA CORRER DE NOVO' }, s, best);
  }

  setBest(best) {
    this.el.titleBest.textContent = best > 0 ? `MELHOR PONTUAÇÃO: ${Math.floor(best)}` : '';
  }
}
