import { app } from '../functions/api/[[route]]';

export default {
  fetch: (req: Request, env: any, ctx: ExecutionContext) => app.fetch(req, env, ctx),
};
