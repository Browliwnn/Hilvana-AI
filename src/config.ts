export const BRAND = 'Hilvana AI';
// Sustituye estos datos antes de publicar (los exigen la LSSI/RGPD y las tiendas de apps).
export const SUPPORT_EMAIL = 'soporte@tu-dominio.com';
export const LEGAL = {
  holder: '[Tu nombre o razón social]',
  taxId: '[NIF/CIF]',
  address: '[Dirección postal]',
  email: SUPPORT_EMAIL,
};

export const isNative = (): boolean => !!(window as any).Capacitor?.isNativePlatform?.();

export type OAuthProvider = 'google' | 'apple';
export const OAUTH: OAuthProvider[] = String(import.meta.env.VITE_OAUTH_PROVIDERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is OAuthProvider => s === 'google' || s === 'apple');
