// Lectura de facturas de compra con IA (Claude, con la clave ANTHROPIC_API_KEY de este sitio).
// La usan dos funciones: "leer-factura" (el botón de la app) y "factura-bot" (el bot de pedidos
// de Telegram). Recibe una foto o un PDF y devuelve los datos de la factura ya ordenados.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5-5';
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function hoyAR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s\.?|srl|sa|sas|e hijos|hnos|hermanos)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function soloDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

function fechaValida(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null;
}

function numero(n) {
  if (typeof n === 'number' && isFinite(n)) return Math.round(n * 100) / 100;
  if (typeof n === 'string') {
    // "1.234.567,89" o "1234567.89"
    let t = n.replace(/[^\d.,-]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const v = parseFloat(t);
    return isFinite(v) ? Math.round(v * 100) / 100 : null;
  }
  return null;
}

// Si la IA devolvió un nombre que ya existe en Proveedores (aunque esté escrito distinto), usamos
// el que está guardado, así no se crean proveedores repetidos.
function elegirProveedor(leido, existentes) {
  const n = normalizarNombre(leido);
  if (!n) return { nombre: String(leido || '').trim(), nuevo: true };
  const lista = (existentes || []).filter(Boolean);
  const exacto = lista.find((e) => normalizarNombre(e) === n);
  if (exacto) return { nombre: exacto, nuevo: false };
  const parecido = lista.find((e) => {
    const m = normalizarNombre(e);
    return m.length >= 4 && (n.startsWith(m + ' ') || m.startsWith(n + ' ') || n === m);
  });
  if (parecido) return { nombre: parecido, nuevo: false };
  return { nombre: String(leido).trim(), nuevo: true };
}

function armarPrompt(proveedores) {
  const hoy = hoyAR();
  return [
    'Sos el encargado de cargar las facturas de compra de una ferretería de Buenos Aires (Ferretería Monroe).',
    'Te paso UNA foto o un PDF de un comprobante que le hizo un proveedor a la ferretería. Leelo con cuidado y devolvé SOLO un objeto JSON, sin texto antes ni después, con estos campos:',
    '{',
    '  "esComprobante": true/false (false si la imagen no es una factura, presupuesto, remito o nota de crédito),',
    '  "tipo": "Factura" | "Presupuesto" | "Nota de crédito" | "Remito" | "Otro",',
    '  "letra": "A" | "B" | "C" | "M" | "X" | null,',
    '  "proveedor": nombre del proveedor que EMITE el comprobante (no el cliente: la ferretería, "García Juan Carlos" o "Ferretería Monroe", es el cliente),',
    '  "cuit": CUIT del proveedor o null,',
    '  "numero": número del comprobante tal cual figura, con punto de venta si lo tiene (ej "0003-00012345"), o null,',
    '  "fecha": fecha de emisión en formato AAAA-MM-DD,',
    '  "vencimiento": fecha de vencimiento o de pago en AAAA-MM-DD, o null si no figura,',
    '  "neto": importe neto gravado (sin IVA) o null,',
    '  "iva": total de IVA o null,',
    '  "total": importe TOTAL a pagar del comprobante (número, sin signo $),',
    '  "condicion": "contado" | "cuenta corriente" | "otro" | null (la condición de venta que figura),',
    '  "confianza": "alta" | "media" | "baja" (qué tan seguro estás de haber leído bien proveedor, número y total),',
    '  "nota": una frase corta si algo no se lee o hay algo raro, o null',
    '}',
    'Reglas: los importes van como números con punto decimal (ej 125430.5), sin separador de miles. En Argentina las fechas se escriben día/mes/año: 03/11/2026 es 3 de noviembre. Hoy es ' + hoy + '. No inventes datos: si algo no figura o no se lee, poné null.',
    proveedores && proveedores.length
      ? 'Proveedores que la ferretería ya tiene cargados (si el comprobante es de uno de estos, usá exactamente ese nombre): ' + proveedores.slice(0, 300).join(' | ')
      : '',
  ].filter(Boolean).join('\n');
}

function sacarJSON(texto) {
  const t = String(texto || '');
  const ini = t.indexOf('{');
  const fin = t.lastIndexOf('}');
  if (ini < 0 || fin <= ini) throw new Error('La IA no devolvió los datos en el formato esperado.');
  return JSON.parse(t.slice(ini, fin + 1));
}

/**
 * @param {{ data: string, mime: string }} archivo  base64 sin el prefijo "data:...;base64,"
 * @param {string[]} proveedores  nombres ya cargados en Proveedores
 */
async function leerFactura(archivo, proveedores) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta configurar ANTHROPIC_API_KEY en Netlify.');
  const mime = String(archivo && archivo.mime || '').toLowerCase();
  const data = String(archivo && archivo.data || '').replace(/^data:[^,]*,/, '');
  if (!data) throw new Error('No llegó ningún archivo.');

  let bloque;
  if (mime === 'application/pdf') {
    bloque = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  } else if (TIPOS_IMAGEN.includes(mime)) {
    bloque = { type: 'image', source: { type: 'base64', media_type: mime, data } };
  } else {
    throw new Error('Solo puedo leer fotos (JPG, PNG) o PDF.');
  }

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: [bloque, { type: 'text', text: armarPrompt(proveedores) }] }],
    }),
  });
  const r = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((r.error && r.error.message) || ('La IA respondió con error ' + resp.status));
  const texto = (r.content || []).map((b) => (b && b.text) || '').join('');
  const crudo = sacarJSON(texto);
  return ordenar(crudo, proveedores);
}

