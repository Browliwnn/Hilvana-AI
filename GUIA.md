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
npm run dev      # web en http://localhost:5173 (la API corre en :8788 y se enlaza sola)
```
Checklist: registro → confirmar correo → chat → foto → audio → imagen → pago con `4242 4242 4242 4242` → ver plan Plus en Mi cuenta → cancelar en el portal → exportar datos → borrar cuenta.

## 6. GitHub
```bash
git init && git add . && git commit -m "Hilvana AI"
gh repo create hilvana --private --source=. --push
```

## 7. Cloudflare (Worker con web estática)
El proyecto se despliega como **un Worker con assets** (la API en `/api/*` y la web desde `dist`). Es lo que hace `npx wrangler deploy`.
1. Workers & Pages → Create → **Import a repository** → elige el repo.
2. Pon el **nombre del proyecto igual al `name` de `wrangler.toml`** (por defecto `hilvana`; si usas otro, cámbialo en `wrangler.toml`).
3. Build command `npm run build` · Deploy command `npx wrangler deploy` (déjalo como viene).
4. **Variables de BUILD** (Settings → Build → Variables and secrets) — imprescindibles, sin ellas la web sale sin login:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL=https://TUDOMINIO.com`, `VITE_OAUTH_PROVIDERS` (vacío o `google,apple`).
   > Señal de que faltan: en el log del build aparece `supabase-xxxx.js 0.00 kB`. Debe pesar ~200 kB.
5. **Variables y secretos del Worker** (Settings → Variables and secrets, *no* las de build):
   - Secretos: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_PRO_YEARLY`.
   - Variables: `APP_URL=https://TUDOMINIO.com` y, si quieres cambiar de modelo, las `OPENAI_MODEL_*` (opcionales: ya traen el mejor modelo por defecto).
   - `wrangler.toml` lleva `keep_vars = true`, así que los despliegues no las borran.
6. Despliega y abre `https://TU-WORKER.TU-SUBDOMINIO.workers.dev/api/health`: todo debe salir `true`.

> `npm run build` ejecuta los tests; si fallan, no se publica. Es intencionado.
> Usa el plan **Workers Paid (5 $/mes)** en producción: el gratuito limita la CPU a 10 ms por petición y puede cortar respuestas largas o la creación de imágenes.

## 8. Dominio
1. Compra el dominio (Cloudflare Registrar u otro) y añade el sitio a Cloudflare.
2. Worker → Settings → Domains & Routes → Add → **Custom domain** → `tudominio.com`.
3. Actualiza `APP_URL`, `VITE_SITE_URL`, la Site URL de Supabase y el webhook de Stripe a `https://TUDOMINIO.com/api/billing/webhook`.
4. Vuelve a desplegar (Deployments → Retry, o un commit nuevo).

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

## Modelos de IA y presupuesto de tokens (v1.2)
Por defecto **todas** las respuestas usan el modelo más potente de OpenAI (`gpt-6.2-astra`, verificado en la documentación de OpenAI el 20-nov-2026: 8 $ entrada / 40 $ salida por millón de tokens). Respaldo automático: `gpt-6.2-sol`. Imágenes: `gpt-image-2.6-sunburst` (respaldo `gpt-image-2.5-sunburst`). Voz: `gpt-transcribe`. Títulos y sugerencias usan `gpt-6-luna` (`OPENAI_MODEL_LIGHT`) porque son tareas mínimas. Todo se cambia con variables, sin tocar código.

Como Astra es caro, cada plan tiene un **presupuesto mensual de tokens** (`tokensPerMonth` en `shared/plans.ts`): Gratis 40 k, Plus 250 k, Pro 700 k (≈ 15, 100 y 280 mensajes de uso normal; estimación mía de unos 2.500 tokens por mensaje). Se mide con el consumo real que informa OpenAI, ponderado por el precio del modelo usado: si pones `OPENAI_MODEL_PAID=gpt-6.2-sol` en Cloudflare, los mismos tokens rinden 4 veces más. Se ve en Mi cuenta. Requiere volver a ejecutar `schema.sql` (función `add_tokens`).

Cuentas rápidas (comprueba precios en tu panel): un mensaje normal en Astra cuesta ≈ 0,05 $; el presupuesto Plus ≈ 5 $ y el Pro ≈ 14 $ en el peor caso, antes de búsquedas web (10 $/1000), imágenes y audio. Si quieres más mensajes por el mismo precio, usa `gpt-6.2-sol` en Gratis/Plus y deja Astra para Pro y modo Profundo.

## Costes aproximados (verifícalos)
Precios de OpenAI leídos el 20-nov-2026: gpt-6.2-astra 8/40 $, gpt-6.2-sol 2/10 $, gpt-6.1-terra 1/5 $, gpt-6-luna 0,10/0,50 $ por millón de tokens (entrada/salida). Transcripción y precio por imagen: no publicados en esa página; mira tu panel. Calcula tu margen (cobro − IVA − comisión de Stripe − coste de IA) y ajusta límites en `shared/plans.ts`.

## Si algo falla
- `/api/health` con algún `false` → falta esa variable en Cloudflare.
- Error del motor de IA → revisa nombres de modelo y saldo en OpenAI.
- Pago hecho pero plan sin cambiar → revisa el webhook en Stripe (Events → intentos) y `STRIPE_WEBHOOK_SECRET`.
