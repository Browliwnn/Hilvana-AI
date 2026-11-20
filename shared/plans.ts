// Fuente única de verdad de planes y límites (la usan la web y la API).
// Los números están calculados con precios de OpenAI de octubre de 2026 (ver GUIA.md, sección "Costes").
// Revísalos contra tu factura real tras el primer mes y ajusta aquí.
export type PlanId = 'free' | 'plus' | 'pro';
export type Interval = 'month' | 'year';

export interface PlanLimits {
  // Límites diarios (se reinician a medianoche, hora de Madrid)
  messagesPerDay: number;
  searchesPerDay: number;
  imagesReadPerDay: number; // fotos y PDF que Hilvana lee/analiza
  imageGenPerDay: number; // imágenes que Hilvana crea
  audioPerDay: number; // audios transcritos
  deepPerDay: number; // mensajes en modo Profundo
  // Topes mensuales de lo más caro (se reinician el día 1)
  messagesPerMonth: number;
  searchesPerMonth: number;
  imageGenPerMonth: number;
  audioPerMonth: number;
  // Por petición
  imagesPerMessage: number;
  imageQuality: 'low' | 'medium' | 'high';
  audioMaxMB: number;
  audioMaxSeconds: number; // tope de grabación en el micrófono
  maxInputChars: number;
  contextMessages: number;
  tokensPerMonth: number; // presupuesto mensual de IA (tokens de entrada+salida; el modo Profundo cuenta x3)
  contextChars: number; // tope de caracteres del historial que se reenvía al modelo
  maxOutputTokens: number;
  deepMode: boolean;
}

export interface PlanInfo {
  id: PlanId;
  name: string;
  priceMonthEur: number;
  priceYearEur: number; // 0 = sin plan anual
  tagline: string;
  limits: PlanLimits;
  perks: string[];
}

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Gratis',
    priceMonthEur: 0,
    priceYearEur: 0,
    tagline: 'Para probar el hilo sin compromiso.',
    limits: {
      messagesPerDay: 10, searchesPerDay: 2, imagesReadPerDay: 3, imageGenPerDay: 1, audioPerDay: 3, deepPerDay: 0,
      messagesPerMonth: 250, searchesPerMonth: 40, imageGenPerMonth: 15, audioPerMonth: 40,
      imagesPerMessage: 1, imageQuality: 'low', audioMaxMB: 3, audioMaxSeconds: 60,
      maxInputChars: 4000, contextMessages: 10, tokensPerMonth: 100_000, contextChars: 24000, maxOutputTokens: 900, deepMode: false,
    },
    perks: ['10 mensajes al día', '2 búsquedas web con fuentes al día', '3 fotos o PDF leídos al día', '1 imagen creada al día', '3 audios al día (hasta 1 min)', '100.000 tokens de IA al mes', 'Historial de conversaciones'],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    priceMonthEur: 9.99,
    priceYearEur: 99,
    tagline: 'Para usarlo a diario, de verdad.',
    limits: {
      messagesPerDay: 120, searchesPerDay: 15, imagesReadPerDay: 30, imageGenPerDay: 6, audioPerDay: 20, deepPerDay: 15,
      messagesPerMonth: 2000, searchesPerMonth: 200, imageGenPerMonth: 80, audioPerMonth: 300,
      imagesPerMessage: 3, imageQuality: 'medium', audioMaxMB: 10, audioMaxSeconds: 300,
      maxInputChars: 12000, contextMessages: 30, tokensPerMonth: 2_000_000, contextChars: 80000, maxOutputTokens: 2500, deepMode: true,
    },
    perks: ['120 mensajes al día', '15 búsquedas web al día', '30 fotos o PDF leídos (3 por mensaje)', '80 imágenes creadas al mes en calidad alta', '20 audios al día (hasta 5 min)', '2 millones de tokens de IA al mes', '15 consultas al día en modo Profundo'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthEur: 24.99,
    priceYearEur: 249,
    tagline: 'Para trabajo intenso y textos largos.',
    limits: {
      messagesPerDay: 400, searchesPerDay: 50, imagesReadPerDay: 120, imageGenPerDay: 20, audioPerDay: 60, deepPerDay: 60,
      messagesPerMonth: 8000, searchesPerMonth: 800, imageGenPerMonth: 300, audioPerMonth: 400,
      imagesPerMessage: 5, imageQuality: 'medium', audioMaxMB: 24, audioMaxSeconds: 600,
      maxInputChars: 30000, contextMessages: 60, tokensPerMonth: 6_000_000, contextChars: 200000, maxOutputTokens: 4000, deepMode: true,
    },
    perks: ['400 mensajes al día', '50 búsquedas web al día', '120 fotos o PDF leídos (5 por mensaje)', '300 imágenes creadas al mes', '60 audios al día (hasta 10 min)', '6 millones de tokens de IA al mes', '60 consultas al día en modo Profundo', 'Contexto largo y soporte prioritario'],
  },
};

export const priceOf = (p: PlanInfo, interval: Interval): number => (interval === 'year' && p.priceYearEur ? p.priceYearEur : p.priceMonthEur);
export const yearSavingEur = (p: PlanInfo): number => (p.priceYearEur ? Math.round(p.priceMonthEur * 12 - p.priceYearEur) : 0);

export const MAX_IMAGE_BYTES = 3_500_000; // por foto, tras redimensionar en el cliente
export const IMAGE_SHAPES = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' } as const;
export type ImageShape = keyof typeof IMAGE_SHAPES;

// Estilos de respuesta: ajustan el enfoque de la IA sin cambiar de modelo ni de cuota.
export const STYLES = {
  general: { label: 'General', hint: 'Equilibrado para cualquier tema' },
  code: { label: 'Programar', hint: 'Código completo, depuración y buenas prácticas' },
  write: { label: 'Escribir', hint: 'Correos, mensajes y textos listos para enviar' },
  study: { label: 'Estudiar', hint: 'Explica paso a paso y comprueba que lo entiendes' },
  business: { label: 'Negocio', hint: 'Ventas, marketing y decisiones con números' },
} as const;
export type StyleId = keyof typeof STYLES;

// Un token son unas 3/4 de palabra. Una conversación normal gasta entre 1.000 y 3.000.
export const TOKEN_DEEP_WEIGHT = 3;
export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
