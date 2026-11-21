/** 已测量目标与卡片大小；卡片外缘始终留出 gap。 */
export function guideCard(rect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'> | null,
  vw: number, vh: number, width: number, height: number, gap: number) {
  if (!rect) return { left: gap, top: gap };
  const clampTop = (top: number) => Math.max(gap, Math.min(top, vh - height - gap));
  if (rect.right + width + 2 * gap <= vw) return { left: Math.max(gap, rect.right + gap), top: clampTop(rect.top) };
  const left = Math.max(gap, Math.min(rect.left, vw - width - gap));
  if (rect.bottom + height + 2 * gap <= vh) return { left, top: clampTop(rect.bottom + gap) };
  return { left, top: clampTop(rect.top - gap - height >= gap ? rect.top - gap - height : vh - height - gap) };
}
