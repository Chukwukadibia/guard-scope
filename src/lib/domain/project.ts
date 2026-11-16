import { supportedCurrencies } from './profile';

export const LIMITS = {
  title: 200,
  client_name: 200,
  client_contact: 320,
  description: 5000,
  item: 1000,
  summary: 5000,
  notes: 5000,
};

export type ProjectFormValues = {
  title: string;
  client_name: string;
  client_contact: string;
  description: string;
  agreed_price: string;
  currency: string;
  start_date: string;
  deadline: string;
};

export type ProjectFieldErrors = Partial<Record<keyof ProjectFormValues, string>>;

const PRICE_RE = /^\d{1,12}(\.\d{1,2})?$/;

/** Mirrors the database checks in the projects migration (PROJ-002). */
export function validateProject(v: ProjectFormValues): ProjectFieldErrors {
  const e: ProjectFieldErrors = {};
  if (!v.title.trim()) e.title = 'Enter a project title.';
  else if (v.title.length > LIMITS.title) e.title = `Use ${LIMITS.title} characters or fewer.`;
  if (!v.client_name.trim()) e.client_name = 'Enter the client name.';
  else if (v.client_name.length > LIMITS.client_name)
    e.client_name = `Use ${LIMITS.client_name} characters or fewer.`;
  if (v.client_contact.length > LIMITS.client_contact)
    e.client_contact = `Use ${LIMITS.client_contact} characters or fewer.`;
  if (v.description.length > LIMITS.description)
    e.description = `Use ${LIMITS.description} characters or fewer.`;
  const price = v.agreed_price.trim();
  if (price && !PRICE_RE.test(price))
    e.agreed_price = 'Enter an amount like 1500 or 1500.50 (no negative values).';
  const list = supportedCurrencies();
  if (!v.currency) e.currency = 'Choose a currency.';
  else if (!/^[A-Z]{3}$/.test(v.currency) || (list.length > 0 && !list.includes(v.currency))) {
    e.currency = 'Choose a currency from the list.';
  }
  if (v.start_date && v.deadline && v.deadline < v.start_date)
    e.deadline = 'The deadline must be on or after the start date.';
  return e;
}

export function toProjectInput(v: ProjectFormValues) {
  const opt = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    title: v.title.trim(),
    client_name: v.client_name.trim(),
    client_contact: opt(v.client_contact),
    description: opt(v.description),
    agreed_price: opt(v.agreed_price),
    currency: v.currency,
    start_date: v.start_date || null,
    deadline: v.deadline || null,
  };
}

export function validateItemText(text: string): string | undefined {
  if (!text.trim()) return 'Enter a description.';
  if (text.length > LIMITS.item) return `Use ${LIMITS.item} characters or fewer.`;
  return undefined;
}
