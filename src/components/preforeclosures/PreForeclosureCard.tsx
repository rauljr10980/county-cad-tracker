import { FileText, MapPin, Calendar, Eye } from 'lucide-react';
import { PreForeclosure, PreForeclosureInternalStatus } from '@/types/property';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PreForeclosureCardProps {
  preforeclosure: PreForeclosure;
  onViewDetails: (pf: PreForeclosure) => void;
}

const statusColors: Record<PreForeclosureInternalStatus, string> = {
  'New': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Contact Attempted': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Monitoring': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Dead': 'bg-red-500/20 text-red-400 border-red-500/30',
};

const typeColors: Record<'Mortgage' | 'Tax', string> = {
  'Mortgage': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Tax': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

export function PreForeclosureCard({ preforeclosure: pf, onViewDetails }: PreForeclosureCardProps) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const isFollowUpDue = pf.next_follow_up_date && new Date(pf.next_follow_up_date) <= new Date();

  return (
    <div
      className={cn(
        'border border-border rounded-lg p-4 bg-card transition-all hover:border-primary/30 cursor-pointer',
        pf.inactive && 'opacity-50',
        isFollowUpDue && 'border-yellow-500/30 bg-yellow-500/5'
      )}
      onClick={() => onViewDetails(pf)}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className={typeColors[pf.type]}>
              {pf.type}
            </Badge>
            <Badge variant="outline" className={statusColors[pf.internal_status]}>
              {pf.internal_status}
            </Badge>
            {pf.visited && (
              <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                Visited
              </Badge>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {pf.document_number}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(pf);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>

      {/* Address */}
      <div className="flex items-start gap-2 mb-3">
        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{pf.address}</p>
          <p className="text-xs text-muted-foreground">
            {pf.city}, {pf.zip}
          </p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">Filing Month</p>
          <p className="font-medium">{pf.filing_month}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Last Action</p>
          <p className="font-medium">{formatDate(pf.last_action_date) || '-'}</p>
        </div>
        {pf.next_follow_up_date && (
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <p className="text-muted-foreground">Next Follow-Up:</p>
              <p className={cn(
                "font-medium",
                isFollowUpDue && "text-yellow-400"
              )}>
                {formatDate(pf.next_follow_up_date)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Notes Indicator */}
      {pf.notes && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>Has notes</span>
          </div>
        </div>
      )}

      {/* Follow-up Alert */}
      {isFollowUpDue && (
        <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-400">
          Follow-up due
        </div>
      )}
    </div>
  );
}
