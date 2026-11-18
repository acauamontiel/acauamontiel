// Astra GSi vindo de um modelo 3D (assets/astra.glb, exportado do .blend do carro por tools/rage2glb/blend_car.py).
// Geometria, cores e texturas são as do modelo; aqui os materiais são recriados com o shader do jogo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ps1Material } from './ps1.js';
import { shadowMesh } from './vehicles.js';

/**
 * Tipo de shader por nome de material ("shader|textura" do arquivo original ou nome dado no Blender), na ordem de
 * teste. Cor e textura vêm sempre do modelo (assets/astra.glb, gerado de um .blend por tools/rage2glb/blend_car.py):
 * aqui só se decide como o jogo desenha cada tipo de peça (reflexo, transparência, emissivo, recorte).
 * Cada regra: [prefixo, (map, cor) => opções do ps1Material, envCut].
 */
const RULES = [
  ['vehicle_paint1', (map, color) => ({ color, envStrength: 0.7 }), 0],
  ['vehicle_vehglass|vidrofume', (map, color) => ({ color, envStrength: 1.0, transparent: true, opacity: 0.93, side: THREE.DoubleSide }), 0.35],
  ['vehicle_vehglass|farolvidro', (map) => ({ map, color: 0x8a8a8a, unlit: true, transparent: true, opacity: 0.85, envStrength: 0.3 }), 0.5],
  ['vehicle_vehglass_inner', () => ({ color: 0x0a0d12, transparent: true, opacity: 0.55 }), 0.6],
  ['vehicle_lightsemissive', (map) => ({ map, color: 0x8c8c8c, unlit: true }), 1],
  ['vehicle_mesh|farol', (map) => ({ map, color: 0x7a7a7a, unlit: true }), 1],
  ['vehicle_mesh|grade', (map) => ({ map, alphaTest: 0.5, side: THREE.DoubleSide, envStrength: 0.2 }), 0],
  ['vehicle_mesh', (map, color) => ({ map, color, envStrength: 0.25 }), 0.3],
  ['normal|placa', (map) => ({ map, unlit: true }), 1],
  ['vehicle_badges', (map) => ({ map, alphaTest: 0.5, polygonOffset: 1 }), 1],
];
/** Qualquer outro material: cor/textura do modelo, com reflexo proporcional ao brilho (1 - rugosidade). */
const DEFAULT_RULE = ['', (map, color, src) => ({ map, color, envStrength: Math.max(0, 0.6 - (src.roughness ?? 0.8)) }), 0.5];

function pixelate(tex) {
  if (!tex) return null;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
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
    const rule = RULES.find(([prefix]) => name.startsWith(prefix)) || DEFAULT_RULE;
    const map = pixelate(src.map);
    // baseColorFactor do glTF é linear; o jogo trabalha com cores sRGB sem gerenciamento de cor.
    const color = src.color ? src.color.clone().convertLinearToSRGB().getHex() : 0xffffff;
    const opts = rule[1](map, color, src);
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
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const bb = extras.bbox || [box.min.toArray(), box.max.toArray()];
  // raio da roda: altura do eixo (o chão do modelo fica em y = 0)
  if (!extras.wheelRadius && wheels.length) extras.wheelRadius = wheels[0].position.y;
  return {
    group, wheels,
    width: bb[1][0] - bb[0][0], length: bb[1][2] - bb[0][2],
    wheelR: extras.wheelRadius || 0.32,
    rearWheels: { x: rear.map((w) => w.position.x), z: rear.length ? rear[0].position.z : 1.38 },
  };
}
