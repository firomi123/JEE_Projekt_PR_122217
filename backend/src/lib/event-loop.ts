import { performance } from 'node:perf_hooks';

/** How often the monitor's timer should fire, in milliseconds. */
const INTERVAL_MS = 100;

/**
 * Measures how long the event loop was blocked. The event loop is shared by the
 * whole process, so there is one monitor per process.
 *
 * A timer is scheduled every 100 ms; if a callback blocks the loop (e.g. a runaway
 * synchronous loop), the timer fires late, and the delay beyond the schedule is the
 * blocking time. (Node's `monitorEventLoopDelay` was not used: it drops the first
 * sample after `reset()`, so a block right after a reset went unnoticed.)
 */
class EventLoopMonitor {
  private maxDelayMs = 0;
  private expectedAt = performance.now() + INTERVAL_MS;

  constructor() {
    const timer = setInterval(() => {
      const now = performance.now();
      this.maxDelayMs = Math.max(this.maxDelayMs, now - this.expectedAt);
      this.expectedAt = now + INTERVAL_MS;
    }, INTERVAL_MS);
    // The monitor must never keep the process alive on its own.
    timer.unref();
  }

  /**
   * Returns the longest event-loop delay since the previous call and starts a new
   * measurement window.
   *
   * @returns The maximum delay in milliseconds (0 if the loop was never late).
   */
  takeMaxDelayMs(): number {
    const max = Math.max(0, this.maxDelayMs);
    this.maxDelayMs = 0;
    return max;
  }
}

/** Process-wide event-loop monitor used by the liveness endpoint. */
export const eventLoopMonitor = new EventLoopMonitor();
