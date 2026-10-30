'use strict';

const C = require('../public/Scripts/bitacoraScript/campos');
const K = require('../public/Scripts/bitacoraScript/calculos');
const X = require('../public/Scripts/bitacoraScript/excel');

function visita(datos) {
  return { ...C.nuevaVisita({ visitador: 'Vero' }, new Date(2026, 9, 29, 11)), ...datos };
}

describe('campos', () => {
  test('38 columnas, como el Excel de siempre', () => {
    expect(C.COLUMNAS).toHaveLength(38);
  });

  test('nueva visita: fecha y franja solas, municipio y colonia de la anterior', () => {
    const v = C.nuevaVisita({ visitador: 'Vero', ultimoMunicipio: 'Zapopan', ultimaColonia: 'Chapalita' },
      new Date(2026, 9, 29, 14, 30));
    expect(v.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(v).toMatchObject({ fecha: '2026-10-29', franja: '13:00-16:00', municipio: 'Zapopan', colonia: 'Chapalita' });
  });

  test('paraSubir: vacíos a null, números como número, sin visitador', () => {
    const s = C.paraSubir(visita({ negocio: ' Spa ', interes: '4', mrr: '1490', ticket: '', archivada: 0 }));
    expect(s.negocio).toBe('Spa');
    expect(s.interes).toBe(4);
    expect(s.mrr).toBe(1490);
    expect(s.ticket).toBeNull();
    expect(s.archivada).toBe(false);
    expect(s).not.toHaveProperty('visitador');
    expect(s).not.toHaveProperty('_pendiente');
  });

  test('desdeServidor: null a texto vacío', () => {
    const v = C.desdeServidor({ id: 'x', vendedor: 'y', negocio: null, interes: 3, archivada: false, eliminada: true });
    expect(v.negocio).toBe('');
    expect(v.interes).toBe('3');
    expect(v.eliminada).toBe(true);
  });

  test('lista: pide negocio, giro y municipio', () => {
    expect(C.lista(visita({ negocio: 'X', giro: 'Spa', municipio: '' }))).toBe(false);
    expect(C.lista(visita({ negocio: '  ', giro: 'Spa', municipio: 'Zapopan' }))).toBe(false);
    expect(C.lista(visita({ negocio: 'X', giro: 'Spa', municipio: 'Zapopan' }))).toBe(true);
  });
});

describe('calculos', () => {
  const visitas = [
    visita({ decisor: 'Sí', demo: 'Sí', propuesta: 'Sí', resultado: 'Cerrado', mrr: '1490', giro: 'Spa' }),
    visita({ decisor: 'Sí', demo: 'Sí', propuesta: '', resultado: 'Demo hecha', giro: 'Spa', f_seguimiento: '2026-11-02' }),
    visita({ decisor: 'No (sólo empleado)', resultado: 'Reagendar visita', giro: 'Barbería', f_seguimiento: '2026-10-30' }),
    visita({ decisor: 'Sí', resultado: 'Cerrado', mrr: '999', eliminada: true }),
  ];

  test('embudo sin contar eliminadas', () => {
    const r = K.resumen(visitas);
    expect(r).toMatchObject({ puertas: 3, decisor: 2, demos: 2, propuestas: 1, cerrados: 1, mrr: 1490, dias: 1 });
    expect(r.conv.decisor).toBeCloseTo(2 / 3);
    expect(r.conv.cierre).toBe(1);
    expect(r.porGiro[0]).toMatchObject({ clave: 'Spa', n: 2, cerrados: 1, tasa: 0.5 });
  });

  test('sin visitas no divide entre cero', () => {
    const r = K.resumen([]);
    expect(r.conv.total).toBe(0);
    expect(r.puertasPorCliente).toBe(0);
  });

  test('por seguir: en juego, no archivadas, la fecha más cercana primero', () => {
    const lista = K.porSeguir(visitas);
    expect(lista.map((v) => v.resultado)).toEqual(['Reagendar visita', 'Demo hecha']);
  });

  test('haceDias cruza meses y años', () => {
    expect(K.haceDias('2026-11-02', 2)).toBe('2026-10-31');
    expect(K.haceDias('2027-01-01', 1)).toBe('2026-12-31');
    expect(K.haceDias('2026-10-30', 0)).toBe('2026-10-30');
  });

  test('enPeriodo: los últimos n días contando hoy; 0 es todo', () => {
    const fechas = ['2026-10-30', '2026-10-24', '2026-10-23', '2026-11-01', ''].map((fecha) => visita({ fecha }));
    expect(K.enPeriodo(fechas, 7, '2026-10-30').map((v) => v.fecha)).toEqual(['2026-10-30', '2026-10-24']);
    expect(K.enPeriodo(fechas, 1, '2026-10-30').map((v) => v.fecha)).toEqual(['2026-10-30']);
    expect(K.enPeriodo(fechas, 0, '2026-10-30')).toHaveLength(5);
  });

  test('porDia: un día por fila con ceros, sin eliminadas', () => {
    const dias = K.porDia([
      visita({ fecha: '2026-10-30', resultado: 'Cerrado' }),
      visita({ fecha: '2026-10-30' }),
      visita({ fecha: '2026-10-28', eliminada: true }),
      visita({ fecha: '2026-10-01' }),
    ], 3, '2026-10-30');
    expect(dias).toEqual([
      { fecha: '2026-10-28', n: 0, cerrados: 0 },
      { fecha: '2026-10-29', n: 0, cerrados: 0 },
      { fecha: '2026-10-30', n: 2, cerrados: 1 },
    ]);
  });
});

describe('excel', () => {
  test('crc32 conocido', () => {
    expect(X.crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  test('columnas de Excel', () => {
    expect([1, 26, 27, 38].map(X.columna)).toEqual(['A', 'Z', 'AA', 'AL']);
  });

  test('libro: zip válido con Tablero y Bitacora, y escapa el texto', () => {
    const vs = [visita({ negocio: 'Café <&> "Uno"', giro: 'Spa', municipio: 'Zapopan', interes: '4' })];
    const bytes = X.libroBitacora({
      visitas: vs, resumen: K.resumen(vs), alcance: 'Vero', generado: '29/10/2026',
      columnas: C.COLUMNAS, numericos: C.NUMERICOS, metas: C.METAS,
    });
    const texto = Buffer.from(bytes).toString('utf8');
    expect(bytes[0]).toBe(0x50); // PK
    expect(bytes[1]).toBe(0x4b);
    expect(texto).toContain('<sheet name="Tablero"');
    expect(texto).toContain('<sheet name="Bitacora"');
    expect(texto).toContain('Café &lt;&amp;&gt; &quot;Uno&quot;');
    expect(texto).toContain('<autoFilter ref="A1:AL2"/>');
    // interés como número, no como texto
    expect(texto).toMatch(/<c r="Y2"><v>4<\/v><\/c>/);
  });
});
