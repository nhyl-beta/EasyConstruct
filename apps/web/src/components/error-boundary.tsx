import { Component, type ReactNode } from "react";

/** Shows a message instead of a blank page when a screen crashes while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ui] a page crashed while rendering", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong on this page</h1>
        <p className="text-sm text-muted-foreground">Your data is safe. Reload the page to continue.</p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
