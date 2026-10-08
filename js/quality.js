// Modo gráfico: 'ps1' (render em 640 px, texturas sem filtro) ou 'sa' (resolução maior, filtro bilinear),
// escolhido no título, guardado no localStorage; ?quality=sa|ps1 força.
const KEY = 'crazy-astra-quality';
const params = new URLSearchParams(location.search);
let stored = null;
try { stored = localStorage.getItem(KEY); } catch { /* sem storage */ }
export const QUALITY = ['ps1', 'sa'].includes(params.get('quality')) ? params.get('quality') : (stored === 'sa' ? 'sa' : 'ps1');
export const SMOOTH = QUALITY === 'sa';

export function setQuality(q) {
  try { localStorage.setItem(KEY, q); } catch { /* sem storage */ }
  const url = new URL(location.href); url.searchParams.delete('quality'); location.href = url.toString();
}

/** Lado maior do framebuffer interno para a janela atual. */
export function renderLongSide(w, h) {
  if (!SMOOTH) return 640;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.min(1280, Math.round(Math.max(w, h) * dpr));
}
