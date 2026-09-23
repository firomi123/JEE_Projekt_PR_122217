import { APP_NAME } from '@driver-docs/shared';

/**
 * Root component of the application.
 *
 * For now it renders only the application name and a short Polish description;
 * routing, authentication and the document screens are added in Stages 7–8.
 *
 * @returns The top-level page markup. Pure render, no side effects.
 */
export function App() {
  return (
    <main className="app">
      <h1>{APP_NAME}</h1>
      <p>Dokumenty przewozowe (CMR, WZ) zawsze pod ręką.</p>
    </main>
  );
}
