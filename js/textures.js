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

export function makeTextures() {
  const T = {};

  // Asfalto de uma faixa (3,4 m x 8 m): tracejado na borda direita.
  {
    const [c, g] = canvas(64, 128);
    noise(g, 64, 128, 78, 40);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 40; i++) g.fillRect((rnd() * 64) | 0, (rnd() * 128) | 0, 2 + rnd() * 6, 1);
    g.fillStyle = '#e8e8e0';
    g.fillRect(60, 0, 3, 36);
    T.asphalt = pixelTexture(c);
  }

  // Asfalto liso (ruas transversais, estacionamentos).
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 74, 36);
    T.asphaltPlain = pixelTexture(c);
  }

  // Faixa de pedestres.
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 74, 30);
    g.fillStyle = '#ecece4';
    for (let i = 0; i < 64; i += 16) g.fillRect(i + 3, 4, 9, 56);
    T.zebra = pixelTexture(c);
  }

  // Calçada de lajotas de concreto.
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 168, 34);
    g.fillStyle = 'rgba(60,60,60,0.9)';
    for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 1, 64); g.fillRect(0, i, 64, 1); }
    T.sidewalk = pixelTexture(c);
  }

  // Grama do canteiro central.
  {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 110, 60, [0.55, 1.0, 0.45]);
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

  // Fachadas: um tile = um andar x uma janela.
  T.facade = {};
  const facade = (name, wall, frame, glass, draw) => {
    const [c, g] = canvas(64, 64);
    noise(g, 64, 64, 230, 24);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = wall;
    g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'source-over';
    draw(g, frame, glass);
    T.facade[name] = pixelTexture(c);
  };
  const drawWindow = (g, x, y, w, h, frame, glass, arch = false) => {
    g.fillStyle = frame; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = glass; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, y + 2, w * 0.4, h * 0.45);
    g.fillStyle = frame; g.fillRect(x + w / 2 - 1, y, 2, h);
    if (arch) { g.fillStyle = frame; g.beginPath(); g.arc(x + w / 2, y, w / 2 + 2, Math.PI, 0); g.fill(); g.fillStyle = glass; g.beginPath(); g.arc(x + w / 2, y, w / 2, Math.PI, 0); g.fill(); }
  };
  // Prédio moderno (Centro, anos 70-90): janelas largas.
  facade('modern', '#ffffff', '#555', '#2d3f55', (g, f, gl) => { drawWindow(g, 10, 18, 44, 26, f, gl); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 60, 64, 4); });
  // Colonial/eclético (Centro histórico): janela alta em arco, cornija.
  facade('colonial', '#ffffff', '#5a4a3a', '#243040', (g, f, gl) => { drawWindow(g, 20, 20, 24, 36, f, gl, true); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 64, 5); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 5, 64, 2); });
  // Residencial de bairro (Fragata): janela pequena, reboco.
  facade('house', '#ffffff', '#6b6b6b', '#2a3a4a', (g, f, gl) => { drawWindow(g, 20, 24, 24, 22, f, gl); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, 62, 64, 2); });
  // Galpão (Porto/JK): chapa ondulada e janelinha alta.
  facade('warehouse', '#ffffff', '#444', '#2a3038', (g, f, gl) => {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i < 64; i += 6) g.fillRect(i, 0, 2, 64);
    drawWindow(g, 8, 8, 48, 12, f, gl);
    g.fillStyle = 'rgba(120,60,30,0.35)'; g.fillRect(0, 50, 64, 14);
  });
  // Parede lisa (lateral/topo).
  facade('plain', '#ffffff', '#000', '#000', () => {});

  // Lojas do térreo: atlas com 8 fachadas de 64x64 (vitrine + toldo + letreiro).
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
      // vitrine
      g.fillStyle = '#1e2a38'; g.fillRect(x + 6, 24, 52, 40);
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x + 8, 26, 20, 30);
      g.fillStyle = '#333'; g.fillRect(x + 30, 24, 3, 40); g.fillRect(x + 6, 24, 52, 2);
      // porta
      g.fillStyle = '#5a3a1a'; g.fillRect(x + 40, 34, 14, 30);
      // letreiro
      g.fillStyle = awnings[i % awnings.length]; g.fillRect(x, 2, 64, 18);
      g.fillStyle = '#fff';
      g.font = 'bold 9px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const name = T.shopNames[i];
      if (name.length > 10) g.font = 'bold 7px Arial, sans-serif';
      g.fillText(name, x + 32, 11, 62);
      // toldo listrado
      for (let s = 0; s < 64; s += 8) { g.fillStyle = s % 16 ? '#f4f4f4' : awnings[i % awnings.length]; g.fillRect(x + s, 20, 8, 4); }
    }
    T.shops = pixelTexture(c, false);
    T.shopCount = n;
  }

  // Árvores em quads cruzados (alpha).
  const tree = (draw) => {
    const [c, g] = canvas(64, 128);
    g.clearRect(0, 0, 64, 128);
    draw(g);
    const t = pixelTexture(c, false);
    return t;
  };
  // Eucalipto da Duque de Caxias: tronco alto e copa irregular.
  T.eucalyptus = tree((g) => {
    g.fillStyle = '#8a7a66'; g.fillRect(29, 50, 6, 78);
    g.fillStyle = '#a89c88'; g.fillRect(31, 50, 2, 78);
    const blobs = [[32, 26, 18], [20, 36, 12], [45, 34, 13], [30, 44, 11], [38, 14, 10], [24, 18, 9]];
    for (const [x, y, r] of blobs) {
      g.fillStyle = '#4f7a3a'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = '#6d9a4c'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, 7); g.fill();
    }
  });
  // Palmeira da Bento Gonçalves.
  T.palm = tree((g) => {
    g.fillStyle = '#9a8a70'; g.fillRect(30, 28, 5, 100);
    g.fillStyle = '#6f6250'; for (let y = 30; y < 128; y += 8) g.fillRect(30, y, 5, 2);
    g.strokeStyle = '#3f8a3a'; g.lineWidth = 5; g.lineCap = 'round';
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      g.beginPath(); g.moveTo(32, 26);
      g.quadraticCurveTo(32 + Math.cos(ang) * 18, 26 + Math.sin(ang) * 12 - 8, 32 + Math.cos(ang) * 28, 26 + Math.sin(ang) * 14 + 6);
      g.stroke();
    }
    g.fillStyle = '#6a4a20'; g.beginPath(); g.arc(32, 27, 4, 0, 7); g.fill();
  });
  // Árvore de copa redonda (parque, calçadas).
  T.roundTree = tree((g) => {
    g.fillStyle = '#6b5438'; g.fillRect(29, 70, 6, 58);
    g.fillStyle = '#3f6d2e'; g.beginPath(); g.arc(32, 44, 28, 0, 7); g.fill();
    g.fillStyle = '#5b8f3e'; g.beginPath(); g.arc(24, 36, 16, 0, 7); g.fill();
    g.fillStyle = '#79ab4f'; g.beginPath(); g.arc(20, 30, 8, 0, 7); g.fill();
  });

  // Buraco na pista.
  {
    const [c, g] = canvas(32, 32);
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = '#5a5751'; g.beginPath(); g.ellipse(16, 16, 15, 11, 0, 0, 7); g.fill();
    g.fillStyle = '#2a2724'; g.beginPath(); g.ellipse(16, 16, 12, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#141210'; g.beginPath(); g.ellipse(17, 17, 8, 5, 0, 0, 7); g.fill();
    g.fillStyle = '#6a6760'; g.fillRect(4, 14, 3, 2); g.fillRect(24, 10, 2, 3); g.fillRect(20, 24, 3, 2);
    T.pothole = pixelTexture(c, false);
  }

  // Sombra "blob".
  {
    const [c, g] = canvas(32, 32);
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(16, 16, 15, 14, 0, 0, 7); g.fill();
    T.shadow = pixelTexture(c, false);
  }

  // Outdoors (atlas 8 x 256x128).
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

  // Janelas de ônibus (faixa).
  {
    const [c, g] = canvas(64, 32);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#20303f'; for (let x = 2; x < 64; x += 16) g.fillRect(x, 4, 12, 24);
    g.fillStyle = 'rgba(255,255,255,0.3)'; for (let x = 2; x < 64; x += 16) g.fillRect(x + 1, 5, 5, 10);
    T.busWindows = pixelTexture(c);
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
