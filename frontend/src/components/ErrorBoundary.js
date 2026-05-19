import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h3>Something went wrong</h3>
          <p>This panel hit an unexpected error.</p>
          <button
            type="button"
            className="error-boundary-reload"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
          {this.state.error && (
            <details>
              <summary>Error details</summary>
              <pre>{String(this.state.error.message || this.state.error)}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
