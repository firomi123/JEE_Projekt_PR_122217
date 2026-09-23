import { useAuth } from '../auth/useAuth';
import { T } from '../i18n/texts';

/**
 * Start page of a logged-in user. For now it greets the user; the document list
 * with filters is added in Stage 8.
 *
 * @returns The start page.
 */
export function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <h1>{T.home.title}</h1>
      <p>{T.home.greeting(user?.username ?? '')}</p>
    </>
  );
}
