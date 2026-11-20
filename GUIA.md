# Guía paso a paso: de este ZIP a Hilvana AI en producción

Orden recomendado. Cada paso es copiar y pegar. Marca lo que vayas haciendo.

> **Importante:** el código está probado con 40 tests contra simulaciones de Supabase, OpenAI y Stripe, pero **no contra los servicios reales**. Los nombres de modelos y los precios de OpenAI cambian: compruébalos en https://platform.openai.com/docs/models y en tu panel antes de lanzar.

---

## 0. Cuentas que necesitas
| Servicio | Para qué | Coste |
|---|---|---|
| OpenAI (platform.openai.com) | Respuestas, fotos, audio, imágenes | Pago por uso |
| Supabase | Login, base de datos, imágenes | Gratis para empezar |
| Stripe | Cobros | % por cobro |
| Cloudflare | Hosting + API + dominio | Gratis para empezar |
| GitHub | Código | Gratis |
| Apple Developer / Google Play | Apps | 99 $/año · 25 $ único |

---

## 1. Probar en local
```bash
cd hilvana
npm install
npm test            # deben pasar todos los tests
cp .dev.vars.example .dev.vars
cp .env.example .env
```

## 2. OpenAI
1. Crea una API key → pégala en `.dev.vars` como `OPENAI_API_KEY`.
2. **Billing → Limits:** pon un tope mensual duro (p. ej. 30 €) y una alerta al 50 %. Es tu seguro contra sustos.
3. Mira en *Models* qué modelos tienes. Si alguno de los de `.dev.vars` no existe, cámbialo (no hay que tocar código; además hay fallback automático).

## 3. Supabase
1. New project → guarda la contraseña.
2. SQL Editor → pega todo `supabase/schema.sql` → Run. (Es idempotente: si ya lo ejecutaste antes, **vuelve a ejecutarlo**: se han endurecido las políticas de seguridad.)
3. Settings → API: copia `Project URL` y `anon key` a `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y `Project URL` + `service_role key` a `.dev.vars` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). **La service_role nunca va en `.env` ni en el frontend.**
4. Authentication → URL Configuration: Site URL `https://TUDOMINIO.com`; Redirect URLs: `https://TUDOMINIO.com/**` y `https://localhost/**` (para la app móvil).
5. Authentication → Email: deja activada la confirmación de correo. Opcional: SMTP propio (Resend, Brevo) para que los correos no caigan en spam.
6. Storage: comprueba que existe el bucket privado `generated`.

## 4. Stripe (en modo test primero)
1. Products → crea **Plus** y **Pro**, cada uno con dos precios recurrentes en EUR:
   - Plus: 9,99 €/mes y 99 €/año
   - Pro: 24,99 €/mes y 249 €/año
2. Copia los 4 `price_...` a `.dev.vars`: `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_PRO_YEARLY`.
3. Developers → API keys → `STRIPE_SECRET_KEY` (sk_test_...).
4. Settings → Billing → Customer portal: activa cancelar y cambiar de plan; añade los 4 precios.
5. Local, webhook:
```bash
stripe listen --forward-to localhost:8788/api/billing/webhook
```
   Copia el `whsec_...` a `STRIPE_WEBHOOK_SECRET`.
6. Si vendes a consumidores de la UE, activa **Stripe Tax** y pon `STRIPE_AUTOMATIC_TAX=1`.

## 5. Arrancar y probar
```bash
npm run dev      # http://localhost:8788
```
Checklist: registro → confirmar correo → chat → foto → audio → imagen → pago con `4242 4242 4242 4242` → ver plan Plus en Mi cuenta → cancelar en el portal → exportar datos → borrar cuenta.

## 6. GitHub
```bash
git init && git add . && git commit -m "Hilvana AI"
gh repo create hilvana --private --source=. --push
```

## 7. Cloudflare Pages
1. Workers & Pages → Create → Pages → Connect to Git → elige el repo.
2. Build command `npm run build`, output `dist`.
3. **Variables de build:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL=https://TUDOMINIO.com`, `VITE_OAUTH_PROVIDERS` (vacío o `google,apple`).
4. **Secrets:** `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, los 4 `STRIPE_PRICE_*`.
5. **Variables:** `APP_URL=https://TUDOMINIO.com`, `OPENAI_MODEL_FREE`, `OPENAI_MODEL_PAID`, `OPENAI_MODEL_DEEP`, `OPENAI_MODEL_FALLBACK`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_MODEL_FALLBACK`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TRANSCRIBE_MODEL_FALLBACK`, `STRIPE_AUTOMATIC_TAX`.
6. Deploy y abre `https://TU-PROYECTO.pages.dev/api/health`: todo debe salir `true`.

