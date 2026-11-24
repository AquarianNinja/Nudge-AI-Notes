import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface FirestoreErrorBoundaryProps {
  children: React.ReactNode;
}

interface FirestoreErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class FirestoreErrorBoundary extends React.Component<
  FirestoreErrorBoundaryProps,
  FirestoreErrorBoundaryState
> {
  constructor(props: FirestoreErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: ''
    };
  }

  static getDerivedStateFromError(error: Error): FirestoreErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected Firebase error occurred.'
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let parsedSummary = this.state.errorMessage;
    try {
      const parsed = JSON.parse(this.state.errorMessage) as {
        error?: string;
        operationType?: string;
        path?: string;
      };
      if (parsed?.error) {
        parsedSummary = `${parsed.error}${parsed.path ? ` (${parsed.operationType || 'op'} on ${parsed.path})` : ''}`;
      }
    } catch {
      // Plain text error
    }

    return (
      <div className="min-h-screen w-full liquid-canvas text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-3xl liquid-glass-elevated border border-white/15 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-50">Workspace Recovery</h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed break-words">
                {parsedSummary}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={this.handleReset}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0F7FFF] hover:bg-[#2B98FF] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Workspace</span>
          </button>
        </div>
      </div>
    );
  }
}
