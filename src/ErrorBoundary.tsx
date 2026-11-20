import { Component, type ReactNode } from "react";
import { playPageHrefs } from "./shareSearch";

export function ErrorFallback({ error }: { error: Error }) {
  return (
    <section className="workspace error-panel" aria-labelledby="error-heading">
      <h2 id="error-heading" role="alert">Something went wrong</h2>
      <div className="error-actions">
        <button type="button" className="resample" onClick={() => window.location.reload()}>Reload</button>
        <a href={playPageHrefs["play-2d"]}>Back to Play 2D</a>
      </div>
      <details>
        <summary>Error details</summary>
        <p>{error.message}</p>
      </details>
    </section>
  );
}

type Props = { children: ReactNode; routeKey: string; onError: () => void };
type State = { error: Error | null; routeKey: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, routeKey: this.props.routeKey };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps({ routeKey }: Props, state: State): State | null {
    // Reset recovery on navigation without remounting healthy children such as the Lab.
    return routeKey === state.routeKey ? null : { error: null, routeKey };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.error ? <ErrorFallback error={this.state.error} /> : this.props.children;
  }
}
