import { useEffect, type ReactNode } from 'react';
import { Link } from '../lib/router';
import { Logo } from '../components/Logo';
import { LEGAL } from '../config';
import { PLANS } from '../../shared/plans';

type Kind = 'privacidad' | 'terminos' | 'cookies';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} · Hilvana AI`; }, [title]);
  return (
    <div className="page">
      <header className="l-nav"><Link to="/"><Logo /></Link></header>
      <article className="page-body prose">
        <h1>{title}</h1>
        <p className="draft">Borrador de partida. Completa los datos marcados con corchetes en <code>src/config.ts</code> y haz que un profesional lo revise antes de publicar.</p>
        {children}
        <p className="fine left">Última actualización: octubre de 2026.</p>
      </article>
    </div>
  );
}

export default function Legal({ kind }: { kind: Kind }) {
  if (kind === 'privacidad') return (
    <Shell title="Política de privacidad">
      <h2>Responsable</h2>
      <p>{LEGAL.holder} ({LEGAL.taxId}), {LEGAL.address}. Contacto: {LEGAL.email}.</p>
      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Cuenta: correo electrónico y contraseña (cifrada; nunca la vemos).</li>
        <li>Contenido: tus mensajes, las respuestas y las imágenes que creas, para mostrarte tu historial.</li>
        <li>Audios, fotos y PDF que envías: se procesan para transcribirlos o leerlos y responderte; no los almacenamos.</li>
        <li>Uso: contadores diarios para aplicar los límites de tu plan.</li>
        <li>Pago: lo gestiona Stripe; no almacenamos datos de tarjeta.</li>
      </ul>
      <h2>Para qué y con qué base</h2>
      <p>Prestarte el servicio y cobrarlo (ejecución del contrato), protegerlo frente a abusos (interés legítimo) y cumplir obligaciones fiscales (obligación legal).</p>
      <h2>Con quién lo compartimos</h2>
      <p>Proveedores que actúan en nuestro nombre: OpenAI (generación de respuestas, transcripción de audio, lectura de fotos y PDF y creación de imágenes; tu contenido se le envía para atender tu petición), Supabase (base de datos, almacenamiento de imágenes y autenticación), Cloudflare (alojamiento) y Stripe (pagos). Algunos pueden tratar datos fuera del EEE con garantías adecuadas (cláusulas contractuales tipo).</p>
      <h2>Conservación</h2>
      <p>Mientras tengas cuenta. Al eliminarla borramos tus conversaciones y datos de cuenta; los de facturación se conservan el plazo legal.</p>
      <h2>Tus derechos</h2>
      <p>Acceso, rectificación, supresión, portabilidad, oposición y limitación. Puedes descargar tus datos y eliminar tu cuenta desde <Link to="/cuenta">Mi cuenta</Link>, o escribirnos. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>
      <h2>Menores</h2>
      <p>Hilvana AI no está dirigida a menores de 16 años.</p>
    </Shell>
  );

  if (kind === 'terminos') return (
    <Shell title="Condiciones de uso">
      <h2>El servicio</h2>
      <p>Hilvana AI es un asistente de respuestas basado en inteligencia artificial. Las respuestas pueden contener errores y no sustituyen el consejo de un profesional médico, jurídico o financiero.</p>
      <h2>Uso aceptable</h2>
      <p>No puedes usar Hilvana AI para actividades ilegales, para dañar a otras personas, para generar contenido que explote a menores, ni para automatizar o revender el acceso sin permiso.</p>
      <h2>Límites y uso razonable</h2>
      <p>Cada plan tiene topes diarios (mensajes: Gratis {PLANS.free.limits.messagesPerDay}, Plus {PLANS.plus.limits.messagesPerDay}, Pro {PLANS.pro.limits.messagesPerDay}; también se limitan fotos y PDF, audios e imágenes creadas), que se reinician a medianoche (hora de Madrid). Podemos limitar o suspender cuentas con uso abusivo.</p>
      <h2>Planes y pagos</h2>
      <p>Las suscripciones se renuevan cada mes hasta que las canceles desde Mi cuenta. La cancelación surte efecto al final del periodo ya pagado. Si compras como consumidor en la UE, dispones del derecho de desistimiento de 14 días salvo que hayas pedido el inicio inmediato del servicio digital, en cuyo caso se aplicará la excepción legal correspondiente. Los precios incluyen impuestos cuando proceda.</p>
      <h2>Tu contenido</h2>
      <p>Tu contenido es tuyo, incluidas las imágenes que crees (siempre que respeten la ley y las normas de uso). Las imágenes generadas con IA pueden no ser únicas y no garantizamos que estén libres de derechos de terceros. Nos concedes permiso solo para procesarlo y mostrártelo. Eres responsable de lo que envías.</p>
      <h2>Responsabilidad</h2>
      <p>El servicio se ofrece "tal cual", sin garantía de disponibilidad continua ni de exactitud de las respuestas, dentro de lo que permita la ley.</p>
      <h2>Contacto</h2>
      <p>{LEGAL.holder} · {LEGAL.email}</p>
    </Shell>
  );

  return (
    <Shell title="Política de cookies">
      <p>Hilvana AI solo usa almacenamiento técnico imprescindible: el que mantiene tu sesión iniciada. No usamos cookies de publicidad ni de analítica, por lo que no mostramos banner de consentimiento. Si en el futuro añadimos analítica, pediremos tu permiso antes.</p>
      <p>Stripe puede usar sus propias cookies técnicas en su página de pago para prevenir fraude.</p>
    </Shell>
  );
}
