// =========================================
// REPOSITORIO: google-apps-script (US OPEN — restaurante002)
// ARCHIVO: Código.gs
// NUEVO: este archivo es el mismo Código.gs que ya usa Roland Garros (con LockService y el
// endpoint ?accion=csv para la carga por etapas/idioma), listo para pegar en el proyecto de
// Apps Script VINCULADO A LA HOJA DE US OPEN. El código no depende del restaurante — trabaja
// siempre sobre "Hoja 1" de la hoja de cálculo a la que esté vinculado — así que es válido
// tal cual, solo hay que desplegarlo en el proyecto de Apps Script correcto.
//
// NUEVO (22 agosto): añadido ?accion=categorias (GET/POST) para el interruptor de "activar/
// desactivar pestaña completa" del Web Editor Pro — ver bloque "GESTIÓN DE CATEGORÍAS/PESTAÑAS"
// al final de este archivo. Usa una hoja nueva "Categorias" (se crea sola la primera vez que
// hace falta, no requiere ningún paso manual). No toca nada de la lógica de "Hoja 1" de arriba.
//
// CÓMO DESPLEGARLO (resumen):
//  1) Abrir la hoja de Google Sheets de US Open (la misma que usa el Web Editor Pro en modo
//     "US Open" / restaurante002).
//  2) Extensiones > Apps Script.
//  3) Sustituir TODO el contenido de Código.gs por el de este archivo.
//  4) Implementar > Gestionar implementaciones > icono de lápiz sobre la implementación web
//     existente (la que genera la URL que ya está en WEB_APP_URL_RESTAURANTE002, en
//     config.js del Web Editor Pro) > Versión: Nueva versión > Implementar.
//     OJO: hay que EDITAR la implementación existente (no crear una nueva), para que la URL
//     ?exec siga siendo la misma que ya está puesta en config.js y en script.js de esta web.
//     Si en vez de eso se crea una implementación nueva, la URL cambiará y habrá que
//     actualizarla en los dos sitios (WEB_APP_URL_RESTAURANTE002 y LIVE_CSV_ENDPOINT /
//     APP_SCRIPT_URL de este script.js).
// =========================================

