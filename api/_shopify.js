// Cliente de Shopify Admin GraphQL (token por client_credentials).
// Variables en Vercel: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET.
export async function shopifyGql() {
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
  return async (query, variables) => {
    const r = await fetch(`https://${dom}/admin/api/${ver}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t.access_token },
      body: JSON.stringify({ query, variables }),
    }).then((r) => r.json());
    if (r.errors) throw new Error('Shopify: ' + JSON.stringify(r.errors).slice(0, 200));
    return r.data;
  };
}
