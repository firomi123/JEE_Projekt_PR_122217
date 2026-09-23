import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { T } from '../i18n/texts';
import { normalizeRotation } from '../lib/image-math';
import { compressImage, loadImage, rotateAndCrop, type CompressedPhoto } from '../lib/image';
import { Alert } from './Alert';

/** Props of {@link PhotoEditor}. */
export interface PhotoEditorProps {
  /** The captured or picked photo. */
  photo: Blob;
  /** Receives the cropped, rotated and compressed JPEG. */
  onDone: (result: CompressedPhoto) => void;
  /** Called when the user wants to take the photo again. */
  onRetake: () => void;
}

/**
 * Crop-and-rotate step before saving a photo. The crop area has touch handles
 * (react-easy-crop: drag to move, pinch or slider to zoom), the photo can be
 * rotated by 90°, and "use photo" produces the final JPEG: rotated, cropped, scaled
 * to at most 2000 px and compressed to under about 1 MB.
 *
 * @param props - See {@link PhotoEditorProps}.
 * @returns The editor dialog.
 */
export function PhotoEditor({ photo, onDone, onRetake }: PhotoEditorProps) {
  const url = useObjectUrl(photo);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const finish = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const image = await loadImage(photo);
      const canvas = rotateAndCrop(image, rotation, area);
      onDone(await compressImage(canvas, photo.size, 'zdjecie-dokumentu'));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label={T.camera.editorTitle}>
      <div className="editor__area" data-testid="photo-editor">
        {url && (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        )}
      </div>
      <div className="editor__controls">
        {failed && <Alert kind="error">{T.camera.processingError}</Alert>}
        <label className="editor__zoom">
          {T.camera.zoom}
          <input
            type="range"
            min={1}
            max={4}
            step={0.1}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setRotation((value) => normalizeRotation(value + 90))}
          >
            {T.camera.rotate}
          </button>
          <button type="button" className="button button--ghost" onClick={onRetake}>
            {T.camera.retake}
          </button>
          <button type="button" className="button button--primary" disabled={busy} onClick={finish}>
            {busy ? T.camera.processing : T.camera.use}
          </button>
        </div>
      </div>
    </div>
  );
}
