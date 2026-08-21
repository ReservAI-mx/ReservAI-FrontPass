
export function estadoEfectivo(inv) {
  const status = String(inv?.status || '').toLowerCase();
  if (status === 'accepted') return 'accepted';
  if (status === 'revoked') return 'revoked';
  if (status === 'expired') return 'expired';

  if (status === 'pending') {
    const vence = inv?.expires_at ? new Date(inv.expires_at) : null;
    if (vence && !Number.isNaN(vence.getTime()) && vence.getTime() <= Date.now()) {
      return 'expired';
    }
    return 'pending';
  }
  return status || 'pending';
}

export const ETIQUETAS = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  revoked: 'Revocada',
  expired: 'Vencida',
};

/** Reenviar: pending o expired. Revocar: solo pending vigente. */
export function puedeReenviar(estado) {
  return estado === 'pending' || estado === 'expired';
}

export function puedeRevocar(estado) {
  return estado === 'pending';
}

const DIA = 24 * 60 * 60 * 1000;

/** "en 3 días", "hace 2 horas", "hoy". */
export function tiempoRelativo(fechaISO) {
  if (!fechaISO) return '';
  const fecha = new Date(fechaISO);
  if (Number.isNaN(fecha.getTime())) return '';

  const delta = fecha.getTime() - Date.now();
  const abs = Math.abs(delta);
  const futuro = delta > 0;

  if (abs < 60 * 1000) return 'ahora';
  if (abs < 60 * 60 * 1000) {
    const min = Math.round(abs / (60 * 1000));
    return futuro ? `en ${min} min` : `hace ${min} min`;
  }
  if (abs < DIA) {
    const horas = Math.round(abs / (60 * 60 * 1000));
    return futuro ? `en ${horas} h` : `hace ${horas} h`;
  }
  const dias = Math.round(abs / DIA);
  if (dias === 1) return futuro ? 'mañana' : 'ayer';
  return futuro ? `en ${dias} días` : `hace ${dias} días`;
}

export function fechaCorta(fechaISO) {
  if (!fechaISO) return '—';
  const fecha = new Date(fechaISO);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
