'use strict';

// Listas desplegables y calendario propios (public/Scripts/controles.js):
// toda pantalla interna del pass los carga, y las que funcionan sin conexión
// los guardan en su service worker.

const fs = require('fs');
const path = require('path');

const VISTAS = path.join(__dirname, '..', 'public', 'views');
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', 'public', ...p), 'utf8');

describe('controles propios', () => {
  const paginas = fs.readdirSync(VISTAS).filter((f) => f.endsWith('.html'))
    .filter((f) => leer('views', f).includes('StylesUI.css'));

  test('hay pantallas internas', () => {
    expect(paginas).toEqual(expect.arrayContaining(['tickets.html', 'bitacora.html', 'inicioAdmin.html']));
  });

  test.each(paginas)('%s carga los estilos y el script', (pagina) => {
    const html = leer('views', pagina);
    expect(html).toContain('href="/static/estilos/StylesControles.css"');
    expect(html).toContain('<script type="module" src="/static/Scripts/controles.js"></script>');
  });

  test.each(['ticketsScript', 'bitacoraScript'])('el service worker de %s los guarda', (app) => {
    const sw = leer('Scripts', app, 'sw.js');
    expect(sw).toContain("'/static/Scripts/controles.js'");
    expect(sw).toContain("'/static/estilos/StylesControles.css'");
  });
});
