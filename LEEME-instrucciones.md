# Caja Monroe Web — cómo ponerla en marcha

Esta es la versión de **Caja Ferretería Monroe** pensada para vivir fuera de Claude, en un link propio que no depende de este chat ni de la cuenta de Claude. Se llama **Caja Monroe Web** a propósito, para no confundirla con la app que ya tenés funcionando en Claude (esa queda intacta, sin tocar).

Hay dos cosas por hacer: (1) crear una base de datos gratuita en Firebase para que se guarden los datos, y (2) subir el archivo a algún lado con un link. Se puede hacer todo sin saber programar — son formularios y clics.

## 1. Crear el proyecto en Firebase

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com) con tu cuenta de Google (la misma de siempre alcanza).
2. Tocá **"Crear un proyecto"**, ponele un nombre (por ejemplo `caja-monroe`) y seguí los pasos. No hace falta activar Google Analytics — podés dejarlo desactivado.
3. Una vez creado, en el menú de la izquierda entrá a **Compilación → Firestore Database** y tocá **"Crear base de datos"**. Elegí una región cercana (por ejemplo `southamerica-east1`, San Pablo) y arrancá en **modo de producción**.
4. Andá a **Compilación → Authentication**, tocá **"Comenzar"**, y en la lista de proveedores activá **"Anónimo"** (es el único que hace falta — no le vas a pedir a nadie que se registre con Google ni con mail; esto solo identifica el navegador ante Firebase para que las reglas de seguridad dejen pasar la lectura y escritura).

Todo este primer paso es gratis: el plan gratuito de Firebase (llamado "Spark") alcanza de sobra para el uso de una ferretería — miles de lecturas y escrituras por día sin costo.

## 2. Reglas de seguridad de Firestore

Por defecto, Firestore en modo producción **bloquea todo**. Hay que decirle explícitamente que cualquiera que haya entrado (aunque sea de forma anónima) puede leer y escribir. En **Firestore Database → Reglas**, reemplazá el contenido por esto y tocá **"Publicar"**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Con esto, cualquiera que abra el link de la app (y por lo tanto quede autenticado de forma anónima) puede ver y modificar los datos — es el mismo modelo de "confianza familiar" que ya tenías en la versión de Claude: no hay usuarios separados a nivel de la base, la separación de "quién sos" (Esteban, Flavio, tu cuñada) la maneja la propia app por arriba, con su pantalla de login y su registro de auditoría. No es una seguridad a prueba de balas, pero es consistente con lo que ya se había aceptado antes.

## 3. Completar la configuración en el archivo

1. En la Consola de Firebase, andá al ícono de **engranaje (⚙️) → Configuración del proyecto**, bajá hasta **"Tus apps"** y tocá el ícono `</>` para agregar una app web. Ponele un nombre (por ejemplo `caja-web`) y **no hace falta** activar Firebase Hosting en ese paso si vas a usar otro método de hosting (ver sección 4) — si pensás usar Firebase Hosting, podés dejarlo tildado.
2. Firebase te va a mostrar un bloque de código con algo así:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "caja-monroe-xxxxx.firebaseapp.com",
     projectId: "caja-monroe-xxxxx",
     storageBucket: "caja-monroe-xxxxx.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
3. Abrí el archivo `caja-monroe-web.html` con un editor de texto (el Bloc de notas de Windows sirve, o algo como Notepad++/VS Code si tenés). Cerca del principio del `<script>` vas a encontrar un bloque que dice:

   ```js
   var firebaseConfig = {
     apiKey: "PEGAR_ACA",
     ...
   };
   ```
4. Reemplazá cada `"PEGAR_ACA"` por el valor real que te dio Firebase (`apiKey`, `authDomain`, `projectId`, etc.), guardá el archivo, y listo. Este dato **no es secreto** — no hay problema en que quede a la vista en el archivo; lo que protege los datos son las reglas de seguridad del paso 2, no ocultar esta configuración.

## 4. Subir el archivo a un link propio

Con el paso 3 hecho, el archivo ya funciona solo con abrirlo — pero para que todos en la ferretería lo usen desde un link fijo (y no un archivo que hay que mandar por WhatsApp cada vez), conviene subirlo a un hosting. Cualquiera de estas opciones es gratuita y te da un link estable:

