import { useState } from 'react';
import { T } from '../i18n/texts';
import type { CompressedPhoto } from '../lib/image';
import { CameraCapture } from './CameraCapture';
import { PhotoEditor } from './PhotoEditor';

/**
 * "Take a photo" button that runs the whole photo flow: camera (or fallback file
 * input) → crop and rotate → compression, and hands the final JPEG to the form.
 *
 * @param props.onPhoto - Receives the compressed photo when the user confirms it.
 * @returns The button and, while active, the full-screen camera/editor.
 */
export function PhotoCapture({ onPhoto }: { onPhoto: (photo: CompressedPhoto) => void }) {
  const [step, setStep] = useState<'idle' | 'camera' | 'edit'>('idle');
  const [raw, setRaw] = useState<Blob | null>(null);

  return (
    <>
      <button type="button" className="button button--secondary" onClick={() => setStep('camera')}>
        <span aria-hidden="true">📷</span> {T.camera.open}
      </button>
      {step === 'camera' && (
        <CameraCapture
          onCapture={(photo) => {
            setRaw(photo);
            setStep('edit');
          }}
          onCancel={() => setStep('idle')}
        />
      )}
      {step === 'edit' && raw && (
        <PhotoEditor
          photo={raw}
          onRetake={() => setStep('camera')}
          onDone={(result) => {
            setStep('idle');
            setRaw(null);
            onPhoto(result);
          }}
        />
      )}
    </>
  );
}
