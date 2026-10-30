/**
 * Excel (.xlsx) armado en el navegador, sin librerías: el pass sólo carga
 * scripts propios (CSP 'self') y la bitácora tiene que generar el archivo
 * sin señal.
 *
 * Mismo libro que la Bitácora anterior: hoja "Tablero" con formato y hoja
 * "Bitacora" con las 38 columnas, filtros y primera fila congelada. No se
 * exporta CSV a propósito: el separador cambia según la configuración
 * regional de Excel y la fila entera cae en una celda.
 */
(function () {
'use strict';

/* ---------- ZIP sin compresión (lo que pide .xlsx como contenedor) ---------- */

const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function le(valor, bytes) {
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) out[i] = (valor >>> (8 * i)) & 0xff;
  return out;
}

function unir(partes) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** @param {Array<{nombre: string, texto: string}>} archivos @returns {Uint8Array} */
function zip(archivos) {
  const enc = new TextEncoder();
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const { nombre, texto } of archivos) {
    const datos = enc.encode(texto);
    const nom = enc.encode(nombre);
    const crc = crc32(datos);
    // 0x0800: nombres en UTF-8.
    const local = unir([
      le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0, 2),
      le(crc, 4), le(datos.length, 4), le(datos.length, 4), le(nom.length, 2), le(0, 2), nom,
    ]);
    locales.push(local, datos);
    centrales.push(unir([
      le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0, 2),
      le(crc, 4), le(datos.length, 4), le(datos.length, 4), le(nom.length, 2),
      le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), nom,
    ]));
    offset += local.length + datos.length;
  }
  const central = unir(centrales);
  const fin = unir([
    le(0x06054b50, 4), le(0, 2), le(0, 2), le(archivos.length, 2), le(archivos.length, 2),
    le(central.length, 4), le(offset, 4), le(0, 2),
  ]);
  return unir([unir(locales), central, fin]);
}

/* ---------- Hojas ---------- */

const xml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

