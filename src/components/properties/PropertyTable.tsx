import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Navigation, Calendar, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property, PropertyStatus } from '@/types/property';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { updatePropertyFollowUp } from '@/lib/api';

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
                  <td className="max-w-[180px] truncate">{property.ownerName}</td>
                  <td className="max-w-[250px] truncate text-muted-foreground">
                    {property.propertyAddress}
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
