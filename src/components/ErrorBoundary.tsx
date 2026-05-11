import React from 'react';

interface Props {
  children: React.ReactNode;
  /** If true, keeps surrounding chrome (sidebar/nav) intact on crash. */
  fallbackLevel?: 'page' | 'app';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Future: Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isPage = this.props.fallbackLevel === 'page';
      return (
        <div className={`flex items-center justify-center ${isPage ? 'flex-1 min-h-[60vh]' : 'min-h-screen'} bg-mist-50 p-8`}>
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-ink-100 p-8 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-xl font-bold">!</span>
            </div>
            <h2 className="font-display text-lg font-bold text-ink-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-ink-500 mb-6">
              {isPage
                ? 'This page encountered an error. Your other pages should still work.'
                : 'The application encountered an unexpected error.'}
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-ink-50 border border-ink-100 rounded-lg p-3 mb-4 overflow-auto max-h-32 text-ink-600">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 border border-ink-200 text-ink-700 rounded-lg text-sm font-medium hover:bg-ink-50"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
