import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Navigation, Calendar, CalendarPlus, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property, PropertyStatus } from '@/types/property';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { updatePropertyFollowUp, updatePropertyNotes } from '@/lib/api';

interface PropertyTableProps {
  properties: Property[];
  onViewProperty: (property: Property) => void;
  onFollowUp?: (property: Property) => void;
  statusFilter?: PropertyStatus;
  onStatusFilterChange?: (status: PropertyStatus | undefined) => void;
}

const ITEMS_PER_PAGE = 25;

export function PropertyTable({ 
  properties, 
  onViewProperty,
  onFollowUp,
  statusFilter,
  onStatusFilterChange 
}: PropertyTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof Property>('totalAmountDue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [savingFollowUp, setSavingFollowUp] = useState<string | null>(null);
  const [localFollowUps, setLocalFollowUps] = useState<Record<string, string>>({});
  const [notesDialogOpen, setNotesDialogOpen] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  const handleSetFollowUp = async (property: Property, date: Date | undefined) => {
    if (!date) return;
    
    setSavingFollowUp(property.id);
    try {
      await updatePropertyFollowUp(property.id, date.toISOString());
      setLocalFollowUps(prev => ({ ...prev, [property.id]: date.toISOString() }));
      toast({
        title: "Follow-up Date Set",
        description: `Set follow-up for ${property.accountNumber} on ${format(date, 'MMM d, yyyy')}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save follow-up date",
        variant: "destructive",
      });
    } finally {
      setSavingFollowUp(null);
    }
  };

  const handleSaveNotes = async (property: Property, notes: string) => {
    setSavingNotes(property.id);
    try {
      await updatePropertyNotes(property.id, notes);
      setLocalNotes(prev => ({ ...prev, [property.id]: notes }));
      toast({
        title: "Notes Saved",
        description: `Notes saved for ${property.accountNumber}`,
      });
      setNotesDialogOpen(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive",
      });
    } finally {
      setSavingNotes(null);
    }
  };

  const filteredProperties = statusFilter 
    ? properties.filter(p => p.status === statusFilter)
    : properties;

  const sortedProperties = [...filteredProperties].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal === undefined || bVal === undefined) return 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDirection === 'asc' 
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const totalPages = Math.ceil(sortedProperties.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProperties = sortedProperties.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSort = (field: keyof Property) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const openGoogleMaps = (property: Property) => {
    const address = encodeURIComponent(property.propertyAddress);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
    
    // Trigger follow-up callback if provided
    if (onFollowUp) {
      onFollowUp(property);
    }
    
    toast({
      title: "Navigation Started",
      description: `Opening directions to ${property.propertyAddress}`,
    });
  };

  const formatFollowUp = (date: string | undefined) => {
    if (!date) return null;
    try {
      const parsed = new Date(date);
      return {
        formatted: format(parsed, 'MMM d, yyyy'), // Include year
        relative: formatDistanceToNow(parsed, { addSuffix: true }),
      };
    } catch {
      return null;
    }
  };

  // Parse property address to extract owner name and address
  // Format: "OWNER NAME 123 STREET CITY, STATE ZIP"
  // The middle number (not at start/end) separates owner name from address
  const parsePropertyAddress = (address: string) => {
    if (!address) return { ownerName: '', address: '' };
    
    // Find all numbers in the string with their positions
    const numberMatches = Array.from(address.matchAll(/\b(\d+)\b/g));
    
    if (numberMatches.length === 0) {
      return { ownerName: '', address: address.trim() };
    }
    
    // Find the first number that's NOT at the start and NOT at the end (middle number)
    for (const match of numberMatches) {
      const number = match[0];
      const index = match.index!;
      const beforeMatch = address.substring(0, index).trim();
      const afterMatch = address.substring(index + number.length).trim();
      
      // Skip if number is at the very start
      if (index === 0) continue;
      
      // Skip if it's a zip code (5 digits at the end)
      if (number.length === 5 && /^\d{5}$/.test(number)) {
        const remainingAfter = address.substring(index + number.length).trim();
        if (remainingAfter.length < 5) continue;
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
    
    // Fallback: try to find first number with space before it
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

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-24">Status</th>
              <th 
                className="cursor-pointer hover:bg-secondary"
                onClick={() => handleSort('accountNumber')}
              >
                Account #
              </th>
              <th>Owner</th>
              <th>Property Address</th>
              <th 
                className="cursor-pointer hover:bg-secondary text-right"
                onClick={() => handleSort('totalAmountDue')}
              >
                Amount Due
              </th>
              <th 
                className="cursor-pointer hover:bg-secondary text-right"
                onClick={() => handleSort('marketValue')}
              >
                Market Value
              </th>
              <th 
                className="cursor-pointer hover:bg-secondary"
                onClick={() => handleSort('lastFollowUp')}
              >
                Last Follow Up
              </th>
              <th className="w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProperties.map((property) => {
              const followUpDate = localFollowUps[property.id] || property.lastFollowUp;
              const followUp = formatFollowUp(followUpDate);
              
              return (
                <tr 
                  key={property.id}
                  className={cn(
                    'transition-colors',
                    property.isNew && 'bg-success/5',
                    property.statusChanged && 'bg-warning/5'
                  )}
                >
                  <td>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={property.status} />
                      {property.previousStatus && (
                        <span className="text-[10px] text-muted-foreground">
                          ← {property.previousStatus}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="font-mono text-sm">{property.accountNumber}</td>
                  <td className="max-w-[180px] truncate">
                    {(() => {
                      const parsed = parsePropertyAddress(property.propertyAddress);
                      return parsed.ownerName || property.ownerName || '';
                    })()}
                  </td>
                  <td className="max-w-[250px] truncate text-muted-foreground">
                    {(() => {
                      const parsed = parsePropertyAddress(property.propertyAddress);
                      return parsed.address || property.propertyAddress || '';
                    })()}
                  </td>
                  <td className="text-right font-mono">
                    {formatCurrency(property.totalAmountDue)}
                  </td>
                  <td className="text-right font-mono text-muted-foreground">
                    {property.marketValue ? formatCurrency(property.marketValue) : '—'}
                  </td>
                  <td>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button 
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-secondary transition-colors",
                            savingFollowUp === property.id && "opacity-50 pointer-events-none"
                          )}
                          title="Click to set follow-up date"
                        >
                          {followUp ? (
                            <>
                              <Calendar className="h-3 w-3 text-primary" />
                              <span className="text-sm" title={followUp.relative}>
                                {followUp.formatted}
                              </span>
                            </>
                          ) : (
                            <>
                              <CalendarPlus className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground text-sm">Set date</span>
                            </>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={followUpDate ? new Date(followUpDate) : undefined}
                          onSelect={(date) => handleSetFollowUp(property, date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={() => onViewProperty(property)}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Dialog open={notesDialogOpen === property.id} onOpenChange={(open) => setNotesDialogOpen(open ? property.id : null)}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn(
                              "h-7 w-7",
                              (localNotes[property.id] || property.notes) && "text-primary"
                            )}
                            title="Add notes"
                          >
                            <StickyNote className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Notes for {property.accountNumber}</DialogTitle>
                            <DialogDescription>
                              {property.propertyAddress}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Textarea
                              placeholder="Add your notes here..."
                              defaultValue={localNotes[property.id] || property.notes || ''}
                              className="min-h-[200px]"
                              id={`notes-${property.id}`}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setNotesDialogOpen(null)}
                                disabled={savingNotes === property.id}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => {
                                  const textarea = document.getElementById(`notes-${property.id}`) as HTMLTextAreaElement;
                                  handleSaveNotes(property, textarea.value);
                                }}
                                disabled={savingNotes === property.id}
                              >
                                {savingNotes === property.id ? 'Saving...' : 'Save Notes'}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => openGoogleMaps(property)}
                        title="Navigate with Google Maps"
                      >
                        <Navigation className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        asChild
                        title="View on Bexar County Tax Office"
                      >
                        <a 
                          href="https://bexar.acttax.com/act_webdev/bexar/index.jsp"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-border flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredProperties.length)} of {filteredProperties.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-mono px-3">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