function doGet(e) {
  // NUEVO: acción para servir el CSV en vivo, leyendo la hoja directamente con
  // SpreadsheetApp (sin pasar por el caché de "publicar en la web" de Google,
  // que puede tardar varios minutos en reflejar cambios). Se usa desde
  // cargarGoogleSheets() en el admin para el botón "Sincronizar con Google
  // Sheet", y desde la web pública para la carga por etapas/idioma.
  if (e && e.parameter && e.parameter.accion === 'csv') {
    // NUEVO (26 agosto, caché local + delta por hash): dos parámetros opcionales nuevos.
    // - soloBase=1: ignora "idiomas" y devuelve SOLO las columnas base (incluida HASH_FILA) de
    //   TODAS las filas — una petición de unos pocos KB para que la web pública compruebe qué
    //   ha cambiado desde la última visita sin descargar la carta entera.
    // - ids=1,2,3: filtra el resultado a solo esas filas (por ID) — para pedir el contenido
    //   completo SOLO de las filas que el paso anterior (soloBase) marcó como cambiadas.
    return servirCsvEnVivo(e.parameter.idiomas || '', e.parameter.ids || '', e.parameter.soloBase === '1');
  }

  // NUEVO: estado activa/inactiva de cada pestaña (sección) del menú — ver bloque
  // "GESTIÓN DE CATEGORÍAS/PESTAÑAS" al final del archivo.
  if (e && e.parameter && e.parameter.accion === 'categorias') {
    return servirCategoriasEnVivo();
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ADMIN CARTA V 13.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// NUEVO: construye el CSV a partir del contenido actual de "Hoja 1", con el
// mismo escapado estándar de CSV (comillas dobladas, campo entre comillas si
// contiene coma/comilla/salto de línea) que ya espera parseCSV() en ambos
// frontends (admin y web pública).
//
// idiomasParam (opcional): lista separada por comas de códigos de idioma
// (p.ej. "ko" o "es,en,de,fr,it"). Si se indica, solo se incluyen las
// columnas base (ID, Precio, Activa, Carpeta, Archivo_Foto, Alergenos_Cod)
// más Nombre_<idioma> / INFO_<idioma> de los idiomas pedidos — así la web
// pública puede cargar primero solo lo que necesita (idioma del cliente +
// idiomas esenciales) en vez de las 26 columnas de golpe. Si se omite, se
// sirven TODAS las columnas (comportamiento usado por "Sincronizar" en el
// admin, que necesita ver la hoja completa).
//
// idsParam (opcional, 26 agosto): lista separada por comas de IDs de plato/vino (p.ej.
// "1001,1002,3005"). Si se indica, el CSV resultante se filtra a SOLO esas filas — pensado
// para pedir el contenido completo de las filas que han cambiado desde la última visita
// (ver soloBaseParam más abajo), sin tener que descargar la carta entera.
//
// soloBaseParam (opcional, 26 agosto): si es true, ignora idiomasParam y devuelve SOLO las
// columnas base (incluida HASH_FILA) de todas las filas — una petición de unos pocos KB para
// que un cliente compruebe qué ha cambiado desde la última vez sin descargar ningún idioma.
function servirCsvEnVivo(idiomasParam, idsParam, soloBaseParam) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName("Hoja 1");
  if (!hoja) {
    return ContentService.createTextOutput("Error: No existe la pestaña Hoja 1").setMimeType(ContentService.MimeType.TEXT);
  }

  var ultimaFila = hoja.getLastRow();
  var ultimaColumna = hoja.getLastColumn();
  if (ultimaFila < 1 || ultimaColumna < 1) {
    return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.CSV);
  }

  // NUEVO: la fila de cabeceras se lee SOLA primero (1 sola fila: coste insignificante,
  // no escala con el tamaño de la carta) para poder decidir qué columnas hacen falta ANTES
  // de leer ninguna fila de datos. Antes se leía SIEMPRE la hoja entera (getRange con todas
  // las columnas) y el filtro por idioma se aplicaba después, en JS — es decir, aunque la web
  // pública solo pidiera 2 idiomas, Sheets igualmente tenía que leer y transferir las 26
  // columnas completas en cada petición. Con la carta ya en varios cientos de KB de texto
  // (descripciones + preguntas/respuestas en 26 idiomas), eso hacía cada vez más lenta
  // CUALQUIER petición, incluso las que pedían un único idioma.
  var cabeceras = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];

  // NUEVO (26 agosto): se añade HASH_FILA — hash de detección de cambios de toda la fila (ver
  // doPost/calcularHashFila), para que la web pública pueda comprobar qué ha cambiado desde su
  // última visita con una petición de solo columnas base (ver soloBaseParam).
  var COLUMNAS_BASE = ['ID', 'PRECIO', 'ACTIVA', 'CARPETA', 'ARCHIVO_FOTO', 'ALERGENOS_COD', 'OPCIONES_INACTIVAS', 'HASH_FILA'];

  var columnasAIncluir = null; // null = todas las columnas (caso admin: sin filtro de idioma)
  if (soloBaseParam) {
    // NUEVO: modo "solo comprobar cambios" — ignora idiomasParam por completo.
    columnasAIncluir = [];
    cabeceras.forEach(function(h, idx) {
      if (COLUMNAS_BASE.indexOf(String(h).toUpperCase()) !== -1) columnasAIncluir.push(idx);
    });
  } else if (idiomasParam && idiomasParam.trim() !== '') {
    var idiomasSolicitados = idiomasParam.split(',')
      .map(function(s) { return s.trim().toUpperCase(); })
      .filter(function(s) { return s; });

    columnasAIncluir = [];
    cabeceras.forEach(function(h, idx) {
      var hUpper = String(h).toUpperCase();
      var esBase = COLUMNAS_BASE.indexOf(hUpper) !== -1;
      var esDelIdiomaPedido = idiomasSolicitados.some(function(lang) {
        return hUpper === ('NOMBRE_' + lang) || hUpper === ('INFO_' + lang);
      });
      if (esBase || esDelIdiomaPedido) columnasAIncluir.push(idx);
    });
  }

  var escaparCampoCsv = function(valor) {
    var texto = (valor === null || valor === undefined) ? "" : String(valor);
    if (texto.indexOf(',') !== -1 || texto.indexOf('"') !== -1 || texto.indexOf('\n') !== -1 || texto.indexOf('\r') !== -1) {
      return '"' + texto.replace(/"/g, '""') + '"';
    }
    return texto;
  };

  var cabecerasFinal = columnasAIncluir ? columnasAIncluir.map(function(idx) { return cabeceras[idx]; }) : cabeceras;

  var filasDatos;
  if (ultimaFila < 2) {
    filasDatos = []; // solo hay cabecera, ninguna fila de datos todavía
  } else if (columnasAIncluir) {
    // NUEVO: en vez de leer TODAS las columnas de datos y descartar la mayoría después en JS
    // (que para Sheets cuesta exactamente igual que si se hubieran pedido todas), se agrupan
    // los índices necesarios en TRAMOS CONTIGUOS y se hace un getRange por tramo — así Sheets
    // solo lee/transfiere las columnas que esta petición concreta va a usar. columnasAIncluir
    // ya viene ordenado ascendente (se construyó recorriendo las cabeceras de izquierda a
    // derecha), así que agrupar en tramos y concatenar los resultados en el mismo orden
    // reproduce EXACTAMENTE el mismo resultado que filtrar después de leerlo todo.
    var tramos = [];
    columnasAIncluir.forEach(function(idx) {
      var ultimoTramo = tramos[tramos.length - 1];
      if (ultimoTramo && idx === ultimoTramo[1] + 1) {
        ultimoTramo[1] = idx; // extiende el tramo contiguo actual
      } else {
        tramos.push([idx, idx]); // nuevo tramo
      }
    });

    var datosPorTramo = tramos.map(function(t) {
      return hoja.getRange(2, t[0] + 1, ultimaFila - 1, t[1] - t[0] + 1).getValues();
    });

    filasDatos = [];
    for (var f = 0; f < ultimaFila - 1; f++) {
      var filaCompuesta = [];
      for (var ti = 0; ti < tramos.length; ti++) {
        filaCompuesta = filaCompuesta.concat(datosPorTramo[ti][f]);
      }
      filasDatos.push(filaCompuesta);
    }
  } else {
    filasDatos = hoja.getRange(2, 1, ultimaFila - 1, ultimaColumna).getValues();
  }

  // NUEVO (26 agosto): filtro opcional por IDs concretos — para servir SOLO las filas que un
  // cliente ha marcado como cambiadas (tras compararlas con soloBaseParam), en vez de la carta
  // entera. Se aplica DESPUÉS de leer/filtrar columnas (el coste de lectura de Sheets ya está
  // pagado igual; lo que se reduce aquí es el tamaño de la respuesta, que es lo que tarda en
  // bajar por red).
  if (idsParam && idsParam.trim() !== '') {
    var idsSolicitados = {};
    idsParam.split(',').forEach(function(s) {
      s = s.trim();
      if (s) idsSolicitados[s] = true;
    });
    var idxIdEnFinal = -1;
    cabecerasFinal.forEach(function(h, idx) { if (String(h).toUpperCase() === 'ID') idxIdEnFinal = idx; });
    if (idxIdEnFinal !== -1) {
      filasDatos = filasDatos.filter(function(fila) { return idsSolicitados[String(fila[idxIdEnFinal]).trim()]; });
    }
  }

  var lineas = [cabecerasFinal].concat(filasDatos).map(function(fila) {
    return fila.map(escaparCampoCsv).join(',');
  });

  var csvTexto = lineas.join('\r\n');
  return ContentService.createTextOutput(csvTexto).setMimeType(ContentService.MimeType.CSV);
}

