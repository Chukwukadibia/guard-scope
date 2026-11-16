import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import App from '../../src/App';

test('renders the placeholder heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'GuardScope' })).toBeInTheDocument();
});
