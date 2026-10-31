'use strict';

const M = require('../public/Scripts/documentacionScript/modelo');

describe('plantillas por tipo de nodo', () => {
  test('limpiar: descarta filas sin clave, etiqueta por omisión y sólo campos del esquema', () => {
    const r = M.limpiarPlantilla([
      { key: ' Metodo ', label: '', kind: 'text', defaultValue: 'GET', required: true },
      { key: '', label: 'sin clave', kind: 'text' },
      { key: 'Body', label: 'Cuerpo', kind: 'json', defaultValue: '' },
      { key: 'Raro', kind: 'inventado' },
    ]);
    expect(r).toEqual({
      ok: true,
      defs: [
        { key: 'Metodo', label: 'Metodo', kind: 'text', required: true, defaultValue: 'GET' },
        { key: 'Body', label: 'Cuerpo', kind: 'json' },
        { key: 'Raro', label: 'Raro', kind: 'text' },
      ],
    });
  });

  test('limpiar: claves repetidas y JSON inválido son errores', () => {
    const r = M.limpiarPlantilla([
      { key: 'Ruta', kind: 'text' },
      { key: 'ruta', kind: 'text' },
      { key: 'Body', kind: 'json', defaultValue: '{malo' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errores).toHaveLength(2);
  });

  test('poner y quitar la plantilla de un tipo', () => {
    const doc = M.documentoVacio('x');
    const con = M.ponerPlantilla(doc, 'endpoint', [{ key: 'Metodo', label: 'Método', kind: 'text' }]);
    expect(con.templatesByNodeType.endpoint).toHaveLength(1);
    expect(doc.templatesByNodeType).toEqual({});
    expect(M.ponerPlantilla(con, 'endpoint', []).templatesByNodeType).toEqual({});
  });

  test('los nodos nuevos traen los campos de la plantilla', () => {
    let doc = M.ponerPlantilla(M.documentoVacio('x'), 'endpoint', [
      { key: 'name', label: 'Nombre', kind: 'text', defaultValue: 'GET /' },
      { key: 'Metodo', label: 'Método', kind: 'text', defaultValue: 'GET' },
    ]);
    doc = M.agregarNodo(doc, 'root', 'endpoint', { x: 0, y: 0 }).doc;
    const n = doc.diagrams.root.nodes[0];
    expect(n.data.name).toBe('GET /');
    expect(n.data.attributes).toEqual([{ key: 'Metodo', kind: 'text', value: 'GET' }]);
  });

  test('aplicar a los existentes: sólo agrega lo que falta y no toca valores', () => {
    let doc = M.documentoVacio('x');
    doc = M.agregarNodo(doc, 'root', 'endpoint', { x: 0, y: 0 }).doc;
    doc = M.agregarNodo(doc, 'root', 'endpoint', { x: 0, y: 200 }).doc;
    doc = M.agregarNodo(doc, 'root', 'db', { x: 0, y: 400 }).doc;
    doc.diagrams.root.nodes[0].data.attributes = [{ key: 'metodo', kind: 'text', value: 'POST' }];
    doc = M.ponerPlantilla(doc, 'endpoint', [
      { key: 'Metodo', label: 'Método', kind: 'text', defaultValue: 'GET' },
      { key: 'Errores', label: 'Errores', kind: 'table' },
      { key: 'description', label: 'Descripción', kind: 'textarea', defaultValue: 'x' },
    ]);
    expect(M.contarTipo(doc, 'endpoint')).toBe(2);
    const r = M.aplicarPlantilla(doc, 'endpoint');
    expect(r.nodos).toBe(2);
    const [a, b, c] = r.doc.diagrams.root.nodes;
    expect(a.data.attributes.map((x) => [x.key, x.value.slice(0, 4)])).toEqual([['metodo', 'POST'], ['Errores', '{\n  ']]);
    expect(b.data.attributes.map((x) => x.key)).toEqual(['Metodo', 'Errores']);
    expect(c.data.attributes).toEqual([]);
    // Otra vez: ya no falta nada.
    expect(M.aplicarPlantilla(r.doc, 'endpoint').nodos).toBe(0);
  });
});