function columna(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* Índices de cellXfs en ESTILOS. */
const E = {
  normal: 0, titulo: 1, subtitulo: 2, seccion: 3, encabezado: 4, texto: 5, textoFuerte: 6,
  entero: 7, porcentaje: 8, moneda: 9, diferencia: 10, decimal: 11, nota: 12, etiqueta: 13,
  encabezadoDatos: 14,
};

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5">
<numFmt numFmtId="164" formatCode="#,##0"/>
<numFmt numFmtId="165" formatCode="0.0%"/>
<numFmt numFmtId="166" formatCode="&quot;$&quot;#,##0"/>
<numFmt numFmtId="167" formatCode="0.0%;[Red]-0.0%"/>
<numFmt numFmtId="168" formatCode="0.0"/>
</numFmts>
<fonts count="5">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><b/><sz val="16"/><color rgb="FF09090D"/><name val="Arial"/></font>
<font><i/><sz val="9"/><color rgb="FF7A7A7A"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF09090D"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F6FB0"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="168" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* Celda: valor suelto o { v, s (estilo), n (es número) }. */
function celda(col, fila, c) {
  if (c === null || c === undefined || c === '') return '';
  const d = typeof c === 'object' ? c : { v: c };
  const ref = columna(col) + fila;
  const s = d.s ? ` s="${d.s}"` : '';
  if (d.v === '' || d.v === null || d.v === undefined) return `<c r="${ref}"${s}/>`;
  if (d.n && d.v !== '' && !Number.isNaN(Number(d.v))) return `<c r="${ref}"${s}><v>${Number(d.v)}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(d.v)}</t></is></c>`;
}

function hoja(h) {
  const cols = (h.anchos || [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const filas = h.filas.map((fila, i) => {
    if (!fila) return '';
    const alto = h.alturas && h.alturas[i + 1] ? ` ht="${h.alturas[i + 1]}" customHeight="1"` : '';
    return `<row r="${i + 1}"${alto}>${fila.map((c, j) => celda(j + 1, i + 1, c)).join('')}</row>`;
  }).join('');
  const uniones = h.uniones && h.uniones.length
    ? `<mergeCells count="${h.uniones.length}">${h.uniones.map((u) => `<mergeCell ref="${u}"/>`).join('')}</mergeCells>`
    : '';
  const vista = `<sheetView${h.activa ? ' tabSelected="1"' : ''} showGridLines="${h.sinRejilla ? 0 : 1}" workbookViewId="0"`
    + (h.congelar
      ? `><pane ySplit="${h.congelar}" topLeftCell="A${h.congelar + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
      : '/>');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews>${vista}</sheetViews>
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${filas}</sheetData>
${h.filtro ? `<autoFilter ref="${h.filtro}"/>` : ''}
${uniones}
</worksheet>`;
}

function libro(hojas) {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      nombre: '_rels/.rels',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}">
<sheets>${hojas.map((h, i) => `<sheet name="${xml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${hojas.length + 1}" Type="${R}/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nombre: 'xl/styles.xml', texto: ESTILOS },
  ];
  hojas.forEach((h, i) => archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hoja(h) }));
  return zip(archivos);
}

/* ---------- El libro de la bitácora ---------- */

function hojaTablero(r, alcance, generado, metas) {
  const filas = [];
  const uniones = [];
  const alturas = {};
  const vacia = () => filas.push(null);
  const seccion = (titulo, ancho) => {
    const n = filas.length + 1;
    filas.push([{ v: titulo.toUpperCase(), s: E.seccion }]);
    uniones.push(`A${n}:${columna(ancho)}${n}`);
    alturas[n] = 20;
  };
  const encabezado = (titulos) => {
    alturas[filas.length + 1] = 26;
    filas.push(titulos.map((t) => ({ v: t, s: E.encabezado })));
  };

  filas.push([{ v: 'TABLERO — Campaña puerta a puerta ReservAI', s: E.titulo }]);
  alturas[1] = 26;
  filas.push([{ v: `${alcance} · ${r.puertas} visitas · generado el ${generado}`, s: E.subtitulo }]);
  vacia();

  seccion('El embudo', 5);
  encabezado(['Etapa', 'Cantidad', 'Conversión', 'Meta', 'Diferencia']);
  filas.push([
    { v: 'Puertas tocadas', s: E.textoFuerte }, { v: r.puertas, s: E.entero, n: 1 },
    { v: '', s: E.texto }, { v: '', s: E.texto }, { v: '', s: E.texto },
  ]);
  [
    ['Decisor presente', r.decisor, r.conv.decisor, metas.decisor],
    ['Demos hechas', r.demos, r.conv.demo, metas.demo],
    ['Propuestas pedidas', r.propuestas, r.conv.propuesta, metas.propuesta],
    ['Clientes cerrados', r.cerrados, r.conv.cierre, metas.cierre],
  ].forEach(([etapa, n, conv, meta]) => filas.push([
    { v: etapa, s: E.texto }, { v: n, s: E.entero, n: 1 }, { v: conv, s: E.porcentaje, n: 1 },
    { v: meta, s: E.porcentaje, n: 1 }, { v: conv - meta, s: E.diferencia, n: 1 },
  ]));
  filas.push([{ v: 'Nota: las metas son supuestos de venta B2B en frío, no datos de ReservAI. Sustitúyelas al mes 2.', s: E.nota }]);
  vacia();

  seccion('Indicadores clave', 2);
  encabezado(['Indicador', 'Valor']);
  [
    ['Conversión total (cerrados / puertas)', r.conv.total, E.porcentaje],
    ['Puertas necesarias por cliente', r.puertasPorCliente, E.decimal],
    ['MRR cerrado (MXN)', r.mrr, E.moneda],
    ['MRR promedio por cliente (MXN)', r.mrrPorCliente, E.moneda],
    ['Días de campaña con visitas', r.dias, E.entero],
    ['Puertas por día (promedio)', r.puertasPorDia, E.decimal],
    ['Minutos promedio de conversación', r.minutos, E.decimal],
    ['Interés promedio (1-5)', r.interes, E.decimal],
    ['Mensajes de WhatsApp al día (promedio del mercado)', r.mensajes, E.decimal],
    ['Ticket promedio del mercado (MXN)', r.ticket, E.moneda],
    ['Sucursales promedio', r.sucursales, E.decimal],
    ['Prospectos en seguimiento activo', r.enJuego, E.entero],
  ].forEach(([etiqueta, valor, estilo]) => filas.push([{ v: etiqueta, s: E.texto }, { v: valor, s: estilo, n: 1 }]));

  const desglose = (titulo, clave, grupos, conMrr) => {
    vacia();
    seccion(titulo, conMrr ? 6 : 5);
    encabezado(conMrr
      ? [clave, 'Puertas', 'Demos', 'Cerrados', 'Tasa de cierre', 'MRR']
      : [clave, 'Puertas', 'Demos', 'Cerrados', 'Tasa de cierre']);
    if (!grupos.length) filas.push([{ v: 'Sin datos todavía', s: E.texto }]);
    grupos.forEach((g) => {
      const f = [
        { v: g.clave, s: E.texto }, { v: g.n, s: E.entero, n: 1 }, { v: g.demos, s: E.entero, n: 1 },
        { v: g.cerrados, s: E.entero, n: 1 }, { v: g.tasa, s: E.porcentaje, n: 1 },
      ];
      if (conMrr) f.push({ v: g.mrr, s: E.moneda, n: 1 });
      filas.push(f);
    });
  };
  const reparto = (titulo, clave, columnaN, grupos) => {
    vacia();
    seccion(titulo, 3);
    encabezado([clave, columnaN, '% del total']);
    if (!grupos.length) filas.push([{ v: 'Sin datos todavía', s: E.texto }]);
    grupos.forEach((g) => filas.push([
      { v: g.clave, s: E.texto }, { v: g.n, s: E.entero, n: 1 }, { v: g.parte, s: E.porcentaje, n: 1 },
    ]));
  };

  if (r.porVendedor.length > 1) desglose('Por vendedor', 'Vendedor', r.porVendedor, true);
  desglose('Por giro de negocio', 'Giro', r.porGiro);
  desglose('Por municipio', 'Municipio', r.porMunicipio);
  desglose('Por franja horaria', 'Franja', r.porFranja);
  reparto('Objeciones que más aparecen', 'Objeción', 'Casos', r.porObjecion);
  reparto('Qué sistema usan hoy (penetración de competidores)', 'Sistema', 'Negocios', r.porSistema);
  reparto('Estado de cada visita', 'Resultado', 'Visitas', r.porResultado);
  reparto('Motivos de pérdida', 'Motivo', 'Visitas', r.porPerdida);

  return {
    nombre: 'Tablero', activa: true, sinRejilla: true,
    anchos: [46, 13, 14, 13, 15, 14], filas, uniones, alturas,
  };
}

function hojaVisitas(visitas, columnas, numericos) {
  const titulos = columnas.map(([, t]) => t);
  const anchos = titulos.map((t) => Math.min(Math.max(t.length + 2, 12), 34));
  const filas = [titulos.map((t) => ({ v: t, s: E.encabezadoDatos }))].concat(
    visitas.map((v) => columnas.map(([c]) => ({ v: v[c], s: E.normal, n: numericos.has(c) ? 1 : 0 })))
  );
  return {
    nombre: 'Bitacora', congelar: 1, anchos, alturas: { 1: 30 },
    filtro: `A1:${columna(columnas.length)}${visitas.length + 1}`, filas,
  };
}

/**
 * @param {Object} p
 * @param {Array} p.visitas  visitas a exportar (sin eliminadas)
 * @param {Object} p.resumen BitacoraCalculos.resumen(...)
 * @param {string} p.alcance "Vero Ventas" o "Todo el equipo"
 * @param {string} p.generado fecha legible
 * @param {Array} p.columnas BitacoraCampos.COLUMNAS
 * @param {Set} p.numericos BitacoraCampos.NUMERICOS
 * @param {Object} p.metas   BitacoraCampos.METAS
 * @returns {Uint8Array} bytes del .xlsx
 */
function libroBitacora({ visitas, resumen, alcance, generado, columnas, numericos, metas }) {
  return libro([hojaTablero(resumen, alcance, generado, metas), hojaVisitas(visitas, columnas, numericos)]);
}

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const api = { libroBitacora, libro, zip, crc32, columna, MIME };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.BitacoraExcel = api;
}
})();
