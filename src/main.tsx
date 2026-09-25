import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./chat-greeting.css";
import "./interaction-polish.css";

type ErrorBoundaryState = { error: Error | null };
class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("Yellow render error", error, info); }
  render() {
    if (this.state.error) return <main className="app-fallback"><div><span className="modal-mark">Y</span><h1>Yellow needs a refresh</h1><p>The demo could not render this screen. Your saved conversations are still in this browser.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload app</button></div></main>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>,
);
