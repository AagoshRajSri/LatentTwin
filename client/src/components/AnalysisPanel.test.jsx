import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProvider } from '../context/AppContext.jsx';
import AnalysisPanel from './AnalysisPanel.jsx';

describe('AnalysisPanel', () => {
  it('renders repository input and analysis controls', () => {
    render(<AppProvider><AnalysisPanel /></AppProvider>);
    expect(screen.getByPlaceholderText('https://github.com/user/repo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze Repository' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('fullScan');
  });
});
