import type { Request, Response } from 'express';
import { eventLoopMonitor } from '../lib/event-loop.js';
import type { DependencyName, HealthService } from '../services/health.service.js';

/** Response body of `GET /health/ready`. */
export interface ReadinessResponseBody {
  status: 'ready' | 'not_ready';
  checks: Record<DependencyName, 'up' | 'down'>;
}

/** HTTP handlers of the health endpoints. */
export class HealthController {
  /**
   * @param service - Performs the readiness checks.
   * @param lagThresholdMs - Event-loop delay above which liveness fails.
   */
  constructor(
    private readonly service: HealthService,
    private readonly lagThresholdMs: number,
  ) {}

  /**
   * `GET /health` – liveness. Responds `200 { "status": "ok" }` while the process
   * serves HTTP normally. It deliberately checks no dependencies, so a database
   * outage does not make Docker restart a healthy API container. It does check the
   * process itself: if the event loop was blocked longer than the threshold since
   * the previous check (e.g. a runaway synchronous loop), it responds
   * `503 { status: "unhealthy", reason: "event_loop_lag", lagMs }`, so the Docker
   * healthcheck marks the container unhealthy and autoheal restarts it.
   *
   * @param req - Incoming request (its logger records a failed check).
   * @param res - Receives the JSON response.
   */
  liveness = (req: Request, res: Response): void => {
    const lagMs = eventLoopMonitor.takeMaxDelayMs();
    if (lagMs > this.lagThresholdMs) {
      req.log.warn({ lagMs }, 'Liveness check failed: event loop was blocked');
      res
        .status(503)
        .json({ status: 'unhealthy', reason: 'event_loop_lag', lagMs: Math.round(lagMs) });
      return;
    }
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
