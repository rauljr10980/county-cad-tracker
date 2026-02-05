import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Eye, Send, ExternalLink, MapPin, CheckCircle, Target, RotateCcw, Phone, Star, Trash2, Calendar, ChevronDown, Home, Building, AlertTriangle, Copy, Search, User, Mail } from 'lucide-react';
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
import { PreForeclosureRecord, PreForeclosureType, WORKFLOW_STAGES } from '@/types/property';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { markPreForeclosureVisited } from '@/lib/api';
import { extractCoordsFromGoogleMapsUrl } from '@/lib/geocoding';
import { WorkflowTracker } from './WorkflowTracker';

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
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [routeStatusExpanded, setRouteStatusExpanded] = useState(false);
  const [actionsTasksExpanded, setActionsTasksExpanded] = useState(false);
  const [currentTaskExpanded, setCurrentTaskExpanded] = useState(false);
  const [ownerInfoExpanded, setOwnerInfoExpanded] = useState(false);
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
    }
  }, [record]);

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
      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Pre-Foreclosure Details
          </DialogTitle>
          <DialogDescription>
            Document #{viewRecord.document_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  window.open('https://bexar.acttax.com/act_webdev/bexar/index.jsp', '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4" />
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

          {/* Workflow Tracker */}
          <WorkflowTracker
            record={viewRecord}
            onRecordUpdate={(updates) => setViewRecord(prev => prev ? { ...prev, ...updates } : prev)}
          />

          {/* Owner Information Section */}
          <div className="bg-secondary/30 rounded-lg p-3 sm:p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setOwnerInfoExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Owner Information</span>
                {viewRecord.ownerLookupStatus && (
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    viewRecord.ownerLookupStatus === 'success' && "bg-green-500/20 text-green-400 border-green-500/30",
                    viewRecord.ownerLookupStatus === 'partial' && "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                    viewRecord.ownerLookupStatus === 'failed' && "bg-red-500/20 text-red-400 border-red-500/30",
                    viewRecord.ownerLookupStatus === 'pending' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                  )}>
                    {viewRecord.ownerLookupStatus === 'success' ? 'Found' :
                     viewRecord.ownerLookupStatus === 'partial' ? 'Partial' :
                     viewRecord.ownerLookupStatus === 'failed' ? 'Failed' : 'Pending'}
                  </Badge>
                )}
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !ownerInfoExpanded && "-rotate-90"
              )} />
            </div>
            {ownerInfoExpanded && (
              <div className="space-y-3 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOwnerLookup}
                  disabled={lookupMutation.isPending}
                  className="w-full"
                >
                  {lookupMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Looking up owner...
                    </>
                  ) : viewRecord.ownerLookupStatus ? (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Re-run Owner Lookup
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Look Up Owner
                    </>
                  )}
                </Button>

                {viewRecord.ownerName && (
                  <div>
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <User className="h-3 w-3" /> Owner Name
                    </Label>
                    <p className="text-sm font-medium">{viewRecord.ownerName}</p>
                  </div>
                )}

                {viewRecord.ownerAddress && (
                  <div>
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Mailing Address
                    </Label>
                    <p className="text-sm">{viewRecord.ownerAddress}</p>
                  </div>
                )}

                {viewRecord.emails && viewRecord.emails.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Emails
                    </Label>
                    <div className="space-y-1 mt-1">
                      {viewRecord.emails.map((email, i) => (
                        <a
                          key={i}
                          href={`mailto:${email}`}
                          className="block text-sm text-blue-400 hover:underline"
                        >
                          {email}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {viewRecord.ownerLookupAt && (
                  <p className="text-xs text-muted-foreground">
                    Last lookup: {format(new Date(viewRecord.ownerLookupAt), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Phone Numbers Section */}
          <div className="bg-secondary/30 rounded-lg p-3 sm:p-4" style={{ display: 'block' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Phone Numbers</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => window.open('https://www.truepeoplesearch.com', '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1.5" />
                TruePeopleSearch
              </Button>
            </div>
            <div className="space-y-2">
              {(() => {
                const phoneNumbersArray = Array.isArray(viewRecord.phoneNumbers) ? viewRecord.phoneNumbers : [];
                // Show at least 6 fields, or more if we have more numbers
                const fieldCount = Math.max(6, phoneNumbersArray.length);
                return Array.from({ length: fieldCount }, (_, index) => {
                  const phoneValue = phoneNumbersArray[index] || '';
                  const isOwnerPhone = viewRecord.ownerPhoneIndex === index;
                  return (
                    <div key={index} className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-xs text-muted-foreground w-8 sm:w-16 shrink-0">
                        <span className="hidden sm:inline">Phone </span>{index + 1}:
                      </span>
                      <Input
                        type="tel"
                        value={phoneValue}
                        onChange={(e) => {
                          const currentPhones = viewRecord.phoneNumbers || [];
                          const newPhoneNumbers = [...currentPhones];
                          newPhoneNumbers[index] = e.target.value;
                          setViewRecord({
                            ...viewRecord,
                            phoneNumbers: newPhoneNumbers,
                          });
                        }}
                        placeholder="Enter phone number"
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8 shrink-0",
                          isOwnerPhone && "text-yellow-500"
                        )}
                        onClick={() => {
                          const newOwnerPhoneIndex = isOwnerPhone ? undefined : index;
                          setViewRecord({
                            ...viewRecord,
                            ownerPhoneIndex: newOwnerPhoneIndex,
                          });
                          const currentPhones = Array.isArray(viewRecord.phoneNumbers) ? viewRecord.phoneNumbers : [];
                          updateMutation.mutateAsync({
                            document_number: viewRecord.document_number,
                            phoneNumbers: currentPhones,
                            ownerPhoneIndex: newOwnerPhoneIndex,
                          }).catch((error) => {
                            console.error('Error saving owner phone index:', error);
                          });
                        }}
                        title={isOwnerPhone ? "Owner's phone (click to unmark)" : "Click star for owner phone number"}
                      >
                        <Star className={cn(
                          "h-4 w-4",
                          isOwnerPhone ? "fill-yellow-500" : "fill-none"
                        )} />
                      </Button>
                    </div>
                  );
                });
              })()}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const currentPhones = Array.isArray(viewRecord.phoneNumbers) ? viewRecord.phoneNumbers : [];
                      await updateMutation.mutateAsync({
                        document_number: viewRecord.document_number,
                        phoneNumbers: currentPhones,
                        ownerPhoneIndex: viewRecord.ownerPhoneIndex,
                      });
                      toast({
                        title: 'Phone Numbers Saved',
                        description: 'Phone numbers have been saved successfully.',
                      });
                      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                    } catch (error) {
                      console.error('Error saving phone numbers:', error);
                      toast({
                        title: 'Error',
                        description: 'Failed to save phone numbers. Please try again.',
                        variant: 'destructive',
                      });
                    }
                  }}
                  disabled={updateMutation.isPending}
                >
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
