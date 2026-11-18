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
  ['Borracha', (map, color) => ({ map, color, lightScale: 0.45 }), 1], // borracha não estoura sob o farol e os postes
  ['vehicle_badges', (map) => ({ map, alphaTest: 0.5, polygonOffset: 1 }), 1],
];
/** Qualquer outro material: cor/textura e face dupla como no modelo, com reflexo proporcional ao brilho (1 - rugosidade). */
const DEFAULT_RULE = ['', (map, color, src) => ({ map, color, side: src.side, envStrength: Math.max(0, 0.6 - (src.roughness ?? 0.8)) }), 0.5];

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

/** Textura de brilho radial para as lentes (sprites aditivos). */
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Luzes a partir dos vazios do modelo (luz_farol_esq/dir, luz_neblina_esq/dir, luz_lanterna_esq/dir). O feixe de cada vazio sai pelo
 * -Y local do nó no glTF (é o -Z do vazio no Blender; o exportador só corrige o eixo de luzes e câmeras).
 * Devolve null se o modelo não tiver os nós. Os feixes em si são calculados no shader (uHeadL/uHeadR/uHeadDir);
 * aqui entram o brilho das lentes e o das lanternas, que cresce ao frear.
 */
function buildLights(root, tailMats) {
  const node = (n) => root.getObjectByName(n);
  const head = [node('luz_farol_esq'), node('luz_farol_dir')].filter(Boolean);
  const tail = [node('luz_lanterna_esq'), node('luz_lanterna_dir')].filter(Boolean);
  const fog = [node('luz_neblina_esq'), node('luz_neblina_dir')].filter(Boolean);
  if (head.length < 2) return null;
  const tex = glowTexture();
  const glow = (n, color, size, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.setScalar(size); s.position.set(0, -0.05, 0); s.renderOrder = 3; // 5 cm à frente da lente
    n.add(s); return s;
  };
  head.forEach((n) => glow(n, 0xfff0d2, 0.55, 0.9));
  fog.forEach((n) => glow(n, 0xffe6a0, 0.34, 0.8));
  const tailGlow = tail.map((n) => glow(n, 0xff2412, 0.45, 0.4));
  const dim = new THREE.Color(0x8c8c8c), full = new THREE.Color(0xffffff);
  const q = new THREE.Quaternion();
  return {
    /** Atualiza os uniformes dos feixes com a posição e a direção atuais dos nós (carro já posicionado). */
    update(shared) {
      head[0].getWorldPosition(shared.uHeadL.value);
      head[1].getWorldPosition(shared.uHeadR.value);
      shared.uHeadDir.value.set(0, -1, 0).applyQuaternion(head[0].getWorldQuaternion(q)).normalize();
      if (fog.length === 2) { fog[0].getWorldPosition(shared.uFogL.value); fog[1].getWorldPosition(shared.uFogR.value); }
    },
    /** k = 0 lanterna normal, 1 freio no máximo. */
    setBrake(k) {
      for (const s of tailGlow) { s.material.opacity = 0.4 + 0.6 * k; s.scale.setScalar(0.45 + 0.4 * k); }
      for (const m of tailMats) m.uniforms.uColor.value.copy(dim).lerp(full, k);
    },
  };
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
    // emissão ligada no modelo (emissiveTexture): a peça tem brilho próprio, sem depender de poste ou farol
    if (opts.unlit === undefined && src.emissiveMap) opts.unlit = true;
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

  const lights = buildLights(gltf.scene, [...cache.values()].filter((v) => v.mat.name.includes('lanterna')).map((v) => v.mat));

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
    group, wheels, lights,
    width: bb[1][0] - bb[0][0], length: bb[1][2] - bb[0][2],
    wheelR: extras.wheelRadius || 0.32,
    rearWheels: { x: rear.map((w) => w.position.x), z: rear.length ? rear[0].position.z : 1.38 },
  };
}
