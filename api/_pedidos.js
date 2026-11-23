// Pedidos de la web (Shopify) con su canal de origen, para Web y Google, Meta y Resumen.
// El canal sale del recorrido del pedido en Shopify (customerJourneySummary):
// se mira primero la última visita y, si fue directa o interna, la primera.
import { shopifyGql } from './_shopify.js';

export const CANALES = ['Meta', 'Google pagado', 'Google orgánico', 'Influencer', 'Directo y otros'];

const lima = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const INTERNO = /(^|\.)(mxd\.pe|pasillo\.pe|myshopify\.com)/i;
const META = /facebook|instagram|^fb$|^ig$|^meta$|^msg$|^an$/i; // utm_source={{site_source_name}} da fb, ig, msg o an

const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

// Canal de una visita, o null si fue directa o vino de la misma tienda
function canalVisita(v) {
  if (!v) return null;
  const u = v.utmParameters || {};
  const src = (u.source || '').trim(), med = (u.medium || '').trim();
  const ref = host(v.referrerUrl || ''), land = v.landingPage || '';
  if (/[?&]fbclid=/.test(land) || META.test(src) || /paid_social|paid-social/i.test(med) || /facebook|instagram/i.test(ref)) return 'Meta';
  if (/influencer/i.test(med)) return 'Influencer';
  if (/[?&](gclid|gbraid|wbraid)=/.test(land) || (/google/i.test(src) && /cpc|ppc|paid/i.test(med)) || /SEM/i.test(v.sourceType || '')) return 'Google pagado';
  if (src) return /google/i.test(src) ? 'Google orgánico' : 'Directo y otros';
  if (/google\./i.test(ref) || (/google/i.test(v.source || '') && /SEO/i.test(v.sourceType || ''))) return 'Google orgánico';
  if (ref && !INTERNO.test(ref)) return 'Directo y otros';
  return null;
}

export function canalDe(cjs) {
  const ult = cjs?.lastVisit, pri = cjs?.firstVisit;
  for (const v of [ult, pri]) {
    const c = canalVisita(v);
    if (c) {
      const u = v.utmParameters || {};
      return {
        canal: c,
        origen: u.source ? `${u.source} / ${u.medium || ''}`.trim() : (v.source || host(v.referrerUrl || '') || ''),
        campana: u.campaign || '', anuncio: u.content || '', conjunto: u.term || '',
        entrada: (v.landingPage || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0],
      };
    }
  }
  return { canal: 'Directo y otros', origen: 'directo', campana: '', anuncio: '', conjunto: '', entrada: (ult?.landingPage || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0] };
}

// Pedidos válidos desde una fecha (AAAA-MM-DD): sin cancelados ni pruebas, con canal y líneas
export async function pedidosWeb(desde) {
  const gql = await shopifyGql();
  const visita = 'source sourceType referrerUrl landingPage utmParameters{source medium campaign content term}';
  const crudos = [];
  for (let cur = null; ; ) {
    const d = (await gql(`query($c:String,$q:String){orders(first:100,after:$c,query:$q){pageInfo{hasNextPage endCursor}
      nodes{name createdAt cancelledAt test currentSubtotalPriceSet{shopMoney{amount}} totalShippingPriceSet{shopMoney{amount}}
      customerJourneySummary{firstVisit{${visita}} lastVisit{${visita}}}
      lineItems(first:50){nodes{sku title vendor currentQuantity discountedTotalSet{shopMoney{amount}}}}}}}`,
      { c: cur, q: `created_at:>=${desde}` })).orders;
    crudos.push(...d.nodes);
    if (!d.pageInfo.hasNextPage) break;
    cur = d.pageInfo.endCursor;
  }
  return crudos
    .filter((o) => !o.cancelledAt && !o.test && !o.lineItems.nodes.some((li) => li.vendor === 'MXD' && /prueba/i.test(li.title)))
    .map((o) => ({
      n: o.name,
      f: lima(new Date(o.createdAt)),
      venta: Number(o.currentSubtotalPriceSet.shopMoney.amount),
      envio: Number(o.totalShippingPriceSet?.shopMoney?.amount || 0),
      ...canalDe(o.customerJourneySummary),
      lineas: o.lineItems.nodes.filter((li) => li.currentQuantity > 0).map((li) => ({
        sku: li.sku || '', t: li.title, marca: li.vendor || '', q: li.currentQuantity, v: Number(li.discountedTotalSet.shopMoney.amount),
      })),
    }))
    .sort((a, b) => b.f.localeCompare(a.f) || b.n.localeCompare(a.n));
}
