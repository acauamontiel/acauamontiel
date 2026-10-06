// PELOTAS TURISMO — Astra GSi pelas avenidas de Pelotas, em WebGL com visual de PS1.
import * as THREE from 'three';
import { PS1Post, shared } from './ps1.js';
import { makeTextures } from './textures.js';
import { makeMaterials, buildAstra, buildTrafficTemplates, buildMotoTemplate } from './vehicles.js';
import { City, ROAD, themeAt } from './city.js';
import { Traffic } from './traffic.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const hud = new HUD();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('loading').textContent = 'WebGL indisponível neste navegador.';
  throw err;
}
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.3, 420);
const post = new PS1Post(renderer, 512);

const T = makeTextures();
const M = makeMaterials(T);
const astra = buildAstra(M, T);
scene.add(astra.group);
const city = new City(scene, M, T);
const traffic = new Traffic(scene, M, buildTrafficTemplates(), buildMotoTemplate());
const input = new Input(window);
const audio = new GameAudio();

const BEST_KEY = 'pelotas-turismo-best';
const loadBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, String(Math.floor(v))); } catch { /* sem storage */ } };

// O jogador começa 60 m dentro da avenida para haver chão atrás da câmera. ?tp=<m> teletransporta.
const START_Z = -60 - (Number(params.get('tp')) || 0);

const G = {
  state: 'title',
  x: ROAD.LANE_X[1], z: START_Z, speed: 0,
  maxSpeed: 58, // ~209 km/h
  health: 100, score: 0, combo: 0, comboTimer: 0, dist: 0, motos: 0,
  time: 0, stateTime: 0,
  shake: 0, bounce: 0, bounceV: 0, roll: 0, invuln: 0, gear: 1, rpm: 0,
  course: '', courseKey: null, best: loadBest(), alive: false,
  wheelRot: 0, titleAngle: 0,
};

const camState = { x: G.x, lookX: G.x, fov: 60 };

function resetRun() {
  G.x = ROAD.LANE_X[1]; G.z = START_Z; G.speed = 0;
  G.health = 100; G.score = 0; G.combo = 0; G.comboTimer = 0; G.dist = 0; G.motos = 0;
  G.shake = 0; G.bounce = 0; G.bounceV = 0; G.roll = 0; G.invuln = 0; G.gear = 1; G.rpm = 0;
  G.courseKey = null; G.alive = true; G.stateTime = 0;
  traffic.reset(START_Z);
  astra.group.rotation.set(0, 0, 0);
  camState.x = G.x; camState.lookX = G.x;
}

function startRun(gesture = true) {
  if (gesture) { audio.init(); audio.start(); }
  resetRun();
  G.state = 'playing';
  hud.show('hud');
}

function gameOver() {
  G.state = 'gameover';
  G.alive = false;
  G.stateTime = 0;
  audio.gameOver();
  audio.engineUpdate(0, 0, false);
  if (G.score > G.best) { G.best = G.score; saveBest(G.best); }
  hud.gameOver(G, G.best);
  hud.setBest(G.best);
}

function onConfirm() {
  if (G.state === 'title') startRun();
  else if (G.state === 'gameover' && G.stateTime > 1.2) startRun();
}

input.onKey = (code) => {
  if (code === 'Enter' || code === 'Space') onConfirm();
  if (code === 'KeyM') audio.setMuted(!audio.muted);
  if (code === 'KeyP') post.setEnabled(!post.enabled);
};
input.onAny = () => { if (G.state !== 'playing') onConfirm(); };

const GEARS = [[0, 11], [9, 19], [16, 29], [25, 41], [36, 60]];

// Piloto automático de depuração (?bot): persegue motos e desvia do resto.
const BOT = params.has('bot');
function botSteer() {
  let target = null, best = Infinity;
  for (const e of traffic.active) {
    if (e.hit || e.kind === 'oncoming') continue;
    const dz = G.z - e.z; // positivo = à frente do jogador
    if (dz < -1 || dz > 70) continue;
    if (dz < best) { best = dz; target = e; }
  }
  if (!target) return Math.abs(G.x - ROAD.LANE_X[1]) > 0.4 ? Math.sign(ROAD.LANE_X[1] - G.x) : 0;
  const dx = target.x - G.x;
  if (target.kind === 'moto') return Math.abs(dx) > 0.25 ? Math.sign(dx) : 0;
  if (Math.abs(dx) < 2.4) {
    let dir = -Math.sign(dx || 1);
    if (G.x + dir * 3 < ROAD.PLAYER_MIN_X || G.x + dir * 3 > ROAD.PLAYER_MAX_X) dir = -dir;
    return dir;
  }
  return 0;
}

