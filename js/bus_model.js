// Ônibus urbano vindo de um modelo 3D (assets/bus.glb, gerado por tools/rage2glb/export_dff.py a partir de
// um .dff/.txd). A carroceria tem UV projetado no layout de makeBusSkin(); o resto usa materiais fixos.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ps1Material } from './ps1.js';

const SCALE = 0.92; // o modelo tem 3,0 x 11,9 m; o tráfego do jogo usa ~2,7 x 11 m

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

/** Material fixo para um material do GLB ("textura|r,g,b,a"), decidido pelo nome e pela posição da peça. */
function fixedMaterial(src, mesh) {
  const name = src.name || '';
  const [tex, rgba] = name.split('|');
  const col = (rgba || '255,255,255,255').split(',').map(Number);
  const map = pixelate(src.map);
  const front = mesh.geometry.boundingBox.min.z < -4; // peças na frente do ônibus
  if (tex === 'vehiclelights128') {
    const c = col[0] === 255 && col[1] < 100 ? 0xff2810 : col[1] === 175 ? 0xffa020 : front ? 0xfff2d0 : 0xffd0a0;
    return { opts: { color: c, unlit: true }, envCut: 1 };
  }
  if (tex === 'dx4-route') return { opts: { map, color: 0xffffff, unlit: true }, envCut: 1 };
  if (tex === 'dx4-wheels') return { opts: { map, color: 0xa0a0a0 }, envCut: 1 };
  if (tex === 'carplate' || tex === 'carpback') return { opts: { color: 0xd8d8d0, unlit: true }, envCut: 1 };
  if (col[3] < 255 || tex === 'd4exn1glaswall') {
    // vidros: janelas acesas à noite (o interior foi removido)
    return { opts: { color: 0xffd9a0, unlit: true, transparent: true, opacity: 0.88, side: THREE.DoubleSide }, envCut: 0.5 };
  }
  if (map) return { opts: { map }, envCut: 1 };
  const grey = (col[0] + col[1] + col[2]) / 3;
  return { opts: { color: grey < 30 ? 0x101012 : grey < 120 ? 0x303034 : 0xdcdcd8, envStrength: grey < 30 ? 0.2 : 0 }, envCut: grey < 30 ? 0 : 1 };
}

/**
 * Carrega o GLB uma vez e devolve { make(kind) }, que instancia um ônibus com a pintura pedida
 * (turf, santasilvana, santarosa). Grupo na origem, chão em y = 0, frente em -z.
 */
export async function loadBusModel(M, T, url = 'assets/bus.glb') {
  const gltf = await new GLTFLoader().loadAsync(url);
  const fixed = new Map();
  const skins = {};
  const liveryMat = (kind) => {
    if (!skins[kind]) skins[kind] = ps1Material({ map: T.busSkin[kind], envStrength: 0.12, lightScale: 0.3 });
    return skins[kind];
  };
  const roles = []; // [mesh, role]
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    if ((o.material.name || '') === 'livery') {
      o.userData.role = 'livery';
      envCutAttribute(o.geometry, 0.7);
    } else {
      if (!fixed.has(o.material)) {
        const { opts, envCut } = fixedMaterial(o.material, o);
        fixed.set(o.material, ps1Material({ lightScale: opts.unlit ? 0 : 0.6, ...opts }));
        envCutAttribute(o.geometry, envCut);
      }
      o.userData.role = 'fixed';
      o.userData.mat = fixed.get(o.material);
    }
    roles.push(o);
  });
  for (const o of roles) if (o.userData.role === 'fixed') { o.material = o.userData.mat; if (o.material.transparent) o.renderOrder = 2; }

  return {
    make(kind) {
      const root = gltf.scene.clone(true);
      root.scale.setScalar(SCALE);
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.role === 'livery') o.material = liveryMat(kind);
      });
      const g = new THREE.Group();
      g.add(root);
      return g;
    },
  };
}
