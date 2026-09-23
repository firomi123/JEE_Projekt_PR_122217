import type { Request, RequestHandler, Response } from 'express';
import type { Metrics } from '../lib/metrics.js';

/**
 * Returns the route template of a handled request, e.g. `/api/documents/:id`.
 *
 * Templates (not raw URLs) keep the number of label values small; a label per
 * document id would grow the metric without bound. Requests that matched no route
 * get `unmatched`.
 *
 * @param req - Request after it has been handled.
 * @param res - Its response (carries the router's mount path).
 * @returns The template, or `unmatched`.
 */
function routeTemplate(req: Request, res: Response): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof path !== 'string') return 'unmatched';
  // Express has already restored req.baseUrl; routers created with createRouter()
  // remember their mount path in res.locals.
  const mountPath = typeof res.locals.mountPath === 'string' ? res.locals.mountPath : req.baseUrl;
  const full = `${mountPath}${path === '/' ? '' : path}`;
  return full || '/';
}

/**
 * Creates middleware that records every finished request in `http_requests_total`
 * and `http_request_duration_seconds` (labels: method, route template, status code).
 *
 * @param metrics - Application metrics.
 * @returns Express middleware; register it before the routes.
 */
export function httpMetrics(metrics: Metrics): RequestHandler {
  return (req, res, next) => {
    const stopTimer = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const labels = {
        method: req.method,
        route: routeTemplate(req, res),
        status_code: String(res.statusCode),
      };
      metrics.httpRequests.inc(labels);
      stopTimer(labels);
    });
    next();
  };
}
