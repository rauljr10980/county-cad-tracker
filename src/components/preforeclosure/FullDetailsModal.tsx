import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Eye, Send, ExternalLink, MapPin, CheckCircle, Target, RotateCcw, Phone, Star, Trash2, Calendar, CalendarDays, ChevronDown, Home, Building, AlertTriangle, Copy, Search, User, Mail, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useUpdatePreForeclosure, useOwnerLookup } from '@/hooks/usePreForeclosure';
import { PreForeclosureRecord, PreForeclosureType, PreForeclosureStatus, WORKFLOW_STAGES, FOLLOWUP_ELIGIBLE_STAGES, WorkflowStage } from '@/types/property';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { markPreForeclosureVisited, createFollowUp, logActivity } from '@/lib/api';
import { extractCoordsFromGoogleMapsUrl } from '@/lib/geocoding';
import { extractContacts, extractForewarnContacts, type ExtractedContact } from '@/lib/contactParser';
import { PreForeclosureVisitWizard, PreForeclosureVisitResult } from './PreForeclosureVisitWizard';
import { SendEmailPanel, type EmailRecipient } from '@/components/email/SendEmailPanel';

// Mirrors EmailRecipient's shape — PreForeclosure only stores a flat
// phoneNumbers: string[] in the database (no per-phone name), so like
// emailRecipients, the `name` here is session-only grouping, not persisted.
interface PhoneContactRow {
  name: string;
  phones: string[];
  /** Normalized phone -> "MM/DD/YYYY" it was last seen, from the Forewarn
   *  extractor. Session-only, like the row name itself — not persisted. */
  phoneLastSeen?: Record<string, string>;
}

interface FullDetailsModalProps {
  record: PreForeclosureRecord | null;
  isOpen: boolean;
  onClose: () => void;
  recordsInRoutes?: Set<string>;
}

const getTypeColor = (type: PreForeclosureType) => {
  return type === 'Mortgage'
    ? 'bg-purple-500/20 text-purple-500 border-purple-500/30'
    : 'bg-orange-500/20 text-orange-500 border-orange-500/30';
};

