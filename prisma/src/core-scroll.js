// Preserve the visible message when Core re-renders after history hydration or sync.
export function captureScrollAnchor(container, threshold = 120) {
  if (!container) return null;
  const scrollTop = Number(container.scrollTop) || 0;
  const clientHeight = Number(container.clientHeight) || 0;
  const scrollHeight = Number(container.scrollHeight) || 0;
  const nearBottom = scrollHeight - scrollTop - clientHeight < threshold;
  const containerRect = container.getBoundingClientRect?.() || { top: 0 };
  const viewportTop = containerRect.top + (Number(container.clientTop) || 0);
  const viewportBottom = viewportTop + clientHeight;
  const children = Array.from(container.children || []);
  let anchor = null;
  let anchorIndex = -1;
  for (let index = 0; index < children.length; index++) {
    const rect = children[index].getBoundingClientRect?.();
    if (rect && rect.bottom > viewportTop + 1 && rect.top < viewportBottom - 1) {
      anchor = children[index];
      anchorIndex = index;
      break;
    }
  }
  return {
    scrollTop,
    nearBottom,
    anchorId: String(anchor?.dataset?.messageId || ''),
    anchorIndex,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - viewportTop : 0
  };
}

export function restoreScrollAnchor(container, snapshot, { forceBottom = false } = {}) {
  if (!container || !snapshot) return false;
  const maxScroll = Math.max(0, (Number(container.scrollHeight) || 0) - (Number(container.clientHeight) || 0));
  if (forceBottom || snapshot.nearBottom) {
    container.scrollTop = maxScroll;
    return true;
  }
  const children = Array.from(container.children || []);
  const anchor = snapshot.anchorId
    ? children.find(child => String(child.dataset?.messageId || '') === snapshot.anchorId)
    : null;
  const target = anchor || children[snapshot.anchorIndex];
  if (target?.getBoundingClientRect) {
    const containerRect = container.getBoundingClientRect?.() || { top: 0 };
    const viewportTop = containerRect.top + (Number(container.clientTop) || 0);
    const currentOffset = target.getBoundingClientRect().top - viewportTop;
    container.scrollTop = Math.max(0, Math.min(maxScroll, container.scrollTop + currentOffset - snapshot.anchorOffset));
  } else {
    container.scrollTop = Math.max(0, Math.min(maxScroll, snapshot.scrollTop));
  }
  return true;
}
