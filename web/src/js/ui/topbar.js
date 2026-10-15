// The sticky top bar wraps on narrow screens, so its height is measured, not assumed: --topbar-h on the root
// follows it, and the page's scroll-padding-top (base.css) keeps anchors below it.
export function trackTopbar(bar, root = document.documentElement) {
  const write = () => root.style.setProperty('--topbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  write();
  if (typeof ResizeObserver !== 'function') return () => {};
  const ro = new ResizeObserver(write);
  ro.observe(bar);
  return () => ro.disconnect();
}
