import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export default function KatexMath({ tex, inline = false }: { tex: string; inline?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: !inline, throwOnError: true, strict: false }), [tex, inline]);
  return <span className={inline ? "help-math-inline" : "help-math"} dangerouslySetInnerHTML={{ __html: html }} />;
}
