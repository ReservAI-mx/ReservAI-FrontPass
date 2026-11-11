import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage, exportFile, getLastExportAt, saveBlob } from '../api';
import { Check } from '../components/charts';
import { EmptyState, FallbackBanner, Loading, StatusBadge } from '../components/ui';
import { EXPORT_COLUMNS, exportCell, fmtDate, fmtNum, zoneText } from '../format';
import { useProspects, useSearchJob } from '../hooks';
import { useSelection } from '../store';
import type { ExportFormat, ExportType, Prospect } from '../types';

type Scope = 'all' | 'selected' | 'qualified';

/* Las que bastan para llamar o visitar. */
const BASIC = ['name', 'category', 'phone', 'lead_score', 'address'];

function Choice({
  checked, onSelect, title, text, disabled, badge,
}: { checked: boolean; onSelect: () => void; title: string; text: string; disabled?: boolean; badge?: string }) {
  return (
    <button type="button" className={`choice${checked ? ' on' : ''}`} aria-pressed={checked} disabled={disabled} onClick={onSelect}>
      <span className="choice-radio" aria-hidden="true" />
      <span className="choice-text">
        <strong>{title}{badge ? <span className="choice-badge">{badge}</span> : null}</strong>
        <span className="muted">{text}</span>
      </span>
    </button>
  );
}

