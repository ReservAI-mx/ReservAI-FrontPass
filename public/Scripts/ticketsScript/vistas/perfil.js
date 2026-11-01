// Mi perfil: avisos por correo y en el navegador. El nombre y la contraseña
// son los de tu cuenta del pass.
import { h, vaciar, error, toast, avatar } from "../ui.js";
import { api, datos, area, esAdmin } from "../datos.js";

export async function render(cont) {
  const avisosCorreo = h("input.switch", { type: "checkbox", checked: datos.yo.correo_avisos });

  const guardar = async () => {
    try {
      await api("/preferencias", { method: "PATCH", body: { correo_avisos: avisosCorreo.checked } });
      datos.yo.correo_avisos = avisosCorreo.checked;
      toast(avisosCorreo.checked ? "Te mandaremos los avisos por correo" : "Ya no te mandaremos correos");
    } catch (e) {
      avisosCorreo.checked = !avisosCorreo.checked;
      error(e, "No se guardó");
    }
  };
  avisosCorreo.addEventListener("change", guardar);

  const ROLES = { admin: "Admin del área", miembro: "Miembro", lector: "Lector" };
  const misRoles = datos.miembros.filter((m) => m.persona_id === datos.yo.id)
    .map((m) => ({ a: area(m.area_id), rol: m.rol })).filter((x) => x.a && !x.a.archivada);
  const notificaciones = "Notification" in window && h("div.tarjeta.col-4",
    h("h2", "Avisos en el navegador"),
    h("p.muted", { style: { margin: 0 } }, Notification.permission === "granted"
      ? "Activados: te avisamos aunque la pestaña esté en segundo plano."
      : "Te avisamos con una notificación del sistema cuando la pestaña no está a la vista."),
    Notification.permission === "granted"
      ? h("span.chip", { style: { color: "var(--green)", background: "var(--green-soft)", justifySelf: "start" } }, "● Activados")
      : h("div", h("button.btn", {
        onclick: async () => {
          const r = await Notification.requestPermission();
          toast(r === "granted" ? "Avisos del navegador activados" : "El navegador no dio permiso");
          render(cont);
        },
      }, "Activar")));

  vaciar(cont,
    h("div.encabezado", h("div", h("h1", "Mi perfil"), h("div.sub", "Cómo te avisamos de lo que pasa en tus tickets."))),
    h("div.perfil.escalonado",
      h("div.tarjeta.cabecera",
        (() => { const a = avatar(datos.yo); a.classList.add("grande"); return a; })(),
        h("div", { style: { flex: "1", minWidth: "200px" } },
          h("h2", datos.yo.nombre),
          h("div.muted", datos.yo.correo),
          h("div.multi", { style: { marginTop: ".5rem" } },
            esAdmin() && h("span.chip", { style: { color: "var(--blue-text)", background: "var(--blue-soft)" } }, "Admin general"),
            datos.yo.nivel === "ver" && h("span.chip", "Sólo lectura"),
            misRoles.map((x) => h("span.chip", h("span.bola", { style: { background: x.a.color } }), `${x.a.nombre} · ${ROLES[x.rol]}`))))),
      h("div.tarjeta.col-4",
        h("h2", "Correo"),
        h("p.muted", { style: { margin: 0 } }, "Te juntamos en un solo correo los avisos que no hayas visto en unos minutos: te asignaron, te mencionaron, cambió de estado, vence mañana, etc."),
        h("label.chk", avisosCorreo, "Mandarme avisos por correo")),
      h("div.tarjeta.col-4",
        h("h2", "Tu cuenta"),
        h("p.muted", { style: { margin: 0 } }, "Tu nombre, tu contraseña y el código de acceso son los del Pass Manager: se cambian ahí, no en Tickets. En el teléfono, la sesión de Tickets dura 30 días; \"Cerrar sesión\" la cierra en todos lados."),
        h("label.campo", h("span", "Correo"), h("input", { type: "text", value: datos.yo.correo, readonly: true }))),
      notificaciones));
}
