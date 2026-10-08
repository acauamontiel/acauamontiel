// Ônibus urbano vindo de um modelo 3D (assets/bus.glb, gerado por tools/rage2glb/export_dff.py a partir de
// um .dff/.txd). A carroceria tem UV projetado no layout de makeBusSkin(); o resto usa materiais fixos.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ps1Material } from './ps1.js';

const SCALE = 0.92; // o modelo tem 3,0 x 11,9 m; o tráfego do jogo usa ~2,7 x 11 m

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
    // vidros fumê com reflexo (não se vê o interior, que foi removido)
    return { opts: { color: 0x0a0d12, envStrength: 0.9, lightScale: 0.3, transparent: true, opacity: 0.96, side: THREE.DoubleSide }, envCut: 0.3 };
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
  // Letreiro digital de destino acima do para-brisa (um por empresa).
  const signs = {};
  const signMat = (kind) => {
    if (!signs[kind]) signs[kind] = ps1Material({ map: T.busSign[kind], unlit: true, lightScale: 0 });
    return signs[kind];
  };
  const bb = (gltf.parser.json.extras || {}).bbox || [[-1.5, 0.2, -6], [1.5, 2.7, 6]];
  const signGeo = new THREE.PlaneGeometry(2.3, 0.36);
  signGeo.rotateY(Math.PI);
  signGeo.translate((bb[0][0] + bb[1][0]) / 2, bb[1][1] - 0.32, bb[0][2] - 0.03);
  signGeo.setAttribute('envCut', new THREE.Float32BufferAttribute(new Float32Array(signGeo.attributes.position.count).fill(1), 1));
  const roles = []; // [mesh, role]
  // Vidros laterais mais baixos (altura menor, mantidos no alto): sobe a base dos vidros das janelas para
  // não encostar no nome da empresa pintado entre as rodas.
  const GLASS_BOTTOM = 1.72, HALF_W = 1.2, SIDE_Z = 4.8;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name || '';
    const col = (name.split('|')[1] || '255,255,255,255').split(',').map(Number);
    if (col[3] < 255 || name.includes('d4exn1glaswall')) {
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getX(i)) > HALF_W && Math.abs(p.getZ(i)) < SIDE_Z && p.getY(i) < GLASS_BOTTOM && p.getY(i) > 0.9) p.setY(i, GLASS_BOTTOM);
      }
      p.needsUpdate = true;
    }
  });
  // Faixa de lataria que fecha a abertura das janelas entre a base antiga (~1.4 m) e a nova, nos dois lados,
  // com o mesmo UV projetado da pintura (lateral: u = frente -> trás, v = teto -> chão na metade de cima).
  const stripGeos = [];
  for (const side of [-1, 1]) {
    const x = side * (HALF_W + 0.295), yA = 1.3, yB = GLASS_BOTTOM + 0.02, zA = -SIDE_Z - 0.4, zB = SIDE_Z + 0.4;
    const g = new THREE.PlaneGeometry(zB - zA, yB - yA);
    g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(x, (yA + yB) / 2, (zA + zB) / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      let u = (pos.getZ(i) - bb[0][2]) / (bb[1][2] - bb[0][2]);
      if (side > 0) u = 1 - u;
      uv.setXY(i, u, 1 - 0.5 * (bb[1][1] - pos.getY(i)) / (bb[1][1] - bb[0][1]));
    }
    envCutAttribute(g, 0.7);
    stripGeos.push(g);
  }
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
      o.material = fixed.get(o.material);
      if (o.material.transparent) o.renderOrder = 2;
    }
    roles.push(o);
  });

  return {
    make(kind) {
      const root = gltf.scene.clone(true);
      root.scale.setScalar(SCALE);
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.role === 'livery') o.material = liveryMat(kind);
      });
      root.add(new THREE.Mesh(signGeo, signMat(kind)));
      for (const g of stripGeos) root.add(new THREE.Mesh(g, liveryMat(kind)));
      const g = new THREE.Group();
      g.add(root);
      return g;
    },
  };
}