export function ExportPage() {
  const { searchId } = useParams();
  const [params] = useSearchParams();
  const job = useSearchJob(searchId);
  const prospects = useProspects(searchId, false);
  const selection = useSelection(searchId);
  const [format, setFormat] = useState<ExportFormat>(params.get('format') === 'pdf' ? 'pdf' : 'csv');
  const [scope, setScope] = useState<Scope>(selection.length ? 'selected' : 'all');
  const [summaryOnly, setSummaryOnly] = useState(false);
  const [minScore, setMinScore] = useState(70);
  const [columns, setColumns] = useState<string[]>(EXPORT_COLUMNS.map((column) => column.id));
  const [findings, setFindings] = useState(true);
  const [tips, setTips] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const lastExport = useQuery({
    queryKey: ['exports', searchId],
    enabled: Boolean(searchId) && !job.fallback,
    retry: false,
    queryFn: () => getLastExportAt(searchId!),
  });

  const rows = prospects.rows;
  const chosen = useMemo(() => pickRows(rows, selection, scope, minScore), [rows, selection, scope, minScore]);

  if (!searchId) {
    return (
      <div className="page">
        <EmptyState
          title="Primero elige una zona"
          body="Exportas los negocios de una búsqueda: a Excel (CSV) para trabajarlos o a PDF para presentarlos."
          action={<Link className="primary" to="/searches">Ver mis zonas</Link>}
        />
      </div>
    );
  }
  if (job.query.isPending || prospects.query.isPending) return <Loading label="Cargando exportación…" />;

  const search = job.search;
  const usingExample = job.fallback || prospects.fallback;
  const type: ExportType = scope === 'qualified' ? 'qualified_only' : format === 'pdf' && summaryOnly ? 'executive_summary' : 'full_table';
  const qualifiedCount = rows.filter((row) => (row.lead_score ?? -1) >= minScore).length;
  // Siempre en el orden de EXPORT_COLUMNS: al volver a prender una columna
  // regresa a su lugar (antes se iba al final y desaparecía de la vista).
  const toggleColumn = (id: string) => setColumns((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return EXPORT_COLUMNS.map((column) => column.id).filter((item) => next.has(item));
  });

  async function run() {
    setError(null);
    setOk(false);
    if (!columns.length) {
      setError('Elige al menos una columna.');
      return;
    }
    if (!chosen.length) {
      setError(scope === 'qualified' ? 'Ningún negocio alcanza el score mínimo.' : 'No hay negocios para exportar.');
      return;
    }
    setBusy(true);
    try {
      const file = await exportFile(searchId!, {
        format,
        type,
        qualified_min_score: minScore,
        columns,
        include_ai_findings_summary: format === 'pdf' && findings,
        include_call_recommendations: format === 'pdf' && tips,
        prospect_ids: chosen.map((row) => row.id),
      });
      saveBlob(file.blob, file.filename);
      setOk(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Todas las columnas elegidas; la tabla se desplaza de lado si no caben.
  const previewCols = columns;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Exportar {search ? <StatusBadge status={search.status} /> : null}</p>
          <h1>{zoneText(search) || 'Zona'}</h1>
          <p className="lede">Tres decisiones y listo: cuáles negocios, en qué formato y con qué datos.</p>
        </div>
        <Link className="ghost" to={`/searches/${searchId}`}>Volver a los negocios</Link>
      </header>
      {usingExample ? (
        <FallbackBanner
          title="No se cargaron los prospectos."
          message="La exportación queda deshabilitada hasta que la API responda."
          onRetry={() => { void job.query.refetch(); void prospects.query.refetch(); }}
          retrying={job.query.isFetching || prospects.query.isFetching}
        />
      ) : null}

      <div className="export-layout">
        <div className="stack">
          <section className="card step-card">
            <h2><span className="step-num">1</span>¿Cuáles negocios?</h2>
            <div className="choices">
              <Choice checked={scope === 'all'} onSelect={() => setScope('all')} title="Todos" badge={fmtNum(rows.length)} text="Toda la zona." />
              <Choice
                checked={scope === 'selected'}
                onSelect={() => setScope('selected')}
                disabled={!selection.length}
                title="Los que marqué"
                badge={fmtNum(selection.length)}
                text={selection.length ? 'Los que palomeaste en la lista.' : 'Marca negocios en la lista para usar esto.'}
              />
              <Choice checked={scope === 'qualified'} onSelect={() => setScope('qualified')} title="Sólo los buenos" badge={fmtNum(qualifiedCount)} text={`Score de ${minScore} o más.`} />
            </div>
            {scope === 'qualified' ? (
              <label className="field">Score mínimo: <strong>{minScore}</strong>
                <input type="range" min={0} max={100} step={5} value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} />
              </label>
            ) : null}
          </section>

          <section className="card step-card">
            <h2><span className="step-num">2</span>¿En qué formato?</h2>
            <div className="format-cards">
              <button type="button" className={`format-card${format === 'csv' ? ' on' : ''}`} aria-pressed={format === 'csv'} onClick={() => setFormat('csv')}>
                <span className="format-icon">CSV</span>
                <strong>Para trabajarlo</strong>
                <span className="muted">Se abre en Excel o Google Sheets para filtrar, repartir y marcar.</span>
              </button>
              <button type="button" className={`format-card${format === 'pdf' ? ' on' : ''}`} aria-pressed={format === 'pdf'} onClick={() => setFormat('pdf')}>
                <span className="format-icon pdf">PDF</span>
                <strong>Para presentarlo</strong>
                <span className="muted">Portada con mapa, números de la zona y la lista lista para imprimir.</span>
              </button>
            </div>
            {format === 'pdf' ? (
              <div className="pdf-options">
                <label className="toggle"><input type="checkbox" checked={summaryOnly} disabled={scope === 'qualified'} onChange={(event) => setSummaryOnly(event.target.checked)} /><span>Sólo resumen ejecutivo (sin la tabla larga)</span></label>
                <label className="toggle"><input type="checkbox" checked={findings} onChange={(event) => setFindings(event.target.checked)} /><span>Incluir hallazgos de la zona</span></label>
                <label className="toggle"><input type="checkbox" checked={tips} onChange={(event) => setTips(event.target.checked)} /><span>Incluir recomendaciones para la llamada</span></label>
              </div>
            ) : null}
          </section>

          <section className="card step-card">
            <h2>
              <span className="step-num">3</span>¿Qué datos?
              <span className="step-actions">
                <button type="button" className="link-btn" onClick={() => setColumns(BASIC)}>Básicos</button>
                <button type="button" className="link-btn" onClick={() => setColumns(EXPORT_COLUMNS.map((column) => column.id))}>Todos</button>
              </span>
            </h2>
            <div className="chips">
              {EXPORT_COLUMNS.map((column) => {
                const on = columns.includes(column.id);
                return (
                  <button key={column.id} type="button" className={on ? 'chip check-chip on' : 'chip check-chip'} aria-pressed={on} onClick={() => toggleColumn(column.id)}>
                    <span className="check-box" aria-hidden="true">{on ? <Check /> : null}</span>
                    {column.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card">
            <header className="card-head">
              <div>
                <h2>Así se verá</h2>
                <p className="hint">Las primeras 6 filas con las {columns.length} columnas que elegiste, en el orden del archivo.</p>
              </div>
            </header>
            {chosen.length && previewCols.length ? (
              <div className="table-wrap">
                <table className="preview">
                  <thead><tr>{previewCols.map((column) => <th key={column}>{EXPORT_COLUMNS.find((item) => item.id === column)?.label ?? column}</th>)}</tr></thead>
                  <tbody>
                    {chosen.slice(0, 6).map((row) => (
                      <tr key={row.id}>{previewCols.map((column) => <td key={column}>{exportCell(row, column, search?.zone || search?.label || '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="hint">Nada que mostrar con estas opciones.</p>}
          </section>
        </div>

        <aside className="card summary-card">
          <span className={`format-icon big${format === 'pdf' ? ' pdf' : ''}`}>{format.toUpperCase()}</span>
          <h2>Tu archivo</h2>
          <dl className="summary-list">
            <div><dt>Negocios</dt><dd>{fmtNum(chosen.length)}</dd></div>
            <div><dt>Columnas</dt><dd>{fmtNum(columns.length)}</dd></div>
            <div><dt>Formato</dt><dd>{format === 'pdf' ? (type === 'executive_summary' ? 'PDF, resumen' : 'PDF') : 'CSV (Excel)'}</dd></div>
            {format === 'pdf' ? <div><dt>Extras</dt><dd>{[findings && 'hallazgos', tips && 'llamadas'].filter(Boolean).join(', ') || 'ninguno'}</dd></div> : null}
          </dl>
          {error ? <p className="banner err compact">{error}</p> : null}
          {ok ? <p className="banner ok compact">Listo: la descarga empezó.</p> : null}
          <button type="button" className="primary block" disabled={usingExample || busy || !columns.length || !chosen.length} onClick={() => void run()}>
            {busy ? 'Generando archivo…' : `Descargar ${format.toUpperCase()}`}
          </button>
          {lastExport.data ? <p className="hint">Última exportación: {fmtDate(lastExport.data)}</p> : null}
        </aside>
      </div>
    </div>
  );
}

function pickRows(rows: Prospect[], selection: string[], scope: Scope, minScore: number) {
  if (scope === 'selected') return rows.filter((row) => selection.includes(row.id));
  if (scope === 'qualified') return rows.filter((row) => (row.lead_score ?? -1) >= minScore);
  return rows;
}
