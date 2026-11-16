import { h } from '../dom.js';
import { THEME_KEY as KEY } from '../site.js';
// null clears the saved choice (follow the system again).
const write = (v) => { try { v == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } };
const DARK = '(prefers-color-scheme: dark)';
const systemTheme = () => (window.matchMedia(DARK).matches ? 'dark' : 'light');

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || systemTheme();
}

// The saved theme is applied by the inline head script before first paint; this only toggles and persists.
export function themeButton() {
  const btn = h('button', { class: 'theme-btn', type: 'button' });
  const label = () => { btn.textContent = currentTheme() === 'dark' ? 'Day' : 'Night'; btn.setAttribute('aria-label', `Switch to ${btn.textContent.toLowerCase()} mode`); };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    // Choosing the system's own scheme undoes the override: follow the system again rather than pinning it.
    if (next === systemTheme()) {
      document.documentElement.removeAttribute('data-theme');
      write(null);
    } else {
      document.documentElement.setAttribute('data-theme', next);
      write(next);
    }
    label();
  });
  // Following the system, the label must track an OS scheme change made while the page is open.
  window.matchMedia(DARK).addEventListener?.('change', label);
  label();
  return btn;
}
