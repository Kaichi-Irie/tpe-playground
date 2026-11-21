import { lazy, Suspense } from "react";

// KaTeX loads with the first formula so the main bundle stays small.
const KatexMath = lazy(() => import("./KatexMath"));

/** A display formula, or with `inline`, a symbol or short expression inside a sentence. */
export function HelpMath({ tex, inline = false }: { tex: string; inline?: boolean }) {
  const className = inline ? "help-math-inline" : "help-math";
  return <Suspense fallback={<span className={className} />}><KatexMath tex={tex} inline={inline} /></Suspense>;
}
