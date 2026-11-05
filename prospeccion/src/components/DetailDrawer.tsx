import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { analyzeProspect, errorMessage } from '../api';
import { emailStatusLabel, fmtDate, fmtNum, safeHttp, telHref, yesNo } from '../format';
import type { Prospect } from '../types';
import { FitBadge, ScoreCell, useDialog } from './ui';

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
  const analyzed = fmtDate(prospect.analyzed_at);
  return (
    <dialog ref={ref} className="drawer" onClose={onClose}>
      <div className="drawer-body">
        <header className="drawer-head">
          <div>
            <h2>{prospect.name}</h2>
            <p className="muted">{prospect.address ?? 'Sin dirección'}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Cerrar</button>
        </header>
        {partial ? <p className="banner warn">Ficha parcial: el detalle completo no cargó.</p> : null}
        {refreshing ? <p className="muted">Actualizando ficha…</p> : null}
        <div className="detail-scores">
          <ScoreCell score={prospect.lead_score} />
          <FitBadge prospect={prospect} />
        </div>
        <dl className="detail">
          <div><dt>Giro</dt><dd>{prospect.category_name ?? '—'}</dd></div>
          <div><dt>Zona</dt><dd>{prospect.zone_label ?? '—'}</dd></div>
          <div><dt>Calificación</dt><dd>{prospect.rating == null ? '—' : `${fmtNum(prospect.rating, 1)} (${fmtNum(prospect.review_count)} reseñas)`}</dd></div>
          <div><dt>Teléfono</dt><dd>{phone && prospect.phone ? <a href={phone}>{prospect.phone}</a> : '—'}</dd></div>
          <div>
            <dt>Correo</dt>
            <dd>
              {prospect.email ? <a href={`mailto:${prospect.email}`}>{prospect.email}</a> : '—'}
              {!prospect.email && prospect.email_status ? <span className="muted"> · {emailStatusLabel(prospect.email_status)}</span> : null}
            </dd>
          </div>
          <div><dt>Sitio web</dt><dd>{web ? <a href={web} target="_blank" rel="noreferrer">{web}</a> : '—'}</dd></div>
          <div><dt>Mapa</dt><dd>{maps ? <a href={maps} target="_blank" rel="noreferrer">Abrir en mapa</a> : '—'}</dd></div>
          <div><dt>WhatsApp</dt><dd>{yesNo(prospect.has_whatsapp)}</dd></div>
          <div><dt>Sistema de reservas</dt><dd>{yesNo(prospect.booking_system_detected)}</dd></div>
          <div><dt>Sucursales</dt><dd>{prospect.branch_count == null ? '—' : fmtNum(prospect.branch_count)}</dd></div>
        </dl>
        <section>
          <h3>Resumen de reseñas</h3>
          <p>{prospect.review_summary ?? '—'}</p>
        </section>
        <section>
          <h3>Área de oportunidad</h3>
          <p>{prospect.opportunity ?? '—'}</p>
        </section>
        <section>
          <h3>Pain points</h3>
          {prospect.pain_points.length ? <ul>{prospect.pain_points.map((item) => <li key={item}>{item}</li>)}</ul> : <p>—</p>}
        </section>
        <section>
          <h3>Señales positivas</h3>
          {prospect.positive_signals.length ? <ul>{prospect.positive_signals.map((item) => <li key={item}>{item}</li>)}</ul> : <p>—</p>}
        </section>
        <section>
          <h3>Ángulo de venta</h3>
          <p>{prospect.sales_angle ?? '—'}</p>
          {analyzed ? <p className="muted">Analizado: {analyzed}</p> : null}
        </section>
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
          <button type="button" className="primary" disabled={blocked || mutation.isPending} onClick={() => setAsk(true)}>
            {mutation.isPending ? 'Encolando…' : 'Recalcular score'}
          </button>
        )}
      </div>
    </dialog>
  );
}
