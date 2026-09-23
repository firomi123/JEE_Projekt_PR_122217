import { useId, useState } from 'react';
import { checkFile } from '../lib/file-check';
import { formatBytes } from '../lib/format';
import { T } from '../i18n/texts';

/** Props of {@link FilePicker}. */
export interface FilePickerProps {
  label: string;
  /** Called with the chosen file, or `null` when the choice is invalid or cleared. */
  onChange: (file: File | null) => void;
  /** Error to show (e.g. "choose a file" or a server error). */
  error?: string;
}

/**
 * File input for documents (JPG, PNG, PDF). Shows the chosen file's name and size,
 * or the browser-side validation error.
 *
 * @param props - See {@link FilePickerProps}.
 * @returns The labelled file input.
 */
export function FilePicker({ label, onChange, error }: FilePickerProps) {
  const id = useId();
  const [selected, setSelected] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error;
  const errorId = shownError ? `${id}-error` : undefined;

  return (
    <div className={`field${shownError ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        aria-invalid={shownError ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          const problem = file ? checkFile(file) : null;
          setLocalError(problem);
          setSelected(problem ? null : file);
          onChange(problem ? null : file);
        }}
      />
      {selected && (
        <p className="field__hint">
          {T.newDocument.selected(selected.name, formatBytes(selected.size))}
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
