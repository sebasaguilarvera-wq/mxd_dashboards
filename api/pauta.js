// Datos para el tablero de pauta en prueba (/pauta).
// Web MXD: pedidos de Shopify con su origen (UTM / referente) y visitas que llegan desde Meta según GA4.
// Meta Ads: gasto por día solo si existen META_ACCESS_TOKEN y META_AD_ACCOUNT_ID en Vercel (si no, el gasto se estima o se escribe a mano).
// Las ventas de Saga salen de /api/saga?m=angeltex.
import { shopifyGql } from './_shopify.js';
import { ga4Cliente } from './_ga4.js';

const DIA = 86400000;
const lima = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const sumarDias = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * DIA).toISOString().slice(0, 10);
const ES_META = /facebook|instagram|^fb$|^ig$|meta|fbclid|l\.facebook|lm\.facebook/i;

async function pedidos(desde) {
  const gql = await shopifyGql();
  const out = [];
  for (let cur = null; ; ) {
    const d = (await gql(`query($c:String,$q:String){orders(first:100,after:$c,query:$q){pageInfo{hasNextPage endCursor}
      nodes{name createdAt cancelledAt test currentSubtotalPriceSet{shopMoney{amount}}
      customerJourneySummary{firstVisit{source referrerUrl landingPage utmParameters{source medium campaign}}
        lastVisit{source referrerUrl landingPage utmParameters{source medium campaign}}}
      lineItems(first:50){nodes{title vendor currentQuantity originalUnitPriceSet{shopMoney{amount}} discountedTotalSet{shopMoney{amount}}}}}}}`,
      { c: cur, q: `created_at:>=${desde}` })).orders;
    out.push(...d.nodes);
    if (!d.pageInfo.hasNextPage) break;
    cur = d.pageInfo.endCursor;
  }
  return out
    .filter((o) => !o.cancelledAt && !o.test && !o.lineItems.nodes.some((li) => li.vendor === 'MXD' && /prueba/i.test(li.title)))
    .map((o) => {
      const v = [o.customerJourneySummary?.lastVisit, o.customerJourneySummary?.firstVisit].filter(Boolean);
      const txt = (x) => [x.source, x.referrerUrl, x.landingPage, x.utmParameters?.source, x.utmParameters?.medium].filter(Boolean).join(' ');
      const meta = v.some((x) => ES_META.test(txt(x)));
      const ult = v[0];
      const cw = o.lineItems.nodes.filter((li) => li.vendor === 'Classic World' && li.currentQuantity > 0);
      return {
        n: o.name,
        f: lima(new Date(o.createdAt)),
        total: Number(o.currentSubtotalPriceSet.shopMoney.amount),
        cw: Math.round(cw.reduce((s, li) => s + Number(li.discountedTotalSet.shopMoney.amount), 0) * 100) / 100,
        cwU: cw.reduce((s, li) => s + li.currentQuantity, 0),
        cw100: cw.some((li) => Number(li.originalUnitPriceSet.shopMoney.amount) >= 100),
        productos: cw.map((li) => li.title),
        meta,
        origen: ult ? (ult.utmParameters?.source ? `${ult.utmParameters.source} / ${ult.utmParameters.medium || ''}`.trim() : ult.source || '') : '',
        campana: ult?.utmParameters?.campaign || '',
      };
    });
}

async function visitasMeta(desde, hasta) {
  const rep = await ga4Cliente();
  const filas = await rep(['date', 'sessionSource', 'sessionMedium'], desde, hasta, ['sessions']);
  const dias = {};
  for (const { d: [f, src, med], m: [s] } of filas) {
    const k = `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6)}`;
    const x = (dias[k] ||= { f: k, total: 0, meta: 0 });
    x.total += s;
    if (ES_META.test(src + ' ' + med)) x.meta += s;
  }
  return Object.values(dias).sort((a, b) => a.f.localeCompare(b.f));
}

async function metaAds(desde, hasta) {
  const tok = process.env.META_ACCESS_TOKEN, cta = process.env.META_AD_ACCOUNT_ID;
  if (!tok || !cta) return null;
  const id = String(cta).startsWith('act_') ? cta : 'act_' + cta;
  const q = new URLSearchParams({
    fields: 'spend,actions,action_values,impressions,clicks',
    time_range: JSON.stringify({ since: desde, until: hasta }),
    time_increment: '1',
    limit: '500',
    access_token: tok,
  });
  const r = await fetch(`https://graph.facebook.com/v21.0/${id}/insights?${q}`).then((r) => r.json());
  if (r.error) throw new Error('Meta: ' + r.error.message);
  const compra = (arr) => Number((arr || []).find((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);
  return (r.data || []).map((d) => ({
    f: d.date_start,
    gasto: Number(d.spend || 0),
    compras: compra(d.actions),
    valor: compra(d.action_values),
    clics: Number(d.clicks || 0),
    impresiones: Number(d.impressions || 0),
  }));
}

export default async function handler(req, res) {
  const hoy = lima(new Date());
  const desde = sumarDias(hoy, -59);
  const out = { generado: new Date().toISOString(), hoy, desde, pedidos: [], visitas: [], meta: null, errores: [] };
  const [p, v, m] = await Promise.allSettled([pedidos(desde), visitasMeta(desde, hoy), metaAds(desde, hoy)]);
  if (p.status === 'fulfilled') out.pedidos = p.value; else out.errores.push('Shopify: ' + p.reason.message);
  if (v.status === 'fulfilled') out.visitas = v.value; else out.errores.push('Google Analytics: ' + v.reason.message);
  if (m.status === 'fulfilled') out.meta = m.value; else out.errores.push(m.reason.message);
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json(out);
}
