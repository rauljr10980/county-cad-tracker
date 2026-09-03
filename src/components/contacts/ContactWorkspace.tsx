import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { extractContacts } from '@/lib/contactParser';
import {
  recordAttempt,
  setDisposition as setContactDisposition,
  setPhoneNote,
  setEmailNote,
  type NormalizedContacts,
} from '@/lib/contactsModel';
import { SendEmailPanel } from '@/components/email/SendEmailPanel';
import { recipientsFromEmailRows, type EmailRecipient } from '@/components/email/emailTemplate';

export type ContactWorkspaceProps = {
  contacts: NormalizedContacts;
  onContactsChange: (next: NormalizedContacts) => Promise<void> | void;
  /** Fallback row label when a TruePeopleSearch paste has no detected name,
   *  and so the default name for a newly-extracted phone/email row. */
  ownerName: string;
  propertyAddress: string; // {{PropertyAddress}} for SendEmailPanel
  owner: string; // {{Owner}} for SendEmailPanel
  /** Fired after a call attempt is recorded, so the host can log its own
   *  activity/stage-progression side effects. Evictions logs an
   *  EvictionActivity of kind `call` and advances the pipeline stage; MLS
   *  has no equivalent yet and may omit this. */
  onCallLogged?: (number: string) => Promise<void> | void;
  /**
   * Fired if the call-logging chain (recording the attempt, then
   * onCallLogged) throws. Kept separate from onContactsChange's own errors
   * — which every caller leaves uncaught, same as before this was a shared
   * component — because callNumber is the primary call action and an
   * unhandled rejection there is too easy to miss silently.
   */
  onCallError?: (message: string) => void;
  saving?: boolean;
  /**
   * Forces the phone-row layout to a single stacked column regardless of
   * viewport width. The default phone-row grid switches to 4 columns at the
   * `md` breakpoint — keyed off the *viewport*, not this component's own
   * container — so a caller nesting several of these side by side (MLS's
   * per-person contact cards) would still hit that breakpoint on a normal
   * screen while each card only has half the width, squeezing the row and
   * risking the page scrolling horizontally. Eviction's single, full-width
   * workspace has no such container and leaves this unset.
   */
  compact?: boolean;
  /**
   * Focuses the paste textarea as soon as this instance mounts, so a paste
   * needs no click first. Used by the skip-trace queue (see
   * SkipTraceQueue.tsx), which remounts this component with a fresh `key`
   * for every person — the mount-time effect that does the focusing fires
   * again on every one of those remounts. Left unset (the default) by every
   * other caller so their own focus/scroll position is undisturbed.
   */
  autoFocus?: boolean;
};

/**
 * The TruePeopleSearch extractor, the Phone Numbers block, and the Emails
 * block (via SendEmailPanel) — the contact workspace originally built for
 * the eviction landlord profile, now shared with any screen that has a
 * NormalizedContacts blob to edit.
 *
 * Freshness: two edits inside one round trip must not both start from the
 * same stale blob (mark a number wrong, then type a note, and the second
 * PATCH would silently revert the first). This component holds its own ref
 * to the freshest known blob and bases every mutation on it, so a later
 * edit always builds on the one before it rather than racing it. Callers
 * that swap which record this workspace is editing (a different landlord
 * opened, a different contact) should remount it with a `key` on that
 * record's id — the ref (and the email-panel draft state) resets on mount
 * and is never re-derived from props after that, matching how the eviction
 * screen already resets its ref by re-fetching on open().
 */
