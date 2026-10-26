// Botón "Leer facturas con IA" de Proveedores: la app manda una foto o PDF y los nombres de los
// proveedores ya cargados; esta función le pide a la IA que lea la factura y devuelve los datos.
// Guardar lo hace la app misma (con su conexión a Firebase), igual que cuando se carga a mano.

const { leerFactura } = require('../lib/factura-ia.js');

const MAX_BASE64 = 5_500_000; // Netlify corta los pedidos de más de 6 MB

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Pedido inválido.' }); }
  const archivo = p && p.archivo;
  if (!archivo || !archivo.data) return json(400, { error: 'No llegó ningún archivo.' });
  if (String(archivo.data).length > MAX_BASE64) return json(413, { error: 'El archivo es muy pesado (máximo unos 4 MB). Probá con una foto o un PDF más liviano.' });
  const proveedores = Array.isArray(p.proveedores) ? p.proveedores.map(String).slice(0, 500) : [];
  try {
    const factura = await leerFactura(archivo, proveedores);
    return json(200, { factura });
  } catch (err) {
    return json(502, { error: (err && err.message) || 'No se pudo leer la factura.' });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
