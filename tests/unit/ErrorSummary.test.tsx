import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ErrorSummary } from '../../src/components/ui/ErrorSummary';
import { TextField } from '../../src/components/ui/Field';
import { summaryErrors } from '../../src/lib/domain/formErrors';

const IDS = { email: 'f-email', password: 'f-password' };

/** Minimal form wired like the real pages: validate on submit, summary + inline errors. */
function Form() {
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [attempt, setAttempt] = useState(0);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({ email: 'Enter your email address.', password: 'Enter your password.' });
        setAttempt((n) => n + 1);
      }}
    >
      <ErrorSummary errors={summaryErrors(errors, IDS)} attempt={attempt} />
      <TextField id={IDS.email} label="Email" error={errors.email} />
      <TextField id={IDS.password} label="Password" error={errors.password} />
      <button type="submit">Submit</button>
    </form>
  );
}

test('renders nothing when there are no errors', () => {
  render(<ErrorSummary errors={[]} attempt={1} />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('lists each error as a link to its field and takes focus on a failed submit', () => {
  render(<Form />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  const summary = screen.getByRole('alert');
  expect(within(summary).getByRole('heading', { name: 'There is a problem' })).toBeInTheDocument();
  const links = within(summary).getAllByRole('link');
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['#f-email', '#f-password']);
  expect(links.map((a) => a.textContent)).toEqual([
    'Enter your email address.',
    'Enter your password.',
  ]);
  expect(summary).toHaveAttribute('tabindex', '-1');
  expect(summary).toHaveFocus();

  // Inline errors stay, associated via aria-describedby.
  const email = screen.getByLabelText('Email');
  expect(email).toHaveAttribute('id', 'f-email');
  expect(email).toHaveAccessibleDescription('Enter your email address.');

  // Following a link moves focus to the field.
  fireEvent.click(links[1]!);
  expect(screen.getByLabelText('Password')).toHaveFocus();

  // A second failed submit re-focuses the summary even with unchanged errors.
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.getByRole('alert')).toHaveFocus();
});

test('summaryErrors keeps form order and skips fields without an error', () => {
  expect(summaryErrors({ password: 'Too short', email: undefined }, IDS)).toEqual([
    { fieldId: 'f-password', message: 'Too short' },
  ]);
});

test('TextField label and control share a caller-supplied id', () => {
  render(<TextField id="custom" label="Name" hint="Shown publicly." />);
  const input = screen.getByLabelText('Name');
  expect(input).toHaveAttribute('id', 'custom');
  expect(input).toHaveAccessibleDescription('Shown publicly.');
});
