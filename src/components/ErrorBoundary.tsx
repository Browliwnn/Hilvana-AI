import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error(e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="auth-wrap"><div className="auth-card">
        <h1>Algo ha fallado</h1>
        <p>Ha ocurrido un error inesperado. Tus conversaciones están a salvo.</p>
        <button className="btn btn-thread" onClick={() => location.assign('/app')}>Recargar</button>
      </div></div>
    );
  }
}
