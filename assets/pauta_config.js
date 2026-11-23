// Campañas de pauta en prueba. Fechas en formato 'AAAA-MM-DD'; null = todavía no se prende.
// Lo que Sebastian escriba en la página (en su navegador) manda sobre estos valores.
window.PAUTA_CFG = {
  // Angeltex en Saga Falabella · Falabella Media · solo packs x4 de medias compresión y nylon
  ang: { inicio: null, diario: 5, gasto: null, roasFM: null },
  // Classic World en la web MXD · Meta · juguetes de S/ 100 o más · prueba de 10 días
  cw: { inicio: null, diario: 30, dias: 10, gasto: null },
};

// Semáforo de anuncios de Meta en la web (/meta), en S/ por venta (puntos de equilibrio, juguete CW ~S/ 120).
window.META_REGLAS = {
  subir: 45,     // costo por venta hasta aquí: subir el presupuesto 20% cada 3 días
  cambiar: 61,   // entre "subir" y esto: mantener y cambiar el anuncio
  sinVenta: 120, // gastado esto sin ninguna venta: apagar
};