export function FullDetailsModal({ record, isOpen, onClose, recordsInRoutes }: FullDetailsModalProps) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdatePreForeclosure();

  const [viewRecord, setViewRecord] = useState<PreForeclosureRecord | null>(null);
  const [markingVisited, setMarkingVisited] = useState<string | null>(null);

  // Action & task state
  const [actionType, setActionType] = useState<'call' | 'text' | 'mail' | 'driveby' | ''>('');
  const [priority, setPriority] = useState<'high' | 'med' | 'low'>('med');
  const [dueDateTime, setDueDateTime] = useState<Date | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<'Luciano' | 'Raul' | ''>('');
  const [savingAction, setSavingAction] = useState(false);
  const [propertyInfoExpanded, setPropertyInfoExpanded] = useState(false);
  const [loanAmountLocal, setLoanAmountLocal] = useState<number | null>(null);
  const [appraisedValueLocal, setAppraisedValueLocal] = useState<number | null>(null);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [routeStatusExpanded, setRouteStatusExpanded] = useState(false);
  const [actionsTasksExpanded, setActionsTasksExpanded] = useState(false);
  const [currentTaskExpanded, setCurrentTaskExpanded] = useState(false);
  const [ownerInfoExpanded, setOwnerInfoExpanded] = useState(false);
  const [showVisitedWizard, setShowVisitedWizard] = useState(false);
  const [wizardPending, setWizardPending] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpTime, setFollowUpTime] = useState('09:00');
  const [followUpNote, setFollowUpNote] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [contactExtractorExpanded, setContactExtractorExpanded] = useState(false);
  const [rawContactText, setRawContactText] = useState('');
  const [forewarnExtractorExpanded, setForewarnExtractorExpanded] = useState(false);
  const [rawForewarnText, setRawForewarnText] = useState('');
  const [emailRecipients, setEmailRecipients] = useState<EmailRecipient[]>([{ name: '', emails: [''] }]);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<PhoneContactRow[]>([{ name: '', phones: [''] }]);
  // The starred phone's own value, not a row/position index — stays correct
  // no matter how rows get reordered/added by the user or the extractor.
  // Converted to the persisted flat ownerPhoneIndex only at save time.
  const [ownerPhoneValue, setOwnerPhoneValue] = useState('');
  // Kept in sync with emailRecipients on every write via updateEmailRecipients
  // (never via a useEffect) so a synchronous read right after a write — e.g.
  // SendEmailPanel's onPersist('post-send'), called right after it reports
  // updated "sent" flags via onRecipientsChange — never sees a stale value.
  const emailRecipientsRef = useRef<EmailRecipient[]>(emailRecipients);
  const updateEmailRecipients = (next: EmailRecipient[]) => {
    emailRecipientsRef.current = next;
    setEmailRecipients(next);
  };
  const lookupMutation = useOwnerLookup();

  // Parse visit details from workflow log
  const visitDetails = useMemo(() => {
    if (!viewRecord?.workflow_log?.length) return null;
    const visitEntry = viewRecord.workflow_log.find(
      (entry) => entry.outcome && entry.outcome.includes('Owner answered:')
    );
    if (!visitEntry) return null;

    const parts = visitEntry.outcome.split(' | ');
    const get = (prefix: string) => {
      const part = parts.find((p) => p.startsWith(prefix));
      return part ? part.slice(prefix.length).trim() : null;
    };

    return {
      ownerAnswered: get('Owner answered:') === 'Yes',
      phone: get('Phone:'),
      noPhoneProvided: parts.includes('No phone provided'),
      foreclosureSolved: get('Foreclosure solved:') === 'Yes',
      propertyType: get('Property:'),
      condition: get('Condition:'),
      visitedBy: visitEntry.actingAs,
      visitedAt: visitEntry.timestamp,
    };
  }, [viewRecord?.workflow_log]);

  // Sync local state from record prop
  useEffect(() => {
    if (record) {
      setViewRecord({ ...record });
      setActionType(record.actionType || '');
      setPriority(record.priority || 'med');
      setDueDateTime(record.dueTime ? new Date(record.dueTime) : undefined);
      setAssignedTo(record.assignedTo || '');
      setLoanAmountLocal(record.loan_amount ?? null);
      setAppraisedValueLocal(record.appraised_value ?? null);
      updateEmailRecipients(
        record.emails && record.emails.length > 0
          ? [{ name: record.ownerName || '', emails: record.emails }]
          : [{ name: record.ownerName || '', emails: [''] }]
      );
      setPhoneContacts(
        record.phoneNumbers && record.phoneNumbers.length > 0
          ? [{ name: record.ownerName || '', phones: record.phoneNumbers }]
          : [{ name: record.ownerName || '', phones: [''] }]
      );
      setOwnerPhoneValue(
        record.ownerPhoneIndex != null && record.phoneNumbers?.[record.ownerPhoneIndex]
          ? record.phoneNumbers[record.ownerPhoneIndex]
          : ''
      );
    }
  }, [record]);

  // Persists Send Email's recipient emails for this record. Passed to
  // SendEmailPanel as onPersist — called once before "Send to All" starts
  // (so unsaved row edits survive a failure partway through) and once after
  // (so "sent" flags are recorded). PreForeclosure has no rich contacts JSON
  // like Property does — just the flat `emails` column also fed by the
  // Contact Extractor above — so per-recipient names live only in this
  // modal's own session state, not persisted.
  const flattenPhones = (rows: PhoneContactRow[]): string[] =>
    rows.flatMap(r => r.phones.filter(p => p.trim()));

  const handleSavePhones = async () => {
    if (!viewRecord) return;
    try {
      const allPhones = flattenPhones(phoneContacts);
      const ownerIdx = ownerPhoneValue ? allPhones.indexOf(ownerPhoneValue) : -1;
      const ownerPhoneIndex = ownerIdx >= 0 ? ownerIdx : undefined;
      await updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        phoneNumbers: allPhones,
        ownerPhoneIndex,
      });
      setViewRecord(prev => prev ? { ...prev, phoneNumbers: allPhones, ownerPhoneIndex } : prev);
      toast({ title: 'Phone Numbers Saved', description: 'Phone numbers have been saved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    } catch (error) {
      console.error('Error saving phone numbers:', error);
      toast({ title: 'Error', description: 'Failed to save phone numbers. Please try again.', variant: 'destructive' });
    }
  };

  const handleToggleOwnerPhone = async (phone: string) => {
    if (!viewRecord || !phone.trim()) return;
    const nextOwnerValue = ownerPhoneValue === phone ? '' : phone;
    setOwnerPhoneValue(nextOwnerValue);
    const allPhones = flattenPhones(phoneContacts);
    const ownerIdx = nextOwnerValue ? allPhones.indexOf(nextOwnerValue) : -1;
    const ownerPhoneIndex = ownerIdx >= 0 ? ownerIdx : undefined;
    try {
      await updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        phoneNumbers: allPhones,
        ownerPhoneIndex,
      });
      setViewRecord(prev => prev ? { ...prev, phoneNumbers: allPhones, ownerPhoneIndex } : prev);
    } catch (error) {
      console.error('Error saving owner phone index:', error);
    }
  };

  const persistEmailContacts = async () => {
    if (!viewRecord) return;
    const allEmails = emailRecipientsRef.current.flatMap(r => r.emails.filter(e => e.includes('@')));
    await updateMutation.mutateAsync({
      document_number: viewRecord.document_number,
      emails: allEmails,
    });
    setViewRecord(prev => prev ? { ...prev, emails: allEmails } : prev);
  };

  // Shared by both Contact Extractor sections (True People Search and
  // Forewarn) — they differ only in which parser reads the pasted text.
  // Smart row placement: land extracted phones/emails under an existing
  // same-name or empty row rather than a new one, so re-pasting a corrected
  // TruePeopleSearch dump or a follow-up Forewarn lookup for the same
  // person merges into that person's row instead of duplicating it.
  const runContactExtraction = async (
    parser: (text: string) => ExtractedContact,
    rawText: string,
    clearRawText: () => void,
  ) => {
    if (!viewRecord) return;
    const result = parser(rawText);

    const existingDigits = new Set(
      phoneContacts.flatMap(r => r.phones.filter(p => p.trim()).map(p => p.replace(/\D/g, '').slice(-10)))
    );
    const newPhones = result.phones.filter(p => !existingDigits.has(p.replace(/\D/g, '').slice(-10)));
    let finalPhoneRows = phoneContacts;
    if (newPhones.length > 0 || result.name) {
      const updated = [...phoneContacts];
      const row1Empty = !updated[0].name.trim() && !updated[0].phones.some(p => p.trim());
      const row1SameName = result.name && updated[0].name.trim().toLowerCase() === result.name.toLowerCase();
      let targetRow: number;
      if (row1Empty || row1SameName) {
        targetRow = 0;
      } else {
        const emptyIdx = updated.findIndex((r, i) => i > 0 && !r.name.trim() && !r.phones.some(p => p.trim()));
        targetRow = emptyIdx !== -1 ? emptyIdx : updated.length;
        if (emptyIdx === -1) updated.push({ name: '', phones: [''] });
      }
      updated[targetRow] = {
        name: result.name || '',
        phones: newPhones.length > 0 ? newPhones : [''],
        phoneLastSeen: result.phoneLastSeen
          ? { ...updated[targetRow].phoneLastSeen, ...result.phoneLastSeen }
          : updated[targetRow].phoneLastSeen,
      };
      finalPhoneRows = updated;
      setPhoneContacts(updated);
    }
    const mergedPhones = flattenPhones(finalPhoneRows);

    const existingEmailSet = new Set(
      emailRecipientsRef.current.flatMap(r => r.emails.filter(e => e.includes('@')).map(e => e.toLowerCase().trim()))
    );
    const newEmails = result.emails.filter(e => !existingEmailSet.has(e.toLowerCase().trim()));
    let finalEmailRows = emailRecipientsRef.current;
    if (newEmails.length > 0 || result.name) {
      const updated = [...emailRecipientsRef.current];
      const row1Empty = !updated[0].name.trim() && !updated[0].emails.some(e => e.includes('@'));
      const row1SameName = result.name && updated[0].name.trim().toLowerCase() === result.name.toLowerCase();
      let targetRow: number;
      if (row1Empty || row1SameName) {
        targetRow = 0;
      } else {
        const emptyIdx = updated.findIndex((r, i) => i > 0 && !r.name.trim() && !r.emails.some(e => e.includes('@')));
        targetRow = emptyIdx !== -1 ? emptyIdx : updated.length;
        if (emptyIdx === -1) updated.push({ name: '', emails: [''] });
      }
      updated[targetRow] = {
        name: result.name || '',
        emails: newEmails.length > 0 ? newEmails : [''],
      };
      finalEmailRows = updated;
      updateEmailRecipients(updated);
    }
    const allEmails = finalEmailRows.flatMap(r => r.emails.filter(e => e.includes('@')));
    const ownerIdx = ownerPhoneValue ? mergedPhones.indexOf(ownerPhoneValue) : -1;
    const ownerPhoneIndex = ownerIdx >= 0 ? ownerIdx : undefined;

    setViewRecord(prev => prev ? { ...prev, phoneNumbers: mergedPhones, ownerPhoneIndex, emails: allEmails } : prev);
    try {
      await updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        phoneNumbers: mergedPhones,
        ownerPhoneIndex,
        emails: allEmails,
      });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
      const parts: string[] = [];
      if (result.name) parts.push(`Name: ${result.name}`);
      if (newPhones.length > 0) parts.push(`${newPhones.length} phone(s) added`);
      if (newEmails.length > 0) parts.push(`${newEmails.length} email(s) added`);
      const dupes = (result.phones.length - newPhones.length) + (result.emails.length - newEmails.length);
      if (dupes > 0) parts.push(`${dupes} duplicate(s) skipped`);
      toast({
        title: parts.length > 0 ? 'Contacts Extracted' : 'No new contacts found',
        description: parts.join(', ') || 'Try pasting more text',
        variant: parts.length > 0 ? 'default' : 'destructive',
      });
      if (newEmails.length > 0) setEmailExpanded(true);
    } catch {
      toast({ title: 'Error saving contacts', variant: 'destructive' });
    }
    clearRawText();
  };

  const handleMarkVisited = async (documentNumber: string, driver: 'Luciano' | 'Raul', visited: boolean) => {
    setMarkingVisited(documentNumber);
    try {
      await markPreForeclosureVisited(documentNumber, driver, visited);
      toast({
        title: visited ? 'Record Marked as Visited' : 'Record Unmarked',
        description: `Document ${documentNumber} has been ${visited ? 'marked as visited' : 'set back to pending'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update visited status',
        variant: 'destructive',
      });
    } finally {
      setMarkingVisited(null);
    }
  };

  const handleSaveAction = async () => {
    if (!viewRecord || !actionType || !dueDateTime) {
      toast({
        title: "Missing Information",
        description: "Please select an action type and due date/time",
        variant: "destructive",
      });
      return;
    }

    setSavingAction(true);
    try {
      const isoDateTime = dueDateTime.toISOString();
      await updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        last_action_date: new Date().toISOString(),
        actionType: actionType,
        priority: priority,
        dueTime: isoDateTime,
        assignedTo: assignedTo || undefined,
      });

      toast({
        title: "Action Scheduled",
        description: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} scheduled for ${format(dueDateTime, 'MMM d, yyyy h:mm a')}${assignedTo ? ` - Assigned to ${assignedTo}` : ''}`,
      });

      setViewRecord(prev => prev ? {
        ...prev,
        actionType,
        priority,
        dueTime: isoDateTime,
        assignedTo: assignedTo || undefined,
      } : prev);

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to schedule action';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleClearTask = async () => {
    if (!viewRecord) return;

    setSavingAction(true);
    try {
      await updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        actionType: undefined,
        priority: undefined,
        dueTime: undefined,
        assignedTo: undefined,
      });

      toast({
        title: "Task Cleared",
        description: "Task has been cleared successfully.",
      });

      setViewRecord(prev => prev ? {
        ...prev,
        actionType: undefined,
        priority: undefined,
        dueTime: undefined,
        assignedTo: undefined,
      } : prev);

      setActionType('');
      setPriority('med');
      setDueDateTime(undefined);
      setAssignedTo('');

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to clear task',
        variant: "destructive",
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleOwnerLookup = async () => {
    if (!viewRecord) return;
    try {
      const result = await lookupMutation.mutateAsync(viewRecord.document_number);
      setViewRecord(prev => prev ? {
        ...prev,
        ownerName: result.ownerName || prev.ownerName,
        ownerAddress: result.ownerAddress || prev.ownerAddress,
        emails: result.emails || prev.emails,
        phoneNumbers: result.phoneNumbers || prev.phoneNumbers,
        ownerPhoneIndex: result.ownerPhoneIndex ?? prev.ownerPhoneIndex,
        ownerLookupAt: new Date().toISOString(),
        ownerLookupStatus: result.partial ? 'partial' : 'success',
      } : prev);
      toast({
        title: result.partial ? 'Partial Results' : 'Owner Found',
        description: result.partial
          ? `Found owner info but people search failed: ${result.peopleSearchError || 'unknown error'}`
          : `Found ${result.ownerName}${result.phoneNumbers?.length ? ` with ${result.phoneNumbers.length} phone number(s)` : ''}`,
      });
    } catch (error) {
      setViewRecord(prev => prev ? {
        ...prev,
        ownerLookupStatus: 'failed',
        ownerLookupAt: new Date().toISOString(),
      } : prev);
      toast({
        title: 'Lookup Failed',
        description: error instanceof Error ? error.message : 'Owner lookup failed',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    // Save notes on dialog close
    if (viewRecord) {
      updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        notes: viewRecord.notes || '',
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
      }).catch(() => {});
    }
    onClose();
  };

  if (!viewRecord) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleClose();
    }}>
      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Pre-Foreclosure Details
          </DialogTitle>
          <DialogDescription>
            Document #{viewRecord.document_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-x-hidden break-words">
          {/* Actions Panel */}
          <div className="bg-secondary/30 rounded-lg p-3 sm:p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setActionsExpanded(prev => !prev)}
            >
              <span className="text-sm font-medium">Actions</span>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !actionsExpanded && "-rotate-90"
              )} />
            </div>
            {actionsExpanded && <div className="flex flex-wrap gap-2 mt-3">
              <Button
                variant="default"
                size="sm"
                className="min-w-[100px] bg-primary text-primary-foreground"
                disabled
              >
                <Eye className="h-4 w-4 mr-1.5" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[100px]"
                onClick={() => {
                  if (viewRecord.latitude != null && viewRecord.longitude != null) {
                    const mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(viewRecord.address)},+${encodeURIComponent(viewRecord.city)},+TX+${viewRecord.zip}/@${viewRecord.latitude},${viewRecord.longitude},16z`;
                    window.open(mapsUrl, '_blank');
                  } else {
                    toast({
                      title: 'Location not available',
                      description: 'Latitude and longitude are not available for this property',
                      variant: 'destructive',
                    });
                  }
                }}
                disabled={viewRecord.latitude == null || viewRecord.longitude == null}
                title="Open in Google Maps"
              >
                <Send className="h-4 w-4 mr-1.5" />
                Maps
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[100px]"
                onClick={() => {
                  window.open('https://bexar.acttax.com/act_webdev/bexar/index.jsp', '_blank');
                }}
                title="Tax Assessor"
              >
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Tax Assessor
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[100px]"
                onClick={() => {
                  const address = viewRecord.address || '';
                  const cityStateZip = `${viewRecord.city || 'San Antonio'}, TX ${viewRecord.zip || ''}`.trim();
                  window.open(`https://www.truepeoplesearch.com/results?name=${encodeURIComponent(address)}&citystatezip=${encodeURIComponent(cityStateZip)}`, '_blank');
                }}
                title="TruePeopleSearch"
              >
                <User className="h-4 w-4 mr-1.5" />
                TruePeopleSearch
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[100px]"
                onClick={() => {
                  const raw = (viewRecord.address || '').split(',')[0].trim();
                  const streetMatch = raw.match(/^.*?\b(AVE|DR|ST|BLVD|LN|CT|PL|RD|WAY|TRL|CIR|HWY|PKWY|LOOP|EXPY|PASS|ROW|SQ|TER|TERR|TRACE|VIA|WALK)\b/i);
                  const street = streetMatch ? streetMatch[0].trim() : raw;
                  const url = street
                    ? `https://bexar.tx.publicsearch.us/results?department=RP&keywordSearch=false&recordedDateRange=18000101%2C20260304&searchOcrText=false&searchType=quickSearch&searchValue=${encodeURIComponent(street)}`
                    : 'https://bexar.tx.publicsearch.us/';
                  window.open(url, '_blank');
                }}
                title="Land Records"
              >
                <Building className="h-4 w-4 mr-1.5" />
                Land Records
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[100px]"
                onClick={() => {
                  const url = `https://bexar.tx.publicsearch.us/results?department=FC&instrumentDateRange=20000404%2C20270406&keywordSearch=false&searchOcrText=false&searchType=quickSearch&searchValue=${encodeURIComponent(viewRecord.document_number)}`;
                  window.open(url, '_blank');
                }}
                title="Foreclosure Notice (search by document number, e.g. for loan amount)"
              >
                <Search className="h-4 w-4 mr-1.5" />
                Foreclosure Notice
              </Button>
            </div>}
          </div>

          {/* Property Information */}
          <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 space-y-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setPropertyInfoExpanded(prev => !prev)}
            >
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Property Information
              </h3>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !propertyInfoExpanded && "-rotate-90"
              )} />
            </div>
            {propertyInfoExpanded && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Document Number</Label>
                <p className="font-mono text-sm">{viewRecord.document_number}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Type</Label>
                <Badge
                  variant="outline"
                  className={getTypeColor(viewRecord.type)}
                >
                  {viewRecord.type}
                </Badge>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-muted-foreground text-xs flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Address
                </Label>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-sm">{viewRecord.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {viewRecord.city}, TX {viewRecord.zip}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 flex-shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(viewRecord.address || '');
                      toast({ title: 'Address copied' });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Loan Amount</Label>
                <Input
                  className="font-mono text-sm h-8 mt-1"
                  placeholder="e.g. $150,000"
                  key={`loan-${viewRecord.document_number}`}
                  defaultValue={loanAmountLocal != null ? `$${loanAmountLocal.toLocaleString('en-US')}` : ''}
                  onFocus={(e) => { e.target.value = loanAmountLocal != null ? String(loanAmountLocal) : ''; }}
                  onBlur={(e) => {
                    const raw = e.target.value.replace(/[$,]/g, '').trim();
                    const parsed = raw ? parseFloat(raw) : null;
                    e.target.value = parsed != null ? `$${parsed.toLocaleString('en-US')}` : '';
                    setLoanAmountLocal(parsed);
                    if (parsed !== (viewRecord.loan_amount ?? null)) {
                      updateMutation.mutateAsync({ document_number: viewRecord.document_number, loan_amount: parsed });
                    }
                  }}
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Appraised Market Value</Label>
                <Input
                  className="font-mono text-sm h-8 mt-1"
                  placeholder="e.g. $200,000"
                  key={`appraised-${viewRecord.document_number}`}
                  defaultValue={appraisedValueLocal != null ? `$${appraisedValueLocal.toLocaleString('en-US')}` : ''}
                  onFocus={(e) => { e.target.value = appraisedValueLocal != null ? String(appraisedValueLocal) : ''; }}
                  onBlur={(e) => {
                    const raw = e.target.value.replace(/[$,]/g, '').trim();
                    const parsed = raw ? parseFloat(raw) : null;
                    e.target.value = parsed != null ? `$${parsed.toLocaleString('en-US')}` : '';
                    setAppraisedValueLocal(parsed);
                    if (parsed !== (viewRecord.appraised_value ?? null)) {
                      updateMutation.mutateAsync({ document_number: viewRecord.document_number, appraised_value: parsed });
                    }
                  }}
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Property Type</Label>
                <Select
                  value={viewRecord.land_type ?? 'unset'}
                  onValueChange={(val) => {
                    const landType = val === 'unset' ? null : val as 'Home' | 'Vacant Land';
                    setViewRecord(prev => prev ? { ...prev, land_type: landType } : prev);
                    updateMutation.mutateAsync({ document_number: viewRecord.document_number, land_type: landType });
                  }}
                >
                  <SelectTrigger className="h-8 mt-1 text-sm">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">— Not set —</SelectItem>
                    <SelectItem value="Home">Home</SelectItem>
                    <SelectItem value="Vacant Land">Vacant Land</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {loanAmountLocal != null && appraisedValueLocal != null && appraisedValueLocal > 0 && (() => {
                const ratio = (loanAmountLocal / appraisedValueLocal) * 100;
                const equity = appraisedValueLocal - loanAmountLocal;
                const good = appraisedValueLocal > loanAmountLocal;
                return (
                  <div className="sm:col-span-2">
                    <Label className="text-muted-foreground text-xs">Loan-to-Value Ratio</Label>
                    <div className={`mt-1 flex items-center gap-3 px-3 py-2 rounded-lg border ${good ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                      <span className={`text-xl font-bold font-mono ${good ? 'text-green-400' : 'text-red-400'}`}>{ratio.toFixed(1)}%</span>
                      <div className="text-xs text-muted-foreground">
                        <p>{good ? '✓ Equity available' : '✗ Underwater'}</p>
                        <p>Equity: <span className={`font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>${equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div>
                <Label className="text-muted-foreground text-xs">Latitude</Label>
                <Input
                  className="font-mono text-sm h-8 mt-1"
                  type="number"
                  step="any"
                  placeholder="N/A"
                  defaultValue={viewRecord.latitude != null ? viewRecord.latitude : ''}
                  key={`lat-${viewRecord.document_number}`}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    const newLat = val ? parseFloat(val) : null;
                    if (newLat !== viewRecord.latitude) {
                      updateMutation.mutateAsync({
                        document_number: viewRecord.document_number,
                        latitude: newLat,
                      });
                    }
                  }}
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Longitude</Label>
                <Input
                  className="font-mono text-sm h-8 mt-1"
                  type="number"
                  step="any"
                  placeholder="N/A"
                  defaultValue={viewRecord.longitude != null ? viewRecord.longitude : ''}
                  key={`lng-${viewRecord.document_number}`}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    const newLng = val ? parseFloat(val) : null;
                    if (newLng !== viewRecord.longitude) {
                      updateMutation.mutateAsync({
                        document_number: viewRecord.document_number,
                        longitude: newLng,
                      });
                    }
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-muted-foreground text-xs flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Paste Google Maps Link
                </Label>
                <Input
                  className="font-mono text-xs h-8 mt-1"
                  placeholder="https://www.google.com/maps/@..."
                  key={`maps-${viewRecord.document_number}`}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    const coords = extractCoordsFromGoogleMapsUrl(pasted);
                    if (coords) {
                      updateMutation.mutateAsync({
                        document_number: viewRecord.document_number,
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                      }).then(() => {
                        toast({
                          title: 'Coordinates updated',
                          description: `Set to ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} from Google Maps link`,
                        });
                      });
                    } else {
                      toast({
                        title: 'Invalid link',
                        description: 'Could not extract coordinates from that URL. Make sure it\'s a Google Maps link.',
                        variant: 'destructive',
                      });
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Search the address on Google Maps, copy the URL, and paste it here
                </p>
              </div>
              {viewRecord.school_district && (
                <div className="sm:col-span-2">
                  <Label className="text-muted-foreground text-xs">School District</Label>
                  <p className="text-sm">{viewRecord.school_district}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground text-xs">Filing Month</Label>
                <p className="text-sm">{viewRecord.filing_month}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">County</Label>
                <p className="text-sm">{viewRecord.county}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Recorded Date</Label>
                <p className="text-sm">{viewRecord.recorded_date ? (() => {
                  const dateStr = viewRecord.recorded_date!.split('T')[0];
                  const [year, month, day] = dateStr.split('-');
                  return `${month}/${day}/${year}`;
                })() : 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Sale Date</Label>
                <p className="text-sm">{viewRecord.sale_date ? (() => {
                  const dateStr = viewRecord.sale_date!.split('T')[0];
                  const [year, month, day] = dateStr.split('-');
                  return `${month}/${day}/${year}`;
                })() : 'N/A'}</p>
              </div>

              {/* Visit Details */}
              {visitDetails && (
                <div className="sm:col-span-2 pt-3 mt-3 border-t border-border/50">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide mb-2 block">Visit Details</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-muted-foreground text-xs">Property Type</Label>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {visitDetails.propertyType === 'Primary Home' ? (
                          <Home className="h-3.5 w-3.5 text-blue-400" />
                        ) : visitDetails.propertyType === 'Rental' ? (
                          <Building className="h-3.5 w-3.5 text-purple-400" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                        )}
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          visitDetails.propertyType === 'Primary Home' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                          visitDetails.propertyType === 'Rental' && "bg-purple-500/20 text-purple-400 border-purple-500/30",
                          visitDetails.propertyType === 'Vacant' && "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                        )}>
                          {visitDetails.propertyType}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Condition</Label>
                      <p className="text-sm font-medium mt-0.5">{visitDetails.condition}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Owner Answered</Label>
                      <Badge variant="outline" className={cn(
                        "text-xs mt-0.5",
                        visitDetails.ownerAnswered
                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                          : "bg-red-500/20 text-red-400 border-red-500/30"
                      )}>
                        {visitDetails.ownerAnswered ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Foreclosure Solved</Label>
                      <Badge variant="outline" className={cn(
                        "text-xs mt-0.5",
                        visitDetails.foreclosureSolved
                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {visitDetails.foreclosureSolved ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    {visitDetails.ownerAnswered && (
                      <div>
                        <Label className="text-muted-foreground text-xs">Phone Provided</Label>
                        <p className="text-sm mt-0.5">
                          {visitDetails.phone ? visitDetails.phone : 'No'}
                        </p>
                      </div>
                    )}
                    {visitDetails.visitedBy && (
                      <div>
                        <Label className="text-muted-foreground text-xs">Visited By</Label>
                        <p className="text-sm mt-0.5">{visitDetails.visitedBy}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>}
          </div>

          {/* Sales Activity & Contact Status */}
          <div className="bg-card border border-border/60 rounded-lg p-3 space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Log Sales Activity</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { type: 'CONTACT_MADE'    as const, label: 'Contact Made',    color: 'border-blue-500/50 text-blue-400 hover:bg-blue-500/10' },
                  { type: 'APPOINTMENT_SET' as const, label: 'Appt Set',        color: 'border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10' },
                  { type: 'CONTRACT_SIGNED' as const, label: 'Contract Signed', color: 'border-green-500/50 text-green-400 hover:bg-green-500/10' },
                ]).map(({ type, label, color }) => (
                  <Button key={type} size="sm" variant="outline"
                    className={`h-9 text-xs ${color}`}
                    onClick={async () => {
                      await logActivity(type, { drivingLeadId: undefined });
                      toast({ title: label + ' logged', description: 'Saved to team stats.' });
                    }}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide block">Contact Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: 'Contacted', value: 'Contact Attempted', color: 'bg-blue-600 hover:bg-blue-700' },
                  { label: 'Not Contacted', value: 'New', color: 'bg-zinc-600 hover:bg-zinc-700' },
                  { label: 'Wants to Make a Deal', value: 'Wants to Make a Deal', color: 'bg-green-600 hover:bg-green-700' },
                  { label: 'Dead', value: 'Dead', color: 'bg-red-700 hover:bg-red-800' },
                ] as { label: string; value: PreForeclosureStatus; color: string }[]).map(({ label, value, color }) => {
                  const isActive = viewRecord.internal_status === value;
                  return (
                    <Button
                      key={value}
                      size="sm"
                      className={cn(
                        'text-white text-xs h-9',
                        isActive ? color : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                      )}
                      onClick={async () => {
                        setViewRecord(prev => prev ? { ...prev, internal_status: value } : prev);
                        try {
                          await updateMutation.mutateAsync({
                            document_number: viewRecord.document_number,
                            internal_status: value,
                          });
                          queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                          toast({ title: 'Status updated', description: label });
                        } catch {
                          toast({ title: 'Error saving status', variant: 'destructive' });
                        }
                      }}
                      disabled={updateMutation.isPending}
                    >
                      {isActive && <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Schedule Follow-Up */}
          {viewRecord.workflow_stage && FOLLOWUP_ELIGIBLE_STAGES.includes(viewRecord.workflow_stage as any) && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-400">Schedule Follow-Up</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {followUpDate ? format(followUpDate, 'PPP') : 'Pick a follow-up date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={followUpDate}
                    onSelect={setFollowUpDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <input
                type="time"
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
              <Input
                className="mt-2"
                placeholder="Optional note... (e.g. Call back Monday)"
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
              />
              <Button
                size="sm"
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700"
                disabled={!followUpDate || savingFollowUp}
                onClick={async () => {
                  if (!followUpDate || !viewRecord) return;
                  setSavingFollowUp(true);
                  try {
                    const [hrs, mins] = followUpTime.split(':').map(Number);
                    const combined = new Date(followUpDate);
                    combined.setHours(hrs, mins, 0, 0);
                    await createFollowUp({
                      date: combined.toISOString(),
                      note: followUpNote || undefined,
                      documentNumber: viewRecord.document_number,
                    });
                    toast({ title: 'Follow-up scheduled', description: format(combined, 'PPP p') });
                    setFollowUpDate(undefined);
                    setFollowUpTime('09:00');
                    setFollowUpNote('');
                  } catch {
                    toast({ title: 'Error', description: 'Failed to schedule follow-up', variant: 'destructive' });
                  } finally {
                    setSavingFollowUp(false);
                  }
                }}
              >
                {savingFollowUp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarDays className="h-4 w-4 mr-2" />}
                {savingFollowUp ? 'Scheduling...' : 'Schedule Follow-Up'}
              </Button>
            </div>
          )}

          {/* Owner Information - hidden */}

          {/* Phone Numbers Section */}
          <div className="bg-secondary/30 rounded-lg p-3 sm:p-4" style={{ display: 'block' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Phone Numbers</span>
              </div>
            </div>
            <div className="space-y-2">
              {phoneContacts.map((row, rowIdx) => (
                <div key={rowIdx} className="flex items-center gap-2">
                  <span className="text-xs w-6 shrink-0 flex items-center justify-center text-muted-foreground">
                    {rowIdx + 1}.
                  </span>
                  <Input
                    value={row.name}
                    onChange={(e) => {
                      const updated = [...phoneContacts];
                      updated[rowIdx] = { ...updated[rowIdx], name: e.target.value };
                      setPhoneContacts(updated);
                    }}
                    placeholder="Name"
                    className="w-28 shrink-0"
                  />
                  <div className="flex-1 overflow-x-auto">
                    <div className="flex items-center gap-1.5">
                      {row.phones.map((phone, phoneIdx) => {
                        const isOwnerPhone = !!phone.trim() && phone === ownerPhoneValue;
                        const lastSeen = row.phoneLastSeen?.[phone];
                        return (
                          <div key={phoneIdx} className="flex flex-col gap-0.5 shrink-0">
                            <div className="flex items-center gap-1">
                              <Input
                                type="tel"
                                value={phone}
                                onChange={(e) => {
                                  const updated = [...phoneContacts];
                                  const newPhones = [...updated[rowIdx].phones];
                                  newPhones[phoneIdx] = e.target.value;
                                  updated[rowIdx] = { ...updated[rowIdx], phones: newPhones };
                                  setPhoneContacts(updated);
                                }}
                                placeholder={`Phone ${phoneIdx + 1}`}
                                className="w-[150px] shrink-0 text-xs"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-7 w-7 shrink-0", isOwnerPhone && "text-yellow-500")}
                                onClick={() => handleToggleOwnerPhone(phone)}
                                disabled={!phone.trim()}
                                title={isOwnerPhone ? "Owner's phone (click to unmark)" : "Click star for owner phone number"}
                              >
                                <Star className={cn("h-3.5 w-3.5", isOwnerPhone ? "fill-yellow-500" : "fill-none")} />
                              </Button>
                            </div>
                            {lastSeen && (
                              <span className="text-[10px] text-muted-foreground px-1">Last seen {lastSeen}</span>
                            )}
                          </div>
                        );
                      })}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                        onClick={() => {
                          const updated = [...phoneContacts];
                          updated[rowIdx] = { ...updated[rowIdx], phones: [...updated[rowIdx].phones, ''] };
                          setPhoneContacts(updated);
                        }}
                        title="Add phone field"
                      >
                        <span className="text-lg leading-none">+</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setPhoneContacts([...phoneContacts, { name: '', phones: [''] }])}
              >
                + Add contact
              </Button>
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" onClick={handleSavePhones} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Phone Numbers'
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* True People Search Contact Extractor Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setContactExtractorExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">True People Search Contact Extractor</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    const address = viewRecord.address || '';
                    const cityStateZip = `${viewRecord.city || 'San Antonio'}, TX ${viewRecord.zip || ''}`.trim();
                    window.open(`https://www.truepeoplesearch.com/results?name=${encodeURIComponent(address)}&citystatezip=${encodeURIComponent(cityStateZip)}`, '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  TruePeopleSearch
                </Button>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !contactExtractorExpanded && "-rotate-90"
                )} />
              </div>
            </div>
            {contactExtractorExpanded && (
              <div className="space-y-3 mt-3">
                <Textarea
                  value={rawContactText}
                  onChange={(e) => setRawContactText(e.target.value)}
                  placeholder="Paste raw text from TruePeopleSearch or similar site..."
                  className="min-h-[120px] text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!rawContactText.trim()}
                  onClick={() => runContactExtraction(extractContacts, rawContactText, () => setRawContactText(''))}
                >
                  Extract Contacts
                </Button>
              </div>
            )}
          </div>

          {/* Forewarn Contact Extractor Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setForewarnExtractorExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Forewarn Contact Extractor</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open('https://app.forewarn.com/search', '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Forewarn
                </Button>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !forewarnExtractorExpanded && "-rotate-90"
                )} />
              </div>
            </div>
            {forewarnExtractorExpanded && (
              <div className="space-y-3 mt-3">
                <Textarea
                  value={rawForewarnText}
                  onChange={(e) => setRawForewarnText(e.target.value)}
                  placeholder="Paste raw text from Forewarn (Ctrl+A, Ctrl+C on the record page)..."
                  className="min-h-[120px] text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!rawForewarnText.trim()}
                  onClick={() => runContactExtraction(extractForewarnContacts, rawForewarnText, () => setRawForewarnText(''))}
                >
                  Extract Contacts
                </Button>
              </div>
            )}
          </div>

          {/* Send Email Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setEmailExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Send Email</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !emailExpanded && "-rotate-90"
              )} />
            </div>
            <SendEmailPanel
              hidden={!emailExpanded}
              recipients={emailRecipients}
              onRecipientsChange={updateEmailRecipients}
              propertyAddress={viewRecord.address || ''}
              owner={viewRecord.ownerName || 'Property Owner'}
              phoneNumber={viewRecord.phoneNumbers?.[viewRecord.ownerPhoneIndex ?? 0] || ''}
              onPersist={persistEmailContacts}
              resetKey={`${viewRecord.document_number}:${isOpen}`}
            />
          </div>

          {/* Tasks Section */}
          <div className="space-y-4">
            {/* Notes Section */}
            <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Notes
              </h3>
              <div className="space-y-2">
                <Textarea
                  value={viewRecord.notes || ''}
                  onChange={(e) => {
                    setViewRecord({
                      ...viewRecord,
                      notes: e.target.value,
                    });
                  }}
                  placeholder="Add notes about this property..."
                  className="min-h-[100px] resize-none"
                  onBlur={async () => {
                    try {
                      await updateMutation.mutateAsync({
                        document_number: viewRecord.document_number,
                        notes: viewRecord.notes || '',
                      });
                      toast({
                        title: 'Notes Saved',
                        description: 'Notes have been saved successfully.',
                      });
                      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                    } catch (error) {
                      console.error('Error saving notes:', error);
                      toast({
                        title: 'Error',
                        description: 'Failed to save notes. Please try again.',
                        variant: 'destructive',
                      });
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Notes are automatically saved when you click away from the text area.
                </p>
              </div>

              {/* Visit Notes from Workflow Log */}
              {viewRecord.workflow_log && viewRecord.workflow_log.filter(e => e.note).length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border/50">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Visit History Notes</h4>
                  {viewRecord.workflow_log.filter(e => e.note).map((entry) => (
                    <div key={entry.id} className="bg-muted/30 rounded p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-primary">
                          {entry.actingAs || 'Unknown'} — {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {WORKFLOW_STAGES[entry.toStage]?.label || entry.toStage}
                        </span>
                      </div>
                      <p className="text-sm">{entry.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Route Status Section */}
            <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 space-y-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setRouteStatusExpanded(prev => !prev)}
              >
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Route Status
                </h3>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !routeStatusExpanded && "-rotate-90"
                )} />
              </div>
              {routeStatusExpanded && <div className="space-y-3">
                <div>
                  <Label className="text-muted-foreground text-xs mb-2 block">Current Status</Label>
                  <div className="flex items-center gap-2">
                    {viewRecord.visited === true ? (
                      <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                        Visited
                      </Badge>
                    ) : recordsInRoutes && recordsInRoutes.has(viewRecord.document_number) ? (
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        In Route
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        Not in Route
                      </Badge>
                    )}
                    {viewRecord.visited === true && viewRecord.visited_by && (
                      <span className="text-xs text-muted-foreground">
                        by {viewRecord.visited_by}
                      </span>
                    )}
                    {viewRecord.visited === true && viewRecord.visited_at && (
                      <span className="text-xs text-muted-foreground">
                        on {format(new Date(viewRecord.visited_at), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {viewRecord.visited === true ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const driver = viewRecord.visited_by || 'Luciano';
                        await handleMarkVisited(viewRecord.document_number, driver as 'Luciano' | 'Raul', false);
                        setViewRecord({
                          ...viewRecord,
                          visited: false,
                          visited_at: undefined,
                          visited_by: undefined,
                        });
                      }}
                      disabled={markingVisited === viewRecord.document_number}
                    >
                      {markingVisited === viewRecord.document_number ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Set Not Visited
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={async () => {
                          await handleMarkVisited(viewRecord.document_number, 'Luciano', true);
                          setViewRecord({
                            ...viewRecord,
                            visited: true,
                            visited_at: new Date().toISOString(),
                            visited_by: 'Luciano',
                          });
                        }}
                        disabled={markingVisited === viewRecord.document_number}
                      >
                        {markingVisited === viewRecord.document_number ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark Visited (Luciano)
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={async () => {
                          await handleMarkVisited(viewRecord.document_number, 'Raul', true);
                          setViewRecord({
                            ...viewRecord,
                            visited: true,
                            visited_at: new Date().toISOString(),
                            visited_by: 'Raul',
                          });
                        }}
                        disabled={markingVisited === viewRecord.document_number}
                      >
                        {markingVisited === viewRecord.document_number ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark Visited (Raul)
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
                {recordsInRoutes && recordsInRoutes.has(viewRecord.document_number) && (
                  <div className="text-xs text-muted-foreground">
                    This property is currently in an active route
                  </div>
                )}
              </div>}
            </div>

            {/* Visit Questions Section */}
            {viewRecord.visited !== true && (
              <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Visit Questions
                </h3>
                <PreForeclosureVisitWizard
                  onComplete={async (result: PreForeclosureVisitResult) => {
                    setWizardPending(true);
                    try {
                      const currentStage = (viewRecord.workflow_stage || 'not_started') as WorkflowStage;
                      const logEntry = {
                        id: crypto.randomUUID(),
                        timestamp: new Date().toISOString(),
                        fromStage: currentStage,
                        toStage: currentStage,
                        outcome: result.outcomeLabel,
                        note: result.note || undefined,
                      };
                      const currentLog = viewRecord.workflow_log || [];
                      const newLog = [...currentLog, logEntry];

                      const updates: any = {
                        document_number: viewRecord.document_number,
                        workflow_log: newLog,
                      };
                      if (result.note) {
                        updates.notes = viewRecord.notes
                          ? `${viewRecord.notes}\n[Visit] ${result.note}`
                          : `[Visit] ${result.note}`;
                      }

                      await updateMutation.mutateAsync(updates);
                      await markPreForeclosureVisited(viewRecord.document_number, undefined, true);

                      setViewRecord(prev => prev ? {
                        ...prev,
                        workflow_log: newLog,
                        notes: updates.notes || prev.notes,
                        visited: true,
                        visited_at: new Date().toISOString(),
                      } : prev);

                      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                      toast({ title: 'Visit recorded', description: result.outcomeLabel });
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: error instanceof Error ? error.message : 'Failed to save visit',
                        variant: 'destructive',
                      });
                    } finally {
                      setWizardPending(false);
                    }
                  }}
                  onSkip={async () => {
                    setWizardPending(true);
                    try {
                      await markPreForeclosureVisited(viewRecord.document_number, undefined, true);
                      setViewRecord(prev => prev ? {
                        ...prev,
                        visited: true,
                        visited_at: new Date().toISOString(),
                      } : prev);
                      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                      toast({ title: 'Marked as visited' });
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: error instanceof Error ? error.message : 'Failed to mark visited',
                        variant: 'destructive',
                      });
                    } finally {
                      setWizardPending(false);
                    }
                  }}
                  isPending={wizardPending}
                />
              </div>
            )}

            {/* Actions & Tasks Section */}
            <div className="bg-secondary/30 rounded-lg p-3 sm:p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setActionsTasksExpanded(prev => !prev)}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Actions & Tasks</span>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !actionsTasksExpanded && "-rotate-90"
                )} />
              </div>
              {actionsTasksExpanded && <div className="space-y-4 mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Action Type</label>
                    <Select value={actionType} onValueChange={(value) => setActionType(value as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select action type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="mail">Mail</SelectItem>
                        <SelectItem value="driveby">Drive-by</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Priority</label>
                    <div className="flex gap-2">
                      <Button
                        variant={priority === 'high' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPriority('high')}
                        className="flex-1"
                      >
                        High
                      </Button>
                      <Button
                        variant={priority === 'med' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPriority('med')}
                        className="flex-1"
                      >
                        Med
                      </Button>
                      <Button
                        variant={priority === 'low' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPriority('low')}
                        className="flex-1"
                      >
                        Low
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Due Date & Time</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dueDateTime && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {dueDateTime ? format(dueDateTime, 'PPP p') : <span>Pick a date & time</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={dueDateTime}
                          onSelect={setDueDateTime}
                          initialFocus
                        />
                        <div className="p-3 border-t">
                          <Input
                            type="time"
                            value={dueDateTime ? format(dueDateTime, 'HH:mm') : ''}
                            onChange={(e) => {
                              if (dueDateTime && e.target.value) {
                                const [hours, minutes] = e.target.value.split(':');
                                const newDate = new Date(dueDateTime);
                                newDate.setHours(parseInt(hours), parseInt(minutes));
                                setDueDateTime(newDate);
                              }
                            }}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Assigned To</label>
                    <Select value={assignedTo} onValueChange={(value) => setAssignedTo(value as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Luciano">Luciano</SelectItem>
                        <SelectItem value="Raul">Raul</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSaveAction}
                    disabled={savingAction || !actionType || !dueDateTime}
                  >
                    {savingAction ? 'Scheduling...' : 'Schedule Action'}
                  </Button>
                </div>
              </div>}
            </div>

            {/* Current Task */}
            {viewRecord.actionType && (
              <div className="bg-secondary/30 rounded-lg p-3 sm:p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setCurrentTaskExpanded(prev => !prev)}
                >
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Current Task</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleClearTask(); }}
                      disabled={savingAction}
                      className="h-8 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Clear Task
                    </Button>
                    <ChevronDown className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      !currentTaskExpanded && "-rotate-90"
                    )} />
                  </div>
                </div>
                {currentTaskExpanded && <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                  <div>
                    <span className="text-muted-foreground">Action:</span>
                    <div className="font-medium capitalize">{viewRecord.actionType}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priority:</span>
                    <div className="font-medium capitalize">{viewRecord.priority}</div>
                  </div>
                  {viewRecord.dueTime && (
                    <div>
                      <span className="text-muted-foreground">Due:</span>
                      <div className="font-medium">{format(new Date(viewRecord.dueTime), 'MMM d, yyyy h:mm a')}</div>
                    </div>
                  )}
                  {viewRecord.assignedTo && (
                    <div>
                      <span className="text-muted-foreground">Assigned To:</span>
                      <div className="font-medium">{viewRecord.assignedTo}</div>
                    </div>
                  )}
                </div>}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
