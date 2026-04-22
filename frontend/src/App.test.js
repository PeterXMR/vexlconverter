import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';

test('renders Vexl Converter heading', async () => {
  await act(async () => {
    render(<App />);
  });
  const heading = screen.getByRole('heading', { name: /vexl converter/i });
  expect(heading).toBeInTheDocument();
});
