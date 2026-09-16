// Función serverless de Netlify: es la ÚNICA parte de todo este sistema que corre en un servidor
// (no en el navegador de quien usa la página). Por eso es el único lugar donde podemos guardar la
// clave de la API de Anthropic sin que quede a la vista de nadie que abra la página, mire el código
// fuente o inspeccione el tráfico de red con las herramientas del navegador.
//
// El navegador le manda: la pregunta que escribió el usuario, más un resumen de los datos que ya
// tiene cargados en memoria (turnos de caja, proveedores, compras, IVA, gastos). Esta función arma
// el pedido a la API de Claude (Anthropic) con esos datos como contexto, y devuelve el texto de la
// respuesta. Nunca guarda nada ni consulta Firebase por su cuenta -- todo lo que "sabe" en cada
// pregunta es exactamente lo que el navegador le mandó en ese pedido.
//
// Variables de entorno necesarias (Netlify → Site configuration → Environment variables):
//   ANTHROPIC_API_KEY = la clave que se saca en https://console.anthropic.com/settings/keys

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5'; // más preciso con números y cálculos que el modelo económico (Haiku); para el volumen de una ferretería sigue costando centavos por mes
const MAX_PREGUNTA_CHARS = 2000;
const MAX_CONTEXTO_CHARS = 200000; // recorte de seguridad; en el uso normal de una ferretería no se llega ni cerca

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Método no permitido.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Netlify (Site configuration → Environment variables). Ver las instrucciones que acompañan a esta página.'
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, { error: 'Pedido inválido (el cuerpo no es JSON válido).' });
  }

  const pregunta = (payload && payload.pregunta ? String(payload.pregunta) : '').trim();
  if (!pregunta) {
    return jsonResponse(400, { error: 'Falta la pregunta.' });
  }
  if (pregunta.length > MAX_PREGUNTA_CHARS) {
    return jsonResponse(400, { error: 'La pregunta es demasiado larga.' });
  }

  let contextoTexto;
  try {
    contextoTexto = JSON.stringify((payload && payload.contexto) || {});
  } catch (e) {
    contextoTexto = '{}';
  }
  if (contextoTexto.length > MAX_CONTEXTO_CHARS) {
    contextoTexto = contextoTexto.slice(0, MAX_CONTEXTO_CHARS) + '\n... (se recortó por ser demasiado largo)';
  }

  const systemPrompt = [
    'Sos el asistente interno de "Caja Monroe Web", el sistema de gestión de una ferretería (Ferretería Monroe).',
    'Quien te pregunta es el dueño o un empleado de confianza, mirando la misma pantalla donde estás integrado.',
    'Respondé SIEMPRE en español rioplatense, corto y directo -- nada de rodeos ni de "como asistente de IA...".',
    'Tu ÚNICA fuente de información es el JSON de datos de abajo: son los datos reales que esa persona ya cargó en la app, tal como están en este momento.',
    'No inventes proveedores, montos ni fechas que no estén en ese JSON. Si la pregunta no se puede responder con estos datos, decilo con claridad en vez de inventar una respuesta.',
    'Los montos son en pesos argentinos: usá el signo $ y separador de miles con punto, por ejemplo $125.000.',
    'MUY IMPORTANTE sobre los números: nunca redondees, aproximes ni "calcules de memoria". Cuando tengas que sumar o totalizar varios valores del JSON (por ejemplo, un análisis del mes o un total adeudado), primero identificá exactamente qué campos y registros del JSON vas a usar, sumalos paso a paso mostrando esa cuenta de forma breve, y recién ahí dale el resultado final. Si un dato puntual no aparece en el JSON, decí explícitamente que no lo tenés en vez de estimarlo.',
    'Antes de responder con una cifra final, releé el JSON y verificá que ese número realmente está ahí (o es la suma exacta de valores que están ahí) -- una cifra equivocada es peor que no responder.',
    'Nunca menciones la palabra "JSON", "contexto" ni cómo está armada esta información -- respondé la pregunta directo, como si ya supieras estos datos de memoria.',
    '',
    'DATOS ACTUALES DE LA FERRETERÍA:',
    contextoTexto
  ].join('\n');

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: pregunta }]
      })
    });

    const data = await resp.json().catch(function () { return {}; });

    if (!resp.ok) {
      const msg = (data && data.error && data.error.message) || ('La API de Anthropic devolvió un error (código ' + resp.status + ').');
      return jsonResponse(resp.status, { error: msg });
    }

    const texto = ((data && data.content) || [])
      .map(function (bloque) { return (bloque && bloque.text) || ''; })
      .join('')
      .trim() || 'No pude generar una respuesta con estos datos.';

    return jsonResponse(200, { respuesta: texto });
  } catch (err) {
    return jsonResponse(502, { error: 'No se pudo conectar con la API de Anthropic: ' + ((err && err.message) || 'error desconocido') });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}
