// Tráfego: carros e ônibus no sentido do jogador (obstáculos), carros no contrafluxo (cenário),
// motos (pontos) e buracos (penalidade). Também detecta colisões.
import { ROAD } from './city.js';
import { makeVehicle, makeMoto, makePothole } from './vehicles.js';

const PLAYER_HALF_W = 0.85;
const PLAYER_HALF_L = 2.13;

const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Traffic {
  constructor(scene, M, carTemplates, motoTemplate) {
    this.scene = scene;
    this.M = M;
    this.cars = carTemplates;
    this.moto = motoTemplate;
    this.weighted = [];
    for (const t of carTemplates) for (let k = 0; k < t.weight; k++) this.weighted.push(t);
    this.active = [];
    this.reset();
  }

  reset(startZ = 0) {
    for (const e of this.active) this.scene.remove(e.group);
    this.active.length = 0;
    this.spawnZ = startZ - 70;
    this.oncomingZ = startZ - 20;
  }

  addEntity(e) {
    e.group.position.set(e.x, e.y || 0, e.z);
    this.scene.add(e.group);
    this.active.push(e);
    return e;
  }

  spawnCar(x, z, lane, tpl = pick(this.weighted), color = pick(tpl.colors)) {
    const group = makeVehicle(tpl, color, this.M);
    const bus = tpl.name === 'bus';
    return this.addEntity({ kind: 'car', group, x, z, lane, w: tpl.w, l: tpl.l, speed: bus ? rnd(9, 13) : rnd(11, 19), hit: false, passed: false, vx: 0, spinY: 0 });
  }

  spawnOncoming(z) {
    const tpl = pick(this.weighted);
    const group = makeVehicle(tpl, pick(tpl.colors), this.M);
    group.rotation.y = Math.PI;
    return this.addEntity({ kind: 'oncoming', group, x: pick(ROAD.ONCOMING_X), z, w: tpl.w, l: tpl.l, speed: rnd(12, 19), hit: true });
  }

  spawnMoto(lane, z) {
    const group = makeMoto(this.moto, pick(this.moto.colors), this.M);
    const baseX = ROAD.LANE_X[lane];
    const weave = Math.random() < 0.55;
    return this.addEntity({
      kind: 'moto', group, x: baseX, z, lane, baseX, w: this.moto.w, l: this.moto.l,
      speed: rnd(15, 23), hit: false, flying: false, t: Math.random() * 10,
      wa: weave ? 1.7 : 0.35, wf: rnd(0.7, 1.4), ph: Math.random() * Math.PI * 2,
    });
  }

  spawnHole(x, z) {
    const mesh = makePothole(this.M);
    mesh.rotation.y = Math.random() * Math.PI;
    const s = rnd(0.8, 1.25);
    mesh.scale.set(s, 1, s);
    return this.addEntity({ kind: 'hole', group: mesh, x, z, w: 1.2 * s, l: 1.0 * s, speed: 0, hit: false });
  }

  wave(z, diff) {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const n = Math.random() < 0.2 + diff * 0.5 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const lane = lanes[k];
      const x = ROAD.LANE_X[lane];
      const r = Math.random();
      if (r < 0.40) this.spawnCar(x, z - Math.random() * 6, lane);
      else if (r < 0.70) this.spawnHole(x + (Math.random() - 0.5) * 1.4, z - Math.random() * 8);
      else this.spawnMoto(lane, z - Math.random() * 6);
    }
  }

  /** Depuração: um exemplar parado de cada veículo à frente do jogador. */
  showcase(z) {
    this.cars.forEach((tpl, k) => { this.spawnCar(ROAD.LANE_X[1 + (k % 2)], z - 12 - k * 9, 1 + (k % 2), tpl, tpl.colors[0]).speed = 0; });
    const m = this.spawnMoto(1, z - 6); m.speed = 0; m.wa = 0; m.x = 5.6;
    this.spawnHole(ROAD.LANE_X[0], z - 9);
    this.spawnOncoming(z - 20).speed = 0;
  }

  remove(e) {
    this.scene.remove(e.group);
    const i = this.active.indexOf(e);
    if (i >= 0) this.active.splice(i, 1);
  }

  /**
   * @param {number} dt
   * @param {{x:number,z:number,speed:number,alive:boolean}} P jogador
   * @param {number} diff dificuldade 0..1
   * @returns {Array<{type:string,e:object}>} eventos de colisão
   */
  update(dt, P, diff) {
    const events = [];
    const horizon = P.z - 290;
    while (this.spawnZ > horizon) {
      this.wave(this.spawnZ, diff);
      this.spawnZ -= lerp(44, 18, diff) * rnd(0.75, 1.25);
    }
    while (this.oncomingZ > horizon) {
      this.spawnOncoming(this.oncomingZ);
      this.oncomingZ -= rnd(25, 70);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.flying) {
        e.t += dt;
        e.vy -= 22 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
        e.group.rotation.x += e.spinX * dt;
        e.group.rotation.z += e.spinZ * dt;
        e.group.position.set(e.x, e.y, e.z);
        if (e.y < -3 || e.t > 4 || e.z > P.z + 30) this.remove(e);
        continue;
      }
      switch (e.kind) {
        case 'car':
          e.z -= e.speed * dt;
          if (e.hit) {
            e.x += e.vx * dt; e.vx *= Math.max(0, 1 - 2.5 * dt);
            e.group.rotation.y += e.spinY * dt; e.spinY *= Math.max(0, 1 - 2.5 * dt);
          }
          break;
        case 'oncoming':
          e.z += e.speed * dt;
          break;
        case 'moto':
          e.z -= e.speed * dt;
          e.t += dt;
          e.x = e.baseX + Math.sin(e.t * e.wf + e.ph) * e.wa;
          e.x = Math.max(ROAD.X0 + 0.6, Math.min(ROAD.X1 - 0.6, e.x));
          e.group.rotation.z = -Math.cos(e.t * e.wf + e.ph) * e.wa * 0.12;
          break;
      }
      e.group.position.set(e.x, 0, e.z);

      if (e.z > P.z + 30) { this.remove(e); continue; }
      if (e.hit || !P.alive) continue;

      const dx = e.x - P.x, dz = e.z - P.z;
      const hw = e.w / 2 + PLAYER_HALF_W, hl = e.l / 2 + PLAYER_HALF_L;
      if (e.kind === 'hole') {
        if (Math.abs(dx) < PLAYER_HALF_W + e.w * 0.4 && Math.abs(dz) < PLAYER_HALF_L) {
          e.hit = true;
          events.push({ type: 'hole', e });
        }
        continue;
      }
      if (Math.abs(dx) < hw && Math.abs(dz) < hl) {
        e.hit = true;
        const side = Math.sign(dx) || 1;
        if (e.kind === 'moto') {
          e.flying = true; e.t = 0; e.y = 0;
          e.vx = side * rnd(2, 5);
          e.vy = 7 + P.speed * 0.12;
          e.vz = -(P.speed * 0.8 + 3);
          e.spinX = rnd(5, 11);
          e.spinZ = rnd(-4, 4);
          events.push({ type: 'moto', e });
        } else {
          e.vx = side * 3.5;
          e.spinY = -side * 2.2;
          e.speed *= 0.6;
          events.push({ type: 'car', e });
        }
        continue;
      }
      // Raspão: passou do lado sem bater.
      if (e.kind === 'car' && !e.passed && dz > PLAYER_HALF_L) {
        e.passed = true;
        if (Math.abs(dx) < hw + 0.7) events.push({ type: 'near', e });
      }
    }
    return events;
  }
}
