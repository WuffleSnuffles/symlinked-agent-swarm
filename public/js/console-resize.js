// Expand the console over the roster without changing the roster's layout.
export function initConsoleResize() {
  if (document.body.className.includes('panel-')) return;
  const main = document.getElementById('panopticon-main-container');
  const roster = document.getElementById('section-cubicles');
  const consolePanel = document.getElementById('section-console');
  if (!main || !roster || !consolePanel) return;
  const handle = document.createElement('div');
  handle.id = 'console-resize-handle';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Console edge; drag left to cover cubicles');
  handle.setAttribute('aria-controls', 'section-console');
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '100');
  handle.title = 'Drag to cover/reveal cubicles. Double-click to reset.';
  main.appendChild(handle);
  let fraction = 0;
  let pointer = null;
  try { fraction = Math.max(0, Math.min(1, Number(localStorage.getItem('console-roster-cover')) || 0)); } catch {}
  function render() {
    const width = roster.getBoundingClientRect().width;
    consolePanel.style.marginLeft = `${-width * fraction}px`;
    handle.style.left = `${Math.max(0, width * (1 - fraction) - 5)}px`;
    handle.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    handle.setAttribute('aria-valuetext', `${Math.round(fraction * 100)}% of roster covered`);
  }
  function save() {
    try { localStorage.setItem('console-roster-cover', String(fraction)); } catch {}
  }
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    handle.setPointerCapture(pointer);
    main.classList.add('console-resizing');
  });
  handle.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    const rect = roster.getBoundingClientRect();
    fraction = Math.max(0, Math.min(1, 1 - (event.clientX - rect.left) / Math.max(1, rect.width)));
    render();
  });
  function finish() {
    pointer = null;
    main.classList.remove('console-resizing');
    save();
  }
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('dblclick', () => { fraction = 0; render(); save(); });
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    fraction = event.key === 'Home' ? 0 : event.key === 'End' ? 1
      : Math.max(0, Math.min(1, fraction + (event.key === 'ArrowLeft' ? 0.05 : -0.05)));
    render();
    save();
  });
  new ResizeObserver(render).observe(roster);
  render();
}
