import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterData, type RegisterInput } from '@driver-docs/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import * as authApi from '../api/auth';
import { applyFieldErrors, errorMessage } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { T } from '../i18n/texts';

/** Form fields that can receive per-field errors from the API. */
const FIELDS = ['username', 'email', 'password', 'confirmPassword'] as const;

/**
 * Registration screen. The form is validated in the browser with the shared
 * `registerSchema` (the same rules as the API, Polish messages next to each field).
 * On success the user is logged in automatically and redirected to the documents
 * list; a taken username or e-mail (409) is shown next to that field.
 *
 * @returns The registration page.
 */
export function RegisterPage() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, RegisterData>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await authApi.register(values);
      // The schema normalizes the username but leaves the password as typed.
      await login({ username: values.username, password: values.password });
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) setServerError(errorMessage(error));
    }
  });

  return (
    <>
      <h1>{T.register.title}</h1>
      {serverError && <Alert kind="error">{serverError}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="register-username"
          label={T.register.username}
          hint={T.register.usernameHint}
          autoComplete="username"
          autoCapitalize="none"
          registration={register('username')}
          error={errors.username?.message}
        />
        <FormField
          id="register-email"
          label={T.register.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          registration={register('email')}
          error={errors.email?.message}
        />
        <FormField
          id="register-password"
          label={T.register.password}
          hint={T.register.passwordHint}
          type="password"
          autoComplete="new-password"
          registration={register('password')}
          error={errors.password?.message}
        />
        <FormField
          id="register-confirm-password"
          label={T.register.confirmPassword}
          type="password"
          autoComplete="new-password"
          registration={register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? T.register.submitting : T.register.submit}
        </button>
      </form>
      <p className="auth-switch">
        {T.register.haveAccount} <Link to="/logowanie">{T.register.loginLink}</Link>
      </p>
    </>
  );
}
