import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/session';
import { Link, navigate } from '../lib/router';
import { Logo } from '../components/Logo';
import { OAUTH, isNative } from '../config';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const TITLES: Record<Mode, string> = {
  login: 'Bienvenido de vuelta',
  register: 'Crea tu cuenta',
  forgot: 'Recupera tu acceso',
  reset: 'Elige una contraseña nueva',
};

export default function Auth({ mode }: { mode: Mode }) {
  const { session, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const pl = q.get('plan');
    if (pl === 'plus' || pl === 'pro') { try { localStorage.setItem('hv-intent', JSON.stringify({ plan: pl, interval: q.get('interval') === 'month' ? 'month' : 'year' })); } catch { /* sin almacenamiento */ } }
  }, []);
  const hasIntent = () => { try { return !!localStorage.getItem('hv-intent'); } catch { return false; } };
  useEffect(() => { if (session && mode !== 'reset') navigate(hasIntent() ? '/cuenta' : '/app', true); }, [session, mode]);

  const origin = isNative() ? 'https://localhost' : location.origin;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setMsg(null);
    if (mode === 'register') {
      if (pass.length < 8) return setMsg({ kind: 'err', text: 'La contraseña debe tener al menos 8 caracteres.' });
      if (!accept) return setMsg({ kind: 'err', text: 'Debes aceptar las condiciones y la política de privacidad.' });
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: origin + (hasIntent() ? '/cuenta' : '/app') } });
        if (error) throw error;
        if (!data.session) setMsg({ kind: 'ok', text: 'Te hemos enviado un correo para confirmar tu cuenta. Revisa también el spam.' });
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/restablecer' });
        if (error) throw error;
        setMsg({ kind: 'ok', text: 'Si el correo existe, recibirás un enlace para restablecer la contraseña.' });
      } else {
        if (pass.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        const { error } = await supabase.auth.updateUser({ password: pass });
        if (error) throw error;
        navigate('/app', true);
      }
    } catch (err: any) {
      const m = String(err?.message || '');
      setMsg({
        kind: 'err',
        text: /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.'
          : /already registered/i.test(m) ? 'Ese correo ya tiene cuenta. Prueba a entrar.'
          : /not confirmed/i.test(m) ? 'Confirma primero tu correo (te lo enviamos al registrarte).'
          : /rate limit/i.test(m) ? 'Demasiados intentos. Espera unos minutos.'
          : m || 'Algo ha fallado. Inténtalo de nuevo.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: 'google' | 'apple') {
    await supabase?.auth.signInWithOAuth({ provider, options: { redirectTo: origin + '/app' } });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link to="/"><Logo /></Link>
        <h1>{TITLES[mode]}</h1>
        {!configured && <p className="notice err">Falta configurar Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).</p>}

        {(mode === 'login' || mode === 'register') && OAUTH.length > 0 && (
          <>
            <div className="oauth">{OAUTH.map((p) => <button key={p} type="button" className="btn btn-ghost" onClick={() => oauth(p)}>Continuar con {p === 'google' ? 'Google' : 'Apple'}</button>)}</div>
            <div className="or"><span>o con tu correo</span></div>
          </>
        )}

        <form onSubmit={submit}>
          {mode !== 'reset' && (
            <label>Correo
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <label>{mode === 'reset' ? 'Contraseña nueva' : 'Contraseña'}
              <input type="password" required minLength={mode === 'login' ? undefined : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pass} onChange={(e) => setPass(e.target.value)} />
            </label>
          )}
          {mode === 'register' && (
            <label className="check">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>Acepto las <Link to="/terminos">condiciones</Link> y la <Link to="/privacidad">política de privacidad</Link>.</span>
            </label>
          )}
          {msg && <p className={`notice ${msg.kind}`} role="alert">{msg.text}</p>}
          <button className="btn btn-thread btn-block" disabled={busy || !configured}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace' : 'Guardar contraseña'}
          </button>
        </form>

        <p className="auth-alt">
          {mode === 'login' && <><Link to="/recuperar">¿Olvidaste la contraseña?</Link><br />¿Sin cuenta? <Link to="/registro">Regístrate</Link></>}
          {mode === 'register' && <>¿Ya tienes cuenta? <Link to="/entrar">Entra</Link></>}
          {mode === 'forgot' && <Link to="/entrar">Volver a entrar</Link>}
        </p>
      </div>
    </div>
  );
}
