import { h } from '../dom.js';
import { THEME_KEY as KEY } from '../site.js';
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } };

export function currentTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set) return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// The saved theme is applied by the inline head script before first paint; this only toggles and persists.
export function themeButton() {
  const btn = h('button', { class: 'theme-btn', type: 'button' });
  const label = () => { btn.textContent = currentTheme() === 'dark' ? 'Day' : 'Night'; btn.setAttribute('aria-label', `Switch to ${btn.textContent.toLowerCase()} mode`); };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    // Choosing the system's own scheme undoes the override: follow the system again rather than pinning it.
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (next === system) {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    } else {
      document.documentElement.setAttribute('data-theme', next);
      write(next);
    }
    label();
  });
  label();
  return btn;
}
