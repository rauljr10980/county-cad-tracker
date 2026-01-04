import { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Search, X, ChevronDown } from 'lucide-react';
import { PropertyTable } from './PropertyTable';
import { PropertyDetailsModal } from './PropertyDetailsModal';
import { AdvancedFiltersPanel, AdvancedFilters } from './AdvancedFilters';
import { Property, PropertyStatus } from '@/types/property';
import { useProperties } from '@/hooks/useFiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FileDropZone } from '@/components/upload/FileDropZone';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ITEMS_PER_PAGE = 100;

export function PropertiesView() {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    statuses: [],
    amountDueMin: undefined,
    amountDueMax: undefined,
    marketValueMin: undefined,
    marketValueMax: undefined,
    taxYear: undefined,
    hasNotes: 'any',
    hasLink: 'any',
    followUpDateFrom: undefined,
    followUpDateTo: undefined,
    lastPaymentDateFrom: undefined,
    lastPaymentDateTo: undefined,
  });
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  
  // Convert advancedFilters.statuses to legacy format for API
  const selectedStatuses = advancedFilters.statuses;
  
  // Update debounced search after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1); // Reset to page 1 when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Convert selectedStatuses array to single status for API
  // If multiple statuses selected, fetch all (no filter) and filter on frontend
  // If single status, use API filtering for efficiency
  const apiStatusFilter = selectedStatuses.length === 1 ? selectedStatuses[0] : undefined;
  
  // When multiple statuses are selected, we need to fetch more items to properly filter
  // Increase limit when multiple statuses selected to get better results
  const fetchLimit = selectedStatuses.length > 1 ? ITEMS_PER_PAGE * 10 : ITEMS_PER_PAGE;
  
  // Fetch properties from API with status filter and search
  const { data, isLoading, error } = useProperties({
    status: apiStatusFilter,
    search: debouncedSearchQuery,
    page: selectedStatuses.length > 1 ? 1 : page, // Always page 1 when multiple statuses (we'll paginate filtered results)
    limit: fetchLimit,
  });
  
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
      } else if ('properties' in data && Array.isArray(data.properties)) {
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
  
  // Apply frontend filtering if multiple statuses are selected
  if (selectedStatuses.length > 1) {
    // Calculate total from status counts for selected statuses
    const selectedTotal = selectedStatuses.reduce((sum, status) => {
      return sum + (statusCounts[status] || 0);
    }, 0);
    
    // Filter properties to only show selected statuses
    const allFilteredProperties = properties.filter(p => selectedStatuses.includes(p.status));
    
    // Use the calculated total from status counts
    total = selectedTotal;
    totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    
    // Apply pagination to filtered results
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    properties = allFilteredProperties.slice(startIndex, endIndex);
  } else if (selectedStatuses.length === 1) {
    // Single status selected - use the count from statusCounts
    total = statusCounts[selectedStatuses[0]] || 0;
    totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  } else if (selectedStatuses.length === 0) {
    // All selected - no filtering needed, use totalUnfiltered
    total = totalUnfiltered;
    totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  }
  
  const startItem = total > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
  const endItem = Math.min(page * ITEMS_PER_PAGE, total);
  
  // Handle advanced filters change
  const handleFiltersChange = (filters: AdvancedFilters) => {
    setAdvancedFilters(filters);
    setPage(1);
  };
  
  // Clear all filters
  const clearAllFilters = () => {
    setAdvancedFilters({
      statuses: [],
      amountDueMin: undefined,
      amountDueMax: undefined,
      marketValueMin: undefined,
      marketValueMax: undefined,
      taxYear: undefined,
      hasNotes: 'any',
      hasLink: 'any',
      followUpDateFrom: undefined,
      followUpDateTo: undefined,
      lastPaymentDateFrom: undefined,
      lastPaymentDateTo: undefined,
    });
    setPage(1);
  };
  
  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setPage(1);
  };

  // Handle upload completion - reset to page 1
  const handleUploadComplete = () => {
    setPage(1);
    clearAllFilters();
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Property List</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Browse and filter tax-delinquent properties. Click on a property to view details.
              {totalUnfiltered > 0 && ` ${totalUnfiltered.toLocaleString()} total properties.`}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by account number, owner name, address, notes, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {debouncedSearchQuery && (
            <p className="text-sm text-muted-foreground mt-2">
              Searching for "{debouncedSearchQuery}"... {total > 0 && `Found ${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
        
        {/* Advanced Filters */}
        <div className="mt-4 p-3 border border-border rounded-lg bg-card/50">
          <div className="flex items-center gap-2 flex-wrap">
            <AdvancedFiltersPanel
              filters={advancedFilters}
              onFiltersChange={handleFiltersChange}
              onClear={clearAllFilters}
              statusCounts={statusCounts}
              totalUnfiltered={totalUnfiltered}
              activeFilterCount={useMemo(() => {
                let count = 0;
                if (advancedFilters.statuses.length > 0) count += advancedFilters.statuses.length;
                if (advancedFilters.amountDueMin !== undefined) count++;
                if (advancedFilters.amountDueMax !== undefined) count++;
                if (advancedFilters.marketValueMin !== undefined) count++;
                if (advancedFilters.marketValueMax !== undefined) count++;
                if (advancedFilters.taxYear) count++;
                if (advancedFilters.hasNotes !== 'any') count++;
                if (advancedFilters.hasLink !== 'any') count++;
                if (advancedFilters.followUpDateFrom) count++;
                if (advancedFilters.followUpDateTo) count++;
                if (advancedFilters.lastPaymentDateFrom) count++;
                if (advancedFilters.lastPaymentDateTo) count++;
                return count;
              }, [advancedFilters])}
            />
            
            {useMemo(() => {
                let count = 0;
                if (advancedFilters.statuses.length > 0) count += advancedFilters.statuses.length;
                if (advancedFilters.amountDueMin !== undefined) count++;
                if (advancedFilters.amountDueMax !== undefined) count++;
                if (advancedFilters.marketValueMin !== undefined) count++;
                if (advancedFilters.marketValueMax !== undefined) count++;
                if (advancedFilters.taxYear) count++;
                if (advancedFilters.hasNotes !== 'any') count++;
                if (advancedFilters.hasLink !== 'any') count++;
                if (advancedFilters.followUpDateFrom) count++;
                if (advancedFilters.followUpDateTo) count++;
                if (advancedFilters.lastPaymentDateFrom) count++;
                if (advancedFilters.lastPaymentDateTo) count++;
                return count;
              }, [advancedFilters]) > 0 && (
              <span className="text-sm text-muted-foreground">
                Showing {total.toLocaleString()} filtered {total === 1 ? 'property' : 'properties'}
              </span>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Drag and Drop File Upload Zone */}
      <div className="mb-6">
        <FileDropZone compact onUploadComplete={handleUploadComplete} />
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
            statusFilter={selectedStatuses.length === 1 ? selectedStatuses[0] : undefined}
            onStatusFilterChange={(status) => {
              if (status) {
                setSelectedStatuses([status]);
              } else {
                setSelectedStatuses([]);
              }
            }}
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
