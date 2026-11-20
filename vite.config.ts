import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

// VITE_SITE_URL (p. ej. https://hilvana.ai): URLs absolutas para Open Graph, sitemap y robots.
const site = (process.env.VITE_SITE_URL || '').replace(/\/$/, '');
const pages = ['/', '/privacidad', '/terminos', '/cookies'];

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-seo',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', site),
      generateBundle() {
        this.emitFile({
          type: 'asset', fileName: 'robots.txt',
          source: `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /cuenta\nDisallow: /api/\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`,
        });
        if (site) {
          this.emitFile({
            type: 'asset', fileName: 'sitemap.xml',
            source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`,
          });
        }
      },
    },
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8788' } },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Librerías estables en archivos aparte: se cachean entre despliegues.
        manualChunks: (id: string) => (id.includes('node_modules/@supabase') ? 'supabase' : /node_modules\/(react|react-dom|scheduler)\//.test(id) ? 'react' : undefined),
      },
    },
  },
});
