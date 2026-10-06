// Modelos low-poly: Astra GSi do jogador, carros do tráfego, ônibus, motos e buracos.
import * as THREE from 'three';
import { shapedBox, box, cylinder, wheel, merge, colorize, groundPlane } from './geometry.js';
import { ps1Material } from './ps1.js';

const GLASS = 0x1a2630;

/** Cria todos os materiais do jogo a partir das texturas. */
export function makeMaterials(T) {
  const M = {};
  // Lataria preta com reflexo de céu (matcap) — o visual GT do Astra.
  M.paintBlack = ps1Material({ envStrength: 0.45 });
  M.glass = ps1Material({ envStrength: 0.5 });
  M.detail = ps1Material({});
  M.props = ps1Material({});
  M.shadow = ps1Material({ map: T.shadow, unlit: true, transparent: true, alphaTest: 0.05, opacity: 0.85 });
  M.pothole = ps1Material({ map: T.pothole, unlit: true, alphaTest: 0.5, color: 0xcccccc });

  const paintCache = new Map();
  M.paint = (hex) => {
    if (!paintCache.has(hex)) paintCache.set(hex, ps1Material({ color: hex, envStrength: 0.16 }));
    return paintCache.get(hex);
  };

  // Cidade
  M.asphalt = ps1Material({ map: T.asphalt });
  M.asphaltPlain = ps1Material({ map: T.asphaltPlain });
  M.zebra = ps1Material({ map: T.zebra });
  M.sidewalk = ps1Material({ map: T.sidewalk });
  M.grass = ps1Material({ map: T.grass });
  M.water = ps1Material({ map: T.water, envStrength: 0.15 });
  M.shops = ps1Material({ map: T.shops });
  M.billboards = ps1Material({ map: T.billboards, unlit: true, color: 0xeeeeee });
  M.signs = ps1Material({ map: T.signs, unlit: true, color: 0xeeeeee, side: THREE.DoubleSide });
  M.directionSigns = ps1Material({ map: T.directionSigns, unlit: true, color: 0xeeeeee, side: THREE.DoubleSide });
  M.fence = ps1Material({ map: T.fence, alphaTest: 0.5, side: THREE.DoubleSide });
  M.busWindows = ps1Material({ map: T.busWindows });
  for (const name of Object.keys(T.facade)) M['facade_' + name] = ps1Material({ map: T.facade[name] });
  for (const tree of ['eucalyptus', 'palm', 'roundTree']) {
    M[tree] = ps1Material({ map: T[tree], alphaTest: 0.5, side: THREE.DoubleSide, unlit: true, color: 0xd8d8d8 });
  }
  return M;
}

function shadowMesh(w, l, M) {
  const g = groundPlane(w, l, 1, 1, 0xffffff, 0, 0.012, 0);
  const m = new THREE.Mesh(g, M.shadow);
  m.renderOrder = 1;
  return m;
}

/**
 * Chevrolet Astra GSi (2004-2006): hatch 3 portas, 4,27 m x 1,71 m x 1,43 m,
 * entre-eixos 2,61 m, aerofólio no teto. Frente = -z.
 */
