import { useEffect } from "react";

const reloadKey = "tpe-chunk-reload";

export function reloadAfterChunkError(storage: Pick<Storage, "getItem" | "setItem">, reload: () => void) {
  try {
    if (storage.getItem(reloadKey) !== null) return;
    storage.setItem(reloadKey, "1");
  } catch {
    // Without a durable guard the boundary offers a manual reload.
    return;
  }
  reload();
}

// Mount only after the active route renders, including any lazy content.
export function ChunkLoadComplete() {
  useEffect(() => {
    function clearReloadFlag() {
      try { window.sessionStorage.removeItem(reloadKey); } catch { /* Storage can be blocked. */ }
    }

    if (document.readyState === "complete") {
      clearReloadFlag();
      return;
    }

    window.addEventListener("load", clearReloadFlag, { once: true });
    return () => window.removeEventListener("load", clearReloadFlag);
  }, []);

  return null;
}
