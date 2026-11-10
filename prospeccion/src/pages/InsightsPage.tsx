import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { analyzeSearch, errorMessage } from '../api';
import { BarList, Bullets, Card, Columns, Meter } from '../components/charts';
import { ConfirmDialog, EmptyState, FallbackBanner, Loading, ScoreCell, StatusBadge } from '../components/ui';
import { colorFor, fmtNum, SCORE_BANDS, zoneText } from '../format';
import { useInsights, useKpiSet, useProspects, useSearchJob } from '../hooks';

export function InsightsPage() {
  const { searchId } = useParams();
  const job = useSearchJob(searchId);
  const polling = Boolean(searchId) && !job.fallback && (job.search?.status === 'pending' || job.search?.status === 'processing');
  const prospects = useProspects(searchId, polling);
  const insightsQ = useInsights(searchId, polling);
  const { kpis } = useKpiSet(searchId, prospects.query.isSuccess ? prospects.rows : undefined, polling);
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
    const bands = SCORE_BANDS.map((band) => ({
      label: band.label,
      sub: band.text,
      color: band.color,
      value: rows.filter((row) => row.lead_score != null && row.lead_score >= band.min && row.lead_score < band.max).length,
    }));
    const byCategory = new Map<string, { n: number; scores: number[] }>();
    for (const row of rows) {
      const key = row.category_name || 'Sin giro';
      const entry = byCategory.get(key) ?? { n: 0, scores: [] };
      entry.n += 1;
      if (row.lead_score != null) entry.scores.push(row.lead_score);
      byCategory.set(key, entry);
    }
    const pains = new Map<string, number>();
    rows.forEach((row) => row.pain_points.forEach((item) => pains.set(item, (pains.get(item) ?? 0) + 1)));
    return {
      bands,
      unscored: rows.filter((row) => row.lead_score == null).length,
      categories: [...byCategory.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([label, entry]) => ({
          label,
          value: entry.n,
          color: colorFor(label),
          extra: entry.scores.length ? `· score ${Math.round(entry.scores.reduce((s, n) => s + n, 0) / entry.scores.length)}` : undefined,
        })),
      pains: [...pains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })),
      best: rows.filter((row) => row.sales_angle).sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0)).slice(0, 4),
      visited: rows.filter((row) => row.visit).length,
    };
  }, [rows]);

  if (!searchId) {
    return (
      <div className="page">
        <EmptyState
          title="Primero elige una zona"
          body="El análisis resume una búsqueda: qué tantos negocios se pueden contactar, qué tan buenos son y qué les duele."
          action={<Link className="primary" to="/searches">Ver mis zonas</Link>}
        />
      </div>
    );
  }
  if (job.query.isPending) return <Loading label="Cargando análisis…" />;

  const search = job.search;
  const usingExample = job.fallback || prospects.fallback;
  const blocked = usingExample || search?.status === 'failed' || rows.length === 0;
  const total = kpis?.prospects_total ?? rows.length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Análisis de la zona {search ? <StatusBadge status={search.status} /> : null}</p>
          <h1>{zoneText(search) || 'Zona'}</h1>
          <p className="lede">Qué tan buena es esta zona para vender ReservAI, en una mirada.</p>
        </div>
        <div className="row">
          <Link className="ghost" to={`/searches/${searchId}`}>Ver negocios</Link>
          <button type="button" className="ghost" disabled={blocked || analyze.isPending} onClick={() => setAsk(true)}>
            {analyze.isPending ? 'Encolando…' : 'Recalcular scores'}
          </button>
          <Link className="primary" to={`/searches/${searchId}/export?format=pdf`}>Descargar PDF</Link>
        </div>
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
      {search?.status === 'failed' && !job.fallback ? <p className="banner err">{search.error || 'La búsqueda falló.'}</p> : null}

      <div className="meters">
        <Meter label="Con WhatsApp" count={kpis?.with_whatsapp.count ?? 0} total={total} tone="green" hint="les puedes escribir" />
        <Meter label="Con correo" count={kpis?.with_email.count ?? 0} total={total} tone="blue" hint="para mandar propuesta" />
        <Meter label="Sin sistema de reservas" count={kpis?.without_booking_system.count ?? 0} total={total} tone="amber" hint="lo que ReservAI resuelve" />
        <Meter label="Ya visitados" count={stats.visited} total={total} tone="gray" hint="por el equipo" />
      </div>

      <div className="grid-2">
        <Card title="¿Qué tan buenos son?" help="El score (0 a 100) junta reseñas, contacto y señales de que necesitan agenda. Empieza por los altos.">
          <Columns items={stats.bands} />
          {stats.unscored ? <p className="hint">{fmtNum(stats.unscored)} todavía sin score.</p> : null}
        </Card>
        <Card title="Por giro" help="Cuántos negocios hay de cada giro y su score promedio.">
          <BarList items={stats.categories} />
        </Card>
      </div>

      <Card title="Hallazgos" help="Lo que el servidor encontró al revisar la zona completa.">
        {insightsQ.isPending ? <Loading label="Cargando hallazgos…" /> : null}
        {insightsQ.isError ? <p className="hint">No se pudieron cargar los hallazgos.</p> : null}
        {insightsQ.data && insightsQ.data.length > 0 ? <Bullets icon="→" items={insightsQ.data} /> : null}
        {insightsQ.data && insightsQ.data.length === 0 ? <p className="hint">Aún no hay hallazgos. Usa «Recalcular scores» para pedirlos.</p> : null}
      </Card>

      <div className="grid-2">
        <Card title="De qué se quejan sus clientes" help="Se repite en las reseñas de Google: úsalo para abrir la plática.">
          <BarList items={stats.pains} empty="Todavía no hay quejas detectadas en las reseñas." />
        </Card>
        <Card title="Con quién empezar" help="Los de mejor score y qué decirles.">
          {stats.best.length === 0 ? <p className="hint">Aún no hay ángulos de venta.</p> : (
            <ul className="angle-list">
              {stats.best.map((row) => (
                <li key={row.id}>
                  <div className="angle-head"><strong>{row.name}</strong><ScoreCell score={row.lead_score} /></div>
                  <p>{row.sales_angle}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
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
