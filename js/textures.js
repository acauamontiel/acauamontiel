// Texturas procedurais desenhadas em canvas, em resolução baixa (estilo PS1).
import { pixelTexture } from './ps1.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Ruído determinístico barato (LCG) para não depender de Math.random na geração.
let seed = 1234567;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function noise(g, w, h, base, amp, tint = [1, 1, 1]) {
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = base + (rnd() - 0.5) * amp;
    d[i * 4] = Math.max(0, Math.min(255, v * tint[0]));
    d[i * 4 + 1] = Math.max(0, Math.min(255, v * tint[1]));
    d[i * 4 + 2] = Math.max(0, Math.min(255, v * tint[2]));
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

// Value noise suave (fbm) para nuvens e manchas.
function valueNoise2D(w, h, octaves = 4, scale = 8) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0, freq = scale;
  for (let o = 0; o < octaves; o++) {
    const gw = Math.max(2, Math.round(freq)), gh = Math.max(2, Math.round(freq * h / w));
    const grid = new Float32Array((gw + 1) * (gh + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * gh, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * gw, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * (gw + 1) + x0], b = grid[y0 * (gw + 1) + x0 + 1];
        const c = grid[(y0 + 1) * (gw + 1) + x0], d = grid[(y0 + 1) * (gw + 1) + x0 + 1];
        out[y * w + x] += amp * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy);
      }
    }
    total += amp; amp *= 0.5; freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export function makeTextures() {
  const T = {};

  // Asfalto de uma faixa (3,4 m x 8 m): desgaste nas trilhas dos pneus, remendos, tracejado à direita.
  {
    const w = 128, h = 256;
    const [c, g] = canvas(w, h);
    const img = g.createImageData(w, h);
    const d = img.data;
    const grain = valueNoise2D(w, h, 3, 16);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const track = Math.exp(-Math.pow((u - 0.26) / 0.11, 2)) + Math.exp(-Math.pow((u - 0.74) / 0.11, 2));
        let v = 104 - track * 20 + (grain[y * w + x] - 0.5) * 24 + (rnd() - 0.5) * 14;
        const i = (y * w + x) * 4;
        d[i] = v; d[i + 1] = v; d[i + 2] = v + 2; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // remendos e trincas
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(40,40,42,${0.12 + rnd() * 0.16})`;
      g.fillRect(rnd() * 100, rnd() * 230, 12 + rnd() * 24, 8 + rnd() * 22);
    }
    g.strokeStyle = 'rgba(30,30,32,0.7)'; g.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 16; y += rnd() * 14; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = '#d9d9cc'; g.fillRect(121, 0, 5, 64);
    g.fillStyle = 'rgba(90,90,90,0.5)'; for (let y = 0; y < 64; y += 7) g.fillRect(121, y + (rnd() * 4 | 0), 5, 1);
    T.asphalt = pixelTexture(c);
  }

  // Asfalto liso (ruas transversais, estacionamentos).
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 96, 36);
    g.fillStyle = 'rgba(0,0,0,0.2)'; for (let k = 0; k < 5; k++) g.fillRect(rnd() * 60, rnd() * 60, 4 + rnd() * 12, 3 + rnd() * 8);
    T.asphaltPlain = pixelTexture(c);
  }

  // Faixa de pedestres gasta.
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 96, 30);
    g.fillStyle = '#e4e4da';
    for (let i = 0; i < 64; i += 16) g.fillRect(i + 3, 4, 9, 56);
    g.fillStyle = 'rgba(90,90,88,0.5)'; for (let k = 0; k < 24; k++) g.fillRect(rnd() * 64, rnd() * 64, 2, 3);
    T.zebra = pixelTexture(c);
  }

  // Calçada de lajotas de concreto com juntas e manchas.
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 164, 30);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 10; k++) g.fillRect(rnd() * 64, rnd() * 64, 6 + rnd() * 14, 4 + rnd() * 10);
    g.fillStyle = 'rgba(60,60,60,0.9)';
    for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 1, 64); g.fillRect(0, i, 64, 1); }
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 1; i < 64; i += 16) { g.fillRect(i, 0, 1, 64); g.fillRect(0, i, 64, 1); }
    T.sidewalk = pixelTexture(c);
  }

  // Concreto do meio-fio.
  {
    const [c, g] = canvas(32, 32);
    noise(g, 32, 32, 176, 30);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 24, 32, 8);
    T.concrete = pixelTexture(c);
  }

  // Grama do canteiro central.
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 112, 60, [0.55, 1.0, 0.45]);
    g.fillStyle = 'rgba(80,60,30,0.35)'; for (let k = 0; k < 8; k++) g.fillRect(rnd() * 64, rnd() * 64, 3 + rnd() * 8, 2 + rnd() * 4);
    T.grass = pixelTexture(c);
  }

  // Água do Canal São Gonçalo.
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 120, 30, [0.45, 0.6, 0.72]);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 30; i++) g.fillRect((rnd() * 64) | 0, (rnd() * 64) | 0, 3 + rnd() * 8, 1);
    T.water = pixelTexture(c);
  }

  // Fachadas: um tile = um andar x uma janela. Reboco com ruído, sujeira na base, vidro com reflexo.
  T.facade = {};
  const facade = (name, draw) => {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 232, 22);
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.85, 'rgba(0,0,0,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    draw(g);
    T.facade[name] = pixelTexture(c);
  };
  const drawWindow = (g, x, y, w, h, frame, arch = false) => {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 2, y + h + 2, w + 4, 2); // sombra do peitoril
    g.fillStyle = frame; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    const gl = g.createLinearGradient(0, y, 0, y + h);
    gl.addColorStop(0, '#9fc3dc'); gl.addColorStop(0.45, '#4f6f8a'); gl.addColorStop(0.5, '#22313f'); gl.addColorStop(1, '#1a2530');
    g.fillStyle = gl; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 2, y + 2, w * 0.35, h * 0.5);
    g.fillStyle = 'rgba(220,200,160,0.35)'; g.fillRect(x + w * 0.6, y + h * 0.45, w * 0.4, h * 0.55); // cortina
    g.fillStyle = frame; g.fillRect(x + w / 2 - 1, y, 2, h);
    if (arch) { g.fillStyle = frame; g.beginPath(); g.arc(x + w / 2, y, w / 2 + 2, Math.PI, 0); g.fill(); g.fillStyle = '#5a7a94'; g.beginPath(); g.arc(x + w / 2, y, w / 2, Math.PI, 0); g.fill(); }
  };
  facade('modern', (g) => { drawWindow(g, 8, 16, 48, 28, '#4a4a4a'); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 58, 64, 6); });
  facade('balcony', (g) => {
    drawWindow(g, 14, 10, 36, 30, '#555');
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 44, 64, 3);
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 47, 64, 12);
    g.fillStyle = '#3a3a3a'; for (let x = 2; x < 64; x += 6) g.fillRect(x, 47, 1, 12); g.fillRect(0, 46, 64, 2);
    g.fillStyle = '#8a8a8a'; g.fillRect(52, 24, 10, 8); // ar-condicionado
  });
  facade('colonial', (g) => {
    drawWindow(g, 20, 20, 24, 34, '#5a4a3a', true);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, 64, 6);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 6, 64, 2);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(4, 10, 3, 54); g.fillRect(57, 10, 3, 54); // pilastras
  });
  facade('house', (g) => { drawWindow(g, 20, 24, 24, 22, '#6b6b6b'); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 60, 64, 4); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, 64, 4); });
  facade('warehouse', (g) => {
    g.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 0; i < 64; i += 6) g.fillRect(i, 0, 2, 64);
    g.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 3; i < 64; i += 6) g.fillRect(i, 0, 1, 64);
    drawWindow(g, 8, 8, 48, 12, '#444');
    g.fillStyle = 'rgba(120,60,30,0.4)'; for (let k = 0; k < 6; k++) g.fillRect(rnd() * 60, 40 + rnd() * 20, 2 + rnd() * 4, 6 + rnd() * 18);
  });
  facade('plain', () => {});

  // Lojas do térreo: atlas com 16 fachadas de 64x64 (vitrine + toldo + letreiro).
  T.shopNames = [
    'FARMÁCIA', 'SUPERMERCADO', 'DOCERIA', 'LANCHERIA XIS', 'BANCO', 'LOTÉRICA', 'MAT. CONSTRUÇÃO', 'AUTO PEÇAS',
    'ÓTICA', 'LIVRARIA', 'CAFÉ', 'PNEUS', 'BORRACHARIA', 'OFICINA', 'DEPÓSITO', 'FERRAGEM',
  ];
  {
    const n = T.shopNames.length;
    const [c, g] = canvas(64 * n, 64);
    const awnings = ['#c0392b', '#1f6fb2', '#2e8b57', '#d68a1a', '#7a3fa0', '#1f8a9a', '#b23a1f', '#444'];
    for (let i = 0; i < n; i++) {
      const x = i * 64;
      g.fillStyle = ['#e9dcc3', '#dfe3e8', '#f1e4b3', '#e5d6d6', '#d9e4d9', '#e6e6e6', '#f0d9c0', '#d8dde6'][i % 8];
      g.fillRect(x, 0, 64, 64);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 56, 64, 8);
      // vitrine com reflexo
      const gl = g.createLinearGradient(0, 24, 0, 64);
      gl.addColorStop(0, '#6f8ea8'); gl.addColorStop(0.4, '#2a3a4a'); gl.addColorStop(1, '#141c26');
      g.fillStyle = gl; g.fillRect(x + 6, 24, 52, 40);
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 8, 26, 16, 34);
      g.fillStyle = '#333'; g.fillRect(x + 30, 24, 3, 40); g.fillRect(x + 6, 24, 52, 2);
      // porta
      g.fillStyle = '#5a3a1a'; g.fillRect(x + 40, 34, 14, 30);
      g.fillStyle = '#c8a040'; g.fillRect(x + 50, 48, 2, 2);
      // letreiro
      g.fillStyle = awnings[i % awnings.length]; g.fillRect(x, 2, 64, 18);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 18, 64, 2);
      g.fillStyle = '#fff';
      g.font = 'bold 9px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const name = T.shopNames[i];
      if (name.length > 10) g.font = 'bold 7px Arial, sans-serif';
      g.fillText(name, x + 32, 11, 62);
      // toldo listrado
      for (let s = 0; s < 64; s += 8) { g.fillStyle = s % 16 ? '#f4f4f4' : awnings[i % awnings.length]; g.fillRect(x + s, 20, 8, 4); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 24, 64, 2);
    }
    T.shops = pixelTexture(c, false);
    T.shopCount = n;
  }

  // Árvores em quads cruzados (alpha), copas feitas de muitos tufos com três tons.
  const tree = (draw) => {
    const [c, g] = canvas(64, 128);
    g.clearRect(0, 0, 64, 128);
    draw(g);
    return pixelTexture(c, false);
  };
  const tufts = (g, cx, cy, rx, ry, count, shades) => {
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
      const h = (cy - y) / ry; // -1 base, +1 topo
      const shade = shades[Math.min(shades.length - 1, Math.max(0, Math.floor((h + 1) / 2 * shades.length)))];
      g.fillStyle = shade; g.beginPath(); g.arc(x, y, 3 + rnd() * 4, 0, 7); g.fill();
    }
  };
  // Eucalipto da Duque de Caxias: tronco alto claro e copa irregular em tufos.
  T.eucalyptus = tree((g) => {
    g.fillStyle = '#8a7a66'; g.fillRect(29, 50, 6, 78);
    g.fillStyle = '#b4a890'; g.fillRect(31, 50, 2, 78);
    g.fillStyle = '#6a5a48'; for (let y = 56; y < 128; y += 11) g.fillRect(29, y, 6, 1);
    g.fillStyle = '#8a7a66'; g.fillRect(24, 36, 3, 20); g.fillRect(38, 30, 3, 26);
    tufts(g, 32, 28, 26, 26, 70, ['#2f5a28', '#3f7a32', '#558f3f', '#74a84c']);
  });
  // Palmeira da Bento Gonçalves.
  T.palm = tree((g) => {
    g.fillStyle = '#9a8a70'; g.fillRect(30, 28, 5, 100);
    g.fillStyle = '#6f6250'; for (let y = 30; y < 128; y += 8) g.fillRect(30, y, 5, 2);
    g.fillStyle = '#b8a888'; g.fillRect(31, 30, 1, 98);
    g.lineCap = 'round';
    for (let a = 0; a < 9; a++) {
      const ang = (a / 9) * Math.PI * 2;
      for (const [col, lw] of [['#2e6a2a', 6], ['#4a9a3a', 3]]) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.moveTo(32, 26);
        g.quadraticCurveTo(32 + Math.cos(ang) * 18, 26 + Math.sin(ang) * 12 - 10, 32 + Math.cos(ang) * 29, 26 + Math.sin(ang) * 14 + 8);
        g.stroke();
      }
    }
    g.fillStyle = '#6a4a20'; g.beginPath(); g.arc(32, 27, 4, 0, 7); g.fill();
    g.fillStyle = '#c8a040'; g.beginPath(); g.arc(30, 30, 2, 0, 7); g.arc(34, 31, 2, 0, 7); g.fill();
  });
  // Árvore de copa redonda (parque, calçadas).
  T.roundTree = tree((g) => {
    g.fillStyle = '#5a4530'; g.fillRect(29, 70, 6, 58);
    g.fillStyle = '#7a6245'; g.fillRect(30, 70, 2, 58);
    g.fillStyle = '#5a4530'; g.fillRect(22, 60, 4, 16); g.fillRect(38, 58, 4, 18);
    tufts(g, 32, 42, 30, 30, 110, ['#24481e', '#2f6a2a', '#3f8a35', '#5fa84a', '#86c25c']);
  });

  // Buraco na pista: borda de brita clara, asfalto quebrado e fundo escuro.
  {
    const [c, g] = canvas(48, 48);
    g.clearRect(0, 0, 48, 48);
    g.fillStyle = '#a89e90'; g.beginPath(); g.ellipse(24, 24, 23, 17, 0, 0, 7); g.fill();
    g.fillStyle = '#6a655c'; g.beginPath(); g.ellipse(24, 24, 20, 14, 0, 0, 7); g.fill();
    g.fillStyle = '#2a2724'; g.beginPath(); g.ellipse(24, 25, 16, 11, 0, 0, 7); g.fill();
    g.fillStyle = '#121110'; g.beginPath(); g.ellipse(25, 26, 11, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#b8b0a0'; for (let k = 0; k < 14; k++) { const a = rnd() * 7, r = 17 + rnd() * 6; g.fillRect(24 + Math.cos(a) * r, 24 + Math.sin(a) * r * 0.72, 2, 2); }
    g.strokeStyle = '#3a3734'; g.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const a = rnd() * 7; g.beginPath(); g.moveTo(24 + Math.cos(a) * 14, 24 + Math.sin(a) * 10); g.lineTo(24 + Math.cos(a) * 23, 24 + Math.sin(a) * 17); g.stroke(); }
    T.pothole = pixelTexture(c, false);
  }

  // Atlas de detalhes do Astra (128x128): farol, lanterna fumê, placa, grade e face da roda.
  T.ASTRA_ATLAS = 128;
  {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#141416'; g.fillRect(0, 0, 128, 128);
    // farol (0,0 64x24): lente clara, refletor, pisca âmbar
    g.fillStyle = '#c9d0d6'; g.fillRect(0, 0, 64, 24);
    g.fillStyle = '#eef2f5'; g.beginPath(); g.ellipse(26, 12, 20, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#8c949c'; g.beginPath(); g.arc(22, 12, 5, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(20, 10, 2, 0, 7); g.fill();
    g.fillStyle = '#d99a2b'; g.fillRect(52, 2, 12, 20);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 22, 64, 2);
    // lanterna fumê (64,0 64x40): vermelho escuro, âmbar fumê, ré
    g.fillStyle = '#2a1012'; g.fillRect(64, 0, 64, 40);
    g.fillStyle = '#7a1a1c'; g.fillRect(66, 2, 60, 14);
    g.fillStyle = '#a82424'; g.fillRect(66, 4, 28, 10);
    g.fillStyle = '#5a2816'; g.fillRect(66, 18, 60, 9);
    g.fillStyle = '#3a3a3c'; g.fillRect(66, 29, 26, 9);
    g.fillStyle = '#6a1416'; g.fillRect(94, 29, 32, 9);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(70, 3, 50, 2);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(64, 16, 64, 2); g.fillRect(64, 27, 64, 2);
    // placa (0,32 64x16)
    g.fillStyle = '#e8e8e4'; g.fillRect(0, 32, 64, 16);
    g.fillStyle = '#1946a8'; g.fillRect(0, 32, 64, 3);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 10px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PLT·GSi', 32, 41, 60);
    // grade (0,56 64x12) com gravata dourada
    g.fillStyle = '#0e1012'; g.fillRect(0, 56, 64, 12);
    g.fillStyle = '#22262a'; for (let y = 58; y < 68; y += 3) g.fillRect(0, y, 64, 1);
    g.fillStyle = '#c9a227'; g.fillRect(26, 60, 12, 4); g.fillRect(30, 58, 4, 8);
    // roda (64,64 64x64): pneu, aro preto com 5 raios grafite
    g.fillStyle = '#141416'; g.fillRect(64, 64, 64, 64);
    g.fillStyle = '#1c1c1e'; g.beginPath(); g.arc(96, 96, 31, 0, 7); g.fill();
    g.strokeStyle = '#2a2a2c'; g.lineWidth = 1; g.beginPath(); g.arc(96, 96, 27, 0, 7); g.stroke();
    g.fillStyle = '#34373c'; g.beginPath(); g.arc(96, 96, 23, 0, 7); g.fill();
    g.fillStyle = '#17181a'; g.beginPath(); g.arc(96, 96, 20, 0, 7); g.fill();
    g.strokeStyle = '#4e535a'; g.lineWidth = 5; g.lineCap = 'round';
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * Math.PI * 2; g.beginPath(); g.moveTo(96, 96); g.lineTo(96 + Math.cos(a) * 19, 96 + Math.sin(a) * 19); g.stroke(); }
    g.fillStyle = '#5a5f66'; g.beginPath(); g.arc(96, 96, 5, 0, 7); g.fill();
    g.fillStyle = '#2a2d31'; g.beginPath(); g.arc(96, 96, 2.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(90, 88, 12, 0, 7); g.fill();
    T.astra = pixelTexture(c, false);
  }

  // Sombra "blob".
  {
    const [c, g] = canvas(32, 32);
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(16, 16, 15, 14, 0, 0, 7); g.fill();
    T.shadow = pixelTexture(c, false);
  }

  // Outdoors (atlas de 256x128 cada).
  T.billboardTexts = [
    ['PELOTAS', 'CAPITAL DO DOCE'],
    ['FENADOCE', 'TODO ANO EM PELOTAS'],
    ['XIS DA ESQUINA', 'O MELHOR XIS DA CIDADE'],
    ['PNEUS 24H', 'BORRACHARIA DO PORTO'],
    ['DOCES FINOS', 'QUINDIM · CAMAFEU · BEM-CASADO'],
    ['COLÉGIO', 'MATRÍCULAS ABERTAS'],
    ['ONLY ASTRA', 'GSi 2.0 16V · 136 CV'],
    ['RÁDIO FM', 'A VOZ DA ZONA SUL'],
    // índices 8+ são usados só pelos pontos de referência
    ['SUPERMERCADO', 'OFERTAS DA SEMANA · FRAGATA'],
    ['POSTO', 'GASOLINA · ETANOL · DIESEL'],
    ['CONCESSIONÁRIA', 'ASTRA · VECTRA · CORSA · OMEGA'],
    ['PELOTAS TURISMO', 'LARGADA · AV. DUQUE DE CAXIAS'],
  ];
  T.billboardGeneric = 8;
  {
    const n = T.billboardTexts.length;
    const [c, g] = canvas(256 * n, 128);
    const bgs = ['#c23a1f', '#1f4fa0', '#f2c230', '#222', '#d86aa0', '#2a8a5a', '#000', '#5a2a9a', '#c8241c', '#1a7a3a', '#1a1a1a', '#1f4fa0'];
    for (let i = 0; i < n; i++) {
      const x = i * 256;
      g.fillStyle = bgs[i % bgs.length]; g.fillRect(x, 0, 256, 128);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, 0, 256, 64);
      g.fillStyle = i === 2 ? '#111' : '#fff';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'italic bold 40px Arial, sans-serif';
      g.fillText(T.billboardTexts[i][0], x + 128, 50, 240);
      g.font = 'bold 18px Arial, sans-serif';
      g.fillText(T.billboardTexts[i][1], x + 128, 96, 240);
      g.fillStyle = '#fff'; g.fillRect(x, 0, 256, 4); g.fillRect(x, 124, 256, 4);
    }
    T.billboards = pixelTexture(c, false);
    T.billboardCount = n;
  }

  // Placas azuis (atlas 6 x 256x64): avenidas e pontos de referência.
  T.signTexts = [
    ['AV. DUQUE DE CAXIAS', 'CENTRO ↔ FRAGATA'],
    ['AV. BENTO GONÇALVES', 'CENTRO'],
    ['AV. PRES. J. KUBITSCHEK', 'PORTO · AREAL'],
    ['PARQUE', 'DOM ANTÔNIO ZATTERA'],
    ['ESTÁDIO', 'BOCA DO LOBO'],
    ['PORTO', 'DE PELOTAS'],
  ];
  {
    const n = T.signTexts.length;
    const [c, g] = canvas(256 * n, 64);
    for (let i = 0; i < n; i++) {
      const x = i * 256;
      g.fillStyle = '#1946a8'; g.fillRect(x, 0, 256, 64);
      g.fillStyle = '#fff'; g.fillRect(x + 4, 4, 248, 56);
      g.fillStyle = '#1946a8'; g.fillRect(x + 8, 8, 240, 48);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 22px Arial, sans-serif';
      g.fillText(T.signTexts[i][0], x + 128, 26, 230);
      g.font = 'bold 14px Arial, sans-serif';
      g.fillText(T.signTexts[i][1], x + 128, 48, 230);
    }
    T.signs = pixelTexture(c, false);
    T.signCount = n;
  }

  // Placas direcionais verdes (atlas 4 x 128x64).
  T.directions = ['FRAGATA →', '← CENTRO', 'PORTO →', 'LARANJAL →'];
  {
    const [c, g] = canvas(128 * 4, 64);
    for (let i = 0; i < 4; i++) {
      const x = i * 128;
      g.fillStyle = '#0f7a3a'; g.fillRect(x, 0, 128, 64);
      g.fillStyle = '#fff'; g.fillRect(x + 3, 3, 122, 58);
      g.fillStyle = '#0f7a3a'; g.fillRect(x + 6, 6, 116, 52);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 20px Arial, sans-serif';
      g.fillText(T.directions[i], x + 64, 32, 112);
    }
    T.directionSigns = pixelTexture(c, false);
  }

  // Cerca do parque (alpha).
  {
    const [c, g] = canvas(32, 32);
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = '#2c2c2c';
    for (let x = 2; x < 32; x += 8) g.fillRect(x, 4, 2, 28);
    g.fillRect(0, 8, 32, 2); g.fillRect(0, 26, 32, 2);
    T.fence = pixelTexture(c);
  }

  return T;
}

/**
 * Textura de carroceria "desenrolada": u = posição ao longo do carro (frente → trás),
 * v = posição no anel do perfil (0 = embaixo, 1 = centro do teto). Multiplica a cor dos vértices,
 * então desenha só o que escurece/clareia: colunas, frisos, caixas de roda, vãos de porta, borrachas.
 * @param {object} o { zs, cabin, windshield, rearGlass, pillars:[[z0,z1]...], doors:[z...], handles:[z...], wheels:[z...], wheelR, rows }
 */
export function makeBodyTexture(o) {
  const W = 128, H = 64;
  const [c, g] = canvas(W, H);
  const z0 = o.zs[0], z1 = o.zs[o.zs.length - 1];
  const U = (z) => Math.round((z - z0) / (z1 - z0) * W);
  const Y = (v) => Math.round((1 - v) * H);
  const R = o.rows; // { floor, sill, lower, crease, belt, glassBase, roofEdge }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  // chão e saia
  g.fillStyle = '#1a1a1c'; g.fillRect(0, Y(R.sill), W, H - Y(R.sill));
  g.fillStyle = '#9a9a9a'; g.fillRect(0, Y(R.lower) - 1, W, Y(R.sill) - Y(R.lower) + 1); // saia lateral escurecida
  // caixas de roda
  for (const wz of o.wheels) {
    const cx = U(wz), r = Math.round(o.wheelR / (z1 - z0) * W * 1.25);
    g.fillStyle = '#2a2a2c'; g.beginPath(); g.ellipse(cx, Y(R.sill) - 1, r, r * 0.9, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#6a6a6a'; g.beginPath(); g.ellipse(cx, Y(R.sill) - 1, r + 2, r * 0.9 + 2, 0, Math.PI, 0); g.lineWidth = 1; g.strokeStyle = '#6a6a6a'; g.stroke();
  }
  // vãos de porta e tampas
  g.fillStyle = '#5a5a5a';
  for (const dz of o.doors) g.fillRect(U(dz), Y(R.glassBase) - 1, 1, Y(R.sill) - Y(R.glassBase) + 1);
  // maçanetas
  g.fillStyle = '#d0d0d0';
  for (const hz of o.handles) g.fillRect(U(hz) - 3, Y(R.belt) + 2, 6, 2);
  // banda dos vidros laterais: vidro claro com faixa de reflexo, colunas pretas
  const gTop = Y(R.roofEdge), gBot = Y(R.glassBase);
  g.fillStyle = '#ffffff'; g.fillRect(U(o.cabin[0]), gTop, U(o.cabin[1]) - U(o.cabin[0]), gBot - gTop);
  g.fillStyle = '#c8d4dc'; g.fillRect(U(o.cabin[0]), gTop + 1, U(o.cabin[1]) - U(o.cabin[0]), Math.max(1, Math.round((gBot - gTop) * 0.25)));
  g.fillStyle = '#101214';
  for (const [p0, p1] of o.pillars) g.fillRect(U(p0), gTop - 1, Math.max(2, U(p1) - U(p0)), gBot - gTop + 2);
  // friso da cintura
  g.fillStyle = '#3a3a3a'; g.fillRect(U(o.cabin[0]), gBot, U(o.cabin[1]) - U(o.cabin[0]), 1);
  // topo: borrachas em volta do para-brisa e vidro traseiro, vão do capô e da tampa
  const tTop = 0, tBot = gTop;
  g.fillStyle = '#202224';
  for (const [a, b] of [o.windshield, o.rearGlass]) { g.fillRect(U(a), tTop, 1, tBot); g.fillRect(U(b) - 1, tTop, 1, tBot); }
  g.fillStyle = '#5a5a5a';
  if (o.hood) g.fillRect(U(o.hood), tTop, 1, tBot);
  if (o.tailgate) g.fillRect(U(o.tailgate), tTop, 1, tBot);
  return pixelTexture(c, false);
}
