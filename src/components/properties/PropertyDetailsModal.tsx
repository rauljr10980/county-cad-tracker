import { useState, useEffect } from 'react';
import { ExternalLink, MapPin, DollarSign, Calendar, FileText, TrendingUp, StickyNote, Edit2, Phone, Star, CheckCircle, MapPin as MapPinIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property } from '@/types/property';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { updatePropertyNotes, updatePropertyPhoneNumbers, updatePropertyAction, updatePropertyVisited, getPreForeclosures } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { PreForeclosureRecord } from '@/types/property';
import { PropertyWorkflowTracker } from './PropertyWorkflowTracker';

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
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>(['', '', '', '', '', '']);
  const [ownerPhoneIndex, setOwnerPhoneIndex] = useState<number | undefined>(undefined);
  const [savingPhones, setSavingPhones] = useState(false);

  // Actions & Tasks state
  const [actionType, setActionType] = useState<'call' | 'text' | 'mail' | 'driveby' | ''>('');
  const [priority, setPriority] = useState<'high' | 'med' | 'low'>('med');
  const [dueDateTime, setDueDateTime] = useState<Date | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<'Luciano' | 'Raul' | ''>('');
  const [savingAction, setSavingAction] = useState(false);


  // Visited status state
  const [visited, setVisited] = useState(false);
  const [visitedBy, setVisitedBy] = useState<'Luciano' | 'Raul' | ''>('');
  const [savingVisited, setSavingVisited] = useState(false);

  // Pre-foreclosure state
  const [preForeclosureRecords, setPreForeclosureRecords] = useState<PreForeclosureRecord[]>([]);
  const [loadingPreForeclosure, setLoadingPreForeclosure] = useState(false);
  const [showPreForeclosure, setShowPreForeclosure] = useState(false);
  const [activeAction, setActiveAction] = useState<'view' | 'send' | 'external'>('view');

  // Initialize notes and phone numbers from property when modal opens or property changes
  useEffect(() => {
    if (property && isOpen) {
      setNotes(property.notes || '');
      setIsEditingNotes(false);
      const phones = property.phoneNumbers || [];
      setPhoneNumbers([
        phones[0] || '',
        phones[1] || '',
        phones[2] || '',
        phones[3] || '',
        phones[4] || '',
        phones[5] || '',
      ]);
      setOwnerPhoneIndex(property.ownerPhoneIndex);

      // Initialize actions & tasks
      setActionType(property.actionType || '');
      setPriority(property.priority || 'med');
      setDueDateTime(property.dueTime ? new Date(property.dueTime) : undefined);
      setAssignedTo(property.assignedTo || '');

      // Initialize visited status
      setVisited(property.visited || false);
      setVisitedBy(property.visitedBy || '');
      
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

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await updatePropertyNotes(property.id, notes);
      toast({
        title: "Notes Saved",
        description: `Notes saved for ${property.accountNumber}`,
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

  const handleSavePhoneNumbers = async () => {
    setSavingPhones(true);
    try {
      const filteredPhones = phoneNumbers.filter(p => p.trim() !== '');
      await updatePropertyPhoneNumbers(property.id, filteredPhones, ownerPhoneIndex);
      toast({
        title: "Phone Numbers Saved",
        description: `Phone numbers saved for ${property.accountNumber}`,
      });
      property.phoneNumbers = filteredPhones;
      property.ownerPhoneIndex = ownerPhoneIndex;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save phone numbers",
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
      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-5xl max-h-[85vh] overflow-y-auto bg-card border-border">
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
              </p>
            </div>
          </div>
        </DialogHeader>


        <div className="space-y-4 pt-2">
          {/* Property Info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-primary mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Property Address</p>
                <p className="font-medium">{parsedAddress || property.propertyAddress}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-primary mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Legal Description</p>
                <p className="text-sm">{property.legalDescription || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-primary mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Owner</p>
                <p className="font-medium">{parsedOwnerName || property.ownerName}</p>
                <p className="text-sm text-muted-foreground">{property.mailingAddress}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Financial Summary</span>
            </div>
            {(() => {
              // Collect all financial fields that should be displayed
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
              ].filter(Boolean);

              return (
                <div className="grid grid-cols-2 gap-2">
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
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Tax Percentage</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(property.totalPercentage || 0, 100)}%` }}
                />
              </div>
              <span className="font-mono text-base font-semibold min-w-[50px] text-right">
                {property.totalPercentage || 0}%
              </span>
            </div>
          </div>
              
          {/* Payment & Tax Information and Exemptions & Jurisdictions - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Payment & Tax Information */}
                <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-3 w-3 text-primary" />
                    <p className="text-xs font-medium text-muted-foreground">Payment & Tax Information</p>
                  </div>
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
                <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
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
              </div>

          {/* Additional Details Section */}
          {(property.link || property.ownerAddress) && (
            <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Additional Details</p>
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
            </div>
          )}

          {/* Payment History Chart */}
          {paymentChartData.length > 0 && (
            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Payment History</span>
              </div>
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
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Notes</span>
              </div>
              {!isEditingNotes && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingNotes(true)}
                  className="h-7"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  {notes ? 'Edit' : 'Add Notes'}
                </Button>
              )}
            </div>
            {isEditingNotes ? (
              <div className="space-y-2">
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
              <div className="text-sm text-muted-foreground min-h-[60px] whitespace-pre-wrap">
                {notes || 'No notes added yet. Click "Add Notes" to add notes for this property.'}
              </div>
            )}
          </div>

          {/* Visited Status Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <MapPinIcon className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Visited Status</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="visited-checkbox"
                  checked={visited}
                  onChange={(e) => setVisited(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="visited-checkbox" className="text-sm cursor-pointer">
                  Mark as visited
                </label>
              </div>
              {visited && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Visited By</label>
                  <Select value={visitedBy} onValueChange={(value) => setVisitedBy(value as 'Luciano' | 'Raul')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select who visited" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Luciano">Luciano</SelectItem>
                      <SelectItem value="Raul">Raul</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {property.visitedAt && (
                <div className="text-xs text-muted-foreground">
                  Last visited: {format(new Date(property.visitedAt), 'PPP p')}
                  {property.visitedBy && ` by ${property.visitedBy}`}
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveVisited}
                  disabled={savingVisited || (visited && !visitedBy)}
                >
                  {savingVisited ? 'Saving...' : 'Save Visited Status'}
                </Button>
              </div>
            </div>
          </div>

          {/* Actions & Tasks Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Actions & Tasks</span>
            </div>
            <div className="space-y-4">
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
            </div>
          </div>

          {/* Deal Workflow Section */}
          <PropertyWorkflowTracker
            property={property}
            onPropertyUpdate={(updated) => {
              Object.assign(property, updated);
            }}
          />

          {/* Phone Numbers Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Phone Numbers</span>
            </div>
            <div className="space-y-2">
              {phoneNumbers.map((phone, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">
                    Phone {index + 1}:
                  </span>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      const newPhones = [...phoneNumbers];
                      newPhones[index] = e.target.value;
                      setPhoneNumbers(newPhones);
                    }}
                    placeholder="Enter phone number"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8 shrink-0",
                      ownerPhoneIndex === index && "text-yellow-500"
                    )}
                    onClick={() => handleToggleOwnerPhone(index)}
                    title={ownerPhoneIndex === index ? "Owner's phone (click to unmark)" : "Click star for owner phone number"}
                  >
                    <Star className={cn(
                      "h-4 w-4",
                      ownerPhoneIndex === index ? "fill-yellow-500" : "fill-none"
                    )} />
                  </Button>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={handleSavePhoneNumbers}
                  disabled={savingPhones}
                >
                  {savingPhones ? 'Saving...' : 'Save Phone Numbers'}
                </Button>
              </div>
            </div>
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
      </DialogContent>
    </Dialog>
  );
}
