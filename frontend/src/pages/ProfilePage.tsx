import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema, type ProfileData, type ProfileInput } from '@driver-docs/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { getProfile, saveProfile } from '../api/documents';
import { applyFieldErrors, errorMessage } from '../api/errors';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { T } from '../i18n/texts';

const FIELDS = ['firstName', 'lastName', 'phone', 'licenseNumber', 'companyName'] as const;

/**
 * Driver profile form (name, phone, driving licence number, company), validated with
 * the shared `profileSchema`. Loads the current profile, saves the whole profile
 * with `PUT /api/profile` and shows the values normalized by the server (e.g. the
 * phone number without spaces).
 *
 * @returns The profile page.
 */
export function ProfilePage() {
  const queryClient = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile().then((response) => response.profile),
  });
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput, unknown, ProfileData>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (data) {
      reset({
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        phone: data.phone ?? '',
        licenseNumber: data.licenseNumber ?? '',
        companyName: data.companyName ?? '',
      });
    }
  }, [data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      const { profile } = await saveProfile(values);
      queryClient.setQueryData(['profile'], profile);
      setMessage({ kind: 'info', text: T.profile.saved });
    } catch (failure) {
      if (!applyFieldErrors(failure, setError, FIELDS)) {
        setMessage({ kind: 'error', text: errorMessage(failure) });
      }
    }
  });

  if (isPending) return <p>{T.common.loading}</p>;
  if (error) return <Alert kind="error">{errorMessage(error)}</Alert>;

  return (
    <>
      <h1>{T.profile.title}</h1>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="profile-first-name"
          label={T.profile.firstName}
          autoComplete="given-name"
          registration={register('firstName')}
          error={errors.firstName?.message}
        />
        <FormField
          id="profile-last-name"
          label={T.profile.lastName}
          autoComplete="family-name"
          registration={register('lastName')}
          error={errors.lastName?.message}
        />
        <FormField
          id="profile-phone"
          label={T.profile.phone}
          hint={T.profile.phoneHint}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          registration={register('phone')}
          error={errors.phone?.message}
        />
        <FormField
          id="profile-license"
          label={T.profile.licenseNumber}
          autoCapitalize="characters"
          registration={register('licenseNumber')}
          error={errors.licenseNumber?.message}
        />
        <FormField
          id="profile-company"
          label={T.profile.companyName}
          autoComplete="organization"
          registration={register('companyName')}
          error={errors.companyName?.message}
        />
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? T.profile.submitting : T.profile.submit}
        </button>
      </form>
    </>
  );
}
