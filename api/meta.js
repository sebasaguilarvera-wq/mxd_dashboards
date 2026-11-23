// Datos para /meta y /resumen: gasto de Meta Ads (si hay token), pedidos de la web que llegaron por Meta y visitas desde Meta en GA4.
// Variables en Vercel: META_ACCESS_TOKEN (usuario del sistema con ads_read) y META_AD_ACCOUNT_ID. Sin ellas el gasto sale vacío.
import { pedidosWeb } from './_pedidos.js';
import { ga4Cliente } from './_ga4.js';

const DIA = 86400000;
const lima = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const sumarDias = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * DIA).toISOString().slice(0, 10);
const ES_META = /facebook|instagram|^fb$|^ig$|^meta$/i;
const VERSION = 'v21.0';

async function graph(path, params) {
  const tok = process.env.META_ACCESS_TOKEN;
  const out = [];
  let url = `https://graph.facebook.com/${VERSION}/${path}?${new URLSearchParams({ ...params, access_token: tok })}`;
  while (url) {
    const r = await fetch(url).then((r) => r.json());
    if (r.error) throw new Error('Meta: ' + r.error.message);
    out.push(...(r.data || []));
    url = r.paging?.next || null;
  }
  return out;
}

const compra = (arr) => Number((arr || []).find((a) => ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'].includes(a.action_type))?.value || 0);

async function metaAds(desde, hasta, desde28) {
  const tok = process.env.META_ACCESS_TOKEN, cta = process.env.META_AD_ACCOUNT_ID;
  if (!tok || !cta) return null;
  const id = String(cta).startsWith('act_') ? cta : 'act_' + cta;
  const [dias, anuncios] = await Promise.all([
    graph(`${id}/insights`, { fields: 'spend,impressions,clicks,inline_link_clicks,actions,action_values', time_range: JSON.stringify({ since: desde, until: hasta }), time_increment: '1', limit: '500' }),
    graph(`${id}/insights`, { level: 'ad', fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,action_values', time_range: JSON.stringify({ since: desde28, until: hasta }), limit: '500' }),
  ]);
  let estados = {};
  try {
    const ads = await graph(`${id}/ads`, { fields: 'id,effective_status,adset{daily_budget}', limit: '500' });
    estados = Object.fromEntries(ads.map((a) => [a.id, { estado: a.effective_status, diario: a.adset?.daily_budget ? Number(a.adset.daily_budget) / 100 : null }]));
  } catch { /* sin permiso para leer anuncios: se muestra sin estado */ }
  return {
    dias: dias.map((d) => ({ f: d.date_start, gasto: Number(d.spend || 0), impresiones: Number(d.impressions || 0), clics: Number(d.inline_link_clicks || d.clicks || 0), comprasMeta: compra(d.actions), valorMeta: compra(d.action_values) })),
    anuncios: anuncios.map((a) => ({
      campanaId: a.campaign_id, campana: a.campaign_name, conjuntoId: a.adset_id, conjunto: a.adset_name, anuncioId: a.ad_id, anuncio: a.ad_name,
      gasto: Number(a.spend || 0), impresiones: Number(a.impressions || 0), alcance: Number(a.reach || 0), frecuencia: Number(a.frequency || 0),
      clics: Number(a.inline_link_clicks || a.clicks || 0), comprasMeta: compra(a.actions), valorMeta: compra(a.action_values),
      ...(estados[a.ad_id] || {}),
    })),
  };
}

async function visitasMeta(desde, hasta) {
  const rep = await ga4Cliente();
  const filas = await rep(['date', 'sessionSource', 'sessionMedium', 'sessionCampaignName'], desde, hasta, ['sessions', 'ecommercePurchases']);
  const dias = {}, campanas = {};
  for (const { d: [f, src, med, camp], m: [s, c] } of filas) {
    const k = `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6)}`;
    const x = (dias[k] ||= { f: k, total: 0, meta: 0 });
    x.total += s;
    if (!ES_META.test(src) && !/facebook|instagram|paid_social|paid-social/i.test(med)) continue;
    x.meta += s;
    const y = (campanas[camp] ||= { campana: camp, sesiones: 0, compras: 0 });
    y.sesiones += s; y.compras += c;
  }
  return { dias: Object.values(dias).sort((a, b) => a.f.localeCompare(b.f)), campanas: Object.values(campanas).sort((a, b) => b.sesiones - a.sesiones) };
}

export default async function handler(req, res) {
  const hoy = lima(new Date());
  const desde = sumarDias(hoy, -69), desde28 = sumarDias(hoy, -27);
  const out = { generado: new Date().toISOString(), hoy, desde, desde28, conToken: !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID), meta: null, pedidos: [], visitas: null, errores: [] };
  const [p, v, m] = await Promise.allSettled([pedidosWeb(desde), visitasMeta(desde, hoy), metaAds(desde, hoy, desde28)]);
  if (p.status === 'fulfilled') out.pedidos = p.value; else out.errores.push('Shopify: ' + p.reason.message);
  if (v.status === 'fulfilled') out.visitas = v.value; else out.errores.push('Google Analytics: ' + v.reason.message);
  if (m.status === 'fulfilled') out.meta = m.value; else out.errores.push(m.reason.message);
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json(out);
}
