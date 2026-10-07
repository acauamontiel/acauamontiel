// Veículos do tráfego vindos de modelos 3D (assets/*.glb gerados por tools/rage2glb/export_car.py).
// O GLB traz materiais nomeados: "paint" (cor do carro), "paint2" (baú da moto), "glass|...", ou "textura|r,g,b,a".
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ps1Material } from './ps1.js';

function pixelate(tex) {
  if (!tex) return null;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function envCutAttribute(geo, value) {
  if (geo.attributes.envCut) return;
  geo.setAttribute('envCut', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(value), 1));
}

// Cores-chave de luzes do GTA SA; a posição decide farol (frente) ou lanterna (trás).
const LIGHT_KEYS = new Set(['255,175,0', '185,255,0', '0,255,200', '255,60,0', '255,255,0', '0,255,255', '255,0,255']);

function fixedMaterial(src, mesh, length) {
  const name = src.name || '';
  const [tex, rgba] = name.split('|');
  const col = (rgba || '255,255,255,255').split(',').map(Number);
  const map = pixelate(src.map);
  const bb = mesh.geometry.boundingBox;
  const zc = (bb.min.z + bb.max.z) / 2;
  if (!tex && LIGHT_KEYS.has(col.slice(0, 3).join(','))) {
    // o exportador separa as luzes em frente/trás; piscas (0,255,200 e 255,60,0) ficam âmbar
    const key = col.slice(0, 3).join(',');
    const c = key === '0,255,200' || key === '255,60,0' ? 0xffa020 : zc < 0 ? 0xfff2d0 : 0xff2810;
    return { opts: { color: c, unlit: true, lightScale: 0 }, envCut: 1 };
  }
  if (name.startsWith('glass')) return { opts: { color: 0x0c1016, envStrength: 0.9, transparent: true, opacity: 0.92, side: THREE.DoubleSide }, envCut: 0.35 };
  const chrome = /chrom|cromo|crom|reflect|ref/.test(tex);
  const hex = new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255).getHex();
  if (map) return { opts: { map, color: chrome ? new THREE.Color(hex).multiplyScalar(0.7).getHex() : hex, envStrength: chrome ? 0.35 : 0.1, lightScale: 0.7 }, envCut: chrome ? 0 : 1 };
  const grey = (col[0] + col[1] + col[2]) / 3;
  // cinzas claros (aros, cromados sem textura): mais escuros com reflexo, para não ofuscar sob o farol
  if (grey > 140) return { opts: { color: new THREE.Color(hex).multiplyScalar(0.6).getHex(), envStrength: 0.45, lightScale: 0.5 }, envCut: 0 };
  return { opts: { color: hex, envStrength: 0.15, lightScale: 0.7 }, envCut: 0.6 };
}

/**
 * Carrega um GLB e devolve { make(color, color2), width, length }.
 * Os meshes "paint" recebem a cor pedida; "paint2" (baú) a segunda cor. Grupo na origem, chão em y = 0, frente em -z.
 * @param {object} o { url, length: comprimento alvo em metros (escala o modelo), paintEnv }
 */
export async function loadVehicleModel(M, o) {
  const gltf = await new GLTFLoader().loadAsync(o.url);
  const bb = (gltf.parser.json.extras || {}).bbox || [[-1, 0, -2], [1, 1.5, 2]];
  const rawLength = bb[1][2] - bb[0][2];
  const scale = o.length ? o.length / rawLength : 1;
  const paintCache = new Map();
  const paintMat = (hex, env) => {
    const key = hex + '|' + env;
    if (!paintCache.has(key)) paintCache.set(key, ps1Material({ color: hex, envStrength: env, lightScale: 0.7 }));
    return paintCache.get(key);
  };
  const fixed = new Map();
  gltf.scene.traverse((m) => {
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    const name = m.material.name || '';
    if (name === 'paint' || name === 'paint2') { m.userData.role = name; envCutAttribute(m.geometry, 0); return; }
    if (!fixed.has(m.material)) {
      const { opts, envCut } = fixedMaterial(m.material, m, rawLength);
      fixed.set(m.material, ps1Material(opts));
      envCutAttribute(m.geometry, envCut);
    }
    m.userData.role = 'fixed';
    m.userData.mat = fixed.get(m.material);
  });
  gltf.scene.traverse((m) => { if (m.isMesh && m.userData.role === 'fixed') { m.material = m.userData.mat; if (m.material.transparent) m.renderOrder = 2; } });
  return {
    width: (bb[1][0] - bb[0][0]) * scale,
    length: rawLength * scale,
    make(color, color2 = 0xd42020) {
      const root = gltf.scene.clone(true);
      root.scale.setScalar(scale);
      root.traverse((m) => {
        if (!m.isMesh) return;
        if (m.userData.role === 'paint') m.material = paintMat(color, o.paintEnv === undefined ? 0.35 : o.paintEnv);
        else if (m.userData.role === 'paint2') m.material = paintMat(color2, 0.15);
      });
      const g = new THREE.Group();
      g.add(root);
      return g;
    },
  };
}

/** Catálogo dos modelos do tráfego. `length` é o comprimento no jogo (o GLB é escalado). */
export const VEHICLE_MODELS = {
  marea: { url: 'assets/marea.glb', length: 4.55 },
  hb20: { url: 'assets/hb20.glb', length: 4.0 },
  biz: { url: 'assets/biz.glb', length: 2.0 },
};

/** Carrega todos os modelos do catálogo; os que falharem ficam de fora (cai no procedural). */
export async function loadVehicleModels(M) {
  const models = {};
  await Promise.all(Object.entries(VEHICLE_MODELS).map(async ([key, o]) => {
    try { models[key] = await loadVehicleModel(M, o); } catch (err) { console.warn('Modelo ' + key + ' não carregou; usando o procedural.', err); }
  }));
  return models;
}
