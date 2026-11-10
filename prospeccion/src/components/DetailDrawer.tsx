import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { analyzeProspect, errorMessage } from '../api';
import {
  bitacoraHref, directionsHref, emailStatusLabel, fmtDate, fmtNum, safeHttp, telHref, visitTone, waHref, yesNo,
} from '../format';
import type { Prospect } from '../types';
import { FitBadge, ScoreCell, useDialog, VisitBadge } from './ui';

export function DetailDrawer({
  prospect, refreshing, partial, blocked, onClose,
}: {
  prospect: Prospect | null;
  refreshing: boolean;
  partial: boolean;
  blocked: boolean;
  onClose: () => void;
}) {
  const ref = useDialog(Boolean(prospect));
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => analyzeProspect(prospect!.id),
    onSuccess: async () => {
      setNote('Análisis encolado. La ficha se actualizará al terminar.');
      await qc.invalidateQueries({ queryKey: ['prospect', prospect!.id] });
      await qc.invalidateQueries({ queryKey: ['prospects'] });
      await qc.invalidateQueries({ queryKey: ['search'] });
    },
  });
  if (!prospect) {
    return <dialog ref={ref} className="drawer" onClose={onClose} />;
  }
  const web = safeHttp(prospect.website);
  const maps = safeHttp(prospect.maps_url);
  const phone = prospect.phone ? telHref(prospect.phone) : null;
  const wa = prospect.has_whatsapp !== false ? waHref(prospect.phone) : null;
  const route = directionsHref(prospect);
  const analyzed = fmtDate(prospect.analyzed_at);
  const visited = visitTone(prospect.visit) !== 'none';
  const list = (items: string[]) => (items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">—</p>);
  return (
    <dialog ref={ref} className="drawer" onClose={onClose}>
      <div className="drawer-body">
        <header className="drawer-head">
          <div>
            <p className="eyebrow">{prospect.category_name ?? 'Negocio'}</p>
            <h2>{prospect.name}</h2>
            <p className="muted">{prospect.address ?? 'Sin dirección'}</p>
          </div>
          <button type="button" className="ghost icon-btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </header>
        {partial ? <p className="banner warn">Ficha parcial: el detalle completo no cargó.</p> : null}
        {refreshing ? <p className="muted">Actualizando ficha…</p> : null}

        {/* Lo primero: si alguien del equipo ya fue y qué hacer ahora. */}
        <section className={`visit-box tone-${visitTone(prospect.visit)}`}>
          <VisitBadge visit={prospect.visit} full />
          <p className="hint">
            {visited
              ? 'Ya lo visitó alguien del equipo. Antes de ir, revisa la visita en la Bitácora.'
              : 'Nadie lo ha visitado. Al registrar la visita queda ligado a este punto del mapa.'}
          </p>
          <div className="action-row">
            <a className="primary" href={bitacoraHref(prospect.id)}>{visited ? 'Registrar otra visita' : 'Registrar visita'}</a>
            {phone && prospect.phone ? <a className="ghost" href={phone}>Llamar</a> : null}
            {wa ? <a className="ghost" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}
            {route ? <a className="ghost" href={route} target="_blank" rel="noreferrer">Cómo llegar</a> : null}
          </div>
        </section>

        <div className="detail-scores">
          <div><span className="muted">Score</span> <ScoreCell score={prospect.lead_score} /></div>
          <FitBadge prospect={prospect} />
        </div>
        <dl className="detail">
          <div><dt>Calificación</dt><dd>{prospect.rating == null ? '—' : `★ ${fmtNum(prospect.rating, 1)} (${fmtNum(prospect.review_count)} reseñas)`}</dd></div>
          <div><dt>Teléfono</dt><dd>{phone && prospect.phone ? <a href={phone}>{prospect.phone}</a> : '—'}</dd></div>
          <div><dt>WhatsApp</dt><dd>{yesNo(prospect.has_whatsapp)}</dd></div>
          <div>
            <dt>Correo</dt>
            <dd>
              {prospect.email ? <a href={`mailto:${prospect.email}`}>{prospect.email}</a> : '—'}
              {!prospect.email && prospect.email_status ? <span className="muted"> · {emailStatusLabel(prospect.email_status)}</span> : null}
            </dd>
          </div>
          <div><dt>Sitio web</dt><dd>{web ? <a href={web} target="_blank" rel="noreferrer">{web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : '—'}</dd></div>
          <div><dt>Google Maps</dt><dd>{maps ? <a href={maps} target="_blank" rel="noreferrer">Abrir ficha</a> : '—'}</dd></div>
          <div><dt>Sistema de reservas</dt><dd>{yesNo(prospect.booking_system_detected)}</dd></div>
          <div><dt>Sucursales</dt><dd>{prospect.branch_count == null ? '—' : fmtNum(prospect.branch_count)}</dd></div>
        </dl>
        <section className="detail-section">
          <h3>Ángulo de venta</h3>
          <p>{prospect.sales_angle ?? '—'}</p>
        </section>
        <section className="detail-section">
          <h3>Área de oportunidad</h3>
          <p>{prospect.opportunity ?? '—'}</p>
        </section>
        <section className="detail-section">
          <h3>Lo que dicen las reseñas</h3>
          <p>{prospect.review_summary ?? '—'}</p>
        </section>
        <div className="split-mini">
          <section className="detail-section">
            <h3>Puntos de dolor</h3>
            {list(prospect.pain_points)}
          </section>
          <section className="detail-section">
            <h3>Señales positivas</h3>
            {list(prospect.positive_signals)}
          </section>
        </div>
        {analyzed ? <p className="muted">Analizado: {analyzed}</p> : null}
        {note ? <p className="banner ok">{note}</p> : null}
        {mutation.isError ? <p className="banner err">{errorMessage(mutation.error)}</p> : null}
        {ask ? (
          <div className="banner">
            <p>¿Recalcular el score de este prospecto?</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setAsk(false)}>Cancelar</button>
              <button type="button" className="primary" disabled={mutation.isPending} onClick={() => { setAsk(false); mutation.mutate(); }}>Recalcular score</button>
            </div>
          </div>
        ) : (
          <button type="button" className="ghost" disabled={blocked || mutation.isPending} onClick={() => setAsk(true)}>
            {mutation.isPending ? 'Encolando…' : 'Recalcular score'}
          </button>
        )}
      </div>
    </dialog>
  );
}
