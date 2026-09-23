import { describe, expect, it } from 'vitest';
import { cameraErrorStatus } from './useCamera';

/**
 * Creates an error with a given `name`, like the ones `getUserMedia` rejects with.
 *
 * @param name - DOMException name.
 * @returns The error.
 */
function mediaError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe('cameraErrorStatus', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'unavailable'],
    ['OverconstrainedError', 'unavailable'],
    ['NotReadableError', 'unavailable'],
    ['AbortError', 'error'],
  ])('maps %s to %s', (name, status) => {
    expect(cameraErrorStatus(mediaError(name))).toBe(status);
  });

  it('treats unknown values as a generic error', () => {
    expect(cameraErrorStatus('boom')).toBe('error');
  });
});
