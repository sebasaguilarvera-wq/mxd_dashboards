// Datos en vivo de la web MXD: ventas de Shopify y tráfico de GA4, por semana (lunes a domingo, hora de Lima).
// Variables en Vercel: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_JSON.
import { shopifyGql } from './_shopify.js';
import { ga4Cliente } from './_ga4.js';
import { pedidosWeb, CANALES } from './_pedidos.js';

const SEMANAS = 8;
const DIA = 86400000;

// Fecha de Lima (UTC-5, sin horario de verano) como 'YYYY-MM-DD'
const lima = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const lunesDe = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA).toISOString().slice(0, 10);
};
const sumarDias = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * DIA).toISOString().slice(0, 10);

// ---------- Shopify ----------
async function shopify(desde) {
  const gql = await shopifyGql();

  const pedidos = await pedidosWeb(desde);

  const productos = [];
  for (let cur = null; ; ) {
    const d = (await gql(`query($c:String){products(first:250,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor}
      nodes{title vendor totalInventory tracksInventory}}}`, { c: cur })).products;
    productos.push(...d.nodes);
    if (!d.pageInfo.hasNextPage) break;
    cur = d.pageInfo.endCursor;
  }
  // Sesiones por día según Shopify (ShopifyQL; requiere read_reports)
  let sesionesShop = [];
  try {
    const q = (await gql(`{ shopifyqlQuery(query: "FROM sessions SHOW sessions TIMESERIES day SINCE -35d UNTIL today") { tableData { rows } parseErrors } }`)).shopifyqlQuery;
    sesionesShop = (q.tableData?.rows || []).map((r) => ({ dia: r.day, sesiones: Number(r.sessions) }));
  } catch (e) { sesionesShop = null; }
  return { pedidos, productos, sesionesShop };
}

// ---------- GA4 ----------
async function ga4(desde, hasta) {
  const rep0 = await ga4Cliente();
  const rep = (dims, ini) => rep0(dims, ini, hasta);
  const [porDia, canales, campanas] = await Promise.all([
    rep(['date'], desde),
    rep(['sessionDefaultChannelGroup'], sumarDias(hasta, -27)),
    rep(['sessionCampaignName', 'sessionSourceMedium'], sumarDias(hasta, -27)),
  ]);
  return { porDia, canales, campanas };
}

export default async function handler(req, res) {
  const hoy = lima(new Date());
  const lunesActual = lunesDe(hoy);
  const semanas = Array.from({ length: SEMANAS }, (_, i) => sumarDias(lunesActual, -7 * (SEMANAS - i)));
  semanas.push(lunesActual); // semana en curso, incompleta
  const desde = semanas[0];
  const hace28 = sumarDias(hoy, -27);

  const out = { generado: new Date().toISOString(), hoy, dias: [], semanas: [], marcas: [], top: [], stockBajo: [], canales: [], campanas: [], ventasCanal: [], canalSemanas: [], pedidos: [], errores: [] };
  const fila = Object.fromEntries(semanas.map((s) => [s, { semana: s, enCurso: s === lunesActual, venta: 0, pedidos: 0, sesiones: 0, usuarios: 0, comprasGA: 0 }]));

  const [shop, ga] = await Promise.allSettled([shopify(desde), ga4(desde, hoy)]);
  // Últimos 35 días, día por día
  const dia = Object.fromEntries(Array.from({ length: 35 }, (_, i) => sumarDias(hoy, i - 34)).map((f) => [f, { dia: f, venta: 0, pedidos: 0, sesionesShop: null, sesionesGA: 0 }]));

  if (shop.status === 'fulfilled') {
    const marcas = {}, top = {};
    const canal28 = Object.fromEntries(CANALES.map((c) => [c, { canal: c, pedidos: 0, venta: 0 }]));
    const canalSem = Object.fromEntries(semanas.map((x) => [x, Object.fromEntries(CANALES.map((c) => [c, 0]))]));
    for (const o of shop.value.pedidos) {
      const f = o.f;
      const s = fila[lunesDe(f)];
      if (!s) continue;
      s.venta += o.venta;
      s.pedidos += 1;
      canalSem[lunesDe(f)][o.canal] += o.venta;
      if (dia[f]) { dia[f].venta += o.venta; dia[f].pedidos += 1; }
      if (f < hace28) continue;
      canal28[o.canal].pedidos += 1; canal28[o.canal].venta += o.venta;
      for (const li of o.lineas) {
        const q = li.q, v = li.v, li_vendor = li.marca;
        const m = (marcas[li_vendor || 'Sin marca'] ||= { marca: li_vendor || 'Sin marca', unidades: 0, venta: 0 });
        m.unidades += q; m.venta += v;
        const p = (top[li.t] ||= { producto: li.t, marca: li_vendor, unidades: 0, venta: 0 });
        p.unidades += q; p.venta += v;
      }
    }
    out.ventasCanal = Object.values(canal28).map((c) => ({ ...c, venta: Math.round(c.venta * 100) / 100 }));
    out.canalSemanas = semanas.map((x) => ({ semana: x, ...Object.fromEntries(CANALES.map((c) => [c, Math.round(canalSem[x][c] * 100) / 100])) }));
    out.pedidos = shop.value.pedidos.slice(0, 25).map((o) => ({ n: o.n, f: o.f, venta: o.venta, canal: o.canal, origen: o.origen, campana: o.campana, entrada: o.entrada,
      productos: o.lineas.map((l) => `${l.q}× ${l.t}`).join(' · ') }));
    out.marcas = Object.values(marcas).sort((a, b) => b.venta - a.venta);
    out.top = Object.values(top).sort((a, b) => b.unidades - a.unidades).slice(0, 10);
    out.stockBajo = shop.value.productos
      .filter((p) => p.tracksInventory && p.totalInventory >= 1 && p.totalInventory <= 5)
      .map((p) => ({ producto: p.title, marca: p.vendor, stock: p.totalInventory }))
      .sort((a, b) => a.stock - b.stock);
    if (shop.value.sesionesShop) shop.value.sesionesShop.forEach((r) => { if (dia[r.dia]) dia[r.dia].sesionesShop = r.sesiones; });
    else out.errores.push('Shopify: no entregó sesiones (falta permiso read_reports)');
  } else out.errores.push('Shopify: ' + shop.reason.message);

  if (ga.status === 'fulfilled') {
    for (const { d: [fecha], m } of ga.value.porDia) {
      const f = `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6)}`;
      if (dia[f]) dia[f].sesionesGA = m[0];
      const s = fila[lunesDe(f)];
      if (!s) continue;
      s.sesiones += m[0]; s.usuarios += m[1]; s.comprasGA += m[2];
    }
    out.canales = ga.value.canales.map(({ d, m }) => ({ canal: d[0], sesiones: m[0], compras: m[2], ingresos: m[3] }))
      .sort((a, b) => b.sesiones - a.sesiones);
    out.campanas = ga.value.campanas.map(({ d, m }) => ({ campana: d[0], fuenteMedio: d[1], sesiones: m[0], compras: m[2], ingresos: m[3] }))
      .sort((a, b) => b.sesiones - a.sesiones).slice(0, 15);
  } else out.errores.push('Google Analytics: ' + ga.reason.message);

  out.dias = Object.values(dia).map((d) => ({ ...d, venta: Math.round(d.venta * 100) / 100 }));
  out.semanas = semanas.map((s) => ({ ...fila[s], venta: Math.round(fila[s].venta * 100) / 100 }));
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json(out);
}
