import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/** Application metrics exposed at `GET /metrics` in the Prometheus text format. */
export interface Metrics {
  registry: Registry;
  /** Finished HTTP requests by method, route template and status code. */
  httpRequests: Counter<'method' | 'route' | 'status_code'>;
  /** HTTP request duration in seconds, same labels. */
  httpDuration: Histogram<'method' | 'route' | 'status_code'>;
  /** Login attempts rejected for wrong credentials (brute-force indicator). */
  loginFailures: Counter;
  /** Uploaded files (new documents and new versions) by document type. */
  uploads: Counter<'type'>;
  /** Size of uploaded files in bytes. */
  uploadSize: Histogram;
  /** Duration of database queries in seconds. */
  dbQueryDuration: Histogram;
}

/**
 * Creates a registry with the default Node.js/process metrics (CPU, memory, GC,
 * event-loop lag, handles) and the application's own metrics.
 *
 * A separate registry per application instance (instead of prom-client's global
 * one) lets tests build several apps in one process without "metric already
 * registered" errors.
 *
 * @returns The registry and the metric objects to update.
 */
export function createMetrics(): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const labelNames = ['method', 'route', 'status_code'] as const;
  return {
    registry,
    httpRequests: new Counter({
      name: 'http_requests_total',
      help: 'Finished HTTP requests',
      labelNames,
      registers: [registry],
    }),
    httpDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames,
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    loginFailures: new Counter({
      name: 'auth_login_failures_total',
      help: 'Login attempts rejected because of wrong credentials',
      registers: [registry],
    }),
    uploads: new Counter({
      name: 'document_uploads_total',
      help: 'Uploaded document files (new documents and new versions)',
      labelNames: ['type'],
      registers: [registry],
    }),
    uploadSize: new Histogram({
      name: 'document_upload_size_bytes',
      help: 'Size of uploaded document files in bytes',
      buckets: [50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6, 10e6],
      registers: [registry],
    }),
    dbQueryDuration: new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5],
      registers: [registry],
    }),
  };
}
