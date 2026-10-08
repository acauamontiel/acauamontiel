// Astra GSi vindo de um modelo 3D (assets/astra.glb, gerado por tools/rage2glb a partir de um .yft/.ytd).
// O GLB traz só geometria, UV e texturas pequenas; os materiais são recriados aqui com o shader do jogo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ps1Material } from './ps1.js';
import { SMOOTH } from './quality.js';
import { shadowMesh } from './vehicles.js';

const PAINT = 0x0a0b0d;

/** Regras de material por nome ("shader|textura" do arquivo original), na ordem de teste. */
const RULES = [
  ['vehicle_paint1', () => ({ color: PAINT, envStrength: 0.7 }), 0],
  ['vehicle_vehglass|vidrofume', () => ({ color: 0x0c1016, envStrength: 1.0, transparent: true, opacity: 0.93, side: THREE.DoubleSide }), 0.35],
  ['vehicle_vehglass|farolvidro', (map) => ({ map, color: 0x8a8a8a, unlit: true, transparent: true, opacity: 0.85, envStrength: 0.3 }), 0.5],
  ['vehicle_vehglass_inner', () => ({ color: 0x0a0d12, transparent: true, opacity: 0.55 }), 0.6],
  ['vehicle_lightsemissive', (map) => ({ map, color: 0x8c8c8c, unlit: true }), 1],
  ['vehicle_mesh|farol', (map) => ({ map, color: 0x7a7a7a, unlit: true }), 1],
  ['vehicle_mesh|grade', (map) => ({ map, alphaTest: 0.5, side: THREE.DoubleSide, envStrength: 0.2 }), 0],
  ['vehicle_mesh', () => ({ color: 0x131416, envStrength: 0.25 }), 0.3],
  ['spec|dourado', () => ({ color: 0x0c0c0e, envStrength: 0.9 }), 0], // gravatas e calotas pretas
  ['normal|placa', (map, T) => ({ map: T.plate, unlit: true }), 1],
  ['vehicle_badges', (map) => ({ map, alphaTest: 0.5, polygonOffset: 1 }), 1],
  ['vehicle_detail2|futo_dash', (map) => ({ map }), 1],
  ['vehicle_detail2', () => ({ color: 0x18191b }), 1],
  ['wheel|rim', () => ({ color: 0x121214, envStrength: 0.55 }), 0],
  ['wheel|tire', () => ({ color: 0x0c0c0d }), 1],
  ['vehicle_tire', (map) => ({ map, color: 0x9a9a9a }), 0.5],
];

function pixelate(tex) {
  if (!tex) return null;
  tex.magFilter = SMOOTH ? THREE.LinearFilter : THREE.NearestFilter;
  tex.minFilter = SMOOTH ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function envCutAttribute(geo, value) {
  const n = geo.attributes.position.count;
  geo.setAttribute('envCut', new THREE.Float32BufferAttribute(new Float32Array(n).fill(value), 1));
}

/**
 * Carrega o GLB e devolve o mesmo contrato de buildAstra():
 * { group, wheels, width, length, wheelR, rearWheels }.
 */
export async function loadAstraModel(M, T, url = 'assets/astra.glb') {
  const gltf = await new GLTFLoader().loadAsync(url);
  const cache = new Map();
  const material = (src) => {
    if (cache.has(src)) return cache.get(src);
    const name = src.name || '';
    const rule = RULES.find(([prefix]) => name.startsWith(prefix)) || ['', (map) => ({ map, color: map ? 0xffffff : 0x3a3a3c }), 0.5];
    const map = pixelate(src.map);
    const opts = rule[1](map, T);
    const mat = ps1Material(opts);
    mat.name = name;
    cache.set(src, { mat, envCut: rule[2] });
    return cache.get(src);
  };

  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const { mat, envCut } = material(o.material);
    o.material = mat;
    envCutAttribute(o.geometry, envCut);
    if (mat.transparent) o.renderOrder = 2;
  });

  const paint = [...cache.values()].find((v) => v.mat.name.startsWith('vehicle_paint1'));
  if (paint) M.astraPaint = paint.mat;

  const group = new THREE.Group();
  group.add(gltf.scene);
  group.add(shadowMesh(2.2, 4.7, M));

  const wheels = ['wheel_lf', 'wheel_rf', 'wheel_lr', 'wheel_rr'].map((n) => gltf.scene.getObjectByName(n)).filter(Boolean);
  const rear = wheels.filter((w) => w.name.endsWith('r'));
  const extras = gltf.parser.json.extras || {};
  const bb = extras.bbox || [[-0.95, 0, -2.13], [0.95, 1.6, 2.11]];
  return {
    group, wheels,
    width: bb[1][0] - bb[0][0], length: bb[1][2] - bb[0][2],
    wheelR: extras.wheelRadius || 0.32,
    rearWheels: { x: rear.map((w) => w.position.x), z: rear.length ? rear[0].position.z : 1.38 },
  };
}
