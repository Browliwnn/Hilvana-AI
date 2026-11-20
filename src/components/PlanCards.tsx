import { useState } from 'react';
import { Check } from 'lucide-react';
import { PLANS, priceOf, yearSavingEur, type Interval, type PlanId } from '../../shared/plans';

const eur = (n: number) => (n === 0 ? '0 €' : (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')) + ' €');

export function PlanCards({ current, busy, onChoose, cta }: {
  current?: PlanId;
  busy?: PlanId | null;
  onChoose: (p: PlanId, interval: Interval) => void;
  cta: (p: PlanId, isCurrent: boolean) => string;
}) {
  const [interval, setInterval] = useState<Interval>('year');
  return (
    <>
      <div className="interval" role="group" aria-label="Periodo de facturación">
        <button className={interval === 'month' ? 'on' : ''} onClick={() => setInterval('month')}>Mensual</button>
        <button className={interval === 'year' ? 'on' : ''} onClick={() => setInterval('year')}>Anual <em>2 meses gratis</em></button>
      </div>
      <div className="plan-grid">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const isCurrent = current === id;
          const yearly = interval === 'year' && p.priceYearEur > 0;
          return (
            <article key={id} className={`plan ${id === 'plus' ? 'plan-hot' : ''} ${isCurrent ? 'plan-current' : ''}`}>
              {id === 'plus' && <span className="plan-flag">La más elegida</span>}
              <h3>{p.name}</h3>
              <p className="plan-price">{eur(priceOf(p, interval))}<small>{p.priceMonthEur === 0 ? ' para siempre' : yearly ? ' / año' : ' / mes'}</small></p>
              <p className="plan-sub">{yearly ? `Equivale a ${eur(Math.round((p.priceYearEur / 12) * 100) / 100)} al mes · ahorras ${eur(yearSavingEur(p))}` : p.priceMonthEur === 0 ? 'Sin tarjeta' : 'Sin permanencia'}</p>
              <p className="plan-tag">{p.tagline}</p>
              <ul>{p.perks.map((x) => <li key={x}><Check size={15} />{x}</li>)}</ul>
              <button className={id === 'plus' ? 'btn btn-thread' : 'btn btn-ghost'} disabled={isCurrent || busy === id} onClick={() => onChoose(id, interval)}>
                {busy === id ? 'Un momento…' : cta(id, isCurrent)}
              </button>
            </article>
          );
        })}
      </div>
      <p className="fine">Precios con IVA incluido. Cancela cuando quieras; conservas el plan hasta el final del periodo pagado.</p>
    </>
  );
}