export function ContactWorkspace({
  contacts,
  onContactsChange,
  ownerName,
  propertyAddress,
  owner,
  onCallLogged,
  onCallError,
  saving = false,
  compact = false,
  autoFocus = false,
}: ContactWorkspaceProps) {
  const [rawText, setRawText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Runs once per mount, not on every render — a caller that remounts this
  // component per-record (this component's own `key` convention, see the
  // file header) gets a fresh focus on every record change for free; a
  // caller that keeps the same instance across records won't have this
  // effect re-fire and steal focus back after the user has moved on.
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seeded once, at mount, from the incoming contacts.emailRows — not
  // re-derived on every prop change, or in-progress name/address edits
  // typed into the Send Email panel would be wiped out from under the user.
  // A record with no emails yet gets a single blank row so the panel is
  // still usable to add a first address.
  const [emailRecipients, setEmailRecipients] = useState<EmailRecipient[]>(() => {
    const seeded = recipientsFromEmailRows(contacts.emailRows);
    return seeded.length > 0 ? seeded : [{ name: '', emails: [''] }];
  });

  const contactsRef = useRef<NormalizedContacts | null>(null);
  const currentContacts = () => contactsRef.current ?? contacts;
  const saveContacts = async (next: NormalizedContacts) => {
    contactsRef.current = next;
    await onContactsChange(next);
  };

  const extract = async () => {
    if (!rawText.trim()) return;
    const found = extractContacts(rawText);
    const base = contacts;
    const phoneRows = [...base.phoneRows], emailRows = [...base.emailRows];
    const knownPhones = new Set(phoneRows.flatMap((r) => r.phones.map((p) => p.number.replace(/\D/g, '').slice(-10))));
    const knownEmails = new Set(emailRows.flatMap((r) => r.emails.map((e) => e.address.toLowerCase())));
    const phones = found.phones.filter((p) => !knownPhones.has(p.replace(/\D/g, '').slice(-10))).map((number) => ({ number, status: '', source: 'TruePeopleSearch', attempts: 0, lastAttemptAt: null }));
    const emails = found.emails.filter((e) => !knownEmails.has(e.toLowerCase())).map((address) => ({ address }));
    if (phones.length) phoneRows.push({ name: found.name || ownerName, phones });
    if (emails.length) emailRows.push({ name: found.name || ownerName, emails });
    await onContactsChange({ phoneRows, emailRows });
    setRawText('');
  };

  const callNumber = async (ri: number, pi: number, number: string) => {
    window.open(`tel:${number}`, '_self');
    try {
      await saveContacts(recordAttempt(currentContacts(), ri, pi, new Date()));
      await onCallLogged?.(number);
    } catch (e) {
      // Partial failure here (attempt saved but the host's onCallLogged side
      // effect fails) must not fail silently — this is the primary call
      // action, so an unhandled rejection here is easy to miss entirely.
      onCallError?.(e instanceof Error ? e.message : 'Unable to record this call. Refresh and try again.');
    }
  };

  const setPhoneDisposition = (ri: number, pi: number, status: string) =>
    saveContacts(setContactDisposition(currentContacts(), ri, pi, status));

  const phoneNote = (ri: number, pi: number, note: string) =>
    saveContacts(setPhoneNote(currentContacts(), ri, pi, note));

  const emailNote = (ri: number, ei: number, note: string) =>
    saveContacts(setEmailNote(currentContacts(), ri, ei, note));

  return (
    <>
      <section className="rounded border bg-card p-3.5 space-y-3">
        <h3 className="text-base font-semibold">TruePeopleSearch Contact Extractor</h3>
        <textarea
          ref={textareaRef}
          className="min-h-[120px] w-full resize-y rounded border bg-card px-3 py-2 font-mono text-xs"
          placeholder="Paste all text from TruePeopleSearch; name, phones, and emails will be extracted."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <button
          className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          onClick={extract}
          disabled={!rawText.trim() || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : null}Extract and save
        </button>
      </section>

      {/* md:col-span-2 is inert unless a caller nests this inside a grid
          (as EvictionLeadsView does, pairing the extractor with its own
          Prospecting section) — it just has no effect otherwise. */}
      <section className="rounded border bg-card p-3.5 space-y-2 md:col-span-2">
        <h3 className="text-base font-semibold">Phone Numbers</h3>
        {!contacts.phoneRows.some((r) => r.phones.length) && (
          <p className="text-sm text-muted-foreground">No phone numbers yet. Paste a TruePeopleSearch result above to extract them.</p>
        )}
        {contacts.phoneRows.map((row, ri) => row.phones.map((phone, pi) => (
          <div key={`${ri}-${pi}`} className={`grid gap-2 ${compact ? '' : 'md:grid-cols-[minmax(0,180px)_auto_auto_minmax(0,1fr)]'} items-center ${phone.status === 'wrong' ? 'opacity-50' : ''}`}>
            <button
              className="text-left text-primary record hover:underline disabled:opacity-50 disabled:pointer-events-none"
              onClick={() => callNumber(ri, pi, phone.number)}
              disabled={saving}
            >
              {phone.number}
            </button>
            <span className="text-xs text-muted-foreground record" title="Call attempts">
              {phone.attempts ? `${phone.attempts} tried` : 'not tried'}
            </span>
            <span className="flex gap-1">
              <button
                className={`rounded border px-2 py-1 text-xs disabled:opacity-50 disabled:pointer-events-none ${phone.status === 'right' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                aria-pressed={phone.status === 'right'}
                onClick={() => setPhoneDisposition(ri, pi, phone.status === 'right' ? '' : 'right')}
                disabled={saving}
              >Right number</button>
              <button
                className={`rounded border px-2 py-1 text-xs disabled:opacity-50 disabled:pointer-events-none ${phone.status === 'wrong' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                aria-pressed={phone.status === 'wrong'}
                onClick={() => setPhoneDisposition(ri, pi, phone.status === 'wrong' ? '' : 'wrong')}
                disabled={saving}
              >Wrong number</button>
            </span>
            <input
              className="h-9 w-full rounded border bg-card px-2 text-sm disabled:opacity-50"
              placeholder="Note for this number"
              defaultValue={phone.note || ''}
              onBlur={(e) => phoneNote(ri, pi, e.target.value)}
              disabled={saving}
            />
          </div>
        )))}
      </section>

      <section className="rounded border bg-card p-3.5 space-y-2 md:col-span-2">
        <h3 className="text-base font-semibold">Emails</h3>
        {!contacts.emailRows.some((r) => r.emails.length) && (
          <p className="text-sm text-muted-foreground">No emails yet.</p>
        )}
        {/* Name/address edits made in this panel are session-only for now —
            only the per-email notes persist, through onNoteChange below. */}
        <SendEmailPanel
          recipients={emailRecipients}
          onRecipientsChange={setEmailRecipients}
          propertyAddress={propertyAddress}
          owner={owner}
          showNotes
          onNoteChange={(ri, ei, note) => emailNote(ri, ei, note)}
        />
      </section>
    </>
  );
}
