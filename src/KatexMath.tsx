import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export default function KatexMath({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: false }), [tex]);
  return <span className="help-math" dangerouslySetInnerHTML={{ __html: html }} />;
}
