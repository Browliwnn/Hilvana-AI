import { useEffect, useState } from 'react';
import { Brain, Globe, ImagePlus, MessageSquareText, Mic, Palette, ShieldCheck } from 'lucide-react';
import { Link, navigate } from '../lib/router';
import { useAuth } from '../lib/session';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { PlanCards } from '../components/PlanCards';
import { PLANS, fmtTokens, type Interval, type PlanId } from '../../shared/plans';

const IDS: PlanId[] = ['free', 'plus', 'pro'];
const n = (x: number) => x.toLocaleString('es-ES');
const mins = (s: number) => `${Math.round(s / 60)} min`;

const TABS = ['Texto', 'Foto', 'Voz', 'Imagen'] as const;
type Tab = (typeof TABS)[number];

function Showcase() {
  const [tab, setTab] = useState<Tab>('Texto');
  return (
    <figure className="specimen" aria-label="Ejemplos de uso">
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Texto' && <div className="sp-body">
        <div className="sp-q"><span>Tú</span>¿Puedo reclamar si mi vuelo se retrasa 4 horas?</div>
        <div className="sp-a"><span>Hilvana AI</span>
          <p><strong>Probablemente sí.</strong> En la UE, con más de 3 horas de retraso a la llegada y causa imputable a la aerolínea, suele corresponder una compensación de 250 a 600 €.</p>
          <p className="sp-doubt">No lo sé con certeza: si hubo circunstancias extraordinarias (meteorología, huelga de control aéreo) la aerolínea puede quedar exenta.</p>
          <p className="sp-src">Fuentes · Reglamento (CE) 261/2004</p></div>
      </div>}
      {tab === 'Foto' && <div className="sp-body">
        <div className="sp-q"><span>Tú · foto adjunta</span>
          <div className="sp-photo" aria-hidden="true"><b>Menú del día</b><i>Ensalada mixta · 6,50 €</i><i>Paella valenciana · 12,00 €</i><i>Flan casero · 3,50 €</i></div>
          ¿Cuánto me costaría paella y flan?</div>
        <div className="sp-a"><span>Hilvana AI</span>
          <p>Según la carta de la foto: paella valenciana <strong>12,00 €</strong> + flan casero <strong>3,50 €</strong> = <strong>15,50 €</strong>.</p>
          <p className="sp-doubt">La foto no muestra si el IVA o la bebida están incluidos; conviene confirmarlo al pedir.</p></div>
      </div>}
      {tab === 'Voz' && <div className="sp-body">
        <div className="sp-q"><span>Tú · audio de 0:24</span>
          <div className="wave" aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ height: 6 + ((i * 37) % 22) }} />)}</div>
          <em className="sp-trans">«Tengo una reunión el jueves y necesito un resumen de tres puntos para mi jefe sobre el cierre del trimestre…»</em></div>
        <div className="sp-a"><span>Hilvana AI</span>
          <p>He transcrito tu audio y lo puedes editar antes de enviar. Aquí tienes el borrador:</p>
          <p>1. Resultados frente al objetivo · 2. Desviaciones principales · 3. Prioridades del próximo trimestre.</p></div>
      </div>}
      {tab === 'Imagen' && <div className="sp-body">
        <div className="sp-q"><span>Tú · Crear imagen</span>🎨 Un faro al amanecer, acuarela, tonos cálidos</div>
        <div className="sp-a"><span>Hilvana AI</span>
          <svg className="sp-art" viewBox="0 0 320 170" role="img" aria-label="Ilustración de ejemplo: faro al amanecer">
            <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4B98A" /><stop offset="1" stopColor="#F9E3C5" /></linearGradient></defs>
            <rect width="320" height="170" fill="url(#sky)" />
            <circle cx="236" cy="104" r="30" fill="#E4572E" opacity=".85" />
            <path d="M0 128c40-10 70 6 110-2s90-10 130 0 60 4 80-2v46H0z" fill="#3B4A7A" opacity=".85" />
            <path d="M92 130l10-62h16l10 62z" fill="#FBF8F1" /><path d="M99 98h22v10H98zM95 120h30v10H92z" fill="#C6431F" />
            <path d="M96 68h28l-6-14h-16z" fill="#1B2340" /><circle cx="110" cy="62" r="4" fill="#F4B98A" />
          </svg>
          <p className="sp-src">Ilustración de ejemplo · Las imágenes creadas se marcan como "creadas con IA".</p></div>
      </div>}
    </figure>
  );
}