export function buildAstra(M) {
  const PAINT = 0x1a1b1f;
  const g = new THREE.Group();

  // Carroceria (capô inclinado pelo recuo frontal do topo).
  const body = shapedBox({ w: 1.70, h: 0.58, l: 4.26, frontInset: 0.62, rearInset: 0.10, topScale: 0.96, bottomScale: 0.93, color: PAINT });
  body.translate(0, 0.26 + 0.29, 0);
  // Teto, aerofólio e retrovisores.
  const roof = box(1.40, 0.05, 1.16, PAINT, 0, 1.425, 0.70);
  const wing = box(1.42, 0.06, 0.32, PAINT, 0, 1.52, 1.34);
  const wingL = box(0.09, 0.10, 0.24, PAINT, -0.56, 1.46, 1.30);
  const wingR = box(0.09, 0.10, 0.24, PAINT, 0.56, 1.46, 1.30);
  const mirL = box(0.20, 0.10, 0.15, PAINT, -0.93, 0.98, -0.50);
  const mirR = box(0.20, 0.10, 0.15, PAINT, 0.93, 0.98, -0.50);
  const paint = new THREE.Mesh(merge([body, roof, wing, wingL, wingR, mirL, mirR]), M.paintBlack);
  g.add(paint);

  // Cabine (vidros) — base de z=-0.75 a z=1.95, teto de 0.13 a 1.27.
  const cabin = shapedBox({ w: 1.58, h: 0.56, l: 2.70, frontInset: 0.88, rearInset: 0.68, topScale: 0.86, color: GLASS });
  cabin.translate(0, 0.84 + 0.28, 0.60);
  g.add(new THREE.Mesh(cabin, M.glass));

  // Detalhes: faróis, grade, entrada de ar, lanternas, placa, saias, escapamento.
  const d = [];
  d.push(box(0.54, 0.16, 0.10, 0xe9edf1, -0.52, 0.72, -1.66));
  d.push(box(0.54, 0.16, 0.10, 0xe9edf1, 0.52, 0.72, -1.66));
  d.push(box(0.46, 0.10, 0.08, 0x202226, 0, 0.72, -1.67));
  d.push(box(0.08, 0.04, 0.09, 0xc0a020, 0, 0.72, -1.68)); // gravata dourada
  d.push(box(1.10, 0.14, 0.08, 0x121214, 0, 0.40, -2.00));
  d.push(box(0.46, 0.17, 0.08, 0xc0261c, -0.58, 0.70, 2.07));
  d.push(box(0.46, 0.17, 0.08, 0xc0261c, 0.58, 0.70, 2.07));
  d.push(box(0.16, 0.10, 0.06, 0xe8e0d0, -0.76, 0.70, 2.10)); // ré
  d.push(box(0.16, 0.10, 0.06, 0xe8e0d0, 0.76, 0.70, 2.10));
  d.push(box(0.40, 0.13, 0.06, 0xe0e0d8, 0, 0.50, 2.11));
  d.push(box(0.06, 0.08, 2.30, 0x101012, -0.86, 0.30, 0.10));
  d.push(box(0.06, 0.08, 2.30, 0x101012, 0.86, 0.30, 0.10));
  d.push(box(1.00, 0.06, 0.08, 0xd02020, 0, 1.50, 1.50)); // brake light no aerofólio
  const ex = new THREE.CylinderGeometry(0.045, 0.045, 0.16, 6);
  ex.rotateX(Math.PI / 2); ex.translate(0.55, 0.30, 2.14);
  d.push(colorize(ex, 0x9a9a9a));
  g.add(new THREE.Mesh(merge(d), M.detail));

  // Rodas (aro 15, cinco raios → aro claro).
  const wheelGeo = wheel(0.30, 0.21, 0xc9ccd2);
  const wheels = [];
  for (const [x, z] of [[-0.76, -1.307], [0.76, -1.307], [-0.76, 1.307], [0.76, 1.307]]) {
    const w = new THREE.Mesh(wheelGeo, M.detail);
    w.position.set(x, 0.30, z);
    g.add(w);
    wheels.push(w);
  }
  g.add(shadowMesh(2.2, 4.7, M));

  return { group: g, wheels, width: 1.70, length: 4.26 };
}

