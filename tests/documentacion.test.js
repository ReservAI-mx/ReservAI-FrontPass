'use strict';

const M = require('../public/Scripts/documentacionScript/modelo');

// Campos que acepta el servicio en node.data (esquema estricto).
const CAMPOS_DATA = new Set([
  'name', 'description', 'status', 'input', 'output', 'returnCodes', 'feature', 'endpoints',
  'childDiagramId', 'attributes', 'connectionInputs', 'connectionOutputs',
]);

function conDosNodos() {
  let doc = M.documentoVacio('Prueba');
  let r = M.agregarNodo(doc, 'root', 'gateway', { x: 0, y: 0 });
  const a = r.id;
  r = M.agregarNodo(r.doc, 'root', 'service', { x: 0, y: 200 });
  return { doc: r.doc, a, b: r.id };
}

describe('documento', () => {
  test('vacío: raíz con su diagrama, como shared/project-factory.ts', () => {
    const d = M.documentoVacio('Pagos');
    expect(d.rootDiagramId).toBe('root');
    expect(d.diagrams.root).toEqual({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    expect(d.meta.name).toBe('Pagos');
  });

  test('slug desde nombre: sin acentos ni espacios', () => {
    expect(M.slugDesdeNombre('  Pass Manager — Pagos ')).toBe('pass-manager-pagos');
    expect(M.slugDesdeNombre('Bitácora de visitas')).toBe('bitacora-de-visitas');
    expect(M.slugValido('pass_manager-2')).toBe(true);
    expect(M.slugValido('Pass')).toBe(false);
    expect(M.slugValido('../x')).toBe(false);
  });
});

describe('nodos', () => {
  test('agregar no cambia el documento original y sólo usa campos válidos', () => {
    const doc = M.documentoVacio('x');
    const { doc: nuevo, id } = M.agregarNodo(doc, 'root', 'endpoint', { x: 10.6, y: 20.2 });
    expect(doc.diagrams.root.nodes).toHaveLength(0);
    const n = nuevo.diagrams.root.nodes[0];
    expect(n).toMatchObject({ id, type: 'endpoint', position: { x: 11, y: 20 } });
    expect(n.data.name).toBe('Nuevo Endpoint');
    for (const k of Object.keys(n.data)) expect(CAMPOS_DATA.has(k)).toBe(true);
  });

  test('la decisión nace con salidas TRUE / FALSE', () => {
    const { doc } = M.agregarNodo(M.documentoVacio('x'), 'root', 'flowDecision', { x: 0, y: 0 });
    expect(doc.diagrams.root.nodes[0].data.connectionOutputs).toEqual(['TRUE', 'FALSE']);
  });

  test('plantillas del proyecto: atributos iniciales', () => {
    const doc = M.documentoVacio('x');
    doc.templatesByNodeType = { endpoint: [{ key: 'Metodo', label: 'Método', kind: 'text', defaultValue: 'GET' }, { key: 'Body', label: 'Body', kind: 'json' }] };
    const { doc: d } = M.agregarNodo(doc, 'root', 'endpoint', { x: 0, y: 0 });
    expect(d.diagrams.root.nodes[0].data.attributes).toEqual([
      { key: 'Metodo', kind: 'text', value: 'GET' },
      { key: 'Body', kind: 'json', value: '{\n  \n}' },
    ]);
  });

  test('mover redondea a enteros', () => {
    const { doc, a } = conDosNodos();
    const d = M.moverNodos(doc, 'root', [a], 10.4, -3.6);
    expect(d.diagrams.root.nodes.find((n) => n.id === a).position).toEqual({ x: 10, y: -4 });
  });
});

describe('conexiones', () => {
  test('conectar salida con entrada', () => {
    const { doc, a, b } = conDosNodos();
    const d = M.conectar(doc, 'root', a, 'next', b, 'next');
    expect(d.diagrams.root.edges).toEqual([
      expect.objectContaining({ source: a, target: b, sourceHandle: 'next', targetHandle: 'next' }),
    ]);
  });

  test('no conecta un nodo consigo mismo, repetida ni a un puerto que no existe', () => {
    const { doc, a, b } = conDosNodos();
    const d = M.conectar(doc, 'root', a, 'next', b, 'next');
    expect(M.conectar(doc, 'root', a, 'next', a, 'next')).toBeNull();
    expect(M.conectar(d, 'root', a, 'next', b, 'next')).toBeNull();
    expect(M.conectar(doc, 'root', a, 'error', b, 'next')).toBeNull();
  });

  test('quitar un puerto quita sus aristas', () => {
    const { doc, a, b } = conDosNodos();
    let d = M.conectar(doc, 'root', a, 'next', b, 'next');
    const n = d.diagrams.root.nodes.find((x) => x.id === a);
    d = M.cambiarDatos(d, 'root', a, { ...n.data, connectionOutputs: ['ok', 'error'] });
    expect(d.diagrams.root.edges).toHaveLength(0);
  });

  test('puertos: vacíos y repetidos como connection-ports.ts', () => {
    expect(M.normalizarPuertos(undefined)).toEqual(['next']);
    expect(M.normalizarPuertos(['', 'a', 'a'])).toEqual(['next', 'a', 'a-2']);
    expect(M.puertosDesdeTexto(' TRUE, FALSE ,')).toEqual(['TRUE', 'FALSE']);
  });

  test('rombo con dos salidas: a los lados; si no, abajo', () => {
    const { doc } = M.agregarNodo(M.documentoVacio('x'), 'root', 'flowDecision', { x: 100, y: 100 });
    const n = doc.diagrams.root.nodes[0];
    const salidas = M.puertos(n).filter((p) => p.lado === 'out');
    expect(salidas.map((p) => p.dir)).toEqual(['left', 'right']);
    expect(salidas[0].y).toBe(100 + 132 / 2);
    const servicio = M.agregarNodo(M.documentoVacio('x'), 'root', 'service', { x: 0, y: 0 }).doc.diagrams.root.nodes[0];
    expect(M.puertos(servicio).find((p) => p.lado === 'out')).toMatchObject({ dir: 'down', x: 106, y: 112 });
  });
});

describe('diagramas hijo', () => {
  test('abrir crea el hijo una vez y la segunda vez lo reutiliza', () => {
    const { doc, a } = conDosNodos();
    const r1 = M.abrirHijo(doc, 'root', a);
    expect(r1.creado).toBe(true);
    expect(r1.doc.diagrams[r1.hijoId]).toEqual({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    const r2 = M.abrirHijo(r1.doc, 'root', a);
    expect(r2).toMatchObject({ creado: false, hijoId: r1.hijoId });
    expect(M.nodoQueAbre(r1.doc, 'root', r1.hijoId).id).toBe(a);
  });

  test('borrar un nodo borra sus aristas y su detalle (con nietos)', () => {
    const { doc, a, b } = conDosNodos();
    let d = M.conectar(doc, 'root', a, 'next', b, 'next');
    const r = M.abrirHijo(d, 'root', a);
    const nieto = M.agregarNodo(r.doc, r.hijoId, 'flowProcess', { x: 0, y: 0 });
    const r2 = M.abrirHijo(nieto.doc, r.hijoId, nieto.id);
    d = M.quitar(r2.doc, 'root', [a], []);
    expect(d.diagrams.root.nodes.map((n) => n.id)).toEqual([b]);
    expect(d.diagrams.root.edges).toHaveLength(0);
    expect(Object.keys(d.diagrams)).toEqual(['root']);
  });

  test('quitar el detalle deja el nodo con childDiagramId null', () => {
    const { doc, a } = conDosNodos();
    const r = M.abrirHijo(doc, 'root', a);
    const d = M.quitarHijo(r.doc, 'root', a);
    expect(d.diagrams[r.hijoId]).toBeUndefined();
    expect(d.diagrams.root.nodes.find((n) => n.id === a).data.childDiagramId).toBeNull();
  });

  test('la pila de navegación se recorta a lo que todavía existe', () => {
    const { doc, a } = conDosNodos();
    const r = M.abrirHijo(doc, 'root', a);
    expect(M.podarPila(r.doc, ['root', r.hijoId])).toEqual(['root', r.hijoId]);
    const sinHijo = M.quitarHijo(r.doc, 'root', a);
    expect(M.podarPila(sinHijo, ['root', r.hijoId])).toEqual(['root']);
  });
});

describe('lectura', () => {
  test('estados viejos se leen con su sinónimo', () => {
    expect(M.normalizarEstado('done')).toBe('COMPLETE');
    expect(M.normalizarEstado('WIP')).toBe('IN PROGRESS');
    expect(M.normalizarEstado('')).toBe('TO DO');
    expect(M.claseEstado('in progress')).toBe('in-progress');
  });

  test('método y ruta de los atributos del endpoint', () => {
    expect(M.datosHttp({ attributes: [{ key: 'Método', value: 'post' }, { key: 'Endpoint', value: '/api/x' }] }))
      .toEqual({ metodo: 'POST', ruta: '/api/x' });
    expect(M.datosHttp({ endpoints: 'GET /a', attributes: [] })).toEqual({ metodo: null, ruta: 'GET /a' });
  });

  test('encuadre: todo el diagrama cabe en el área', () => {
    const { doc } = conDosNodos();
    const vp = M.encuadre(doc.diagrams.root, 800, 600);
    const c = M.caja(doc.diagrams.root);
    expect(c.x * vp.zoom + vp.x).toBeGreaterThanOrEqual(0);
    expect((c.y + c.h) * vp.zoom + vp.y).toBeLessThanOrEqual(600);
  });
});
