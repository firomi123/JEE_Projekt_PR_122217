import type { ReactNode } from 'react';

/**
 * Message box announced by screen readers.
 *
 * @param props.kind - `error` (red, `role="alert"`) or `info` (neutral, `role="status"`).
 * @param props.children - Message content.
 * @returns The message box.
 */
export function Alert({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
