/** One client-side validation error, linked to the control it belongs to (FEATURE_SPEC §6). */
export type SummaryError = { fieldId: string; message: string };

/** Turns a field-error map into summary entries, in the order of `fieldIds` (the form's visual order). */
export function summaryErrors(
  errors: Partial<Record<string, string | undefined>>,
  fieldIds: Record<string, string>,
): SummaryError[] {
  return Object.entries(fieldIds).flatMap(([key, fieldId]) => {
    const message = errors[key];
    return message ? [{ fieldId, message }] : [];
  });
}
