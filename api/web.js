// Datos en vivo de la web MXD: ventas de Shopify y tráfico de GA4, por semana (lunes a domingo, hora de Lima).
// Variables en Vercel: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_JSON.
import crypto from 'node:crypto';

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
  const dom = process.env.SHOPIFY_STORE_DOMAIN || 'mxd-6202.myshopify.com';
  const ver = process.env.SHOPIFY_API_VERSION || '2025-07';
  const t = await fetch(`https://${dom}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  }).then((r) => r.json());
  if (!t.access_token) throw new Error('Shopify no entregó token');
  const gql = async (query, variables) => {
    const r = await fetch(`https://${dom}/admin/api/${ver}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t.access_token },
      body: JSON.stringify({ query, variables }),
    }).then((r) => r.json());
    if (r.errors) throw new Error('Shopify: ' + JSON.stringify(r.errors).slice(0, 200));
    return r.data;
  };

  const orders = [];
  for (let cur = null; ; ) {
    const d = (await gql(`query($c:String,$q:String){orders(first:100,after:$c,query:$q){pageInfo{hasNextPage endCursor}
      nodes{createdAt cancelledAt test currentSubtotalPriceSet{shopMoney{amount}}
      lineItems(first:50){nodes{title vendor currentQuantity discountedTotalSet{shopMoney{amount}}}}}}}`,
      { c: cur, q: `created_at:>=${desde}` })).orders;
    orders.push(...d.nodes);
    if (!d.pageInfo.hasNextPage) break;
    cur = d.pageInfo.endCursor;
  }

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
  // Pedidos válidos: sin cancelados, sin pruebas
  const validos = orders.filter((o) => !o.cancelledAt && !o.test &&
    !o.lineItems.nodes.some((li) => li.vendor === 'MXD' && /prueba/i.test(li.title)));
  return { pedidos: validos, productos, sesionesShop };
}

// ---------- GA4 ----------
async function ga4Token() {
  let raw = (process.env.GA4_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(raw);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  });
  const jwt = body + '.' + crypto.createSign('RSA-SHA256').update(body).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  }).then((r) => r.json());
  if (!r.access_token) throw new Error('Google no entregó token');
  return r.access_token;
}

async function ga4(desde, hasta) {
  const tok = await ga4Token();
  const rep = async (dims, ini) => {
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA4_PROPERTY_ID}:runReport`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dimensions: dims.map((name) => ({ name })),
        metrics: ['sessions', 'totalUsers', 'ecommercePurchases', 'purchaseRevenue'].map((name) => ({ name })),
        dateRanges: [{ startDate: ini, endDate: hasta }],
        limit: 10000,
      }),
    }).then((r) => r.json());
    if (r.error) throw new Error('GA4: ' + r.error.message);
    return (r.rows || []).map((row) => ({
      d: row.dimensionValues.map((x) => x.value),
      m: row.metricValues.map((x) => Number(x.value)),
    }));
  };
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

  const out = { generado: new Date().toISOString(), hoy, dias: [], semanas: [], marcas: [], top: [], stockBajo: [], canales: [], campanas: [], errores: [] };
  const fila = Object.fromEntries(semanas.map((s) => [s, { semana: s, enCurso: s === lunesActual, venta: 0, pedidos: 0, sesiones: 0, usuarios: 0, comprasGA: 0 }]));

  const [shop, ga] = await Promise.allSettled([shopify(desde), ga4(desde, hoy)]);
  // Últimos 35 días, día por día
  const dia = Object.fromEntries(Array.from({ length: 35 }, (_, i) => sumarDias(hoy, i - 34)).map((f) => [f, { dia: f, venta: 0, pedidos: 0, sesionesShop: null, sesionesGA: 0 }]));

  if (shop.status === 'fulfilled') {
    const marcas = {}, top = {};
    for (const o of shop.value.pedidos) {
      const f = lima(new Date(o.createdAt));
      const s = fila[lunesDe(f)];
      if (!s) continue;
      s.venta += Number(o.currentSubtotalPriceSet.shopMoney.amount);
      s.pedidos += 1;
      if (dia[f]) { dia[f].venta += Number(o.currentSubtotalPriceSet.shopMoney.amount); dia[f].pedidos += 1; }
      if (f < hace28) continue;
      for (const li of o.lineItems.nodes) {
        const q = li.currentQuantity || 0;
        if (!q) continue;
        const v = Number(li.discountedTotalSet.shopMoney.amount);
        const m = (marcas[li.vendor || 'Sin marca'] ||= { marca: li.vendor || 'Sin marca', unidades: 0, venta: 0 });
        m.unidades += q; m.venta += v;
        const p = (top[li.title] ||= { producto: li.title, marca: li.vendor, unidades: 0, venta: 0 });
        p.unidades += q; p.venta += v;
      }
    }
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
