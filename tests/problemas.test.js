'use strict';

const M = require('../public/Scripts/documentacionScript/modelo');

function base() {
  let doc = M.documentoVacio('Pass');
  let r = M.agregarNodo(doc, 'root', 'gateway', { x: 0, y: 0 });
  doc = r.doc;
  const gw = r.id;
  r = M.agregarNodo(doc, 'root', 'endpoint', { x: 0, y: 200 });
  doc = r.doc;
  const ep = r.id;
  doc = M.conectar(doc, 'root', gw, 'next', ep, 'next');
  const n = doc.diagrams.root.nodes.find((x) => x.id === ep);
  n.data.attributes = [{ key: 'Metodo', kind: 'text', value: 'GET' }, { key: 'Endpoint', kind: 'text', value: '/api/x' }];
  return { doc, gw, ep };
}

const titulos = (ps) => ps.map((p) => p.titulo);

describe('problemas del proyecto', () => {
  test('un proyecto completo no tiene problemas', () => {
    expect(M.problemas(base().doc)).toEqual([]);
  });

  test('endpoint sin método ni ruta: errores, primero que los avisos', () => {
    let { doc, ep } = base();
    doc.diagrams.root.nodes.find((x) => x.id === ep).data.attributes = [];
    doc = M.agregarNodo(doc, 'root', 'db', { x: 300, y: 0 }).doc; // queda suelto
    const ps = M.problemas(doc);
    expect(titulos(ps)).toEqual(['Endpoint sin ruta', 'Endpoint sin método', 'Nodo suelto']);
    expect(ps[0]).toMatchObject({ nivel: 'error', nodoId: ep, ids: ['root'], donde: 'Pass' });
  });

  test('nodo sin nombre y diagrama de detalle vacío', () => {
    let { doc, gw } = base();
    doc.diagrams.root.nodes.find((x) => x.id === gw).data.name = '  ';
    doc = M.abrirHijo(doc, 'root', gw).doc;
    const ps = M.problemas(doc);
    expect(titulos(ps).sort()).toEqual(['Diagrama vacío', 'Nodo sin nombre']);
    expect(ps.find((p) => p.titulo === 'Nodo sin nombre').sujeto).toBe('(Gateway / Proxy sin nombre)');
  });

  test('referencia rota y diagrama huérfano descartable', () => {
    let { doc, gw } = base();
    const h = M.abrirHijo(doc, 'root', gw);
    doc = M.agregarNodo(h.doc, h.hijoId, 'flowProcess', { x: 0, y: 0 }).doc;
    // El nodo apunta a otro id: el diagrama queda huérfano y la referencia, rota.
    doc.diagrams.root.nodes.find((x) => x.id === gw).data.childDiagramId = 'no-existe';
    const ps = M.problemas(doc);
    const rota = ps.find((p) => p.titulo === 'Referencia rota a diagrama de detalle');
    const huerfano = ps.find((p) => p.titulo === 'Diagrama inalcanzable');
    expect(rota.nivel).toBe('error');
    expect(huerfano).toMatchObject({ descartable: h.hijoId, ids: ['root', h.hijoId] });
    // Se puede abrir colgado de la raíz y luego descartar.
    expect(M.podarPila(doc, ['root', h.hijoId])).toEqual(['root', h.hijoId]);
    const limpio = M.descartarDiagrama(doc, h.hijoId);
    expect(limpio.diagrams[h.hijoId]).toBeUndefined();
    expect(M.problemas(limpio).some((p) => p.titulo === 'Diagrama inalcanzable')).toBe(false);
  });

  test('no se descarta un diagrama que alguien abre, ni la raíz', () => {
    const { doc, gw } = base();
    const h = M.abrirHijo(doc, 'root', gw);
    expect(M.descartarDiagrama(h.doc, h.hijoId)).toBe(h.doc);
    expect(M.descartarDiagrama(h.doc, 'root')).toBe(h.doc);
  });

  test('campos obligatorios de la plantilla vacíos', () => {
    let { doc, ep } = base();
    doc = M.ponerPlantilla(doc, 'endpoint', [
      { key: 'Auth', label: 'Autenticación', kind: 'text', required: true },
      { key: 'description', label: 'Descripción', kind: 'textarea', required: true },
      { key: 'Notas', label: 'Notas', kind: 'text' },
    ]);
    let ps = M.problemas(doc);
    expect(ps.map((p) => p.detalle)).toEqual([
      expect.stringContaining('«Autenticación»'),
      expect.stringContaining('«Descripción»'),
    ]);
    const n = doc.diagrams.root.nodes.find((x) => x.id === ep);
    n.data.description = 'Lista cosas';
    n.data.attributes.push({ key: 'auth', kind: 'text', value: 'access' });
    ps = M.problemas(doc);
    expect(ps).toEqual([]);
  });
});
