// "🤖 Leer datos de la foto" del cierre de caja (versión web). La app manda la foto del papel del
// cierre y esta función le pide a la IA (clave ANTHROPIC_API_KEY de este sitio) los totales por
// método de pago. Antes esto solo andaba dentro de Claude.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5-5';
const MAX_BASE64 = 5_500_000;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'Falta configurar ANTHROPIC_API_KEY en Netlify.' });
  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Pedido inválido.' }); }
  const a = p && p.archivo;
  const mime = String(a && a.mime || '');
  if (!a || !a.data || !/^image\/(jpeg|png|webp)$/.test(mime)) return json(400, { error: 'No llegó la foto.' });
  if (String(a.data).length > MAX_BASE64) return json(413, { error: 'La foto es muy pesada.' });
  const contexto = String(p.contexto || 'una ferretería').slice(0, 200);

  const prompt = 'Esta es una foto del cierre de caja de ' + contexto + '. Puede tener DOS cosas distintas:\n' +
    '1) Una planilla o papel escrito a mano (con birome) con columnas por método de pago: Efectivo ("E.F." o "EF"), Mercado Pago ("M.P." o "MP") y Tarjeta ("T"). ' +
    'Cada columna tiene una lista de importes y a veces un total anotado abajo. Esto es TODO lo que entró en la caja. ' +
    'Para cada método: si hay un total anotado abajo de la raya, usá ese total; si no, sumá vos los importes con cuidado. Contá también cuántos importes hay en cada columna (personas). ' +
    'Si hay dos columnas de efectivo, sumalas. Los montos de la caja salen SOLO de esta planilla a mano, nunca del ticket impreso.\n' +
    '2) Un ticket impreso del sistema o la registradora fiscal ("Planilla de caja", "Informe cierre de caja", "Cierre Z"). De ese ticket sacá solo lo facturado: ' +
    'fecha, número del informe, total facturado, total de Factura A, total de Factura B, IVA 21%, IVA 10,5% y percepciones.\n' +
    'Si algo no aparece o no se lee, usá null. No inventes valores. Los importes van como números con punto decimal (ej 23967.77), sin separador de miles. ' +
    'Respondé solo con un objeto JSON de esta forma exacta, sin texto antes ni después: ' +
    '{"efectivo": {"monto": number|null, "personas": number|null}, "mercadopago": {"monto": number|null, "personas": number|null}, "tarjeta": {"monto": number|null, "personas": number|null}, ' +
    '"ticket": {"hay": true|false, "fecha": "AAAA-MM-DD"|null, "numero": string|null, "total": number|null, "facturaA": number|null, "facturaB": number|null, "iva21": number|null, "iva105": number|null, "percepciones": number|null}}';

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: String(a.data).replace(/^data:[^,]*,/, '') } },
          { type: 'text', text: prompt },
        ] }],
      }),
    });
    const r = await resp.json().catch(() => ({}));
    if (!resp.ok) return json(502, { error: (r.error && r.error.message) || ('La IA respondió con error ' + resp.status) });
    const texto = (r.content || []).map((b) => (b && b.text) || '').join('');
    const ini = texto.indexOf('{'), fin = texto.lastIndexOf('}');
    if (ini < 0 || fin <= ini) return json(502, { error: 'No se entendió la respuesta de la IA.', code: 'invalid_json' });
    return json(200, { data: JSON.parse(texto.slice(ini, fin + 1)) });
  } catch (err) {
    return json(502, { error: (err && err.message) || 'No se pudo leer la foto.' });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
