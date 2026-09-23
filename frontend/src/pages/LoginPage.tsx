import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@driver-docs/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { T } from '../i18n/texts';

/**
 * Login screen: username and password validated with the shared `loginSchema`.
 * After a successful login the `GuestOnly` guard redirects to the page the user
 * originally asked for (or the document list). Wrong credentials, rate limiting
 * and network problems are shown as one message above the form.
 *
 * @returns The login page.
 */
export function LoginPage() {
  const { login, logoutReason } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values);
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <>
      <h1>{T.login.title}</h1>
      {logoutReason && !serverError && <Alert kind="info">{logoutReason}</Alert>}
      {serverError && <Alert kind="error">{serverError}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="login-username"
          label={T.login.username}
          autoComplete="username"
          autoCapitalize="none"
          registration={register('username')}
          error={errors.username?.message}
        />
        <FormField
          id="login-password"
          label={T.login.password}
          type="password"
          autoComplete="current-password"
          registration={register('password')}
          error={errors.password?.message}
        />
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? T.login.submitting : T.login.submit}
        </button>
      </form>
      <p className="auth-switch">
        {T.login.noAccount} <Link to="/rejestracja">{T.login.registerLink}</Link>
      </p>
    </>
  );
}
