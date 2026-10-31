'use strict';

const M = require('../public/Scripts/documentacionScript/modelo');
const X = require('../public/Scripts/documentacionScript/exportar');

function proyecto() {
  let doc = M.documentoVacio('Pass Manager');
  doc.meta.description = 'Login y sesión';
  let r = M.agregarNodo(doc, 'root', 'service', { x: 0, y: 0 });
  const servicio = r.id;
  doc = r.doc;
  doc.diagrams.root.nodes[0].data.name = 'Backend';
  doc.diagrams.root.nodes[0].data.description = 'API del pass';
  const hijo = M.abrirHijo(doc, 'root', servicio);
  doc = hijo.doc;
  for (const [metodo, ruta, nombre] of [['POST', '/api/account', 'Login'], ['GET', '/api/account', 'Yo'], ['DELETE', '/api/a', 'Borrar']]) {
    r = M.agregarNodo(doc, hijo.hijoId, 'endpoint', { x: 0, y: 0 });
    doc = r.doc;
    const n = doc.diagrams[hijo.hijoId].nodes.find((x) => x.id === r.id);
    n.data.name = nombre;
    n.data.status = 'COMPLETE';
    n.data.attributes = [
      { key: 'Metodo', kind: 'text', value: metodo },
      { key: 'Endpoint', kind: 'text', value: ruta },
      { key: 'Body', kind: 'json', value: '{"a":1}' },
      { key: 'Errores', kind: 'table', value: JSON.stringify({ columns: ['Código', 'Cuándo'], rows: [['401', 'Mal | password']] }) },
    ];
  }
  return { doc, hijoId: hijo.hijoId };
}

describe('Markdown del proyecto', () => {
  const { doc } = proyecto();
  const md = X.markdownProyecto(doc, '30 oct 2026');

  test('título, descripción e índice ordenado por ruta y método', () => {
    expect(md.startsWith('# Pass Manager\n\nLogin y sesión\n')).toBe(true);
    const indice = md.split('## Índice de endpoints')[1].split('## Endpoints')[0];
    const filas = indice.split('\n').filter((l) => l.startsWith('| `'));
    expect(filas.map((f) => f.split('|')[1].trim())).toEqual(['`DELETE`', '`GET`', '`POST`']);
    expect(filas[2]).toContain('[Login](#post-api-account-login)');
  });

  test('ficha: ubicación, JSON bonito y tabla escapada; sin repetir método ni ruta', () => {
    expect(md).toContain('### POST /api/account — Login');
    expect(md).toContain('`COMPLETE` · ubicado en Pass Manager / Backend');
    expect(md).toContain('```json\n{\n  "a": 1\n}\n```');
    expect(md).toContain('| 401 | Mal \\| password |');
    expect(md).not.toContain('**Metodo**');
  });

  test('otros componentes documentados', () => {
    expect(md).toContain('## Otros componentes\n\n### Servicio\n\n#### Backend');
    expect(md.endsWith('\n')).toBe(true);
    expect(md).not.toMatch(/\n{3,}/);
  });
});

describe('SVG del diagrama', () => {
  test('diagrama vacío: null', () => {
    expect(X.svgDiagrama(M.documentoVacio('x').diagrams.root)).toBeNull();
  });

  test('tamaño con margen y texto escapado', () => {
    let doc = M.documentoVacio('x');
    const r = M.agregarNodo(doc, 'root', 'service', { x: 100, y: 50 });
    doc = r.doc;
    doc.diagrams.root.nodes[0].data.name = 'A <b>&</b> "B"';
    const s = X.svgDiagrama(doc.diagrams.root, { titulo: 'Proyecto · Principal' });
    expect(s.ancho).toBe(212 + 128);
    expect(s.alto).toBe(112 + 64 + 28 + 64);
    expect(s.svg).toContain('A &lt;b&gt;&amp;&lt;/b&gt; &quot;B&quot;');
    expect(s.svg).not.toContain('foreignObject');
    expect(s.svg).toContain('Proyecto · Principal');
  });

  test('una arista por conexión, con flecha', () => {
    const { doc, hijoId } = proyecto();
    const d = doc.diagrams[hijoId];
    const [a, b] = d.nodes;
    const conectado = M.conectar(doc, hijoId, a.id, 'next', b.id, 'next');
    const s = X.svgDiagrama(conectado.diagrams[hijoId]);
    expect((s.svg.match(/marker-end/g) || []).length).toBe(1);
  });

  test('nombres largos: máximo dos líneas con puntos suspensivos', () => {
    const lineas = X.envolver('una descripcion muy larga que no cabe en el nodo de ninguna manera', 120, 13, 2);
    expect(lineas).toHaveLength(2);
    expect(lineas[1].endsWith('…')).toBe(true);
  });
});
