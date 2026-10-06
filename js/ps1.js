// Renderização estilo PlayStation 1:
//  - render target em baixa resolução (≈320x240) com upscale "pixelado"
//  - vertex snapping (os vértices "pulam" na grade de pixels)
//  - mapeamento de textura afim (as texturas "nadam" nos polígonos)
//  - iluminação por vértice (Gouraud), sem filtro de textura
//  - quantização para 15 bits de cor com dithering ordenado (Bayer 4x4)
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

// Uniforms compartilhados por todos os materiais PS1.
export const shared = {
  uSnapRes: { value: new THREE.Vector2(320, 240) },
  uSnap: { value: 1 },
  uAffine: { value: 1 },
  uFogColor: { value: new THREE.Color(0xbcc8d6) },
  uFogNear: { value: 60 },
  uFogFar: { value: 230 },
  uLightDir: { value: new THREE.Vector3(0.5, 0.75, 0.35).normalize() },
  uAmbient: { value: 0.42 },
  uDiffuse: { value: 0.78 },
};

const white = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

// Textura "matcap" de reflexo de céu usada na lataria preta do Astra.
export const envTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 32);
  // y=0 (topo do canvas) = normal apontando para cima; y=1 = normal para baixo.
  grad.addColorStop(0.0, '#8aa6c0');
  grad.addColorStop(0.22, '#a4bccf');
  grad.addColorStop(0.33, '#c8d6e0');
  grad.addColorStop(0.40, '#6e7a86');
  grad.addColorStop(0.46, '#30373d');
  grad.addColorStop(0.50, '#1a1e22');
  grad.addColorStop(0.62, '#0e1012');
  grad.addColorStop(1.0, '#060607');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
})();

const VERT = /* glsl */`
uniform vec2 uSnapRes;
uniform float uSnap;
uniform float uAffine;
uniform vec3 uLightDir;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uFogNear;
uniform float uFogFar;
uniform float uUnlit;
attribute float envCut; // 0 = reflexo cheio; vidros usam ~0.6 (geometrias sem o atributo leem 0)

varying vec3 vUvW;
varying vec3 vColor;
varying float vFog;
varying vec2 vEnv;
varying float vEnvCut;

void main() {
  vEnvCut = envCut;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;

  // Vertex snapping: arredonda a posição em NDC para a grade de pixels do framebuffer baixo.
  if (uSnap > 0.5 && clip.w > 0.0) {
    vec2 grid = uSnapRes * 0.5;
    vec2 ndc = clip.xy / clip.w;
    ndc = floor(ndc * grid + 0.5) / grid;
    clip.xy = ndc * clip.w;
  }
  gl_Position = clip;

  // Iluminação Gouraud (por vértice), flat porque as normais são por face.
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  float diff = max(dot(wn, uLightDir), 0.0);
  float light = mix(uAmbient + uDiffuse * diff, 1.0, uUnlit);

  vec3 c = vec3(1.0);
  #ifdef USE_COLOR
    c = color;
  #endif
  vColor = c * light;

  vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);

  // Mapeamento afim: multiplica a UV por w e divide pelo w interpolado no fragment.
  // Isso cancela a correção de perspectiva da GPU e reproduz o "swimming" do PS1.
  float w = mix(1.0, clip.w, uAffine);
  vUvW = vec3(uv * w, w);

  vec3 vn = normalize(normalMatrix * normal);
  vEnv = vn.xy * 0.5 + 0.5;
}
`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uAlphaTest;
uniform float uOpacity;
uniform sampler2D uEnvMap;
uniform float uEnvStrength;

varying vec3 vUvW;
varying vec3 vColor;
varying float vFog;
varying vec2 vEnv;
varying float vEnvCut;

