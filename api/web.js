// Datos de Web y Google: pedidos de Shopify con su canal, sesiones (Shopify y GA4), canales y campañas de GA4, stock bajo.
// ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (por defecto, este mes). También trae el periodo anterior de igual largo para comparar.
// Variables en Vercel: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_JSON.
import { shopifyGql } from './_shopify.js';
import { ga4Cliente } from './_ga4.js';
import { pedidosWeb } from './_pedidos.js';

const DIA = 86400000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const lima = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const sumarDias = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * DIA).toISOString().slice(0, 10);
const gaFecha = (f) => `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6)}`;

async function shopify(desdePrev, hasta) {
  const gql = await shopifyGql();
  const productos = [];
  for (let cur = null; ; ) {
    const d = (await gql(`query($c:String){products(first:250,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor}
      nodes{title vendor totalInventory tracksInventory}}}`, { c: cur })).products;
    productos.push(...d.nodes);
    if (!d.pageInfo.hasNextPage) break;
    cur = d.pageInfo.endCursor;
  }
  let sesiones = null;
  try {
    const q = (await gql(`{ shopifyqlQuery(query: "FROM sessions SHOW sessions TIMESERIES day SINCE ${desdePrev} UNTIL ${hasta}") { tableData { rows } parseErrors } }`)).shopifyqlQuery;
    sesiones = Object.fromEntries((q.tableData?.rows || []).map((r) => [r.day, Number(r.sessions)]));
  } catch { /* falta permiso read_reports */ }
  return { productos, sesiones };
}

async function ga4(desdePrev, desde, hasta) {
  const rep = await ga4Cliente();
  const [porDia, canales, campanas] = await Promise.all([
    rep(['date'], desdePrev, hasta),
    rep(['sessionDefaultChannelGroup'], desde, hasta),
    rep(['sessionCampaignName', 'sessionSourceMedium'], desde, hasta),
  ]);
  return { porDia, canales, campanas };
}

export default async function handler(req, res) {
  const hoy = lima(new Date());
  const hasta = FECHA.test(req.query.hasta || '') && req.query.hasta <= hoy ? req.query.hasta : hoy;
  let desde = FECHA.test(req.query.desde || '') ? req.query.desde : hoy.slice(0, 8) + '01';
  if (desde > hasta) desde = hasta;
  const nd = Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA) + 1;
  const desdePrev = sumarDias(desde, -nd);

  const out = { generado: new Date().toISOString(), hoy, desde, hasta, desdePrev, pedidos: [], dias: [], canales: [], campanas: [], stockBajo: [], errores: [] };
  const [ped, shop, ga] = await Promise.allSettled([pedidosWeb(desdePrev), shopify(desdePrev, hasta), ga4(desdePrev, desde, hasta)]);

  if (ped.status === 'fulfilled') out.pedidos = ped.value.filter((o) => o.f <= hasta);
  else out.errores.push('Shopify: ' + ped.reason.message);

  const dias = {};
  for (let f = desdePrev; f <= hasta; f = sumarDias(f, 1)) dias[f] = { dia: f, sesionesShop: null, sesionesGA: 0 };
  if (shop.status === 'fulfilled') {
    out.stockBajo = shop.value.productos
      .filter((p) => p.tracksInventory && p.totalInventory >= 1 && p.totalInventory < 5)
      .map((p) => ({ producto: p.title, marca: p.vendor, stock: p.totalInventory }))
      .sort((a, b) => a.stock - b.stock);
    if (shop.value.sesiones) for (const f in dias) dias[f].sesionesShop = shop.value.sesiones[f] ?? 0;
    else out.errores.push('Shopify: no entregó sesiones (falta permiso read_reports)');
  } else out.errores.push('Shopify: ' + shop.reason.message);

  if (ga.status === 'fulfilled') {
    for (const { d: [f], m } of ga.value.porDia) if (dias[gaFecha(f)]) dias[gaFecha(f)].sesionesGA = m[0];
    out.canales = ga.value.canales.map(({ d, m }) => ({ canal: d[0], sesiones: m[0], compras: m[2], ingresos: m[3] })).sort((a, b) => b.sesiones - a.sesiones);
    out.campanas = ga.value.campanas.map(({ d, m }) => ({ campana: d[0], fuenteMedio: d[1], sesiones: m[0], compras: m[2], ingresos: m[3] })).sort((a, b) => b.sesiones - a.sesiones).slice(0, 15);
  } else out.errores.push('Google Analytics: ' + ga.reason.message);

  out.dias = Object.values(dias);
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json(out);
}
