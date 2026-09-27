import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./chat-greeting.css";
import "./interaction-polish.css";
import "./connection-status.css";
import "./account-settings.css";

type ErrorBoundaryState = { error: Error | null };
class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("Lureva render error", error, info); }
  render() {
    if (this.state.error) return <main className="app-fallback"><div><span className="modal-mark">L</span><h1>Lureva needs a refresh</h1><p>The demo could not render this screen. Your saved conversations are still in this browser.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload app</button></div></main>;
    return this.props.children;
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root mount element");
const root = ReactDOM.createRoot(container);
root.render(
  <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>,
);

// Keep the entrypoint safe when Vite re-evaluates it during development.
if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount());
}
