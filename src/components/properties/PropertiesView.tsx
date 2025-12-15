import { useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { PropertyTable } from './PropertyTable';
import { PropertyDetailsModal } from './PropertyDetailsModal';
import { Property, PropertyStatus } from '@/types/property';

export function PropertiesView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | undefined>();

  // Empty properties array - ready for real data
  const properties: Property[] = [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Property List</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse and filter tax-delinquent properties. Click on a property to view details.
        </p>
      </div>

      {properties.length === 0 ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Properties to Display</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Upload an Excel file to start tracking tax-delinquent properties. Your uploaded data will appear here.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="#upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload File
            </a>
          </div>
        </div>
      ) : (
        <PropertyTable
          properties={properties}
          onViewProperty={setSelectedProperty}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      )}

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}
