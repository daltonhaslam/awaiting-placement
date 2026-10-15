// The page's timing constants, in one place so the app and the e2e checks agree on them.
export const HASH_DEBOUNCE_MS = 300; // the calculator writes the URL hash this long after the last change
export const LIVE_DEBOUNCE_MS = 500; // and announces the result to screen readers this long after it
export const CALLED_MS = 6000; // the "Now serving N" notice stays this long, then fades on its own
export const NOTICE_FADE_MS = 300; // the notice's fade; keep in step with the .called transition in components.css
