import { AlertOctagon } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary caught", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="panel mx-auto mt-16 max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-critical/30 bg-critical/10 text-critical-ink">
          <AlertOctagon className="size-6" />
        </div>
        <h2 className="text-lg font-semibold text-ink">This view failed to render</h2>
        <p className="mt-2 text-sm text-ink-2">An unexpected error occurred. Reload the page or navigate elsewhere; the rest of the application is unaffected.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-surface-3 px-4 py-2 text-sm text-ink hover:bg-[#223250]">
          Reload page
        </button>
      </div>
    );
  }
}
