import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '../test-utils';
import { TourSettingsPanel } from '@/components/features/TourSettingsPanel';
import { makeTour } from '@/test/fixtures';
import type { Tour } from '@/types';

const baseTour: Tour = makeTour({
  title: 'Original Tour',
  description: 'Original description',
});

function Harness({ tour }: { tour: Tour }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open Settings</button>
      <TourSettingsPanel
        open={open}
        onOpenChange={setOpen}
        tour={tour}
        scenes={[]}
        onSave={vi.fn()}
      />
    </>
  );
}

describe('TourSettingsPanel', () => {
  it('Cancel discards edits: reopening the dialog shows the persisted values', async () => {
    render(<Harness tour={baseTour} />);

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput.value).toBe('Original Tour');

    // Edit the form but cancel instead of saving.
    fireEvent.change(titleInput, { target: { value: 'Edited but not saved' } });
    expect(titleInput.value).toBe('Edited but not saved');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Reopen the dialog — the form must be pristine again (persisted values).
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));

    const reopenedInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(reopenedInput.value).toBe('Original Tour');
    expect(screen.getByLabelText('Description')).toHaveValue('Original description');
  });
});
