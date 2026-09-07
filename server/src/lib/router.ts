import express, { RequestHandler, Router } from 'express';

// Express 4 does NOT catch errors thrown from an *async* route handler: a
// rejected promise is simply not awaited, so `res` is never written and the
// request hangs until the client times out (surfacing as a generic "API
// error"). This factory returns a Router whose route-registration methods wrap
// every handler so a rejection is forwarded to the error-handling middleware in
// index.ts. Drop-in replacement for `express.Router()`.

const wrap =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const;
type Method = (typeof METHODS)[number];

export function makeRouter(): Router {
  const router = express.Router();

  for (const method of METHODS) {
    const original = router[method] as unknown as (...args: unknown[]) => unknown;
    const bound = original.bind(router);
    // Wrap only the function arguments (handlers/middleware); the path/first
    // arg is left untouched. Handles (path, handler) and (path, mw, handler).
    (router as unknown as Record<Method, unknown>)[method] = (...args: unknown[]) =>
      bound(...args.map((a) => (typeof a === 'function' ? wrap(a as RequestHandler) : a)));
  }

  return router;
}
