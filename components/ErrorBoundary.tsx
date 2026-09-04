"use client";

import React, { ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-screen w-screen items-center justify-center bg-[#03070d]">
            <div className="hud-panel hud-clip max-w-md border border-red-500/50 p-6 text-center">
              <h1 className="text-sm tracking-[0.3em] text-red-400">CRITICAL ERROR</h1>
              <p className="mt-4 text-xs text-red-300/80">The core encountered an unrecoverable error.</p>
              <p className="mt-2 font-mono text-[10px] text-red-500/70">
                {this.state.error?.message || "Unknown error"}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs tracking-[0.2em] text-red-300 hover:bg-red-500/20"
              >
                RESTART
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
