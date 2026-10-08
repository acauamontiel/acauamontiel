// Modo gráfico: render em resolução alta com filtro bilinear (o antigo modo PS1 foi removido).
/** Lado maior do framebuffer interno para a janela atual. */
export function renderLongSide(w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.min(1280, Math.round(Math.max(w, h) * dpr));
}
