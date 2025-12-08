import { useState } from 'react';
import { PropertyTable } from '../properties/PropertyTable';
import { PropertyDetailsModal } from '../properties/PropertyDetailsModal';
import { mockProperties } from '@/data/mockData';
import { Property } from '@/types/property';
import { Gavel, ExternalLink, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function ForeclosedView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Filter only foreclosed properties (status = 'F')
  const foreclosedProperties = mockProperties.filter(p => p.status === 'F');

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <Gavel className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Foreclosed Properties</h2>
            <p className="text-sm text-muted-foreground">
              Properties confirmed via Bexar County Foreclosure Map
            </p>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="p-4 mb-6 bg-destructive/5 border-destructive/20">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-sm mb-1">About Foreclosed Properties</h3>
            <p className="text-sm text-muted-foreground">
              These properties have been confirmed for foreclosure sale via the monthly Foreclosure Map.
              Properties are matched by address or document number. This is a terminal state - no further
              CAD data fetching is needed. Click the external link icon to view details on Bexar County records.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Foreclosed</p>
          <p className="text-2xl font-bold">{foreclosedProperties.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Amount Due</p>
          <p className="text-2xl font-bold">
            ${foreclosedProperties.reduce((sum, p) => sum + p.totalAmountDue, 0).toLocaleString()}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Avg Market Value</p>
          <p className="text-2xl font-bold">
            ${Math.round(foreclosedProperties.reduce((sum, p) => sum + (p.marketValue || 0), 0) / (foreclosedProperties.length || 1)).toLocaleString()}
          </p>
        </Card>
      </div>

      {/* Property Table */}
      <PropertyTable
        properties={foreclosedProperties}
        onViewProperty={setSelectedProperty}
        statusFilter="F"
      />

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}
