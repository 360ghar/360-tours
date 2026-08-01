import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '../test-utils';
import { TourSettingsPanel } from '@/components/features/TourSettingsPanel';
import type { Tour } from '@/types';

const baseTour: Tour = {
  id: 'tour-1',
  user_id: 'user-1',
  title: 'Original Tour',
  description: 'Original description',
  status: 'draft',
  visibility: 'private',
  is_featured: false,
  view_count: 0,
  like_count: 0,
  share_count: 0,
  settings: null,
  thumbnail_url: null,
  published_at: null,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  scenes: [],
};

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
