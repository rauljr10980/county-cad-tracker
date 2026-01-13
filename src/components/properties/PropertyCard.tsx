import { ExternalLink, Eye, Navigation, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property } from '@/types/property';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

interface PropertyCardProps {
  property: Property;
  onViewProperty: (property: Property) => void;
  onOpenMap: (property: Property) => void;
  onSetFollowUp?: (property: Property, date: Date | undefined) => void;
  savingFollowUp?: boolean;
  localFollowUp?: string;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
}

export function PropertyCard({
  property,
  onViewProperty,
  onOpenMap,
  onSetFollowUp,
  savingFollowUp,
  localFollowUp,
  isSelected,
  onSelect
}: PropertyCardProps) {
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

  const formatFollowUp = (date: string | undefined) => {
    if (!date) return null;
    try {
      const parsed = new Date(date);
      return {
        formatted: format(parsed, 'MMM d, yyyy'),
        relative: formatDistanceToNow(parsed, { addSuffix: true }),
      };
    } catch {
      return null;
    }
  };

  const followUpDate = localFollowUp || property.lastFollowUp;
  const followUp = formatFollowUp(followUpDate);

  return (
    <div
      className={cn(
        'border border-border rounded-lg p-4 bg-card transition-all',
        property.isNew && 'bg-success/5 border-success/20',
        property.statusChanged && 'bg-warning/5 border-warning/20',
        isSelected && 'bg-primary/10 border-primary/30'
      )}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {onSelect && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelect}
              className="mt-1 flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={property.status} />
              {property.previousStatus && (
                <span className="text-xs text-muted-foreground">
                  was {property.previousStatus}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm truncate">{property.ownerName}</h3>
            <p className="text-xs text-muted-foreground truncate">{property.accountNumber}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-8 w-8"
          onClick={() => onViewProperty(property)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>

      {/* Address */}
      <div className="flex items-start gap-2 mb-3 text-xs">
        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-muted-foreground line-clamp-2">{property.propertyAddress}</p>
      </div>

      {/* Financial Info */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">Amount Due</p>
          <p className="font-semibold">{formatCurrency(property.totalAmountDue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Market Value</p>
          <p className="font-semibold">
            {property.marketValue ? formatCurrency(property.marketValue) : '—'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Ratio</p>
          <p className="font-semibold">{calculatePercentage(property.totalAmountDue, property.marketValue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Last Follow Up</p>
          <p className="font-semibold">
            {followUp ? (
              <span title={followUp.formatted}>{followUp.relative}</span>
            ) : (
              '—'
            )}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {property.link && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => window.open(property.link, '_blank')}
          >
            <ExternalLink className="h-3 w-3 mr-1.5" />
            CAD
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onOpenMap(property)}
        >
          <Navigation className="h-3 w-3 mr-1.5" />
          Maps
        </Button>
        {onSetFollowUp && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0 text-xs"
                disabled={savingFollowUp}
              >
                <Calendar className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                mode="single"
                selected={followUpDate ? new Date(followUpDate) : undefined}
                onSelect={(date) => onSetFollowUp(property, date)}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
