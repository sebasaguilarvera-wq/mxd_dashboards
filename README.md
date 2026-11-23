# MXD Dashboards

Tableros de MXD en un solo sitio, desplegado en Vercel.

| Ruta | Tablero | Datos |
|---|---|---|
| `/resumen` | Ganancia por canal y semana (Saga CW, Saga Samsara/Cocoon, web por Meta, Google y otros) | `/api/meta` + `/api/saga`; costos en `assets/costos_cw.js` y `assets/costos_angeltex.js`, delivery y Falabella Media en `assets/saga_cargos.js`, reglas en `assets/margen.js` |
| `/saga-cw` | Saga Falabella · Classic World | En vivo vía `/api/saga?m=cw` (caché 15 min); costos fijos en la página |
| `/saga-angeltex` | Saga Falabella · Angeltex | En vivo vía `/api/saga?m=angeltex`; costos y campaña fijos en la página |
| `/web` | Web y Google (Shopify + GA4) | En vivo vía `/api/web` (caché 15 min); ventas por canal según el recorrido del pedido en Shopify (`api/_pedidos.js`) |
| `/pauta` | Pauta en prueba (semáforo por campaña) | `/api/saga?m=angeltex` + `/api/pauta` (Shopify con origen, visitas de Meta en GA4, gasto de Meta si hay token); fechas y presupuestos en `assets/pauta_config.js` |
| `/meta` | Meta Ads: gasto, ventas web por anuncio (UTM), costo por venta y semáforo | `/api/meta` (Graph API si hay token + Shopify + GA4); reglas en `assets/pauta_config.js` |

## Variables de entorno en Vercel

| Variable | Para qué |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | `mxd-6202.myshopify.com` |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | App de Shopify (client credentials) |
| `GA4_PROPERTY_ID` | Propiedad GA4 MXD Web |
| `GA4_SERVICE_ACCOUNT_JSON` | JSON de la cuenta de servicio (texto o base64) |
| `FALABELLA_API_KEY` | API key de Seller Center |
| `FALABELLA_USER_ID` | Seller ID de Falabella (va en el User-Agent) |
| `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | Gasto de Meta en vivo en `/meta`, `/resumen` y `/pauta` (token de usuario del sistema con `ads_read`) |

El botón **Actualizar** de cada tablero salta la caché y trae los datos al momento.

Las claves nunca van en el código.

## Actualizar delivery y Falabella Media (cada lunes)

1. Descargar de Seller Center el reporte de transacciones y el reporte de campaña de Falabella Media.
2. Si hubo campaña, sumarla a la lista `MEDIA` de `scripts/saga_cargos.py`.
3. Correr `python3 scripts/saga_cargos.py <reportes de transacciones .csv>` y subir `assets/saga_cargos.js`.

## UTM para Meta

En cada anuncio, en **Parámetros de URL**:
`utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}`