function ordenar(c, proveedores) {
  const prov = elegirProveedor(c.proveedor, proveedores);
  const tipoLeido = String(c.tipo || '').toLowerCase();
  const tipo = /presup/.test(tipoLeido) ? 'Presupuesto'
    : /cr[eé]dito/.test(tipoLeido) ? 'Nota de crédito'
    : /remito/.test(tipoLeido) ? 'Remito'
    : /factura/.test(tipoLeido) ? 'Factura' : 'Otro';
  const total = numero(c.total);
  const f = {
    esComprobante: c.esComprobante !== false,
    tipo,
    letra: c.letra ? String(c.letra).toUpperCase().slice(0, 1) : null,
    proveedor: prov.nombre,
    proveedorNuevo: prov.nuevo,
    cuit: c.cuit ? String(c.cuit).trim() : null,
    numero: c.numero ? String(c.numero).trim() : null,
    fecha: fechaValida(c.fecha) || hoyAR(),
    vencimiento: fechaValida(c.vencimiento),
    neto: numero(c.neto),
    iva: numero(c.iva),
    total,
    condicion: c.condicion ? String(c.condicion).toLowerCase() : null,
    confianza: ['alta', 'media', 'baja'].includes(c.confianza) ? c.confianza : 'media',
    nota: c.nota ? String(c.nota).slice(0, 300) : null,
  };
  // Qué impide cargarla sola
  f.problema = !f.esComprobante ? 'No parece una factura.'
    : f.tipo === 'Nota de crédito' ? 'Es una nota de crédito: esas no las cargo solas.'
    : f.tipo === 'Remito' ? 'Es un remito (no tiene importe a pagar): no lo cargo.'
    : !f.proveedor ? 'No pude leer el proveedor.'
    : !(f.total > 0) ? 'No pude leer el total.'
    : null;
  return f;
}

// ¿Ya está cargada? Mismo proveedor y mismo número (comparando solo los dígitos).
// El número se compara entero y también solo la última parte (sin el punto de venta), porque a
// mano muchas veces se carga "12345" en vez de "0003-00012345".
function mismoNumero(a, b) {
  const da = soloDigitos(a).replace(/^0+/, ''), db = soloDigitos(b).replace(/^0+/, '');
  if (!da || !db) return false;
  if (da === db) return true;
  const ua = (String(a).match(/\d+/g) || []).pop().replace(/^0+/, '');
  const ub = (String(b).match(/\d+/g) || []).pop().replace(/^0+/, '');
  return Boolean(ua) && ua === ub;
}

function esRepetida(f, docs) {
  if (!soloDigitos(f.numero)) return null;
  const prov = normalizarNombre(f.proveedor);
  return (docs || []).find((d) => normalizarNombre(d.proveedor) === prov && mismoNumero(d.numero, f.numero)) || null;
}

// Arma el documento de Proveedores con el mismo formato que usa el formulario de la app.
function docProveedor(f, efectivo, quien) {
  const hoy = hoyAR();
  const monto = f.total || 0;
  const tipo = f.tipo === 'Presupuesto' ? 'Presupuesto' : 'Factura';
  return {
    proveedor: f.proveedor,
    tipo,
    numero: f.numero || '',
    fecha: f.fecha || hoy,
    monto,
    semana: f.vencimiento || mondayOfWeek(hoy),
    prioridad: false,
    estado: efectivo ? 'pagado' : 'pendiente',
    pagosParciales: efectivo ? [{ monto, fecha: hoy }] : [],
    montoPagado: efectivo ? monto : 0,
    pagos: [],
    letra: f.letra || null,
    cuit: f.cuit || null,
    neto: f.neto,
    iva: f.iva,
    cargadaPorIA: true,
    cargadaPor: quien || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function gastoCaja(f, facturaId) {
  return {
    desc: 'Pago ' + (f.tipo === 'Presupuesto' ? 'presupuesto' : 'factura') + ' ' + f.proveedor + (f.numero ? ' N° ' + f.numero : ''),
    monto: f.total || 0,
    facturaId,
  };
}

function turnoAhora() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }));
  return h < 15 ? 'TM' : 'TT';
}

function mondayOfWeek(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const dia = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dia === 0 ? 6 : dia - 1));
  return d.toISOString().slice(0, 10);
}

module.exports = { leerFactura, ordenar, esRepetida, docProveedor, gastoCaja, turnoAhora, hoyAR, normalizarNombre, elegirProveedor, numero };
