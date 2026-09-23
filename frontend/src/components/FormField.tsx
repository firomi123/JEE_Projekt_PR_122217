import type { InputHTMLAttributes } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

/** Props of {@link FormField}. */
export interface FormFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'name' | 'children'
> {
  /** Input id (also used to link the label, hint and error). */
  id: string;
  /** Visible label. */
  label: string;
  /** Result of react-hook-form's `register(name)`. */
  registration: UseFormRegisterReturn;
  /** Validation error message to show under the input, if any. */
  error?: string;
  /** Short help text shown under the input. */
  hint?: string;
}

/**
 * Labelled text input with an optional hint and error message. The hint and error
 * are linked with `aria-describedby`, and an invalid input gets
 * `aria-invalid="true"`, so screen readers announce the problem with the field.
 *
 * @param props - See {@link FormFieldProps}; other props go to the `<input>`.
 * @returns The field markup.
 */
export function FormField({ id, label, registration, error, hint, ...input }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
        {...registration}
      />
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