const FEATURES = [
  { i: MessageSquareText, t: 'Respuestas con criterio', d: 'La conclusión primero y el detalle después. Razona cálculos y código, y señala sus supuestos.' },
  { i: Globe, t: 'Búsqueda web con fuentes', d: 'Para lo que cambia (precios, leyes, noticias) cita enlaces que puedes abrir y comprobar.' },
  { i: ImagePlus, t: 'Lee fotos y PDF', d: 'Menús, facturas, contratos, capturas, apuntes… Describe, transcribe, resume y responde a tu pregunta sobre el documento.' },
  { i: Mic, t: 'Escucha tus audios', d: 'Dicta con el micrófono o sube un audio. Lo transcribe y puedes corregirlo antes de enviarlo.' },
  { i: Palette, t: 'Crea imágenes', d: 'Descríbelas en lenguaje natural, elige formato cuadrado, vertical u horizontal y descárgalas.' },
  { i: Brain, t: 'Modo Profundo', d: 'Para problemas difíciles: dedica más razonamiento y verifica antes de contestar (Plus y Pro).' },
];

const FAQ: Array<[string, string]> = [
  ['¿Se equivoca la IA?', 'Sí, puede equivocarse. Hilvana AI está instruida para admitir la duda y para no inventar datos, pero conviene verificar lo importante, sobre todo en salud, leyes y dinero.'],
  ['¿Qué pasa con mis conversaciones?', 'Se guardan en tu cuenta para que las recuperes, y solo tú puedes verlas. Puedes borrar cada conversación (con sus imágenes) o eliminar tu cuenta entera desde "Mi cuenta". No las usamos para entrenar modelos propios.'],
  ['¿Guardáis mis audios, fotos y PDF?', 'No. Los audios solo se transcriben y las fotos y PDF solo se leen para responderte; no se almacenan. Se guardan únicamente las imágenes que tú creas, para que las veas en el historial.'],
  ['¿Qué es un token y cuántos gasto?', 'Un token es un fragmento de texto: unas ¾ de una palabra. Una conversación normal gasta entre 1.000 y 3.000 tokens. Cada plan incluye un presupuesto mensual de tokens de IA; el modo Profundo, que razona más, cuenta triple. Lo ves en Mi cuenta.'],
  ['¿Qué significan los límites diarios?', 'Cada respuesta, foto, audio o imagen tiene un coste real. Por eso hay topes por plan, visibles y fijos. Se reinician a medianoche (hora de Madrid) y, si algo falla por nuestra parte, no se descuenta.'],
  ['¿Puedo cancelar cuando quiera?', 'Sí. Desde "Mi cuenta" abres el portal de facturación y cancelas en un clic. Conservas el plan hasta el final del periodo pagado.'],
  ['¿Puedo usar las imágenes que creo?', 'Sí, son tuyas para usarlas como quieras, respetando las normas de uso y la ley. Evita pedir imágenes de personas reales sin su permiso.'],
  ['¿Habrá app para móvil?', 'Sí: el mismo servicio funciona en el navegador del móvil y está preparado para publicarse como app en iPhone y Android.'],
];

