// Helpers de geometria low-poly.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();

/** Preenche o atributo color de uma geometria com uma cor única. */
export function colorize(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.envCut) geo.setAttribute('envCut', new THREE.BufferAttribute(new Float32Array(n), 1));
  return geo;
}

/** Garante que a geometria tenha color/envCut/uv/normal (para merge). */
export function ensureAttributes(geo) {
  if (!geo.attributes.color) colorize(geo, 0xffffff);
  if (!geo.attributes.envCut) geo.setAttribute('envCut', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
  if (!geo.attributes.uv) {
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

/** Junta geometrias (todas indexadas) em uma só. */
export function merge(list) {
  const geos = list.filter(Boolean).map(ensureAttributes);
  if (geos.length === 0) return null;
  if (geos.length === 1) return geos[0];
  return mergeGeometries(geos, false);
}

/**
 * Caixa com o topo recuado (frente/trás) e estreitado: carroceria, cabine, capô.
 * Frente do carro = -z.
 */
export function shapedBox({ w, h, l, frontInset = 0, rearInset = 0, topScale = 1, bottomScale = 1, color = 0xffffff }) {
  const geo = new THREE.BoxGeometry(w, h, l);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0) {
      let nz = z;
      if (z < 0) nz = z + frontInset;
      else nz = z - rearInset;
      pos.setXYZ(i, x * topScale, y, nz);
    } else {
      pos.setXYZ(i, x * bottomScale, y, z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return colorize(geo, color);
}

/** Caixa simples colorida e posicionada. */
export function box(w, h, l, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  return colorize(g, color);
}

/** Cilindro low-poly (eixo Y por padrão). */
export function cylinder(rTop, rBottom, h, segs, color, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segs);
  g.translate(x, y, z);
  return colorize(g, color);
}

/**
 * Roda: pneu escuro + aro claro, eixo em X.
 */
export function wheel(r, width, rimColor = 0xb9bcc2) {
  const tire = new THREE.CylinderGeometry(r, r, width, 10);
  colorize(tire, 0x1b1b1d);
  const rim = new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.02, 8);
  colorize(rim, rimColor);
  const hub = new THREE.CylinderGeometry(r * 0.18, r * 0.18, width + 0.04, 6);
  colorize(hub, 0x333338);
  const g = merge([tire, rim, hub]);
  g.rotateZ(Math.PI / 2);
  return g;
}

/**
 * Ajusta as UVs de uma BoxGeometry para que a textura repita a cada (tileW, tileH) metros
 * nas faces laterais. O topo e a base amostram só um texel (canto da textura).
 */
export function tileBoxUVs(geo, w, h, d, tileW, tileH) {
  const uv = geo.attributes.uv;
  // ordem das faces na BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada)
  const faceDims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faceDims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (fw === 0) { uv.setXY(i, 0.01, 0.01); continue; }
      uv.setXY(i, uv.getX(i) * (fw / tileW), uv.getY(i) * (fh / tileH));
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Mapeia uma face da BoxGeometry para um sub-retângulo [u0,u1]x[v0,v1] de um atlas.
 * As outras faces amostram o texel (uOther, vOther).
 */
export function atlasFaceUVs(geo, face, u0, u1, v0 = 0, v1 = 1, uOther = 0.002, vOther = 0.998) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (f === face) {
        uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      } else {
        uv.setXY(i, uOther, vOther);
      }
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** Plano horizontal (XZ) subdividido, com UV repetida. Centro em (x, y, z). */
export function groundPlane(w, l, repX, repZ, color, x, y, z, segX = 1, segZ = 1) {
  const g = new THREE.PlaneGeometry(w, l, segX, segZ);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repX, uv.getY(i) * repZ);
  g.translate(x, y, z);
  return colorize(g, color);
}

/** Quad vertical virado para +z (frente), com UV em sub-retângulo de um atlas. */
export function signQuad(w, h, u0, u1, v0 = 0, v1 = 1, color = 0xffffff) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return colorize(g, color);
}

/** Árvore de dois quads cruzados (billboard fixo). */
export function crossTree(w, h, color = 0xffffff) {
  const a = new THREE.PlaneGeometry(w, h);
  const b = new THREE.PlaneGeometry(w, h);
  b.rotateY(Math.PI / 2);
  const g = merge([colorize(a, color), colorize(b, color)]);
  g.translate(0, h / 2, 0);
  return g;
}

/** Interpola linearmente uma lista de chaves [[z, v], ...] ordenada por z. */
export function lerpKeys(keys, z) {
  if (z <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (z <= keys[i][0]) {
      const [z0, v0] = keys[i - 1], [z1, v1] = keys[i];
      return z1 === z0 ? v1 : v0 + (v1 - v0) * (z - z0) / (z1 - z0);
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Loft de uma carroceria a partir de seções transversais (estações) ao longo de z.
 * Cada estação: { z, pts: [[x, y, sharp, corBaixo, corCima], ...] } com a metade direita
 * do perfil, de baixo (x=0) até o topo (x=0). Pontos "sharp" viram vincos (normais e cores
 * descontínuas); os demais ficam suaves (Gouraud). Fecha as pontas com tampas planas.
 */
export function loft(stations, capColor, glassColor = null, glassEnvCut = 0.6, vMap = null) {
  const rings = stations.map((st) => {
    const pts = st.pts;
    const ring = [];
    const emit = (p, dir, xs, pi) => {
      const [x, y, sharp, cB, cA] = p;
      if (!sharp) return [{ x: xs * x, y, c: cA, dup: false, pi }];
      return dir > 0
        ? [{ x: xs * x, y, c: cB, dup: true, pi }, { x: xs * x, y, c: cA, dup: false, pi }]
        : [{ x: xs * x, y, c: cA, dup: true, pi }, { x: xs * x, y, c: cB, dup: false, pi }];
    };
    ring.push({ x: 0, y: pts[0][1], c: pts[0][4], dup: false, pi: 0 });
    for (let i = 1; i < pts.length - 1; i++) ring.push(...emit(pts[i], 1, 1, i));
    ring.push({ x: 0, y: pts[pts.length - 1][1], c: pts[pts.length - 1][3], dup: false, pi: pts.length - 1 });
    for (let i = pts.length - 2; i >= 1; i--) ring.push(...emit(pts[i], -1, -1, i));
    return ring;
  });
  const S = rings.length, R = rings[0].length;
  const zFirst = stations[0].z, zLast = stations[S - 1].z;
  const pos = [], col = [], idx = [], cut = [], uvs = [];
  for (let s = 0; s < S; s++) {
    for (let k = 0; k < R; k++) {
      const e = rings[s][k];
      pos.push(e.x, e.y, stations[s].z);
      _c.set(e.c); col.push(_c.r, _c.g, _c.b);
      cut.push(glassColor !== null && e.c === glassColor ? glassEnvCut : 0);
      uvs.push((stations[s].z - zFirst) / (zLast - zFirst), vMap ? vMap[e.pi] : 0.3);
    }
  }
  for (let s = 0; s < S - 1; s++) {
    for (let k = 0; k < R; k++) {
      if (rings[s][k].dup) continue;
      const k2 = (k + 1) % R;
      const a = s * R + k, b = s * R + k2, c = (s + 1) * R + k2, d = (s + 1) * R + k;
      idx.push(a, c, b, a, d, c);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.setAttribute('envCut', new THREE.Float32BufferAttribute(cut, 1));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  body.setIndex(idx);
  body.computeVertexNormals();
  // Garante normais para fora: testa um vértice do topo da estação central.
  const mid = Math.floor(S / 2) * R + Math.floor(R / 2);
  if (body.attributes.normal.getY(mid) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    body.setIndex(idx);
    body.computeVertexNormals();
  }

  const cap = (s, dirZ) => {
    const ring = rings[s], z = stations[s].z;
    const cy = (ring[0].y + ring[Math.floor(R / 2)].y) / 2;
    const p = [0, cy, z], c = [];
    _c.set(capColor); c.push(_c.r, _c.g, _c.b);
    for (let k = 0; k < R; k++) { p.push(ring[k].x, ring[k].y, z); c.push(_c.r, _c.g, _c.b); }
    const ix = [];
    for (let k = 0; k < R; k++) {
      if (ring[k].dup) continue;
      const k2 = (k + 1) % R;
      if (dirZ > 0) ix.push(0, k + 1, k2 + 1); else ix.push(0, k2 + 1, k + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    const cuv = new Float32Array(p.length / 3 * 2);
    for (let k = 0; k < cuv.length; k += 2) { cuv[k] = dirZ > 0 ? 0.97 : 0.03; cuv[k + 1] = 0.3; }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
    g.setIndex(ix);
    g.computeVertexNormals();
    if (Math.sign(g.attributes.normal.getZ(0)) !== Math.sign(dirZ)) {
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      g.setIndex(ix); g.computeVertexNormals();
    }
    return g;
  };
  return merge([body, cap(0, -1), cap(S - 1, 1)]);
}

/**
 * Gera as estações de uma carroceria a partir de curvas-chave (ver loft).
 * spec: { zs, yFloor, wSill, wBelt, yBelt, yTop, wTop, cabin, windshield, rearGlass, paint, glass, under }
 */
export const BODY_ROWS = { floor: 0, sill: 0.06, lower: 0.18, crease: 0.32, belt: 0.42, glassBase: 0.50, roofEdge: 0.72, top: 1.0 };
const BODY_VMAP = [BODY_ROWS.floor, BODY_ROWS.sill, BODY_ROWS.lower, BODY_ROWS.crease, BODY_ROWS.belt, BODY_ROWS.glassBase, BODY_ROWS.roofEdge, BODY_ROWS.top];

export function carBody(spec) {
  const P = spec.paint, G = spec.glass, U = spec.under;
  const inRange = (r, z) => z >= r[0] && z <= r[1];
  const stations = spec.zs.map((z) => {
    const yF = lerpKeys(spec.yFloor, z), wS = lerpKeys(spec.wSill, z), wB = lerpKeys(spec.wBelt, z);
    const yB = lerpKeys(spec.yBelt, z), yT = lerpKeys(spec.yTop, z), wT = lerpKeys(spec.wTop, z);
    const cabin = inRange(spec.cabin, z);
    const yG = cabin ? Math.min(yB + 0.06, yT - 0.05) : Math.max(yB + 0.01, yT - 0.05);
    const wG = cabin ? Math.max(wT + 0.02, wB - 0.06) : Math.min(wB - 0.02, wT + 0.09);
    const topGlass = inRange(spec.windshield, z) || inRange(spec.rearGlass, z);
    const side = cabin ? G : P, top = topGlass ? G : P;
    const yLower = Math.min(yF + 0.2, yB - 0.1);
    return { z, pts: [
      [0, yF, false, U, U],
      [wS, yF, true, U, P],
      [wB, yLower, false, P, P],
      [wB + 0.012, (yLower + yB) / 2, false, P, P], // vinco lateral
      [wB, yB, true, P, P],
      [wG, yG, true, P, side],
      [wT, yT, true, side, top],
      [0, yT, false, top, top],
    ] };
  });
  return loft(stations, P, G, 0.6, BODY_VMAP);
}

/** Cor por vértice com gradiente vertical (base mais escura = oclusão falsa). */
export function gradientColorize(geo, color, bottomMul = 0.7) {
  colorize(geo, color);
  const pos = geo.attributes.position, col = geo.attributes.color;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const span = Math.max(1e-6, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    const m = bottomMul + (1 - bottomMul) * t;
    col.setXYZ(i, col.getX(i) * m, col.getY(i) * m, col.getZ(i) * m);
  }
  col.needsUpdate = true;
  return geo;
}

/** Fixa todas as UVs num ponto (para peças sem textura dentro de um material com mapa). */
export function uvConst(geo, u, v) {
  if (!geo.attributes.uv) ensureAttributes(geo);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  uv.needsUpdate = true;
  return geo;
}

/** Quad (PlaneGeometry) com UV num sub-retângulo do atlas dado em pixels. */
export function atlasQuad(w, h, atlasSize, x0, y0, rw, rh, color = 0xffffff) {
  const u0 = x0 / atlasSize, u1 = (x0 + rw) / atlasSize;
  const v1 = 1 - y0 / atlasSize, v0 = 1 - (y0 + rh) / atlasSize;
  return signQuad(w, h, u0, u1, v0, v1, color);
}

/**
 * Roda com face texturizada (disco) e banda de rodagem lisa, eixo em X.
 * region: [x0, y0, size] da face no atlas (quadrado); treadUV: ponto do atlas com a cor do pneu.
 */
export function discWheel(r, width, atlasSize, region, treadUV, outerSign = 1) {
  const tread = new THREE.CylinderGeometry(r, r, width, 16, 1, true);
  tread.rotateZ(Math.PI / 2);
  const tu = tread.attributes.uv;
  for (let i = 0; i < tu.count; i++) tu.setXY(i, treadUV[0], treadUV[1]);
  colorize(tread, 0xffffff);
  const [x0, y0, size] = region;
  const u0 = x0 / atlasSize, u1 = (x0 + size) / atlasSize, v1 = 1 - y0 / atlasSize, v0 = 1 - (y0 + size) / atlasSize;
  const face = (sign, textured) => {
    const d = new THREE.CircleGeometry(r, 16);
    const uv = d.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      if (textured) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      else uv.setXY(i, treadUV[0], treadUV[1]);
    }
    d.rotateY(sign > 0 ? Math.PI / 2 : -Math.PI / 2);
    d.translate(sign * width / 2, 0, 0);
    return colorize(d, 0xffffff);
  };
  return merge([tread, face(outerSign, true), face(-outerSign, false)]);
}
