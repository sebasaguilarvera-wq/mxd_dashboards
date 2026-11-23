"""Arma assets/saga_cargos.js con lo que no sale de la API de Falabella.

Uso: python3 scripts/saga_cargos.py <Transacciones_SellerCenter_*.csv> [...]
- Delivery (cofinanciamiento logístico + promo envío) por SKU, con IGV: el monto que Falabella cobra por cada unidad.
- Transacciones por orden y SKU (comisión, delivery y depósito real) para el Dashboard Madre.
- La pauta de Falabella Media se edita a mano en la lista MEDIA de abajo (sale del reporte de campaña de cada lunes).
"""
import csv, json, re, statistics, sys, collections, datetime

MEDIA = [
    # campaña, marca (cw | angeltex), desde, hasta, gasto S/, ventas atribuidas S/
    {"c": "CAMPANA_26", "m": "angeltex", "desde": "2026-09-16", "hasta": "2026-10-16", "gasto": 290, "ventas": 959.1},
]

COBROS = ("Cobro por cofinanciamiento logístico", "Cobro por Promo Envio Seller")
por_sku = collections.defaultdict(lambda: collections.defaultdict(float))  # sku -> (orden, item) -> monto
hasta = ""
vistos = set()
trans = {}  # (orden, ítem) -> fila: una unidad vendida
def marca(nombre, sku):
    if re.search(r"classic", nombre, re.I): return "cw"
    if sku.startswith("SAM") or re.match(r"^\d{4,5}-[A-Z]", sku): return "ang"
    return "otro"  # los reportes se pisan en fechas: cada cobro cuenta una vez
for ruta in sys.argv[1:]:
    filas = list(csv.reader(open(ruta, encoding="utf-8-sig")))
    for f in filas[1:]:
        if len(f) < 15:
            continue
        hasta = max(hasta, f[0][:10])
        clave = (f[2], f[5], f[9], f[10], f[14])
        nuevo = clave not in vistos
        vistos.add(clave)
        if nuevo:
            t = trans.setdefault((f[2], f[5]), {"f": f[0][:10], "o": f[2], "k": f[3], "m": marca(f[1], f[3]), "precio": 0, "com": 0, "del": 0, "dep": 0})
            monto = float(f[14])
            t["dep"] += monto
            if f[9] == "Pago por precio del producto": t["precio"] += monto
            elif f[9] == "Cobro por comisión por venta": t["com"] += -monto
            elif f[9] in COBROS: t["del"] += -monto
        if f[9] in COBROS and nuevo:
            por_sku[f[3]][(f[2], f[5])] += -float(f[14])
delivery = {sku: round(statistics.median(v.values()), 2) for sku, v in por_sku.items() if v}
# El reporte antiguo no trae la fila "Pago por precio del producto": se deduce de la comisión (15% juguetes, 25% textil, validado)
for t in trans.values():
    if t["precio"] == 0 and t["com"] > 0:
        t["precio"] = round(t["com"] / (0.25 if t["m"] == "ang" else 0.15), 2)
        t["dep"] += t["precio"]
salida = {
    "actualizado": datetime.date.today().isoformat(),
    "reporteHasta": hasta,
    "delivery": dict(sorted(delivery.items())),
    "media": MEDIA,
    # [fecha orden, orden, sku, marca, precio, comisión, delivery, depósito] con IGV
    "trans": [[t["f"], t["o"], t["k"], t["m"], round(t["precio"], 2), round(t["com"], 2), round(t["del"], 2), round(t["dep"], 2)] for t in sorted(trans.values(), key=lambda x: x["f"])],
}
with open("assets/saga_cargos.js", "w") as fh:
    fh.write("// Generado con scripts/saga_cargos.py desde los reportes de Seller Center. No editar a mano (salvo MEDIA en el script).\n")
    fh.write("window.SAGA_CARGOS = " + json.dumps(salida, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(delivery), "SKU con delivery real; reporte hasta", hasta)
