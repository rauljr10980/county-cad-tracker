import { useState } from 'react';
import { format, startOfDay } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { scheduleAppointment, type ScheduleAppointmentInput } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export type AppointmentSource = Pick<ScheduleAppointmentInput, 'propertyId' | 'documentNumber' | 'drivingLeadId'>;

// Mount only while open, so cancelling/reopening starts a new scheduling request.
export function ScheduleAppointmentDialog({ kind, source, address, onClose, onScheduled }: {
  kind: 'APPOINTMENT' | 'DEAL'; source: AppointmentSource; address: string; onClose: () => void; onScheduled?: () => void;
}) {
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const queryClient = useQueryClient();
  const deal = kind === 'DEAL';
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />{deal ? 'Schedule a deal meeting' : 'Schedule an appointment'}</DialogTitle><DialogDescription>{address}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (!date || !/^\d{2}:\d{2}$/.test(time)) { setError('Choose a date and time.'); return; }
      const [hours, minutes] = time.split(':').map(Number);
      const start = new Date(date); start.setHours(hours, minutes, 0, 0);
      if (start.getTime() <= Date.now()) { setError('Choose a future date and time.'); return; }
      setSaving(true); setError('');
      try {
        await scheduleAppointment({ ...source, kind, requestId, startAt: start.toISOString(), endAt: new Date(start.getTime() + duration * 60000).toISOString(), note });
        for (const queryKey of ['followups', 'followups-property', 'followups-d4d', 'preforeclosure', 'team-stats']) void queryClient.invalidateQueries({ queryKey: [queryKey] });
        toast({ title: deal ? 'Deal meeting scheduled' : 'Appointment scheduled', description: 'Added to the calendar for the whole team.' });
        onScheduled?.(); onClose();
      } catch (err) { setError(err instanceof Error ? err.message : 'The appointment was not saved.'); }
      finally { setSaving(false); }
    }}>
      <div className="rounded-md border"><Calendar mode="single" selected={date} onSelect={setDate} disabled={(day) => day < startOfDay(new Date()) || saving} className="mx-auto w-fit" /></div>
      <p className="text-sm text-muted-foreground" aria-live="polite">{date ? format(date, 'EEEE, MMMM d, yyyy') : 'Choose a date above.'}</p>
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="appointment-time">Time</Label><Input id="appointment-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required disabled={saving} /></div><div><Label htmlFor="appointment-duration">Duration</Label><select id="appointment-duration" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={duration} onChange={(event) => setDuration(Number(event.target.value))} disabled={saving}>{[30, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></div></div>
      <p className="text-xs text-muted-foreground">Times use your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
      <div><Label htmlFor="appointment-note">Notes</Label><Textarea id="appointment-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} disabled={saving} /></div>
      <p className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" />Visible to all team members</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !date}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save {deal ? 'deal meeting' : 'appointment'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
