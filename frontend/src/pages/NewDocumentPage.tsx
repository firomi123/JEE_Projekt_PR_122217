import { zodResolver } from '@hookform/resolvers/zod';
import {
  createDocumentSchema,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type CreateDocumentData,
} from '@driver-docs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { z } from 'zod';
import { createDocument } from '../api/documents';
import { applyFieldErrors, errorMessage } from '../api/errors';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert';
import { FilePicker } from '../components/FilePicker';
import { FormField } from '../components/FormField';
import { SelectField } from '../components/SelectField';
import { documentKeys } from '../hooks/useDocuments';
import { T } from '../i18n/texts';

type FormInput = z.input<typeof createDocumentSchema>;
const FIELDS = ['type', 'title', 'number', 'changeNote'] as const;

/**
 * Form for adding a document from a file: type, title, optional number and note,
 * and the file (JPG, PNG or PDF, max 10 MB, pre-checked in the browser). Fields are
 * validated with the shared `createDocumentSchema`; server errors (including a
 * rejected file) are shown next to the fields. On success the user is taken to
 * the new document. (Stage 9 adds taking the photo with the camera.)
 *
 * @returns The page.
 */
export function NewDocumentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, CreateDocumentData>({
    resolver: zodResolver(createDocumentSchema),
    defaultValues: { type: 'CMR' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (!file) {
      setFileError(T.newDocument.fileRequired);
      return;
    }
    try {
      const { document } = await createDocument({
        type: values.type,
        title: values.title,
        number: values.number ?? undefined,
        changeNote: values.changeNote ?? undefined,
        file,
        fileName: file.name,
      });
      await queryClient.invalidateQueries({ queryKey: documentKeys.all });
      navigate(`/dokumenty/${document.id}`, { replace: true });
    } catch (error) {
      const fileIssue = error instanceof ApiError && error.details.find((d) => d.path === 'file');
      if (fileIssue) setFileError(fileIssue.message);
      if (!applyFieldErrors(error, setError, FIELDS) && !fileIssue) {
        setServerError(errorMessage(error));
      }
    }
  });

  const typeOptions = DOCUMENT_TYPES.map((t) => [t, DOCUMENT_TYPE_LABELS[t]] as const);

  return (
    <>
      <h1>{T.newDocument.title}</h1>
      {serverError && <Alert kind="error">{serverError}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <SelectField
          id="document-type"
          label={T.newDocument.type}
          options={typeOptions}
          error={errors.type?.message}
          {...register('type')}
        />
        <FormField
          id="document-title"
          label={T.newDocument.docTitle}
          hint={T.newDocument.docTitleHint}
          registration={register('title')}
          error={errors.title?.message}
        />
        <FormField
          id="document-number"
          label={T.newDocument.number}
          registration={register('number')}
          error={errors.number?.message}
        />
        <FormField
          id="document-note"
          label={T.newDocument.changeNote}
          registration={register('changeNote')}
          error={errors.changeNote?.message}
        />
        <FilePicker
          label={T.newDocument.file}
          error={fileError}
          onChange={(chosen) => {
            setFile(chosen);
            setFileError(undefined);
          }}
        />
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? T.newDocument.submitting : T.newDocument.submit}
        </button>
      </form>
    </>
  );
}
