// Protege todo el sitio con usuario y clave (variables DASH_USER y DASH_PASSWORD en Vercel).
// Sin clave configurada no muestra nada: los tableros tienen ventas y costos.
export const config = { matcher: '/:path*' };

export default function middleware(request) {
  const user = process.env.DASH_USER || 'mxd';
  const pass = process.env.DASH_PASSWORD;
  if (!pass) return new Response('Falta configurar DASH_PASSWORD en Vercel.', { status: 503 });
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    const [u, ...rest] = atob(auth.slice(6)).split(':');
    if (u === user && rest.join(':') === pass) return;
  }
  return new Response('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="MXD Dashboards", charset="UTF-8"' },
  });
}
