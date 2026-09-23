import { Link } from 'react-router';
import { T } from '../i18n/texts';

/**
 * Shown for addresses that match no route.
 *
 * @returns The "page not found" message with a link to the documents list.
 */
export function NotFoundPage() {
  return (
    <>
      <h1>{T.notFound.title}</h1>
      <Link to="/" className="button button--primary">
        {T.notFound.goHome}
      </Link>
    </>
  );
}
