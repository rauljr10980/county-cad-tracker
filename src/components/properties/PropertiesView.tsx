import { useState } from 'react';
import { FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';
import { PropertyTable } from './PropertyTable';
import { PropertyDetailsModal } from './PropertyDetailsModal';
import { Property, PropertyStatus } from '@/types/property';
import { useProperties } from '@/hooks/useFiles';

export function PropertiesView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | undefined>();
  const [page, setPage] = useState(1);

  // Fetch properties from API with safe error handling
  const { data, isLoading, error } = useProperties(page, 100);
  
  // Safely extract properties with fallbacks
  let properties: Property[] = [];
  let total = 0;
  
  try {
    if (data) {
      // Handle both array and object response formats
      if (Array.isArray(data)) {
        properties = data;
        total = data.length;
      } else if (data.properties && Array.isArray(data.properties)) {
        properties = data.properties;
        total = data.total || data.properties.length;
      }
    }
  } catch (e) {
    console.error('[PropertiesView] Error parsing data:', e);
  }
  
  console.log('[PropertiesView] Data:', { properties: properties.length, total, isLoading, error });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Property List</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse and filter tax-delinquent properties. Click on a property to view details.
          {total > 0 && ` Showing ${properties.length} of ${total.toLocaleString()} properties.`}
        </p>
      </div>

      {isLoading ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <Loader2 className="h-16 w-16 text-muted-foreground mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold mb-2">Loading Properties...</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Fetching property data from the server.
          </p>
        </div>
      ) : error ? (
        <div className="bg-destructive/10 rounded-lg p-12 text-center border border-destructive/30">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2 text-destructive">Error Loading Properties</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-4">
            {error instanceof Error ? error.message : 'Failed to load properties'}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Properties to Display</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Upload an Excel file from the Upload tab to start tracking tax-delinquent properties. Your uploaded data will appear here.
          </p>
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
