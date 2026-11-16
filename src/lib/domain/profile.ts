/** Pure profile rules shared by UI and API wrapper (mirrors DB checks in the profiles migration). */
export const DISPLAY_NAME_MAX = 120;

export type ProfileFieldErrors = { display_name?: string; default_currency?: string };

export function supportedCurrencies(): string[] {
  try {
    return Intl.supportedValuesOf('currency');
  } catch {
    return [];
  }
}

export function validateProfileInput(input: {
  display_name?: string | null;
  default_currency?: string | null;
}): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  const name = input.display_name;
  if (name !== undefined && name !== null) {
    if (name.trim().length === 0) errors.display_name = 'Enter a name, or leave it empty.';
    else if (name.length > DISPLAY_NAME_MAX) {
      errors.display_name = `Use ${DISPLAY_NAME_MAX} characters or fewer.`;
    }
  }
  const cur = input.default_currency;
  if (cur !== undefined && cur !== null) {
    const list = supportedCurrencies();
    if (!/^[A-Z]{3}$/.test(cur) || (list.length > 0 && !list.includes(cur))) {
      errors.default_currency = 'Choose a currency from the list.';
    }
  }
  return errors;
}
