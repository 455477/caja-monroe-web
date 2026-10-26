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

  const prompt = 'Esta es una foto de una planilla o papel escrito a mano (con birome) con el cierre de caja de ' + contexto + '. ' +
    'El papel puede tener montos separados por método de pago: Efectivo, Mercado Pago (a veces "MP") y Tarjeta, ' +
    'a veces con una lista de importes individuales por persona/cliente que hay que sumar, y a veces ya con un total anotado. ' +
    'Leé la foto con cuidado y calculá el total de cada método de pago (si hay una lista de importes, sumalos vos con cuidado; si ya hay un total anotado, usá ese total). ' +
    'También contá, si se puede, la cantidad de importes/personas anotadas en cada método. ' +
    'Si un método de pago no aparece en la foto o no se puede leer, usá null para su monto y su cantidad de personas. ' +
    'No inventes valores que no estén en la foto. ' +
    'Respondé solo con un objeto JSON de esta forma exacta, sin texto antes ni después: ' +
    '{"efectivo": {"monto": number|null, "personas": number|null}, "mercadopago": {"monto": number|null, "personas": number|null}, "tarjeta": {"monto": number|null, "personas": number|null}}';

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
