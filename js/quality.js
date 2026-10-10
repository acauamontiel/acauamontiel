// Modo gráfico: render em resolução alta com filtro bilinear (o antigo modo PS1 foi removido).
/** Lado maior do framebuffer interno para a janela atual. */
export function renderLongSide(w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // No celular (toque) o teto é menor: GPU e memória mais apertadas, e a tela é pequena.
  const touch = window.matchMedia('(pointer: coarse)').matches;
  return Math.min(touch ? 1024 : 1280, Math.round(Math.max(w, h) * dpr));
}
