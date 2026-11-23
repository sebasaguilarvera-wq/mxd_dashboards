// Datos del tablero /meta (ventas): Meta Ads cruzado con los pedidos de Shopify.
// ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (por defecto, últimos 28 días). Variables: META_ACCESS_TOKEN y META_AD_ACCOUNT_ID.
// "Meta dice" = compras que reporta el píxel. "Shopify dice" = pedidos reales cuya visita trae el UTM del anuncio.
import { pedidosWeb } from './_pedidos.js';
import { ga4Cliente } from './_ga4.js';

const DIA = 86400000;
const lima = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const sumarDias = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * DIA).toISOString().slice(0, 10);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = 'v21.0';

async function graph(path, params) {
  const out = [];
  let url = `https://graph.facebook.com/${VERSION}/${path}?${new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN })}`;
  while (url) {
    const r = await fetch(url).then((r) => r.json());
    if (r.error) throw new Error('Meta: ' + r.error.message);
    out.push(...(r.data || []));
    url = r.paging?.next || null;
  }
  return out;
}

// Pasos del embudo según el píxel
const PASOS = {
  visitas: ['landing_page_view'],
  vioProducto: ['offsite_conversion.fb_pixel_view_content', 'view_content', 'omni_view_content'],
  carrito: ['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart', 'omni_add_to_cart'],
  pago: ['offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout', 'omni_initiated_checkout'],
  compras: ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
};
const accion = (arr, tipos) => { for (const t of tipos) { const a = (arr || []).find((x) => x.action_type === t); if (a) return Number(a.value); } return 0; };
const fila = (d) => ({
  gasto: Number(d.spend || 0), impresiones: Number(d.impressions || 0), alcance: Number(d.reach || 0),
  clics: Number(d.inline_link_clicks || 0),
  ...Object.fromEntries(Object.entries(PASOS).map(([k, t]) => [k, accion(d.actions, t)])),
  valorMeta: accion(d.action_values, PASOS.compras),
});
const CAMPOS = 'spend,impressions,reach,inline_link_clicks,actions,action_values';

async function meta(desde, hasta, desdeMes) {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) return null;
  const cta = String(process.env.META_AD_ACCOUNT_ID), id = cta.startsWith('act_') ? cta : 'act_' + cta;
  const rango = JSON.stringify({ since: desde, until: hasta });
  const [total, dias, meses, campanas, anuncios] = await Promise.all([
    graph(`${id}/insights`, { fields: CAMPOS, time_range: rango }),
    graph(`${id}/insights`, { fields: CAMPOS, time_range: rango, time_increment: '1', limit: '500' }),
    graph(`${id}/insights`, { fields: CAMPOS, time_range: JSON.stringify({ since: desdeMes, until: hasta }), time_increment: 'monthly' }),
    graph(`${id}/insights`, { level: 'campaign', fields: 'campaign_id,campaign_name,objective,' + CAMPOS, time_range: rango, limit: '500' }),
    graph(`${id}/insights`, { level: 'ad', fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,' + CAMPOS, time_range: rango, limit: '500' }),
  ]);
  let info = {};
  try {
    const ads = await graph(`${id}/ads`, { fields: 'id,effective_status,creative{thumbnail_url,object_type,video_id}', limit: '500' });
    info = Object.fromEntries(ads.map((a) => [a.id, { estado: a.effective_status, foto: a.creative?.thumbnail_url || null, formato: a.creative?.video_id ? 'VIDEO' : a.creative?.object_type || '' }]));
  } catch { /* sin permiso para leer creativos */ }
  return {
    total: total[0] ? fila(total[0]) : fila({}),
    dias: dias.map((d) => ({ f: d.date_start, ...fila(d) })),
    meses: meses.map((d) => ({ mes: d.date_start.slice(0, 7), ...fila(d) })),
    campanas: campanas.map((c) => ({ id: c.campaign_id, nombre: c.campaign_name, objetivo: c.objective || '', ...fila(c) })),
    anuncios: anuncios.map((a) => ({ id: a.ad_id, nombre: a.ad_name, campanaId: a.campaign_id, campana: a.campaign_name, conjunto: a.adset_name, ...fila(a), ...(info[a.ad_id] || {}) })),
  };
}

async function visitasMeta(desde, hasta) {
  const rep = await ga4Cliente();
  const filas = await rep(['sessionSource', 'sessionMedium'], desde, hasta, ['sessions']);
  return filas.filter(({ d: [s, m] }) => /facebook|instagram|^fb$|^ig$|^msg$|^an$/i.test(s) || /paid_social|paid-social/i.test(m)).reduce((t, { m: [x] }) => t + x, 0);
}

export default async function handler(req, res) {
  const hoy = lima(new Date());
  const hasta = FECHA.test(req.query.hasta || '') && req.query.hasta <= hoy ? req.query.hasta : hoy;
  let desde = FECHA.test(req.query.desde || '') ? req.query.desde : sumarDias(hasta, -27);
  if (desde > hasta) desde = hasta;
  const desdeMes = sumarDias(hasta, -185).slice(0, 8) + '01'; // evolutivo: 6 meses, independiente del filtro
  const out = { generado: new Date().toISOString(), hoy, desde, hasta, desdeMes, conToken: !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID), meta: null, pedidos: [], visitasGA: null, errores: [] };
  const [p, m, v] = await Promise.allSettled([pedidosWeb(desde < desdeMes ? desde : desdeMes), meta(desde, hasta, desdeMes), visitasMeta(desde, hasta)]);
  if (p.status === 'fulfilled') out.pedidos = p.value.filter((o) => o.canal === 'Meta' && o.f <= hasta); else out.errores.push('Shopify: ' + p.reason.message);
  if (m.status === 'fulfilled') out.meta = m.value; else out.errores.push(m.reason.message);
  if (v.status === 'fulfilled') out.visitasGA = v.value; else out.errores.push('Google Analytics: ' + v.reason.message);
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json(out);
}