void main() {
  vec2 uv = vUvW.xy / vUvW.z;
  vec4 tex = vec4(1.0);
  if (uHasMap > 0.5) tex = texture2D(uMap, uv);
  if (tex.a < uAlphaTest) discard;
  vec3 c = tex.rgb * uColor * vColor;
  if (uEnvStrength > 0.0) c += texture2D(uEnvMap, vEnv).rgb * uEnvStrength * (1.0 - vEnvCut);
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, tex.a * uOpacity);
}
`;

/**
 * Cria um material PS1.
 * @param {object} o
 * @param {THREE.Texture|null} o.map textura (filtro nearest recomendado)
 * @param {number} o.color cor multiplicadora
 * @param {number} o.envStrength intensidade do reflexo "matcap"
 * @param {boolean} o.unlit ignora a luz direcional (vegetação, placas, sombras)
 * @param {number} o.alphaTest limiar de recorte de alpha
 * @param {boolean} o.transparent habilita blending (sombras)
 * @param {number} o.opacity opacidade
 * @param {number} o.side lado renderizado
 * @param {boolean} o.vertexColors usa o atributo color
 */
export function ps1Material(o = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSnapRes: shared.uSnapRes,
      uSnap: shared.uSnap,
      uAffine: shared.uAffine,
      uFogColor: shared.uFogColor,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
      uLightDir: shared.uLightDir,
      uAmbient: shared.uAmbient,
      uDiffuse: shared.uDiffuse,
      uMap: { value: o.map || white },
      uHasMap: { value: o.map ? 1 : 0 },
      uColor: { value: new THREE.Color(o.color === undefined ? 0xffffff : o.color) },
      uAlphaTest: { value: o.alphaTest || 0 },
      uOpacity: { value: o.opacity === undefined ? 1 : o.opacity },
      uEnvMap: { value: envTexture },
      uEnvStrength: { value: o.envStrength || 0 },
      uUnlit: { value: o.unlit ? 1 : 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: o.vertexColors !== false,
    side: o.side === undefined ? THREE.FrontSide : o.side,
    transparent: !!o.transparent,
    depthWrite: o.depthWrite === undefined ? !o.transparent : o.depthWrite,
    fog: false,
  });
  return mat;
}

/** Textura canvas com filtro nearest (sem suavização, como no PS1). */
export function pixelTexture(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return t;
}

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uDither;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform float uTime;
varying vec2 vUv;

float bayer2(vec2 p) {
  p = mod(floor(p), 2.0);
  return p.x == 0.0 ? (p.y == 0.0 ? 0.0 : 3.0) : (p.y == 0.0 ? 2.0 : 1.0);
}
float bayer4(vec2 p) {
  return (4.0 * bayer2(p) + bayer2(floor(p * 0.5))) / 16.0;
}

void main() {
  vec4 s = texture2D(tDiffuse, vUv);
  // Céu em gradiente onde a cena não desenhou nada (alpha 0).
  float t = smoothstep(0.47, 1.0, vUv.y);
  vec3 sky = mix(uSkyBottom, uSkyTop, pow(t, 0.75));
  vec3 c = mix(sky, s.rgb, clamp(s.a, 0.0, 1.0));

  if (uDither > 0.5) {
    vec2 px = floor(vUv * uRes);
    float d = bayer4(px);
    c = floor(c * 31.0 + d) / 31.0;
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Pós-processamento: cena em baixa resolução → tela, com dithering e céu. */
export class PS1Post {
  constructor(renderer, baseHeight = 240) {
    this.renderer = renderer;
    this.baseHeight = baseHeight;
    this.rt = new THREE.WebGLRenderTarget(320, 240, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(320, 240) },
        uDither: { value: 1 },
        uSkyTop: { value: new THREE.Color(0x3b78c9) },
        uSkyBottom: { value: shared.uFogColor.value },
        uTime: { value: 0 },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.enabled = true;
  }

  setSize(width, height) {
    const aspect = width / height;
    let h = this.baseHeight;
    let w = Math.round(h * aspect);
    if (w > 640) { w = 640; h = Math.round(w / aspect); }
    this.rt.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
    shared.uSnapRes.value.set(w, h);
    this.width = w;
    this.height = h;
  }

  setEnabled(on) {
    this.enabled = on;
    shared.uSnap.value = on ? 1 : 0;
    shared.uAffine.value = on ? 1 : 0;
    this.material.uniforms.uDither.value = on ? 1 : 0;
  }

  render(scene, camera, time) {
    const r = this.renderer;
    this.material.uniforms.uTime.value = time;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
