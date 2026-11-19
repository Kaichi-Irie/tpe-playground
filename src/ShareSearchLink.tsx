import { useId, useState } from "react";
import { createShareUrl, type ShareExperiment } from "./shareSearch";
import type { ModelSettings } from "./searchSettings";

type Props = {
  experiment: ShareExperiment;
  seed: number;
  settings: ModelSettings;
};

export function ShareSearchLink({ experiment, seed, settings }: Props) {
  const descriptionId = useId();
  const [result, setResult] = useState<{ url: string; copied: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const currentResult = result && result.url === createShareUrl(window.location.href, experiment, seed, settings) ? result : null;

  async function copy() {
    const url = createShareUrl(window.location.href, experiment, seed, settings);
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

  return <div className="share-search parameter">
    <button type="button" aria-describedby={descriptionId} disabled={copying} onClick={copy}>Copy share link</button>
    <p id={descriptionId}>Opens this search with the current settings at trial 0.</p>
    <span role="status">{currentResult?.copied === true ? "Link copied." : currentResult ? "Copy the link below." : ""}</span>
    {currentResult?.copied === false && <input aria-label="Share link" type="text" readOnly value={currentResult.url} onFocus={(event) => event.currentTarget.select()} />}
  </div>;
}
