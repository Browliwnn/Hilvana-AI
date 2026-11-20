import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/session';
import { deleteAccount, exportData, getMe, getProfile, openPortal, saveProfile, startCheckout, type Me } from '../lib/api';
import { ThemeToggle } from '../components/ThemeToggle';
import { Link, navigate } from '../lib/router';
import { Logo } from '../components/Logo';
import { PlanCards } from '../components/PlanCards';
import { PLANS, fmtTokens, type Interval, type PlanId } from '../../shared/plans';
import { SUPPORT_EMAIL } from '../config';

export default function Account() {
  const { session, loading } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [name, setName] = useState('');
  const [instr, setInstr] = useState('');
  const [saving, setSaving] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  useEffect(() => { document.title = 'Mi cuenta · Hilvana AI'; }, []);
  useEffect(() => { if (!loading && !session) navigate('/entrar', true); }, [loading, session]);
  useEffect(() => {
    if (!session) return;
    const q = new URLSearchParams(location.search).get('pago');
    if (q === 'ok') setNote({ kind: 'ok', text: 'Pago recibido. Tu plan se activa en unos segundos.' });
    if (q === 'cancelado') setNote({ kind: 'err', text: 'Pago cancelado. No se ha cobrado nada.' });
    getMe().then(setMe).catch((e) => setNote({ kind: 'err', text: e.message }));
    getProfile().then((p) => { setName(p.displayName); setInstr(p.instructions); }).catch(() => {});
    // El webhook puede tardar un instante: reintenta tras un pago correcto.
    if (q === 'ok') { const t = setTimeout(() => getMe().then(setMe).catch(() => {}), 4000); return () => clearTimeout(t); }
  }, [session]);

  async function choose(p: PlanId, interval: Interval) {
    if (p === 'free') return me?.plan !== 'free' ? manage() : navigate('/app');
    setBusy(p); setNote(null);
    try { location.href = (await startCheckout(p as 'plus' | 'pro', interval)).url; }
    catch (e: any) { setNote({ kind: 'err', text: e.message }); setBusy(null); }
  }

  useEffect(() => {
    if (!me) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem('hv-intent'); if (raw) localStorage.removeItem('hv-intent'); } catch { /* sin almacenamiento */ }
    if (!raw || me.plan !== 'free') return;
    try { const i = JSON.parse(raw); if (i.plan === 'plus' || i.plan === 'pro') choose(i.plan, i.interval === 'month' ? 'month' : 'year'); } catch { /* intención corrupta */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function manage() {
    try { location.href = (await openPortal()).url; }
    catch (e: any) { setNote({ kind: 'err', text: e.message }); }
  }

  async function saveProf() {
    setSaving(true);
    try { await saveProfile({ displayName: name, instructions: instr }); setNote({ kind: 'ok', text: 'Preferencias guardadas.' }); }
    catch (e: any) { setNote({ kind: 'err', text: e.message }); }
    setSaving(false);
  }

  async function changePass() {
    if (newPass.length < 8) return setNote({ kind: 'err', text: 'La contraseña debe tener al menos 8 caracteres.' });
    setPassBusy(true);
    const { error } = (await supabase?.auth.updateUser({ password: newPass })) ?? { error: new Error('Sin conexión con el servidor de sesiones.') };
    setPassBusy(false);
    if (error) return setNote({ kind: 'err', text: /same|different/i.test(error.message) ? 'La nueva contraseña debe ser distinta de la actual.' : /reauth|recent/i.test(error.message) ? 'Por seguridad, cierra sesión, vuelve a entrar y repite el cambio.' : error.message });
    setNewPass(''); setNote({ kind: 'ok', text: 'Contraseña actualizada.' });
  }

  async function download() {
    try {
      const data = await exportData();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = 'hilvana-mis-datos.json';
      a.click();
    } catch (e: any) { setNote({ kind: 'err', text: e.message }); }
  }

  async function wipe() {
    const w = prompt('Esto elimina tu cuenta, tus conversaciones y cancela tu suscripción. No se puede deshacer.\n\nEscribe ELIMINAR para confirmar.');
    if (w !== 'ELIMINAR') return;
    try { await deleteAccount(); await supabase?.auth.signOut(); navigate('/', true); }
    catch (e: any) { setNote({ kind: 'err', text: e.message }); }
  }

  if (loading || !session) return <div className="boot">Cargando…</div>;
  const end = me?.subscription?.currentPeriodEnd ? new Date(me.subscription.currentPeriodEnd).toLocaleDateString('es-ES', { dateStyle: 'long' }) : null;

  return (
    <div className="page">
      <header className="l-nav"><Link to="/"><Logo /></Link><nav><Link to="/app" className="btn btn-ghost btn-sm">← Volver al chat</Link></nav></header>
      <div className="page-body">
        <h1>Mi cuenta</h1>
        {note && <p className={`notice ${note.kind === 'ok' ? 'ok' : 'err'}`} role="status">{note.text}</p>}

        <section className="card">
          <h2>Sesión</h2>
          <p>{me?.email ?? session.user.email}</p>
          <button className="btn btn-ghost" onClick={async () => { await supabase?.auth.signOut(); navigate('/', true); }}>Cerrar sesión</button>
        </section>

        <section className="card">
          <h2>Plan actual: {me ? PLANS[me.plan].name : '…'}</h2>
          {me && (
            <div className="usage-grid">
              <div className="usage-wide"><div className="meter-row"><span>Presupuesto de IA · este mes</span><b>{fmtTokens(me.tokens.month)} / {fmtTokens(me.tokens.limit)} tokens</b></div>
                <div className="meter-bar"><i style={{ width: Math.min(100, (me.tokens.month / me.tokens.limit) * 100) + '%' }} /></div>
                <div className="meter-sub">Un token son unas ¾ de palabra; una conversación normal gasta entre 1 k y 3 k. El modo Profundo cuenta triple.</div></div>
              {([
                ['Mensajes', me.usage.messages, me.limits.messagesPerDay, me.month.messages, me.limits.messagesPerMonth],
                ['Búsquedas web', me.usage.searches, me.limits.searchesPerDay, me.month.searches, me.limits.searchesPerMonth],
                ['Modo Profundo', me.usage.deep, me.limits.deepPerDay, 0, 0],
                ['Fotos y PDF leídos', me.usage.images, me.limits.imagesReadPerDay, 0, 0],
                ['Imágenes creadas', me.usage.generations, me.limits.imageGenPerDay, me.month.generations, me.limits.imageGenPerMonth],
                ['Audios', me.usage.audios, me.limits.audioPerDay, me.month.audios, me.limits.audioPerMonth],
              ] as Array<[string, number, number, number, number]>).filter(([, , b]) => b > 0).map(([l, a, b, ma, mb]) => (
                <div key={l}><div className="meter-row"><span>{l} · hoy</span><b>{a}/{b}</b></div><div className="meter-bar"><i style={{ width: Math.min(100, (a / b) * 100) + '%' }} /></div>
                  {mb > 0 && <div className="meter-sub">Este mes: {ma}/{mb}</div>}</div>
              ))}
            </div>
          )}
          <p className="fine left">Los contadores diarios se reinician a medianoche (hora de Madrid) y los mensuales el día 1.</p>
          {me?.subscription && me.plan !== 'free' && (
            <p>{me.subscription.cancelAtPeriodEnd ? `Se cancelará el ${end}.` : `Próxima renovación: ${end}.`}</p>
          )}
          {me && me.plan !== 'free' && <button className="btn btn-ghost" onClick={manage}>Gestionar suscripción y facturas</button>}
        </section>

        {me && (
          <section>
            <h2 className="plans-h">{me.plan === 'free' ? 'Elige tu plan' : 'Cambiar de plan'}</h2>
            <PlanCards current={me.plan} busy={busy} onChoose={choose}
              cta={(id, cur) => cur ? 'Tu plan' : me.plan !== 'free' ? 'Cambiar en el portal' : id === 'free' ? 'Seguir gratis' : `Pasar a ${PLANS[id].name}`} />
          </section>
        )}

        <section className="card form-card">
          <h2>Personaliza tus respuestas</h2>
          <p>Hilvana AI tendrá esto en cuenta en todas tus conversaciones.</p>
          <label>Cómo quieres que te llame<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" /></label>
          <label>Instrucciones personalizadas <small>{instr.length}/800</small>
            <textarea value={instr} maxLength={800} rows={4} onChange={(e) => setInstr(e.target.value)} placeholder="Ej.: Soy autónomo en España. Prefiero respuestas breves y con ejemplos prácticos." /></label>
          <button className="btn btn-thread" onClick={saveProf} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </section>

        <section className="card form-card">
          <h2>Seguridad</h2>
          <label>Nueva contraseña <small>mínimo 8 caracteres</small>
            <input type="password" autoComplete="new-password" minLength={8} value={newPass} onChange={(e) => setNewPass(e.target.value)} /></label>
          <button className="btn btn-ghost" onClick={changePass} disabled={passBusy || newPass.length < 8}>{passBusy ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </section>

        <section className="card">
          <h2>Apariencia</h2>
          <div className="row"><ThemeToggle /><span className="fine left">Claro, oscuro o automático.</span></div>
        </section>

        <section className="card">
          <h2>Tus datos</h2>
          <p>Puedes descargar todo lo que guardamos o eliminar tu cuenta cuando quieras.</p>
          <div className="row">
            <button className="btn btn-ghost" onClick={download}>Descargar mis datos</button>
            <button className="btn btn-danger" onClick={wipe}>Eliminar mi cuenta</button>
          </div>
          <p className="fine left">¿Dudas? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        </section>
      </div>
    </div>
  );
}
