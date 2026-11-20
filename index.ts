import { app } from '../functions/api/[[route]]';

// Cloudflare Workers (Workers Builds → `npx wrangler deploy`): /api/* lo atiende este Worker;
// el resto lo sirve la web estática (SPA) desde ./dist.
export default {
  fetch: (req: Request, env: any, ctx: ExecutionContext) => app.fetch(req, env, ctx),
};
