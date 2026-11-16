import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import App from '../../src/App';

test('shows only a loading state (no protected content) while the session is being checked', () => {
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading GuardScope');
  expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
