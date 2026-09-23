import { useId, useState } from 'react';
import { T } from '../i18n/texts';
import { checkFile } from '../lib/file-check';
import { formatBytes } from '../lib/format';
import { prepareUpload, type CompressedPhoto } from '../lib/image';
import { PhotoCapture } from './PhotoCapture';

/** Props of {@link FilePicker}. */
export interface FilePickerProps {
  label: string;
  /** Called with the file to upload, or `null` when the choice is invalid or cleared. */
  onChange: (file: File | null) => void;
  /** Error to show (e.g. "choose a file" or a server error). */
  error?: string;
}

/**
 * Document file field with two sources: a file from the device (JPG, PNG, PDF) or a
 * photo taken with the camera (with cropping). Large images from either source are
 * compressed before upload (max 2000 px, JPEG, about 1 MB), and the field shows the
 * size before and after. The chosen file is pre-checked in the browser; the server
 * still verifies the content.
 *
 * @param props - See {@link FilePickerProps}.
 * @returns The field with the file input and the camera button.
 */
export function FilePicker({ label, onChange, error }: FilePickerProps) {
  const id = useId();
  const [selected, setSelected] = useState<File | null>(null);
  const [compressed, setCompressed] = useState<CompressedPhoto | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const shownError = localError ?? error;
  const errorId = shownError ? `${id}-error` : undefined;

  /**
   * Applies a new choice: stores it and reports it to the form.
   *
   * @param file - File to upload, or `null`.
   * @param info - Compression result, if the file was compressed.
   */
  const choose = (file: File | null, info: CompressedPhoto | null) => {
    setSelected(file);
    setCompressed(info);
    onChange(file);
  };

  /**
   * Handles a file chosen in the file input. Large JPEG/PNG photos are compressed
   * first and only the result has to fit the 10 MB limit (a phone photo can be
   * bigger than that); other files are checked as they are.
   *
   * @param file - The chosen file, or `null` when the choice was cleared.
   */
  const pickFile = async (file: File | null) => {
    setLocalError(null);
    if (!file) {
      choose(null, null);
      return;
    }
    setProcessing(true);
    try {
      const prepared = await prepareUpload(file);
      const problem = checkFile(prepared.file);
      setLocalError(problem);
      if (problem) choose(null, null);
      else choose(prepared.file, prepared.compressed);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className={`field${shownError ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        aria-invalid={shownError ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => void pickFile(event.target.files?.[0] ?? null)}
      />
      <PhotoCapture
        onPhoto={(photo) => {
          setLocalError(null);
          choose(photo.file, photo);
        }}
      />
      {processing && <p className="field__hint">{T.camera.processing}</p>}
      {selected && !processing && (
        <p className="field__hint" data-testid="selected-file">
          {T.newDocument.selected(selected.name, formatBytes(selected.size))}
        </p>
      )}
      {compressed && !processing && (
        <p className="field__hint" data-testid="compression-info">
          {T.camera.compressed(
            formatBytes(compressed.originalBytes),
            formatBytes(compressed.file.size),
            compressed.width,
            compressed.height,
          )}
        </p>
      )}
      {shownError && (
        <p id={errorId} className="field__error" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
