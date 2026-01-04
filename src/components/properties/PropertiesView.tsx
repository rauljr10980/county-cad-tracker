import { useState, useEffect } from 'react';
import { FileSpreadsheet, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Search, X, ChevronDown } from 'lucide-react';
import { PropertyTable } from './PropertyTable';
import { PropertyDetailsModal } from './PropertyDetailsModal';
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
  const [selectedStatuses, setSelectedStatuses] = useState<PropertyStatus[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  
  // Update debounced search after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1); // Reset to page 1 when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Convert selectedStatuses array to single status for API (use first selected, or undefined if none/all)
  // For now, we'll filter on frontend if multiple statuses are selected
  const apiStatusFilter = selectedStatuses.length === 1 ? selectedStatuses[0] : undefined;
  
  // Fetch properties from API with status filter and search
  const { data, isLoading, error } = useProperties({
    status: apiStatusFilter,
    search: debouncedSearchQuery,
    page,
    limit: ITEMS_PER_PAGE,
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
    properties = properties.filter(p => selectedStatuses.includes(p.status));
    total = properties.length;
    totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  } else if (selectedStatuses.length === 0) {
    // All selected - no filtering needed
  }
  
  const startItem = total > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
  const endItem = Math.min(page * ITEMS_PER_PAGE, total);
  
  // Handle status filter toggle - reset to page 1
  const toggleStatusFilter = (status: PropertyStatus) => {
    setSelectedStatuses(prev => {
      const isSelected = prev.includes(status);
      if (isSelected) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
    setPage(1);
  };
  
  // Clear all status filters
  const clearStatusFilters = () => {
    setSelectedStatuses([]);
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
    setSelectedStatuses([]);
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };
  
  // Get filter button text
  const getFilterButtonText = () => {
    if (selectedStatuses.length === 0) {
      return `All (${totalUnfiltered.toLocaleString()})`;
    }
    if (selectedStatuses.length === 1) {
      const status = selectedStatuses[0];
      const label = status === 'J' ? 'Judgment' : status === 'A' ? 'Active' : 'Pending';
      const count = statusCounts[status] || 0;
      return `${label} (${count.toLocaleString()})`;
    }
    return `${selectedStatuses.length} selected`;
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
        
        {/* Status Filter Dropdown */}
        <div className="mt-4 p-3 border border-border rounded-lg bg-card/50">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 mr-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filter by status:</span>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={selectedStatuses.length > 0 ? "default" : "outline"}
                  size="sm"
                  className="min-w-[140px] justify-between"
                >
                  <span>{getFilterButtonText()}</span>
                  <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Select Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedStatuses.length === 0}
                onCheckedChange={(checked) => {
                  clearStatusFilters();
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span>All</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({totalUnfiltered.toLocaleString()})
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedStatuses.includes('P')}
                onCheckedChange={() => toggleStatusFilter('P')}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    <span>Pending</span>
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({statusCounts.P.toLocaleString()})
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStatuses.includes('A')}
                onCheckedChange={() => toggleStatusFilter('A')}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span>Active</span>
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({statusCounts.A.toLocaleString()})
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStatuses.includes('J')}
                onCheckedChange={() => toggleStatusFilter('J')}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span>Judgment</span>
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({statusCounts.J.toLocaleString()})
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
              {selectedStatuses.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    onSelect={(e) => {
                      e.preventDefault();
                      clearStatusFilters();
                    }}
                    className="text-primary cursor-pointer"
                  >
                    Clear all filters
                  </DropdownMenuCheckboxItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
            {selectedStatuses.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Showing {total.toLocaleString()} {selectedStatuses.length === 1 
                  ? selectedStatuses[0] === 'J' ? 'Judgment' : selectedStatuses[0] === 'A' ? 'Active' : 'Pending'
                  : 'filtered'} properties
              </span>
            )}
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
