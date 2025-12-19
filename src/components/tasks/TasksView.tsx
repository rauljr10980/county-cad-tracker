import { useState } from 'react';
import { Calendar, CheckSquare, Loader2, AlertCircle, Eye } from 'lucide-react';
import { Property } from '@/types/property';
import { useQuery } from '@tanstack/react-query';
import { getTasks } from '@/lib/api';
import { format, isToday, isTomorrow, isPast, isFuture, parseISO, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { cn } from '@/lib/utils';

interface TaskGroup {
  date: string;
  label: string;
  properties: Property[];
}

export function TasksView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const { data, isLoading, error } = useQuery<Property[]>({
    queryKey: ['tasks'],
    queryFn: getTasks,
    refetchOnMount: true,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Parse property address to extract owner name and address
  const parsePropertyAddress = (address: string) => {
    if (!address) return { ownerName: '', address: '' };
    
    const numberMatches = Array.from(address.matchAll(/\b(\d+)\b/g));
    
    if (numberMatches.length === 0) {
      return { ownerName: '', address: address.trim() };
    }
    
    for (const match of numberMatches) {
      const number = match[0];
      const index = match.index!;
      const beforeMatch = address.substring(0, index).trim();
      const afterMatch = address.substring(index + number.length).trim();
      
      if (index === 0) continue;
      
      if (number.length === 5 && /^\d{5}$/.test(number)) {
        const remainingAfter = address.substring(index + number.length).trim();
        if (remainingAfter.length < 5) continue;
      }
      
      if (beforeMatch.length > 0 && afterMatch.length > 0) {
        if (address[index - 1] === ' ') {
          const ownerName = beforeMatch.trim();
          const addressPart = address.substring(index).trim();
          return { ownerName, address: addressPart };
        }
      }
    }
    
    const firstNumberWithSpace = address.match(/\s+(\d+)\s+/);
    if (firstNumberWithSpace) {
      const matchIndex = address.indexOf(firstNumberWithSpace[0]);
      const ownerName = address.substring(0, matchIndex).trim();
      const addressPart = address.substring(matchIndex + 1).trim();
      return { ownerName, address: addressPart };
    }
    
    return { ownerName: '', address: address.trim() };
  };

  // Group tasks by date
  const groupTasksByDate = (properties: Property[]): TaskGroup[] => {
    const groups: Record<string, Property[]> = {};
    
    properties.forEach(property => {
      if (!property.lastFollowUp) return;
      
      const date = startOfDay(parseISO(property.lastFollowUp));
      const dateKey = format(date, 'yyyy-MM-dd');
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(property);
    });
    
    // Convert to array and sort by date
    return Object.entries(groups)
      .map(([dateKey, props]) => {
        const date = parseISO(dateKey);
        let label = format(date, 'MMM d, yyyy');
        
        if (isToday(date)) {
          label = 'Today';
        } else if (isTomorrow(date)) {
          label = 'Tomorrow';
        } else if (isPast(date)) {
          label = `Overdue - ${format(date, 'MMM d, yyyy')}`;
        }
        
        return {
          date: dateKey,
          label,
          properties: props.sort((a, b) => {
            const aDate = a.lastFollowUp ? parseISO(a.lastFollowUp) : new Date(0);
            const bDate = b.lastFollowUp ? parseISO(b.lastFollowUp) : new Date(0);
            return aDate.getTime() - bDate.getTime();
          }),
        };
      })
      .sort((a, b) => {
        const aDate = parseISO(a.date);
        const bDate = parseISO(b.date);
        // Overdue first, then by date
        if (isPast(aDate) && isFuture(bDate)) return -1;
        if (isFuture(aDate) && isPast(bDate)) return 1;
        return aDate.getTime() - bDate.getTime();
      });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive">Failed to load tasks</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <CheckSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Follow-up Tasks</h3>
          <p className="text-muted-foreground">
            Set follow-up dates on properties to see them here.
          </p>
        </div>
      </div>
    );
  }

  const taskGroups = groupTasksByDate(data);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Follow-up Tasks</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Properties with scheduled follow-up dates. Click on a property to view details.
        </p>
      </div>

      <div className="space-y-6">
        {taskGroups.map((group) => {
          const date = parseISO(group.date);
          const isOverdue = isPast(date) && !isToday(date);
          
          return (
            <div key={group.date} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className={cn(
                "px-4 py-3 border-b border-border flex items-center gap-2",
                isOverdue && "bg-destructive/10 border-destructive/30"
              )}>
                <Calendar className={cn(
                  "h-4 w-4",
                  isOverdue ? "text-destructive" : "text-primary"
                )} />
                <h3 className={cn(
                  "font-semibold",
                  isOverdue && "text-destructive"
                )}>
                  {group.label}
                </h3>
                <span className="text-sm text-muted-foreground">
                  ({group.properties.length} {group.properties.length === 1 ? 'property' : 'properties'})
                </span>
              </div>
              
              <div className="divide-y divide-border">
                {group.properties.map((property) => {
                  const { ownerName, address } = parsePropertyAddress(property.propertyAddress);
                  const followUpDate = property.lastFollowUp ? parseISO(property.lastFollowUp) : null;
                  
                  return (
                    <div
                      key={property.id}
                      className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedProperty(property)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <StatusBadge status={property.status} />
                            <span className="font-mono text-sm text-muted-foreground">
                              {property.accountNumber}
                            </span>
                          </div>
                          <p className="font-medium mb-1">
                            {ownerName || property.ownerName}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {address || property.propertyAddress}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-semibold text-judgment mb-1">
                            {formatCurrency(property.totalAmountDue)}
                          </p>
                          {followUpDate && (
                            <p className="text-xs text-muted-foreground">
                              {format(followUpDate, 'h:mm a')}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProperty(property);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}

