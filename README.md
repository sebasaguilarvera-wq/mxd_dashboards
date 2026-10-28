# MXD Dashboards

Tableros de MXD en un solo sitio, desplegado en Vercel.

| Ruta | Tablero | Datos |
|---|---|---|
| `/saga-cw` | Saga Falabella · Classic World | Foto fija (se regenera desde el proyecto) |
| `/saga-angeltex` | Saga Falabella · Angeltex | Foto fija (se regenera desde el proyecto) |
| `/web` | Web y Google (Shopify + GA4) | En vivo vía `/api/web` (caché 15 min) |
| `/meta` | Meta Ads | Próximamente |

## Variables de entorno en Vercel

| Variable | Para qué |
|---|---|
| `DASH_PASSWORD` | Clave para entrar al sitio (obligatoria; sin ella el sitio no abre) |
| `DASH_USER` | Usuario para entrar (opcional, por defecto `mxd`) |
| `SHOPIFY_STORE_DOMAIN` | `mxd-6202.myshopify.com` |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | App de Shopify (client credentials) |
| `GA4_PROPERTY_ID` | Propiedad GA4 MXD Web |
| `GA4_SERVICE_ACCOUNT_JSON` | JSON de la cuenta de servicio (texto o base64) |

Las claves nunca van en el código.
