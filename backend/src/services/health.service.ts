import { withTimeout } from '../lib/timeout.js';
import type { HealthRepository } from '../repositories/health.repository.js';

/** Maximum time a single dependency check may take before it counts as failed. */
export const READINESS_CHECK_TIMEOUT_MS = 3000;

/** Names of the dependencies checked by the readiness probe. */
export type DependencyName = 'database' | 'storage';

/** Result of checking one dependency. */
export interface DependencyStatus {
  status: 'up' | 'down';
  /** Why the check failed; for logging only, never sent to clients. */
  error?: unknown;
}

/** Result of the readiness probe. */
export interface ReadinessReport {
  /** `true` only when every dependency is up. */
  ready: boolean;
  checks: Record<DependencyName, DependencyStatus>;
}

/** Business logic of the health endpoints. */
export class HealthService {
  /** @param repository - Probes for the database and object storage. */
  constructor(private readonly repository: HealthRepository) {}

  /**
   * Checks PostgreSQL and MinIO in parallel, each limited to
   * {@link READINESS_CHECK_TIMEOUT_MS}.
   *
   * @returns A report with the status of every dependency; a failed or timed-out
   *   check is reported as `down` with the cause, never thrown.
   */
  async checkReadiness(): Promise<ReadinessReport> {
    const [database, storage] = await Promise.all([
      this.probe(() => this.repository.pingDatabase(), 'database'),
      this.probe(() => this.repository.pingStorage(), 'storage'),
    ]);
    return {
      ready: database.status === 'up' && storage.status === 'up',
      checks: { database, storage },
    };
  }

  /**
   * Runs one dependency check with a timeout and converts the outcome to a status.
   *
   * @param check - Function performing the check; resolves when the dependency is up.
   * @param name - Dependency name, used in the timeout message.
   * @returns `{ status: 'up' }` or `{ status: 'down', error }`; never rejects.
   */
  private async probe(check: () => Promise<void>, name: DependencyName): Promise<DependencyStatus> {
    try {
      await withTimeout(check(), READINESS_CHECK_TIMEOUT_MS, `${name} check`);
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', error };
    }
  }
}
