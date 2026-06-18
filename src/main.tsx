import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

function redirectLocalhostToLoopback() {
  if (window.location.hostname !== "localhost") return false;

  const { protocol, port, pathname, search, hash } = window.location;
  const canonicalUrl = `${protocol}//127.0.0.1${port ? `:${port}` : ""}${pathname}${search}${hash}`;
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
