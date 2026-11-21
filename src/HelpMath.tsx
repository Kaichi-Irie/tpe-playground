import { lazy, Suspense } from "react";

// KaTeX loads with the first formula so the main bundle stays small.
const KatexMath = lazy(() => import("./KatexMath"));

export function HelpMath({ tex }: { tex: string }) {
  return <Suspense fallback={<span className="help-math" />}><KatexMath tex={tex} /></Suspense>;
}
