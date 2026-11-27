export interface PlotLayerItem<Key extends string = string> {
  readonly key: Key;
  readonly label: string;
  readonly short: string;
  readonly title?: string;
  readonly ariaLabel?: string;
  readonly guideTarget?: boolean;
  readonly describedBy?: string;
}

type PlotLegendProps<Key extends string> = {
  items: readonly PlotLayerItem<Key>[];
  visible: Readonly<Record<Key, boolean>>;
  ariaLabel: string;
  className?: string;
  onToggle: (key: Key) => void;
};

export function PlotLegend<Key extends string>({ items, visible, ariaLabel, className, onToggle }: PlotLegendProps<Key>) {
  return <div className={className ? `legend ${className}` : "legend"} aria-label={ariaLabel}>
    {items.map((item) => <button key={item.key} type="button" className={`layer ${item.key}`}
      aria-pressed={visible[item.key]} aria-label={item.ariaLabel} title={item.title}
      data-guide-target={item.guideTarget || undefined} aria-describedby={item.describedBy}
      onClick={() => onToggle(item.key)}>
      <span className="swatch" />
      <span className="layer-label">{item.label}</span>
      <span className="layer-short" aria-hidden="true">{item.short}</span>
    </button>)}
  </div>;
}
