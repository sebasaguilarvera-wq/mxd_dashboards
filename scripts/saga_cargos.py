"""Arma assets/saga_cargos.js con lo que no sale de la API de Falabella.

Uso: python3 scripts/saga_cargos.py <Transacciones_SellerCenter_*.csv> [...]
- Delivery (cofinanciamiento logístico + promo envío) por SKU, con IGV: el monto que Falabella cobra por cada unidad.
- La pauta de Falabella Media se edita a mano en la lista MEDIA de abajo (sale del reporte de campaña de cada lunes).
"""
import csv, json, statistics, sys, collections, datetime

MEDIA = [
    # campaña, marca (cw | angeltex), desde, hasta, gasto S/, ventas atribuidas S/
    {"c": "CAMPANA_26", "m": "angeltex", "desde": "2026-09-16", "hasta": "2026-10-16", "gasto": 290, "ventas": 959.1},
]

COBROS = ("Cobro por cofinanciamiento logístico", "Cobro por Promo Envio Seller")
por_sku = collections.defaultdict(lambda: collections.defaultdict(float))  # sku -> (orden, item) -> monto
hasta = ""
vistos = set()  # los reportes se pisan en fechas: cada cobro cuenta una vez
for ruta in sys.argv[1:]:
    filas = list(csv.reader(open(ruta, encoding="utf-8-sig")))
    for f in filas[1:]:
        if len(f) < 15:
            continue
        hasta = max(hasta, f[0][:10])
        clave = (f[2], f[5], f[9], f[10], f[14])
        if f[9] in COBROS and clave not in vistos:
            vistos.add(clave)
            por_sku[f[3]][(f[2], f[5])] += -float(f[14])
delivery = {sku: round(statistics.median(v.values()), 2) for sku, v in por_sku.items() if v}
salida = {
    "actualizado": datetime.date.today().isoformat(),
    "reporteHasta": hasta,
    "delivery": dict(sorted(delivery.items())),
    "media": MEDIA,
}
with open("assets/saga_cargos.js", "w") as fh:
    fh.write("// Generado con scripts/saga_cargos.py desde los reportes de Seller Center. No editar a mano (salvo MEDIA en el script).\n")
    fh.write("window.SAGA_CARGOS = " + json.dumps(salida, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(delivery), "SKU con delivery real; reporte hasta", hasta)
