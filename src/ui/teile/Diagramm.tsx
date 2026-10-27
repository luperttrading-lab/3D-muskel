// Liniendiagramm (SVG) mit Fadenkreuz und Wertanzeige beim Berühren.
import { useMemo, useRef, useState } from 'react';

export interface Serie { name: string; farbe: string; punkte: [number, number][]; gestrichelt?: boolean }

export function Diagramm({ serien, hoehe = 180, yFormat = (v: number) => `${Math.round(v * 100)} %`, xFormat }: { serien: Serie[]; hoehe?: number; yFormat?: (v: number) => string; xFormat: (t: number) => string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [zeiger, setZeiger] = useState<number | null>(null);
  const B = 340, L = 40, R = 10, O = 8, U = 22;
  const alle = serien.flatMap(s => s.punkte);
  const { x0, x1, ymax } = useMemo(() => {
    const xs = alle.map(p => p[0]);
    const y = Math.max(0.05, ...alle.map(p => p[1]));
    return { x0: Math.min(...xs), x1: Math.max(Math.min(...xs) + 1, ...xs), ymax: Math.ceil(y * 10) / 10 };
  }, [alle]);
  if (!alle.length) return <div className="text-sm text-text-3 py-6 text-center">Noch keine Daten.</div>;
  const x = (t: number) => L + ((t - x0) / (x1 - x0)) * (B - L - R);
  const y = (v: number) => O + (1 - v / ymax) * (hoehe - O - U);
  const ticks = [0, ymax / 2, ymax];
  const naechster = (s: Serie, t: number) => s.punkte.reduce((a, p) => (Math.abs(p[0] - t) < Math.abs(a[0] - t) ? p : a), s.punkte[0]);
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${B} ${hoehe}`} className="w-full touch-none" role="img" aria-label={serien.map(s => s.name).join(', ')}
        onPointerMove={e => { const r = ref.current!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * B; setZeiger(px < L ? null : x0 + ((px - L) / (B - L - R)) * (x1 - x0)); }}
        onPointerLeave={() => setZeiger(null)}>
        {ticks.map(v => <g key={v}><line x1={L} x2={B - R} y1={y(v)} y2={y(v)} stroke="rgb(163 176 204 / 0.14)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--color-text-3)">{yFormat(v)}</text></g>)}
        <text x={L} y={hoehe - 6} fontSize="10" fill="var(--color-text-3)">{xFormat(x0)}</text>
        <text x={B - R} y={hoehe - 6} fontSize="10" textAnchor="end" fill="var(--color-text-3)">{xFormat(x1)}</text>
        {serien.map(s => (
          <polyline key={s.name} fill="none" stroke={s.farbe} strokeWidth={2} strokeDasharray={s.gestrichelt ? '4 4' : undefined} strokeOpacity={s.gestrichelt ? 0.6 : 1}
            points={s.punkte.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} />
        ))}
        {serien.filter(s => !s.gestrichelt).map(s => { const p = s.punkte[s.punkte.length - 1]; return <circle key={s.name} cx={x(p[0])} cy={y(p[1])} r={4} fill={s.farbe} stroke="var(--color-flaeche)" strokeWidth={2} />; })}
        {zeiger !== null && <line x1={x(zeiger)} x2={x(zeiger)} y1={O} y2={hoehe - U} stroke="var(--color-text-3)" strokeDasharray="2 3" />}
      </svg>
      {zeiger !== null && (
        <div className="absolute top-1 right-1 karte px-2 py-1 text-[11px] pointer-events-none">
          <div className="text-text-3">{xFormat(zeiger)}</div>
          {serien.filter(s => !s.gestrichelt).map(s => <div key={s.name}><span style={{ color: s.farbe }}>■</span> {s.name}: <b className="zahl">{yFormat(naechster(s, zeiger)[1])}</b></div>)}
        </div>
      )}
    </div>
  );
}
