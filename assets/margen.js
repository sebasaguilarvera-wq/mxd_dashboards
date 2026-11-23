// Cuánto le queda a MXD de cada venta, con las mismas reglas de los otros tableros.
// Necesita antes: /assets/costos_cw.js, /assets/costos_angeltex.js y /assets/saga_cargos.js.
window.MARGEN = (() => {
  const IGV = 1.18;
  const REGLAS = {
    pasarela: 0.02,        // Mercado Pago en la web
    envioGratisDesde: 150, // la web regala el envío desde S/ 150
    courier: 10,           // lo que cuesta el courier cuando el envío es gratis
    costoSinDato: 0.5,     // si un producto no tiene costo cargado: 50% de la venta sin IGV (estimado)
    comCW: 0.15, comAng: 0.25,
    deliveryAng: 3.9,      // cofinanciamiento logístico por prenda si el SKU no salió en el reporte (packs: 4.90)
    deliveryCW: 0.071,     // % de la venta sin IGV si el SKU no salió en el reporte
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const costoLinea = (l) => {
    const cw = window.COSTO_CW?.[String(l.sku).replace(/^CW/, '')];
    if (cw != null) return { c: cw * l.q, est: false };
    const an = window.COSTO_ANG?.[l.sku];
    if (an) return { c: an[0] * l.q, est: false };
    return { c: (l.v / IGV) * REGLAS.costoSinDato, est: true };
  };
  // Pedido de la web: { venta, envio, lineas:[{sku,q,v}] }
  function web(o) {
    const sin = o.venta / IGV;
    let costo = 0, est = false;
    for (const l of o.lineas || []) { const x = costoLinea(l); costo += x.c; est ||= x.est; }
    const pasarela = (o.venta + (o.envio || 0)) * REGLAS.pasarela;
    const envio = !o.envio && o.venta >= REGLAS.envioGratisDesde ? REGLAS.courier : 0;
    return { venta: o.venta, sinIgv: r2(sin), igv: r2(o.venta - sin), costo: r2(costo), cobro: r2(pasarela), envio, queda: r2(sin - costo - pasarela - envio), estimado: est };
  }
  // Ítem de Saga Classic World (una unidad): { k, p }. Igual que /saga-cw: sin IGV, comisión sobre la venta sin IGV.
  const deliveryReal = (k) => window.SAGA_CARGOS?.delivery?.[k] ?? null;
  function sagaCW(i) {
    const sin = i.p / IGV, cu = window.COSTO_CW?.[String(i.k).replace(/^CW/, '')];
    const costo = cu != null ? cu : sin * REGLAS.costoSinDato, com = sin * REGLAS.comCW;
    const real = deliveryReal(i.k), del = real != null ? real / IGV : sin * REGLAS.deliveryCW;
    return { venta: i.p, sinIgv: r2(sin), igv: r2(i.p - sin), costo: r2(costo), cobro: r2(com), envio: r2(del), queda: r2(sin - costo - com - del), estimado: cu == null };
  }
  // Ítem de Saga Angeltex: { k, p }. Igual que /saga-angeltex: costo mayorista, comisión 25% con IGV, delivery fijo.
  function sagaAng(i) {
    const c = window.COSTO_ANG?.[i.k];
    const u = c ? Math.max(1, Math.round(i.p / c[1])) : 1;
    const costo = c ? u * c[0] : i.p * 0.6, com = i.p * REGLAS.comAng;
    const del = deliveryReal(i.k) ?? REGLAS.deliveryAng;
    return { venta: i.p, sinIgv: i.p, igv: 0, costo: r2(costo), cobro: r2(com), envio: r2(del), queda: r2(i.p - costo - com - del), estimado: !c };
  }
  return { REGLAS, web, sagaCW, sagaAng };
})();
