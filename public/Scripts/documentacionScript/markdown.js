/**
 * Markdown del chat → árbol de bloques, sin HTML. La pantalla arma el DOM
 * con textContent, así que nada de lo que conteste el modelo se interpreta
 * como HTML. Cubre lo que usa el agente: títulos, párrafos, listas, citas,
 * tablas, bloques de código (también ```mermaid), negritas, cursivas,
 * código en línea y enlaces http(s).
 *
 * Bloques: { tipo: 'titulo', nivel, inline } | { tipo: 'parrafo', inline }
 *   | { tipo: 'lista', ordenada, items: [inline] } | { tipo: 'cita', inline }
 *   | { tipo: 'codigo', lenguaje, texto } | { tipo: 'tabla', encabezado: [inline], filas: [[inline]] }
 *   | { tipo: 'linea' }
 * Inline: [{ tipo: 'texto'|'fuerte'|'enfasis'|'codigo', texto } | { tipo: 'enlace', texto, href }]
 */
(function (raiz, fabrica) {
  'use strict';
  const modulo = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else raiz.DocMarkdown = modulo;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENLACE_SEGURO = /^(https?:\/\/|mailto:)/i;

  function inline(texto) {
    const out = [];
    let resto = String(texto);
    // Orden: código (lo de adentro no se interpreta), enlace, negrita, cursiva.
    const patron = /(`+)([\s\S]*?)\1|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/;
    while (resto) {
      const m = patron.exec(resto);
      if (!m) {
        out.push({ tipo: 'texto', texto: resto });
        break;
      }
      if (m.index > 0) out.push({ tipo: 'texto', texto: resto.slice(0, m.index) });
      if (m[1]) out.push({ tipo: 'codigo', texto: m[2].trim() });
      else if (m[3]) {
        if (ENLACE_SEGURO.test(m[4])) out.push({ tipo: 'enlace', texto: m[3], href: m[4] });
        else out.push({ tipo: 'texto', texto: m[3] });
      } else if (m[5] || m[6]) out.push({ tipo: 'fuerte', texto: m[5] || m[6] });
      else out.push({ tipo: 'enfasis', texto: m[7] || m[8] });
      resto = resto.slice(m.index + m[0].length);
    }
    // Juntar textos seguidos.
    return out.reduce((acc, t) => {
      const ult = acc[acc.length - 1];
      if (t.tipo === 'texto' && ult && ult.tipo === 'texto') ult.texto += t.texto;
      else acc.push(t);
      return acc;
    }, []);
  }

  function celdas(linea) {
    return linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim()));
  }

  const RE = {
    cerco: /^\s*(```|~~~)\s*([\w-]*)\s*$/,
    titulo: /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,
    linea: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
    vineta: /^\s{0,3}[-*+]\s+(.*)$/,
    numero: /^\s{0,3}\d{1,9}[.)]\s+(.*)$/,
    cita: /^\s{0,3}>\s?(.*)$/,
    separadorTabla: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
  };

  function interpretar(texto) {
    const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
    const bloques = [];
    let i = 0;
    while (i < lineas.length) {
      const l = lineas[i];
      if (!l.trim()) {
        i++;
        continue;
      }
      let m = RE.cerco.exec(l);
      if (m) {
        const cuerpo = [];
        i++;
        while (i < lineas.length && !new RegExp(`^\\s*${m[1]}\\s*$`).test(lineas[i])) cuerpo.push(lineas[i++]);
        i++; // cerco de cierre (si falta, se acaba el texto)
        bloques.push({ tipo: 'codigo', lenguaje: m[2].toLowerCase(), texto: cuerpo.join('\n') });
        continue;
      }
      m = RE.titulo.exec(l);
      if (m) {
        bloques.push({ tipo: 'titulo', nivel: m[1].length, inline: inline(m[2]) });
        i++;
        continue;
      }
      if (RE.linea.test(l)) {
        bloques.push({ tipo: 'linea' });
        i++;
        continue;
      }
      if (l.includes('|') && i + 1 < lineas.length && RE.separadorTabla.test(lineas[i + 1])) {
        const encabezado = celdas(l);
        const filas = [];
        i += 2;
        while (i < lineas.length && lineas[i].includes('|') && lineas[i].trim()) filas.push(celdas(lineas[i++]));
        bloques.push({ tipo: 'tabla', encabezado, filas });
        continue;
      }
      const vineta = RE.vineta.exec(l);
      const numero = RE.numero.exec(l);
      if (vineta || numero) {
        const ordenada = Boolean(numero && !vineta);
        const re = ordenada ? RE.numero : RE.vineta;
        const items = [];
        while (i < lineas.length) {
          const mi = re.exec(lineas[i]);
          if (mi) {
            items.push(mi[1]);
            i++;
          } else if (lineas[i].trim() && /^\s{2,}/.test(lineas[i]) && items.length) {
            items[items.length - 1] += ` ${lineas[i].trim()}`; // continuación
            i++;
          } else break;
        }
        bloques.push({ tipo: 'lista', ordenada, items: items.map(inline) });
        continue;
      }
      if (RE.cita.test(l)) {
        const partes = [];
        while (i < lineas.length && RE.cita.test(lineas[i])) partes.push(RE.cita.exec(lineas[i++])[1]);
        bloques.push({ tipo: 'cita', inline: inline(partes.join(' ')) });
        continue;
      }
      const partes = [];
      while (i < lineas.length && lineas[i].trim()
        && !RE.cerco.test(lineas[i]) && !RE.titulo.test(lineas[i])
        && !RE.vineta.test(lineas[i]) && !RE.numero.test(lineas[i]) && !RE.cita.test(lineas[i])) {
        partes.push(lineas[i++].trim());
      }
      bloques.push({ tipo: 'parrafo', inline: inline(partes.join(' ')) });
    }
    return bloques;
  }

  return { interpretar, inline };
});