function doPost(e) {
  // NUEVO: guardado del estado activa/inactiva de UNA pestaña — payload distinto y mucho más
  // pequeño que el guardado normal de platos, así que se enruta ANTES del lock/lógica de
  // "Hoja 1" de abajo, hacia su propia función (que tiene su propio lock interno).
  if (e && e.parameter && e.parameter.accion === 'categorias') {
    return guardarCategoria(e);
  }

  // NUEVO (16 septiembre): guardado de la "Info" (descripción + preguntas/respuestas) de UN
  // solo plato, generada automáticamente al crear/editarlo en el Web Editor Pro — ver
  // guardarInfoPlato() al final de este archivo. Igual que "categorias", se enruta ANTES del
  // lock/lógica de "Hoja 1" de abajo (que reescribe la hoja ENTERA) porque esto solo toca la
  // fila de un plato concreto, nunca el resto de la carta.
  if (e && e.parameter && e.parameter.accion === 'infoplato') {
    return guardarInfoPlato(e);
  }

  // =====================================================================
  // NUEVO: Bloqueo global del script. Sin esto, dos peticiones doPost casi
  // simultáneas (dos pestañas, doble clic, o el editor normal guardando a
  // la vez que corre el lote de traducción/generación) pueden interleavarse
  // durante el clearContents(): una lee la hoja justo cuando está vacía,
  // cree que nunca existieron columnas INFO_*, y las borra para siempre.
  // Con el lock, solo una ejecución de doPost corre a la vez; el resto
  // espera en cola y ve el resultado real de la anterior.
  // =====================================================================
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // espera hasta 30s si otra ejecución está en curso
  } catch (lockErr) {
    return ContentService.createTextOutput("Error: Servidor ocupado (bloqueo), reintenta en unos segundos.");
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var nombreHoja = "Hoja 1";
    var hoja = ss.getSheetByName(nombreHoja);

    if (!hoja) return ContentService.createTextOutput("Error: No existe la pestaña " + nombreHoja);

    var datos = JSON.parse(e.postData.contents);
    if (!datos || datos.length === 0) return ContentService.createTextOutput("Error: Datos vacíos recibidos.");

    // Las únicas 32 columnas base oficiales e inalterables
    // NUEVO: se añade "Opciones_Inactivas" (columna 33) — guarda, por plato, las posiciones
    // (1, 2, 3...) de las palabras entre "//.../ /" del Nombre_ES que están DESACTIVADAS
    // (p.ej. "2,5"). Es la misma para todos los idiomas (no depende de la traducción), así
    // que vive como una columna base más, igual que Alergenos_Cod — ver la función auxiliar
    // "extraerOpciones" del lado de la web pública para cómo se aplica al render.
    var cabecerasBaseFijas = [
      "ID", "Precio", "Activa", "Nombre_ES", "Carpeta", "Archivo_Foto", "Alergenos_Cod",
      "Nombre_EN", "Nombre_DE", "Nombre_FR", "Nombre_IT", "Nombre_RU", "Nombre_NL",
      "Nombre_PL", "Nombre_SV", "Nombre_NO", "Nombre_DA", "Nombre_FI", "Nombre_PT",
      "Nombre_RO", "Nombre_HU", "Nombre_CS", "Nombre_EL", "Nombre_TR", "Nombre_AR",
      "Nombre_ZH", "Nombre_JA", "Nombre_CA", "Nombre_EU", "Nombre_GL", "Nombre_VA", "Nombre_KO",
      "Opciones_Inactivas"
    ];

    // Leer ANTES de borrar nada, para poder recuperar el contenido
    // de columnas (p.ej. INFO_*) que la hoja ya tuviera pero que el payload
    // entrante no incluya.
    var datosPrevios = {};       // { idPlato: { CABECERA_UPPER: valor, ... } }
    var cabecerasPreviasInfo = []; // cabeceras INFO_* que ya existían en la hoja

    var ultimaFila = hoja.getLastRow();
    var ultimaColumna = hoja.getLastColumn();
    if (ultimaFila >= 2 && ultimaColumna >= 1) {
      var cabecerasActuales = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
      var idxIdPrevio = cabecerasActuales.findIndex(function(h) { return String(h).toUpperCase() === "ID"; });

      cabecerasActuales.forEach(function(h) {
        var hUpper = String(h).toUpperCase();
        if (hUpper.indexOf("INFO_") === 0) cabecerasPreviasInfo.push(String(h));
      });

      if (idxIdPrevio !== -1) {
        var filasPrevias = hoja.getRange(2, 1, ultimaFila - 1, ultimaColumna).getValues();
        filasPrevias.forEach(function(fila) {
          var idFila = parseFloat(fila[idxIdPrevio]);
          if (isNaN(idFila)) return;
          var registro = {};
          cabecerasActuales.forEach(function(h, i) {
            registro[String(h).toUpperCase()] = fila[i];
          });
          datosPrevios[idFila] = registro;
        });
      }
    }

    // Columnas INFO_* presentes en el payload que acaba de llegar
    var setInfoDinamicos = {};
    datos.forEach(function(p) {
      Object.keys(p).forEach(function(k) {
        if (k.toUpperCase().indexOf("INFO_") === 0) {
          setInfoDinamicos[k.toUpperCase()] = true;
        }
      });
    });

    // Unión de las INFO_* que ya existían en la hoja + las que trae este payload.
    cabecerasPreviasInfo.forEach(function(h) { setInfoDinamicos[h.toUpperCase()] = true; });

    // Recuperar el "casing" original bonito (INFO_ES, no INFO_es) para las cabeceras nuevas
    var infosExtraidos = Object.keys(setInfoDinamicos).sort().map(function(kUpper) {
      var langSuffix = kUpper.replace("INFO_", "").toLowerCase();
      return "INFO_" + langSuffix;
    });

    // NUEVO (26 agosto): "Hash_Fila" va SIEMPRE al final de todo (después de las columnas
    // INFO_* dinámicas), para poder localizarla de forma fiable como "la última columna" al
    // calcular el hash de cada fila más abajo, sea cual sea el número de idiomas INFO_* que
    // haya en un momento dado.
    var cabecerasFinales = cabecerasBaseFijas.concat(infosExtraidos).concat(["Hash_Fila"]);
    var totalColumnas = cabecerasFinales.length;

    // Limpiar contenido anterior de la hoja
    hoja.clearContents();

    // Escribir las cabeceras exactas
    hoja.getRange(1, 1, 1, totalColumnas).setValues([cabecerasFinales]);

    // Ordenar los datos por ID numérico ascendente
    datos.sort(function(a, b) {
      var idA = parseFloat(a.id || a.ID) || 0;
      var idB = parseFloat(b.id || b.ID) || 0;
      return idA - idB;
    });

    // Mapeo directo y estricto contra las cabeceras oficiales
    var matrizFinal = datos.map(function(p) {
      var idPlato = parseFloat(p.id || p.ID);
      var previo = (!isNaN(idPlato) && datosPrevios[idPlato]) ? datosPrevios[idPlato] : null;

      var fila = cabecerasFinales.map(function(k) {
        var val = "";
        var kUpper = k.toUpperCase();

        var posiblesClaves = [
          k,
          k.toLowerCase(),
          k.toUpperCase(),
          k.toLowerCase().replace(/_/g, ''),
          k.toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2')
        ];

        if (kUpper === "ACTIVA") {
          posiblesClaves = ["activa", "Activa", "ACTIVA"];
        } else if (kUpper === "ARCHIVO_FOTO") {
          posiblesClaves = ["archivo_foto", "archivoFoto", "Archivo_Foto", "ARCHIVO_FOTO", "imagen", "foto"];
        } else if (kUpper === "ALERGENOS_COD") {
          posiblesClaves = ["alergenos_cod", "alergenosCod", "Alergenos_Cod", "ALERGENOS_COD", "alergenos"];
        } else if (kUpper === "PRECIO") {
          posiblesClaves = ["precio", "Precio", "PRECIO"];
        } else if (kUpper === "CARPETA") {
          posiblesClaves = ["carpeta", "Carpeta", "CARPETA"];
        } else if (kUpper === "OPCIONES_INACTIVAS") {
          posiblesClaves = ["opciones_inactivas", "opcionesInactivas", "Opciones_Inactivas", "OPCIONES_INACTIVAS"];
        } else if (kUpper.indexOf("INFO_") === 0) {
          var langSuffix = kUpper.replace("INFO_", "").toLowerCase();
          posiblesClaves = [`info_${langSuffix}`, `info_${langSuffix.toUpperCase()}`, `INFO_${langSuffix.toUpperCase()}`];
        }

        // Búsqueda segura iterando correctamente por el array
        var encontradoEnPayload = false;
        for (var i = 0; i < posiblesClaves.length; i++) {
          var pk = posiblesClaves[i];
          if (p[pk] !== undefined && p[pk] !== null) {
            val = p[pk];
            encontradoEnPayload = true;
            break;
          }
        }

        // Búsqueda genérica por coincidencia exacta insensible a mayúsculas si no se encontró
        if (!encontradoEnPayload) {
          Object.keys(p).forEach(function(prop) {
            if (prop.toUpperCase() === kUpper) {
              if (p[prop] !== undefined && p[prop] !== null) {
                val = p[prop];
                encontradoEnPayload = true;
              }
            }
          });
        }

        // Si esta columna NO viene en el payload actual para este plato
        // (p.ej. INFO_ES cuando se guarda desde el editor normal), no se
        // escribe "" — se conserva el valor que ya había en la hoja.
        if (!encontradoEnPayload && previo && previo[kUpper] !== undefined && previo[kUpper] !== null) {
          val = previo[kUpper];
        }

        return (val !== undefined && val !== null) ? val : "";
      });

      // NUEVO (26 agosto): se recalcula SIEMPRE el Hash_Fila real a partir del contenido final
      // de la fila (todas las columnas menos ella misma, que ocupa la última posición) — así
      // cualquier cambio real en cualquier columna (precio, alérgenos, cualquier idioma...)
      // cambia el hash, y la web pública puede saber exactamente qué filas han cambiado desde
      // su última visita sin tener que descargar el contenido completo de todas para comparar.
      // Se ignora a propósito cualquier "Hash_Fila" que viniera del payload o de previo (el
      // bucle de arriba pudo copiarlo de la hoja anterior) — el único hash válido es el que se
      // calcula aquí, sobre el contenido que se está guardando AHORA.
      var indiceHash = fila.length - 1;
      var contenidoParaHash = fila.slice(0, indiceHash).join('');
      fila[indiceHash] = calcularHashFila(contenidoParaHash);
      return fila;
    });

    // Volcar los datos limpios en la hoja a partir de la fila 2
    if (matrizFinal.length > 0) {
      hoja.getRange(2, 1, matrizFinal.length, totalColumnas).setValues(matrizFinal);
    }

    return ContentService.createTextOutput("Sincronización Correcta: " + matrizFinal.length + " filas.");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message);
  } finally {
    // NUEVO: liberar el bloqueo pase lo que pase (éxito o error), para no
    // dejar el script bloqueado si algo falla a mitad de la ejecución.
    lock.releaseLock();
  }
}

