import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';

test('renders Vexl Converter wordmark', async () => {
  await act(async () => {
    render(<App />);
  });
  expect(screen.getByText(/vexl converter/i)).toBeInTheDocument();
});
