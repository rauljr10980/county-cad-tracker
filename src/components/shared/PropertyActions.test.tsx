import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerLlcButton } from './OwnerLlcButton';
import { ScheduleAppointmentDialog } from './ScheduleAppointmentDialog';

const { label, schedule } = vi.hoisted(() => ({ label: vi.fn(), schedule: vi.fn() }));
vi.mock('@/lib/api', () => ({ setOwnerLlc: label, scheduleAppointment: schedule }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/ui/calendar', () => ({ Calendar: ({ onSelect }: { onSelect: (date: Date) => void }) => <button type="button" onClick={() => onSelect(new Date(2099, 10, 12))}>Choose November 12</button> }));
const mount = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
beforeEach(() => { label.mockReset(); schedule.mockReset(); });

describe('saved property actions', () => {
  it('persists and removes the LLC label', async () => {
    label.mockResolvedValueOnce({ ownerIsLlc: true }).mockResolvedValueOnce({ ownerIsLlc: false });
    mount(<OwnerLlcButton target={{ type: 'property', id: 'p1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Label as LLC' }));
    await screen.findByRole('button', { name: 'LLC owner' });
    expect(label).toHaveBeenLastCalledWith({ type: 'property', id: 'p1' }, true);
    fireEvent.click(screen.getByRole('button', { name: 'LLC owner' }));
    await screen.findByRole('button', { name: 'Label as LLC' });
    expect(label).toHaveBeenLastCalledWith({ type: 'property', id: 'p1' }, false);
  });
  it('does not display a saved LLC label when saving failed', async () => {
    label.mockRejectedValue(new Error('Offline'));
    mount(<OwnerLlcButton target={{ type: 'property', id: 'p1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Label as LLC' }));
    await waitFor(() => expect(label).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Label as LLC' }).getAttribute('aria-pressed')).toBe('false');
  });
  it('saves the chosen local date, time and duration to the team calendar', async () => {
    schedule.mockResolvedValue({ id: 'a1' });
    const close = vi.fn();
    mount(<ScheduleAppointmentDialog kind="APPOINTMENT" source={{ propertyId: 'p1' }} address="123 Main St" onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose November 12' }));
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '14:30' } });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 'p1', kind: 'APPOINTMENT', startAt: new Date(2099, 10, 12, 14, 30).toISOString(), endAt: new Date(2099, 10, 12, 16).toISOString() }));
  });
  it('retains the chosen date and request key after a failed save, and cancellation writes nothing', async () => {
    schedule.mockRejectedValue(new Error('Offline'));
    const close = vi.fn();
    mount(<ScheduleAppointmentDialog kind="DEAL" source={{ documentNumber: 'doc1' }} address="123 Main St" onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose November 12' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save deal meeting' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Save deal meeting' }));
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(2));
    expect(schedule.mock.calls[0][0]).toEqual(schedule.mock.calls[1][0]);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledTimes(2);
  });
});
