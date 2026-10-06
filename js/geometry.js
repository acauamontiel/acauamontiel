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
  return geo;
}

/** Garante que a geometria tenha color/uv/normal (para merge). */
export function ensureAttributes(geo) {
  if (!geo.attributes.color) colorize(geo, 0xffffff);
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
