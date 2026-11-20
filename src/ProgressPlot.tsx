import { useEffect, useId, useRef, useState } from "react";
import { comparisonAxis, comparisonFloor, comparisonTrialAxis } from "./comparison";
import { useChartTypeScale } from "./usePlotSize";

type Series = readonly (number | null)[];

export function ProgressPlot({ title, definition, tpe, random, third, currentLabel = "TPE", floor = comparisonFloor }: {
  title: string;
  definition: string;
  tpe: Series;
  random: Series;
  third?: { label: string; values: Series };
  currentLabel?: string;
  floor?: number;
}) {
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
  const series = [
    { name: "random", label: third ? "Random" : "Random search", values: random, radius: 5 },
    ...(third ? [{ name: "third", ...third, radius: 4 }] : []),
    { name: "tpe", label: currentLabel, values: tpe, radius: 3 },
  ];
  const axis = comparisonAxis(Math.max(floor, ...series.flatMap(({ values }) => values.map((value) => value ?? 0))), floor);
  const scaleY = (value: number) => plot.bottom - axis.normalize(value) * (plot.bottom - plot.top);
  const staircase = (values: Series) => values.flatMap((value, index) => {
    if (value === null) return [];
    const x = trialX(index + 1).toFixed(2), y = scaleY(value).toFixed(2);
    return [index === 0 || values[index - 1] === null ? `M${x},${y}` : `H${x} V${y}`];
  }).join(" ");
  return <section className="progress-panel" aria-label={title}>
    <div className={third ? "comparison-values constrained-values" : "comparison-values"}>
      {[...series].reverse().map(({ name, label }) => <span key={name} className={`comparison-${name}`}><i aria-hidden="true" />{label}</span>)}
      {!third && <span className="comparison-direction">Lower is better ↓</span>}
    </div>
    <div className="comparison-chart" ref={chartRef}><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{`${title}: ${third ? [currentLabel, third.label, "Random"].join(", ") : "TPE versus Random search"}`}</title>
      <desc id={`${id}-description`}>{definition} Shown through trial {step} on a logarithmic vertical axis. The horizontal axis spans trials 1 to {trialAxis.upper} and adjusts in blocks of 10. {third ? `${currentLabel} is solid blue. ${third.label} is dotted purple. Random is dashed orange.` : "TPE is solid blue; Random search is dashed orange."}</desc>
      {axis.ticks.map((value, index) => <g key={index}>
        <line className="grid" x1={plot.left} x2={plot.right} y1={scaleY(value)} y2={scaleY(value)} />
        <text x={plot.left - 10 * typeScale} y={scaleY(value) + 4 * typeScale} textAnchor="end">{`${index === 0 ? "≤ " : ""}${value.toExponential(0)}`}</text>
      </g>)}
      {trialAxis.ticks.map((trial) => <text key={trial} x={trialX(trial)} y={height - 30 * typeScale} textAnchor="middle">{trial}</text>)}
      <text x={centerX} y={height - 8 * typeScale} textAnchor="middle" className="axis-title">Evaluations</text>
      {step === 0 ? <text x={centerX} y={(plot.top + plot.bottom) / 2} textAnchor="middle"><tspan x={centerX}>Play or step forward</tspan><tspan x={centerX} dy={18 * typeScale}>to compare progress.</tspan></text> : <>
        <line className="comparison-cursor" x1={trialX(step)} x2={trialX(step)} y1={plot.top} y2={plot.bottom} />
        {series.map(({ name, values }) => values[step - 1] != null && <path key={name} d={staircase(values)} className={`${name}-progress-line`} />)}
        {series.map(({ name, values, radius }) => {
          const value = values[step - 1];
          return value == null ? null : <circle key={name} cx={trialX(step)} cy={scaleY(value)} r={radius} className={`${name}-progress-point`} />;
        })}
      </>}
    </svg></div>
  </section>;
}
