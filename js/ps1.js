// Renderização low-poly noturna:
//  - render target em resolução reduzida (640 px no lado maior) com upscale "pixelado"
//  - iluminação por fragmento: luar fraco, postes de sódio a cada 20 m e o farol do Astra
//  - texturas sem filtro (texels visíveis), céu em gradiente com estrelas, neblina noturna
//  - emissivos: geometria (lanternas, faróis, luminárias) e máscara no alpha das texturas
//    (janelas acesas, vitrines, letreiros)
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

// Uniforms compartilhados por todos os materiais.
export const shared = {
  uFogColor: { value: new THREE.Color(0x151826) },
  uFogNear: { value: 40 },
  uFogFar: { value: 210 },
  uLightDir: { value: new THREE.Vector3(0.3, 0.8, -0.4).normalize() }, // luar
  uAmbient: { value: 0.30 },
  uDiffuse: { value: 0.22 },
  uNight: { value: 1 },
  uEnvScale: { value: 0.45 },
  uCarPos: { value: new THREE.Vector3(7.1, 0.6, 0) },
  // Curva visual da pista: x = amplitude lateral, y = z inicial, z = z final, w = z da câmera.
  uCurve: { value: new THREE.Vector4(0, 0, -1, 0) },
};

const white = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

// Textura "matcap" de reflexo de céu noturno usada na lataria preta do Astra.
export const envTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 32);
  // y=0 (topo do canvas) = normal apontando para cima; y=1 = normal para baixo.
  grad.addColorStop(0.0, '#4a5a78');
  grad.addColorStop(0.22, '#5c6e8c');
  grad.addColorStop(0.33, '#9aa8bc');
  grad.addColorStop(0.40, '#4a545e');
  grad.addColorStop(0.46, '#262c32');
  grad.addColorStop(0.50, '#14171a');
  grad.addColorStop(0.62, '#0c0e10');
  grad.addColorStop(1.0, '#050506');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
})();

const VERT = /* glsl */`
uniform vec3 uLightDir;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uFogNear;
uniform float uFogFar;
uniform float uUnlit;
uniform vec4 uCurve;
attribute float envCut; // 0 = reflexo cheio; vidros ~0.6; -1 = geometria emissiva

varying vec2 vUv;
varying vec3 vAlbedo;
varying float vLight;
varying float vFog;
varying vec2 vEnv;
varying float vEnvCut;
varying vec3 vWorld;

// Dobra o mundo lateralmente ao longo de z (como os jogos de corrida da época faziam):
// um "sino" de amplitude uCurve.x entre uCurve.y e uCurve.z. A jogabilidade continua reta.
float curveAt(float z) {
  float t = clamp((uCurve.y - z) / (uCurve.y - uCurve.z), 0.0, 1.0);
  return uCurve.x * 0.5 * (1.0 - cos(6.2831853 * t));
}
float curveSlope(float z) {
  float t = (uCurve.y - z) / (uCurve.y - uCurve.z);
  if (t <= 0.0 || t >= 1.0) return 0.0;
  return uCurve.x * 0.5 * sin(6.2831853 * t) * 6.2831853 * (-1.0 / (uCurve.y - uCurve.z));
}

void main() {
  vEnvCut = envCut;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; // posição "reta" (antes da curva), usada para postes e farol
  // Subtrai a tangente na posição da câmera: perto do carro a pista fica reta, longe ela curva.
  wp.x += curveAt(wp.z) - curveAt(uCurve.w) - curveSlope(uCurve.w) * (wp.z - uCurve.w);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;

  vec3 wn = normalize(mat3(modelMatrix) * normal);
  float diff = max(dot(wn, uLightDir), 0.0);
  vLight = mix(uAmbient + uDiffuse * diff, 1.0, uUnlit);

  vec3 c = vec3(1.0);
  #ifdef USE_COLOR
    c = color;
  #endif
  vAlbedo = c;
  vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vUv = uv;
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
uniform float uEmissiveMask;
uniform sampler2D uEnvMap;
uniform float uEnvStrength;
uniform float uEnvScale;
uniform float uNight;
uniform vec3 uCarPos;
uniform float uLightScale;

varying vec2 vUv;
varying vec3 vAlbedo;
varying float vLight;
varying float vFog;
varying vec2 vEnv;
varying float vEnvCut;
varying vec3 vWorld;

// Postes de sódio no canteiro central: luminárias em x = ±2.2, y = 7.8, a cada 20 m (z ≡ -10 mod 20).
float lampTerm(vec3 p) {
  float zl = -10.0 + 20.0 * floor((p.z + 10.0) / 20.0 + 0.5);
  float sum = 0.0;
  for (int k = -1; k <= 1; k++) {
    float z = zl + float(k) * 20.0;
    for (int s = -1; s <= 1; s += 2) {
      vec3 d = p - vec3(2.2 * float(s), 7.8, z);
      sum += 34.0 / (dot(d, d) + 6.0);
    }
  }
  return sum;
}

// Farol do Astra: feixe para -z a partir do carro, abrindo com a distância.
float headTerm(vec3 p) {
  vec3 d = p - uCarPos;
  float along = -d.z;
  if (along <= 0.0) return 0.0;
  float spread = 1.6 + along * 0.3;
  float lat = exp(-(d.x * d.x) / (spread * spread));
  float fall = clamp(1.0 - along / 70.0, 0.0, 1.0);
  float h = clamp(1.0 - abs(d.y - 0.2) / 3.5, 0.0, 1.0);
  return lat * fall * fall * h * 2.2;
}

void main() {
  vec4 tex = vec4(1.0);
  if (uHasMap > 0.5) tex = texture2D(uMap, vUv);
  if (tex.a < uAlphaTest) discard;

  vec3 albedo = tex.rgb * uColor * vAlbedo;
  // Emissivo: alpha < 1 nas texturas marcadas (janelas acesas) ou geometria com envCut = -1.
  float emis = uEmissiveMask * (1.0 - tex.a);
  if (vEnvCut < -0.5) emis = 1.0;

  vec3 lamp = vec3(1.0, 0.72, 0.42) * lampTerm(vWorld) * uNight;
  vec3 head = vec3(1.0, 0.95, 0.82) * headTerm(vWorld) * uNight;
  vec3 c = albedo * (vLight + (lamp + head) * uLightScale) * (1.0 - emis) + albedo * emis;

  if (uEnvStrength > 0.0) c += texture2D(uEnvMap, vEnv).rgb * uEnvStrength * uEnvScale * max(0.0, 1.0 - vEnvCut);
  c = mix(c, uFogColor, vFog * (1.0 - emis * 0.6));

  float alpha = (uOpacity < 1.0 || uAlphaTest > 0.0) ? tex.a * uOpacity : 1.0;
  gl_FragColor = vec4(c, alpha);
}
`;