function updatePlaying(dt) {
  const diff = Math.min(1, G.dist / 6000);
  const cruise = 24 + diff * 18;
  const throttle = input.up ? 1 : 0;
  if (input.down) {
    G.speed = Math.max(6, G.speed - 32 * dt);
  } else {
    const target = throttle ? G.maxSpeed : cruise;
    G.speed += (target - G.speed) * (throttle ? 0.55 : 0.35) * dt;
  }

  // Direção lateral, com "pancada" no meio-fio.
  const steer = BOT ? botSteer() : input.steer;
  const lateral = steer * (7 + G.speed * 0.11) * dt;
  let nx = G.x + lateral;
  if (nx < ROAD.PLAYER_MIN_X || nx > ROAD.PLAYER_MAX_X) {
    nx = Math.max(ROAD.PLAYER_MIN_X, Math.min(ROAD.PLAYER_MAX_X, nx));
    if (steer !== 0 && G.speed > 8) { G.speed *= 1 - 0.6 * dt; G.shake = Math.max(G.shake, 0.15); if (Math.random() < dt * 6) audio.curb(); }
  }
  G.x = nx;
  G.z -= G.speed * dt;
  G.dist += G.speed * dt;
  G.score += G.speed * dt * 0.5;

  // Marchas (só para HUD e som).
  let gear = 0;
  for (let k = GEARS.length - 1; k >= 0; k--) if (G.speed >= GEARS[k][0]) { gear = k; break; }
  const [lo, hi] = GEARS[gear];
  G.gear = gear + 1;
  G.rpm = Math.min(1, Math.max(0, (G.speed - lo) / (hi - lo)));

  if (G.combo > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }
  G.invuln = Math.max(0, G.invuln - dt);

  // Tráfego e colisões.
  for (const ev of traffic.update(dt, G, diff)) {
    if (ev.type === 'moto') {
      G.combo += 1; G.comboTimer = 6;
      const pts = 100 * Math.min(8, G.combo);
      G.score += pts; G.motos += 1;
      G.shake = Math.max(G.shake, 0.25); G.bounceV += 1.2;
      audio.moto(G.combo);
      hud.popup(G.combo > 1 ? `+${pts} MOTO x${G.combo}` : `+${pts} MOTO!`);
    } else if (ev.type === 'car' && G.invuln <= 0) {
      G.health -= 30; G.invuln = 1.0;
      G.speed *= 0.35; G.combo = 0;
      G.shake = 1.0; G.bounceV += 2.5;
      audio.crash();
      hud.popup('BATIDA!', true);
    } else if (ev.type === 'hole') {
      G.health -= 8;
      if (G.speed > 15) G.speed *= 0.78;
      G.shake = Math.max(G.shake, 0.45); G.bounceV -= 3.5;
      audio.pothole();
      hud.popup('BURACO!', true);
    } else if (ev.type === 'near') {
      G.score += 50;
      hud.popup('+50 RASPÃO');
    }
  }

  // Suspensão (mola) e inclinação.
  G.bounceV += (-G.bounce * 90 - G.bounceV * 9) * dt;
  G.bounce += G.bounceV * dt;
  G.roll += ((-steer * 0.07) - G.roll) * Math.min(1, 6 * dt);
  G.shake *= Math.exp(-5 * dt);

  astra.group.position.set(G.x, G.bounce * 0.12, G.z);
  astra.group.rotation.set(G.bounce * 0.04, steer * -0.03, G.roll);
  G.wheelRot -= (G.speed * dt) / 0.30;
  for (const w of astra.wheels) w.rotation.x = G.wheelRot;
  // Piscar quando invulnerável.
  astra.group.visible = G.invuln <= 0 || Math.floor(G.time * 16) % 2 === 0;

  // Câmera de perseguição.
  camState.x += (G.x - camState.x) * Math.min(1, 5 * dt);
  camState.fov += ((56 + G.speed * 0.28) - camState.fov) * Math.min(1, 3 * dt);
  const sx = (Math.random() - 0.5) * G.shake * 0.5;
  const sy = (Math.random() - 0.5) * G.shake * 0.4;
  camera.position.set(camState.x + sx, 3.1 + G.bounce * 0.06 + sy, G.z + 6.8 + G.speed * 0.02);
  camera.lookAt(camState.x + steer * 0.5 + sx, 0.4 + sy, G.z - 12);
  camera.fov = camState.fov;
  camera.updateProjectionMatrix();

  // Avenida atual (banner ao trocar).
  const theme = themeAt(G.z - 40);
  if (theme.key !== G.courseKey) {
    G.courseKey = theme.key;
    G.course = theme.name;
    hud.banner(theme.name);
  }

  audio.engineUpdate(G.rpm, throttle, true);
  hud.update(G);

  if (G.health <= 0) gameOver();
}

