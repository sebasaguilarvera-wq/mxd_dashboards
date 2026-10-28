// Ventanas emergentes al pasar el mouse (o tocar en el celular) sobre cualquier elemento con data-tip o title.
// Uso: data-tip="Título|línea 1\nlínea 2" — lo que va antes de "|" sale en negrita.
(() => {
  const css = document.createElement('style');
  css.textContent = `
  .mxd-tip{position:fixed;z-index:9999;pointer-events:none;max-width:280px;padding:9px 12px;border-radius:9px;
    background:rgba(29,27,23,.96);color:#fff;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    box-shadow:0 8px 24px rgba(0,0,0,.25);white-space:pre-line;opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s}
  .mxd-tip.on{opacity:1;transform:none}
  .mxd-tip b{display:block;font-weight:600;margin-bottom:2px}
  [data-tip]{cursor:help}
  svg [data-tip]{cursor:pointer}
  .mxd-hit{fill:transparent}
  .mxd-hit:hover{fill:rgba(127,127,127,.12)}
  tbody tr{transition:background .12s}
  tbody tr:hover td{background:color-mix(in srgb,var(--acc,#0f6b55) 7%,transparent)}
  .kpi,.alerta,.card,.panel{transition:transform .15s,box-shadow .15s,border-color .15s}
  .kpi:hover,.alerta:hover,a.card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.08)}
  svg circle{transition:r .12s}
  svg circle:hover{r:7}
  @media (prefers-reduced-motion:reduce){.mxd-tip,.kpi,.alerta,.card{transition:none}}
  `;
  document.head.appendChild(css);
  const tip = document.createElement('div');
  tip.className = 'mxd-tip';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tip));
  if (document.body) document.body.appendChild(tip);

  let actual = null;
  const objetivo = (el) => {
    for (; el && el !== document; el = el.parentNode) {
      if (!el.getAttribute) continue;
      if (el.hasAttribute('title') && el.tagName !== 'svg') { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
      const t = el.querySelector?.(':scope > title');
      if (t && el.tagName !== 'svg') { el.dataset.tip = t.textContent; t.remove(); }
      if (el.dataset?.tip) return el;
    }
    return null;
  };
  const pintar = (texto) => {
    tip.textContent = '';
    const [a, b] = texto.includes('|') ? texto.split('|') : [null, texto];
    if (a) { const h = document.createElement('b'); h.textContent = a; tip.append(h); }
    tip.append(b);
  };
  const mover = (x, y) => {
    const r = tip.getBoundingClientRect(), m = 12;
    let left = x + 14, top = y + 16;
    if (left + r.width > innerWidth - m) left = x - r.width - 14;
    if (top + r.height > innerHeight - m) top = y - r.height - 12;
    tip.style.left = Math.max(m, left) + 'px';
    tip.style.top = Math.max(m, top) + 'px';
  };
  document.addEventListener('pointerover', (e) => {
    const el = objetivo(e.target);
    if (el === actual) return;
    actual = el;
    if (!el) { tip.classList.remove('on'); return; }
    pintar(el.dataset.tip);
    mover(e.clientX, e.clientY);
    tip.classList.add('on');
  });
  document.addEventListener('pointermove', (e) => { if (actual) mover(e.clientX, e.clientY); });
  document.addEventListener('pointerout', (e) => { if (actual && !actual.contains(e.relatedTarget)) { actual = null; tip.classList.remove('on'); } });
  addEventListener('scroll', () => { actual = null; tip.classList.remove('on'); }, { passive: true });
})();
