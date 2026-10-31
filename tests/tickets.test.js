'use strict';

const M = require('../public/Scripts/documentacionScript/modelo');
const T = require('../public/Scripts/documentacionScript/tickets');

function proyecto() {
  let doc = M.documentoVacio('Pagos');
  let r = M.agregarNodo(doc, 'root', 'service', { x: 0, y: 0 });
  const servicio = r.id;
  doc = r.doc;
  doc.diagrams.root.nodes[0].data.name = 'Cobros';
  doc.diagrams.root.nodes[0].data.status = 'WIP';
  const hijo = M.abrirHijo(doc, 'root', servicio);
  doc = hijo.doc;
  r = M.agregarNodo(doc, hijo.hijoId, 'endpoint', { x: 0, y: 0 });
  doc = r.doc;
  const endpoint = doc.diagrams[hijo.hijoId].nodes.find((x) => x.id === r.id);
  endpoint.data.name = 'POST /cobros';
  endpoint.data.attributes = [
    { key: 'Endpoint', kind: 'text', value: '/api/cobros' },
    { key: 'Body', kind: 'json', value: '{"a":1}' },
  ];
  r = M.agregarNodo(doc, hijo.hijoId, 'flowStart', { x: 0, y: 0 });
  doc = r.doc;
  return { doc, servicio, endpoint: endpoint.id, hijoId: hijo.hijoId };
}

describe('Documentación → Tickets', () => {
  test('manda cada bloque de todos los diagramas, sin inicio ni fin de flujo', () => {
    const { doc, servicio, endpoint } = proyecto();
    const bloques = T.bloquesParaTickets(doc);
    expect(bloques.map((b) => b.id).sort()).toEqual([servicio, endpoint].sort());
    const s = bloques.find((b) => b.id === servicio);
    expect(s).toMatchObject({ nombre: 'Cobros', estado: 'IN PROGRESS', tipo: 'service', diagrama: '' });
    const e = bloques.find((b) => b.id === endpoint);
    expect(e).toMatchObject({ nombre: 'POST /cobros', estado: 'TO DO', diagrama: 'Cobros', endpoints: '/api/cobros' });
    expect(e.Body).toBeUndefined();
  });

  test('aplica estado y número de ticket sin tocar el original', () => {
    const { doc, servicio, endpoint, hijoId } = proyecto();
    const antes = JSON.stringify(doc);
    const r = T.aplicarTickets(doc, [
      { nodo_id: servicio, estado: 'COMPLETE', numero: 12 },
      { nodo_id: endpoint, estado: 'TO DO', numero: 13 },
      { nodo_id: 'no-existe', estado: 'TO DO', numero: 99 },
    ]);
    expect(JSON.stringify(doc)).toBe(antes);
    expect(r.cambios).toBe(2);
    const s = r.doc.diagrams.root.nodes.find((n) => n.id === servicio);
    expect(s.data.status).toBe('COMPLETE');
    expect(s.data.attributes).toContainEqual({ key: 'ticket', kind: 'text', value: 'T-12' });
    const e = r.doc.diagrams[hijoId].nodes.find((n) => n.id === endpoint);
    expect(e.data.attributes.filter((a) => a.key === 'ticket')).toEqual([{ key: 'ticket', kind: 'text', value: 'T-13' }]);
  });

  test('si ya estaba al día no cuenta cambios', () => {
    const { doc, servicio } = proyecto();
    const una = T.aplicarTickets(doc, [{ nodo_id: servicio, estado: 'IN PROGRESS', numero: 5 }]);
    const otra = T.aplicarTickets(una.doc, [{ nodo_id: servicio, estado: 'IN PROGRESS', numero: 5 }]);
    expect(una.cambios).toBe(1);
    expect(otra.cambios).toBe(0);
  });
});

describe('ruta /tickets', () => {
  const express = require('express');
  const router = require('../public/Scripts/router');

  function pedir(ruta) {
    const app = express();
    app.use(router);
    return new Promise((resolver) => {
      const servidor = app.listen(0, async () => {
        const { port } = servidor.address();
        const res = await fetch(`http://127.0.0.1:${port}${ruta}`, { redirect: 'manual' });
        servidor.close();
        resolver(res);
      });
    });
  }

  test('/tickets lleva a /tickets/ con la misma consulta', async () => {
    const res = await pedir('/tickets?x=1');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/tickets/?x=1');
  });

  test('/tickets/ sirve la página sin caché', async () => {
    const res = await pedir('/tickets/');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('ticketsScript/pagina.js');
  });
});
