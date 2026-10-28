// Cliente de la API Seller Center de Falabella (firma HMAC-SHA256).
// Variables en Vercel: FALABELLA_API_KEY y FALABELLA_USER_ID (seller ID, va en el User-Agent).
import crypto from 'node:crypto';

const USER = 'sebastian.aguilar@mxd.pe';
const URL_API = 'https://sellercenter-api.falabella.com/';
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export async function call(action, extra = {}) {
  const p = { Action: action, Format: 'JSON', Timestamp: new Date().toISOString().slice(0, 19) + '+00:00', UserID: USER, Version: '1.0' };
  for (const [k, v] of Object.entries(extra)) p[k] = String(v);
  const q = Object.keys(p).sort().map((k) => `${enc(k)}=${enc(p[k])}`).join('&');
  const sig = crypto.createHmac('sha256', process.env.FALABELLA_API_KEY).update(q).digest('hex');
  const r = await fetch(`${URL_API}?${q}&Signature=${sig}`, {
    headers: { 'User-Agent': `${process.env.FALABELLA_USER_ID}/Node/20/PROPIA/FACPE`, Accept: 'application/json' },
  });
  const j = await r.json();
  if (j.ErrorResponse) throw new Error('Falabella: ' + (j.ErrorResponse.Head?.ErrorMessage || 'error'));
  return j.SuccessResponse;
}

// La API devuelve un objeto suelto cuando hay un solo elemento y '' cuando no hay ninguno
const lista = (x) => (!x ? [] : Array.isArray(x) ? x : [x]);

export async function productos() {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await call('GetProducts', { Filter: 'all', Limit: 1000, Offset: off });
    const ps = lista(r.Body.Products?.Product);
    out.push(...ps);
    if (ps.length < 1000) break;
  }
  return out;
}

// GetOrders solo devuelve ~45 días por consulta: se recorre por ventanas de 30 días
export async function items(desde = '2025-01-01') {
  const ventanas = [];
  for (let t = Date.parse(desde + 'T00:00:00-05:00'); t < Date.now(); t += 30 * 864e5) ventanas.push(t);
  const iso = (t) => new Date(t - 5 * 3600e3).toISOString().slice(0, 19) + '-05:00';
  const ordenes = new Map();
  await Promise.all(ventanas.map(async (t) => {
    for (let off = 0; ; off += 100) {
      const r = await call('GetOrders', { CreatedAfter: iso(t), CreatedBefore: iso(t + 30 * 864e5), Limit: 100, Offset: off });
      const os = lista(r.Body.Orders).map((o) => o.Order || o);
      os.forEach((o) => ordenes.set(o.OrderId, o));
      if (os.length < 100) break;
    }
  }));
  const ids = [...ordenes.keys()];
  const out = [];
  const lotes = [];
  for (let i = 0; i < ids.length; i += 50) lotes.push(ids.slice(i, i + 50));
  await Promise.all(lotes.map(async (lote) => {
    const r = await call('GetMultipleOrderItems', { OrderIdList: '[' + lote.join(',') + ']' });
    for (const o of lista(r.Body.Orders?.Order)) for (const it of lista(o.OrderItems?.OrderItem)) out.push(it);
  }));
  return out;
}

export const ESTADO = { delivered: 'Entregado', shipped: 'Enviado', returned: 'Devuelto', canceled: 'Cancelado' };
