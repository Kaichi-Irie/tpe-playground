import { useEffect, useId, useRef, useState } from "react";
import { comparisonAxis, comparisonFloor, comparisonTrialAxis } from "./comparison";
import { useChartTypeScale } from "./usePlotSize";

export function ProgressPlot({ title, definition, tpe, random, floor = comparisonFloor }: {
  title: string;
  definition: string;
  tpe: readonly number[];
  random: readonly number[];
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
  const height = Math.max(280, Math.min(420, width / 1.8));
  const plot = { left: 62 * typeScale, right: width - 20 * typeScale, top: 24 * typeScale, bottom: height - 52 * typeScale };
  const centerX = (plot.left + plot.right) / 2;
  const step = tpe.length;
  const trialAxis = comparisonTrialAxis(step);
  const trialX = (trial: number) => plot.left + (trial - 1) / (trialAxis.upper - 1) * (plot.right - plot.left);
  const axis = comparisonAxis(Math.max(floor, ...tpe, ...random), floor);
  const scaleY = (value: number) => plot.bottom - axis.normalize(value) * (plot.bottom - plot.top);
  const staircase = (values: readonly number[]) => values.map((value, index) => index === 0
    ? `M${trialX(1).toFixed(2)},${scaleY(value).toFixed(2)}`
    : `H${trialX(index + 1).toFixed(2)} V${scaleY(value).toFixed(2)}`).join(" ");
  return <section className="progress-panel" aria-label={title}>
    <div className="comparison-values">
      <span className="comparison-tpe"><i aria-hidden="true" />TPE</span>
      <span className="comparison-random"><i aria-hidden="true" />Random search</span>
      <span className="comparison-direction">Lower is better ↓</span>
    </div>
    <div className="comparison-chart" ref={chartRef}><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{title}: TPE versus Random search</title>
      <desc id={`${id}-description`}>{definition} Shown through trial {step} on a logarithmic vertical axis. The horizontal axis spans trials 1 to {trialAxis.upper} and adjusts in blocks of 10. TPE is solid blue; Random search is dashed orange.</desc>
      {axis.ticks.map((value, index) => <g key={index}>
        <line className="grid" x1={plot.left} x2={plot.right} y1={scaleY(value)} y2={scaleY(value)} />
        <text x={plot.left - 10 * typeScale} y={scaleY(value) + 4 * typeScale} textAnchor="end">{`${index === 0 ? "≤ " : ""}${value.toExponential(0)}`}</text>
      </g>)}
      {trialAxis.ticks.map((trial) => <text key={trial} x={trialX(trial)} y={height - 30 * typeScale} textAnchor="middle">{trial}</text>)}
      <text x={centerX} y={height - 8 * typeScale} textAnchor="middle" className="axis-title">Evaluations</text>
      {step === 0 ? <text x={centerX} y={(plot.top + plot.bottom) / 2} textAnchor="middle"><tspan x={centerX}>Play or step forward</tspan><tspan x={centerX} dy={18 * typeScale}>to compare progress.</tspan></text> : <>
        <line className="comparison-cursor" x1={trialX(step)} x2={trialX(step)} y1={plot.top} y2={plot.bottom} />
        <path d={staircase(random)} className="random-progress-line" />
        <path d={staircase(tpe)} className="tpe-progress-line" />
        <circle cx={trialX(step)} cy={scaleY(random[step - 1])} r="5" className="random-progress-point" />
        <circle cx={trialX(step)} cy={scaleY(tpe[step - 1])} r="3" className="tpe-progress-point" />
      </>}
    </svg></div>
  </section>;
}
