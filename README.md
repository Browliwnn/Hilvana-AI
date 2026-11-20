# Hilvana AI

Asistente de respuestas con IA: texto, lectura de fotos, transcripción de audio, creación de imágenes, búsqueda web con fuentes y modo Profundo. React + Vite (web) · Cloudflare Pages Functions con Hono (API) · Supabase (login y datos) · Stripe (planes) · Capacitor (iOS/Android).

Límites y precios: `shared/plans.ts` (un solo sitio). Datos legales y email: `src/config.ts`.

> Guía completa paso a paso: **GUIA.md**. Tests: `npm test` (`npm run build` los ejecuta).

## 1. Local
```bash
npm install
cp .dev.vars.example .dev.vars     # rellena claves
cp .env.example .env               # URL y anon key de Supabase
npm run dev                        # http://localhost:8788
```

## 2. Supabase
1. Crea proyecto → SQL Editor → pega `supabase/schema.sql` → Run (también crea el bucket privado `generated` para las imágenes y la tabla de uso/feedback/perfil; si ya lo ejecutaste antes, vuelve a ejecutarlo: es idempotente).
2. Authentication → URL Configuration: Site URL = tu dominio; Redirect URLs: `https://tudominio.com/**`, `https://localhost/**`.
3. (Opcional) Google/Apple en Authentication → Providers y pon `VITE_OAUTH_PROVIDERS=google,apple`.

## 3. GitHub
```bash
git init && git add . && git commit -m "Hilvana"
gh repo create hilvana --private --source=. --push
```

## 4. Cloudflare Pages
Workers & Pages → Create → Pages → conecta el repo.
- Build command: `npm run build` · Output: `dist`
- Variables de build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OAUTH_PROVIDERS`, `VITE_SITE_URL` (para sitemap y Open Graph)
- Secrets (Settings → Variables and secrets): `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (4)
- Variables: `APP_URL=https://tudominio.com`, `OPENAI_MODEL_FREE/PAID/DEEP/FALLBACK`, `OPENAI_IMAGE_MODEL(_FALLBACK)`, `OPENAI_TRANSCRIBE_MODEL(_FALLBACK)` (comprueba en OpenAI qué modelos tienes disponibles y sus precios)

## 5. Stripe
1. Productos → crea **Plus** (9,99 €/mes · 99 €/año) y **Pro** (24,99 €/mes · 249 €/año) → copia los 4 `price_...` a `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_PRO_YEARLY`.
2. Developers → Webhooks → endpoint `https://tudominio.com/api/billing/webhook`, eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → copia `whsec_...`.
3. Settings → Billing → Customer portal: activa cancelar y cambiar de plan.
4. Prueba con tarjeta `4242 4242 4242 4242` en modo test; después cambia a claves live.

## 6. Dominio
Cloudflare Pages → Custom domains → añade el dominio (si compras en Cloudflare Registrar, es automático). Actualiza `APP_URL` y las URLs de Supabase/Stripe.

## 7. App Store y Play Store (Capacitor)
```bash
# En capacitor.config.ts cambia appId (p. ej. com.tuempresa.hilvana)
# En .env pon VITE_API_BASE=https://tudominio.com
npx cap add ios && npx cap add android
npm run cap:sync
npm run cap:ios        # requiere Mac + Xcode + cuenta Apple Developer (99 $/año)
npm run cap:android    # Android Studio + cuenta Google Play (25 $ único)
```
Antes de enviar a las tiendas:
- **Pagos:** Apple y Google exigen su sistema de compra in-app para suscripciones digitales dentro de la app (Stripe en web, IAP en app). Opciones: RevenueCat, o ocultar la compra en la app y dejar solo login. Revisa las reglas vigentes (en la UE hay excepciones).
- **Sign in with Apple:** obligatorio si ofreces Google u otro login social en iOS.
- **Borrado de cuenta in-app:** ya incluido (Mi cuenta → Eliminar).
- Política de privacidad pública (`/privacidad`), icono (`public/icon-1024.png`), capturas y descripción.

## Antes de publicar (checklist)
- [ ] Registrar el nombre "Hilvana": busca en EUIPO/TMview, OEPM y WIPO (clases 9, 35, 42). Una búsqueda web no es clearance legal.
- [ ] Comprobar dominio, redes y nombre en App Store / Play Store.
- [ ] Rellenar `src/config.ts` y revisar textos legales con un profesional.
- [ ] Alertas de gasto y tope mensual en OpenAI.
- [ ] Rate limiting extra en Cloudflare (WAF → Rate limiting) sobre `/api/chat`.
- [ ] Probar: registro, confirmación de email, reset de contraseña, límite diario, pago, cancelación, borrado.

## Móvil: permisos
- iOS: en `ios/App/App/Info.plist` añade `NSMicrophoneUsageDescription` (dictado por voz) y `NSPhotoLibraryUsageDescription`/`NSCameraUsageDescription` si permites subir fotos.
- Android: en `AndroidManifest.xml` añade `<uses-permission android:name="android.permission.RECORD_AUDIO" />`.

## Marca
Logos y iconos en `brand/` (claro, oscuro, transparente, símbolo SVG y icono 1024). Los iconos de la web están en `public/`.

## Funciones del chat
Texto, voz (transcripción), fotos y **PDF** (hasta 3,5 MB cada uno; cuentan como adjuntos del plan), creación de imágenes, búsqueda web con fuentes, modo Profundo, **editar y reenviar** una pregunta, renombrar y exportar conversaciones, cambio de contraseña y borrado de cuenta.

## Estilos de respuesta
General, Programar, Escribir, Estudiar y Negocio (`STYLES` en `shared/plans.ts`, prompts en la API). Se eligen en el chat y no consumen cuota extra.

## Límites incluidos
Mensajes, búsquedas web, fotos leídas, imágenes creadas y audios por día y plan (en `shared/plans.ts`); fotos por mensaje, duración/tamaño de audio, calidad de imagen y modo Profundo por plan; tamaño máximo por mensaje; contexto máximo; tokens de salida; moderación previa; cuota atómica en base de datos y reembolso automático si falla el motor.
