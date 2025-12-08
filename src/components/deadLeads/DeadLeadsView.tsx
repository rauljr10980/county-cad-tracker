import { useState } from 'react';
import { PropertyTable } from '../properties/PropertyTable';
import { PropertyDetailsModal } from '../properties/PropertyDetailsModal';
import { mockProperties } from '@/data/mockData';
import { Property } from '@/types/property';
import { XCircle, TrendingDown, MapPin, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function DeadLeadsView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table');

  // Filter only dead lead properties (status = 'D')
  const deadLeadProperties = mockProperties.filter(p => p.status === 'D');

  // Group by resolution reason
  const byReason = deadLeadProperties.reduce((acc, prop) => {
    const reason = prop.resolutionReason || 'Unknown';
    if (!acc[reason]) acc[reason] = [];
    acc[reason].push(prop);
    return acc;
  }, {} as Record<string, Property[]>);

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Dead Leads</h2>
              <p className="text-sm text-muted-foreground">
                Properties that resolved delinquency without foreclosure
              </p>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 text-sm rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-2 text-sm rounded-md transition-colors ${
                viewMode === 'map'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <MapPin className="h-4 w-4 inline mr-1" />
              Map View
            </button>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="p-4 mb-6 bg-muted/30">
        <div className="flex items-start gap-3">
          <TrendingDown className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-sm mb-1">About Dead Leads</h3>
            <p className="text-sm text-muted-foreground">
              Properties that were present in a previous month's upload but are now missing from the current
              upload, and are not in the Foreclosed tab. These typically resolved through payment or sale.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Dead Leads</p>
          <p className="text-2xl font-bold">{deadLeadProperties.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Paid in Full</p>
          <p className="text-2xl font-bold">
            {byReason['Paid in full']?.length || 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Sold to New Owner</p>
          <p className="text-2xl font-bold">
            {byReason['Sold to new owner']?.length || 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Other Resolutions</p>
          <p className="text-2xl font-bold">
            {Object.keys(byReason).filter(k => k !== 'Paid in full' && k !== 'Sold to new owner')
              .reduce((sum, k) => sum + byReason[k].length, 0)}
          </p>
        </Card>
      </div>

      {/* Resolution Breakdown */}
      <Card className="p-4 mb-6">
        <h3 className="font-medium text-sm mb-3">Resolution Breakdown</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(byReason).map(([reason, props]) => (
            <Badge key={reason} variant="secondary" className="text-sm">
              {reason}: {props.length}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Content - Table or Map */}
      {viewMode === 'table' ? (
        <PropertyTable
          properties={deadLeadProperties}
          onViewProperty={setSelectedProperty}
          statusFilter="D"
        />
      ) : (
        <Card className="p-8">
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Map View Coming Soon</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Interactive map visualization will display dead leads geographically, allowing you to
              identify trends and clusters by location.
            </p>
          </div>
        </Card>
      )}

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}