/**
 * Cria um material do jogo.
 * @param {object} o
 * @param {THREE.Texture|null} o.map textura (filtro nearest)
 * @param {number} o.color cor multiplicadora
 * @param {number} o.envStrength intensidade do reflexo "matcap"
 * @param {boolean} o.unlit ignora luar e ambiente (placas, outdoors)
 * @param {boolean} o.emissiveMask alpha da textura < 1 vira brilho próprio (janelas acesas)
 * @param {number} o.alphaTest limiar de recorte de alpha
 * @param {boolean} o.transparent habilita blending (sombras)
 * @param {number} o.opacity opacidade
 * @param {number} o.side lado renderizado
 * @param {number} o.polygonOffset afasta decalques da superfície de baixo
 * @param {boolean} o.vertexColors usa o atributo color
 * @param {number} o.lightScale atenua postes e farol (superfícies claras grandes, como ônibus brancos)
 */
export function ps1Material(o = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: shared.uFogColor,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
      uLightDir: shared.uLightDir,
      uAmbient: shared.uAmbient,
      uDiffuse: shared.uDiffuse,
      uCurve: shared.uCurve,
      uNight: shared.uNight,
      uEnvScale: shared.uEnvScale,
      uCarPos: shared.uCarPos,
      uMap: { value: o.map || white },
      uHasMap: { value: o.map ? 1 : 0 },
      uColor: { value: new THREE.Color(o.color === undefined ? 0xffffff : o.color) },
      uAlphaTest: { value: o.alphaTest || 0 },
      uOpacity: { value: o.opacity === undefined ? 1 : o.opacity },
      uEmissiveMask: { value: o.emissiveMask ? 1 : 0 },
      uEnvMap: { value: envTexture },
      uEnvStrength: { value: o.envStrength || 0 },
      uUnlit: { value: o.unlit ? 1 : 0 },
      uLightScale: { value: o.lightScale === undefined ? 1 : o.lightScale },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: o.vertexColors !== false,
    side: o.side === undefined ? THREE.FrontSide : o.side,
    transparent: !!o.transparent,
    depthWrite: o.depthWrite === undefined ? !o.transparent : o.depthWrite,
    fog: false,
  });
  if (o.polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -o.polygonOffset;
    mat.polygonOffsetUnits = -o.polygonOffset;
  }
  return mat;
}

/** Textura canvas com filtro nearest e mipmaps. */
export function pixelTexture(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
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
uniform float uHorizon;
uniform vec2 uRes;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec4 s = texture2D(tDiffuse, vUv);
  // Céu noturno em gradiente, ancorado na linha do horizonte, com estrelas.
  float t = clamp((vUv.y - uHorizon) / max(0.02, 1.0 - uHorizon), 0.0, 1.0);
  vec3 sky = mix(uSkyBottom, uSkyTop, pow(t, 0.6));
  vec2 cell = floor(vUv * uRes * 0.5);
  float star = step(0.994, hash(cell)) * smoothstep(0.15, 0.5, t);
  star *= 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 7.0) * 6.28);
  sky += vec3(star);
  vec3 c = mix(sky, s.rgb, clamp(s.a, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}
`;

const _dir = new THREE.Vector3();

/** Pós-processamento: cena em resolução reduzida → tela, com céu noturno. */
export class PS1Post {
  constructor(renderer, longSide = 640) {
    this.renderer = renderer;
    this.longSide = longSide;
    this.rt = new THREE.WebGLRenderTarget(640, 360, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uHorizon: { value: 0.55 },
        uRes: { value: new THREE.Vector2(640, 360) },
        uSkyTop: { value: new THREE.Color(0x05070f) },
        uSkyBottom: { value: shared.uFogColor.value },
        uTime: { value: 0 },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setSize(width, height) {
    // O lado maior do framebuffer interno fica em longSide, seja a janela larga ou alta.
    const aspect = width / height;
    let w, h;
    if (aspect >= 1) { w = this.longSide; h = Math.max(160, Math.round(w / aspect)); }
    else { h = this.longSide; w = Math.max(160, Math.round(h * aspect)); }
    this.rt.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
    this.width = w;
    this.height = h;
  }

  render(scene, camera, time) {
    const r = this.renderer;
    this.material.uniforms.uTime.value = time;
    // Linha do horizonte em coordenadas de tela, a partir da inclinação da câmera.
    camera.getWorldDirection(_dir);
    const pitch = Math.asin(Math.max(-1, Math.min(1, _dir.y)));
    const ndcY = -Math.tan(pitch) / Math.tan(camera.fov * 0.5 * Math.PI / 180);
    this.material.uniforms.uHorizon.value = Math.max(0.05, Math.min(0.95, 0.5 + 0.5 * ndcY));
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
