/**
 * Races a promise against a timer.
 *
 * @param promise - The operation to wait for. It is not cancelled on timeout; its
 *   eventual result or rejection is ignored.
 * @param ms - Maximum time to wait, in milliseconds.
 * @param label - Name used in the timeout error message.
 * @returns The promise's value if it settles within `ms`.
 * @throws The promise's own rejection reason, or `Error("<label> timed out after <ms> ms")`.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
