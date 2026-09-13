import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DrivingView } from './DrivingView';

// D4dPipelineView calls useQueryClient() directly, and in the real app
// DrivingView always renders inside App.tsx's QueryClientProvider — so tests
// need the same wrapper to match production context.
function renderDrivingView() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <DrivingView />
    </QueryClientProvider>
  );
}

vi.mock('@/hooks/useDrivingLeads', () => ({
  useDrivingLeads: () => ({
    data: [
      { id: '1', rawAddress: '1 Main St', street: '1 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'NEW', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    ],
    isLoading: false,
  }),
  useCreateDrivingLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDrivingLead: () => ({ mutate: vi.fn() }),
  useDeleteDrivingLead: () => ({ mutateAsync: vi.fn() }),
  useUploadDrivingPhotos: () => ({ mutateAsync: vi.fn() }),
  useDrivingPhotos: () => ({ data: [] }),
  useDeleteDrivingPhoto: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/useFollowUps', () => ({
  useD4dFollowUps: () => ({ data: [] }),
  // PropertyDetailsModal (rendered — hidden via isOpen — inside DrivingView
  // for the property-details dialog) also calls this hook unconditionally.
  usePropertyFollowUps: () => ({ data: [], refetch: vi.fn() }),
}));

// DrivingView calls getProperties() directly (outside the mocked hooks above)
// in a "check all leads against the properties DB" useEffect on mount — left
// unmocked, this hits the real production API on every test run.
vi.mock('@/lib/api', () => ({
  getProperties: vi.fn().mockResolvedValue({ properties: [] }),
}));

describe('DrivingView pipeline toggle', () => {
  it('shows the funnel (Table) view by default', () => {
    renderDrivingView();
    expect(screen.getByRole('button', { name: 'Table' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Board' })).toBeTruthy();
  });

  it('switches to the Kanban board when Board is clicked', () => {
    renderDrivingView();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByText('Leads')).toBeTruthy();
    expect(screen.getByText('Dead Deal')).toBeTruthy();
  });
});
