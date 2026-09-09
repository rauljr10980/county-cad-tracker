import { useState } from 'react';
import { Loader2, Send, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { sendEmail } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { buildTeammateContactsEmail, hasTeammateContacts, type TeammateEmailRow, type TeammatePhoneRow } from './teammateContacts';

export type SendContactsToTeammateProps = {
  phoneContacts: TeammatePhoneRow[];
  emailRecipients: TeammateEmailRow[];
  propertyAddress?: string;
};

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export function SendContactsToTeammate({
  phoneContacts,
  emailRecipients,
  propertyAddress,
}: SendContactsToTeammateProps) {
  const [open, setOpen] = useState(false);
  const [teammateEmail, setTeammateEmail] = useState('');
  const [sending, setSending] = useState(false);

  const hasContacts = hasTeammateContacts(phoneContacts, emailRecipients);

  const handleSend = async () => {
    if (!isValidEmail(teammateEmail)) return;
    setSending(true);
    try {
      const { subject, body } = buildTeammateContactsEmail(phoneContacts, emailRecipients, propertyAddress);
      await sendEmail({ to: [teammateEmail.trim()], subject, body });
      toast({ title: `Contacts sent to ${teammateEmail.trim()}` });
      setTeammateEmail('');
      setOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-primary"
          disabled={!hasContacts}
          title={hasContacts ? 'Send these contacts to a teammate' : 'Add a name, phone, or email first'}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Send to Teammate
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium">Send these contacts to a teammate</p>
          <Input
            type="email"
            value={teammateEmail}
            onChange={(e) => setTeammateEmail(e.target.value)}
            placeholder="teammate@example.com"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSend();
            }}
          />
          <Button
            size="sm"
            className="w-full"
            onClick={() => void handleSend()}
            disabled={!isValidEmail(teammateEmail) || sending}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
