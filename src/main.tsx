import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { consumeShare, readRoute } from "./shareSearch";
import "./style.css";

const initialRoute = readRoute(window.location.hash);
if (initialRoute.share) consumeShare(initialRoute.page);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialRoute={initialRoute} />
  </StrictMode>,
);
