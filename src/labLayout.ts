const minWidth = 900;
const minHeight = 440;

// Each scoring lane owns its title, curve, axis, and tick labels. Wide screens
// use pixel-sized coordinates; narrow screens scale the minimum logical width.
export function labLayout(measuredWidth: number, measuredHeight: number, bottomInset = 70) {
  const width = Math.max(minWidth, measuredWidth);
  const height = Math.max(minHeight, width * measuredHeight / Math.max(1, measuredWidth));
  const minimumPlotHeight = Math.max(260, Math.min(minHeight, measuredWidth * minHeight / minWidth));
  // Reserve physical pixels for axis labels, or the scoring x_next annotation.
  const bottom = height - bottomInset * width / Math.max(1, measuredWidth);
  const lane = bottom / 3;
  return { width, height, minimumPlotHeight, bottom, lane, curveHeight: lane - 64 };
}
