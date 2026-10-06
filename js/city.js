// Cidade procedural em "chunks" de 40 m ao longo de -z. Três avenidas temáticas de Pelotas:
// Duque de Caxias (Fragata), Bento Gonçalves (Centro) e Pres. Juscelino Kubitschek (Porto/Areal).
import * as THREE from 'three';
import { box, cylinder, groundPlane, tileBoxUVs, atlasFaceUVs, signQuad, crossTree, merge, colorize, gradientColorize } from './geometry.js';

export const CHUNK = 40;
export const PHASE_CHUNKS = 50; // 2000 m por fase (avenida)
export const PHASE_LEN = PHASE_CHUNKS * CHUNK;
export const AHEAD = 6;

export const ROAD = {
  LANE_W: 3.4,
  CARRIAGE_W: 10.2,
  X0: 2.0,
  X1: 12.2,
  SIDEWALK_X1: 16.2,
  LANE_X: [3.7, 7.1, 10.5],
  ONCOMING_X: [-3.7, -7.1, -10.5],
  PLAYER_MIN_X: 2.95,
  PLAYER_MAX_X: 11.25,
};

export const THEMES = [
  {
    key: 'duque', name: 'AV. DUQUE DE CAXIAS', title2: 'DUQUE DE<br>CAXIAS', sub: 'FRAGATA', sign: 0, start: 'BRIGADA MILITAR',
    floors: [1, 3], facades: ['house', 'house', 'modern'], shops: [0, 1, 0, 4, 5, 6, 7, 1, 2, 3], shopProb: 0.75,
    tree: 'eucalyptus', treeSize: [6, 13], treeEvery: 10, roofTanks: 0.5, sidewalkTrees: false,
    median: 'redPavers', curb: 0xc8c8c0, wallLots: 0, sandLots: 0.08,
    palette: [0xf2e9d8, 0xffffff, 0xe8d7b0, 0xd9e4ea, 0xf0c9a8, 0xcfd8c0, 0xf5f0e0],
  },
  {
    key: 'bento', name: 'AV. BENTO GONÇALVES', title2: 'BENTO<br>GONÇALVES', sub: 'CENTRO', sign: 1, start: 'COLÉGIO PELOTENSE',
    floors: [2, 7], facades: ['modern', 'balcony', 'house', 'colonial'], shops: [2, 4, 8, 9, 10, 3, 0, 5, 2, 10], shopProb: 0.55,
    tree: 'roundTree', treeSize: [8, 10], treeEvery: 13, roofTanks: 0.3, sidewalkTrees: true,
    median: 'grass', curb: 0xc8c8c0, wallLots: 0.35, sandLots: 0,
    palette: [0xf4c6c6, 0xf6e7a1, 0xbfe0f2, 0xcfe8c9, 0xffffff, 0xe9d5f2, 0xf0d8b0],
  },
  {
    key: 'jk', name: 'AV. PRES. JUSCELINO KUBITSCHEK', title2: 'JUSCELINO<br>KUBITSCHEK', sub: 'PORTO · AREAL', sign: 2, start: 'SUPERMERCADO BIG',
    floors: [1, 2], facades: ['warehouse', 'warehouse', 'house'], shops: [11, 12, 13, 14, 15, 7, 11, 13, 1, 12], shopProb: 0.5,
    tree: 'palm', treeSize: [4.5, 7], treeEvery: 24, roofTanks: 0.2, sidewalkTrees: false,
    median: 'grass', curb: 0xececec, wallLots: 0, sandLots: 0.5,
    palette: [0xb8bcc0, 0x9aa3a8, 0xc9b9a0, 0x8a9298, 0xd8d8d8, 0xa88a6a],
  },
];

const AWNINGS = [0xc0392b, 0x1f6fb2, 0x2e8b57, 0xd68a1a, 0x7a3fa0, 0x1f8a9a];
const GLASS = 0x3a5a7a;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _c = new THREE.Color();
function darker(hex, f = 0.55) { _c.set(hex).multiplyScalar(f); return _c.getHex(); }

export function themeOfChunk(i) { return THEMES[Math.min(THEMES.length - 1, Math.floor(Math.max(0, i) / PHASE_CHUNKS))]; }
export function phaseOfChunk(i) { return Math.min(THEMES.length - 1, Math.floor(Math.max(0, i) / PHASE_CHUNKS)); }
export function chunkIndexAt(z) { return Math.max(0, Math.floor(-z / CHUNK)); }
export function themeAt(z) { return themeOfChunk(chunkIndexAt(z)); }

export class City {
  constructor(scene, M, T) {
    this.scene = scene;
    this.M = M;
    this.T = T;
    this.chunks = new Map();
  }

  reset() {
    for (const [i, g] of this.chunks) this.dispose(g);
    this.chunks.clear();
  }