/** Monta um template de carro do tráfego: { paint, detail, w, l, wheelR }. */
function carTemplate(s) {
  const paintParts = [];
  const detail = [];
  const bottom = s.wheelR * 0.8;
  const body = shapedBox({ w: s.w, h: s.bh, l: s.l, frontInset: s.fi, rearInset: s.ri, topScale: 0.96, bottomScale: 0.95 });
  body.translate(0, bottom + s.bh / 2, 0);
  paintParts.push(body);
  if (s.cabin) {
    const c = s.cabin;
    const cab = shapedBox({ w: s.w * 0.92, h: c.h, l: c.l, frontInset: c.fi, rearInset: c.ri, topScale: 0.86, color: GLASS });
    cab.translate(0, bottom + s.bh + c.h / 2, c.z);
    detail.push(cab);
    const roofL = c.l - c.fi - c.ri;
    paintParts.push(box(s.w * 0.92 * 0.86 + 0.04, 0.05, roofL, 0xffffff, 0, bottom + s.bh + c.h + 0.02, c.z + (c.fi - c.ri) / 2));
  }
  if (s.windowBand) {
    const b = s.windowBand;
    detail.push(box(s.w + 0.02, b.h, b.l, GLASS, 0, b.y, b.z));
  }
  const ly = bottom + s.bh * 0.75;
  const fz = -s.l / 2 + s.fi * 0.7;
  const rz = s.l / 2 - s.ri * 0.7;
  const lx = s.w * 0.3;
  const lw = s.w * 0.22;
  detail.push(box(lw, 0.14, 0.08, 0xe9edf1, -lx, ly, fz));
  detail.push(box(lw, 0.14, 0.08, 0xe9edf1, lx, ly, fz));
  detail.push(box(lw, 0.14, 0.08, 0xc0261c, -lx, ly, rz));
  detail.push(box(lw, 0.14, 0.08, 0xc0261c, lx, ly, rz));
  detail.push(box(s.w * 0.9, 0.12, 0.06, 0x2a2a2e, 0, bottom + 0.1, -s.l / 2 + 0.02)); // para-choque
  detail.push(box(s.w * 0.9, 0.12, 0.06, 0x2a2a2e, 0, bottom + 0.1, s.l / 2 - 0.02));
  const wg = wheel(s.wheelR, s.wheelR * 0.6, 0x9a9ca0);
  const wz = s.wheelBase / 2;
  const wx = s.w / 2 - s.wheelR * 0.35;
  for (const [x, z] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
    const w = wg.clone();
    w.translate(x, s.wheelR, z);
    detail.push(w);
  }
  return { paint: merge(paintParts), detail: merge(detail), w: s.w, l: s.l, h: bottom + s.bh + (s.cabin ? s.cabin.h : 0), colors: s.colors, name: s.name, weight: s.weight };
}

const CAR_COLORS = [0xe8e8e8, 0xb8bcc2, 0xb3221c, 0x1f3a7a, 0x1f5a3a, 0xd8c9a3, 0x2a2a2e, 0x8a1c3a, 0x4a6fa5];

/** Templates: sedã (Monza/Vectra), hatch (Gol/Uno), van (Kombi), picape (D-20) e ônibus urbano. */
export function buildTrafficTemplates() {
  return [
    carTemplate({ name: 'sedan', w: 1.70, bh: 0.56, l: 4.50, fi: 0.50, ri: 0.45, wheelR: 0.30, wheelBase: 2.60, colors: CAR_COLORS, weight: 3,
      cabin: { h: 0.50, l: 2.10, z: 0.05, fi: 0.65, ri: 0.55 } }),
    carTemplate({ name: 'hatch', w: 1.62, bh: 0.52, l: 3.80, fi: 0.45, ri: 0.06, wheelR: 0.29, wheelBase: 2.40, colors: CAR_COLORS, weight: 3,
      cabin: { h: 0.56, l: 2.25, z: 0.30, fi: 0.70, ri: 0.32 } }),
    carTemplate({ name: 'van', w: 1.76, bh: 1.60, l: 4.40, fi: 0.30, ri: 0.05, wheelR: 0.33, wheelBase: 2.50, colors: [0xe8e8e8, 0x3a7fc1, 0xd8c9a3, 0x8a1c3a], weight: 1,
      windowBand: { h: 0.45, l: 3.4, y: 0.33 * 0.8 + 1.15, z: 0.2 } }),
    carTemplate({ name: 'pickup', w: 1.78, bh: 0.58, l: 5.00, fi: 0.45, ri: 0.02, wheelR: 0.34, wheelBase: 3.00, colors: [0xe8e8e8, 0x1f3a7a, 0xb3221c, 0x2a2a2e], weight: 1,
      cabin: { h: 0.58, l: 1.50, z: -0.75, fi: 0.55, ri: 0.08 } }),
    carTemplate({ name: 'bus', w: 2.50, bh: 2.70, l: 11.0, fi: 0.15, ri: 0.10, wheelR: 0.50, wheelBase: 6.0, colors: [0xe0a020, 0x2c62b5, 0xe8e8e8, 0xc83a2a], weight: 1,
      windowBand: { h: 0.95, l: 9.8, y: 0.4 + 2.15, z: 0.3 } }),
  ];
}

