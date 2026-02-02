import { FileText, MapPin, Calendar, Eye, Navigation, ExternalLink } from 'lucide-react';
import { PreForeclosure } from '@/types/property';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PreForeclosureCardProps {
  preforeclosure: PreForeclosure;
  onViewDetails: (pf: PreForeclosure) => void;
}

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
  const isNew = pf.internal_status === 'New';

  return (
    <div
      className={cn(
        'border border-border rounded-lg p-4 bg-card transition-all hover:border-primary/30 hover:shadow-md cursor-pointer',
        pf.inactive && 'opacity-50',
        isFollowUpDue && 'border-yellow-500/30 bg-yellow-500/5',
        isNew && 'bg-blue-500/5 border-blue-500/20'
      )}
      onClick={() => onViewDetails(pf)}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={typeColors[pf.type]}>
              {pf.type}
            </Badge>
            {pf.visited && (
              <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                ✓ Visited
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="flex items-start gap-2 mb-3 text-xs">
        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{pf.address}</p>
          <p className="text-muted-foreground">
            {pf.city}, {pf.zip}
          </p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">Rental or Primary Home</p>
          <p className="font-semibold">Click to set</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Next Follow-Up</p>
          <p className="font-semibold">Click to set</p>
        </div>
      </div>

      {/* Follow-up Alert */}
      {isFollowUpDue && (
        <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-400 font-medium">
          ⚠️ Follow-up due
        </div>
      )}

      {/* Notes Preview */}
      {pf.notes && (
        <div className="mb-3 p-2 bg-muted/30 rounded text-xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FileText className="h-3 w-3" />
            <span className="font-medium">Notes</span>
          </div>
          <p className="text-foreground line-clamp-2">{pf.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            const address = `${pf.address}, ${pf.city}, TX ${pf.zip}`;
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
          }}
        >
          <Navigation className="h-3 w-3 mr-1.5" />
          Maps
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(pf);
          }}
        >
          <Eye className="h-3 w-3 mr-1.5" />
          Details
        </Button>
      </div>
    </div>
  );
}
