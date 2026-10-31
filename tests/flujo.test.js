'use strict';

const M = require('../public/Scripts/documentacionScript/modelo');

const n = (id, type = 'flowProcess') => ({ id, type, position: { x: 999, y: 999 }, data: { name: id } });
const e = (id, s, t) => ({ id, source: s, target: t, sourceHandle: 'next', targetHandle: 'next' });

describe('flujo de un request', () => {
  test('un solo camino: en columna, de inicio a destino, sin lo que no llega', () => {
    const d = {
      nodes: [n('gw', 'gateway'), n('mw', 'middleware'), n('ep', 'endpoint'), n('otro', 'endpoint'), n('db', 'db')],
      edges: [e('1', 'gw', 'mw'), e('2', 'mw', 'ep'), e('3', 'mw', 'otro'), e('4', 'ep', 'db')],
    };
    const f = M.flujoRequest(d, 'ep');
    expect(f.inicios).toEqual(['gw']);
    expect(f.rutas).toEqual([{ nodos: ['gw', 'mw', 'ep'], aristas: ['1', '2'] }]);
    expect(f.diagrama.nodes.map((x) => [x.id, x.position.y])).toEqual([['gw', 0], ['mw', 210], ['ep', 420]]);
    expect(f.diagrama.edges.map((x) => x.id)).toEqual(['1', '2']);
    expect(f.avisos).toEqual([]);
  });

  test('dos caminos que se juntan: profundidad máxima y lado a lado', () => {
    const d = {
      nodes: [n('a', 'gateway'), n('b', 'gateway'), n('mw', 'middleware'), n('ep', 'endpoint')],
      edges: [e('1', 'a', 'mw'), e('2', 'b', 'ep'), e('3', 'mw', 'ep')],
    };
    const f = M.flujoRequest(d, 'ep');
    expect(f.rutas).toHaveLength(2);
    expect(new Set(f.inicios)).toEqual(new Set(['a', 'b']));
    const pos = Object.fromEntries(f.diagrama.nodes.map((x) => [x.id, x.position]));
    expect(pos.ep.y).toBe(420);
    expect(pos.a.y).toBe(0);
    expect(pos.a.x).not.toBe(pos.b.x);
  });

  test('ciclos: avisa y no se queda dando vueltas', () => {
    const d = {
      nodes: [n('ini', 'flowStart'), n('x'), n('y'), n('fin', 'flowEnd')],
      edges: [e('1', 'ini', 'x'), e('2', 'x', 'y'), e('3', 'y', 'x'), e('4', 'y', 'fin')],
    };
    const f = M.flujoRequest(d, 'fin');
    expect(f.rutas).toEqual([{ nodos: ['ini', 'x', 'y', 'fin'], aristas: ['1', '2', '4'] }]);
    expect(f.avisos[0]).toMatch(/ciclos/);
  });

  test('nodo sin conexiones o que no está en el diagrama', () => {
    const d = { nodes: [n('solo', 'endpoint'), n('a'), n('b')], edges: [e('1', 'a', 'b')] };
    expect(M.flujoRequest(d, 'solo').avisos).toEqual(['Este nodo no tiene conexiones.']);
    expect(M.flujoRequest(d, 'nada').avisos).toEqual(['Ese nodo no está en este diagrama.']);
    expect(M.flujoRequest({ nodes: [], edges: [] }, 'x').diagrama.nodes).toEqual([]);
  });

  test('destino por omisión: el primer endpoint, si no un nodo final conectado', () => {
    expect(M.destinoPorOmision({ nodes: [n('a'), n('ep', 'endpoint')], edges: [] })).toBe('ep');
    expect(M.destinoPorOmision({ nodes: [n('a'), n('b')], edges: [e('1', 'a', 'b')] })).toBe('b');
    expect(M.destinoPorOmision({ nodes: [], edges: [] })).toBeNull();
  });
});