**Opción más simple — Netlify (arrastrar y soltar):**
1. Entrá a [app.netlify.com/drop](https://app.netlify.com/drop) (no hace falta crear cuenta para probarlo, aunque conviene crear una cuenta gratuita para poder actualizar el archivo más adelante).
2. Arrastrá el archivo `caja-monroe-web.html` a la página.
3. Netlify te da un link al toque (algo como `nombre-random.netlify.app`). Para que la página de inicio sea justo esta, renombrá el archivo a `index.html` antes de subirlo, o buscá la opción de "renombrar" en el panel de Netlify después de subirlo.

**Alternativa — Firebase Hosting** (si ya tenés todo en Firebase, podés dejarlo ahí mismo): requiere instalar Node.js y correr `npm install -g firebase-tools`, `firebase login`, `firebase init hosting` y `firebase deploy` desde una terminal, apuntando la carpeta pública al archivo (renombrado a `index.html`). Es un poco más técnico que Netlify pero mantiene todo en un solo lugar.

**Otra alternativa — GitHub Pages**, si ya usás GitHub: subir el archivo a un repositorio y activar Pages en la configuración del repositorio.

Cualquiera de las tres te va a dar una URL fija tipo `https://algo.netlify.app` (o la que corresponda) que podés guardar como acceso directo en el celular de cada uno, igual que se hace con una app.

## 5. Primer ingreso

La primera vez que alguien abre el link, la app crea sola 3 usuarios de fábrica (los mismos que ya existían en la versión de Claude):

- **esteban** / `admin2026` (administrador — ve la solapa de Auditoría)
- **flavio** / `flavio2026`
- **gaby** / `gaby2026`

Por seguridad, una vez que confirmes que todo funciona, entrá con cada usuario y cambiá su contraseña desde el botón **"Cambiar clave"** (arriba a la derecha, al lado del nombre de la sesión).

## Qué es distinto respecto a la versión de Claude

- **Todo lo demás funciona igual**: caja diaria, proveedores, vencidas, cheques/echeq, gastos mensuales, pagos, el plan de pagos con el nuevo cálculo de plazo de proveedores, la pestaña de **IVA Compras y Ventas** (carga manual por mes, con el cálculo de "a pagar"/"a favor"), exportar planillas, y el registro de auditoría.
- La solapa **"🛒 Compras"** también está, pero funciona distinto: en la versión de Claude leía el archivo de Google Drive en vivo (usando un conector que solo existe adentro de Claude); acá en cambio se sube el archivo a mano con el botón **"Subir archivo (.xlsx)"** — el mismo archivo "Compras Diarias Ferre.xlsx" que ya usás. Una vez subido queda guardado, así que no hace falta volver a subirlo cada vez que entrás — solo cuando quieras traer los pedidos nuevos que anotaste desde la última vez. Si Flavio o Gaby suben una versión más nueva desde su celular, a los demás se les actualiza solo, sin que cada uno tenga que subirlo por su lado.
- La foto con lectura automática por IA (el botón "🤖 Leer foto") tampoco está disponible acá — se apaga solo y se puede seguir cargando el cierre a mano, como si la IA no estuviera.
- Las descargas de planillas (backup en Excel/HTML) funcionan igual, pero ahora bajan el archivo directo con el mecanismo normal del navegador en vez de la ventana de descarga de Claude.

## 6. Asistente con IA (opcional)

Caja Monroe Web tiene un botoncito flotante de chat (💬, abajo a la derecha) que responde preguntas sobre los datos ya cargados — turnos de caja, proveedores y pagos, compras, IVA, gastos mensuales. Por ejemplo: "¿cuánto le debo a Herrametal?", "¿qué falta pedir de Mig Luz?", "¿cuánto gastamos en sueldos este mes?".

Para que piense necesita una IA (Claude, de Anthropic) del otro lado, y esconder la clave de esa IA en un lugar seguro requiere un paso más técnico que el de arrastrar un archivo — por eso esta sección es aparte y opcional: si no la hacés, el resto de la app funciona exactamente igual, y el botón de chat simplemente muestra un aviso de que falta configurarlo.

### 6.1. Conseguir una clave de la API de Anthropic

1. Entrá a [console.anthropic.com](https://console.anthropic.com) y creá una cuenta (es aparte de tu cuenta normal de Claude — esta es para pagar por uso, no tiene una suscripción mensual fija).
2. Cargá una tarjeta en **Billing** (con un límite chico alcanza — ver el cálculo de costo más abajo).
3. Andá a **Settings → API Keys**, tocá **"Create Key"**, y copiá la clave (empieza con `sk-ant-...`). Guardala en un lugar seguro: Anthropic solo la muestra una vez.
4. Costo aproximado: cada pregunta cuesta centavos de dólar (usa el modelo más económico de Claude). Salvo que lo usen todo el día sin parar, el gasto mensual debería ser de unos pocos dólares.

### 6.2. Instalar las herramientas (una sola vez)

Esto se hace una vez en tu computadora (no hace falta repetirlo para cada actualización):

1. Instalá **Node.js** desde [nodejs.org](https://nodejs.org) (la versión "LTS" que recomienda la página) si todavía no lo tenés.
2. Abrí una terminal (en Windows: buscá "cmd" o "PowerShell"; en Mac: buscá "Terminal") y escribí:
   ```
   npm install -g netlify-cli
   ```
3. Iniciá sesión con tu cuenta de Netlify (la misma con la que ya subiste el sitio):
   ```
   netlify login
   ```
   Esto abre el navegador para confirmar el ingreso — solo hay que aceptar.

### 6.3. Subir la carpeta (reemplaza el "arrastrar y soltar" para esta versión)

A partir de ahora, en vez de un archivo suelto, se sube una **carpeta** con tres cosas adentro: `index.html` (la app), `netlify.toml` (configuración) y `netlify/functions/asistente.js` (la función que esconde la clave). Yo te la doy ya armada así.

1. Descomprimí la carpeta que te mandé en algún lugar fácil de encontrar (por ejemplo el Escritorio).
2. Abrí una terminal **adentro de esa carpeta** (en Windows: entrá a la carpeta en el Explorador, hacé clic derecho en un espacio vacío y elegí "Abrir en Terminal"; en Mac: arrastrá la carpeta al ícono de Terminal, o `cd` hasta ahí).
3. La primera vez, conectá la carpeta con tu sitio ya existente de Netlify:
   ```
   netlify link
   ```
   Elegí **"Use current git remote"** si te lo pregunta que no aplica, o directamente **"Choose from a list of sites in your team"** y buscá tu sitio (el mismo que ya tenías con Caja Monroe Web).
4. Subí todo con:
   ```
   netlify deploy --prod
   ```
   Cuando pregunte "Publish directory", escribí un punto (`.`) y Enter. A los pocos segundos te da el mismo link de siempre, ya actualizado.

De ahí en adelante, cada vez que yo te pase una versión nueva de esta carpeta, el paso 4 (`netlify deploy --prod`) es todo lo que hace falta — no hace falta repetir `netlify link` de nuevo.

### 6.4. Cargar la clave (variable de entorno)

1. Entrá a tu sitio en [app.netlify.com](https://app.netlify.com), y andá a **Site configuration → Environment variables**.
2. Tocá **"Add a variable"**, poné como clave `ANTHROPIC_API_KEY` y como valor pegá la clave que copiaste en el paso 6.1 (`sk-ant-...`).
3. Guardá, y volvé a correr `netlify deploy --prod` una vez más desde la carpeta (para que la función tome la clave nueva).

Con eso, el botón de chat ya debería funcionar. Si te tira un error mencionando "ANTHROPIC_API_KEY", es que este paso quedó pendiente o la clave tiene un error de tipeo.

### Qué NO cambia con esto

Ningún dato de Firebase se mueve ni se expone: el asistente no guarda nada nuevo, solo lee (en el momento de cada pregunta) lo que ya está cargado en la pantalla y se lo manda a la IA junto con la pregunta, sin fotos ni datos de más. El resto de la app (caja, proveedores, compras, IVA, gastos, exportar) sigue funcionando exactamente igual, se haya configurado el asistente o no.

## Si algo no funciona

- Si al abrir la página aparece el aviso **"Falta completar la configuración de Firebase"**, es que el paso 3 quedó a medias — revisá que ningún campo de `firebaseConfig` diga todavía `"PEGAR_ACA"`.
- Si aparece un error mencionando la palabra **"index"** en la consola del navegador (F12 → Consola), Firestore a veces pide crear un índice para una consulta puntual — el mismo mensaje de error trae un link que lo crea con un clic; no hace falta tocar el código.
- Cualquier otra duda, esta conversación en Claude sigue disponible para seguir ajustando el archivo.
