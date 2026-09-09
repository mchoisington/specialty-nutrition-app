// Breathe: the 10-minute Visual Reset, a self-contained grounding activity, embedded as-is.
// It runs from breathe.html when the app is served from a folder, or from inline HTML in the single-file build.
import { uiEsc } from './common.js';

export function renderBreatheScreen(main) {
  const inline = typeof window !== 'undefined' && window.__APP_DATA__ && window.__APP_DATA__.breatheHtml;
  main.innerHTML = `
    <section class="breathe-wrap">
      <h1>Take a minute to breathe</h1>
      <p class="muted">A short visual reset. Nothing here is tracked or saved. Press play, follow the screen, and come back when you are ready. Ten minutes is the full version; stopping early is fine.</p>
      <div class="breathe-frame">
        <iframe id="breathe-iframe" title="Visual reset" ${inline ? '' : 'src="breathe.html"'} loading="eager"></iframe>
      </div>
      <div class="breathe-actions">
        <button type="button" class="btn" id="breathe-full">Open full screen</button>
      </div>
      <style>
        .breathe-wrap h1 { margin-bottom: .25rem; }
        .breathe-frame { position: relative; width: 100%; height: min(78vh, 900px); border-radius: 12px; overflow: hidden; background: #10151a; border: 1px solid var(--border, #d0d4da); }
        .breathe-frame iframe { width: 100%; height: 100%; border: 0; display: block; background: #10151a; }
        .breathe-actions { margin-top: .75rem; display: flex; gap: .5rem; }
      </style>
    </section>`;
  const frame = main.querySelector('#breathe-iframe');
  if (inline) frame.srcdoc = window.__APP_DATA__.breatheHtml;
  main.querySelector('#breathe-full').addEventListener('click', () => {
    const el = frame;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(() => {});
  });
}