// =========================================================================================
// NUEVO (26 agosto): hash corto de detección de cambios para una fila completa. NO es un hash
// criptográfico en el sentido de seguridad (no hace falta resistir ataques, solo detectar de
// forma fiable si el contenido cambió) — se usa SHA-256 truncado a 8 bytes (16 caracteres hex)
// solo porque Utilities ya lo trae hecho, no por necesitar esa robustez.
// =========================================================================================
function calcularHashFila(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < 8; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    hex += (h.length === 1 ? '0' + h : h);
  }
  return hex;
}

// =========================================================================================
// NUEVO (22 agosto): GESTIÓN DE CATEGORÍAS/PESTAÑAS — activar/desactivar una sección entera
// del menú (p.ej. "Tacos") para que no aparezca en la web pública, sin tocar el Activa de
// cada plato individual (eso ya existe y es independiente de esto).
//
// Vive en una hoja NUEVA y separada, "Categorias" (2 columnas: ID | Activa), que este mismo
// script crea sola la primera vez que hace falta — no requiere ningún paso manual en Sheets.
// No interfiere en nada con "Hoja 1": doPost() de arriba solo la toca si el payload trae
// datos de platos (array), nunca si es una petición de categorías.
//
// Convención IMPORTANTE: una pestaña que NO tiene fila en esta hoja se considera ACTIVA por
// defecto. Solo se escribe una fila cuando el usuario la desactiva (o la reactiva después de
// haberla desactivado) desde el Web Editor Pro. Así, mientras nadie toque nada, el
// comportamiento de la web pública es exactamente el de siempre (todas las pestañas visibles).
// =========================================================================================

