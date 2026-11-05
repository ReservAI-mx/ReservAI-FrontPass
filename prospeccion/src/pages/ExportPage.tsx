import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage, exportFile, getLastExportAt, saveBlob } from '../api';
import { EmptyState, FallbackBanner, KpiRow, Loading, Pager } from '../components/ui';
import { EXPORT_COLUMNS, exportCell, fmtDate, fmtNum, PAGE_SIZE, zoneText } from '../format';
import { useProspects, useSearchJob } from '../hooks';
import { useSelection } from '../store';
import type { ExportFormat, ExportType, Prospect } from '../types';

export function ExportPage() {
  const { searchId } = useParams();
  const [params] = useSearchParams();
  const job = useSearchJob(searchId);
  const prospects = useProspects(searchId, false);
  const selection = useSelection(searchId);
  const [format, setFormat] = useState<ExportFormat>(params.get('format') === 'pdf' ? 'pdf' : 'csv');
  const [type, setType] = useState<ExportType>('full_table');
  const [minScore, setMinScore] = useState(70);
  const [columns, setColumns] = useState<string[]>(EXPORT_COLUMNS.map((column) => column.id));
  const [findings, setFindings] = useState(true);
  const [tips, setTips] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [askAll, setAskAll] = useState(false);
  const lastExport = useQuery({
    queryKey: ['exports', searchId],
    enabled: Boolean(searchId) && !job.fallback,
    retry: false,
    queryFn: () => getLastExportAt(searchId!),
  });

  const rows = prospects.rows;
  const preview = useMemo(() => pickRows(rows, selection, type, minScore, false), [rows, selection, type, minScore]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(preview.length / PAGE_SIZE) || 1));
  const pageRows = preview.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!searchId) {
    return (
      <div className="page">
        <EmptyState title="Sin búsqueda activa" body="Exporta desde una búsqueda con prospectos." action={<Link className="primary" to="/map">Ir al mapa</Link>} />
      </div>
    );
  }
  if (job.query.isPending || prospects.query.isPending) return <Loading label="Cargando exportación…" />;

  const search = job.search;
  const zone = zoneText(search);
  const usingExample = job.fallback || prospects.fallback;
  const kpis = [
    { label: 'Registros en vista', value: fmtNum(preview.length), hint: selection.length ? `${fmtNum(selection.length)} marcados` : 'Sin selección' },
    { label: 'Columnas', value: fmtNum(columns.length) },
    { label: 'Formato', value: format.toUpperCase() },
    ...(lastExport.data ? [{ label: 'Última exportación', value: fmtDate(lastExport.data) ?? '—' }] : []),
  ];

  async function run(exportAll: boolean) {
    setAskAll(false);
    setError(null);
    setOk(false);
    const chosen = pickRows(rows, selection, type, minScore, exportAll);
    if (!columns.length) {
      setError('Elige al menos una columna.');
      return;
    }
    if (!chosen.length) {
      setError(type === 'qualified_only' ? 'Ningún prospecto alcanza el score mínimo.' : 'No hay prospectos para exportar.');
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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Exportar prospectos</h1>
          <p className="lede">{[zone, `${fmtNum(search?.businesses_found ?? rows.length)} prospectos`].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      {usingExample ? (
        <FallbackBanner
          title="No se cargaron los prospectos."
          message="La exportación queda deshabilitada hasta que la API responda."
          onRetry={() => { void job.query.refetch(); void prospects.query.refetch(); }}
          retrying={job.query.isFetching || prospects.query.isFetching}
        />
      ) : null}
      {error ? <p className="banner err">{error}</p> : null}
      {ok ? <p className="banner ok">Descarga iniciada.</p> : null}
      <KpiRow items={kpis} />
      <div className="workspace">
        <div className="stack">
          {selection.length === 0 ? <p className="hint">Sin filas marcadas: la vista previa muestra el conjunto filtrado por tipo.</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{columns.map((column) => <th key={column}>{EXPORT_COLUMNS.find((item) => item.id === column)?.label ?? column}</th>)}</tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column) => <td key={column}>{exportCell(row, column, search?.zone || search?.label || '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={safePage} pageSize={PAGE_SIZE} total={preview.length} onPage={setPage} />
          {format === 'pdf' ? (
            <div className="pdf-strip">
              <article><h3>Portada</h3><p>Mapa y KPIs. Los arma el servidor al generar el archivo.</p></article>
              <article><h3>Hallazgos</h3><p>{findings ? 'Se pedirán si la búsqueda tiene insights.' : 'No se incluirán.'}</p></article>
              <article><h3>Llamadas</h3><p>{tips ? 'Se pedirán recomendaciones de llamada.' : 'No se incluirán.'}</p></article>
            </div>
          ) : null}
        </div>
        <aside className="panel">
          <h2>Opciones</h2>
          <fieldset>
            <legend>Formato</legend>
            <label className="switch"><input type="radio" name="format" checked={format === 'csv'} onChange={() => setFormat('csv')} /> CSV</label>
            <label className="switch"><input type="radio" name="format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} /> PDF</label>
          </fieldset>
          <fieldset>
            <legend>Tipo</legend>
            <label className="switch"><input type="radio" name="type" checked={type === 'full_table'} onChange={() => setType('full_table')} /> Tabla completa</label>
            <label className="switch"><input type="radio" name="type" checked={type === 'executive_summary'} onChange={() => setType('executive_summary')} /> Resumen ejecutivo</label>
            <label className="switch"><input type="radio" name="type" checked={type === 'qualified_only'} onChange={() => setType('qualified_only')} /> Solo calificados</label>
          </fieldset>
          {type === 'qualified_only' ? (
            <label className="field">Score mínimo
              <input type="number" min={0} max={100} value={minScore} onChange={(event) => setMinScore(Number(event.target.value) || 0)} />
            </label>
          ) : null}
          <fieldset>
            <legend>Columnas</legend>
            <div className="check-grid">
              {EXPORT_COLUMNS.map((column) => (
                <label key={column.id} className="switch">
                  <input
                    type="checkbox"
                    checked={columns.includes(column.id)}
                    onChange={(event) => setColumns((current) => (
                      event.target.checked ? [...current, column.id] : current.filter((id) => id !== column.id)
                    ))}
                  />
                  {column.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="switch"><input type="checkbox" disabled={format !== 'pdf'} checked={findings} onChange={(event) => setFindings(event.target.checked)} /> Incluir resumen de hallazgos</label>
          <label className="switch"><input type="checkbox" disabled={format !== 'pdf'} checked={tips} onChange={(event) => setTips(event.target.checked)} /> Recomendaciones de llamada</label>
          {askAll ? (
            <div className="banner">
              <p>No hay filas marcadas. ¿Exportar todos los de la vista previa?</p>
              <div className="dialog-actions">
                <button type="button" className="ghost" onClick={() => setAskAll(false)}>Cancelar</button>
                <button type="button" className="primary" onClick={() => void run(true)}>Exportar todos</button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="primary"
            disabled={usingExample || busy || columns.length === 0}
            onClick={() => { if (!selection.length) setAskAll(true); else void run(false); }}
          >
            {busy ? 'Generando archivo…' : 'Exportar archivo'}
          </button>
        </aside>
      </div>
    </div>
  );
}

function pickRows(rows: Prospect[], selection: string[], type: ExportType, minScore: number, exportAll: boolean) {
  const base = !exportAll && selection.length ? rows.filter((row) => selection.includes(row.id)) : rows;
  if (type === 'qualified_only') return base.filter((row) => (row.lead_score ?? -1) >= minScore);
  return base;
}
