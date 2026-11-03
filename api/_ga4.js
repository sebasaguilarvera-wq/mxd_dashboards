// Cliente de la API de datos de Google Analytics 4 con cuenta de servicio (JWT firmado aquí mismo).
// Variables en Vercel: GA4_PROPERTY_ID y GA4_SERVICE_ACCOUNT_JSON (JSON o base64).
import crypto from 'node:crypto';

async function token() {
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

// Devuelve una función rep(dimensiones, desde, hasta, métricas) → [{d:[...], m:[...]}]
export async function ga4Cliente() {
  const tok = await token();
  return async (dims, ini, fin, metrics = ['sessions', 'totalUsers', 'ecommercePurchases', 'purchaseRevenue']) => {
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA4_PROPERTY_ID}:runReport`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dimensions: dims.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        dateRanges: [{ startDate: ini, endDate: fin }],
        limit: 10000,
      }),
    }).then((r) => r.json());
    if (r.error) throw new Error('GA4: ' + r.error.message);
    return (r.rows || []).map((row) => ({
      d: row.dimensionValues.map((x) => x.value),
      m: row.metricValues.map((x) => Number(x.value)),
    }));
  };
}
