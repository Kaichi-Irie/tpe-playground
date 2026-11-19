import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import StepExplanation, { JourneyMath, LabTutorialButton, Range, kernelFormula, kernelFormulaCompact } from "./StepExplanation";
import { labHints } from "./labHints";

it("opens with an experiment and keeps the lesson hidden until requested", () => {
  const html = renderToStaticMarkup(<StepExplanation />);
  expect(html).toContain("Simulated Python terminal");
  expect(html).toContain("Command: python tpe.py");
  expect(html).toContain('>Skip</button>');
  expect(html).not.toContain("Skip to the decision");
  expect(html).toContain("0 completed observations");
  expect(html).toMatch(/<section hidden=""[^>]*aria-label="Interactive TPE walkthrough"/);
  expect(html).not.toContain("Starting automatically");
  expect(html).not.toContain("Run TPESampler");
});

it("offers a button to replay the Lab tutorial", () => {
  const html = renderToStaticMarkup(<LabTutorialButton onReplay={() => {}} />);
  expect(html).toMatch(/<button[^>]*aria-label="Replay the Lab tutorial"[^>]*title="Replay the Lab tutorial"[^>]*>.*?<span>Tutorial<\/span><\/button>/s);
  expect(html).not.toContain("Show Lab hints again");
});

it("links the slider to its name and renders its hint meaning as reference info", () => {
  const html = renderToStaticMarkup(<Range name="Good fraction" symbol="γ" hint="gamma" infoDisabled={false} value={0.2} min={0.1} max={0.9} step={0.1} onChange={() => {}} />);
  expect(html).toMatch(/<label for="([^"]+)">Good fraction <i>γ<\/i><\/label>.*<input[^>]*id="\1"[^>]*type="range"/);
  expect(html).not.toMatch(/<input[^>]*aria-label/);
  expect(html).toMatch(/<button[^>]*aria-label="About Good fraction"[^>]*>ⓘ<\/button>/);
  expect(html.match(/role="tooltip"[^>]*>([^<]+)<\/span>/)?.[1]).toBe(labHints.gamma.meaning);
});

it("typesets fractions and scripts as KaTeX with accessible MathML", () => {
  const html = renderToStaticMarkup(<JourneyMath tex={String.raw`x_{\mathrm{next}}=\underset{x_j}{\arg\max}\frac{\ell(x_j)}{g(x_j)}`} />);
  expect(html).toContain('class="katex"');
  expect(html).toContain("<math");
  expect(html).toContain("<mfrac>");
  expect(html).not.toContain("katex-error");
});

it.each([kernelFormula, kernelFormulaCompact])("typesets the kernel formula with highlighted bandwidth (%s)", (tex) => {
  const html = renderToStaticMarkup(<JourneyMath tex={tex} />);
  expect(html).toContain("<math");
  expect(html).toContain("journey-accent");
  expect(html).not.toContain("katex-error");
});

it("keeps the wide kernel formula on one line and uses an inline exponent on phones", () => {
  expect(kernelFormula).not.toContain(String.raw`\\`);
  expect(kernelFormulaCompact).toContain(String.raw`\\`);
  expect(kernelFormulaCompact).toContain("e^");
  expect(kernelFormulaCompact).not.toContain(String.raw`\exp`);
});