> `npm run build` ejecuta los tests; si fallan, Cloudflare no publica. Es intencionado.

> **Plan de Cloudflare:** para producción usa **Workers Paid (5 $/mes)**. El plan gratuito limita la CPU a 10 ms por petición y puede cortar respuestas largas o la creación de imágenes. Las variables se ponen en el panel (no en `wrangler.toml`, que a propósito no las contiene).

## 8. Dominio
1. Cloudflare → Registrar (o tu registrador) → compra el dominio.
2. Pages → Custom domains → añádelo.
3. Actualiza `APP_URL`, `VITE_SITE_URL`, la Site URL de Supabase y el webhook de Stripe a `https://TUDOMINIO.com/api/billing/webhook`.
4. Redeploy.

## 9. Pasar Stripe a real
1. Activa tu cuenta Stripe (datos fiscales y bancarios).
2. Repite los productos/precios en modo live, cambia `STRIPE_SECRET_KEY`, los `price_...` y crea un webhook live con estos eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Haz un pago real de prueba con tu tarjeta y reembólsalo.

## 10. Protección extra
- Ya incluidas en `public/_headers`: CSP, HSTS y permiso de micrófono. Si añades un servicio externo (analítica, otro dominio de API), añádelo a `connect-src`.
- Cloudflare → Security → WAF → Rate limiting: regla sobre `/api/chat` (p. ej. 30 peticiones/min por IP).
- Cloudflare Turnstile en el registro si ves cuentas falsas.
- Revisa el tope de OpenAI cada semana el primer mes.

## 11. Marca y datos legales
- Rellena `src/config.ts` (titular, NIF, dirección, email).
- Busca "Hilvana AI" en EUIPO, TMview, OEPM y WIPO (clases 9, 35, 42). Esto no es asesoría legal: consulta a un profesional antes de invertir en marca.
- Revisa privacidad/términos/cookies con un abogado.
- Logos en `brand/`, iconos en `public/`.

## 12. Apps iOS y Android
```bash
# 1) capacitor.config.ts: cambia appId (p. ej. com.tuempresa.hilvana)
# 2) .env: VITE_API_BASE=https://TUDOMINIO.com
npx cap add ios && npx cap add android
npm run cap:sync
npm run cap:ios        # Mac + Xcode
npm run cap:android    # Android Studio
```
Permisos:
- iOS `Info.plist`: `NSMicrophoneUsageDescription` (y cámara/fotos si las usas).
- Android `AndroidManifest.xml`: `<uses-permission android:name="android.permission.RECORD_AUDIO" />`.

Reglas de tienda:
- **Pagos:** Apple/Google exigen compra in-app para suscripciones digitales dentro de la app. Opciones: RevenueCat, o mostrar solo login y gestionar el pago en la web. Revisa las reglas vigentes de tu región.
- **Sign in with Apple** obligatorio si ofreces Google en iOS.
- Borrado de cuenta in-app: ya incluido.
- Necesitas capturas, descripción, URL de privacidad (`/privacidad`) y soporte.

---

## Presupuesto de tokens (v1.1)
Cada plan tiene un presupuesto mensual de tokens de IA (`tokensPerMonth` en `shared/plans.ts`: Gratis 100 k, Plus 2 M, Pro 6 M; el modo Profundo cuenta x3). Se mide con el consumo real que informa OpenAI y se ve en Mi cuenta. **Ajusta esas cifras con los precios reales de tu panel** para que cada plan deje margen (cobro − comisión de Stripe − coste de IA, búsquedas, imágenes y audio). Requiere volver a ejecutar `schema.sql` (añade la función `add_tokens`).

## Costes aproximados (verifícalos)
Datos de terceros, no confirmados por mí: gpt-6-luna ≈ 0,10/0,50 $ por 1M tokens (entrada/salida), gpt-6.1-terra ≈ 1/5 $, gpt-6.1-sol ≈ 2/10 $, transcripción ≈ 0,0045 $/min, búsqueda web ≈ 10 $/1000 llamadas, imagen ≈ 0,03–0,05 $ (estimado). Con los límites de `shared/plans.ts` el peor caso por usuario está acotado, pero **calcula tu margen con los precios reales de tu panel** y ajusta límites en ese fichero.

## Si algo falla
- `/api/health` con algún `false` → falta esa variable en Cloudflare.
- Error del motor de IA → revisa nombres de modelo y saldo en OpenAI.
- Pago hecho pero plan sin cambiar → revisa el webhook en Stripe (Events → intentos) y `STRIPE_WEBHOOK_SECRET`.
