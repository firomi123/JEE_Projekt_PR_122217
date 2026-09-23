import { useCallback, useEffect, useRef, useState } from 'react';

/** State of the camera preview. */
export type CameraStatus =
  /** Waiting for the stream (and possibly the permission prompt). */
  | 'starting'
  /** Live preview running. */
  | 'live'
  /** The user (or the browser policy) refused camera access. */
  | 'denied'
  /** No camera, or `getUserMedia` is not available (e.g. not a secure context). */
  | 'unavailable'
  /** Any other failure. */
  | 'error';

/**
 * Maps a `getUserMedia` failure to a camera status.
 *
 * @param error - The rejection reason.
 * @returns `denied` for permission errors, `unavailable` when there is no suitable
 *   camera, otherwise `error`.
 */
export function cameraErrorStatus(error: unknown): CameraStatus {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return 'unavailable';
  }
  return 'error';
}

/**
 * Starts the device camera (the rear one on phones, `facingMode: environment`) and
 * connects it to a `<video>` element. The stream is stopped when the component
 * unmounts, so the camera light turns off as soon as the user leaves the screen.
 *
 * @returns A ref for the `<video>` element, the current status, and `capture()`,
 *   which grabs the current frame as a high-quality JPEG Blob (full camera
 *   resolution; compression happens later).
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // `mediaDevices` is missing outside secure contexts (e.g. plain HTTP on a LAN IP).
  const [status, setStatus] = useState<CameraStatus>(() =>
    typeof navigator !== 'undefined' &&
    typeof (navigator.mediaDevices as MediaDevices | undefined)?.getUserMedia === 'function'
      ? 'starting'
      : 'unavailable',
  );

  // Runs once per mount. It must not depend on `status`: a status change would run
  // the cleanup and stop the stream right after it went live.
  const available = status !== 'unavailable';
  useEffect(() => {
    if (!available) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then(async (media) => {
        stream = media;
        if (cancelled) return;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          await video.play().catch(() => undefined);
        }
        setStatus('live');
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(cameraErrorStatus(error));
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [available]);

  const capture = useCallback(async (): Promise<Blob> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) throw new Error('Camera is not ready');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Capture failed'))),
        'image/jpeg',
        0.95,
      ),
    );
  }, []);

  return { videoRef, status, capture };
}