  dispose(group) {
    this.scene.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  update(playerZ) {
    const idx = chunkIndexAt(playerZ);
    const want = new Set();
    for (let i = idx - 1; i <= idx + AHEAD; i++) if (i >= 0) want.add(i);
    for (const [i, g] of this.chunks) if (!want.has(i)) { this.dispose(g); this.chunks.delete(i); }
    for (const i of want) if (!this.chunks.has(i)) {
      const g = this.build(i);
      this.chunks.set(i, g);
      this.scene.add(g);
    }
  }

  materialFor(key) {
    const m = this.M[key];
    if (!m) throw new Error('material desconhecido: ' + key);
    return m;
  }

  build(i) {
    const rng = mulberry32(i * 7919 + 1013);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const theme = themeOfChunk(i);
    const local = i - phaseOfChunk(i) * PHASE_CHUNKS;
    const zA = -i * CHUNK, zB = zA - CHUNK, zc = zA - CHUNK / 2;
    const isX = local % 8 === 4;
    const parts = {};
    const add = (key, geo) => { (parts[key] ||= []).push(geo); };
    const ctx = { rng, pick, theme, local, zA, zB, zc, isX, add, i };

    // --- Pista: duas pistas de 3 faixas, linhas de borda.
    // A pista do jogador é mais subdividida para o mapeamento afim não deformar tanto perto da câmera.
    add('asphalt', groundPlane(ROAD.CARRIAGE_W, CHUNK, 3, CHUNK / 8, 0xffffff, 7.1, 0, zc, 6, 20));
    add('asphalt', groundPlane(ROAD.CARRIAGE_W, CHUNK, 3, CHUNK / 8, 0xffffff, -7.1, 0, zc, 3, 10));
    for (const x of [2.1, 12.1, -2.1, -12.1]) add('props', groundPlane(0.14, CHUNK, 1, 1, 0xf0f0e8, x, 0.006, zc, 1, 5));

    // --- Canteiro central e calçadas (interrompidos nos cruzamentos).
    const ranges = isX ? [[zA, zA - 13], [zB + 13, zB]] : [[zA, zB]];
    for (const [z0, z1] of ranges) {
      const len = z0 - z1, zm = (z0 + z1) / 2;
      const segs = Math.max(1, Math.round(len / 8));
      add('props', box(4.0, 0.16, len, theme.curb, 0, 0.08, zm));
      add(theme.median, groundPlane(3.4, len, 1, len / 4, 0xffffff, 0, 0.165, zm, 1, segs));
      for (const side of [1, -1]) {
        add('props', box(4.0, 0.15, len, theme.curb === 0xececec ? 0xe4e4e0 : 0xbdbdb5, side * 14.2, 0.075, zm));
        add('sidewalk', groundPlane(3.9, len, 2, len / 2, 0xffffff, side * 14.2, 0.155, zm, 1, segs * 2));
      }
    }

    if (isX) this.intersection(ctx);
    else this.medianProps(ctx);

    // --- Prédios e pontos de referência.
    for (const side of [1, -1]) {
      if (this.landmark(ctx, side)) continue;
      for (const [z0, z1] of ranges) this.fillBuildings(ctx, side, z0, z1);
      if (theme.sidewalkTrees && !isX) {
        for (let z = zA - 7; z > zB; z -= 14) {
          const t = crossTree(3.5, 4.5); t.translate(side * 13.0, 0.15, z); add('roundTree', t);
        }
      }
    }

    // --- Ponto de ônibus, outdoor, pórtico de largada.
    if (!isX && local % 5 === 1) this.busStop(ctx, 1);
    if (!isX && local % 6 === 2) this.billboard(ctx, rng() < 0.5 ? 1 : -1, Math.floor(rng() * this.T.billboardGeneric));
    if (local === 2) this.gantry(ctx, 11, 0xc8241c);
    if (local === PHASE_CHUNKS - 3) this.gantry(ctx, 12, 0x111111);

    // --- Merge por material.
    const group = new THREE.Group();
    for (const key of Object.keys(parts)) {
      const geo = merge(parts[key]);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.materialFor(key));
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    return group;
  }

  // Postes e árvores no canteiro.
  medianProps({ add, theme, zA, zB, rng }) {
    for (let z = zA - 10; z > zB; z -= 20) this.lampPost(add, z);
    const [tw, th] = theme.treeSize;
    for (let z = zA - 5; z > zB; z -= theme.treeEvery) {
      const t = crossTree(tw * (0.85 + rng() * 0.3), th * (0.85 + rng() * 0.3));
      t.translate((rng() - 0.5) * 1.2, 0.15, z);
      add(theme.tree, t);
    }
  }

  lampPost(add, z) {
    add('props', cylinder(0.08, 0.11, 8, 6, 0xb8bcc0, 0, 4, z));
    add('props', box(4.6, 0.12, 0.12, 0xb8bcc0, 0, 7.9, z));
    add('props', box(0.55, 0.16, 0.32, 0xf4f4e8, -2.2, 7.8, z));
    add('props', box(0.55, 0.16, 0.32, 0xf4f4e8, 2.2, 7.8, z));
  }

  intersection(ctx) {
    const { add, zc, rng, theme, local } = ctx;
    const canalLeft = theme.key === 'jk' && local >= 8 && local <= 32;
    add('asphaltPlain', groundPlane(45, 14, 6, 2, 0xffffff, 22.5, 0.004, zc, 3, 1));
    add('asphaltPlain', groundPlane(canalLeft ? 32 : 45, 14, 6, 2, 0xffffff, canalLeft ? -16 : -22.5, 0.004, zc, 3, 1));
    for (const x of [7.1, -7.1]) for (const z of [zc + 8.4, zc - 8.4]) add('zebra', groundPlane(ROAD.CARRIAGE_W, 2.4, 3, 1, 0xffffff, x, 0.009, z, 3, 1));
    this.trafficLight(add, 12.9, zc + 7.6, -1, rng);
    this.trafficLight(add, -12.9, zc - 7.6, 1, rng);
    this.streetSign(add, 13.3, zc + 7.2, theme.sign);
    this.streetSign(add, -13.3, zc - 7.2, theme.sign);
    if (rng() < 0.7) this.directionSign(add, 0, zc + 9.5, Math.floor(rng() * 4));
    // Lojas de esquina viradas para a transversal ficam implícitas; postes nos cantos.
    for (const sx of [1, -1]) for (const sz of [1, -1]) add('props', cylinder(0.06, 0.06, 3.5, 5, 0x888a8e, sx * 13.0, 1.75, zc + sz * 7.0));
  }

  trafficLight(add, x, z, dir, rng) {
    add('props', cylinder(0.09, 0.11, 5.2, 6, 0xb0b4b8, x, 2.6, z));
    add('props', box(4.6, 0.14, 0.14, 0xb0b4b8, x + dir * 2.3, 5.1, z));
    const hx = x + dir * 4.2;
    add('props', box(0.42, 1.10, 0.36, 0x222426, hx, 4.6, z));
    const on = Math.floor(rng() * 3);
    const cols = [0xff2a1a, 0xffc020, 0x20e040];
    for (let k = 0; k < 3; k++) add('props', box(0.26, 0.26, 0.08, on === k ? cols[k] : 0x2a2a2a, hx, 4.95 - k * 0.35, z + 0.20));
  }

  streetSign(add, x, z, idx) {
    add('props', cylinder(0.05, 0.05, 2.8, 5, 0x888a8e, x, 1.4, z));
    const q = signQuad(1.9, 0.48, idx / this.T.signCount, (idx + 1) / this.T.signCount);
    q.translate(x, 2.95, z);
    add('signs', q);
  }

  directionSign(add, x, z, idx) {
    add('props', cylinder(0.05, 0.05, 2.6, 5, 0x888a8e, x, 1.3 + 0.16, z));
    const q = signQuad(1.6, 0.8, idx / 4, (idx + 1) / 4);
    q.translate(x, 2.9, z);
    add('directionSigns', q);
  }

  busStop({ add, zA }, side) {
    const x = side * 15.0, z = zA - 12;
    add('props', box(0.08, 1.3, 3.6, 0x8ab0d8, x + side * 0.7, 1.55, z));
    add('props', box(1.6, 0.1, 3.8, 0x2f4f8a, x, 2.55, z));
    for (const dz of [-1.7, 1.7]) add('props', cylinder(0.05, 0.05, 2.5, 5, 0x555, x - side * 0.6, 1.25 + 0.15, z + dz));
    add('props', box(0.45, 0.08, 2.4, 0x6a4a2a, x + side * 0.3, 0.6, z));
  }

  billboard({ add, zA }, side, idx, x = side * 15.4, y = 6.6, w = 6, h = 3, z = zA - 20) {
    add('props', cylinder(0.12, 0.14, y - h / 2, 6, 0x6a6a6e, x, (y - h / 2) / 2 + 0.15, z));
    const q = signQuad(w, h, idx / this.T.billboardCount, (idx + 1) / this.T.billboardCount);
    q.translate(x, y, z);
    add('billboards', q);
    add('props', box(w + 0.2, h + 0.2, 0.15, 0x3a3a3e, x, y, z - 0.1));
  }

  gantry({ add, zA }, idx, beamColor) {
    const z = zA - 10;
    for (const x of [2.6, 11.7]) add('props', box(0.6, 9.5, 0.6, 0xe8e8e8, x, 4.75, z));
    add('props', box(10.0, 0.8, 0.7, beamColor, 7.15, 9.4, z));
    const q = signQuad(9.0, 3.6, idx / this.T.billboardCount, (idx + 1) / this.T.billboardCount);
    q.translate(7.15, 7.0, z + 0.1);
    add('billboards', q);
    add('props', box(9.2, 3.8, 0.2, 0x3a3a3e, 7.15, 7.0, z - 0.1));
  }

  fillBuildings(ctx, side, z0, z1) {
    const { add, theme, rng, pick } = ctx;
    const x0 = ROAD.SIDEWALK_X1;
    const shopCount = this.T.shopCount;
    let z = z0;
    while (z - z1 > 4) {
      let bw = 7 + rng() * 8;
      if (z - bw < z1 + 4) bw = z - z1;
      const bd = 10 + rng() * 8;
      const floors = theme.floors[0] + Math.floor(rng() * (theme.floors[1] - theme.floors[0] + 1));
      const tint = pick(theme.palette);
      const facadeName = pick(theme.facades);
      const zc = z - bw / 2;
      const xc = side * (x0 + bd / 2);
      // Lote vazio de areia (JK) ou muro pichado com prédio recuado (Bento).
      if (theme.sandLots && rng() < theme.sandLots) {
        add('sand', groundPlane(22, bw, 3, bw / 6, 0xffffff, side * (x0 + 11), 0.02, zc, 1, 1));
        if (rng() < 0.5) { const t = crossTree(4 + rng() * 2, 5 + rng() * 3); t.translate(side * (x0 + 4 + rng() * 10), 0.02, zc + (rng() - 0.5) * bw * 0.6); add('palm', t); }
        for (let k = 0; k < 4; k++) add('props', box(0.12, 1.2, 0.12, 0xe8e8e8, side * (x0 + 0.3), 0.75, z - (k + 0.5) * bw / 4));
        z -= bw + 0.4;
        continue;
      }
      if (theme.wallLots && rng() < theme.wallLots) {
        const wallG = new THREE.BoxGeometry(0.3, 2.2, bw);
        tileBoxUVs(wallG, 0.3, 2.2, bw, 4, 2.2);
        wallG.translate(side * (x0 + 0.15), 1.1 + 0.15, zc);
        add('graffiti', colorize(wallG, 0xffffff));
        add('grass', groundPlane(9, bw, 2, bw / 4, 0xffffff, side * (x0 + 5), 0.02, zc, 1, 1));
        const h = (3 + Math.floor(rng() * 5)) * 3.2;
        const g = new THREE.BoxGeometry(bd, h, bw * 0.8);
        tileBoxUVs(g, bd, h, bw * 0.8, 3.5, 3.2);
        g.translate(side * (x0 + 10 + bd / 2), h / 2, zc);
        add('facade_' + pick(['modern', 'balcony']), gradientColorize(g, pick(theme.palette), 0.66));
        add('props', box(bd + 0.2, 0.35, bw * 0.8 + 0.2, 0x6a645c, side * (x0 + 10 + bd / 2), h + 0.17, zc));
        z -= bw + 0.4;
        continue;
      }
      const commercial = rng() < theme.shopProb;
      let y = 0;
      if (commercial) {
        const groundH = 3.8;
        const units = Math.max(1, Math.round(bw / 6));
        const uw = bw / units;
        for (let u = 0; u < units; u++) {
          const idx = pick(theme.shops);
          const g = new THREE.BoxGeometry(bd, groundH, uw);
          atlasFaceUVs(g, side > 0 ? 1 : 0, idx / shopCount, (idx + 1) / shopCount, 0, 1, (idx + 0.02) / shopCount, 0.985);
          g.translate(xc, groundH / 2, z - uw * (u + 0.5));
          add('shops', gradientColorize(g, 0xffffff, 0.78));
          if (rng() < 0.6) add('props', box(1.3, 0.08, uw * 0.85, pick(AWNINGS), side * (x0 - 0.65), 3.05, z - uw * (u + 0.5)));
        }
        y = groundH;
      }
      const upper = commercial ? floors - 1 : floors;
      if (upper > 0) {
        const h = upper * 3.2;
        const g = new THREE.BoxGeometry(bd, h, bw);
        tileBoxUVs(g, bd, h, bw, 3.5, 3.2);
        g.translate(xc, y + h / 2, zc);
        add('facade_' + facadeName, gradientColorize(g, tint, 0.66));
        y += h;
      }
      add('props', box(bd + 0.2, 0.35, bw + 0.2, darker(tint), xc, y + 0.17, zc));
      if (rng() < theme.roofTanks) add('props', cylinder(0.65, 0.55, 0.9, 7, 0x3a6ea8, xc + (rng() - 0.5) * bd * 0.5, y + 0.8, zc + (rng() - 0.5) * bw * 0.5));
      z -= bw + 0.4;
    }
  }

  // Pontos de referência por avenida. Retorna true se ocupou esse lado do chunk.
  landmark(ctx, side) {
    const { theme, local } = ctx;
    if (local <= 2) {
      if (theme.key === 'duque' && side < 0) { this.brigada(ctx); return true; }
      if (theme.key === 'bento' && side > 0) { this.pelotense(ctx); return true; }
      if (theme.key === 'jk' && side > 0) { this.big(ctx); return true; }
    }
    if (theme.key === 'duque') {
      if (side > 0 && local === 13) { this.supermarketLot(ctx); return true; }
      if (side > 0 && local === 14) { this.supermarketStore(ctx); return true; }
      if (side < 0 && local === 26) { this.dealership(ctx); return true; }
    }
    if (theme.key === 'bento') {
      if (side < 0 && local >= 9 && local <= 11) { this.park(ctx); return true; }
      if (side > 0 && local >= 24 && local <= 26) { this.stadium(ctx); return true; }
    }
    if (theme.key === 'jk') {
      if (side < 0 && local >= 8 && local <= 32) { this.canal(ctx); return true; }
      if (side > 0 && (local === 15 || local === 29)) { this.gasStation(ctx); return true; }
      if (side > 0 && local === 21) { this.silos(ctx); return true; }
    }
    return false;
  }

  // Ponto de partida da Duque: sede da Brigada Militar no Fragata (lado esquerdo).
  brigada({ add, zA, zB, zc, local, rng }) {
    const x0 = ROAD.SIDEWALK_X1;
    if (local === 1) {
      const xc = -(x0 + 8);
      const g = new THREE.BoxGeometry(16, 4.6, 36);
      tileBoxUVs(g, 16, 4.6, 36, 4.5, 4.6);
      g.translate(xc, 2.3, zc);
      add('facade_house', gradientColorize(g, 0xf0ead8, 0.75));
      add('props', box(16.4, 0.7, 36.4, 0x8a7a5a, xc, 4.75, zc)); // platibanda cáqui
      add('props', box(16.6, 0.3, 36.6, 0x6a5a40, xc, 5.2, zc));
      // pórtico central com colunas
      add('props', box(3.5, 0.4, 10, 0xf0ead8, -(x0 + 1.5), 4.2, zc));
      for (const dz of [-4, 0, 4]) add('props', box(0.5, 4.2, 0.5, 0xe8e2d0, -(x0 - 0.1), 2.1 + 0.15, zc + dz));
      add('props', box(0.3, 2.6, 3.2, 0x243030, -(x0 + 0.1), 1.3 + 0.15, zc)); // porta de vidro
      const q = signQuad(14, 2.0, 0, 0.5);
      q.rotateY(Math.PI / 2); q.translate(-(x0 - 0.02), 3.6, zc + 8);
      add('landmarkSigns', q);
      // mastro com bandeira
      add('props', cylinder(0.06, 0.08, 9, 5, 0xd8d8d8, -(x0 - 1.0), 4.5 + 0.15, zc + 14));
      add('props', box(0.05, 0.9, 1.4, 0x1f8a3a, -(x0 - 1.0), 8.4, zc + 14.7));
      add('props', box(0.07, 0.45, 0.7, 0xf2c230, -(x0 - 1.0), 8.4, zc + 14.7));
      add('props', box(0.08, 0.2, 0.3, 0x1f4fa0, -(x0 - 1.0), 8.4, zc + 14.7));
    } else {
      // pátio cercado com viaturas e grama
      add('asphaltPlain', groundPlane(20, CHUNK - 2, 3, 6, 0xffffff, -(x0 + 10), 0.01, zc, 2, 2));
      for (let z = zA - 2; z > zB; z -= 4) add('props', box(0.1, 1.6, 0.1, 0x8a8a8e, -(x0 + 0.2), 0.95, z));
      add('props', box(0.04, 0.6, CHUNK - 2, 0x8a8a8e, -(x0 + 0.2), 1.5, zc));
      if (local === 0) { const t = crossTree(6, 8); t.translate(-(x0 + 14), 0.02, zc + 8); add('roundTree', t); }
      if (local === 2) add('props', box(12, 3.2, 14, 0xe8e2d0, -(x0 + 12), 1.6, zc - 6));
    }
  }

  // Ponto de partida da Bento: auditório do Colégio Pelotense (lado direito).
  pelotense({ add, zA, zB, zc, local, rng }) {
    const x0 = ROAD.SIDEWALK_X1;
    if (local === 1) {
      const xc = x0 + 9;
      const g = new THREE.BoxGeometry(18, 6.2, 38);
      tileBoxUVs(g, 18, 6.2, 38, 4.2, 6.2);
      g.translate(xc, 3.1, zc);
      add('facade_auditorium', gradientColorize(g, 0xffffff, 0.8));
      add('props', box(18.4, 0.5, 38.4, 0x7a8a6a, xc, 6.45, zc));
      add('props', box(2.2, 0.35, 12, 0x9fb08c, x0 + 1.1, 5.0, zc)); // marquise da entrada
      add('props', box(0.3, 3.4, 5, 0x3a4a44, x0 + 0.15, 1.7 + 0.15, zc)); // portão gradeado
      const q = signQuad(16, 2.2, 0.5, 1.0);
      q.rotateY(-Math.PI / 2); q.translate(x0 - 0.02, 5.6, zc + 8);
      add('landmarkSigns', q);
      add('asphaltPlain', groundPlane(3.6, 38, 1, 5, 0xffffff, x0 + 1.8 - 1.8, 0.16, zc, 1, 1));
    } else {
      // blocos de aulas verdes atrás de um muro baixo com grama
      add('props', box(0.3, 1.4, CHUNK - 2, 0x9fb08c, x0 + 0.15, 0.7 + 0.15, zc));
      add('grass', groundPlane(8, CHUNK - 2, 2, 5, 0xffffff, x0 + 4.3, 0.02, zc, 1, 1));
      const h = 7.5;
      const g = new THREE.BoxGeometry(16, h, 28);
      tileBoxUVs(g, 16, h, 28, 3.5, 3.6);
      g.translate(x0 + 16, h / 2, zc + (local === 0 ? 2 : -2));
      add('facade_modern', gradientColorize(g, 0xd8e0c8, 0.7));
      add('props', box(16.2, 0.35, 28.2, 0x6a645c, x0 + 16, h + 0.17, zc + (local === 0 ? 2 : -2)));
      for (let k = 0; k < 3; k++) { const t = crossTree(5 + rng() * 2, 6 + rng() * 2); t.translate(x0 + 3 + rng() * 4, 0.02, zA - 5 - k * 13); add('roundTree', t); }
    }
  }

  // Ponto de partida da JK: supermercado BIG (lado direito), torre, outdoor e palmeiras.
  big({ add, zA, zB, zc, local, rng }) {
    const x0 = ROAD.SIDEWALK_X1;
    if (local === 2) {
      // Loja: caixa bege com faixa azul-marinho e letras vermelhas na frente e na lateral.
      const xc = x0 + 10 + 25;
      add('asphaltPlain', groundPlane(20, CHUNK, 3, 6, 0xffffff, x0 + 10, 0.01, zc, 2, 2));
      add('props', box(50, 9, 56, 0xe8e2d0, xc, 4.5, zc - 2));
      add('props', box(50.4, 4.6, 56.4, 0x17245a, xc, 7.2, zc - 2)); // faixa azul-marinho
      add('props', box(50.6, 0.6, 56.6, 0x0f1840, xc, 9.5, zc - 2));
      const front = signQuad(20, 5.2, 0, 1);
      front.translate(x0 + 10 + 14, 7.0, zA + 0.25); // face frontal, voltada para o jogador
      add('big', front);
      const side = signQuad(28, 6.8, 0, 1);
      side.rotateY(-Math.PI / 2); side.translate(x0 + 10 - 0.3, 6.6, zc - 4);
      add('big', side);
      add('props', box(0.4, 4.5, 16, 0x2a3a4a, x0 + 10 - 0.2, 2.25, zc - 4)); // vitrines da entrada
      add('props', box(6, 0.5, 20, 0xe8e2d0, x0 + 7, 4.6, zc - 4)); // marquise
      // torre/silo com a marca
      add('props', cylinder(2.2, 2.2, 24, 10, 0x2a2a30, x0 + 44, 12, zA - 6));
      add('props', cylinder(2.4, 2.4, 1.2, 10, 0x8a8a90, x0 + 44, 24.3, zA - 6));
      add('props', box(1.2, 10, 1.2, 0xd22222, x0 + 41.7, 14, zA - 6));
    } else {
      // estacionamento com palmeiras, cerca branca e outdoor alto
      add('asphaltPlain', groundPlane(36, CHUNK, 5, 6, 0xffffff, x0 + 18, 0.01, zc, 2, 2));
      for (let k = 0; k < 5; k++) add('props', groundPlane(0.12, 5, 1, 1, 0xf0f0e8, x0 + 6 + k * 2.8, 0.02, zc + 10));
      for (let z = zA - 2; z > zB; z -= 5) add('props', box(0.14, 1.3, 0.14, 0xf0f0f0, x0 + 0.3, 0.8, z));
      add('props', box(0.05, 0.08, CHUNK - 2, 0xf0f0f0, x0 + 0.3, 1.4, zc));
      for (let k = 0; k < 3; k++) { const t = crossTree(4.5 + rng(), 6 + rng() * 2); t.translate(x0 + 2 + rng() * 3, 0.02, zA - 6 - k * 12); add('palm', t); }
      if (local === 0) this.billboard({ add, zA }, 1, 8, x0 + 6, 13, 9, 4.5, zA - 20);
      if (local === 1) add('props', box(10, 3.5, 12, 0xd8d0c0, x0 + 30, 1.75, zc)); // depósito
    }
  }

  supermarketLot({ add, zc, zA, rng }) {
    add('asphaltPlain', groundPlane(34, CHUNK, 5, 6, 0xffffff, 16.2 + 17, 0.01, zc, 2, 2));
    for (let k = 0; k < 6; k++) add('props', groundPlane(0.12, 5, 1, 1, 0xf0f0e8, 20 + k * 2.8, 0.02, zc + 10));
    add('props', box(0.7, 13, 0.7, 0xc8c8c0, 19, 6.5, zA - 20));
    this.billboard({ add, zA }, 1, 8, 19, 14.5, 7, 3.5, zA - 20);
    add('props', box(34.4, 0.6, 0.4, 0x9a9a92, 16.2 + 17, 0.45, zA - 39.8));
  }

  supermarketStore({ add, zc }) {
    const x = 16.2 + 16;
    add('props', box(32, 7, 38, 0xf4f4f0, x, 3.5, zc));
    add('props', box(32.2, 1.3, 38.2, 0xc8241c, x, 6.2, zc));
    add('props', box(0.5, 4.2, 14, GLASS, 16.3, 2.1, zc));
    add('props', box(6, 0.4, 16, 0xe0e0dc, 16.2 + 3, 4.5, zc)); // marquise
    for (const dz of [-7, 7]) add('props', box(0.4, 4.3, 0.4, 0xe0e0dc, 16.4, 2.15, zc + dz));
    const q = signQuad(14, 3.2, 8 / this.T.billboardCount, 9 / this.T.billboardCount);
    q.rotateY(-Math.PI / 2); q.translate(16.15, 5.4, zc + 10);
    add('billboards', q);
  }

  dealership({ add, zc, zA }) {
    const x = -(16.2 + 8);
    add('props', box(16, 5, 36, GLASS, x, 2.5, zc));
    add('props', box(17, 0.6, 37, 0xf0f0f0, x, 5.3, zc));
    for (const dz of [-16, -8, 0, 8, 16]) add('props', box(0.4, 5, 0.4, 0xf0f0f0, -16.4, 2.5, zc + dz));
    const q = signQuad(12, 2.6, 10 / this.T.billboardCount, 11 / this.T.billboardCount);
    q.rotateY(Math.PI / 2); q.translate(-16.1, 3.4, zc);
    add('billboards', q);
    this.billboard({ add, zA }, -1, 6, -22, 9.5, 10, 5, zc);
  }

  park({ add, zA, zB, zc, local, rng }) {
    add('grass', groundPlane(60, CHUNK, 15, 10, 0xffffff, -(16.2 + 30), 0.17, zc, 2, 2));
    const fence = (z0, z1) => {
      const len = z0 - z1;
      const g = new THREE.PlaneGeometry(len, 1.7, 1, 1);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len / 2, uv.getY(k));
      g.rotateY(Math.PI / 2);
      g.translate(-16.45, 0.15 + 0.85, (z0 + z1) / 2);
      add('fence', colorize(g, 0xffffff));
    };
    if (local === 10) { fence(zA, zA - 14); fence(zA - 26, zB); this.streetSign(add, -13.6, zA - 15, 3); for (const dz of [-14, -26]) add('props', box(0.5, 2.6, 0.5, 0x8a7a5a, -16.45, 1.3, zA + dz)); }
    else fence(zA, zB);
    for (let k = 0; k < 9; k++) {
      const t = crossTree(5 + rng() * 2, 6 + rng() * 2.5);
      t.translate(-(19 + rng() * 40), 0.17, zA - 2 - rng() * 36);
      add('roundTree', t);
    }
    for (let z = zA - 10; z > zB; z -= 20) add('props', cylinder(0.06, 0.08, 4, 5, 0xb8bcc0, -19, 2.15, z));
    if (local === 11) { // coreto
      const x = -36;
      add('props', cylinder(3.2, 3.4, 0.5, 8, 0xd8d0c0, x, 0.42, zc));
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; add('props', box(0.25, 3, 0.25, 0xf0f0f0, x + Math.cos(a) * 2.7, 2.1, zc + Math.sin(a) * 2.7)); }
      add('props', cylinder(0.3, 3.6, 1.8, 8, 0x8a3a2a, x, 4.5, zc));
    }
  }

  stadium({ add, zA, zB, zc, local }) {
    const x1 = 16.2 + 6;
    add('props', box(0.4, 3, CHUNK, 0x9a9a92, 16.4, 1.65, zc));
    add('props', box(28, 9, CHUNK, 0xd8d4c8, x1 + 14, 4.5, zc));
    add('props', box(28.2, 1.4, CHUNK + 0.1, 0xf2c230, x1 + 14, 9.7, zc));
    add('props', box(28.2, 0.9, CHUNK + 0.1, 0x1f4fa0, x1 + 14, 10.85, zc));
    add('props', box(18, 7, CHUNK, 0xcfcbc0, x1 + 19, 14.8, zc));
    add('props', box(18.2, 0.8, CHUNK + 0.1, 0x1f4fa0, x1 + 19, 18.7, zc));
    const tower = (z) => {
      add('props', box(1.2, 36, 1.2, 0x8a8a8e, x1 + 27, 18, z));
      add('props', box(4.5, 2.6, 0.6, 0xf8f8f0, x1 + 27, 36.5, z + 0.5));
    };
    if (local === 24) tower(zA - 3);
    if (local === 26) tower(zB + 3);
    if (local === 25) {
      const q = signQuad(12, 2.6, 4 / this.T.signCount, 5 / this.T.signCount);
      q.rotateY(-Math.PI / 2); q.translate(16.1, 5.2, zc);
      add('signs', q);
      add('props', box(0.3, 3.0, 12.4, 0x1f4fa0, 16.3, 5.2, zc));
      // portão de acesso
      add('props', box(0.6, 6, 10, 0xf2c230, 16.6, 3, zc - 14));
    }
  }

  canal({ add, zA, zB, zc, local, rng }) {
    add('props', box(0.5, 0.9, CHUNK, 0xb0b0a8, -16.45, 0.45 + 0.15, zc));
    for (let z = zA - 5; z > zB; z -= 10) add('props', cylinder(0.15, 0.15, 1.1, 6, 0x333336, -16.45, 1.6, z));
    add('props', box(6, 1.0, CHUNK, 0x8a8a82, -(16.7 + 3), -0.5, zc)); // talude
    add('water', groundPlane(140, CHUNK, 14, 4, 0xffffff, -(16.7 + 6 + 70), -0.9, zc, 2, 2));
    // margem oposta: galpões do porto
    add('props', box(22, 7 + rng() * 4, 30, 0x8a9298, -98, 3.5, zc + (rng() - 0.5) * 6));
    if (local >= 18 && local <= 20) {
      const x = -92;
      for (const dz of [-9, 9]) add('props', box(2.2, 30, 2.2, 0xc84a1a, x, 14, zc + dz));
      add('props', box(2.2, 2.2, 20, 0xc84a1a, x, 29, zc));
      add('props', box(32, 1.8, 2.2, 0xc84a1a, x + 15, 28.5, zc));
      add('props', box(3, 3, 3, 0x3a3a3e, x + 28, 26, zc));
    }
    if (local === 12) this.streetSign(add, -13.6, zA - 20, 5);
    if (local === 24) this.directionSign(add, -13.6, zA - 20, 2);
  }

  gasStation({ add, zA, zc }) {
    const x = 16.2 + 9;
    add('asphaltPlain', groundPlane(32, CHUNK, 5, 6, 0xffffff, 16.2 + 16, 0.01, zc, 2, 2));
    for (const dx of [-5, 5]) for (const dz of [-9, 9]) add('props', box(0.6, 5.2, 0.6, 0xe8e8e8, x + dx, 2.6, zc + dz));
    add('props', box(15, 0.7, 26, 0xf0f0f0, x, 5.55, zc));
    add('props', box(15.2, 0.5, 26.2, 0xc8241c, x, 6.0, zc));
    for (const dz of [-5, 0, 5]) { add('props', box(0.9, 1.6, 0.6, 0xe8e8e8, x, 0.8, zc + dz)); add('props', box(0.9, 0.3, 0.62, 0xc8241c, x, 1.5, zc + dz)); }
    add('props', box(12, 4, 14, 0xf4f4f0, 16.2 + 25, 2, zc));
    add('props', box(12.2, 0.4, 14.2, 0x6a645c, 16.2 + 25, 4.2, zc));
    this.billboard({ add, zA }, 1, 9, 16.2 + 2.5, 10, 5, 2.5, zA - 4);
  }

  silos({ add, zA, zc }) {
    add('asphaltPlain', groundPlane(30, CHUNK, 5, 6, 0xffffff, 16.2 + 15, 0.01, zc, 2, 2));
    for (const dz of [-13, 0, 13]) {
      add('props', cylinder(4, 4, 18, 10, 0xd0d0c8, 16.2 + 12, 9, zc + dz));
      add('props', cylinder(0.6, 4.2, 3, 10, 0x9a9a92, 16.2 + 12, 19.5, zc + dz));
    }
    add('props', box(1.2, 24, 1.2, 0x8a8a8e, 16.2 + 20, 12, zc));
    add('props', box(10, 1.2, 1.2, 0x8a8a8e, 16.2 + 16, 23, zc));
  }
}
