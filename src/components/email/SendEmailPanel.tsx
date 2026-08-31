import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { sendEmail } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { recipientVars, substituteBody, substituteSubject, type EmailRecipient } from './emailTemplate';

export type { EmailRecipient };

export const DEFAULT_SUBJECT = 'Quick question regarding {{PropertyAddress}}';
export const DEFAULT_BODY = '';

export type SendEmailPanelProps = {
  recipients: EmailRecipient[];
  onRecipientsChange: (next: EmailRecipient[]) => void;
  propertyAddress: string; // {{PropertyAddress}}
  owner: string; // {{Owner}}
  phoneNumber?: string; // {{PhoneNumber}}
  /** Renders a "Note for this email" input under every email field, wired
   *  through onNoteChange rather than onRecipientsChange (see below). */
  showNotes?: boolean;
  /** Fired on blur of a per-email note input (only rendered when showNotes
   *  is set). Kept separate from onRecipientsChange because a note is keyed
   *  by (recipientIndex, emailIndex) and — for the evictions landlord
   *  profile — needs to go through its own freshness-ref-backed save path
   *  rather than the bulk recipients array. */
  onNoteChange?: (recipientIndex: number, emailIndex: number, note: string) => void;
  /**
   * Called by "Send to All" — once before any email goes out (so row data
   * that hasn't autosaved yet is captured even if sending fails partway),
   * and again after the send loop finishes (so per-recipient "sent" flags
   * are persisted). Callers that don't need persistence can omit it.
   */
  onPersist?: (phase: 'pre-send' | 'post-send') => Promise<void>;
  defaultSubject?: string;
  defaultBody?: string;
  /**
   * When this value changes, subject/body reset back to defaultSubject /
   * defaultBody. PropertyDetailsModal is a single long-lived component
   * instance reused across every property it displays, so without this the
   * subject/body from the previous property would leak into the next one —
   * pass something like `${property.id}:${isOpen}` there. Screens that
   * naturally remount SendEmailPanel per subject (e.g. a dialog that only
   * renders its body while open) can omit this.
   */
  resetKey?: string | number;
  /**
   * Hides the panel's content without unmounting it, so an in-progress
   * subject/body draft survives a collapse/expand toggle in the caller.
   * (A caller that conditionally rendered `<SendEmailPanel />` itself would
   * remount it — and lose that draft — every time it collapsed.)
   */
  hidden?: boolean;
};

