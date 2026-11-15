import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import StepExplanation, { JourneyMath, kernelFormula } from "./StepExplanation";

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

it("typesets fractions and scripts as KaTeX with accessible MathML", () => {
  const html = renderToStaticMarkup(<JourneyMath tex={String.raw`x_{\mathrm{next}}=\underset{x_j}{\arg\max}\frac{\ell(x_j)}{g(x_j)}`} />);
  expect(html).toContain('class="katex"');
  expect(html).toContain("<math");
  expect(html).toContain("<mfrac>");
  expect(html).not.toContain("katex-error");
});

it("renders the kernel formula with its annotated bandwidth subscript", () => {
  const html = renderToStaticMarkup(<JourneyMath tex={kernelFormula} />);
  expect(html).toContain("<math");
  expect(html).toContain("journey-accent");
});
