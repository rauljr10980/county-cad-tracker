import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Navigation, Calendar, CalendarPlus, ArrowUp, ArrowDown, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property, PropertyStatus } from '@/types/property';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { updatePropertyFollowUp } from '@/lib/api';
import { PropertyCard } from './PropertyCard';

interface PropertyTableProps {
  properties: Property[];
  onViewProperty: (property: Property) => void;
  onFollowUp?: (property: Property) => void;
  statusFilter?: PropertyStatus;
  onStatusFilterChange?: (status: PropertyStatus | undefined) => void;
  sortField?: keyof Property | 'ratio';
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: keyof Property | 'ratio') => void;
  selectedPropertyIds?: Set<string>;
  onPropertySelect?: (propertyId: string, selected: boolean) => void;
  allFilteredPropertyIds?: string[];
  propertiesInRoutes?: Set<string>;
  onDeleteProperty?: (propertyId: string) => void;
}


export function PropertyTable({ 
  properties, 
  onViewProperty,
  onFollowUp,
  statusFilter,
  onStatusFilterChange,
  sortField: externalSortField = 'totalAmountDue',
  sortDirection: externalSortDirection = 'asc',
  onSort,
  selectedPropertyIds = new Set(),
  onPropertySelect,
  allFilteredPropertyIds,
  propertiesInRoutes = new Set(),
  onDeleteProperty
}: PropertyTableProps) {
  // Use external sort state if provided, otherwise use internal state (fallback)
  const [internalSortField, setInternalSortField] = useState<keyof Property | 'ratio'>('totalAmountDue');
  const [internalSortDirection, setInternalSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const sortField = onSort ? externalSortField : internalSortField;
  const sortDirection = onSort ? externalSortDirection : internalSortDirection;
  
  const [savingFollowUp, setSavingFollowUp] = useState<string | null>(null);
  const [localFollowUps, setLocalFollowUps] = useState<Record<string, string>>({});

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


  // Properties are already filtered, sorted, and paginated by PropertiesView
  // No need to filter again here - PropertiesView handles all filtering including status normalization
  // (Database uses PENDING/ACTIVE/JUDGMENT, but filters use P/A/J, so PropertiesView normalizes them)
  const displayProperties = properties;
  
  const handleSort = (field: keyof Property | 'ratio') => {
    if (onSort) {
      // Use external sort handler (from PropertiesView)
      onSort(field);
    } else {
      // Use internal sort handler (fallback)
      if (internalSortField === field) {
        setInternalSortDirection(internalSortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setInternalSortField(field);
        setInternalSortDirection('asc');
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const calculatePercentage = (amountDue: number, marketValue: number | undefined): string => {
    if (!marketValue || marketValue === 0) {
      return '—';
    }
    const percentage = (amountDue / marketValue) * 100;
    return `${percentage.toFixed(1)}%`;
  };


  const openGoogleMaps = (property: Property) => {
    const address = encodeURIComponent(property.propertyAddress);
    // Open Google Maps with property location view (shows Street View, details, etc.)
    window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank');
    
    // Trigger follow-up callback if provided
    if (onFollowUp) {
      onFollowUp(property);
    }
    
    toast({
      title: "Opening Google Maps",
      description: `Viewing ${property.propertyAddress} on Google Maps`,
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
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {onPropertySelect && (
          <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
            <Checkbox
              checked={selectedPropertyIds.size > 0 && selectedPropertyIds.size === (allFilteredPropertyIds?.length || displayProperties.length)}
              onCheckedChange={(checked) => {
                const idsToToggle = allFilteredPropertyIds || displayProperties.map(p => p.id);
                idsToToggle.forEach(id => {
                  onPropertySelect(id, checked as boolean);
                });
              }}
            />
            <span className="text-sm text-muted-foreground">
              Select All ({allFilteredPropertyIds?.length || displayProperties.length})
            </span>
            {selectedPropertyIds.size > 0 && (
              <span className="text-sm font-medium text-primary ml-auto">
                {selectedPropertyIds.size} selected
              </span>
            )}
          </div>
        )}
        {displayProperties.map((property) => {
          const followUpDate = localFollowUps[property.id] || property.lastFollowUp;

          return (
            <PropertyCard
              key={property.id}
              property={property}
              onViewProperty={onViewProperty}
              onOpenMap={openGoogleMaps}
              onSetFollowUp={handleSetFollowUp}
              savingFollowUp={savingFollowUp === property.id}
              localFollowUp={followUpDate}
              isSelected={selectedPropertyIds.has(property.id)}
              onSelect={onPropertySelect ? (checked) => onPropertySelect(property.id, checked) : undefined}
              isInRoute={propertiesInRoutes.has(property.id)}
              onDelete={onDeleteProperty ? () => onDeleteProperty(property.id) : undefined}
            />
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
          <thead>
            <tr>
              <th className="w-12">
                {onPropertySelect && (
                  <Checkbox
                    checked={selectedPropertyIds.size > 0 && selectedPropertyIds.size === (allFilteredPropertyIds?.length || displayProperties.length)}
                    onCheckedChange={(checked) => {
                      const idsToToggle = allFilteredPropertyIds || displayProperties.map(p => p.id);
                      idsToToggle.forEach(id => {
                        onPropertySelect(id, checked as boolean);
                      });
                    }}
                    title="Select all"
                  />
                )}
              </th>
              <th className="w-12" title="Geocoded">
                <MapPin className="h-4 w-4 mx-auto text-muted-foreground" />
              </th>
              <th className="w-24">Status</th>
              <th>Owner</th>
              <th>Property Address</th>
              <th 
                className="cursor-pointer hover:bg-secondary text-right"
                onClick={() => handleSort('totalAmountDue')}
              >
                <div className="flex items-center justify-end gap-1">
                  Amount Due
                  {sortField === 'totalAmountDue' && (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  )}
                </div>
              </th>
              <th 
                className="cursor-pointer hover:bg-secondary text-right"
                onClick={() => handleSort('marketValue')}
              >
                <div className="flex items-center justify-end gap-1">
                  Market Value
                  {sortField === 'marketValue' && (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  )}
                </div>
              </th>
              <th 
                className="cursor-pointer hover:bg-secondary text-right"
                onClick={() => handleSort('ratio')}
              >
                <div className="flex items-center justify-end gap-1">
                  Ratio
                  {sortField === 'ratio' && (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  )}
                </div>
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
            {displayProperties.map((property) => {
              const followUpDate = localFollowUps[property.id] || property.lastFollowUp;
              const followUp = formatFollowUp(followUpDate);
              
              return (
                <tr 
                  key={property.id}
                  className={cn(
                    'transition-colors',
                    property.isNew && 'bg-success/5',
                    property.statusChanged && 'bg-warning/5',
                    selectedPropertyIds.has(property.id) && 'bg-primary/10'
                  )}
                >
                  <td>
                    {onPropertySelect && (
                      <Checkbox
                        checked={selectedPropertyIds.has(property.id)}
                        onCheckedChange={(checked) => {
                          onPropertySelect(property.id, checked as boolean);
                        }}
                        title="Select property"
                      />
                    )}
                  </td>
                  <td className="text-center">
                    {property.latitude && property.longitude ? (
                      <MapPin className="h-4 w-4 mx-auto text-green-500" title={`Geocoded: ${property.latitude.toFixed(4)}, ${property.longitude.toFixed(4)}`} />
                    ) : (
                      <div className="h-4 w-4 mx-auto" title="Not geocoded" />
                    )}
                  </td>
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
                  <td className="max-w-[180px]">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">
                        {(() => {
                          const parsed = parsePropertyAddress(property.propertyAddress);
                          return parsed.ownerName || property.ownerName || '';
                        })()}
                      </span>
                      {property.isPrimaryProperty === false && (
                        <span className="flex-shrink-0 text-[10px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-500 font-medium">
                          2nd
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="max-w-[250px] truncate text-muted-foreground">
                    {property.ownerName || ''}
                  </td>
                  <td className="text-right font-mono">
                    {formatCurrency(property.totalAmountDue)}
                  </td>
                  <td className="text-right font-mono text-muted-foreground">
                    {property.marketValue ? formatCurrency(property.marketValue) : '—'}
                  </td>
                  <td className="text-right font-mono text-muted-foreground">
                    {calculatePercentage(property.totalAmountDue, property.marketValue)}
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
                        title={property.link ? "View Property Details" : "View on Bexar County Tax Office"}
                      >
                        <a
                          href={property.link || "https://bexar.acttax.com/act_webdev/bexar/index.jsp"}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      {onDeleteProperty && propertiesInRoutes.has(property.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => onDeleteProperty(property.id)}
                          title="Remove from route"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
