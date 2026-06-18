import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getCanonicalLocalhostRedirectUrl } from "./services/canonicalHost";
import "./styles.css";

function redirectLocalhostToLoopback() {
  const canonicalUrl = getCanonicalLocalhostRedirectUrl(window.location);
  if (!canonicalUrl) return false;

  window.location.replace(canonicalUrl);
  return true;
}

if (!redirectLocalhostToLoopback()) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
