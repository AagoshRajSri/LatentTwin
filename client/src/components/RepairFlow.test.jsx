import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RepairFlow from './RepairFlow.jsx';

describe('RepairFlow', () => {
  it('renders a generation action for a target change', () => {
    render(<RepairFlow target="auth-service" change="rename user_id to userId" />);
    expect(screen.getByRole('button', { name: 'Generate repair' })).toBeInTheDocument();
    expect(screen.getByText('rename user_id to userId')).toBeInTheDocument();
  });
});