// Devuelve (y crea si no existe) la hoja "Categorias" con su cabecera.
function obtenerHojaCategorias(ss) {
  var hoja = ss.getSheetByName("Categorias");
  if (!hoja) {
    hoja = ss.insertSheet("Categorias");
    hoja.getRange(1, 1, 1, 2).setValues([["ID", "Activa"]]);
  }
  return hoja;
}

// GET ?accion=categorias — CSV con las pestañas que tienen fila propia (normalmente solo las
// que alguna vez se desactivaron). Formato idéntico al resto de endpoints CSV del proyecto.
function servirCategoriasEnVivo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = obtenerHojaCategorias(ss);
  var ultimaFila = hoja.getLastRow();
  var filas = ultimaFila >= 2 ? hoja.getRange(2, 1, ultimaFila - 1, 2).getValues() : [];

  var escaparCampoCsv = function(valor) {
    var texto = (valor === null || valor === undefined) ? "" : String(valor);
    if (texto.indexOf(',') !== -1 || texto.indexOf('"') !== -1 || texto.indexOf('\n') !== -1) {
      return '"' + texto.replace(/"/g, '""') + '"';
    }
    return texto;
  };

  var lineas = [["ID", "Activa"]].concat(filas).map(function(fila) {
    return fila.map(escaparCampoCsv).join(',');
  });

  return ContentService.createTextOutput(lineas.join('\r\n')).setMimeType(ContentService.MimeType.CSV);
}

