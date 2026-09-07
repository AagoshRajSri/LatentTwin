import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unexpected interface error' };
  }

  componentDidCatch(error, info) {
    console.error('[UI_ERROR]', { message: error.message, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <section className="max-w-lg rounded-lg border border-red-800 bg-red-950/30 p-6">
          <h1 className="text-xl font-semibold">The interface could not render</h1>
          <p className="mt-2 text-sm text-red-200">{this.state.message}</p>
          <button
            type="button"
            className="mt-5 rounded bg-red-700 px-4 py-2 text-sm hover:bg-red-600"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}
