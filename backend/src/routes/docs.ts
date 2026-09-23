import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../docs/openapi.js';

/**
 * Creates the router with the API documentation:
 * - `GET /openapi.json` – the OpenAPI 3.0 specification,
 * - `GET /` – Swagger UI rendering it (interactive, with "Authorize" for the JWT).
 *
 * @returns An Express router meant to be mounted at `/api/docs`.
 */
export function createDocsRouter(): Router {
  const document = buildOpenApiDocument();
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use('/', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: 'API – docs' }));
  return router;
}
