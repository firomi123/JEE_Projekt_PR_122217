import type { Request, Response } from 'express';
import type { DependencyName, HealthService } from '../services/health.service.js';

/** Response body of `GET /health/ready`. */
export interface ReadinessResponseBody {
  status: 'ready' | 'not_ready';
  checks: Record<DependencyName, 'up' | 'down'>;
}

/** HTTP handlers of the health endpoints. */
export class HealthController {
  /** @param service - Performs the readiness checks. */
  constructor(private readonly service: HealthService) {}

  /**
   * `GET /health` – liveness. Responds `200 { "status": "ok" }` whenever the process
   * can serve HTTP; deliberately checks no dependencies, so a database outage does
   * not make Docker restart a healthy API container.
   *
   * @param _req - Unused.
   * @param res - Receives the JSON response.
   */
  liveness = (_req: Request, res: Response): void => {
    res.json({ status: 'ok' });
  };

  /**
   * `GET /health/ready` – readiness. Checks PostgreSQL and MinIO and responds
   * `200 { status: "ready", checks }` if both are up, otherwise
   * `503 { status: "not_ready", checks }`, where `checks` maps each dependency to
   * `up` or `down`. Failure causes are logged (with the request id) but not
   * returned, so internal host names and errors are not exposed.
   *
   * @param req - Incoming request; its logger records failed checks at level `warn`.
   * @param res - Receives the JSON response.
   */
  readiness = async (req: Request, res: Response): Promise<void> => {
    const report = await this.service.checkReadiness();
    const checks = {} as ReadinessResponseBody['checks'];
    for (const [name, result] of Object.entries(report.checks) as [
      DependencyName,
      (typeof report.checks)[DependencyName],
    ][]) {
      checks[name] = result.status;
      if (result.status === 'down') {
        req.log.warn({ dependency: name, err: result.error }, 'Readiness check failed');
      }
    }
    const body: ReadinessResponseBody = { status: report.ready ? 'ready' : 'not_ready', checks };
    res.status(report.ready ? 200 : 503).json(body);
  };
}
