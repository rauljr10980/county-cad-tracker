import { useState, useEffect } from 'react';
import { ExternalLink, MapPin, DollarSign, Calendar, CalendarDays, FileText, TrendingUp, StickyNote, Edit2, Phone, Star, CheckCircle, MapPin as MapPinIcon, Send, Eye, Building, User, ChevronDown, Loader2, Mail, ClipboardPaste, Clock, GitBranch, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property, FOLLOWUP_ELIGIBLE_STAGES, D4dWorkflow } from '@/types/property';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, formatDistanceToNow, addYears } from 'date-fns';
import { updatePropertyNotes, updatePropertyPhoneNumbers, updatePropertyEmails, updatePropertyAction, updatePropertyVisited, updatePropertyPrimaryOverride, getPreForeclosures, createFollowUp, sendEmail, updateDrivingLeadPhones, updateDrivingLeadEmails, updateDrivingLead } from '@/lib/api';
import { extractContacts } from '@/lib/contactParser';
import { toast } from '@/hooks/use-toast';
import { usePropertyFollowUps } from '@/hooks/useFollowUps';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { PreForeclosureRecord } from '@/types/property';
import { PropertyWorkflowTracker } from './PropertyWorkflowTracker';
import { VisitedWizard, VisitedWizardResult } from '../shared/VisitedWizard';
import { updatePropertyWorkflowStage } from '@/lib/api';

interface PhoneEntry {
  number: string;
  status?: '' | 'rings' | 'not_working' | 'voicemail' | 'contacted';
}

interface PhoneContactRow {
  name: string;
  phones: PhoneEntry[];
}

interface PropertyDetailsModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PropertyDetailsModal({ property, isOpen, onClose }: PropertyDetailsModalProps) {
  const queryClient = useQueryClient();
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<PhoneContactRow[]>(
    Array.from({ length: 6 }, () => ({ name: '', phones: [{ number: '', status: '' }] }))
  );
  const [ownerPhoneIndex, setOwnerPhoneIndex] = useState<number | undefined>(undefined);
  const [savingPhones, setSavingPhones] = useState(false);

  // Actions & Tasks state
  const [actionType, setActionType] = useState<'call' | 'text' | 'mail' | 'driveby' | ''>('');
  const [priority, setPriority] = useState<'high' | 'med' | 'low'>('med');
  const [dueDateTime, setDueDateTime] = useState<Date | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<'Luciano' | 'Raul' | ''>('');
  const [savingAction, setSavingAction] = useState(false);


