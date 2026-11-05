import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { analyzeSearch, errorMessage } from '../api';
import { ConfirmDialog, EmptyState, FallbackBanner, Loading } from '../components/ui';
import { fmtNum } from '../format';
import { useInsights, useProspects, useSearchJob } from '../hooks';

const BUCKETS = [
  { label: '0–39', min: 0, max: 40 },
  { label: '40–59', min: 40, max: 60 },
  { label: '60–79', min: 60, max: 80 },
  { label: '80–100', min: 80, max: 101 },
];

export function InsightsPage() {
  const { searchId } = useParams();
  const job = useSearchJob(searchId);
  const polling = Boolean(searchId) && !job.fallback && (job.search?.status === 'pending' || job.search?.status === 'processing');
  const prospects = useProspects(searchId, polling);
  const insightsQ = useInsights(searchId, polling);
  const [ask, setAsk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const qc = useQueryClient();
  const analyze = useMutation({
    mutationFn: () => analyzeSearch(searchId!),
    onSuccess: async () => {
      setNotice('Análisis encolado. Esta pantalla se actualiza al terminar.');
      await qc.invalidateQueries({ queryKey: ['search', searchId] });
      await qc.invalidateQueries({ queryKey: ['prospects', searchId] });
      await qc.invalidateQueries({ queryKey: ['insights', searchId] });
      await qc.invalidateQueries({ queryKey: ['kpis', searchId] });
    },
  });

  const rows = prospects.rows;
  const stats = useMemo(() => {
    const buckets = BUCKETS.map((bucket) => ({
      ...bucket,
      count: rows.filter((row) => row.lead_score != null && row.lead_score >= bucket.min && row.lead_score < bucket.max).length,
    }));
    const pains = new Map<string, number>();
    rows.forEach((row) => row.pain_points.forEach((item) => pains.set(item, (pains.get(item) ?? 0) + 1)));
    return {
      buckets,
      unscored: rows.filter((row) => row.lead_score == null).length,
      pains: [...pains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      angles: rows.filter((row) => row.sales_angle).slice(0, 5),
      max: Math.max(1, ...buckets.map((bucket) => bucket.count)),
    };
  }, [rows]);

  if (!searchId) {
    return (
      <div className="page">
        <EmptyState title="Sin búsqueda activa" body="El análisis aparece después de una búsqueda." action={<Link className="primary" to="/map">Ir al mapa</Link>} />
      </div>
    );
  }
  if (job.query.isPending) return <Loading label="Cargando análisis…" />;

  const usingExample = job.fallback || prospects.fallback;
  const blocked = usingExample || job.search?.status === 'failed' || rows.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Análisis</h1>
          <p className="lede">Hallazgos de la zona y señales que ya vienen en los prospectos.</p>
        </div>
        <button type="button" className="primary" disabled={blocked || analyze.isPending} onClick={() => setAsk(true)}>
          {analyze.isPending ? 'Encolando…' : 'Recalcular scores'}
        </button>
      </header>
      {usingExample ? (
        <FallbackBanner
          title="No se cargaron los prospectos."
          message={errorMessage(job.query.error ?? prospects.query.error)}
          onRetry={() => { void job.query.refetch(); void prospects.query.refetch(); }}
          retrying={job.query.isFetching || prospects.query.isFetching}
        />
      ) : null}
      {notice ? <p className="banner ok">{notice}</p> : null}
      {analyze.isError ? <p className="banner err">{errorMessage(analyze.error)}</p> : null}
      {job.search?.status === 'failed' && !job.fallback ? <p className="banner err">{job.search.error || 'La búsqueda falló.'}</p> : null}
      <section className="panel flat">
        <h2>Hallazgos de la búsqueda</h2>
        {insightsQ.isPending ? <Loading label="Cargando hallazgos…" /> : null}
        {insightsQ.isError ? <p className="hint">No se pudieron cargar los hallazgos.</p> : null}
        {insightsQ.data && insightsQ.data.length > 0 ? <ul>{insightsQ.data.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        {insightsQ.data && insightsQ.data.length === 0 ? <p className="hint">Aún no hay análisis de zona. Puedes lanzarlo con el botón de arriba.</p> : null}
        <Link to={`/searches/${searchId}/export?format=pdf`}>Exportar PDF con hallazgos</Link>
      </section>
      <section className="panel flat">
        <h2>Distribución de score</h2>
        <p className="hint">Calculado con los prospectos cargados{usingExample ? ' de ejemplo' : ''}.</p>
        <div className="bars">
          {stats.buckets.map((bucket) => (
            <div key={bucket.label}>
              <span>{bucket.label}</span>
              <div className="bar"><span style={{ width: `${(bucket.count / stats.max) * 100}%` }} /></div>
              <strong>{fmtNum(bucket.count)}</strong>
            </div>
          ))}
        </div>
        <p className="muted">Sin score: {fmtNum(stats.unscored)}</p>
      </section>
      <div className="split">
        <section className="panel flat">
          <h2>Pain points repetidos</h2>
          {stats.pains.length === 0 ? <p className="hint">Todavía no hay pain points.</p> : (
            <ul>{stats.pains.map(([label, count]) => <li key={label}>{label} · {fmtNum(count)}</li>)}</ul>
          )}
        </section>
        <section className="panel flat">
          <h2>Ángulos de venta</h2>
          {stats.angles.length === 0 ? <p className="hint">Aún no hay ángulos de venta.</p> : (
            <ul>{stats.angles.map((row) => <li key={row.id}><strong>{row.name}.</strong> {row.sales_angle}</li>)}</ul>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={ask}
        title="Recalcular scores"
        body="Se volverá a calcular el score de los prospectos de esta búsqueda."
        confirmLabel="Calcular"
        busy={analyze.isPending}
        onClose={() => setAsk(false)}
        onConfirm={() => { setAsk(false); analyze.mutate(); }}
      />
    </div>
  );
}
