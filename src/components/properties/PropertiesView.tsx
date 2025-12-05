import { useState } from 'react';
import { PropertyTable } from './PropertyTable';
import { PropertyDetailsModal } from './PropertyDetailsModal';
import { mockProperties } from '@/data/mockData';
import { Property, PropertyStatus } from '@/types/property';

export function PropertiesView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | undefined>();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Property List</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse and filter tax-delinquent properties. Click on a property to view details.
        </p>
      </div>

      <PropertyTable
        properties={mockProperties}
        onViewProperty={setSelectedProperty}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}
