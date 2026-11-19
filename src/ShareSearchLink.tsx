import { useEffect, useId, useState } from "react";
import { createShareUrl, type ShareExperiment } from "./shareSearch";
import type { ModelSettings } from "./searchSettings";

type Props = {
  experiment: ShareExperiment;
  seed: number;
  settings: ModelSettings;
};

const description = "Opens this search with the current settings at trial 0.";

export function ShareSearchLink({ experiment, seed, settings }: Props) {
  const descriptionId = useId();
  const [result, setResult] = useState<{ url: string; copied: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const currentResult = result && result.url === createShareUrl(window.location.href, experiment, seed, settings) ? result : null;
  const copied = currentResult?.copied === true;
  const needsFallback = currentResult?.copied === false;

  useEffect(() => {
    if (!result?.copied) return;
    const timeout = window.setTimeout(() => setResult(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [result]);

  async function copy() {
    const url = createShareUrl(window.location.href, experiment, seed, settings);
    setResult(null);
    setCopying(true);
    try {
      await navigator.clipboard.writeText(url);
      setResult({ url, copied: true });
    } catch {
      setResult({ url, copied: false });
    } finally {
      setCopying(false);
    }
  }

  return <>
    <span id={descriptionId} className="sr-only">{description}</span>
    <span role="status" className={needsFallback ? "share-search-status" : "sr-only"}>{copied ? "Link copied. It opens this search with the current settings at trial 0." : needsFallback ? "Copy the link below." : ""}</span>
    {needsFallback && <input className="share-search-url" aria-label="Share link" type="text" readOnly value={currentResult.url} onFocus={(event) => event.currentTarget.select()} />}
    <button className="share-search-button" type="button" aria-describedby={descriptionId} title={description} disabled={copying} onClick={copy}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {copied ? <path d="m5 12 4 4L19 6" /> : <path d="M8 9H5v12h14V9h-3M12 15V3m-4 4 4-4 4 4" />}
      </svg>
      {copied ? "Link copied" : "Share link"}
    </button>
  </>;
}
