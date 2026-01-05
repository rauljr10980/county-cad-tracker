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
    hasExemptions: 'any',
    followUpDateFrom: undefined,
    followUpDateTo: undefined,
    lastPaymentDateFrom: undefined,
    lastPaymentDateTo: undefined,
  });
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof Property>('totalAmountDue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
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
  
  // Helper function to check if any advanced filters are active (excluding status)
  const hasActiveAdvancedFilters = useMemo(() => {
    return (
      (advancedFilters.amountDueMin !== undefined) ||
      (advancedFilters.amountDueMax !== undefined) ||
      (advancedFilters.marketValueMin !== undefined) ||
      (advancedFilters.marketValueMax !== undefined) ||
      (advancedFilters.taxYear !== undefined) ||
      (advancedFilters.hasNotes !== 'any') ||
      (advancedFilters.hasLink !== 'any') ||
      (advancedFilters.hasExemptions !== 'any') ||
      (advancedFilters.followUpDateFrom !== undefined) ||
      (advancedFilters.followUpDateTo !== undefined) ||
      (advancedFilters.lastPaymentDateFrom !== undefined) ||
      (advancedFilters.lastPaymentDateTo !== undefined)
    );
  }, [advancedFilters]);
  
  // Check if sorting is active (not default state)
  const isSortingActive = sortField !== 'totalAmountDue' || sortDirection !== 'asc';
  
  // Check if search query is active
  const hasSearchQuery = debouncedSearchQuery && typeof debouncedSearchQuery === 'string' && debouncedSearchQuery.trim().length > 0;
  
  // When any filter is active (multiple statuses, advanced filters, search, or sorting), 
  // fetch all properties to enable proper filtering across all 33k+ properties
  const hasAnyFilter = selectedStatuses.length > 1 || hasActiveAdvancedFilters || hasSearchQuery || isSortingActive;
  
  // Reduce fetch limit to improve performance - fetch in chunks if needed
  const fetchLimit = hasAnyFilter
    ? 10000  // Fetch 10k properties when filters are active (more manageable)
    : ITEMS_PER_PAGE;
  
  // Fetch properties from API with status filter and search
  // When no filters: use API pagination
  // When any filter is active: fetch all and paginate on frontend
  const shouldUseApiPagination = !hasAnyFilter;
  const { data, isLoading, error } = useProperties({
    status: apiStatusFilter,
    search: debouncedSearchQuery,
    page: shouldUseApiPagination ? page : 1, // Use API pagination when no frontend filtering needed
    limit: shouldUseApiPagination ? ITEMS_PER_PAGE : fetchLimit,
  });
  
  // Safely extract properties with fallbacks
  const rawProperties: Property[] = useMemo(() => {
    try {
      if (data) {
        // Handle both array and object response formats
        if (Array.isArray(data)) {
          return data;
        } else if (data && typeof data === 'object' && 'properties' in data && Array.isArray(data.properties)) {
          return data.properties;
        }
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing data:', e);
    }
    return [];
  }, [data]);
  
  const statusCounts = useMemo(() => {
    try {
      if (data && !Array.isArray(data) && 'statusCounts' in data) {
        return data.statusCounts || { J: 0, A: 0, P: 0, other: 0 };
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing statusCounts:', e);
    }
    return { J: 0, A: 0, P: 0, other: 0 };
  }, [data]);
  
  const totalUnfiltered = useMemo(() => {
    try {
      if (data) {
        if (Array.isArray(data)) {
          return data.length;
        } else if ('totalUnfiltered' in data) {
          return data.totalUnfiltered || 0;
        } else if ('total' in data) {
          return data.total || 0;
        }
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing totalUnfiltered:', e);
    }
    return 0;
  }, [data]);
  
  // Apply advanced filtering logic
  const filteredProperties = useMemo(() => {
    let filtered = [...rawProperties];
    
    // Status filter
    if (advancedFilters.statuses.length > 0) {
      filtered = filtered.filter(p => advancedFilters.statuses.includes(p.status));
    }
    
    // Amount Due range
    if (advancedFilters.amountDueMin !== undefined) {
      filtered = filtered.filter(p => p.totalAmountDue >= advancedFilters.amountDueMin!);
    }
    if (advancedFilters.amountDueMax !== undefined) {
      filtered = filtered.filter(p => p.totalAmountDue <= advancedFilters.amountDueMax!);
    }
    
    // Market Value range
    if (advancedFilters.marketValueMin !== undefined) {
      filtered = filtered.filter(p => p.marketValue !== undefined && p.marketValue >= advancedFilters.marketValueMin!);
    }
    if (advancedFilters.marketValueMax !== undefined) {
      filtered = filtered.filter(p => p.marketValue !== undefined && p.marketValue <= advancedFilters.marketValueMax!);
    }
    
    // Tax Year
    if (advancedFilters.taxYear) {
      filtered = filtered.filter(p => p.taxYear === advancedFilters.taxYear);
    }
    
    // Has Notes
    if (advancedFilters.hasNotes === 'yes') {
      filtered = filtered.filter(p => p.notes && typeof p.notes === 'string' && p.notes.trim() !== '');
    } else if (advancedFilters.hasNotes === 'no') {
      filtered = filtered.filter(p => !p.notes || typeof p.notes !== 'string' || p.notes.trim() === '');
    }
    
    // Has Link
    if (advancedFilters.hasLink === 'yes') {
      filtered = filtered.filter(p => p.link && typeof p.link === 'string' && p.link.trim() !== '');
    } else if (advancedFilters.hasLink === 'no') {
      filtered = filtered.filter(p => !p.link || typeof p.link !== 'string' || p.link.trim() === '');
    }
    
    // Has Exemptions
    if (advancedFilters.hasExemptions === 'yes') {
      filtered = filtered.filter(p => {
        if (!p.exemptions || !Array.isArray(p.exemptions) || p.exemptions.length === 0) return false;
        // Filter out arrays that only contain "None" or empty strings
        const validExemptions = p.exemptions.filter(e => {
          if (!e || typeof e !== 'string') return false;
          const trimmed = e.trim();
          return trimmed && trimmed.toLowerCase() !== 'none';
        });
        return validExemptions.length > 0;
      });
    } else if (advancedFilters.hasExemptions === 'no') {
      filtered = filtered.filter(p => {
        // No exemptions means: undefined, empty array, or only "None"/empty strings
        if (!p.exemptions || !Array.isArray(p.exemptions) || p.exemptions.length === 0) return true;
        // Check if all exemptions are "None" or empty
        const validExemptions = p.exemptions.filter(e => {
          if (!e || typeof e !== 'string') return false;
          const trimmed = e.trim();
          return trimmed && trimmed.toLowerCase() !== 'none';
        });
        return validExemptions.length === 0;
      });
    }
    
    // Follow-up Date range
    if (advancedFilters.followUpDateFrom) {
      const fromDate = new Date(advancedFilters.followUpDateFrom);
      filtered = filtered.filter(p => {
        if (!p.lastFollowUp) return false;
        const followUpDate = new Date(p.lastFollowUp);
        return followUpDate >= fromDate;
      });
    }
    if (advancedFilters.followUpDateTo) {
      const toDate = new Date(advancedFilters.followUpDateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(p => {
        if (!p.lastFollowUp) return false;
        const followUpDate = new Date(p.lastFollowUp);
        return followUpDate <= toDate;
      });
    }
    
    // Last Payment Date range
    if (advancedFilters.lastPaymentDateFrom) {
      const fromDate = new Date(advancedFilters.lastPaymentDateFrom);
      filtered = filtered.filter(p => {
        if (!p.lastPaymentDate) return false;
        const paymentDate = new Date(p.lastPaymentDate);
        return paymentDate >= fromDate;
      });
    }
    if (advancedFilters.lastPaymentDateTo) {
      const toDate = new Date(advancedFilters.lastPaymentDateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(p => {
        if (!p.lastPaymentDate) return false;
        const paymentDate = new Date(p.lastPaymentDate);
        return paymentDate <= toDate;
      });
    }
    
    return filtered;
  }, [rawProperties, advancedFilters]);
  
  // Apply sorting to all properties before pagination (only for filtered cases)
  const sortedProperties = useMemo(() => {
    let propertiesToSort: Property[] = [];
    
    if (selectedStatuses.length > 1 || hasActiveAdvancedFilters) {
      // Multiple filters applied - use filtered results
      propertiesToSort = filteredProperties;
    } else if (selectedStatuses.length === 1) {
      // Single status selected - filter by status
      propertiesToSort = rawProperties.filter(p => p.status === selectedStatuses[0]);
    } else {
      // No filters - but if sorting is active, we have more properties
      // If sorting is not active, return raw (using API pagination)
      if (!isSortingActive) {
        return rawProperties;
      }
      // Sorting is active, so we have more properties to sort
      propertiesToSort = rawProperties;
    }
    
    // Apply sorting
    return [...propertiesToSort].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal === undefined || bVal === undefined) return 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [selectedStatuses, hasActiveAdvancedFilters, filteredProperties, rawProperties, sortField, sortDirection, isSortingActive]);
  
  // Calculate totals and pagination
  const { properties, total, totalPages } = useMemo(() => {
    let finalProperties: Property[] = [];
    let finalTotal = 0;
    let finalTotalPages = 1;
    
    if (selectedStatuses.length > 1 || hasActiveAdvancedFilters) {
      // Multiple filters applied - use sorted filtered results
      finalTotal = sortedProperties.length;
      finalTotalPages = Math.ceil(finalTotal / ITEMS_PER_PAGE);
      
      // Apply pagination
      const startIndex = (page - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      finalProperties = sortedProperties.slice(startIndex, endIndex);
    } else if (selectedStatuses.length === 1) {
      // Single status selected - use sorted properties
      finalTotal = sortedProperties.length;
      finalTotalPages = Math.ceil(finalTotal / ITEMS_PER_PAGE);
      
      // Apply pagination
      const startIndex = (page - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      finalProperties = sortedProperties.slice(startIndex, endIndex);
    } else {
      // No filters
      if (isSortingActive) {
        // Sorting is active - use sorted properties
        finalTotal = sortedProperties.length;
        finalTotalPages = Math.ceil(finalTotal / ITEMS_PER_PAGE);
        
        // Apply pagination
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        finalProperties = sortedProperties.slice(startIndex, endIndex);
      } else {
        // No sorting - use API pagination directly (API already returns the correct page)
        finalProperties = rawProperties;
        finalTotal = totalUnfiltered;
        
        // Extract totalPages from API response if available
        try {
          if (data && !Array.isArray(data) && 'totalPages' in data) {
            finalTotalPages = data.totalPages || Math.ceil(finalTotal / ITEMS_PER_PAGE);
          } else {
            finalTotalPages = Math.ceil(finalTotal / ITEMS_PER_PAGE);
          }
        } catch (e) {
          finalTotalPages = Math.ceil(finalTotal / ITEMS_PER_PAGE);
        }
      }
    }
    
    return {
      properties: finalProperties,
      total: finalTotal,
      totalPages: finalTotalPages,
    };
  }, [selectedStatuses, hasActiveAdvancedFilters, sortedProperties, statusCounts, totalUnfiltered, rawProperties, page, data, isSortingActive]);
  
  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.statuses.length > 0) count += advancedFilters.statuses.length;
    if (advancedFilters.amountDueMin !== undefined) count++;
    if (advancedFilters.amountDueMax !== undefined) count++;
    if (advancedFilters.marketValueMin !== undefined) count++;
    if (advancedFilters.marketValueMax !== undefined) count++;
    if (advancedFilters.taxYear) count++;
    if (advancedFilters.hasNotes !== 'any') count++;
    if (advancedFilters.hasLink !== 'any') count++;
    if (advancedFilters.hasExemptions !== 'any') count++;
    if (advancedFilters.followUpDateFrom) count++;
    if (advancedFilters.followUpDateTo) count++;
    if (advancedFilters.lastPaymentDateFrom) count++;
    if (advancedFilters.lastPaymentDateTo) count++;
    return count;
  }, [advancedFilters]);

  const startItem = total > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
  const endItem = Math.min(page * ITEMS_PER_PAGE, total);

  // Handle advanced filters change
  const handleFiltersChange = (filters: AdvancedFilters) => {
    setAdvancedFilters(filters);
    setPage(1);
  };

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
      hasExemptions: 'any',
      followUpDateFrom: undefined,
      followUpDateTo: undefined,
      lastPaymentDateFrom: undefined,
      lastPaymentDateTo: undefined,
    });
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };

  const handleSort = (field: keyof Property) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc'); // Start with ascending (lowest to highest)
    }
    setPage(1); // Reset to first page when sorting changes
  };

  const handleUploadComplete = () => {
    // Refresh data after upload
    window.location.reload();
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
              activeFilterCount={activeFilterCount}
            />
            
            {activeFilterCount > 0 && (
              <span className="text-sm text-muted-foreground">
                Showing {total.toLocaleString()} filtered {total === 1 ? 'property' : 'properties'}
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
      ) : (
        <>
          <PropertyTable
            properties={properties}
            onViewProperty={setSelectedProperty}
            statusFilter={selectedStatuses.length === 1 ? selectedStatuses[0] : undefined}
            onStatusFilterChange={(status) => {
              handleFiltersChange({
                ...advancedFilters,
                statuses: status ? [status] : [],
              });
            }}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {startItem.toLocaleString()} to {endItem.toLocaleString()} of {total.toLocaleString()} properties
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
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
