import { useState } from 'react';
import { FileSpreadsheet, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter } from 'lucide-react';
import { PropertyTable } from './PropertyTable';
import { PropertyDetailsModal } from './PropertyDetailsModal';
import { Property, PropertyStatus } from '@/types/property';
import { useProperties } from '@/hooks/useFiles';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 100;

export function PropertiesView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | undefined>();
  const [page, setPage] = useState(1);

  // Fetch properties from API with status filter
  const { data, isLoading, error } = useProperties(page, ITEMS_PER_PAGE, statusFilter);
  
  // Safely extract properties with fallbacks
  let properties: Property[] = [];
  let total = 0;
  let totalUnfiltered = 0;
  let totalPages = 1;
  let statusCounts = { J: 0, A: 0, P: 0, other: 0 };
  
  try {
    if (data) {
      // Handle both array and object response formats
      if (Array.isArray(data)) {
        properties = data;
        total = data.length;
        totalUnfiltered = data.length;
        totalPages = 1;
      } else if (data.properties && Array.isArray(data.properties)) {
        properties = data.properties;
        total = data.total || data.properties.length;
        totalUnfiltered = data.totalUnfiltered || total;
        totalPages = data.totalPages || Math.ceil(total / ITEMS_PER_PAGE);
        if (data.statusCounts) {
          statusCounts = data.statusCounts;
        }
      }
    }
  } catch (e) {
    console.error('[PropertiesView] Error parsing data:', e);
  }
  
  const startItem = total > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
  const endItem = Math.min(page * ITEMS_PER_PAGE, total);
  
  // Handle status filter change - reset to page 1
  const handleStatusFilter = (status: PropertyStatus | undefined) => {
    setStatusFilter(status);
    setPage(1);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Property List</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Browse and filter tax-delinquent properties. Click on a property to view details.
              {totalUnfiltered > 0 && ` ${totalUnfiltered.toLocaleString()} total properties.`}
            </p>
          </div>
        </div>
        
        {/* Status Filter Buttons */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter by status:</span>
          </div>
          
          <Button
            variant={statusFilter === undefined ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilter(undefined)}
            className="min-w-[80px]"
          >
            All
            {totalUnfiltered > 0 && (
              <span className="ml-1 text-xs opacity-70">({totalUnfiltered.toLocaleString()})</span>
            )}
          </Button>
          
          <Button
            variant={statusFilter === 'P' ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilter('P')}
            className={cn(
              "min-w-[100px]",
              statusFilter !== 'P' && "border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
            )}
          >
            Pending
            {statusCounts.P > 0 && (
              <span className="ml-1 text-xs opacity-70">({statusCounts.P.toLocaleString()})</span>
            )}
          </Button>
          
          <Button
            variant={statusFilter === 'A' ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilter('A')}
            className={cn(
              "min-w-[100px]",
              statusFilter !== 'A' && "border-green-500/50 text-green-500 hover:bg-green-500/10"
            )}
          >
            Active
            {statusCounts.A > 0 && (
              <span className="ml-1 text-xs opacity-70">({statusCounts.A.toLocaleString()})</span>
            )}
          </Button>
          
          <Button
            variant={statusFilter === 'J' ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilter('J')}
            className={cn(
              "min-w-[100px]",
              statusFilter !== 'J' && "border-red-500/50 text-red-500 hover:bg-red-500/10"
            )}
          >
            Judgment
            {statusCounts.J > 0 && (
              <span className="ml-1 text-xs opacity-70">({statusCounts.J.toLocaleString()})</span>
            )}
          </Button>
          
          {statusFilter && (
            <span className="text-sm text-muted-foreground ml-2">
              Showing {total.toLocaleString()} {statusFilter === 'J' ? 'Judgment' : statusFilter === 'A' ? 'Active' : 'Pending'} properties
            </span>
          )}
        </div>
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
        <>
          <PropertyTable
            properties={properties}
            onViewProperty={setSelectedProperty}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{startItem.toLocaleString()}</span> to{' '}
                <span className="font-medium text-foreground">{endItem.toLocaleString()}</span> of{' '}
                <span className="font-medium text-foreground">{total.toLocaleString()}</span> properties
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page === 1 || isLoading}
                  title="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="ml-1">Previous</span>
                </Button>
                
                <div className="flex items-center gap-2 px-3">
                  <span className="text-sm">Page</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={page}
                    onChange={(e) => {
                      const newPage = parseInt(e.target.value) || 1;
                      setPage(Math.max(1, Math.min(totalPages, newPage)));
                    }}
                    className="w-16 px-2 py-1 text-center text-sm border border-border rounded bg-background"
                  />
                  <span className="text-sm text-muted-foreground">of {totalPages.toLocaleString()}</span>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || isLoading}
                >
                  <span className="mr-1">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages || isLoading}
                  title="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}
