import { useState } from 'react';
import { useCamera, type CameraStatus } from '../hooks/useCamera';
import { T } from '../i18n/texts';
import { Alert } from './Alert';

/** Message shown for each camera failure. */
const FAILURE_MESSAGES: Partial<Record<CameraStatus, string>> = {
  denied: T.camera.denied,
  unavailable: T.camera.unavailable,
  error: T.camera.error,
};

/** Props of {@link CameraCapture}. */
export interface CameraCaptureProps {
  /** Receives the captured frame (or a photo picked with the fallback input). */
  onCapture: (photo: Blob) => void;
  onCancel: () => void;
}

/**
 * Full-screen camera view: live preview of the rear camera and a large shutter
 * button. If the camera cannot be used (permission refused, no camera, or no
 * `getUserMedia` because the page is not in a secure context) it explains why and
 * offers the fallback `<input type="file" accept="image/*" capture="environment">`,
 * which on phones opens the system camera app or the gallery.
 *
 * @param props - See {@link CameraCaptureProps}.
 * @returns The camera dialog.
 */
export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const { videoRef, status, capture } = useCamera();
  const [busy, setBusy] = useState(false);
  const failure = FAILURE_MESSAGES[status];

  /**
   * Takes a photo from the live stream and passes it to `onCapture`.
   * Disables the shutter while capturing; errors from `capture` propagate to the caller
   * (the button handler), `busy` is reset in every case.
   */
  const shoot = async () => {
    setBusy(true);
    try {
      onCapture(await capture());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label={T.camera.dialog}>
      {!failure && (
        <video
          ref={videoRef}
          className="camera__video"
          playsInline
          muted
          autoPlay
          data-testid="camera-preview"
        />
      )}
      {status === 'starting' && <p className="camera__status">{T.camera.starting}</p>}
      {failure && (
        <div className="camera__fallback">
          <Alert kind="error">{failure}</Alert>
          <label className="button button--primary" htmlFor="camera-fallback">
            {T.camera.fallback}
          </label>
          <input
            id="camera-fallback"
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onCapture(file);
            }}
          />
        </div>
      )}
      <div className="camera__controls">
        <button type="button" className="button button--ghost camera__close" onClick={onCancel}>
          {T.camera.close}
        </button>
        {status === 'live' && (
          <button
            type="button"
            className="camera__shutter"
            aria-label={T.camera.shutter}
            disabled={busy}
            onClick={shoot}
          />
        )}
      </div>
    </div>
  );
}