/** Cria uma instância (Group) de um template com a cor dada. */
export function makeVehicle(tpl, color, M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(tpl.paint, M.paint(color)));
  g.add(new THREE.Mesh(tpl.detail, M.detail));
  g.add(shadowMesh(tpl.w * 1.15, tpl.l * 1.05, M));
  return g;
}

/** Motoboy com baú: a presa do jogo. Frente = -z. */
export function buildMotoTemplate() {
  const paint = [];
  const detail = [];
  const w1 = wheel(0.30, 0.10, 0x6a6a6e); w1.translate(0, 0.30, -0.70);
  const w2 = wheel(0.30, 0.10, 0x6a6a6e); w2.translate(0, 0.30, 0.65);
  detail.push(w1, w2);
  paint.push(box(0.30, 0.28, 0.80, 0xffffff, 0, 0.60, -0.05)); // tanque/carenagem
  detail.push(box(0.36, 0.30, 0.42, 0x3a3a3e, 0, 0.38, 0.0)); // motor
  detail.push(box(0.32, 0.10, 0.62, 0x1a1a1a, 0, 0.75, 0.30)); // banco
  detail.push(box(0.08, 0.55, 0.08, 0x9a9a9e, 0, 0.55, -0.62)); // garfo
  detail.push(box(0.62, 0.05, 0.05, 0x222222, 0, 0.88, -0.52)); // guidão
  detail.push(box(0.16, 0.16, 0.08, 0xeeeedd, 0, 0.78, -0.74)); // farol
  detail.push(box(0.10, 0.08, 0.06, 0xc0261c, 0, 0.70, 0.98)); // lanterna
  const ex = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6); ex.rotateX(Math.PI / 2); ex.translate(0.18, 0.33, 0.45);
  detail.push(colorize(ex, 0xb0b0b4));
  // baú de entrega
  detail.push(box(0.50, 0.46, 0.46, 0xe2e2e2, 0, 0.98, 0.78));
  detail.push(box(0.52, 0.10, 0.48, 0xd02020, 0, 0.98, 0.78));
  // piloto
  detail.push(box(0.36, 0.42, 0.26, 0x2a2a4a, 0, 0.78, 0.15)); // pernas
  const torso = box(0.42, 0.50, 0.30, 0x252528, 0, 0, 0); torso.rotateX(-0.28); torso.translate(0, 1.18, 0.02);
  detail.push(torso);
  const armL = box(0.09, 0.09, 0.46, 0x252528, 0, 0, 0); armL.rotateX(0.5); armL.translate(-0.22, 1.08, -0.26);
  const armR = box(0.09, 0.09, 0.46, 0x252528, 0, 0, 0); armR.rotateX(0.5); armR.translate(0.22, 1.08, -0.26);
  detail.push(armL, armR);
  const head = new THREE.SphereGeometry(0.17, 7, 5); head.translate(0, 1.52, -0.12);
  detail.push(colorize(head, 0xe8e8e8)); // capacete
  detail.push(box(0.26, 0.09, 0.06, 0x101418, 0, 1.52, -0.28)); // viseira
  return { paint: merge(paint), detail: merge(detail), w: 0.75, l: 2.05, colors: [0xd02020, 0x2050c0, 0x202020, 0xe0e0e0, 0x20a040, 0xf0a000] };
}

export function makeMoto(tpl, color, M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(tpl.paint, M.paint(color)));
  g.add(new THREE.Mesh(tpl.detail, M.detail));
  g.add(shadowMesh(1.0, 2.2, M));
  return g;
}

export function makePothole(M) {
  const g = groundPlane(1.5, 1.1, 1, 1, 0xffffff, 0, 0.02, 0);
  const m = new THREE.Mesh(g, M.pothole);
  m.renderOrder = 2;
  return m;
}
