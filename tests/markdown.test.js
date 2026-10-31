'use strict';

const { interpretar, inline } = require('../public/Scripts/documentacionScript/markdown');

describe('markdown del chat', () => {
  test('títulos, párrafos y listas', () => {
    const b = interpretar('## Flujo\nEl login pasa por\ndos pasos.\n\n- uno\n- **dos**\n\n1. a\n2. b');
    expect(b.map((x) => x.tipo)).toEqual(['titulo', 'parrafo', 'lista', 'lista']);
    expect(b[0].nivel).toBe(2);
    expect(b[1].inline).toEqual([{ tipo: 'texto', texto: 'El login pasa por dos pasos.' }]);
    expect(b[2]).toMatchObject({ ordenada: false });
    expect(b[2].items[1]).toEqual([{ tipo: 'fuerte', texto: 'dos' }]);
    expect(b[3]).toMatchObject({ ordenada: true });
  });

  test('bloque mermaid sin interpretar lo de adentro', () => {
    const b = interpretar('Mira:\n```mermaid\nflowchart TD\n  A["**x**"] --> B\n```\nfin');
    expect(b[1]).toEqual({ tipo: 'codigo', lenguaje: 'mermaid', texto: 'flowchart TD\n  A["**x**"] --> B' });
    expect(b[2].tipo).toBe('parrafo');
  });

  test('bloque de código sin cerrar llega hasta el final', () => {
    expect(interpretar('```js\nconst a = 1;')).toEqual([{ tipo: 'codigo', lenguaje: 'js', texto: 'const a = 1;' }]);
  });

  test('tablas', () => {
    const b = interpretar('| Método | Ruta |\n|---|:---:|\n| GET | `/api/x` |');
    expect(b[0].tipo).toBe('tabla');
    expect(b[0].encabezado.map((c) => c[0].texto)).toEqual(['Método', 'Ruta']);
    expect(b[0].filas[0][1]).toEqual([{ tipo: 'codigo', texto: '/api/x' }]);
  });

  test('enlaces: sólo http(s) y mailto; lo demás queda como texto', () => {
    expect(inline('[docs](https://x.mx)')).toEqual([{ tipo: 'enlace', texto: 'docs', href: 'https://x.mx' }]);
    const malo = inline('[malo](javascript:alert(1))');
    expect(malo.some((t) => t.tipo === 'enlace')).toBe(false);
    expect(malo[0].texto.startsWith('malo')).toBe(true);
  });

  test('HTML se queda como texto', () => {
    const b = interpretar('<img src=x onerror=alert(1)> hola');
    expect(b).toEqual([{ tipo: 'parrafo', inline: [{ tipo: 'texto', texto: '<img src=x onerror=alert(1)> hola' }] }]);
  });

  test('cursiva, código en línea y citas', () => {
    expect(inline('a *b* `c` _d_')).toEqual([
      { tipo: 'texto', texto: 'a ' }, { tipo: 'enfasis', texto: 'b' }, { tipo: 'texto', texto: ' ' },
      { tipo: 'codigo', texto: 'c' }, { tipo: 'texto', texto: ' ' }, { tipo: 'enfasis', texto: 'd' },
    ]);
    expect(interpretar('> ojo\n> aquí')[0]).toEqual({ tipo: 'cita', inline: [{ tipo: 'texto', texto: 'ojo aquí' }] });
  });

  test('texto vacío', () => {
    expect(interpretar('')).toEqual([]);
    expect(interpretar(null)).toEqual([]);
  });
});