export function SendEmailPanel({
  recipients,
  onRecipientsChange,
  propertyAddress,
  owner,
  phoneNumber = '',
  showNotes = false,
  onNoteChange,
  onPersist,
  defaultSubject = DEFAULT_SUBJECT,
  defaultBody = DEFAULT_BODY,
  resetKey,
  hidden = false,
}: SendEmailPanelProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sendingIndex, setSendingIndex] = useState<number | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  // Reset subject/body whenever resetKey changes (e.g. a different property
  // was opened in the same long-lived modal instance). Deliberately does not
  // depend on defaultSubject/defaultBody themselves — those are frequently
  // recomputed-but-equal on every parent render, and would otherwise wipe
  // out whatever the user is currently typing.
  useEffect(() => {
    setSubject(defaultSubject);
    setBody(defaultBody);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const handleSendRow = async (index: number) => {
    const recipient = recipients[index];
    const validEmails = recipient.emails.filter((e) => e.includes('@'));
    if (validEmails.length === 0) return;
    setSendingIndex(index);
    try {
      const vars = recipientVars(recipient.name, propertyAddress, owner, phoneNumber);
      const personalBody = substituteBody(body, vars);
      const resolvedSubject = substituteSubject(subject, vars);
      await sendEmail({ to: validEmails, subject: resolvedSubject, body: personalBody });
      toast({ title: `Email sent to ${validEmails.length} address${validEmails.length > 1 ? 'es' : ''}` });
    } catch (err) {
      toast({ title: 'Failed to send', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSendingIndex(null);
    }
  };

  const handleCopyText = () => {
    const vars = { lastName: '___', name: '___', propertyAddress, owner, phoneNumber };
    const resolved = substituteBody(body, vars);
    navigator.clipboard.writeText(resolved);
    toast({ title: 'Email copied to clipboard' });
  };

  const handleSendToAll = async () => {
    const allEmails = recipients.flatMap((r) => r.emails.filter((e) => e.includes('@')));
    if (allEmails.length === 0) return;
    setSendingAll(true);
    try {
      await onPersist?.('pre-send');

      const resolvedSubject = substituteSubject(subject, { propertyAddress, owner });
      let sentCount = 0;
      const updatedRecipients = [...recipients];
      for (let ri = 0; ri < recipients.length; ri++) {
        const recipient = recipients[ri];
        const rowEmails = recipient.emails.filter((e) => e.includes('@'));
        if (rowEmails.length === 0 || recipient.sent) continue;
        const vars = recipientVars(recipient.name, propertyAddress, owner, phoneNumber);
        const resolvedBody = substituteBody(body, vars);
        await sendEmail({ to: rowEmails, subject: resolvedSubject, body: resolvedBody });
        sentCount += rowEmails.length;
        updatedRecipients[ri] = { ...updatedRecipients[ri], sent: true };
      }
      onRecipientsChange(updatedRecipients);

      await onPersist?.('post-send');

      toast({ title: `Email sent to ${sentCount} address${sentCount > 1 ? 'es' : ''}` });
    } catch (err) {
      toast({ title: 'Failed to send', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSendingAll(false);
    }
  };

  return (
    <div className="space-y-2 mt-3" hidden={hidden}>
      {recipients.map((recipient, index) => {
        const validEmails = recipient.emails.filter((e) => e.includes('@'));
        return (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs w-6 shrink-0 flex items-center justify-center">
              {recipient.sent ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <span className="text-muted-foreground">{index + 1}.</span>
              )}
            </span>
            <Input
              value={recipient.name}
              onChange={(e) => {
                const updated = [...recipients];
                updated[index] = { ...updated[index], name: e.target.value };
                onRecipientsChange(updated);
              }}
              placeholder="Name"
              className="w-28 shrink-0"
            />
            <div className="flex-1 overflow-x-auto">
              <div className="flex items-center gap-1.5">
                {recipient.emails.map((email, emailIdx) =>
                  showNotes ? (
                    <div key={emailIdx} className="flex flex-col gap-1 shrink-0">
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          const updated = [...recipients];
                          const newEmails = [...updated[index].emails];
                          newEmails[emailIdx] = e.target.value;
                          updated[index] = { ...updated[index], emails: newEmails };
                          onRecipientsChange(updated);
                        }}
                        placeholder={`Email ${emailIdx + 1}`}
                        className="w-[180px] shrink-0 text-xs"
                      />
                      <Input
                        defaultValue={recipient.emailNotes?.[emailIdx] || ''}
                        onBlur={(e) => onNoteChange?.(index, emailIdx, e.target.value)}
                        placeholder="Note for this email"
                        className="w-[180px] shrink-0 text-xs"
                      />
                    </div>
                  ) : (
                    <Input
                      key={emailIdx}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const updated = [...recipients];
                        const newEmails = [...updated[index].emails];
                        newEmails[emailIdx] = e.target.value;
                        updated[index] = { ...updated[index], emails: newEmails };
                        onRecipientsChange(updated);
                      }}
                      placeholder={`Email ${emailIdx + 1}`}
                      className="w-[180px] shrink-0 text-xs"
                    />
                  ),
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                  onClick={() => {
                    const updated = [...recipients];
                    updated[index] = { ...updated[index], emails: [...updated[index].emails, ''] };
                    onRecipientsChange(updated);
                  }}
                  title="Add email field"
                >
                  <span className="text-lg leading-none">+</span>
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => handleSendRow(index)}
              disabled={validEmails.length === 0 || sendingIndex === index}
              title="Send to all emails in this row"
            >
              {sendingIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        );
      })}

      <div className="border-t border-border pt-3 mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16 shrink-0">Subject:</span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="flex-1"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Variables: <code className="bg-muted px-1 rounded">{'{{LastName}}'}</code>{' '}
          <code className="bg-muted px-1 rounded">{'{{Name}}'}</code>{' '}
          <code className="bg-muted px-1 rounded">{'{{PropertyAddress}}'}</code>{' '}
          <code className="bg-muted px-1 rounded">{'{{Owner}}'}</code>
        </p>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="text-sm" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={handleCopyText}>
          Copy Text
        </Button>
        <Button
          size="sm"
          onClick={handleSendToAll}
          disabled={!recipients.some((r) => r.emails.some((e) => e.includes('@'))) || sendingAll}
        >
          {sendingAll ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
          {sendingAll ? 'Sending...' : 'Send to All'}
        </Button>
      </div>
    </div>
  );
}
