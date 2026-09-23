import type { SelectHTMLAttributes } from 'react';

/** Props of {@link SelectField}. */
export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'id' | 'children'
> {
  id: string;
  label: string;
  /** Options as `[value, label]` pairs. */
  options: readonly (readonly [string, string])[];
  error?: string;
}

/**
 * Labelled `<select>` with an optional error message (same conventions as
 * `FormField`). Works with react-hook-form (`{...register('x')}`) and as a
 * controlled input (`value` + `onChange`).
 *
 * @param props - See {@link SelectFieldProps}; other props go to the `<select>`.
 * @returns The field markup.
 */
export function SelectField({ id, label, options, error, ...select }: SelectFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...select}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
