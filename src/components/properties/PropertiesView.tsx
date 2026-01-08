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

  // Always filter on frontend for consistency - don't use API status filtering
  // This ensures the filtering logic matches exactly between single and multiple status selections
  const apiStatusFilter = undefined; // Always fetch all properties, filter on frontend
  
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
  
  // When any filter is active (single or multiple statuses, advanced filters, search, or sorting), 
  // fetch all properties to enable proper filtering across all 33k+ properties
  // Include single status selection since we're now filtering on frontend
  const hasAnyFilter = selectedStatuses.length > 0 || (hasActiveAdvancedFilters ?? false) || hasSearchQuery || isSortingActive;
  
  // Reduce fetch limit to improve performance - fetch in chunks if needed
  // Start with smaller limit and only increase if needed
  const fetchLimit = hasAnyFilter
    ? 5000  // Fetch 5k properties when filters are active (faster initial load)
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
  
  // Debug: Log query state
  useEffect(() => {
    console.log('[PropertiesView] Query state changed:', {
      isLoading,
      hasError: !!error,
      hasData: !!data,
      dataType: Array.isArray(data) ? 'array' : typeof data,
      dataKeys: data && typeof data === 'object' ? Object.keys(data) : null,
    });
  }, [data, isLoading, error]);
  
  // Safely extract properties with fallbacks
  const rawProperties: Property[] = useMemo(() => {
    try {
      console.log('[PropertiesView] Processing data:', { 
        hasData: !!data, 
        isArray: Array.isArray(data),
        dataType: typeof data,
        hasProperties: data && typeof data === 'object' && 'properties' in data
      });
      
      if (data) {
        // Handle both array and object response formats
        if (Array.isArray(data)) {
          console.log('[PropertiesView] Data is array, returning', data.length, 'properties');
          return data;
        } else if (data && typeof data === 'object' && 'properties' in data && Array.isArray(data.properties)) {
          console.log('[PropertiesView] Data has properties array, returning', data.properties.length, 'properties');
          return data.properties;
        } else {
          console.warn('[PropertiesView] Data format not recognized:', Object.keys(data || {}));
        }
      } else {
        console.log('[PropertiesView] No data available');
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing data:', e);
    }
    console.log('[PropertiesView] Returning empty array');
    return [];
  }, [data]);
  
  const statusCounts = useMemo(() => {
    try {
      if (data && !Array.isArray(data) && 'statusCounts' in data) {
        const apiCounts = data.statusCounts || {};
        console.log('[PropertiesView] Raw statusCounts from API:', apiCounts);

        // API returns single letters (J, A, P, U) - map to full enum names for frontend consistency
        // Prefer single letter keys, fallback to full enum names if single letter doesn't exist
        // Don't add them together - they represent the same data in different formats
        const getCount = (shortKey: string, fullKey?: string): number => {
          // Prefer single letter format (what API actually returns)
          if (typeof apiCounts[shortKey] === 'number') {
            return apiCounts[shortKey];
          }
          // Fallback to full enum name if single letter doesn't exist
          if (fullKey && typeof apiCounts[fullKey] === 'number') {
            return apiCounts[fullKey];
          }
          return 0;
        };

        const counts = {
          JUDGMENT: getCount('J', 'JUDGMENT'),
          ACTIVE: getCount('A', 'ACTIVE'),
          PENDING: getCount('P', 'PENDING'),
          UNKNOWN: getCount('U', 'UNKNOWN') || (typeof apiCounts.other === 'number' ? apiCounts.other : 0),
          PAID: typeof apiCounts.PAID === 'number' ? apiCounts.PAID : 0,
          REMOVED: typeof apiCounts.REMOVED === 'number' ? apiCounts.REMOVED : 0,
        };
        
        console.log('[PropertiesView] Mapped statusCounts:', counts);
        return counts;
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing statusCounts:', e);
    }
    return { JUDGMENT: 0, ACTIVE: 0, PENDING: 0, UNKNOWN: 0, PAID: 0, REMOVED: 0 };
  }, [data]);
  
  const totalUnfiltered = useMemo(() => {
    try {
      if (data) {
        if (Array.isArray(data)) {
          return data.length || 0;
        } else if (data && typeof data === 'object' && 'totalUnfiltered' in data) {
          const value = data.totalUnfiltered;
          return (typeof value === 'number' && !isNaN(value)) ? value : 0;
        } else if (data && typeof data === 'object' && 'total' in data) {
          const value = data.total;
          return (typeof value === 'number' && !isNaN(value)) ? value : 0;
        }
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing totalUnfiltered:', e);
    }
    return 0;
  }, [data]);
  
  // Helper function to normalize status for comparison (handles both formats)
  const normalizeStatus = (status: string): string => {
    if (!status) return 'U'; // Default to Unknown for empty status
    const upper = status.toUpperCase().trim();
    // Handle full enum names
    if (upper === 'JUDGMENT' || upper.startsWith('JUDG')) return 'J';
    if (upper === 'ACTIVE' || upper.startsWith('ACTI')) return 'A';
    if (upper === 'PENDING' || upper.startsWith('PEND')) return 'P';
    if (upper === 'UNKNOWN' || upper.startsWith('UNKN')) return 'U';
    // Handle single letters
    if (upper === 'J') return 'J';
    if (upper === 'A') return 'A';
    if (upper === 'P') return 'P';
    if (upper === 'U') return 'U';
    // Default to Unknown for unrecognized statuses
    return 'U';
  };

  // Helper function to check if search query matches a status
  const getStatusFromSearch = (search: string): string | null => {
    const upper = search.trim().toUpperCase();
    if (upper === 'J' || upper === 'JUDGMENT' || upper.startsWith('JUDG')) return 'J';
    if (upper === 'A' || upper === 'ACTIVE' || upper.startsWith('ACTI')) return 'A';
    if (upper === 'P' || upper === 'PENDING' || upper.startsWith('PEND')) return 'P';
    if (upper === 'U' || upper === 'UNKNOWN' || upper.startsWith('UNKN')) return 'U';
    return null;
  };

  // Apply advanced filtering logic - optimized to combine filters in single pass
  const filteredProperties = useMemo(() => {
    // Early return if no filters
    const hasActiveFilters = hasActiveAdvancedFilters ?? false;
    const searchStatus = debouncedSearchQuery ? getStatusFromSearch(debouncedSearchQuery) : null;
    const hasStatusFilter = advancedFilters.statuses.length > 0 || searchStatus !== null;
    
    // Debug: Log filter state
    if (hasStatusFilter) {
      console.log('[FILTER] Filtering properties:', {
        totalProperties: rawProperties.length,
        selectedStatuses: advancedFilters.statuses,
        searchStatus,
        hasActiveFilters
      });
    }
    
    if (!hasActiveFilters && !hasStatusFilter) {
      return rawProperties;
    }
    
    // Single pass filtering for better performance
    const filtered = rawProperties.filter(p => {
      // Status filter - normalize to handle both single letters (J, A, P) and full enum values (JUDGMENT, ACTIVE, PENDING)
      // Check both advancedFilters.statuses and search query for status matches
      if (hasStatusFilter) {
        const propertyStatus = normalizeStatus(p.status || '');
        
        // Check if property matches any selected statuses
        let matchesStatus = false;
        if (advancedFilters.statuses.length > 0) {
          const normalizedFilterStatuses = advancedFilters.statuses.map(s => normalizeStatus(s));
          matchesStatus = normalizedFilterStatuses.includes(propertyStatus);
          
          // Debug logging for first few properties
          if (rawProperties.indexOf(p) < 3) {
            console.log('[FILTER] Property status check:', {
              originalStatus: p.status,
              normalizedPropertyStatus: propertyStatus,
              filterStatuses: advancedFilters.statuses,
              normalizedFilterStatuses,
              matches: matchesStatus
            });
          }
        }
        
        // Also check if search query matches status
        if (!matchesStatus && searchStatus) {
          matchesStatus = propertyStatus === searchStatus;
        }
        
        if (!matchesStatus) {
          return false;
        }
      }
      
      // Amount Due range
      if (advancedFilters.amountDueMin !== undefined && p.totalAmountDue < advancedFilters.amountDueMin) {
        return false;
      }
      if (advancedFilters.amountDueMax !== undefined && p.totalAmountDue > advancedFilters.amountDueMax) {
        return false;
      }
      
      // Market Value range
      if (advancedFilters.marketValueMin !== undefined && (p.marketValue === undefined || p.marketValue < advancedFilters.marketValueMin)) {
        return false;
      }
      if (advancedFilters.marketValueMax !== undefined && (p.marketValue === undefined || p.marketValue > advancedFilters.marketValueMax)) {
        return false;
      }
      
      // Tax Year
      if (advancedFilters.taxYear && p.taxYear !== advancedFilters.taxYear) {
        return false;
      }
      
      // Has Notes
      if (advancedFilters.hasNotes === 'yes') {
        if (!p.notes || typeof p.notes !== 'string' || p.notes.trim() === '') return false;
      } else if (advancedFilters.hasNotes === 'no') {
        if (p.notes && typeof p.notes === 'string' && p.notes.trim() !== '') return false;
      }
      
      // Has Link
      if (advancedFilters.hasLink === 'yes') {
        if (!p.link || typeof p.link !== 'string' || p.link.trim() === '') return false;
      } else if (advancedFilters.hasLink === 'no') {
        if (p.link && typeof p.link === 'string' && p.link.trim() !== '') return false;
      }
      
      // Has Exemptions
      if (advancedFilters.hasExemptions === 'yes') {
        if (!p.exemptions || !Array.isArray(p.exemptions) || p.exemptions.length === 0) return false;
        const validExemptions = p.exemptions.filter(e => {
          if (!e || typeof e !== 'string') return false;
          const trimmed = e.trim();
          return trimmed && trimmed.toLowerCase() !== 'none';
        });
        if (validExemptions.length === 0) return false;
      } else if (advancedFilters.hasExemptions === 'no') {
        if (p.exemptions && Array.isArray(p.exemptions) && p.exemptions.length > 0) {
          const validExemptions = p.exemptions.filter(e => {
            if (!e || typeof e !== 'string') return false;
            const trimmed = e.trim();
            return trimmed && trimmed.toLowerCase() !== 'none';
          });
          if (validExemptions.length > 0) return false;
        }
      }
      
      // Follow-up Date range
      if (advancedFilters.followUpDateFrom) {
        if (!p.lastFollowUp) return false;
        const fromDate = new Date(advancedFilters.followUpDateFrom);
        const followUpDate = new Date(p.lastFollowUp);
        if (followUpDate < fromDate) return false;
      }
      if (advancedFilters.followUpDateTo) {
        if (!p.lastFollowUp) return false;
        const toDate = new Date(advancedFilters.followUpDateTo);
        toDate.setHours(23, 59, 59, 999);
        const followUpDate = new Date(p.lastFollowUp);
        if (followUpDate > toDate) return false;
      }
      
      // Last Payment Date range
      if (advancedFilters.lastPaymentDateFrom) {
        if (!p.lastPaymentDate) return false;
        const fromDate = new Date(advancedFilters.lastPaymentDateFrom);
        const paymentDate = new Date(p.lastPaymentDate);
        if (paymentDate < fromDate) return false;
      }
      if (advancedFilters.lastPaymentDateTo) {
        if (!p.lastPaymentDate) return false;
        const toDate = new Date(advancedFilters.lastPaymentDateTo);
        toDate.setHours(23, 59, 59, 999);
        const paymentDate = new Date(p.lastPaymentDate);
        if (paymentDate > toDate) return false;
      }
      
      // Search query filter (if not already handled by status matching above)
      // Only apply if search doesn't match a status (status matching is handled above)
      if (debouncedSearchQuery && !searchStatus) {
        const searchLower = debouncedSearchQuery.toLowerCase().trim();
        const matchesSearch = 
          (p.accountNumber && p.accountNumber.toLowerCase().includes(searchLower)) ||
          (p.ownerName && p.ownerName.toLowerCase().includes(searchLower)) ||
          (p.propertyAddress && p.propertyAddress.toLowerCase().includes(searchLower)) ||
          (p.notes && p.notes.toLowerCase().includes(searchLower)) ||
          (p.phoneNumbers && Array.isArray(p.phoneNumbers) && p.phoneNumbers.some(phone => 
            phone && phone.toLowerCase().includes(searchLower)
          ));
        
        if (!matchesSearch) {
          return false;
        }
      }
      
      return true;
    });
    
    // Debug logging when status filter is active
    if (hasStatusFilter && advancedFilters.statuses.length > 0) {
      console.log('[FILTER] Status filtering summary:', {
        totalProperties: rawProperties.length,
        filteredCount: filtered.length,
        selectedStatuses: advancedFilters.statuses,
        searchStatus,
        sampleStatuses: rawProperties.slice(0, 10).map(p => p.status)
      });
    }
    
    return filtered;
  }, [rawProperties, advancedFilters, hasActiveAdvancedFilters, debouncedSearchQuery]);
  
  // Apply sorting to all properties before pagination (only for filtered cases)
  const sortedProperties = useMemo(() => {
    let propertiesToSort: Property[] = [];
    
    // Always use filteredProperties when status filters are active (single or multiple)
    // The filteredProperties useMemo already handles all the normalization correctly
    if (selectedStatuses.length > 0 || hasActiveAdvancedFilters) {
      // Status filter(s) or other advanced filters applied - use filtered results
      propertiesToSort = filteredProperties;
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
    try {
      console.log('[PropertiesView] Calculating pagination:', {
        selectedStatuses: selectedStatuses.length,
        hasActiveAdvancedFilters,
        isSortingActive,
        rawPropertiesCount: rawProperties.length,
        sortedPropertiesCount: sortedProperties.length,
        page
      });
      
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
    
      console.log('[PropertiesView] Pagination result:', {
        propertiesCount: finalProperties.length,
        total: finalTotal,
        totalPages: finalTotalPages,
        page
      });
      
    const result = {
      properties: finalProperties || [],
      total: finalTotal || 0,
      totalPages: finalTotalPages || 1,
    };
    
    // Ensure all values are numbers, not undefined
    if (typeof result.total !== 'number') result.total = 0;
    if (typeof result.totalPages !== 'number') result.totalPages = 1;
    
    return result;
    } catch (err) {
      console.error('[PropertiesView] Error in pagination calculation:', err);
      return {
        properties: [],
        total: 0,
        totalPages: 1,
      };
    }
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

  // Safely calculate start and end items with null checks
  const startItem = useMemo(() => {
    if (!total || total === 0) return 0;
    return (page - 1) * ITEMS_PER_PAGE + 1;
  }, [total, page]);
  
  const endItem = useMemo(() => {
    if (!total || total === 0) return 0;
    return Math.min(page * ITEMS_PER_PAGE, total);
  }, [total, page]);

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
              {totalUnfiltered && typeof totalUnfiltered === 'number' && totalUnfiltered > 0 && ` ${totalUnfiltered.toLocaleString()} total properties.`}
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
              Searching for "{debouncedSearchQuery}"... {total && typeof total === 'number' && total > 0 && `Found ${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
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
                Showing {total && typeof total === 'number' ? total.toLocaleString() : 0} filtered {total === 1 ? 'property' : 'properties'}
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
          <h3 className="text-lg font-semibold mb-2">No Properties Found</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {totalUnfiltered === 0 
              ? 'No properties have been uploaded yet. Upload a file to get started.'
              : 'No properties match your current filters. Try adjusting your search or filters.'}
          </p>
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
                Showing {(startItem || 0).toLocaleString()} to {(endItem || 0).toLocaleString()} of {(total || 0).toLocaleString()} properties
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