  // Collapsible section states
  const [actionsExpanded, setActionsExpanded] = useState(true);
  const [financialExpanded, setFinancialExpanded] = useState(false);
  const [taxPercentExpanded, setTaxPercentExpanded] = useState(false);
  const [paymentTaxExpanded, setPaymentTaxExpanded] = useState(false);
  const [additionalExpanded, setAdditionalExpanded] = useState(false);
  const [paymentHistoryExpanded, setPaymentHistoryExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [visitedExpanded, setVisitedExpanded] = useState(true);
  const [visitQuestionsExpanded, setVisitQuestionsExpanded] = useState(true);
  const [actionsTasksExpanded, setActionsTasksExpanded] = useState(false);
  const [phoneExpanded, setPhoneExpanded] = useState(false);
  const [contactExtractorExpanded, setContactExtractorExpanded] = useState(false);
  const [rawContactText, setRawContactText] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<{ name: string; emails: string[]; sent?: boolean }[]>(
    Array.from({ length: 6 }, () => ({ name: '', emails: [''] }))
  );
  const [emailSubject, setEmailSubject] = useState('Quick question regarding {{PropertyAddress}}');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmailIndex, setSendingEmailIndex] = useState<number | null>(null);
  const [sendingAllEmails, setSendingAllEmails] = useState(false);
  const [ownerOverride, setOwnerOverride] = useState('');
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpNote, setFollowUpNote] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Visited status state
  const [visited, setVisited] = useState(false);
  const [visitedBy, setVisitedBy] = useState<'Luciano' | 'Raul' | ''>('');
  const [savingVisited, setSavingVisited] = useState(false);
  const [showVisitedWizard, setShowVisitedWizard] = useState(false);
  const [wizardPending, setWizardPending] = useState(false);

  // Pre-foreclosure state
  const [preForeclosureRecords, setPreForeclosureRecords] = useState<PreForeclosureRecord[]>([]);
  const [loadingPreForeclosure, setLoadingPreForeclosure] = useState(false);
  const [showPreForeclosure, setShowPreForeclosure] = useState(false);
  const [activeAction, setActiveAction] = useState<'view' | 'send' | 'external'>('view');

  const isD4d = !!property?.id?.startsWith('d4d-');
  const { data: existingFollowUps = [], refetch: refetchFollowUps } = usePropertyFollowUps(
    !isD4d ? property?.id : undefined
  );
  // d4dLeadId works for both red-dot stubs (id = 'd4d-...') and green-dot found properties (d4dLeadId injected on stub)
  const d4dLeadId = isD4d ? property!.id.replace('d4d-', '') : ((property as any)?.d4dLeadId || '');
  const isFromD4d = isD4d || !!d4dLeadId;

  // D4$ Pipeline state
  const [d4dPipelineStage, setD4dPipelineStage] = useState<string>('NEW');
  const [d4dWorkflow, setD4dWorkflow] = useState<D4dWorkflow>({});
  const [showContactedPicker, setShowContactedPicker] = useState(false);
  const [showPhoneContactedPrompt, setShowPhoneContactedPrompt] = useState(false);
  const [openPhoneStatusKey, setOpenPhoneStatusKey] = useState<string | null>(null);

  // Initialize notes and phone numbers from property when modal opens or property changes
  useEffect(() => {
    if (property && isOpen) {
      setNotes(property.notes || '');
      setIsEditingNotes(false);
      setShowPhoneContactedPrompt(false);
      // For d4d stubs, contacts come from the DrivingLead record (property.contacts loaded by DrivingView)
      const savedContacts = property.contacts;
      const mkEmpty = (): PhoneContactRow => ({ name: '', phones: [{ number: '', status: '' }] });
      const emptyPhoneRows: PhoneContactRow[] = Array.from({ length: 6 }, mkEmpty);
      if (savedContacts?.phoneRows && savedContacts.phoneRows.length > 0) {
        const restored: PhoneContactRow[] = savedContacts.phoneRows.map((r: any) => ({
          name: r.name || '',
          phones: (r.phones && r.phones.length > 0)
            ? r.phones.map((p: any) => typeof p === 'string'
              ? { number: p, status: '' as const }
              : { number: p.number || '', status: p.status || '' })
            : [{ number: '', status: '' as const }],
        }));
        while (restored.length < 6) restored.push(mkEmpty());
        setPhoneContacts(restored);
      } else {
        // Fallback: load flat phoneNumbers into row 1
        const phones = property.phoneNumbers || [];
        if (phones.length > 0) {
          emptyPhoneRows[0] = { name: '', phones: phones.filter(p => p).map(p => ({ number: p, status: '' as const })) };
          if (emptyPhoneRows[0].phones.length === 0) emptyPhoneRows[0].phones = [{ number: '', status: '' }];
        }
        setPhoneContacts(emptyPhoneRows);
      }
      setOwnerPhoneIndex(property.ownerPhoneIndex);

      // Initialize actions & tasks
      setActionType(property.actionType || '');
      setPriority(property.priority || 'med');
      setDueDateTime(property.dueTime ? new Date(property.dueTime) : undefined);
      setAssignedTo(property.assignedTo || '');

      // Initialize visited status
      setVisited(property.visited || false);
      setVisitedBy(property.visitedBy || '');

      // Initialize saved emails and contact extractor
      setEmails(property.emails || []);
      setRawContactText('');

      // Initialize email recipients from structured contacts or empty
      const emptyEmailRows = Array.from({ length: 6 }, () => ({ name: '', emails: [''] }));
      if (savedContacts?.emailRows && savedContacts.emailRows.length > 0) {
        const restored = savedContacts.emailRows.map((r: { name: string; emails: string[]; sent?: boolean }) => ({
          name: r.name || '',
          emails: r.emails?.length > 0 ? r.emails : [''],
          sent: r.sent || false,
        }));
        while (restored.length < 6) restored.push({ name: '', emails: [''] });
        setEmailRecipients(restored);
      } else {
        setEmailRecipients(emptyEmailRows);
      }
      setEmailBody(`Hi Ms./Mr. {{LastName}},\n\nMy name is Raul. I'm reaching out regarding the property at {{PropertyAddress}}, which is listed under {{Owner}}.\n\nIf you're connected to the property, could you please let me know the best person to speak with? If the home is vacant, I would be interested in discussing a possible purchase.\n\nWe also work with real estate attorneys to help streamline the process, and you wouldn't have to pay out of pocket for those legal services.\n\nIf I've reached you by mistake, please disregard this message and accept my apologies.\n\nThank you,\nRaul\n210-425-7584`);

      setOwnerOverride(savedContacts?.ownerOverride || '');

      // Initialize D4$ pipeline state (works for both red-dot stubs and green-dot found properties)
      if (isFromD4d) {
        setD4dPipelineStage((property as any).d4dStatus || 'NEW');
        setD4dWorkflow((property as any).metadata || {});
      }

      // Load pre-foreclosure records for this property
      loadPreForeclosureRecords();
    }
  }, [property?.id, isOpen]);

  const loadPreForeclosureRecords = async () => {
    if (!property) return;
    
    setLoadingPreForeclosure(true);
    try {
      // Extract address from property address (format: "OWNER NAME 123 STREET CITY, STATE ZIP")
      const propertyAddress = property.propertyAddress || '';
      
      // Try to extract street number and street name
      const addressMatch = propertyAddress.match(/\b(\d+)\s+([A-Za-z\s]+?)(?:\s+[A-Z]{2}\s+\d{5}|$)/);
      const streetNumber = addressMatch ? addressMatch[1] : null;
      const streetName = addressMatch ? addressMatch[2].trim().split(/\s+/).slice(0, 3).join(' ') : null;
      
      // Fetch all pre-foreclosure records
      const records = await getPreForeclosures();
      
      // Filter records that match this property's address
      const matchingRecords = records.filter((record: PreForeclosureRecord) => {
        if (!record.address) return false;
        
        const recordAddress = record.address.toLowerCase().trim();
        const propAddress = propertyAddress.toLowerCase().trim();
        
        // Try to match by street number and street name if available
        if (streetNumber && streetName) {
          const recordLower = recordAddress.toLowerCase();
          const streetNumLower = streetNumber.toLowerCase();
          const streetNameLower = streetName.toLowerCase();
          
          // Check if record contains both street number and street name
          return recordLower.includes(streetNumLower) && 
                 recordLower.includes(streetNameLower.substring(0, Math.min(15, streetNameLower.length)));
        }
        
        // Fallback: try to match first 30 characters (usually contains street number and name)
        const propPrefix = propAddress.substring(0, 30).trim();
        const recordPrefix = recordAddress.substring(0, 30).trim();
        
        // Check if either contains the other (fuzzy match)
        return propPrefix.length > 10 && recordPrefix.length > 10 && (
          recordAddress.includes(propPrefix) || 
          propAddress.includes(recordPrefix)
        );
      });
      
      setPreForeclosureRecords(matchingRecords);
    } catch (error) {
      console.error('Failed to load pre-foreclosure records:', error);
      setPreForeclosureRecords([]);
    } finally {
      setLoadingPreForeclosure(false);
    }
  };

  if (!property) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Parse property address to extract owner name and address
  // Format: "OWNER NAME 123 STREET CITY, STATE ZIP"
  // The middle number (not at start/end) separates owner name from address
  const parsePropertyAddress = (address: string) => {
    if (!address) return { ownerName: '', address: '' };
    
    // Find all numbers in the string with their positions
    const numberMatches = Array.from(address.matchAll(/\b(\d+)\b/g));
    
    if (numberMatches.length === 0) {
      // No numbers found, treat entire string as address
      return { ownerName: '', address: address.trim() };
    }
    
    // Find the first number that's NOT at the start and NOT at the end (middle number)
    // Skip numbers that are part of zip codes (5 digits at the end) or very short numbers at start
    for (const match of numberMatches) {
      const number = match[0];
      const index = match.index!;
      const beforeMatch = address.substring(0, index).trim();
      const afterMatch = address.substring(index + number.length).trim();
      
      // Skip if number is at the very start (likely part of address number)
      if (index === 0) continue;
      
      // Skip if it's a zip code (5 digits at the end)
      if (number.length === 5 && /^\d{5}$/.test(number)) {
        const remainingAfter = address.substring(index + number.length).trim();
        if (remainingAfter.length < 5) continue; // Likely at the end
      }
      
      // If we have text before and after, this is likely the middle number
      if (beforeMatch.length > 0 && afterMatch.length > 0) {
        // Make sure there's a space before the number
        if (address[index - 1] === ' ') {
          const ownerName = beforeMatch.trim();
          const addressPart = address.substring(index).trim();
          return { ownerName, address: addressPart };
        }
      }
    }
    
    // Fallback: if no clear middle number found, try to find first number with space before it
    const firstNumberWithSpace = address.match(/\s+(\d+)\s+/);
    if (firstNumberWithSpace) {
      const matchIndex = address.indexOf(firstNumberWithSpace[0]);
      const ownerName = address.substring(0, matchIndex).trim();
      const addressPart = address.substring(matchIndex + 1).trim();
      return { ownerName, address: addressPart };
    }
    
    // Final fallback: treat entire string as address
    return { ownerName: '', address: address.trim() };
  };

  const { ownerName: parsedOwnerName, address: parsedAddress } = parsePropertyAddress(property.propertyAddress);
  // For d4$ stubs, propertyAddress IS the address and ownerName IS the owner — use them directly
  // For DB properties, ownerName field often contains the street address (e.g. "WICKLOW DR")
  const displayPropertyAddress = isD4d
    ? (property.propertyAddress || '')
    : isFromD4d
      ? (parsedAddress || property.propertyAddress || '')
      : (property.ownerName || parsedAddress || property.propertyAddress || '');
  const displayOwnerName = isD4d ? (property.ownerName || '') : (parsedOwnerName || '');
  const toTitleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const emailAddress = toTitleCase(displayPropertyAddress);
  const emailOwner = ownerOverride.trim() || toTitleCase(displayOwnerName) || 'Property Owner';

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      if (isD4d) {
        await updateDrivingLead(d4dLeadId, { notes });
      } else {
        await updatePropertyNotes(property.id, notes);
      }
      toast({
        title: "Notes Saved",
        description: isD4d ? "Notes saved" : `Notes saved for ${property.accountNumber}`,
      });
      setIsEditingNotes(false);
      // Update property object directly (will be refreshed on next load)
      property.notes = notes;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive",
      });
    } finally {
      setSavingNotes(false);
    }
  };

  // Build current contacts JSON from both phone and email rows
  const buildContactsJson = () => ({
    ownerOverride: ownerOverride.trim(),
    phoneRows: phoneContacts
      .filter(r => r.name.trim() || r.phones.some(p => p.number.trim()))
      .map(r => ({
        name: r.name,
        phones: r.phones.filter(p => p.number.trim()).map(p => ({ number: p.number, status: p.status || '' })),
      })),
    emailRows: emailRecipients
      .filter(r => r.name.trim() || r.emails.some(e => e.trim()))
      .map(r => ({ name: r.name, emails: r.emails.filter(e => e.trim()), sent: r.sent || false })),
  });

  const handleSavePhoneNumbers = async () => {
    setSavingPhones(true);
    try {
      const allPhones = phoneContacts.flatMap(row => row.phones.filter(p => p.number.trim() !== '').map(p => p.number));
      const contacts = buildContactsJson();
      if (isFromD4d) {
        await updateDrivingLeadPhones(d4dLeadId, allPhones, ownerPhoneIndex, contacts, ownerOverride);
        queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
        if (!isD4d) await updatePropertyPhoneNumbers(property.id, allPhones, ownerPhoneIndex, contacts).catch(() => {});
      } else {
        await updatePropertyPhoneNumbers(property.id, allPhones, ownerPhoneIndex, contacts);
      }
      toast({ title: "Phone Numbers Saved", description: `${allPhones.length} phone number${allPhones.length !== 1 ? 's' : ''} saved` });
      property.phoneNumbers = allPhones;
      property.ownerPhoneIndex = ownerPhoneIndex;
      property.contacts = contacts;
    } catch (error) {
      toast({
        title: "Failed to save phone numbers",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setSavingPhones(false);
    }
  };

  const handleToggleOwnerPhone = (index: number) => {
    if (ownerPhoneIndex === index) {
      setOwnerPhoneIndex(undefined);
    } else {
      setOwnerPhoneIndex(index);
    }
  };

  const handleSaveAction = async () => {
    if (!actionType || !dueDateTime) {
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
      await updatePropertyAction(property.id, actionType, priority, isoDateTime, assignedTo || undefined);
      toast({
        title: "Action Scheduled",
        description: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} scheduled for ${format(dueDateTime, 'MMM d, yyyy h:mm a')}${assignedTo ? ` - Assigned to ${assignedTo}` : ''}`,
      });
      // Update property object
      property.actionType = actionType;
      property.priority = priority;
      property.dueTime = isoDateTime;
      property.assignedTo = assignedTo || undefined;
      // Invalidate tasks query to refresh tasks list
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to schedule action",
        variant: "destructive",
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleSaveVisited = async () => {
    if (!property) return;
    
    setSavingVisited(true);
    try {
      await updatePropertyVisited(property.id, visited, visitedBy || undefined);
      toast({
        title: "Visited Status Updated",
        description: `Property marked as ${visited ? 'visited' : 'not visited'}`,
      });
      // Update property object directly
      property.visited = visited;
      property.visitedAt = visited ? new Date().toISOString() : undefined;
      property.visitedBy = visited && visitedBy ? visitedBy : undefined;
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch (error: any) {
      console.error('Error updating visited status:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to update visited status',
        variant: "destructive",
      });
    } finally {
      setSavingVisited(false);
    }
  };


  const paymentChartData = property.paymentHistory?.map(p => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    amount: p.amount,
  })).reverse() || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-5xl max-h-[85vh] overflow-hidden bg-card border-border p-0">
        <div className="overflow-y-auto overflow-x-hidden max-h-[85vh] p-6">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold flex items-center gap-3">
                Property Details
                <StatusBadge status={property.status} />
                {property.previousStatus && (
                  <span className="text-sm font-normal text-muted-foreground">
                    (was {property.previousStatus})
                  </span>
                )}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                {!isD4d ? (property.accountNumber || '') : ''}
              </p>
            </div>
          </div>
        </DialogHeader>


        <div className="space-y-4 pt-2 overflow-x-hidden">
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
            {actionsExpanded && <div className="flex gap-2 mt-3">
              <Button
                variant="default"
                size="sm"
                className="flex-1 bg-primary text-primary-foreground"
                disabled
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  const address = parsedAddress || property.propertyAddress;
                  window.open(`https://www.google.com/maps/search/${encodeURIComponent(address + ', San Antonio, TX')}`, '_blank');
                }}
                title="Open in Google Maps"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  window.open(property.link || 'https://bexar.acttax.com/act_webdev/bexar/index.jsp', '_blank');
                }}
                title={property.link ? "View on CAD" : "Tax Assessor"}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  const address = parsedAddress || property.propertyAddress;
                  window.open(`https://www.truepeoplesearch.com/results?name=${encodeURIComponent(address)}&citystatezip=${encodeURIComponent('San Antonio, TX')}`, '_blank');
                }}
                title="TruePeopleSearch"
              >
                <User className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  const raw = (parsedAddress || property.propertyAddress || '').split(',')[0].trim();
                  const streetMatch = raw.match(/^.*?\b(AVE|DR|ST|BLVD|LN|CT|PL|RD|WAY|TRL|CIR|HWY|PKWY|LOOP|EXPY|PASS|ROW|SQ|TER|TERR|TRACE|VIA|WALK)\b/i);
                  const street = streetMatch ? streetMatch[0].trim() : raw;
                  const url = street
                    ? `https://bexar.tx.publicsearch.us/results?department=RP&keywordSearch=false&recordedDateRange=18000101%2C20260304&searchOcrText=false&searchType=quickSearch&searchValue=${encodeURIComponent(street)}`
                    : 'https://bexar.tx.publicsearch.us/';
                  window.open(url, '_blank');
                }}
                title="Land Records"
              >
                <Building className="h-4 w-4" />
              </Button>
            </div>}
          </div>

          {/* Primary / 2nd Property Toggle */}
          <div className="flex gap-2">
            <Button
              variant={property.isPrimaryProperty !== false ? "default" : "outline"}
              size="sm"
              className="flex-1 text-xs"
              onClick={async () => {
                try {
                  await updatePropertyPrimaryOverride(property.id, true);
                  queryClient.invalidateQueries({ queryKey: ['properties'] });
                  toast({ title: 'Marked as Primary Property' });
                } catch { toast({ title: 'Error', variant: 'destructive' }); }
              }}
            >
              Primary
            </Button>
            <Button
              variant={property.isPrimaryProperty === false ? "default" : "outline"}
              size="sm"
              className="flex-1 text-xs bg-orange-500/20 text-orange-500 border-orange-500/30 hover:bg-orange-500/30"
              onClick={async () => {
                try {
                  await updatePropertyPrimaryOverride(property.id, false);
                  queryClient.invalidateQueries({ queryKey: ['properties'] });
                  toast({ title: 'Marked as 2nd Property' });
                } catch { toast({ title: 'Error', variant: 'destructive' }); }
              }}
            >
              2nd Property
            </Button>
          </div>

          {/* Property Info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-primary mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Primary Address</p>
                <p className="font-medium">{parsedAddress || property.propertyAddress}</p>
              </div>
            </div>

            {(isD4d ? !!property.propertyAddress : !!(property.ownerName || parsedAddress || property.propertyAddress)) && (
              <div className="flex items-start gap-3">
                <Building className="h-4 w-4 text-primary mt-1 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Property Address</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {isD4d
                        ? (property.propertyAddress.split(',')[0] || property.propertyAddress)
                        : (property.ownerName || parsedAddress || property.propertyAddress)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => {
                        const addr = isD4d
                          ? (property.propertyAddress.split(',')[0] || property.propertyAddress)
                          : (property.ownerName || parsedAddress || property.propertyAddress);
                        navigator.clipboard.writeText(addr || '');
                      }}
                      title="Copy address"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-primary mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Legal Description</p>
                <p className="text-sm">{property.legalDescription || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-primary mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Owner</p>
                <input
                  type="text"
                  value={ownerOverride || parsedOwnerName || property.ownerName || ''}
                  onChange={(e) => setOwnerOverride(e.target.value)}
                  onBlur={async () => {
                    const contacts = buildContactsJson();
                    const allEmails = emailRecipients.flatMap(r => r.emails.filter(e => e.includes('@')));
                    if (isFromD4d) {
                      await updateDrivingLeadEmails(d4dLeadId, allEmails, contacts, ownerOverride).catch(() => {});
                      if (!isD4d) await updatePropertyEmails(property.id, allEmails, contacts).catch(() => {});
                    } else {
                      await updatePropertyEmails(property.id, allEmails, contacts);
                    }
                    property.contacts = contacts;
                  }}
                  placeholder="Click to add owner name..."
                  className="font-medium bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/40 placeholder:text-sm hover:bg-muted/30 focus:bg-muted/50 rounded px-1 -ml-1"
                />
                <p className="text-sm text-muted-foreground">{property.mailingAddress}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-secondary/50 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setFinancialExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Financial Summary</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !financialExpanded && "-rotate-90"
              )} />
            </div>
            {financialExpanded && (() => {
              const financialFields = [
                { label: 'Amount Due', value: property.totalAmountDue, isJudgment: true, isLarge: true },
                property.marketValue && property.marketValue > 0 ? { label: 'Market Value', value: property.marketValue, isLarge: true } : null,
                property.landValue && property.landValue > 0 ? { label: 'Land Value', value: property.landValue } : null,
                property.improvementValue && property.improvementValue > 0 ? { label: 'Improvement Value', value: property.improvementValue } : null,
                property.cappedValue && property.cappedValue > 0 ? { label: 'Capped Value', value: property.cappedValue } : null,
                property.agriculturalValue && property.agriculturalValue > 0 ? { label: 'Agricultural Value', value: property.agriculturalValue } : null,
                property.priorYearsAmountDue && property.priorYearsAmountDue > 0 ? { label: 'Prior Years Amount Due', value: property.priorYearsAmountDue } : null,
                property.yearAmountDue && property.yearAmountDue > 0 ? { label: 'Year Amount Due', value: property.yearAmountDue } : null,
                property.yearTaxLevy && property.yearTaxLevy > 0 ? { label: 'Year Tax Levy', value: property.yearTaxLevy } : null,
                property.halfPaymentOptionAmount && property.halfPaymentOptionAmount > 0 ? { label: 'Half Payment Option', value: property.halfPaymentOptionAmount } : null,
              ].filter(Boolean) as Array<{label: string; value: number; isJudgment?: boolean; isLarge?: boolean}>;
              return (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {financialFields.map((field, index) => (
                    <div key={index}>
                      <p className="text-xs text-muted-foreground">{field.label}</p>
                      <p className={`font-mono ${field.isLarge ? 'text-lg font-semibold' : ''} ${field.isJudgment ? 'text-judgment' : ''}`}>
                        {formatCurrency(field.value)}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Tax Percentage Section */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setTaxPercentExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Tax Percentage</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !taxPercentExpanded && "-rotate-90"
              )} />
            </div>
            {taxPercentExpanded && <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(property.totalPercentage || 0, 100)}%` }}
                />
              </div>
              <span className="font-mono text-base font-semibold min-w-[50px] text-right">
                {property.totalPercentage || 0}%
              </span>
            </div>}
          </div>
              
          {/* Payment & Tax Information and Exemptions & Jurisdictions */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setPaymentTaxExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Payment & Tax Information</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !paymentTaxExpanded && "-rotate-90"
              )} />
            </div>
            {paymentTaxExpanded && <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {/* Payment & Tax Information */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Tax Year:</span>
                      <span className="text-xs font-mono font-medium">{property.taxYear || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Last Payment Date:</span>
                      <span className="text-xs font-mono font-medium">{property.lastPaymentDate || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Last Payment Amount:</span>
                      <span className="text-xs font-mono font-medium">
                        {property.lastPaymentAmount ? formatCurrency(property.lastPaymentAmount) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-xs text-muted-foreground">Last Payer:</span>
                      <span className="text-xs text-right flex-1 ml-2">{property.lastPayer || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-xs text-muted-foreground">Delinquent After:</span>
                      <span className="text-xs font-mono font-medium">{property.delinquentAfter || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                
                {/* Exemptions & Jurisdictions */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Exemptions & Jurisdictions</p>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Exemptions:</p>
                    <p className="text-xs">
                      {property.exemptions && property.exemptions.length > 0 
                        ? property.exemptions.join(', ') 
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Jurisdictions:</p>
                    <p className="text-xs">
                      {property.jurisdictions && property.jurisdictions.length > 0 
                        ? property.jurisdictions.join(', ') 
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>}
          </div>

          {/* Additional Details Section */}
          {(property.link || property.ownerAddress) && (
            <div className="bg-secondary/30 rounded-lg p-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setAdditionalExpanded(prev => !prev)}
              >
                <span className="text-sm font-medium">Additional Details</span>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !additionalExpanded && "-rotate-90"
                )} />
              </div>
              {additionalExpanded && <div className="space-y-2 mt-3">
              {property.link && (
                <div className="flex items-start gap-2">
                  <ExternalLink className="h-3 w-3 text-primary mt-1 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Property Link:</p>
                    <a 
                      href={property.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {property.link}
                    </a>
                  </div>
                </div>
              )}
              {property.ownerAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3 w-3 text-primary mt-1 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Owner Address:</p>
                    <p className="text-xs">{property.ownerAddress}</p>
                  </div>
                </div>
              )}
              </div>}
            </div>
          )}

          {/* Payment History Chart */}
          {paymentChartData.length > 0 && (
            <div className="bg-secondary/30 rounded-lg p-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setPaymentHistoryExpanded(prev => !prev)}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Payment History</span>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !paymentHistoryExpanded && "-rotate-90"
                )} />
              </div>
              {paymentHistoryExpanded && (
                <div className="mt-3">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={paymentChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [formatCurrency(value), 'Amount']}
                        />
                        <Line
                          type="monotone"
                          dataKey="amount"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment History Table */}
          {property.paymentHistory && property.paymentHistory.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Payment Records</h3>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-right">Amount</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {property.paymentHistory.slice(0, 10).map((payment, index) => (
                      <tr key={index}>
                        <td className="font-mono text-sm">{payment.date}</td>
                        <td className="text-right font-mono">{formatCurrency(payment.amount)}</td>
                        <td className="text-muted-foreground">{payment.description || 'Tax Payment'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes Section */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setNotesExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Notes</span>
              </div>
              <div className="flex items-center gap-2">
                {!isEditingNotes && notesExpanded && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setIsEditingNotes(true); }}
                    className="h-7"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    {notes ? 'Edit' : 'Add Notes'}
                  </Button>
                )}
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !notesExpanded && "-rotate-90"
                )} />
              </div>
            </div>
            {notesExpanded && (isEditingNotes ? (
              <div className="space-y-2 mt-3">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add your notes here..."
                  className="min-h-[120px]"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingNotes(false);
                      setNotes(property.notes || '');
                    }}
                    disabled={savingNotes}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                  >
                    {savingNotes ? 'Saving...' : 'Save Notes'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground min-h-[60px] whitespace-pre-wrap break-words mt-3">
                {notes || 'No notes added yet. Click "Add Notes" to add notes for this property.'}
              </div>
            ))}
          </div>

          {/* Visited Status Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setVisitedExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Visited Status</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !visitedExpanded && "-rotate-90"
              )} />
            </div>
            {visitedExpanded && (
              <div className="space-y-3 mt-3">
                {property.visited ? (
                  <>
                    <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                      Visited
                    </Badge>
                    {property.visitedAt && (
                      <div className="text-xs text-muted-foreground">
                        Last visited: {format(new Date(property.visitedAt), 'PPP p')}
                        {property.visitedBy && ` by ${property.visitedBy}`}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setSavingVisited(true);
                        try {
                          await updatePropertyVisited(property.id, false);
                          property.visited = false;
                          property.visitedAt = undefined;
                          property.visitedBy = undefined;
                          setVisited(false);
                          queryClient.invalidateQueries({ queryKey: ['properties'] });
                          toast({ title: 'Set to not visited' });
                        } catch (error) {
                          toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
                        } finally {
                          setSavingVisited(false);
                        }
                      }}
                      disabled={savingVisited}
                    >
                      Set Not Visited
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    Not Visited
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Visit Questions Section */}
          {!property.visited && (
            <div className="bg-secondary/30 rounded-lg p-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setVisitQuestionsExpanded(prev => !prev)}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Visit Questions</span>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !visitQuestionsExpanded && "-rotate-90"
                )} />
              </div>
              {visitQuestionsExpanded && <VisitedWizard
                address={parsedAddress || property.propertyAddress}
                onComplete={async (result: VisitedWizardResult) => {
                  setWizardPending(true);
                  try {
                    const logEntry = {
                      id: crypto.randomUUID(),
                      timestamp: new Date().toISOString(),
                      fromStage: property.workflow_stage || 'new',
                      toStage: result.nextWorkflowStage,
                      outcome: result.outcomeLabel,
                      note: result.note || undefined,
                    };
                    const currentLog = property.workflow_log || [];
                    const newLog = [...currentLog, logEntry];

                    await updatePropertyWorkflowStage(property.id, result.nextWorkflowStage, newLog);

                    if (result.phoneProvided && result.phoneNumber) {
                      const currentPhones = property.phoneNumbers || [];
                      if (!currentPhones.includes(result.phoneNumber)) {
                        const newPhones = [...currentPhones, result.phoneNumber];
                        await updatePropertyPhoneNumbers(property.id, newPhones, property.ownerPhoneIndex);
                        property.phoneNumbers = newPhones;
                        // Add to first row of phoneContacts
                        const updatedContacts = [...phoneContacts];
                        updatedContacts[0] = {
                          ...updatedContacts[0],
                          phones: [...updatedContacts[0].phones.filter(p => p.number.trim()), { number: result.phoneNumber, status: '' }],
                        };
                        setPhoneContacts(updatedContacts);
                      }
                    }

                    if (result.note) {
                      const newNotes = property.notes
                        ? `${property.notes}\n[Visit] ${result.note}`
                        : `[Visit] ${result.note}`;
                      await updatePropertyNotes(property.id, newNotes);
                      property.notes = newNotes;
                      setNotes(newNotes);
                    }

                    await updatePropertyVisited(property.id, true);

                    property.workflow_stage = result.nextWorkflowStage;
                    property.workflow_log = newLog;
                    property.visited = true;
                    property.visitedAt = new Date().toISOString();
                    setVisited(true);

                    queryClient.invalidateQueries({ queryKey: ['properties'] });
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
                    await updatePropertyVisited(property.id, true);
                    property.visited = true;
                    property.visitedAt = new Date().toISOString();
                    setVisited(true);
                    queryClient.invalidateQueries({ queryKey: ['properties'] });
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
              />}
            </div>
          )}

          {/* Actions & Tasks Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Action Type</label>
                  <Select value={actionType} onValueChange={(value) => setActionType(value as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select action type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">📞 Call</SelectItem>
                      <SelectItem value="text">💬 Text</SelectItem>
                      <SelectItem value="mail">✉️ Mail</SelectItem>
                      <SelectItem value="driveby">🚗 Drive-by</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Priority</label>
                  <div className="flex gap-2">
                    <Badge
                      variant={priority === 'high' ? 'default' : 'outline'}
                      className={cn(
                        "cursor-pointer flex-1 justify-center",
                        priority === 'high' && "bg-red-500 hover:bg-red-600"
                      )}
                      onClick={() => setPriority('high')}
                    >
                      High
                    </Badge>
                    <Badge
                      variant={priority === 'med' ? 'default' : 'outline'}
                      className={cn(
                        "cursor-pointer flex-1 justify-center",
                        priority === 'med' && "bg-yellow-500 hover:bg-yellow-600"
                      )}
                      onClick={() => setPriority('med')}
                    >
                      Med
                    </Badge>
                    <Badge
                      variant={priority === 'low' ? 'default' : 'outline'}
                      className={cn(
                        "cursor-pointer flex-1 justify-center",
                        priority === 'low' && "bg-green-500 hover:bg-green-600"
                      )}
                      onClick={() => setPriority('low')}
                    >
                      Low
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        {dueDateTime ? format(dueDateTime, 'PPP p') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dueDateTime}
                        onSelect={setDueDateTime}
                        initialFocus
                      />
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

          {/* Deal Workflow Section */}
          <PropertyWorkflowTracker
            property={property}
            onPropertyUpdate={(updated) => {
              Object.assign(property, updated);
            }}
          />

          {/* D4$ Pipeline Workflow */}
          {isFromD4d && (() => {
            const RESEARCH_ITEMS = [
              { key: 'bcad_tax', label: 'BCAD - TAX' },
              { key: 'tps', label: 'TPS' },
              { key: 'google', label: 'GOOGLE' },
              { key: 'land_records', label: 'LAND RECORDS' },
              { key: 'obituary', label: 'OBITUARY' },
            ];
            const CONTACT_ITEMS = [
              { key: 'called', label: 'Called' },
              { key: 'emailed', label: 'Emailed all available emails' },
            ];
            const D4D_STAGES = [
              { key: 'NEW', label: '1. New' },
              { key: 'RESEARCHING', label: '2. Researching' },
              { key: 'FOUND_OBITUARY', label: '3. Found Obituary' },
              { key: 'CONTACTED', label: '4. Contacted' },
              { key: 'UNDER_CONTRACT', label: '5. Under Contract' },
              { key: 'DEAD', label: '6. Dead Deal' },
            ];

            const saveStage = async (newStage: string) => {
              setD4dPipelineStage(newStage);
              try {
                await updateDrivingLead(d4dLeadId, { status: newStage });
                queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
              } catch { toast({ title: 'Failed to save stage', variant: 'destructive' }); }
            };

            const saveMeta = async (wf: D4dWorkflow) => {
              setD4dWorkflow(wf);
              try {
                await updateDrivingLead(d4dLeadId, { metadata: wf as Record<string, unknown> });
                queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
              } catch { toast({ title: 'Failed to save', variant: 'destructive' }); }
            };

            const toggleCheck = (field: 'researchChecks' | 'contactChecks', key: string) => {
              const cur = d4dWorkflow[field] || [];
              saveMeta({ ...d4dWorkflow, [field]: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] });
            };

            const renderCheck = (checked: boolean, label: string, onToggle: () => void) => (
              <button key={label} className="flex items-center gap-2 w-full text-left hover:bg-secondary/40 rounded px-1 py-0.5 transition-colors" onClick={onToggle}>
                <div className={cn('h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors', checked ? 'bg-primary border-primary' : 'border-muted-foreground/40')}>
                  {checked && <span className="text-primary-foreground text-[10px] font-bold leading-none">✓</span>}
                </div>
                <span className={cn('text-xs', checked && 'line-through text-muted-foreground')}>{label}</span>
              </button>
            );

            const renderProgress = (done: number, total: number) => {
              const pct = total === 0 ? 0 : Math.round((done / total) * 100);
              return (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={cn('text-xs font-mono', pct === 100 ? 'text-green-400 font-semibold' : 'text-muted-foreground')}>{pct}%</span>
                </div>
              );
            };

            const researchChecks = d4dWorkflow.researchChecks || [];
            const contactChecks = d4dWorkflow.contactChecks || [];
            const lastContact = d4dWorkflow.lastContactedAt ? new Date(d4dWorkflow.lastContactedAt) : null;
            const twoYearMark = lastContact ? addYears(lastContact, 2) : null;
            const daysUntil = twoYearMark ? Math.ceil((twoYearMark.getTime() - Date.now()) / 86400000) : null;

            return (
              <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">D4$ Pipeline Stage</span>
                </div>

                {/* Quick Contacted action */}
                {!showContactedPicker ? (
                  <Button size="sm" className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => setShowContactedPicker(true)}>
                    Contacted — mark outcome
                  </Button>
                ) : (
                  <div className="space-y-1.5 p-2 rounded-lg border border-purple-500/30 bg-purple-500/5">
                    <p className="text-xs text-muted-foreground font-medium">How did it go?</p>
                    {([
                      { key: 'wants_to_sell', label: 'Wants to Sell', color: 'border-green-500/50 text-green-400 hover:bg-green-500/10' },
                      { key: 'thinking_about_selling', label: 'Thinking About Selling', color: 'border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10' },
                      { key: 'doesnt_want_to_sell', label: "Doesn't Want to Sell", color: 'border-red-500/50 text-red-400 hover:bg-red-500/10' },
                    ] as const).map(o => (
                      <Button key={o.key} size="sm" variant="outline"
                        className={cn('h-7 text-xs w-full', o.color)}
                        onClick={async () => {
                          await saveStage('CONTACTED');
                          await saveMeta({ ...d4dWorkflow, contactedOutcome: o.key, lastContactedAt: new Date().toISOString() });
                          setShowContactedPicker(false);
                        }}>
                        {o.label}
                      </Button>
                    ))}
                    <button className="text-[10px] text-muted-foreground underline w-full text-center mt-1"
                      onClick={() => setShowContactedPicker(false)}>cancel</button>
                  </div>
                )}


                {/* Stage selector */}
                <Select value={d4dPipelineStage} onValueChange={saveStage}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {D4D_STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Research Checklist — always visible */}
                <div className="space-y-1 pt-1 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium mb-1 mt-2">Research Checklist</p>
                  {RESEARCH_ITEMS.map(item => renderCheck(researchChecks.includes(item.key), item.label, () => toggleCheck('researchChecks', item.key)))}
                  {renderProgress(researchChecks.length, RESEARCH_ITEMS.length)}
                </div>

                {/* Contact section — always visible */}
                <div className="space-y-2 pt-1 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium mt-1">Contact Checklist</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {lastContact
                      ? <span>Last contacted: <span className="text-foreground">{formatDistanceToNow(lastContact, { addSuffix: true })}</span></span>
                      : 'Never marked as contacted'}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs w-full"
                    onClick={() => saveMeta({ ...d4dWorkflow, lastContactedAt: new Date().toISOString() })}>
                    Mark Contacted Now
                  </Button>
                  {/* Contacted outcome */}
                  <div className="space-y-1 pt-1">
                    <p className="text-xs text-muted-foreground font-medium">Outcome</p>
                    {([
                      { key: 'wants_to_sell', label: 'Wants to Sell', color: 'border-green-500/50 text-green-400' },
                      { key: 'thinking_about_selling', label: 'Thinking About Selling', color: 'border-yellow-500/50 text-yellow-400' },
                      { key: 'doesnt_want_to_sell', label: "Doesn't Want to Sell", color: 'border-red-500/50 text-red-400' },
                    ] as const).map(o => (
                      <Button key={o.key} size="sm"
                        variant={d4dWorkflow.contactedOutcome === o.key ? 'default' : 'outline'}
                        className={cn('h-7 text-xs w-full', d4dWorkflow.contactedOutcome !== o.key && o.color)}
                        onClick={() => saveMeta({ ...d4dWorkflow, contactedOutcome: o.key })}>
                        {o.label}
                      </Button>
                    ))}
                  </div>
                  {/* Follow-up tracking */}
                  <div className="border-t border-border/50 pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Follow Up</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {d4dWorkflow.lastFollowUpAt
                          ? <>Last: <span className="text-foreground ml-0.5">{formatDistanceToNow(new Date(d4dWorkflow.lastFollowUpAt), { addSuffix: true })}</span></>
                          : 'No follow up yet'}
                      </div>
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2"
                        onClick={() => saveMeta({ ...d4dWorkflow, lastFollowUpAt: new Date().toISOString() })}>
                        Mark Now
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex-shrink-0">Scheduled:</span>
                      <input
                        type="date"
                        value={d4dWorkflow.scheduledFollowUpAt ? d4dWorkflow.scheduledFollowUpAt.slice(0, 10) : ''}
                        onChange={e => saveMeta({ ...d4dWorkflow, scheduledFollowUpAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                        className="flex-1 h-7 text-xs bg-secondary border border-border rounded px-2 text-foreground cursor-pointer"
                      />
                    </div>
                    {d4dWorkflow.scheduledFollowUpAt && (() => {
                      const scheduled = new Date(d4dWorkflow.scheduledFollowUpAt);
                      const isPast = scheduled < new Date();
                      const daysUntil = Math.ceil((scheduled.getTime() - Date.now()) / 86400000);
                      return (
                        <p className={cn('text-[11px]', isPast ? 'text-yellow-400' : 'text-muted-foreground')}>
                          {isPast ? `⚠ Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}` : `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''} — ${format(scheduled, 'MMM d, yyyy')}`}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="space-y-1">
                    {CONTACT_ITEMS.map(item => renderCheck(contactChecks.includes(item.key), item.label, () => toggleCheck('contactChecks', item.key)))}
                  </div>
                  {renderProgress(contactChecks.length, CONTACT_ITEMS.length)}
                </div>

                {/* Under Contract */}
                {d4dPipelineStage === 'UNDER_CONTRACT' && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-muted-foreground">Under Contract?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant={d4dWorkflow.underContract === true ? 'default' : 'outline'} className="flex-1 h-7 text-xs"
                        onClick={() => saveMeta({ ...d4dWorkflow, underContract: true })}>Yes</Button>
                      <Button size="sm" variant={d4dWorkflow.underContract === false ? 'default' : 'outline'} className="flex-1 h-7 text-xs"
                        onClick={() => saveMeta({ ...d4dWorkflow, underContract: false })}>No</Button>
                    </div>
                    {d4dWorkflow.underContract === false && (
                      <p className="text-xs text-muted-foreground text-center">Consider moving to Dead Deal</p>
                    )}
                  </div>
                )}

                {/* Dead Deal */}
                {d4dPipelineStage === 'DEAD' && (
                  <div className="space-y-2 pt-1">
                    {!d4dWorkflow.deadReason && (
                      <>
                        <p className="text-xs text-muted-foreground">Why did this go dead?</p>
                        <div className="flex flex-col gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => saveMeta({ ...d4dWorkflow, deadReason: 'real_estate_company', lastContactedAt: d4dWorkflow.lastContactedAt || new Date().toISOString() })}>
                            RE company bought it
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => saveMeta({ ...d4dWorkflow, deadReason: 'doesnt_want_to_sell', lastContactedAt: d4dWorkflow.lastContactedAt || new Date().toISOString() })}>
                            Doesn't want to sell
                          </Button>
                        </div>
                      </>
                    )}
                    {d4dWorkflow.deadReason && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {d4dWorkflow.deadReason === 'real_estate_company' ? 'RE company bought it' : "Doesn't want to sell"}
                        </span>
                        <button className="text-[10px] text-muted-foreground underline" onClick={() => saveMeta({ ...d4dWorkflow, deadReason: undefined })}>change</button>
                      </div>
                    )}
                    {lastContact && (
                      <div className="text-xs space-y-0.5 pt-1">
                        <p className="text-muted-foreground">Last contact: {format(lastContact, 'MMM d, yyyy')}</p>
                        {daysUntil !== null && daysUntil > 0 && (
                          <p className="text-yellow-500">Re-contact in {daysUntil} days ({format(twoYearMark!, 'MMM d, yyyy')})</p>
                        )}
                        {daysUntil !== null && daysUntil <= 0 && (
                          <p className="text-green-400 font-medium">✓ 2-year mark passed — consider reaching out</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Existing Follow-Ups */}
          {existingFollowUps.length > 0 && (
            <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium">Scheduled Follow-Ups</span>
              </div>
              {existingFollowUps.map((fu) => {
                const fuDate = new Date(fu.date);
                const isPast = fuDate < new Date();
                return (
                  <div key={fu.id} className={`flex items-start gap-3 px-3 py-2 rounded-lg border ${fu.completed ? 'border-green-500/20 bg-green-500/5' : isPast ? 'border-red-500/20 bg-red-500/5' : 'border-blue-500/20 bg-blue-500/5'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${fu.completed ? 'text-green-400' : isPast ? 'text-red-400' : 'text-blue-400'}`}>
                        {format(fuDate, 'MMM d, yyyy')}
                        {fu.completed && <span className="ml-2 text-xs font-normal text-muted-foreground">✓ Done</span>}
                        {!fu.completed && isPast && <span className="ml-2 text-xs font-normal text-red-400">Overdue</span>}
                      </p>
                      {fu.note && <p className="text-xs text-muted-foreground mt-0.5 break-words">{fu.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Schedule Follow-Up */}
          {(isFromD4d || (property.workflow_stage && FOLLOWUP_ELIGIBLE_STAGES.includes(property.workflow_stage as any))) && (
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
                  if (!followUpDate || !property) return;
                  setSavingFollowUp(true);
                  try {
                    await createFollowUp({
                      date: followUpDate.toISOString(),
                      note: followUpNote || undefined,
                      ...(isFromD4d ? { drivingLeadId: d4dLeadId } : { propertyId: property.id }),
                    });
                    toast({ title: 'Follow-up scheduled', description: format(followUpDate, 'PPP') });
                    setFollowUpDate(undefined);
                    setFollowUpNote('');
                    refetchFollowUps();
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

          {/* Phone Numbers Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setPhoneExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Phone Numbers</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !phoneExpanded && "-rotate-90"
              )} />
            </div>
            {phoneExpanded && (
              <div className="space-y-2 mt-3">
                {phoneContacts.map((contact, rowIndex) => (
                  <div key={rowIndex} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6 shrink-0">
                      {rowIndex + 1}.
                    </span>
                    <Input
                      value={contact.name}
                      onChange={(e) => {
                        const updated = [...phoneContacts];
                        updated[rowIndex] = { ...updated[rowIndex], name: e.target.value };
                        setPhoneContacts(updated);
                      }}
                      onBlur={async (e) => {
                        if (!e.target.value.trim() && !contact.phones.some(p => p.number.trim())) return;
                        const updated = [...phoneContacts];
                        updated[rowIndex] = { ...updated[rowIndex], name: e.target.value };
                        const allPhoneNumbers = updated.flatMap(r => r.phones.filter(p => p.number.trim()).map(p => p.number));
                        const contacts = {
                          ownerOverride: ownerOverride.trim(),
                          phoneRows: updated.filter(r => r.name.trim() || r.phones.some(p => p.number.trim())).map(r => ({ name: r.name, phones: r.phones.filter(p => p.number.trim()).map(p => ({ number: p.number, status: p.status || '' })) })),
                          emailRows: emailRecipients.filter(r => r.name.trim() || r.emails.some(e => e.trim())).map(r => ({ name: r.name, emails: r.emails.filter(e => e.trim()), sent: (r as any).sent || false })),
                        };
                        try {
                          if (isD4d) {
                            await updateDrivingLeadPhones(d4dLeadId, allPhoneNumbers, ownerPhoneIndex, contacts, ownerOverride);
                            queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
                          } else {
                            await updatePropertyPhoneNumbers(property.id, allPhoneNumbers, ownerPhoneIndex, contacts);
                          }
                        } catch { /* silent */ }
                      }}
                      placeholder="Name"
                      className="w-28 shrink-0"
                    />
                    <div className="flex-1 overflow-x-auto">
                      <div className="flex items-center gap-1.5">
                        {contact.phones.map((phone, phoneIdx) => (
                          <div key={phoneIdx} className="flex items-center gap-1 shrink-0">
                          <div className="relative">
                            <Input
                              type="tel"
                              value={phone.number}
                              onChange={(e) => {
                                const updated = [...phoneContacts];
                                const newPhones = [...updated[rowIndex].phones];
                                newPhones[phoneIdx] = { ...newPhones[phoneIdx], number: e.target.value };
                                updated[rowIndex] = { ...updated[rowIndex], phones: newPhones };
                                setPhoneContacts(updated);
                              }}
                              placeholder={`Phone ${phoneIdx + 1}`}
                              className={cn(
                                "w-[130px] shrink-0 text-xs font-mono pr-7",
                                phone.status === 'not_working' && "border-red-500 bg-red-500/15 text-red-400 line-through",
                                phone.status === 'rings' && "border-green-500 bg-green-500/10 text-green-400",
                                phone.status === 'voicemail' && "border-yellow-500 bg-yellow-500/10 text-yellow-400",
                                phone.status === 'contacted' && "border-blue-500 bg-blue-500/10 text-blue-400",
                              )}
                            />
                            <Popover open={openPhoneStatusKey === `${rowIndex}-${phoneIdx}`} onOpenChange={open => setOpenPhoneStatusKey(open ? `${rowIndex}-${phoneIdx}` : null)}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className={cn(
                                    "absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-[10px] font-bold cursor-pointer hover:bg-muted/50",
                                    !phone.status && "text-muted-foreground/50",
                                    phone.status === 'not_working' && "text-red-400",
                                    phone.status === 'rings' && "text-green-400",
                                    phone.status === 'voicemail' && "text-yellow-400",
                                    phone.status === 'contacted' && "text-blue-400",
                                  )}
                                >
                                  {!phone.status && <ChevronDown className="h-3 w-3" />}
                                  {phone.status === 'rings' && <span>✓</span>}
                                  {phone.status === 'not_working' && <span>✗</span>}
                                  {phone.status === 'voicemail' && <span>VM</span>}
                                  {phone.status === 'contacted' && <span>C</span>}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-36 p-1" align="end" side="bottom">
                                {[
                                  { value: '', label: 'No Status', color: '' },
                                  { value: 'rings', label: 'Rings', color: 'text-green-400' },
                                  { value: 'not_working', label: 'Not Working', color: 'text-red-400' },
                                  { value: 'contacted', label: 'Contacted', color: 'text-blue-400' },
                                ].map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    className={cn(
                                      "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2",
                                      phone.status === opt.value && "bg-muted font-medium",
                                    )}
                                    onClick={async () => {
                                      const updated = [...phoneContacts];
                                      const newPhones = [...updated[rowIndex].phones];
                                      newPhones[phoneIdx] = { ...newPhones[phoneIdx], status: opt.value as PhoneEntry['status'] };
                                      updated[rowIndex] = { ...updated[rowIndex], phones: newPhones };
                                      setPhoneContacts(updated);
                                      // Auto-save immediately using locally computed values
                                      try {
                                        const allPhoneNumbers = updated.flatMap(r => r.phones.filter(p => p.number.trim()).map(p => p.number));
                                        const contacts = {
                                          ownerOverride: ownerOverride.trim(),
                                          phoneRows: updated.filter(r => r.name.trim() || r.phones.some(p => p.number.trim())).map(r => ({ name: r.name, phones: r.phones.filter(p => p.number.trim()).map(p => ({ number: p.number, status: p.status || '' })) })),
                                          emailRows: emailRecipients.filter(r => r.name.trim() || r.emails.some(e => e.trim())).map(r => ({ name: r.name, emails: r.emails.filter(e => e.trim()), sent: (r as any).sent || false })),
                                        };
                                        if (isFromD4d) {
                                          await updateDrivingLeadPhones(d4dLeadId, allPhoneNumbers, ownerPhoneIndex, contacts, ownerOverride);
                                          if (!isD4d) await updatePropertyPhoneNumbers(property.id, allPhoneNumbers, ownerPhoneIndex, contacts).catch(() => {});
                                          queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
                                        } else {
                                          await updatePropertyPhoneNumbers(property.id, allPhoneNumbers, ownerPhoneIndex, contacts);
                                        }
                                        if (opt.value === 'contacted' && isFromD4d) {
                                          setOpenPhoneStatusKey(null);
                                          setShowPhoneContactedPrompt(true);
                                        }
                                      } catch { /* silent — don't interrupt UX */ }
                                    }}
                                  >
                                    <span className={cn("w-2 h-2 rounded-full shrink-0", {
                                      'bg-muted-foreground/30': !opt.value,
                                      'bg-green-400': opt.value === 'rings',
                                      'bg-red-400': opt.value === 'not_working',
                                      'bg-yellow-400': opt.value === 'voicemail',
                                      'bg-blue-400': opt.value === 'contacted',
                                    })} />
                                    <span className={opt.color}>{opt.label}</span>
                                  </button>
                                ))}
                              </PopoverContent>
                            </Popover>
                          </div>
                          {phone.number.trim() && (
                            <a
                              href={`tel:+${phone.number.replace(/\D/g, '').length === 10 ? '1' + phone.number.replace(/\D/g, '') : phone.number.replace(/\D/g, '')}`}
                              title={`Call ${phone.number}`}
                              className="h-7 w-7 flex items-center justify-center rounded text-green-400 hover:bg-green-400/10 shrink-0"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            const updated = [...phoneContacts];
                            updated[rowIndex] = { ...updated[rowIndex], phones: [...updated[rowIndex].phones, { number: '', status: '' }] };
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
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-green-500"
                    onClick={() => {
                      const contacts = phoneContacts
                        .filter(r => r.phones.some(p => p.number.trim()))
                        .map(r => ({
                          name: r.name.trim(),
                          phones: r.phones.filter(p => p.number.trim() && p.status !== 'not_working').map(p => p.number.trim()),
                        }))
                        .filter(r => r.phones.length > 0);
                      if (contacts.length === 0) return;
                      const numbers = contacts.flatMap(c => c.phones.map(p => ({ name: c.name, phone: p })));
                      const numbersParam = numbers.map(n => encodeURIComponent(n.phone)).join('|');
                      const namesParam = numbers.map(n => encodeURIComponent(n.name)).join('|');
                      window.location.href = `dialer://start?numbers=${numbersParam}&names=${namesParam}`;
                    }}
                    title="Start sequential dialing via Google Voice (requires dialer.py installed)"
                  >
                    <Phone className="h-4 w-4 mr-1" />
                    Start Dialing
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary"
                    onClick={handleSavePhoneNumbers}
                    disabled={savingPhones}
                    title="Save all phone numbers"
                  >
                    {savingPhones ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Contact Extractor Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setContactExtractorExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Contact Extractor</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !contactExtractorExpanded && "-rotate-90"
              )} />
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
                  onClick={async () => {
                    const result = extractContacts(rawContactText);

                    // Collect all existing phone digits across all rows for dedup
                    const existingPhoneDigits = new Set(
                      phoneContacts.flatMap(r => r.phones.filter(p => p.number.trim()).map(p => p.number.replace(/\D/g, '').slice(-10)))
                    );
                    // Collect all existing emails across all rows for dedup
                    const existingEmails = new Set(
                      emailRecipients.flatMap(r => r.emails.filter(e => e.includes('@')).map(e => e.toLowerCase().trim()))
                    );

                    // Filter out duplicate phones
                    const newPhones = result.phones.filter(p => !existingPhoneDigits.has(p.replace(/\D/g, '').slice(-10)));
                    // Filter out duplicate emails
                    const newEmails = result.emails.filter(e => !existingEmails.has(e.toLowerCase().trim()));

                    // Fill phone section — smart row placement
                    let finalPhones = phoneContacts;
                    if (newPhones.length > 0 || result.name) {
                      const updated = [...phoneContacts];
                      const row1Empty = !updated[0].name.trim() && !updated[0].phones.some(p => p.number.trim());
                      const row1SameName = result.name && updated[0].name.trim().toLowerCase() === result.name.toLowerCase();
                      let targetRow: number;
                      if (row1Empty || row1SameName) {
                        targetRow = 0;
                      } else {
                        const emptyIdx = updated.findIndex((r, i) => i > 0 && !r.name.trim() && !r.phones.some(p => p.number.trim()));
                        if (emptyIdx !== -1) {
                          targetRow = emptyIdx;
                        } else {
                          updated.push({ name: '', phones: [{ number: '', status: '' }] });
                          targetRow = updated.length - 1;
                        }
                      }
                      updated[targetRow] = {
                        name: result.name || '',
                        phones: newPhones.length > 0
                          ? newPhones.map(p => ({ number: p, status: '' as const }))
                          : [{ number: '', status: '' as const }],
                      };
                      finalPhones = updated;
                      setPhoneContacts(updated);
                    }
                    // Fill email section — smart row placement
                    let finalEmails = emailRecipients;
                    if (newEmails.length > 0 || result.name) {
                      const updated = [...emailRecipients];
                      const row1Empty = !updated[0].name.trim() && !updated[0].emails.some(e => e.includes('@'));
                      const row1SameName = result.name && updated[0].name.trim().toLowerCase() === result.name.toLowerCase();
                      let targetRow: number;
                      if (row1Empty || row1SameName) {
                        targetRow = 0;
                      } else {
                        const emptyIdx = updated.findIndex((r, i) => i > 0 && !r.name.trim() && !r.emails.some(e => e.includes('@')));
                        if (emptyIdx !== -1) {
                          targetRow = emptyIdx;
                        } else {
                          updated.push({ name: '', emails: [''] });
                          targetRow = updated.length - 1;
                        }
                      }
                      updated[targetRow] = {
                        name: result.name || '',
                        emails: newEmails.length > 0 ? newEmails : [''],
                      };
                      finalEmails = updated;
                      setEmailRecipients(updated);
                    }
                    // Auto-save immediately using the locally computed values
                    try {
                      const allPhoneNumbers = finalPhones.flatMap(r => r.phones.filter(p => p.number.trim()).map(p => p.number));
                      const allEmailAddresses = finalEmails.flatMap(r => r.emails.filter(e => e.includes('@')));
                      const contacts = {
                        ownerOverride: ownerOverride.trim(),
                        phoneRows: finalPhones.filter(r => r.name.trim() || r.phones.some(p => p.number.trim())).map(r => ({ name: r.name, phones: r.phones.filter(p => p.number.trim()).map(p => ({ number: p.number, status: p.status || '' })) })),
                        emailRows: finalEmails.filter(r => r.name.trim() || r.emails.some(e => e.trim())).map(r => ({ name: r.name, emails: r.emails.filter(e => e.trim()), sent: (r as any).sent || false })),
                      };
                      if (isD4d) {
                        await updateDrivingLeadPhones(d4dLeadId, allPhoneNumbers, ownerPhoneIndex, contacts, ownerOverride);
                      } else {
                        await updatePropertyPhoneNumbers(property.id, allPhoneNumbers, ownerPhoneIndex, contacts);
                        await updatePropertyEmails(property.id, allEmailAddresses, contacts);
                      }
                      property.phoneNumbers = allPhoneNumbers;
                      property.emails = allEmailAddresses;
                      property.contacts = contacts;
                    } catch { /* silent — don't block UI */ }
                    // Expand both sections so user can see the filled data
                    setPhoneExpanded(true);
                    setEmailExpanded(true);
                    // Clear the textarea for the next paste
                    setRawContactText('');
                    // Show confirmation
                    const parts = [];
                    if (result.name) parts.push(`Name: ${result.name}`);
                    if (newPhones.length > 0) parts.push(`${newPhones.length} phones`);
                    if (newEmails.length > 0) parts.push(`${newEmails.length} emails`);
                    const dupeCount = (result.phones.length - newPhones.length) + (result.emails.length - newEmails.length);
                    if (dupeCount > 0) parts.push(`${dupeCount} duplicates skipped`);
                    if (parts.length > 0) {
                      toast({ title: 'Contacts Extracted & Saved', description: parts.join(', ') });
                    } else {
                      toast({ title: 'No contacts found', description: 'Try pasting more text', variant: 'destructive' });
                    }
                  }}
                  disabled={!rawContactText.trim()}
                >
                  Extract Contacts
                </Button>
              </div>
            )}
          </div>

          {/* Email Section */}
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
            {emailExpanded && (
              <div className="space-y-2 mt-3">
                {emailRecipients.map((recipient, index) => {
                  const validEmails = recipient.emails.filter(e => e.includes('@'));
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs w-6 shrink-0 flex items-center justify-center">
                        {recipient.sent
                          ? <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                          : <span className="text-muted-foreground">{index + 1}.</span>
                        }
                      </span>
                      <Input
                        value={recipient.name}
                        onChange={(e) => {
                          const updated = [...emailRecipients];
                          updated[index] = { ...updated[index], name: e.target.value };
                          setEmailRecipients(updated);
                        }}
                        placeholder="Name"
                        className="w-28 shrink-0"
                      />
                      <div className="flex-1 overflow-x-auto">
                        <div className="flex items-center gap-1.5">
                          {recipient.emails.map((email, emailIdx) => (
                            <Input
                              key={emailIdx}
                              type="email"
                              value={email}
                              onChange={(e) => {
                                const updated = [...emailRecipients];
                                const newEmails = [...updated[index].emails];
                                newEmails[emailIdx] = e.target.value;
                                updated[index] = { ...updated[index], emails: newEmails };
                                setEmailRecipients(updated);
                              }}
                              placeholder={`Email ${emailIdx + 1}`}
                              className="w-[180px] shrink-0 text-xs"
                            />
                          ))}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                            onClick={() => {
                              const updated = [...emailRecipients];
                              updated[index] = { ...updated[index], emails: [...updated[index].emails, ''] };
                              setEmailRecipients(updated);
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
                        onClick={async () => {
                          if (validEmails.length === 0) return;
                          setSendingEmailIndex(index);
                          try {
                            const ownerPhone = property.ownerPhoneIndex != null && property.phoneNumbers?.[property.ownerPhoneIndex]
                              ? property.phoneNumbers[property.ownerPhoneIndex]
                              : (property.phoneNumbers?.find(p => p) || '');
                            const fullName = recipient.name.trim();
                            const lastName = fullName.split(/\s+/).pop() || fullName || 'there';
                            const personalBody = emailBody
                              .replace(/\{\{LastName\}\}/g, lastName)
                              .replace(/\{\{Name\}\}/g, fullName || 'there')
                              .replace(/\{\{PropertyAddress\}\}/g, emailAddress)
                              .replace(/\{\{Owner\}\}/g, emailOwner)
                              .replace(/\{\{PhoneNumber\}\}/g, ownerPhone);
                            const resolvedSubject = emailSubject
                              .replace(/\{\{PropertyAddress\}\}/g, emailAddress)
                              .replace(/\{\{Owner\}\}/g, emailOwner);
                            await sendEmail({ to: validEmails, subject: resolvedSubject, body: personalBody });
                            toast({ title: `Email sent to ${validEmails.length} address${validEmails.length > 1 ? 'es' : ''}` });
                          } catch (err) {
                            toast({ title: 'Failed to send', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
                          } finally {
                            setSendingEmailIndex(null);
                          }
                        }}
                        disabled={validEmails.length === 0 || sendingEmailIndex === index}
                        title="Send to all emails in this row"
                      >
                        {sendingEmailIndex === index ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}

                <div className="border-t border-border pt-3 mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">Subject:</span>
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Email subject"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Variables: <code className="bg-muted px-1 rounded">{'{{LastName}}'}</code> <code className="bg-muted px-1 rounded">{'{{Name}}'}</code> <code className="bg-muted px-1 rounded">{'{{PropertyAddress}}'}</code> <code className="bg-muted px-1 rounded">{'{{Owner}}'}</code></p>
                  <Textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={8}
                    className="text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const ownerPhone = property.ownerPhoneIndex != null && property.phoneNumbers?.[property.ownerPhoneIndex]
                        ? property.phoneNumbers[property.ownerPhoneIndex]
                        : (property.phoneNumbers?.find(p => p) || '');
                      const resolved = emailBody
                        .replace(/\{\{LastName\}\}/g, '___')
                        .replace(/\{\{Name\}\}/g, '___')
                        .replace(/\{\{PropertyAddress\}\}/g, emailAddress)
                        .replace(/\{\{Owner\}\}/g, emailOwner)
                        .replace(/\{\{PhoneNumber\}\}/g, ownerPhone);
                      navigator.clipboard.writeText(resolved);
                      toast({ title: 'Email copied to clipboard' });
                    }}
                  >
                    Copy Text
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const allEmails = emailRecipients
                        .flatMap(r => r.emails.filter(e => e.includes('@')));
                      if (allEmails.length === 0) return;
                      setSendingAllEmails(true);
                      try {
                        // Save contacts structure + flat emails to persist row data
                        const contacts = buildContactsJson();
                        if (!isD4d) await updatePropertyEmails(property.id, allEmails, contacts);
                        else await updateDrivingLeadEmails(d4dLeadId, allEmails, contacts, ownerOverride);
                        property.emails = allEmails;
                        property.contacts = contacts;

                        const ownerPhone = property.ownerPhoneIndex != null && property.phoneNumbers?.[property.ownerPhoneIndex]
                          ? property.phoneNumbers[property.ownerPhoneIndex]
                          : (property.phoneNumbers?.find(p => p) || '');
                        const resolvedSubject = emailSubject
                          .replace(/\{\{PropertyAddress\}\}/g, emailAddress)
                          .replace(/\{\{Owner\}\}/g, emailOwner);
                        // Send personalized email per row so each person gets their own name
                        let sentCount = 0;
                        const updatedRecipients = [...emailRecipients];
                        for (let ri = 0; ri < emailRecipients.length; ri++) {
                          const recipient = emailRecipients[ri];
                          const rowEmails = recipient.emails.filter(e => e.includes('@'));
                          if (rowEmails.length === 0 || recipient.sent) continue;
                          const fullName = recipient.name.trim();
                          const lastName = fullName.split(/\s+/).pop() || fullName || 'there';
                          const resolved = emailBody
                            .replace(/\{\{LastName\}\}/g, lastName)
                            .replace(/\{\{Name\}\}/g, fullName || 'there')
                            .replace(/\{\{PropertyAddress\}\}/g, emailAddress)
                            .replace(/\{\{Owner\}\}/g, emailOwner)
                            .replace(/\{\{PhoneNumber\}\}/g, ownerPhone);
                          await sendEmail({ to: rowEmails, subject: resolvedSubject, body: resolved });
                          sentCount += rowEmails.length;
                          updatedRecipients[ri] = { ...updatedRecipients[ri], sent: true };
                        }
                        setEmailRecipients(updatedRecipients);
                        // Persist sent flags
                        const updatedContacts = { ...buildContactsJson(), emailRows: updatedRecipients.filter(r => r.name.trim() || r.emails.some(e => e.trim())).map(r => ({ name: r.name, emails: r.emails.filter(e => e.trim()), sent: r.sent || false })) };
                        if (!isD4d) {
                          await updatePropertyEmails(property.id, allEmails, updatedContacts);
                        } else {
                          await updateDrivingLeadEmails(d4dLeadId, allEmails, updatedContacts, ownerOverride);
                          queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
                        }
                        property.contacts = updatedContacts;
                        toast({ title: `Email sent to ${sentCount} address${sentCount > 1 ? 'es' : ''}` });
                      } catch (err) {
                        toast({ title: 'Failed to send', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
                      } finally {
                        setSendingAllEmails(false);
                      }
                    }}
                    disabled={!emailRecipients.some(r => r.emails.some(e => e.includes('@'))) || sendingAllEmails}
                  >
                    {sendingAllEmails ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {sendingAllEmails ? 'Sending...' : 'Send to All'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {property.link ? (
              <Button asChild>
                <a 
                  href={property.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Property Details
                </a>
              </Button>
            ) : (
              <Button asChild>
                <a 
                  href="https://bexar.acttax.com/act_webdev/bexar/index.jsp"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on Bexar County
                </a>
              </Button>
            )}
          </div>
        </div>

        </div>{/* end scrollable content */}

        {/* Phone Contacted outcome overlay — sibling of scroll div, covers dialog only */}
        {showPhoneContactedPrompt && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 rounded-lg" onClick={() => setShowPhoneContactedPrompt(false)}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-[340px] overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-border">
                <h3 className="text-base font-semibold text-foreground">Log Call Outcome</h3>
                <p className="text-sm text-muted-foreground mt-1">How did the conversation go?</p>
              </div>
              {/* Options */}
              <div className="px-6 py-4 space-y-2">
                {([
                  { key: 'wants_to_sell', label: 'Wants to Sell' },
                  { key: 'thinking_about_selling', label: 'Thinking About Selling' },
                  { key: 'doesnt_want_to_sell', label: "Doesn't Want to Sell" },
                ] as const).map(o => (
                  <button key={o.key}
                    className="w-full text-left px-4 py-3 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    onClick={async () => {
                      try {
                        await updateDrivingLead(d4dLeadId, { status: 'CONTACTED' });
                        setD4dPipelineStage('CONTACTED');
                        const updated = { ...d4dWorkflow, contactedOutcome: o.key, lastContactedAt: new Date().toISOString() };
                        setD4dWorkflow(updated);
                        await updateDrivingLead(d4dLeadId, { metadata: updated as Record<string, unknown> });
                        queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
                      } catch { /* silent */ }
                      setShowPhoneContactedPrompt(false);
                    }}>
                    {o.label}
                  </button>
                ))}
              </div>
              {/* Footer */}
              <div className="px-6 pb-5">
                <button className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  onClick={() => setShowPhoneContactedPrompt(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