function updateTitle(dt) {
  G.titleAngle += dt * 0.35;
  const a = G.titleAngle;
  astra.group.position.set(G.x, 0, G.z);
  astra.group.rotation.set(0, 0, 0);
  camera.position.set(G.x + Math.cos(a) * 6.4, 1.7 + Math.sin(a * 0.6) * 0.5, G.z + Math.sin(a) * 6.4);
  camera.lookAt(G.x, 0.7, G.z);
  camera.fov = 48;
  camera.updateProjectionMatrix();
}

function updateGameOver(dt) {
  G.titleAngle += dt * 0.25;
  const a = G.titleAngle;
  G.speed *= Math.exp(-1.5 * dt);
  G.z -= G.speed * dt;
  astra.group.position.set(G.x, 0, G.z);
  astra.group.visible = true;
  camera.position.set(G.x + Math.cos(a) * 7.5, 2.4, G.z + Math.sin(a) * 7.5);
  camera.lookAt(G.x, 0.6, G.z);
  camera.updateProjectionMatrix();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  G.time += dt;
  G.stateTime += dt;
  if (G.state === 'playing') updatePlaying(dt);
  else if (G.state === 'title') updateTitle(dt);
  else updateGameOver(dt);
  city.update(G.z);
  if (DBG) renderer.info.reset();
  post.render(scene, camera, G.time);
}
const DBG = params.has('dbg');
if (DBG) renderer.info.autoReset = false;

// Inicialização.
city.update(G.z);
hud.setBest(G.best);
hud.show('title');
if (params.has('nops1')) post.setEnabled(false);
if (params.has('autostart')) startRun(false);
if (params.has('showcase') && G.state === 'playing') { G.x = ROAD.PLAYER_MIN_X; camState.x = G.x; traffic.showcase(G.z); }
if (params.has('nohud')) { hud.el.hud.style.visibility = 'hidden'; hud.el.title.style.visibility = 'hidden'; hud.el.gameover.style.visibility = 'hidden'; }
if (params.has('angle')) G.titleAngle = Number(params.get('angle')) || 0;
// ?sim=N avança N segundos de jogo antes do primeiro quadro (depuração/captura).
const sim = Number(params.get('sim')) || 0;
for (let k = 0; k < sim * 60 && G.state === 'playing'; k++) {
  G.time += 1 / 60; G.stateTime += 1 / 60;
  updatePlaying(1 / 60);
  city.update(G.z);
}
frame();

// Para depuração no console.
window.__game = { G, scene, camera, city, traffic, post, shared };
if (params.has('env')) {
  const v = Number(params.get('env'));
  M.astraPaint.uniforms.uEnvStrength.value = v;
  M.glass.uniforms.uEnvStrength.value = v;
}
if (params.has('dbg')) {
  setInterval(() => {
    const first = traffic.active.slice(0, 4).map((e) => [e.kind, e.x.toFixed(1), e.z.toFixed(1), e.group.visible, e.group.children.length]);
    console.log('DBG', JSON.stringify({ t: G.time.toFixed(2), z: G.z.toFixed(1), speed: G.speed.toFixed(1), n: traffic.active.length, spawnZ: traffic.spawnZ.toFixed(0), first, drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles }));
  }, 400);
}
