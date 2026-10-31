import { apiJson } from '../api.js';
import { showToast } from '../toast.js';

/**
 * Panel "Equipo" de Documentación: quién entra y qué puede tocar.
 * - Por área y personas (sólo admin): /api/permisos del backend del pass,
 *   siempre sobre la herramienta 'documentacion'. Los admins pueden todo.
 * - Proyectos borrados y actividad: /api/documentacion (servicio).
 * Antes vivía aparte en /admin/permisos; ahora está donde se usa.
 */

const HERRAMIENTA = 'documentacion';
const NOMBRE_NIVEL = { ninguno: 'Sin acceso', ver: 'Ver', editar: 'Editar' };
const NOMBRE_AREA = { seller: 'Vendedores', client: 'Clientes', admin: 'Admins' };
const BUSCAR_MS = 250;
const $ = (id) => document.getElementById(id);

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined && texto !== null) n.textContent = texto;
  return n;
}

function fecha(valor) {
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return '';
  return f.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const nombreArea = (t) => NOMBRE_AREA[t] || t;

/**
 * @param {{ esAdmin: boolean, puedeEditar: boolean, alRestaurar: (slug) => void }} op
 */
export function crearEquipo(op) {
  const estado = { niveles: ['ninguno', 'ver', 'editar'], tipos: [], areas: new Map(), excepciones: [], elegida: null };

  function selectNivel(valor, etiqueta) {
    const s = el('select', 'dv-input dv-eq__select');
    s.setAttribute('aria-label', etiqueta);
    for (const n of estado.niveles) {
      const o = el('option', '', NOMBRE_NIVEL[n] || n);
      o.value = n;
      s.appendChild(o);
    }
    s.value = valor;
    s.dataset.nivel = valor;
    return s;
  }

  function error(data, porDefecto) {
    return {
      cuenta_no_existe: 'La cuenta ya no existe.',
      cuenta_es_admin: 'Los admins ya pueden todo.',
      sin_excepcion: 'Esa excepción ya no estaba.',
    }[data && data.error] || porDefecto;
  }

  // ---------- Por área ----------

  function pintarAreas() {
    const cont = $('eqAreas');
    cont.replaceChildren();
    for (const tipo of estado.tipos) {
      const fila = el('div', 'dv-eq__fila');
      fila.appendChild(el('span', 'dv-eq__nombre', nombreArea(tipo)));
      const s = selectNivel(estado.areas.get(tipo) || 'ninguno', `Nivel de ${nombreArea(tipo)}`);
      s.addEventListener('change', async () => {
        const anterior = s.dataset.nivel;
        s.disabled = true;
        const r = await apiJson('/permisos/area', {
          method: 'PUT', body: { herramienta: HERRAMIENTA, tipo_cuenta: tipo, nivel: s.value },
        }).catch(() => ({ ok: false, data: {} }));
        s.disabled = false;
        if (!r.ok) {
          s.value = anterior;
          showToast(error(r.data, 'No se pudo guardar.'), 'error');
          return;
        }
        s.dataset.nivel = s.value;
        estado.areas.set(tipo, s.value);
        showToast(`${nombreArea(tipo)}: ${NOMBRE_NIVEL[s.value]}. Guardado.`, 'success');
        pintarPersonas();
      });
      fila.appendChild(s);
      cont.appendChild(fila);
    }
    const admins = el('div', 'dv-eq__fila');
    admins.append(el('span', 'dv-eq__nombre', 'Admins'), el('span', 'dv-eq__fijo', 'Editar, siempre'));
    cont.appendChild(admins);
  }

  // ---------- Personas (excepciones) ----------

  function pintarPersonas() {
    const cont = $('eqPersonas');
    cont.replaceChildren();
    $('eqPersonasN').textContent = String(estado.excepciones.length);
    if (!estado.excepciones.length) {
      cont.appendChild(el('p', 'dv-eq__vacio', 'Nadie tiene excepción: todos tienen lo de su área.'));
      return;
    }
    for (const x of estado.excepciones) {
      const fila = el('div', 'dv-eq__persona');
      const avatar = el('span', 'dv-eq__avatar', (x.name || x.email || '?').trim().charAt(0).toUpperCase());
      const quien = el('div', 'dv-eq__quien');
      quien.append(el('span', 'dv-eq__nombre', x.name), el('span', 'dv-eq__correo', `${x.email} · ${nombreArea(x.type)} (su área: ${NOMBRE_NIVEL[estado.areas.get(x.type) || 'ninguno']})`));
      const s = selectNivel(x.nivel, `Nivel de ${x.name}`);
      s.addEventListener('change', async () => {
        const anterior = s.dataset.nivel;
        s.disabled = true;
        const r = await apiJson('/permisos/cuenta', {
          method: 'PUT', body: { herramienta: HERRAMIENTA, account_id: x.account_id, nivel: s.value },
        }).catch(() => ({ ok: false, data: {} }));
        s.disabled = false;
        if (!r.ok) {
          s.value = anterior;
          showToast(error(r.data, 'No se pudo guardar.'), 'error');
          return;
        }
        s.dataset.nivel = s.value;
        x.nivel = s.value;
        showToast(`${x.name}: ${NOMBRE_NIVEL[x.nivel]}. Guardado.`, 'success');
      });
      const quitar = el('button', 'dv-eq__quitar', 'Quitar');
      quitar.type = 'button';
      quitar.title = 'Vuelve a lo de su área';
      quitar.addEventListener('click', async () => {
        quitar.disabled = true;
        const r = await apiJson('/permisos/cuenta', {
          method: 'DELETE', body: { herramienta: HERRAMIENTA, account_id: x.account_id },
        }).catch(() => ({ ok: false, data: {} }));
        if (!r.ok && r.status !== 404) {
          quitar.disabled = false;
          showToast(error(r.data, 'No se pudo quitar.'), 'error');
          return;
        }
        estado.excepciones = estado.excepciones.filter((e) => e !== x);
        pintarPersonas();
        showToast(`${x.name} vuelve a lo de su área.`, 'success');
      });
      fila.append(avatar, quien, s, quitar);
      cont.appendChild(fila);
    }
  }

  let temporizador = null;
  let ultima = 0;

  function cerrarSugerencias() {
    $('eqSugerencias').hidden = true;
  }

  async function buscar(texto) {
    const id = ++ultima;
    const r = await apiJson(`/permisos/cuentas?buscar=${encodeURIComponent(texto)}`).catch(() => ({ ok: false }));
    if (id !== ultima) return;
    const ul = $('eqSugerencias');
    ul.replaceChildren();
    const cuentas = r.ok ? r.data.cuentas || [] : [];
    if (!cuentas.length) {
      ul.appendChild(el('li', 'dv-eq__sin', r.ok
        ? 'Nadie del equipo con ese nombre o correo (los clientes no salen). Si no tiene cuenta, invítala desde Invitaciones.'
        : 'No se pudo buscar'));
    }
    for (const c of cuentas) {
      // Los admins salen para que se sepa que existen, pero no se eligen:
      // ya pueden todo.
      if (c.type === 'admin') {
        const li = el('li', 'dv-eq__sugerencia is-admin');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-disabled', 'true');
        li.append(el('span', 'dv-eq__nombre', c.name), el('span', 'dv-eq__correo', `${c.email} · Admin: ya puede todo, no necesita permiso`));
        ul.appendChild(li);
        continue;
      }
      const li = el('li', 'dv-eq__sugerencia');
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      li.append(el('span', 'dv-eq__nombre', c.name), el('span', 'dv-eq__correo', `${c.email} · ${nombreArea(c.type)}`));
      const elegir = () => {
        estado.elegida = c;
        $('eqBuscar').value = `${c.name} (${c.email})`;
        cerrarSugerencias();
        $('eqNivel').focus();
      };
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        elegir();
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          elegir();
        }
      });
      ul.appendChild(li);
    }
    ul.hidden = false;
  }

  function enlazarBuscador() {
    const input = $('eqBuscar');
    // Al entrar al campo sale todo el equipo (sin clientes); al escribir, se filtra.
    input.addEventListener('focus', () => {
      if (!estado.elegida) buscar(input.value.trim());
    });
    input.addEventListener('input', () => {
      estado.elegida = null;
      clearTimeout(temporizador);
      const t = input.value.trim();
      temporizador = setTimeout(() => buscar(t), BUSCAR_MS);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        const primero = $('eqSugerencias').querySelector('[role="option"]:not([aria-disabled])');
        if (primero) {
          e.preventDefault();
          primero.focus();
        }
      }
    });
    $('eqSugerencias').addEventListener('keydown', (e) => {
      const a = document.activeElement;
      if (e.key === 'ArrowDown' && a.nextElementSibling) {
        e.preventDefault();
        a.nextElementSibling.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (a.previousElementSibling || input).focus();
      }
    });
    input.addEventListener('blur', () => setTimeout(() => {
      if (!$('eqSugerencias').contains(document.activeElement)) cerrarSugerencias();
    }, 120));

    $('eqAgregar').addEventListener('click', async () => {
      const c = estado.elegida;
      if (!c) {
        showToast('Elige una cuenta de la lista.', 'warning');
        input.focus();
        return;
      }
      const nivel = $('eqNivel').value;
      $('eqAgregar').disabled = true;
      const r = await apiJson('/permisos/cuenta', {
        method: 'PUT', body: { herramienta: HERRAMIENTA, account_id: c.id, nivel },
      }).catch(() => ({ ok: false, data: {} }));
      $('eqAgregar').disabled = false;
      if (!r.ok) {
        showToast(error(r.data, 'No se pudo guardar.'), 'error');
        return;
      }
      estado.excepciones = estado.excepciones.filter((x) => x.account_id !== c.id);
      estado.excepciones.push({ account_id: c.id, name: c.name, email: c.email, type: c.type, nivel });
      estado.excepciones.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      estado.elegida = null;
      input.value = '';
      pintarPersonas();
      showToast(`${c.name}: ${NOMBRE_NIVEL[nivel]}. Guardado.`, 'success');
    });
  }

  // ---------- Borrados y actividad ----------

  async function cargarBorrados() {
    const cont = $('eqBorrados');
    cont.replaceChildren(el('p', 'dv-eq__vacio', 'Cargando…'));
    const r = await apiJson('/documentacion/eliminados').catch(() => ({ ok: false }));
    cont.replaceChildren();
    const lista = r.ok ? r.data.proyectos || [] : [];
    $('eqBorradosN').textContent = String(lista.length);
    if (!r.ok) {
      cont.appendChild(el('p', 'dv-eq__vacio', 'No se pudieron cargar.'));
      return;
    }
    if (!lista.length) {
      cont.appendChild(el('p', 'dv-eq__vacio', 'No se ha borrado ningún proyecto.'));
      return;
    }
    for (const p of lista) {
      const fila = el('div', 'dv-eq__persona');
      const quien = el('div', 'dv-eq__quien');
      quien.append(el('span', 'dv-eq__nombre', p.nombre || p.slug), el('span', 'dv-eq__correo', `${p.slug} · borrado ${fecha(p.eliminado_en)}${p.eliminado_por ? ` por ${p.eliminado_por}` : ''}`));
      const b = el('button', 'ui-btn ui-btn--ghost dv-btn-chico', 'Restaurar');
      b.type = 'button';
      b.addEventListener('click', async () => {
        b.disabled = true;
        const rr = await apiJson(`/documentacion/eliminados/${encodeURIComponent(p.id)}/restaurar`, { method: 'POST', body: {} })
          .catch(() => ({ ok: false, status: 0 }));
        b.disabled = false;
        if (!rr.ok) {
          showToast(rr.status === 409
            ? `Ya hay otro proyecto "${p.slug}". Renómbralo o bórralo para restaurar este.`
            : 'No se pudo restaurar.', 'error', 6000);
          return;
        }
        showToast(`"${p.nombre || p.slug}" volvió a la lista.`, 'success');
        cargarBorrados();
        cargarActividad();
        op.alRestaurar(rr.data.slug);
      });
      fila.append(quien, b);
      cont.appendChild(fila);
    }
  }

  async function cargarActividad() {
    const cont = $('eqActividad');
    const r = await apiJson('/documentacion/actividad').catch(() => ({ ok: false }));
    cont.replaceChildren();
    const lista = r.ok ? r.data.actividad || [] : [];
    if (!lista.length) {
      cont.appendChild(el('p', 'dv-eq__vacio', r.ok ? 'Sin actividad todavía.' : 'No se pudo cargar.'));
      return;
    }
    for (const a of lista) {
      const fila = el('div', 'dv-eq__evento');
      fila.append(
        el('span', `dv-eq__etiqueta dv-eq__etiqueta--${a.tipo}`, a.tipo === 'creado' ? 'Creado' : 'Borrado'),
        el('span', 'dv-eq__nombre', a.nombre || a.slug),
        el('span', 'dv-eq__correo', `${a.quien || 'alguien'} · ${fecha(a.fecha)}`),
      );
      cont.appendChild(fila);
    }
  }

  async function cargarPermisos() {
    const r = await apiJson('/permisos').catch(() => ({ ok: false, data: {} }));
    if (!r.ok) {
      $('eqAreas').replaceChildren(el('p', 'dv-eq__vacio', 'No se pudieron cargar los permisos.'));
      return;
    }
    estado.niveles = r.data.niveles || estado.niveles;
    estado.tipos = r.data.tipos_cuenta || [];
    estado.areas = new Map((r.data.areas || []).filter((a) => a.herramienta === HERRAMIENTA).map((a) => [a.tipo_cuenta, a.nivel]));
    estado.excepciones = (r.data.excepciones || []).filter((x) => x.herramienta === HERRAMIENTA);
    const sn = $('eqNivel');
    sn.replaceChildren();
    for (const n of estado.niveles) {
      const o = el('option', '', NOMBRE_NIVEL[n] || n);
      o.value = n;
      sn.appendChild(o);
    }
    sn.value = 'editar';
    pintarAreas();
    pintarPersonas();
  }

  function abrir() {
    for (const n of document.querySelectorAll('.js-eq-admin')) n.hidden = !op.esAdmin;
    for (const n of document.querySelectorAll('.js-eq-editar')) n.hidden = !op.puedeEditar;
    $('dlgEquipo').showModal();
    if (op.esAdmin) cargarPermisos();
    if (op.puedeEditar) cargarBorrados();
    cargarActividad();
  }

  enlazarBuscador();
  $('cerrarEquipo').addEventListener('click', () => $('dlgEquipo').close());
  $('dlgEquipo').addEventListener('click', (e) => {
    if (e.target === $('dlgEquipo')) $('dlgEquipo').close();
  });

  return { abrir };
}
