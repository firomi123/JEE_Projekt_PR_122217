import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { T } from '../i18n/texts';

/**
 * Banner shown while the device is offline. The application shell still works from
 * the service worker cache, but documents always need the network (they are never
 * cached on the device).
 *
 * @returns The banner, or nothing when online.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      {T.offline.banner}
    </div>
  );
}