// POST ?accion=categorias — body JSON: { "id": "tacos", "activa": true|false }.
// Actualiza la fila de esa pestaña si ya existe, o la crea si es la primera vez que se toca.
function guardarCategoria(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return ContentService.createTextOutput("Error: Servidor ocupado (bloqueo), reintenta en unos segundos.");
  }

  try {
    var datos = JSON.parse(e.postData.contents);
    var id = String(datos.id || "").trim();
    if (!id) return ContentService.createTextOutput("Error: falta el id de la pestaña.");
    var activaTexto = datos.activa ? "SI" : "NO";

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = obtenerHojaCategorias(ss);
    var ultimaFila = hoja.getLastRow();

    var filaEncontrada = -1;
    if (ultimaFila >= 2) {
      var idsActuales = hoja.getRange(2, 1, ultimaFila - 1, 1).getValues();
      for (var i = 0; i < idsActuales.length; i++) {
        if (String(idsActuales[i][0]).trim() === id) {
          filaEncontrada = i + 2; // +2: getValues() es 0-index y empieza en la fila 2
          break;
        }
      }
    }

    if (filaEncontrada === -1) {
      hoja.appendRow([id, activaTexto]);
    } else {
      hoja.getRange(filaEncontrada, 2).setValue(activaTexto);
    }

    return ContentService.createTextOutput("OK: pestaña '" + id + "' = " + activaTexto);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// =========================================================================================
// NUEVO (16 septiembre): GUARDADO DE LA "INFO" (descripción + preguntas/respuestas) DE UN SOLO
// PLATO — usado por la generación automática del Web Editor Pro al crear/editar un plato (ver
// generarInfoAutomaticaPlato() en app.js). A propósito NO reutiliza el doPost() de "Hoja 1" de
// arriba, que reescribe la hoja ENTERA (clearContents + rescritura completa a partir del
// payload recibido): si ese guardado general se disparara con una copia en memoria desactualizada
// (p.ej. justo después de que "Ajustes Expertos" generase Info de otros platos, que tarda unos
// minutos en reflejarse en la caché de "publicar en la web" que usa el editor normal), podría
// PISAR la Info ya generada de platos que esta sesión del editor no ha tocado. Este endpoint,
// en cambio, localiza la fila de ESTE plato por su ID y solo escribe en las columnas INFO_*
// indicadas — nunca toca ninguna otra fila ni ninguna otra columna, así que es seguro llamarlo
// en cualquier momento sin ese riesgo.
//
// POST ?accion=infoplato — body JSON: { "id": 1234, "info": { "es": {...}, "en": {...}, "pl": {...}, ... } }
// Cada valor de "info" es el objeto de la ficha en ese idioma (desc/q1/r1/q2/r2/q3/r3, o solo
// desc para vinos) — se guarda como JSON.stringify(...) en la columna INFO_<IDIOMA>, creándola
// primero si todavía no existe (insertada justo ANTES de Hash_Fila, para no romper la
// convención de que Hash_Fila es siempre la ÚLTIMA columna de la hoja — ver servirCsvEnVivo()
// y doPost() más arriba, que sí dependen de eso). Tras escribir, recalcula Hash_Fila de esa
// fila para que la web pública detecte el cambio (ver soloBaseParam en servirCsvEnVivo()).
function guardarInfoPlato(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return ContentService.createTextOutput("Error: Servidor ocupado (bloqueo), reintenta en unos segundos.");
  }

  try {
    var datos = JSON.parse(e.postData.contents);
    var idPlato = parseFloat(datos.id);
    if (isNaN(idPlato)) return ContentService.createTextOutput("Error: falta o es inválido el id del plato.");

    var infoPorIdioma = datos.info || {};
    var idiomasRecibidos = Object.keys(infoPorIdioma);

    // NUEVO: huella (hash) de NOMBRE_ES + ALERGENOS_COD en el momento en que se generó/confirmó
    // esta ficha — la calcula el frontend (ver generarInfoAutomaticaPlato() en app.js, misma
    // fórmula que calcularHashContenido() de utils.js) y la manda aquí para poder guardarla
    // junto a la Info. Antes esta función NUNCA escribía INFO_HASH_FICHA (solo quedaba en
    // memoria del navegador, ver app.js) — así que tras recargar la página esa huella volvía a
    // estar vacía y CUALQUIER edición de un plato (aunque solo fuera el precio, que ni siquiera
    // forma parte de esta huella) disparaba una regeneración completa con IA solo porque no
    // había huella guardada con la que comparar. También puede llegar SOLA, sin "info" (objeto
    // vacío) — caso "bautizo": la ficha ya existía y solo hace falta guardar su huella, sin
    // volver a generar ni guardar contenido nuevo (ver app.js).
    var hashFichaValor = (datos.hashFicha !== undefined && datos.hashFicha !== null) ? String(datos.hashFicha) : "";

    if (idiomasRecibidos.length === 0 && !hashFichaValor) return ContentService.createTextOutput("OK: nada que guardar (objeto 'info' vacío y sin huella).");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName("Hoja 1");
    if (!hoja) return ContentService.createTextOutput("Error: No existe la pestaña Hoja 1");

    var ultimaFila = hoja.getLastRow();
    var ultimaColumna = hoja.getLastColumn();
    if (ultimaFila < 2 || ultimaColumna < 1) return ContentService.createTextOutput("Error: la hoja no tiene platos todavía.");

    var cabeceras = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
    var idxId = cabeceras.findIndex(function(h) { return String(h).toUpperCase() === "ID"; });
    if (idxId === -1) return ContentService.createTextOutput("Error: no se encuentra la columna ID en la hoja.");

    // Localizar la fila de ESTE plato por su ID (recorre solo la columna ID, no toda la hoja).
    var idsColumna = hoja.getRange(2, idxId + 1, ultimaFila - 1, 1).getValues();
    var filaEncontrada = -1;
    for (var i = 0; i < idsColumna.length; i++) {
      if (parseFloat(idsColumna[i][0]) === idPlato) { filaEncontrada = i + 2; break; } // +2: 0-index y empieza en fila 2
    }
    if (filaEncontrada === -1) return ContentService.createTextOutput("Error: no se encontró ningún plato con ID " + idPlato + " en la hoja.");

    idiomasRecibidos.forEach(function(langLower) {
      var nombreColumna = "INFO_" + langLower.toUpperCase();
      var idxCol = cabeceras.findIndex(function(h) { return String(h).toUpperCase() === nombreColumna; });

      if (idxCol === -1) {
        // Columna nueva: se inserta justo ANTES de Hash_Fila (si ya existe esa columna) para
        // mantener la convención de que Hash_Fila es siempre la última — si por lo que sea la
        // hoja todavía no tuviera Hash_Fila, se añade sencillamente al final.
        var idxHashActual = cabeceras.findIndex(function(h) { return String(h).toUpperCase() === "HASH_FILA"; });
        var posicionInsercion; // 1-based
        if (idxHashActual !== -1) {
          posicionInsercion = idxHashActual + 1; // justo delante de Hash_Fila
          hoja.insertColumnBefore(posicionInsercion);
          cabeceras.splice(idxHashActual, 0, nombreColumna);
        } else {
          posicionInsercion = cabeceras.length + 1;
          cabeceras.push(nombreColumna);
        }
        hoja.getRange(1, posicionInsercion).setValue(nombreColumna);
        idxCol = posicionInsercion - 1;
      }

      var valor = infoPorIdioma[langLower];
      var valorTexto = (typeof valor === 'string') ? valor : JSON.stringify(valor);
      hoja.getRange(filaEncontrada, idxCol + 1).setValue(valorTexto);
    });

    // NUEVO: escribir/actualizar INFO_HASH_FICHA (si se ha recibido) — mismo patrón de
    // inserción que las columnas INFO_<idioma> de arriba (justo antes de Hash_Fila).
    if (hashFichaValor) {
      var nombreColumnaHash = "INFO_HASH_FICHA";
      var idxColHash = cabeceras.findIndex(function(h) { return String(h).toUpperCase() === nombreColumnaHash; });
      if (idxColHash === -1) {
        var idxHashFilaActual = cabeceras.findIndex(function(h) { return String(h).toUpperCase() === "HASH_FILA"; });
        var posicionInsercionHash; // 1-based
        if (idxHashFilaActual !== -1) {
          posicionInsercionHash = idxHashFilaActual + 1; // justo delante de Hash_Fila
          hoja.insertColumnBefore(posicionInsercionHash);
          cabeceras.splice(idxHashFilaActual, 0, nombreColumnaHash);
        } else {
          posicionInsercionHash = cabeceras.length + 1;
          cabeceras.push(nombreColumnaHash);
        }
        hoja.getRange(1, posicionInsercionHash).setValue(nombreColumnaHash);
        idxColHash = posicionInsercionHash - 1;
      }
      hoja.getRange(filaEncontrada, idxColHash + 1).setValue(hashFichaValor);
    }

    // Recalcular Hash_Fila de ESTA fila (si la columna existe) para que la web pública detecte
    // el cambio — mismo cálculo que usa doPost() de "Hoja 1" (ver calcularHashFila arriba).
    var cabecerasTrasEscribir = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var idxHash = cabecerasTrasEscribir.findIndex(function(h) { return String(h).toUpperCase() === "HASH_FILA"; });
    if (idxHash !== -1) {
      var filaCompleta = hoja.getRange(filaEncontrada, 1, 1, hoja.getLastColumn()).getValues()[0];
      var contenidoParaHash = filaCompleta.slice(0, idxHash).join('');
      hoja.getRange(filaEncontrada, idxHash + 1).setValue(calcularHashFila(contenidoParaHash));
    }

    var mensajeIdiomas = idiomasRecibidos.length > 0 ? (idiomasRecibidos.length + " idioma(s): " + idiomasRecibidos.join(', ')) : "0 idiomas (solo huella)";
    return ContentService.createTextOutput("OK: Info guardada para el plato ID " + idPlato + " (" + mensajeIdiomas + ").");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message);
  } finally {
    lock.releaseLock();
  }
}