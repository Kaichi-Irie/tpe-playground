import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { reloadAfterChunkError } from "./chunkReload";
import { readRoute } from "./shareSearch";
import "./style.css";

const initialRoute = readRoute(window.location.hash);

window.addEventListener("vite:preloadError", () => {
  try {
    reloadAfterChunkError(window.sessionStorage, () => window.location.reload());
  } catch { /* Accessing sessionStorage itself can throw. */ }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialRoute={initialRoute} />
  </StrictMode>,
);
