import { useEffect, useId, useState } from "react";
import { FinancialAmount } from "./FinancialAmount";

const money = (n: number) =>
  (n >= 1_000_000 ? "≈ " : "") +
  new Intl.NumberFormat(
    "fr-FR",
    n >= 1_000_000
      ? { notation: "compact", maximumSignificantDigits: 3 }
      : { maximumFractionDigits: 0 },
  ).format(n);

export function Projection({
  balance,
  target,
}: {
  balance: string;
  target: number;
}) {
  const id = useId();
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(target / 100);
  const [monthly, setMonthly] = useState(0);
  const [inspected, setInspected] = useState(10);
  useEffect(() => setRate(target / 100), [target]);
  if (BigInt(balance) > BigInt(Number.MAX_SAFE_INTEGER))
    return (
      <section
        className="projection-card projection-studio"
        aria-labelledby={`${id}-title`}
      >
        <h2 id={`${id}-title`}>Projection indisponible pour ce montant.</h2>
        <p>
          Le solde dépasse la précision de cette simulation. Aucun calcul
          arrondi n’est présenté comme une projection fiable. Vos fonds et vos
          actions restent inchangés.
        </p>
        <p>Solde du plan en demoUSD :</p>
        <FinancialAmount raw={balance} />
      </section>
    );
  const base = Number(balance) / 1e6;
  const capital = (t: number) => base + monthly * 12 * t;
  const projected = (t: number) =>
    rate === 0
      ? capital(t)
      : base * (1 + rate / 100) ** t +
        monthly * 12 * (((1 + rate / 100) ** t - 1) / (rate / 100));
  const selected = Math.min(inspected, years);
  const ceiling = Math.max(projected(years), capital(years), 1) * 1.12;
  const x = (t: number) => 34 + (t / years) * 530;
  const y = (n: number) => 194 - (n / ceiling) * 160;
  const points = Array.from(
    { length: years + 1 },
    (_, t) => `${x(t)},${y(projected(t))}`,
  ).join(" ");
  const chooseYear = (value: number) => {
    setYears(value);
    setInspected(value);
  };
  return (
    <section
      className="projection-card projection-studio"
      aria-labelledby={`${id}-title`}
    >
      <div className="section-top">
        <div>
          <h2 id={`${id}-title`}>Projection du plan.</h2>
        </div>
        <span className="projection-tag">Simulation libre</span>
      </div>
      <div className="projection-value" aria-live="polite" aria-atomic="true">
        {money(projected(selected))}
        <small>demoUSD</small>
        <span>
          Valeur hypothétique à {selected} an{selected > 1 ? "s" : ""}
        </span>
      </div>
      <svg
        className="savings-chart"
        viewBox="0 0 600 225"
        role="img"
        aria-label={`Projection hypothétique sur ${years} ans : ${money(projected(years))} demoUSD, dont ${money(capital(years))} de capital. Utilisez le curseur Année observée pour explorer.`}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse" || event.buttons === 1) {
            const rect = event.currentTarget.getBoundingClientRect();
            setInspected(
              Math.round(
                Math.max(
                  0,
                  Math.min(
                    1,
                    (((event.clientX - rect.left) / rect.width) * 600 - 34) /
                      530,
                  ),
                ) * years,
              ),
            );
          }
        }}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="34"
              x2="564"
              y1={y(ceiling * f)}
              y2={y(ceiling * f)}
              className="chart-grid"
            />
            <text x="34" y={y(ceiling * f) - 7}>
              {money(ceiling * f)}
            </text>
          </g>
        ))}
        <polygon points={`34,194 ${points} 564,194`} className="chart-area" />
        <line
          x1={x(0)}
          x2={x(years)}
          y1={y(capital(0))}
          y2={y(capital(years))}
          className="chart-capital"
        />
        <polyline points={points} className="chart-projection" />
        <line
          x1={x(selected)}
          x2={x(selected)}
          y1="24"
          y2="194"
          className="chart-cursor"
        />
        <circle
          cx={x(selected)}
          cy={y(projected(selected))}
          r="6"
          className="chart-point"
        />
        <text x="34" y="218">
          Aujourd’hui
        </text>
        <text x="564" y="218" textAnchor="end">
          {years} ans
        </text>
      </svg>
      <label className="chart-scrubber" htmlFor={`${id}-inspect`}>
        Année observée{" "}
        <output>
          {selected} an{selected > 1 ? "s" : ""}
        </output>
        <input
          id={`${id}-inspect`}
          aria-label="Année observée"
          aria-valuetext={`${selected} ans`}
          type="range"
          min="0"
          max={years}
          value={selected}
          onChange={(e) => setInspected(Number(e.target.value))}
        />
      </label>
      <div className="projection-legend">
        <span>
          <i />
          Capital et versements : {money(capital(selected))}
        </span>
        <span>
          <i />
          Gains hypothétiques : {money(projected(selected) - capital(selected))}
        </span>
      </div>
      <div className="projection-controls">
        <fieldset>
          <legend>Horizon</legend>
          <div className="segmented">
            {[1, 5, 10].map((n) => (
              <button
                key={n}
                aria-pressed={years === n}
                className={years === n ? "selected" : ""}
                onClick={() => chooseYear(n)}
              >
                {n} an{n > 1 ? "s" : ""}
              </button>
            ))}
          </div>
          <label className="horizon-free">
            Horizon libre : {years} ans
            <input
              type="range"
              min="1"
              max="30"
              value={years}
              onChange={(e) => chooseYear(Number(e.target.value))}
            />
          </label>
        </fieldset>
        <label>
          Hypothèse annuelle <span>{rate.toLocaleString("fr-FR")} %</span>
          <input
            type="range"
            min="0"
            max={Math.max(8, target / 100)}
            step="0.5"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
        <label>
          Versement mensuel envisagé
          <div className="amount-input">
            <input
              type="number"
              min="0"
              max="100000"
              step="10"
              value={monthly}
              onChange={(e) =>
                setMonthly(
                  Math.max(0, Math.min(100000, Number(e.target.value) || 0)),
                )
              }
            />
            <span>demoUSD</span>
          </div>
        </label>
      </div>
      <p className="assumption">
        Cette simulation ne modifie ni votre mandat ni vos fonds. Capitalisation
        annuelle, versements regroupés en fin d’année, sans frais ni fiscalité.
        Le taux choisi est une hypothèse, pas un rendement acquis.
      </p>
    </section>
  );
}
