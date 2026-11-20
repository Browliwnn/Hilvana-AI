import { lazy, Suspense } from 'react';
import { usePath, Link } from './lib/router';
import { AuthProvider } from './lib/session';
import Landing from './pages/Landing';
import Auth from './pages/Auth';

// El chat (con Markdown), la cuenta y los textos legales se cargan solo cuando se visitan.
const Chat = lazy(() => import('./pages/Chat'));
const Account = lazy(() => import('./pages/Account'));
const Legal = lazy(() => import('./pages/Legal'));
import { Logo } from './components/Logo';
import { ErrorBoundary } from './components/ErrorBoundary';

function Router() {
  const p = usePath().replace(/\/+$/, '') || '/';
  switch (p) {
    case '/': return <Landing />;
    case '/entrar': return <Auth mode="login" />;
    case '/registro': return <Auth mode="register" />;
    case '/recuperar': return <Auth mode="forgot" />;
    case '/restablecer': return <Auth mode="reset" />;
    case '/app': return <Chat />;
    case '/cuenta': return <Account />;
    case '/privacidad': return <Legal kind="privacidad" />;
    case '/terminos': return <Legal kind="terminos" />;
    case '/cookies': return <Legal kind="cookies" />;
    default:
      return (
        <div className="auth-wrap"><div className="auth-card">
          <Logo /><h1>Aquí no hay hilo</h1><p>Esa página no existe.</p>
          <Link to="/" className="btn btn-thread">Volver al inicio</Link>
        </div></div>
      );
  }
}

export default function App() {
  return <ErrorBoundary><AuthProvider><Suspense fallback={<div className="boot">Cargando…</div>}><Router /></Suspense></AuthProvider></ErrorBoundary>;
}
