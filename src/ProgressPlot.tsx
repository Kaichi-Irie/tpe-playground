import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { comparisonAxis, comparisonFloor, comparisonTrialAxis } from "./comparison";
import { getSampler, type SamplerId } from "./samplers";
import { useChartTypeScale } from "./usePlotSize";

type Series = readonly (number | null)[];

export function ProgressPlot({ title, definition, tpe, random, third, currentLabel, currentSampler = "tpe" }: {
  title: string;
  definition: string;
  tpe: Series;
  random: Series;
  third?: { label: string; values: Series };
  currentLabel: string;
  currentSampler?: SamplerId;
}) {
  const sampler = getSampler(currentSampler);
  const id = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const typeScale = useChartTypeScale(svgRef);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const height = Math.max(third ? 240 : 280, Math.min(420, width / 1.8));
  const plot = { left: 62 * typeScale, right: width - 20 * typeScale, top: 24 * typeScale, bottom: height - 52 * typeScale };
  const centerX = (plot.left + plot.right) / 2;
  const step = tpe.length;
  const trialAxis = comparisonTrialAxis(step);
  const trialX = (trial: number) => plot.left + (trial - 1) / (trialAxis.upper - 1) * (plot.right - plot.left);
  const randomLabel = third ? "Random" : "Random search";
  const series = [
    { name: "random", label: randomLabel, values: random, radius: 5 },
    ...(third ? [{ name: "third", ...third, radius: 4 }] : []),
    { name: "tpe", label: currentLabel, values: tpe, radius: 3 },
  ];
  const displayedValues = series.flatMap(({ values }) => values);
  const hasInfeasiblePrefix = displayedValues.includes(null);
  const finiteValues = displayedValues.filter((value) => value !== null);
  const smallestPositive = Math.min(...finiteValues.filter((value) => value > 0));
  const lowerExponent = Math.floor(Math.log10(smallestPositive));
  // Reserve a lower decade for zero when there is room above the log floor.
  const floor = Number.isFinite(smallestPositive)
    ? Math.max(comparisonFloor, 10 ** (lowerExponent - Number(finiteValues.includes(0))))
    : comparisonFloor;
  const axis = comparisonAxis(Math.max(floor, ...finiteValues), floor);
  const finiteTop = plot.top + (hasInfeasiblePrefix ? 22 * typeScale : 0);
  const scaleY = (value: number | null) => value === null
    ? plot.top
    : plot.bottom - axis.normalize(value) * (plot.bottom - finiteTop);
  const clipsLowValues = finiteValues.some((value) => value < floor);
  const yTicks = [
    ...(hasInfeasiblePrefix ? [{ value: null, label: "∞" }] : []),
    ...(hasInfeasiblePrefix && !finiteValues.length ? [] : axis.ticks.map((value, index) => ({
      value,
      label: `${index === 0 && clipsLowValues ? "≤ " : ""}${value.toExponential(0)}`,
    }))),
  ];
  const staircase = (values: Series) => values.map((value, index) => {
    const x = trialX(index + 1).toFixed(2), y = scaleY(value).toFixed(2);
    return index === 0 ? `M${x},${y}` : `H${x} V${y}`;
  }).join(" ");
  return <section className="progress-panel" data-sampler={sampler.id} style={{ "--comparison-current": `var(${sampler.colorToken})` } as CSSProperties} aria-label={title}>
    <div className={third ? "comparison-values constrained-values" : "comparison-values"}>
      {[...series].reverse().map(({ name, label }) => <span key={name} className={`comparison-${name}`}><i aria-hidden="true" />{label}</span>)}
      {!third && <span className="comparison-direction">Lower is better ↓</span>}
    </div>
    <div className="comparison-chart" ref={chartRef}><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{`${title}: ${third ? [currentLabel, third.label, randomLabel].join(", ") : `${currentLabel} versus ${randomLabel}`}`}</title>
      <desc id={`${id}-description`}>{definition} Shown through trial {step} on a logarithmic vertical axis. {hasInfeasiblePrefix ? "∞ marks trials before each run found its first feasible point. " : ""}The horizontal axis spans trials 1 to {trialAxis.upper} and adjusts in blocks of 10. {currentLabel} is solid {sampler.colorName}. {third && `${third.label} is dotted purple. `}{randomLabel} is dashed orange.</desc>
      {yTicks.map(({ value, label }) => <g key={label}>
        <line className="grid" x1={plot.left} x2={plot.right} y1={scaleY(value)} y2={scaleY(value)} />
        <text x={plot.left - 10 * typeScale} y={scaleY(value) + 4 * typeScale} textAnchor="end">{label}</text>
      </g>)}
      {trialAxis.ticks.map((trial) => <text key={trial} x={trialX(trial)} y={height - 30 * typeScale} textAnchor="middle">{trial}</text>)}
      <text x={centerX} y={height - 8 * typeScale} textAnchor="middle" className="axis-title">Evaluations</text>
      {step === 0 ? <text x={centerX} y={(plot.top + plot.bottom) / 2} textAnchor="middle"><tspan x={centerX}>Play or step forward</tspan><tspan x={centerX} dy={18 * typeScale}>to compare progress.</tspan></text> : <>
        <line className="comparison-cursor" x1={trialX(step)} x2={trialX(step)} y1={plot.top} y2={plot.bottom} />
        {series.map(({ name, values }) => values.length > 0 && <path key={name} d={staircase(values)} className={`${name}-progress-line`} />)}
        {series.map(({ name, values, radius }) => {
          const value = values[step - 1];
          return value === undefined ? null : <circle key={name} cx={trialX(step)} cy={scaleY(value)} r={radius} className={`${name}-progress-point`} />;
        })}
      </>}
    </svg></div>
  </section>;
}
