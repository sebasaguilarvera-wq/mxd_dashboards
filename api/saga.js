// Datos en vivo de Saga Falabella para los tableros Classic World (?m=cw) y Angeltex (?m=angeltex).
// Devuelve las ventas y el stock con la misma forma que usaban las versiones fijas de los tableros.
import { productos, items, ESTADO } from './_falabella.js';

const precio = (bu) => Number(bu.SpecialPrice || bu.Price);
const fotos = (p) => {
  const im = p.Images?.Image;
  return !im ? 0 : Array.isArray(im) ? im.length : 1;
};

function classicWorld(P, I) {
  const cw = P.filter((p) => /classic/i.test(p.Brand));
  const sku = new Set(cw.map((p) => p.SellerSku));
  const marcaDe = Object.fromEntries(P.map((p) => [p.SellerSku, p.Brand]));
  const stock = {}, fichas = {};
  for (const p of cw) {
    const bu = p.BusinessUnits.BusinessUnit;
    stock[p.SellerSku] = { n: p.Name, s: Number(bu.Stock), pr: precio(bu), u: p.Url };
    fichas[p.SellerSku] = { cs: p.ContentScore ? Number(p.ContentScore) : null, img: fotos(p), act: bu.Status === 'active' };
  }
  const ventas = I.filter((i) => (marcaDe[i.Sku] ? sku.has(i.Sku) : /classic/i.test(i.Name)))
    .map((i) => ({ f: i.CreatedAt.slice(0, 10), k: i.Sku, n: i.Name, e: ESTADO[i.Status] || i.Status, p: Number(i.PaidPrice) }))
    .sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
  return { data: { ventas, stock }, fichas };
}

// Nombre de modelo sin talla/color ni marca (misma limpieza que el tablero original)
function limpiar(n) {
  n = n.replace(/\s*\/\s*[^/]*(\/[^/]*)?$/, '').trim();
  n = n.replace(/^samsara\s+/i, '').replace(/\s*sam\.\S*/gi, '').replace(/\s*\/\s*[a-zA-Z]+$/, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

function angeltex(P, I) {
  const porSku = Object.fromEntries(P.map((p) => [p.SellerSku, p]));
  const marca = (s) => (porSku[s] ? porSku[s].Brand : s.startsWith('SAM') ? 'SAMSARA' : null);
  const modelos = {};
  let nylon = null;
  for (const p of P) {
    if (!['SAMSARA', 'COCOON'].includes(p.Brand)) continue;
    const bu = p.BusinessUnits.BusinessUnit, q = p.SellerSku;
    const t = p.Brand === 'COCOON' ? q.split('-').slice(1).join(' ') : q.split('.').slice(-2).join(' ');
    const d = (modelos[p.ParentSku] ||= { m: p.ParentSku, b: p.Brand[0] + p.Brand.slice(1).toLowerCase(), n: limpiar(p.Name), u: p.Url, v: [] });
    d.v.push({ k: q, t, s: Number(bu.Stock), pr: precio(bu), cs: Number(p.ContentScore || 0), img: fotos(p), act: bu.Status === 'active' });
    if (q.startsWith('SAM.05NYL.')) nylon = p.ParentSku;
  }
  const modeloDe = {};
  for (const d of Object.values(modelos)) for (const v of d.v) modeloDe[v.k] = d.m;
  const ventas = [];
  for (const i of I) {
    const b = marca(i.Sku);
    if (!['SAMSARA', 'COCOON'].includes(b)) continue;
    ventas.push({
      f: i.CreatedAt.slice(0, 10), k: i.Sku,
      m: modeloDe[i.Sku] || (i.Sku.startsWith('SAM.05NYL') ? nylon : i.Sku),
      b: b[0] + b.slice(1).toLowerCase(), e: ESTADO[i.Status] || i.Status, p: Number(i.PaidPrice),
    });
  }
  ventas.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
  return { data: { ventas, modelos: Object.values(modelos) } };
}

export default async function handler(req, res) {
  try {
    const m = req.query.m;
    if (!['cw', 'angeltex'].includes(m)) return res.status(400).json({ error: 'Usa ?m=cw o ?m=angeltex' });
    const [P, I] = await Promise.all([productos(), items(m === 'cw' ? '2025-01-01' : '2026-08-01')]);
    const out = m === 'cw' ? classicWorld(P, I) : angeltex(P, I);
    out.hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    out.generado = new Date().toISOString();
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
