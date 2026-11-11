import type { ReactNode } from 'react';
import { fmtNum } from '../format';

/* Piezas visuales chicas: todas son HTML/CSS, sin librería de gráficas. */

/** Palomita dibujada (el carácter ✓ cambia de forma según la fuente). */
export function Check({ className = '' }: { className?: string }) {
  return (
    <svg className={`check-icon ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Un dato con su porcentaje en barra y una línea que explica qué significa. */
export function Meter({
  label, count, total, hint, tone = 'blue',
}: { label: string; count: number; total: number; hint?: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const pct = total ? Math.round((100 * count) / total) : 0;
  return (
    <article className={`meter tone-bar-${tone}`}>
      <div className="meter-top">
        <span className="meter-label">{label}</span>
        <span className="meter-pct">{pct}%</span>
      </div>
      <div className="meter-bar" role="img" aria-label={`${pct}%`}><span style={{ width: `${pct}%` }} /></div>
      <p className="meter-foot"><strong>{fmtNum(count)}</strong> de {fmtNum(total)}{hint ? ` · ${hint}` : ''}</p>
    </article>
  );
}

/** Barras horizontales ordenadas: etiqueta, barra y número. */
export function BarList({
  items, empty = 'Sin datos todavía.', suffix,
}: { items: { label: string; value: number; extra?: ReactNode; color?: string }[]; empty?: string; suffix?: string }) {
  if (!items.length) return <p className="hint">{empty}</p>;
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.label}>
          <span className="bar-list-label" title={item.label}>{item.label}</span>
          <span className="bar-list-track">
            <span style={{ width: `${(100 * item.value) / max}%`, background: item.color }} />
          </span>
          <span className="bar-list-value">{fmtNum(item.value)}{suffix ?? ''}{item.extra ? <span className="muted"> {item.extra}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columnas verticales con su leyenda abajo (para la distribución de score). */
export function Columns({ items }: { items: { label: string; sub: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="columns-chart">
      {items.map((item) => (
        <div key={item.label} className="columns-col">
          <span className="columns-value">{fmtNum(item.value)}</span>
          <span className="columns-track">
            <span style={{ height: `${Math.max(item.value ? 6 : 0, (100 * item.value) / max)}%`, background: item.color }} />
          </span>
          <strong>{item.label}</strong>
          <span className="muted">{item.sub}</span>
        </div>
      ))}
    </div>
  );
}

/** Embudo de la zona: de los negocios encontrados hasta los cerrados. */
export function Funnel({ steps }: { steps: { label: string; value: number; hint: string }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="funnel">
      {steps.map((step, index) => (
        <li key={step.label} style={{ ['--w' as string]: `${Math.max(8, (100 * step.value) / top)}%` }}>
          <span className="funnel-bar" />
          <span className="funnel-num">{fmtNum(step.value)}</span>
          <span className="funnel-text">
            <strong>{step.label}</strong>
            <span className="muted">{step.hint}</span>
          </span>
          {index > 0 && steps[index - 1].value ? (
            <span className="funnel-rate">{Math.round((100 * step.value) / steps[index - 1].value)}%</span>
          ) : <span className="funnel-rate" />}
        </li>
      ))}
    </ol>
  );
}

/** Pasos numerados: cuál ya se hizo, cuál sigue. */
export function Steps({ steps }: { steps: { title: string; text: string; done: boolean }[] }) {
  const current = steps.findIndex((step) => !step.done);
  return (
    <ol className="steps">
      {steps.map((step, index) => (
        <li key={step.title} className={step.done ? 'done' : index === current ? 'current' : ''}>
          <span className="steps-dot" aria-hidden="true">{step.done ? <Check /> : index + 1}</span>
          <span>
            <strong>{step.title}</strong>
            <span className="muted">{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Tarjeta con título, explicación corta y contenido. */
export function Card({ title, help, children, className = '', action }: { title: string; help?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {help ? <p className="hint">{help}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Lista con viñetas propias (las del navegador se salían de la tarjeta). */
export function Bullets({ items, icon = '•' }: { items: ReactNode[]; icon?: string }) {
  return (
    <ul className="bullets">
      {items.map((item, index) => <li key={index}><span aria-hidden="true">{icon}</span><span>{item}</span></li>)}
    </ul>
  );
}
