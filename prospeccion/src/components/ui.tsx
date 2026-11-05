import { useEffect, useRef, type ReactNode } from 'react';
import type { Prospect, SearchJob } from '../types';
import { fitLabel, fitTone, fmtNum, stageLabel } from '../format';

export function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return ref;
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <p className="loading" role="status">{label}</p>;
}

export function KpiRow({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="kpis">
      {items.map((item) => (
        <article key={item.label} className="kpi">
          <h3>{item.label}</h3>
          <p>{item.value}</p>
          {item.hint ? <span>{item.hint}</span> : null}
        </article>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function FallbackBanner({ title = 'Datos de ejemplo.', message, onRetry, retrying }: { title?: string; message: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div className="banner warn" role="status">
      <p><strong>{title}</strong> {message}</p>
      {onRetry ? (
        <button type="button" className="ghost" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Reintentando…' : 'Reintentar'}
        </button>
      ) : null}
    </div>
  );
}

export function ProgressBanner({ search }: { search: SearchJob }) {
  if (search.status !== 'pending' && search.status !== 'processing') return null;
  const pct = Math.max(0, Math.min(100, search.progress ?? 0));
  const found = search.businesses_found;
  const done = search.businesses_processed;
  return (
    <div className="banner" role="status" aria-live="polite">
      <p>{stageLabel(search.stage)}</p>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">
        {fmtNum(pct)}%
        {found != null ? ` · ${fmtNum(done ?? 0)} de ${fmtNum(found)} negocios` : ''}
      </p>
    </div>
  );
}

export function FitBadge({ prospect }: { prospect: Prospect }) {
  const label = fitLabel(prospect);
  return <span className={`badge fit-${fitTone(label)}`}>{label}</span>;
}

export function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="muted">—</span>;
  const rounded = Math.round(score);
  const tone = rounded >= 80 ? 'high' : rounded >= 60 ? 'potential' : rounded >= 40 ? 'medium' : 'low';
  return <span className={`score fit-${tone}`}>{rounded}</span>;
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span>Mostrando {from}–{to} de {total}</span>
      <div className="pager-nav">
        <button type="button" className="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span>{page} / {pages}</span>
        <button type="button" className="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, title, body, confirmLabel, busy, onConfirm, onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useDialog(open);
  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
