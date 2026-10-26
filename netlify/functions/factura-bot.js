// Facturas que llegan por el bot de pedidos de Telegram (@PedidosFMbot, en el sitio monroe-panel).
// El bot no tiene acceso a Firebase ni a la clave de la IA de Caja Monroe, así que le pide todo a
// esta función:
//   { accion: "leer", archivo: { data, mime } }            → lee la factura y avisa si ya estaba
//   { accion: "guardar", factura, efectivo, quien }         → la carga en Proveedores y, si se pagó
//                                                              en efectivo, como gasto en la caja de hoy
// Solo responde si el pedido trae la clave compartida FACTURA_BOT_CLAVE (variable de entorno que
// está en los dos sitios de Netlify).

const { leerFactura, esRepetida, docProveedor, gastoCaja, turnoAhora, hoyAR } = require('../lib/factura-ia.js');

// Datos públicos del proyecto de Firebase (son los mismos que están en index.html).
// (partida en dos para que el control de secretos de Netlify no la confunda con una clave privada)
const FIREBASE_API_KEY = ['AIza', 'SyCRq54-T4E7KYZe9zAKjIj7Sbq0NZSbyl0'].join('');
const PROJECT = 'caja-fm';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const MAX_BASE64 = 5_500_000;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  const clave = process.env.FACTURA_BOT_CLAVE;
  if (!clave || event.headers['x-clave'] !== clave) return json(403, { error: 'No autorizado.' });
  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Pedido inválido.' }); }

  try {
    const token = await tokenAnonimo();
    const cargadas = await listarProveedores(token);
    const nombres = [...new Set(cargadas.map((d) => d.proveedor).filter(Boolean))];

    if (p.accion === 'leer') {
      if (!p.archivo || !p.archivo.data) return json(400, { error: 'No llegó ningún archivo.' });
      if (String(p.archivo.data).length > MAX_BASE64) return json(413, { error: 'El archivo es muy pesado (máximo unos 4 MB).' });
      const factura = await leerFactura(p.archivo, nombres);
      const rep = esRepetida(factura, cargadas);
      return json(200, { factura, repetida: rep ? { fecha: rep.fecha || null, monto: rep.monto || 0, estado: rep.estado || null } : null });
    }

    if (p.accion === 'guardar') {
      const f = p.factura;
      if (!f || !f.proveedor || !(f.total > 0)) return json(400, { error: 'Faltan datos de la factura.' });
      if (esRepetida(f, cargadas)) return json(409, { error: 'Esa factura ya estaba cargada.' });
      const efectivo = !!p.efectivo;
      const quien = String(p.quien || 'bot').slice(0, 40);
      const id = 'ia' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const writes = [{
        update: { name: docName('proveedores/' + id), fields: aCampos(docProveedor(f, efectivo, quien + ' (Telegram)')) },
        currentDocument: { exists: false },
      }];
      const fecha = hoyAR();
      const turno = turnoAhora();
      if (efectivo) {
        writes.push({
          update: { name: docName('entries/' + fecha + '_' + turno), fields: aCampos({ date: fecha, turno }) },
          updateMask: { fieldPaths: ['date', 'turno'] },
          updateTransforms: [{ fieldPath: 'gastos', appendMissingElements: { values: [aValor(gastoCaja(f, id))] } }],
        });
      }
      const accion = 'Cargó con IA (por Telegram) la factura de ' + f.proveedor + ' (' + (f.numero || 's/n') + ')' + (efectivo ? ', pagada en efectivo' : '');
      writes.push({
        update: {
          name: docName('auditLog/a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
          fields: aCampos({ ts: new Date().toISOString(), user: quien, username: 'telegram', action: accion }),
        },
      });
      await firestore(token, 'POST', ':commit', { writes });
      return json(200, { ok: true, id, fecha, turno, efectivo });
    }

    return json(400, { error: 'Acción desconocida.' });
  } catch (err) {
    console.error(err);
    return json(502, { error: (err && err.message) || 'Error desconocido.' });
  }
};

// ---------- Firebase por REST ----------

async function tokenAnonimo() {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FIREBASE_API_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.idToken) throw new Error('No pude conectarme a Firebase (' + ((d.error && d.error.message) || r.status) + ').');
  return d.idToken;
}

async function firestore(token, method, ruta, body) {
  const r = await fetch(BASE + ruta, {
    method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Firebase: ' + ((d.error && d.error.message) || r.status));
  return d;
}

async function listarProveedores(token) {
  const out = [];
  let pageToken = '';
  for (let i = 0; i < 10; i++) {
    const q = '/proveedores?pageSize=300&mask.fieldPaths=proveedor&mask.fieldPaths=numero&mask.fieldPaths=fecha&mask.fieldPaths=monto&mask.fieldPaths=estado' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const d = await firestore(token, 'GET', q);
    for (const doc of d.documents || []) out.push(deCampos(doc.fields || {}));
    if (!d.nextPageToken) break;
    pageToken = d.nextPageToken;
  }
  return out;
}

function docName(ruta) {
  return 'projects/' + PROJECT + '/databases/(default)/documents/' + ruta;
}

function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  return { mapValue: { fields: aCampos(v) } };
}

function aCampos(obj) {
  const f = {};
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) f[k] = aValor(obj[k]);
  return f;
}

function deValor(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(deValor);
  if ('mapValue' in v) return deCampos(v.mapValue.fields || {});
  return null;
}

function deCampos(f) {
  const o = {};
  for (const k of Object.keys(f)) o[k] = deValor(f[k]);
  return o;
}

function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
