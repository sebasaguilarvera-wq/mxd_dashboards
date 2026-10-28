# MXD Dashboards

Tableros de MXD en un solo sitio, desplegado en Vercel.

| Ruta | Tablero | Datos |
|---|---|---|
| `/saga-cw` | Saga Falabella · Classic World | En vivo vía `/api/saga?m=cw` (caché 15 min); costos fijos en la página |
| `/saga-angeltex` | Saga Falabella · Angeltex | En vivo vía `/api/saga?m=angeltex`; costos y campaña fijos en la página |
| `/web` | Web y Google (Shopify + GA4) | En vivo vía `/api/web` (caché 15 min) |
| `/meta` | Meta Ads | Próximamente |

## Variables de entorno en Vercel

| Variable | Para qué |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | `mxd-6202.myshopify.com` |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | App de Shopify (client credentials) |
| `GA4_PROPERTY_ID` | Propiedad GA4 MXD Web |
| `GA4_SERVICE_ACCOUNT_JSON` | JSON de la cuenta de servicio (texto o base64) |
| `FALABELLA_API_KEY` | API key de Seller Center |
| `FALABELLA_USER_ID` | Seller ID de Falabella (va en el User-Agent) |

El botón **Actualizar** de cada tablero salta la caché y trae los datos al momento.

Las claves nunca van en el código.
