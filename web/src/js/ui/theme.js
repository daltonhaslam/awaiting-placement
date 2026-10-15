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
    document.documentElement.setAttribute('data-theme', next);
    write(next);
    label();
  });
  label();
  return btn;
}