export default function Landing() {
  const { session } = useAuth();
  useEffect(() => { document.title = 'Hilvana AI · Respuestas con hilo'; }, []);
  const choose = (p: string, interval: Interval) => navigate(session ? '/cuenta' : `/registro?plan=${p}&interval=${interval}`);
  const row = (label: string, f: (id: PlanId) => string | number) => (
    <tr><td>{label}</td>{IDS.map((k) => <td key={k}>{f(k)}</td>)}</tr>
  );

  return (
    <div className="landing">
      <a href="#main" className="skip">Saltar al contenido</a>
      <header className="l-nav">
        <Link to="/"><Logo /></Link>
        <nav>
          <a href="#capacidades">Qué hace</a>
          <a href="#planes">Planes</a>
          <a href="#faq">Preguntas</a>
          <ThemeToggle />
          {session
            ? <Link to="/app" className="btn btn-thread btn-sm">Abrir Hilvana AI</Link>
            : <><Link to="/entrar" className="nav-quiet">Entrar</Link><Link to="/registro" className="btn btn-thread btn-sm">Crear cuenta</Link></>}
        </nav>
      </header>

      <main id="main">
      <section className="hero">
        <p className="kicker">Asistente de IA en español</p>
        <h1>Pregunta.<br />Hilvana AI <em>tira del hilo</em> hasta el final.</h1>
        <p className="lead">Escribe, dicta o enséñale una foto o un PDF. Responde con claridad, cita sus fuentes cuando buscas en la web, crea imágenes y te dice cuándo no está seguro.</p>
        <div className="hero-cta">
          <Link to={session ? '/app' : '/registro'} className="btn btn-thread btn-lg">Empezar gratis</Link>
          <a href="#capacidades" className="btn btn-ghost btn-lg">Ver qué puede hacer</a>
        </div>
        <p className="fine">Sin tarjeta · {PLANS.free.limits.messagesPerDay} mensajes, {PLANS.free.limits.imageGenPerDay} imágenes y {PLANS.free.limits.audioPerDay} audios gratis cada día</p>
        <ul className="trust">
          <li><ShieldCheck size={15} /> Tus conversaciones son solo tuyas</li>
          <li><ShieldCheck size={15} /> Sin publicidad</li>
          <li><ShieldCheck size={15} /> Borra tu cuenta cuando quieras</li>
        </ul>
        <Showcase />
      </section>

      <section className="l-sec" id="capacidades">
        <h2>Todo lo que necesitas, en un solo hilo</h2>
        <p className="sec-sub">Texto, voz, fotos, PDF e imágenes en la misma conversación, sin cambiar de herramienta.</p>
        <div className="features">
          {FEATURES.map(({ i: Icon, t, d }) => (
            <article key={t}><span className="f-ico"><Icon size={20} /></span><h3>{t}</h3><p>{d}</p></article>
          ))}
        </div>
      </section>

      <section className="l-sec band">
        <h2>Tres cosas que hace distinto</h2>
        <div className="trio">
          <article><span className="num">01</span><h3>Responde primero, explica después</h3><p>La conclusión va arriba. El detalle, debajo, para quien lo quiera. Sin relleno ni "¡excelente pregunta!".</p></article>
          <article><span className="num">02</span><h3>Admite la duda</h3><p>Separa lo que sabe de lo que supone y no inventa cifras, citas ni enlaces. Si no sabe, lo dice.</p></article>
          <article><span className="num">03</span><h3>Límites a la vista</h3><p>Sabes cuánto te queda cada día. Y si el motor falla, no se descuenta nada de tu cuota.</p></article>
        </div>
      </section>

      <section className="l-sec" id="planes">
        <h2>Planes sin letra pequeña</h2>
        <p className="sec-sub">Cancelas cuando quieras desde tu cuenta. Los pagos los gestiona Stripe.</p>
        <PlanCards onChoose={choose} cta={(id) => (id === 'free' ? 'Empezar gratis' : `Elegir ${PLANS[id].name}`)} />
        <h3 className="tbl-h">Los límites, a las claras</h3>
        <div className="tbl-wrap">
          <table className="limits">
            <thead><tr><th></th>{IDS.map((k) => <th key={k}>{PLANS[k].name}</th>)}</tr></thead>
            <tbody>
              {row('Tokens de IA al mes', (k) => fmtTokens(PLANS[k].limits.tokensPerMonth))}
              {row('Mensajes al día / al mes', (k) => `${n(PLANS[k].limits.messagesPerDay)} / ${n(PLANS[k].limits.messagesPerMonth)}`)}
              {row('Búsquedas web al día / al mes', (k) => `${n(PLANS[k].limits.searchesPerDay)} / ${n(PLANS[k].limits.searchesPerMonth)}`)}
              {row('Consultas en modo Profundo al día', (k) => (PLANS[k].limits.deepMode ? n(PLANS[k].limits.deepPerDay) : '—'))}
              {row('Fotos y PDF leídos al día', (k) => n(PLANS[k].limits.imagesReadPerDay))}
              {row('Fotos por mensaje', (k) => PLANS[k].limits.imagesPerMessage)}
              {row('Imágenes creadas al día / al mes', (k) => `${n(PLANS[k].limits.imageGenPerDay)} / ${n(PLANS[k].limits.imageGenPerMonth)}`)}
              {row('Calidad de imagen', (k) => ({ low: 'Estándar', medium: 'Alta', high: 'Máxima' })[PLANS[k].limits.imageQuality])}
              {row('Audios al día / al mes', (k) => `${n(PLANS[k].limits.audioPerDay)} / ${n(PLANS[k].limits.audioPerMonth)}`)}
              {row('Duración máx. de grabación', (k) => mins(PLANS[k].limits.audioMaxSeconds))}
              {row('Tamaño máx. de audio', (k) => `${PLANS[k].limits.audioMaxMB} MB`)}
              {row('Caracteres por mensaje', (k) => n(PLANS[k].limits.maxInputChars))}
            </tbody>
          </table>
        </div>
        <p className="fine">Los topes diarios se reinician a medianoche (hora de Madrid) y los mensuales el día 1. Si el servicio falla, no se descuenta tu uso.</p>
      </section>

      <section className="l-sec narrow" id="faq">
        <h2>Preguntas frecuentes</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="l-sec cta-end">
        <ShieldCheck size={26} />
        <h2>Empieza en un minuto</h2>
        <p className="sec-sub">Crea tu cuenta gratis y pregunta lo primero que se te ocurra.</p>
        <Link to={session ? '/app' : '/registro'} className="btn btn-thread btn-lg">Crear mi cuenta gratis</Link>
      </section>

      </main>

      <footer className="l-foot">
        <Logo size={24} />
        <nav>
          <Link to="/privacidad">Privacidad</Link>
          <Link to="/terminos">Condiciones</Link>
          <Link to="/cookies">Cookies</Link>
        </nav>
        <p>© {new Date().getFullYear()} Hilvana AI</p>
      </footer>
    </div>
  );
}
