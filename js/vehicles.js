// Modelos low-poly estilo PS1: Astra GSi do jogador, carros do tráfego, ônibus, motos e buracos.
// As carrocerias são "loftadas" por seções transversais com sombreamento Gouraud (ver geometry.js).
import * as THREE from 'three';
import { box, cylinder, wheel, merge, colorize, groundPlane, carBody, atlasQuad, discWheel } from './geometry.js';
import { ps1Material } from './ps1.js';

const GLASS = 0x1a2630;

/** Cria todos os materiais do jogo a partir das texturas. */
export function makeMaterials(T) {
  const M = {};
  // Lataria preta: a cor base é quase preta e a forma vem do reflexo "matcap" do céu (visual GT).
  M.paintBlack = ps1Material({ envStrength: 0.7 });
  M.astraDetail = ps1Material({ map: T.astra, unlit: true });
  M.detail = ps1Material({});
  M.props = ps1Material({});
  M.shadow = ps1Material({ map: T.shadow, unlit: true, transparent: true, alphaTest: 0.05, opacity: 0.85 });
  M.pothole = ps1Material({ map: T.pothole, unlit: true, alphaTest: 0.5, color: 0xcccccc });

  const paintCache = new Map();
  M.paint = (hex) => {
    if (!paintCache.has(hex)) paintCache.set(hex, ps1Material({ color: hex, envStrength: 0.18 }));
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
 * Chevrolet Astra GSi (2004-2006): hatch 3 portas, ~4,2 m x 1,71 m x 1,43 m,
 * entre-eixos 2,61 m, aerofólio de teto. Frente = -z. Carroceria loftada em 19 seções.
 */
export function buildAstra(M, T) {
  const PAINT = 0x0a0b0d, GL = 0x18222c, UNDER = 0x08080a;
  const A = T.ASTRA_ATLAS;
  const g = new THREE.Group();

  const body = carBody({
    zs: [-2.12, -2.0, -1.75, -1.3, -0.95, -0.77, -0.75, -0.4, -0.07, -0.05, 0.4, 0.8, 1.19, 1.21, 1.6, 1.93, 1.95, 2.06, 2.14],
    yFloor: [[-2.12, 0.34], [-1.95, 0.27], [1.95, 0.27], [2.14, 0.34]],
    wSill: [[-2.12, 0.62], [-1.95, 0.76], [1.95, 0.76], [2.14, 0.66]],
    wBelt: [[-2.12, 0.70], [-1.95, 0.80], [-1.3, 0.85], [0.4, 0.855], [1.6, 0.845], [2.0, 0.82], [2.14, 0.76]],
    yBelt: [[-2.12, 0.66], [-1.95, 0.70], [-1.3, 0.78], [-0.75, 0.84], [1.95, 0.84], [2.14, 0.80]],
    yTop: [[-2.12, 0.72], [-2.0, 0.79], [-1.3, 0.88], [-0.75, 0.96], [-0.05, 1.40], [0.4, 1.43], [1.2, 1.42], [1.6, 1.22], [1.95, 0.98], [2.14, 0.92]],
    wTop: [[-2.12, 0.50], [-1.95, 0.64], [-1.3, 0.72], [-0.75, 0.74], [-0.05, 0.62], [1.2, 0.62], [1.6, 0.58], [1.95, 0.62], [2.14, 0.60]],
    cabin: [-0.76, 1.94], windshield: [-0.76, -0.06], rearGlass: [1.2, 1.94],
    paint: PAINT, glass: GL, under: UNDER,
  });

  // Aerofólio de teto GSi: asa larga sobre o vidro traseiro, pedestais, placas laterais e brake light.
  const wing = box(1.40, 0.09, 0.50, PAINT, 0, 0, 0);
  wing.rotateX(-0.12); wing.translate(0, 1.55, 1.44);
  const plateL = box(0.04, 0.20, 0.50, PAINT, 0, 0, 0); plateL.rotateX(-0.12); plateL.translate(-0.70, 1.52, 1.44);
  const plateR = box(0.04, 0.20, 0.50, PAINT, 0, 0, 0); plateR.rotateX(-0.12); plateR.translate(0.70, 1.52, 1.44);
  const pedL = box(0.14, 0.22, 0.26, PAINT, -0.44, 1.42, 1.30);
  const pedR = box(0.14, 0.22, 0.26, PAINT, 0.44, 1.42, 1.30);
  // Retrovisores
  const mirL = box(0.20, 0.10, 0.15, PAINT, -0.94, 0.98, -0.52);
  const mirR = box(0.20, 0.10, 0.15, PAINT, 0.94, 0.98, -0.52);
  // Caixas de roda (discos escuros atrás das rodas)
  const arches = [];
  for (const [x, z] of [[-0.857, -1.307], [0.857, -1.307], [-0.857, 1.307], [0.857, 1.307]]) {
    const d = new THREE.CircleGeometry(0.40, 10);
    d.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
    d.translate(x, 0.32, z);
    arches.push(colorize(d, 0x030304));
  }
  g.add(new THREE.Mesh(merge([body, wing, plateL, plateR, pedL, pedR, mirL, mirR, ...arches]), M.paintBlack));

  // Detalhes texturizados (atlas): faróis, grade, lanternas fumê, placa.
  const q = [];
  const hl = (x) => { const h = atlasQuad(0.50, 0.17, A, 0, 0, 64, 24); h.rotateY(Math.PI); if (x < 0) h.scale(-1, 1, 1); h.translate(x, 0.64, -2.125); return h; };
  q.push(hl(-0.44), hl(0.44));
  const grille = atlasQuad(0.36, 0.09, A, 0, 56, 64, 12); grille.rotateY(Math.PI); grille.translate(0, 0.64, -2.125); q.push(grille);
  const tl = (x) => { const t = atlasQuad(0.48, 0.30, A, 64, 0, 64, 40); if (x < 0) t.scale(-1, 1, 1); t.translate(x, 0.66, 2.146); return t; };
  q.push(tl(-0.56), tl(0.56));
  const plate = atlasQuad(0.44, 0.11, A, 0, 32, 64, 16); plate.translate(0, 0.50, 2.146); q.push(plate);
  // Corrige o enrolamento dos quads espelhados (scale -1 inverte a face).
  for (const geo of q) { if (!geo.index) continue; }
  const quads = merge(q.map((geo) => geo.index ? geo.toNonIndexed() : geo));
  quads.computeVertexNormals();
  const detailMesh = new THREE.Mesh(quads, M.astraDetail);
  detailMesh.material.side = THREE.DoubleSide;
  g.add(detailMesh);

  // Peças sem textura: entrada de ar, saia traseira, brake light, escapamento.
  const d = [];
  d.push(box(1.00, 0.10, 0.03, 0x0c0e10, 0, 0.42, -2.125));
  d.push(box(1.40, 0.10, 0.03, 0x0c0e10, 0, 0.37, 2.146));
  d.push(box(0.50, 0.045, 0.03, 0xd02020, 0, 1.575, 1.70));
  const ex = new THREE.CylinderGeometry(0.045, 0.045, 0.16, 6);
  ex.rotateX(Math.PI / 2); ex.translate(-0.50, 0.33, 2.17);
  d.push(colorize(ex, 0x9a9a9a));
  g.add(new THREE.Mesh(merge(d), M.detail));

  // Rodas: face texturizada (aro preto de 5 raios), eixo em X.
  const tread = [66 / A, 1 - 66 / A];
  const wheelR = discWheel(0.30, 0.21, A, [64, 64, 64], tread, 1);
  const wheelL = discWheel(0.30, 0.21, A, [64, 64, 64], tread, -1);
  const wheels = [];
  for (const [x, z] of [[-0.76, -1.307], [0.76, -1.307], [-0.76, 1.307], [0.76, 1.307]]) {
    const w = new THREE.Mesh(x > 0 ? wheelR : wheelL, M.astraDetail);
    w.position.set(x, 0.30, z);
    g.add(w);
    wheels.push(w);
  }
  g.add(shadowMesh(2.2, 4.7, M));

  return { group: g, wheels, width: 1.71, length: 4.26 };
}

/** Monta um template de carro do tráfego: { paint, detail, w, l, wheelR }. */
function carTemplate(s) {
  const spec = Object.assign({ paint: 0xffffff, glass: GLASS, under: 0x101012 }, s.body);
  const paint = carBody(spec);
  const detail = [];
  const half = s.l / 2;
  const ly = s.lightY;
  const lx = s.w * 0.3, lw = s.w * 0.22;
  detail.push(box(lw, 0.14, 0.06, 0xe9edf1, -lx, ly, -half + 0.02));
  detail.push(box(lw, 0.14, 0.06, 0xe9edf1, lx, ly, -half + 0.02));
  detail.push(box(lw, 0.16, 0.06, 0xc0261c, -lx, ly + 0.02, half - 0.02));
  detail.push(box(lw, 0.16, 0.06, 0xc0261c, lx, ly + 0.02, half - 0.02));
  detail.push(box(s.w * 0.22, 0.10, 0.05, 0xe0e0d8, 0, ly - 0.14, half - 0.02)); // placa
  const wg = wheel(s.wheelR, s.wheelR * 0.6, s.rim || 0x9a9ca0);
  const wz = s.wheelBase / 2;
  const wx = s.w / 2 - s.wheelR * 0.3;
  for (const [x, z] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
    const w = wg.clone();
    w.translate(x, s.wheelR, z);
    detail.push(w);
  }
  return { paint, detail: merge(detail), w: s.w, l: s.l, colors: s.colors, name: s.name, weight: s.weight };
}

const CAR_COLORS = [0xe8e8e8, 0xb8bcc2, 0xb3221c, 0x1f3a7a, 0x1f5a3a, 0xd8c9a3, 0x2a2a2e, 0x8a1c3a, 0x4a6fa5];

/** Templates: sedã (Monza/Vectra), hatch (Gol/Uno), van (Kombi), picape (D-20) e ônibus urbano. */
export function buildTrafficTemplates() {
  return [
    carTemplate({ name: 'sedan', w: 1.70, l: 4.5, wheelR: 0.30, wheelBase: 2.60, lightY: 0.66, colors: CAR_COLORS, weight: 3, body: {
      zs: [-2.25, -2.1, -1.7, -1.3, -0.82, -0.78, -0.4, -0.12, -0.08, 0.4, 0.9, 0.98, 1.02, 1.5, 1.68, 1.72, 2.1, 2.25],
      yFloor: [[-2.25, 0.34], [-2.1, 0.27], [2.1, 0.27], [2.25, 0.34]],
      wSill: [[-2.25, 0.60], [-2.1, 0.76], [2.1, 0.76], [2.25, 0.66]],
      wBelt: [[-2.25, 0.68], [-2.1, 0.80], [-1.3, 0.85], [1.5, 0.85], [2.1, 0.80], [2.25, 0.72]],
      yBelt: [[-2.25, 0.64], [-2.1, 0.70], [-1.3, 0.78], [-0.8, 0.84], [2.0, 0.86], [2.25, 0.82]],
      yTop: [[-2.25, 0.70], [-2.1, 0.78], [-1.3, 0.88], [-0.8, 0.94], [-0.1, 1.38], [0.9, 1.40], [1.0, 1.38], [1.6, 1.02], [1.7, 0.98], [2.1, 0.96], [2.25, 0.90]],
      wTop: [[-2.25, 0.50], [-2.1, 0.64], [-1.3, 0.72], [-0.8, 0.74], [-0.1, 0.60], [1.0, 0.60], [1.7, 0.72], [2.25, 0.60]],
      cabin: [-0.8, 1.7], windshield: [-0.8, -0.1], rearGlass: [1.0, 1.68],
    } }),
    carTemplate({ name: 'hatch', w: 1.64, l: 3.9, wheelR: 0.29, wheelBase: 2.45, lightY: 0.64, colors: CAR_COLORS, weight: 3, body: {
      zs: [-1.95, -1.85, -1.4, -1.0, -0.72, -0.68, -0.3, -0.02, 0.02, 0.5, 1.0, 1.18, 1.22, 1.6, 1.78, 1.82, 1.9, 1.95],
      yFloor: [[-1.95, 0.34], [-1.85, 0.27], [1.85, 0.27], [1.95, 0.34]],
      wSill: [[-1.95, 0.58], [-1.85, 0.73], [1.85, 0.73], [1.95, 0.62]],
      wBelt: [[-1.95, 0.66], [-1.85, 0.78], [-1.0, 0.82], [1.6, 0.82], [1.85, 0.78], [1.95, 0.70]],
      yBelt: [[-1.95, 0.62], [-1.85, 0.68], [-1.0, 0.78], [-0.7, 0.84], [1.95, 0.84]],
      yTop: [[-1.95, 0.68], [-1.85, 0.76], [-1.0, 0.86], [-0.7, 0.94], [0, 1.40], [1.2, 1.42], [1.8, 1.05], [1.95, 0.95]],
      wTop: [[-1.95, 0.48], [-1.85, 0.62], [-1.0, 0.70], [-0.7, 0.72], [0, 0.60], [1.2, 0.60], [1.8, 0.58], [1.95, 0.56]],
      cabin: [-0.7, 1.8], windshield: [-0.7, 0], rearGlass: [1.2, 1.8],
    } }),
    carTemplate({ name: 'van', w: 1.76, l: 4.4, wheelR: 0.33, wheelBase: 2.50, lightY: 0.9, colors: [0xe8e8e8, 0x3a7fc1, 0xd8c9a3, 0x8a1c3a], weight: 1, body: {
      zs: [-2.2, -2.1, -1.8, -1.58, -1.54, -1.0, 0, 1.0, 2.0, 2.1, 2.14, 2.2],
      yFloor: [[-2.2, 0.36], [-2.1, 0.30], [2.1, 0.30], [2.2, 0.36]],
      wSill: [[-2.2, 0.66], [-2.1, 0.78], [2.1, 0.78], [2.2, 0.70]],
      wBelt: [[-2.2, 0.70], [-2.0, 0.86], [2.1, 0.86], [2.2, 0.76]],
      yBelt: [[-2.2, 0.90], [-1.6, 1.10], [2.2, 1.10]],
      yTop: [[-2.2, 0.95], [-2.1, 1.20], [-1.6, 1.90], [-1.5, 1.95], [2.1, 1.95], [2.2, 1.85]],
      wTop: [[-2.2, 0.60], [-2.0, 0.78], [-1.5, 0.74], [2.2, 0.72]],
      cabin: [-1.56, 2.2], windshield: [-2.1, -1.56], rearGlass: [2.12, 2.2],
    } }),
    carTemplate({ name: 'pickup', w: 1.78, l: 5.0, wheelR: 0.34, wheelBase: 3.00, lightY: 0.72, colors: [0xe8e8e8, 0x1f3a7a, 0xb3221c, 0x2a2a2e], weight: 1, body: {
      zs: [-2.5, -2.35, -1.9, -1.3, -1.02, -0.98, -0.6, -0.32, -0.28, 0.1, 0.28, 0.32, 0.5, 0.6, 1.5, 2.4, 2.5],
      yFloor: [[-2.5, 0.38], [-2.35, 0.32], [2.4, 0.32], [2.5, 0.38]],
      wSill: [[-2.5, 0.64], [-2.35, 0.78], [2.4, 0.78], [2.5, 0.70]],
      wBelt: [[-2.5, 0.72], [-2.3, 0.85], [-1.3, 0.89], [2.4, 0.89], [2.5, 0.80]],
      yBelt: [[-2.5, 0.70], [-2.3, 0.76], [-1.3, 0.86], [2.5, 0.90]],
      yTop: [[-2.5, 0.78], [-2.35, 0.86], [-1.3, 0.98], [-1.0, 1.02], [-0.3, 1.52], [0.3, 1.52], [0.5, 1.10], [0.6, 1.00], [2.5, 0.98]],
      wTop: [[-2.5, 0.55], [-2.3, 0.70], [-1.0, 0.78], [-0.3, 0.66], [0.3, 0.66], [0.6, 0.84], [2.5, 0.84]],
      cabin: [-1.0, 0.5], windshield: [-1.0, -0.3], rearGlass: [0.3, 0.5],
    } }),
    carTemplate({ name: 'bus', w: 2.50, l: 11.0, wheelR: 0.50, wheelBase: 6.0, lightY: 0.9, colors: [0xe0a020, 0x2c62b5, 0xe8e8e8, 0xc83a2a], weight: 1, rim: 0x6a6a6e, body: {
      zs: [-5.5, -5.4, -5.1, -4.5, -3, -1, 1, 3, 5, 5.3, 5.4, 5.5],
      yFloor: [[-5.5, 0.5], [-5.3, 0.4], [5.3, 0.4], [5.5, 0.5]],
      wSill: [[-5.5, 1.1], [-5.3, 1.2], [5.3, 1.2], [5.5, 1.1]],
      wBelt: [[-5.5, 1.1], [-5.3, 1.25], [5.3, 1.25], [5.5, 1.12]],
      yBelt: [[-5.5, 1.3], [-5.3, 1.5], [5.5, 1.5]],
      yTop: [[-5.5, 1.6], [-5.45, 2.4], [-5.2, 2.95], [5.3, 2.95], [5.5, 2.7]],
      wTop: [[-5.5, 0.9], [-5.3, 1.15], [5.3, 1.15], [5.5, 1.0]],
      cabin: [-5.2, 5.4], windshield: [-5.5, -5.2], rearGlass: [5.35, 5.5],
    } }),
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
