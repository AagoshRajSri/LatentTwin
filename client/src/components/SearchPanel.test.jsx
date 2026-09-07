import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProvider } from '../context/AppContext.jsx';
import SearchPanel from './SearchPanel.jsx';

describe('SearchPanel', () => {
  it('renders the graph search field', () => {
    render(<AppProvider><SearchPanel /></AppProvider>);
    expect(screen.getByPlaceholderText('Search files, functions, or errors...')).toBeInTheDocument();
  });
});
