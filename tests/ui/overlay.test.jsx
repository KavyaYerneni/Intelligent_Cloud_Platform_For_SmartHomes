import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Dialog } from '../../frontend/ui/Overlay';

// Live updates re-render the page behind an open dialog and pass a new onClose
// each time. Focus must stay in the field the user is typing in.
describe('Dialog focus', () => {
  it('keeps focus on the field being edited when the parent re-renders', () => {
    let tick;
    function Host() {
      const [n, setN] = useState(0);
      tick = () => setN(n + 1);
      return <Dialog title="Register a device" onClose={() => {}}><input aria-label="Room" /><input aria-label="Name" /><span>{n}</span></Dialog>;
    }
    render(<Host />);
    expect(screen.getByLabelText('Room')).toHaveFocus();
    screen.getByLabelText('Name').focus();
    act(() => tick());
    act(() => tick());
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });
});
