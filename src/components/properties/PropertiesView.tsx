import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Search, X, ChevronDown, Route, MapPin, Trash2, GripVertical, Eye, CheckCircle, RotateCcw, Route as RouteIcon } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PropertyTable } from './PropertyTable';
import { PropertyDetailsModal } from './PropertyDetailsModal';
import { AdvancedFiltersPanel, AdvancedFilters } from './AdvancedFilters';
import { Property, PropertyStatus, WorkflowStage } from '@/types/property';
import { useProperties } from '@/hooks/useFiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { solveVRP, getActiveRoutes, deleteRoute, removeRecordFromRoute, reorderRecordInRoute, API_BASE_URL, batchGeocodeProperties, getGeocodeStatus, markPropertyVisitedInRoute, updatePropertyDealStage } from '@/lib/api';
import { batchGeocodeAddresses } from '@/lib/geocoding';
import { RouteMap } from '@/components/routing/RouteMap';
import { AreaSelectorMap } from '@/components/routing/AreaSelectorMap';
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

// Local type alias for routes
type RouteType = {
  id: string;
  driver: 'Luciano' | 'Raul';
  status: 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  routeData: any;
  routeType?: string;
  createdAt: string;
  finishedAt?: string;
  updatedAt: string;
  recordCount: number;
  records: Array<{
    id: string;
    orderIndex: number;
    isDepot: boolean;
    record: {
      id: string;
      accountNumber?: string;
      propertyAddress?: string;
      ownerName?: string;
      latitude?: number;
      longitude?: number;
      visited?: boolean;
      visited_at?: string;
      visited_by?: string;
      visitedAt?: string;
      visitedBy?: string;
    };
  }>;
};

// Sortable Row Component for Route Details - mobile card + desktop table row
function SortableRouteRow({
  routeRecord,
  index,
  viewRoute,
  propertyId,
  record,
  removingRecordId,
  reorderingRecordId,
  handleRemoveRecordFromRoute,
  handleMarkVisited,
  handleViewRecordDetails,
  markingVisited,
  handleDealStageChange,
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    setActivatorNodeRef,
  } = useSortable({
    id: routeRecord.id,
    strategy: undefined,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isDepot = routeRecord.isDepot === true;
  const visited = routeRecord.visited === true || record?.visited === true;

  const removeButton = (
    <Button
      size="sm"
      variant="default"
      onClick={(e) => {
        e.stopPropagation();
        handleRemoveRecordFromRoute(viewRoute.id, routeRecord.id);
      }}
      disabled={removingRecordId === routeRecord.id}
      className="h-8 w-8 p-0 bg-red-600 hover:bg-red-700 text-white border-2 border-red-500 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
      title="Remove from route"
    >
      {removingRecordId === routeRecord.id ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <X className="h-4 w-4" />
      )}
    </Button>
  );

  const dealStageSelect = propertyId && record && handleDealStageChange ? (
    <Select
      value={(record as any).dealStage || 'new_lead'}
      onValueChange={async (value) => {
        try {
          await handleDealStageChange(propertyId, value as any);
        } catch (error) {
          console.error('Error updating deal stage:', error);
        }
      }}
    >
      <SelectTrigger className="h-8 text-xs w-full cursor-pointer hover:bg-secondary/50 border-border">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[100]">
        <SelectItem value="new_lead">New Lead</SelectItem>
        <SelectItem value="contacted">Contacted</SelectItem>
        <SelectItem value="interested">Interested</SelectItem>
        <SelectItem value="offer_sent">Offer Sent</SelectItem>
        <SelectItem value="negotiating">Negotiating</SelectItem>
        <SelectItem value="under_contract">Under Contract</SelectItem>
        <SelectItem value="closed">Closed</SelectItem>
        <SelectItem value="dead">Dead</SelectItem>
      </SelectContent>
    </Select>
  ) : null;

  const visitedButton = propertyId ? (
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => {
        e.stopPropagation();
        handleMarkVisited(propertyId, viewRoute.driver, !visited);
      }}
      disabled={markingVisited === propertyId}
      className={`h-7 text-xs ${
        visited
          ? 'bg-green-500/20 text-green-600 border-green-500 hover:bg-green-500/30'
          : ''
      }`}
    >
      {markingVisited === propertyId ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {visited ? 'Updating...' : 'Marking...'}
        </>
      ) : (
        visited ? 'Visited' : 'Pending'
      )}
    </Button>
  ) : null;

  const detailsButton = propertyId ? (
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => {
        e.stopPropagation();
        handleViewRecordDetails(propertyId);
      }}
      className="h-7 text-xs"
    >
      <Eye className="h-3 w-3 mr-1" />
      Details
    </Button>
  ) : null;

  const dragHandle = (
    <div
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing p-1 hover:bg-secondary/50 rounded flex items-center justify-center flex-shrink-0"
      title="Drag to reorder"
      onPointerDown={(e) => { e.stopPropagation(); }}
    >
      <GripVertical className="h-5 w-5 text-muted-foreground" />
    </div>
  );

  return (
    <>
      {/* Mobile card layout */}
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'md:hidden border border-border rounded-lg p-3 bg-card',
          isDepot && 'bg-primary/10 border-primary/30',
          isDragging && 'bg-secondary/50'
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isDepot ? (
              <Badge variant="default" className="bg-primary flex-shrink-0">Depot</Badge>
            ) : (
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                {routeRecord.orderIndex}
              </span>
            )}
            <p className="text-sm font-medium line-clamp-2">{record?.propertyAddress || record?.address || 'N/A'}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {removeButton}
            {dragHandle}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[120px]">{dealStageSelect}</div>
          {visitedButton}
          {detailsButton}
        </div>
      </div>

      {/* Desktop table row */}
      <tr
        ref={setNodeRef}
        style={style}
        className={cn(
          'hidden md:table-row border-t border-border hover:bg-secondary/30',
          isDepot && 'bg-primary/10',
          isDragging && 'bg-secondary/50'
        )}
      >
        <td className="px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            {isDepot ? (
              <Badge variant="default" className="bg-primary">Depot</Badge>
            ) : (
              <span className="font-medium">{routeRecord.orderIndex}</span>
            )}
            {removeButton}
          </div>
        </td>
        <td className="px-4 py-2 text-sm">{record?.propertyAddress || record?.address || 'N/A'}</td>
        <td className="px-4 py-2 text-sm" style={{ position: 'relative', zIndex: 1 }}>{dealStageSelect}</td>
        <td className="px-4 py-2 text-sm">{visitedButton}</td>
        <td className="px-4 py-2 text-sm">{detailsButton}</td>
        <td className="px-4 py-2 text-sm">{dragHandle}</td>
      </tr>
    </>
  );
}

export function PropertiesView() {
  const queryClient = useQueryClient();
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const numVehicles = 1; // Always use 1 vehicle
  const [isOptimizingRoute, setIsOptimizingRoute] = useState(false);
  const [routeMapOpen, setRouteMapOpen] = useState(false);
  const [optimizedRoutes, setOptimizedRoutes] = useState<any>(null);
  const [areaSelectorOpen, setAreaSelectorOpen] = useState(false);
  const [customDepot, setCustomDepot] = useState<{ lat: number; lng: number } | null>(null);
  const [customDepotPropertyId, setCustomDepotPropertyId] = useState<string | null>(null);
  const [propertiesInRoutes, setPropertiesInRoutes] = useState<Set<string>>(new Set());
  const [propertyRouteMap, setPropertyRouteMap] = useState<Map<string, { routeId: string; routeRecordId: string }>>(new Map());

  // Geocoding state
  const [geocodeOpen, setGeocodeOpen] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeCancelled, setGeocodeCancelled] = useState(false);
  const geocodeCancelledRef = useRef(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ current: 0, total: 0, address: '' });
  const [geocodeResults, setGeocodeResults] = useState<Map<string, { latitude: number; longitude: number; displayName: string }>>(new Map());
  
  // Batch geocoding state
  const [batchGeocodeOpen, setBatchGeocodeOpen] = useState(false);
  const [isBatchGeocoding, setIsBatchGeocoding] = useState(false);
  const [batchGeocodeProgress, setBatchGeocodeProgress] = useState({ processed: 0, successful: 0, errors: 0, skipped: 0, total: 0 });
  const [geocodeStatus, setGeocodeStatus] = useState<{ total: number; withoutCoordinates: number; withCoordinates: number; percentageComplete: string } | null>(null);

  // Active routes state
  const [activeRoutes, setActiveRoutes] = useState<RouteType[]>([]);
  const [isLoadingActiveRoutes, setIsLoadingActiveRoutes] = useState(false);
  const [viewRoute, setViewRoute] = useState<RouteType | null>(null);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState<string | null>(null);
  const [removingRecordId, setRemovingRecordId] = useState<string | null>(null);
  const [reorderingRecordId, setReorderingRecordId] = useState<string | null>(null);
  const [markingVisited, setMarkingVisited] = useState<string | null>(null);

  // Drag and drop sensors for route reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    statuses: [],
    amountDueMin: undefined,
    amountDueMax: undefined,
    marketValueMin: undefined,
    marketValueMax: undefined,
    ratioMin: undefined,
    ratioMax: undefined,
    taxYear: undefined,
    hasNotes: 'any',
    hasLink: 'any',
    hasExemptions: 'any',
    hasVisited: 'any',
    propertyType: 'any',
    followUpDateFrom: undefined,
    followUpDateTo: undefined,
    lastPaymentDateFrom: undefined,
    lastPaymentDateTo: undefined,
  });
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [workflowStageFilter, setWorkflowStageFilter] = useState<WorkflowStage | null>(null);
  const [sortField, setSortField] = useState<keyof Property | 'ratio'>('totalAmountDue');
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

  // Always use frontend filtering for status filters to ensure consistency
  // This ensures properties are always displayed correctly whether 1 or multiple statuses are selected
  // Backend filtering can be unreliable, so we fetch all properties and filter on frontend
  const apiStatusFilter = undefined; // Always use frontend filtering for status
  
  // Helper function to check if any advanced filters are active (excluding status)
  const hasActiveAdvancedFilters = useMemo(() => {
    return (
      (advancedFilters.amountDueMin !== undefined) ||
      (advancedFilters.amountDueMax !== undefined) ||
      (advancedFilters.marketValueMin !== undefined) ||
      (advancedFilters.marketValueMax !== undefined) ||
      (advancedFilters.ratioMin !== undefined) ||
      (advancedFilters.ratioMax !== undefined) ||
      (advancedFilters.taxYear !== undefined) ||
      (advancedFilters.hasNotes !== 'any') ||
      (advancedFilters.hasLink !== 'any') ||
      (advancedFilters.hasExemptions !== 'any') ||
      (advancedFilters.hasVisited !== 'any') ||
      (advancedFilters.propertyType !== 'any' && advancedFilters.propertyType !== undefined) ||
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
  
  // When any filter is active (single or multiple statuses, advanced filters, search, or sorting)
  const hasAnyFilter = selectedStatuses.length > 0 || (hasActiveAdvancedFilters ?? false) || hasSearchQuery || isSortingActive;
  
  // Fetch strategy:
  // - ANY filter or sorting active: ALWAYS fetch all properties (50000) to search/filter/sort from all 33k properties
  // - No filters: Fetch all properties (50000) to show all at once
  // Always fetch all properties when filtering/sorting/searching to ensure accuracy across all 33k properties
  const fetchLimit = hasAnyFilter
    ? 50000  // ANY filter or sorting active - fetch all properties to search/filter/sort from all 33k
    : 50000; // No filters - fetch all properties (up to 50k) to show all at once
  
  // Fetch properties from API with status filter and search
  // When no filters: fetch all and paginate on frontend
  // When any filter is active: fetch all and paginate on frontend
  const shouldUseApiPagination = false; // Always use frontend pagination to show all properties
  const { data, isLoading, error } = useProperties({
    status: apiStatusFilter,
    search: debouncedSearchQuery,
    page: 1, // Always use page 1, pagination is handled on frontend
    limit: fetchLimit,
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
        hasProperties: data && typeof data === 'object' && 'properties' in data,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        selectedStatuses: selectedStatuses,
        apiStatusFilter
      });
      
      if (data) {
        // Handle both array and object response formats
        if (Array.isArray(data)) {
          console.log('[PropertiesView] Data is array, returning', data.length, 'properties');
          return data;
        } else if (data && typeof data === 'object' && 'properties' in data && Array.isArray(data.properties)) {
          console.log('[PropertiesView] Data has properties array, returning', data.properties.length, 'properties');
          console.log('[PropertiesView] Sample properties:', data.properties.slice(0, 3).map(p => ({ id: p.id, status: p.status, accountNumber: p.accountNumber })));
          return data.properties;
        } else {
          console.warn('[PropertiesView] Data format not recognized:', {
            keys: Object.keys(data || {}),
            hasTotal: 'total' in (data || {}),
            hasStatusCounts: 'statusCounts' in (data || {}),
            dataSample: data
          });
        }
      } else {
        console.log('[PropertiesView] No data available');
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing data:', e);
    }
    console.log('[PropertiesView] Returning empty array');
    return [];
  }, [data, selectedStatuses, apiStatusFilter]);
  
  const statusCounts = useMemo(() => {
    try {
      if (data && !Array.isArray(data) && 'statusCounts' in data) {
        const apiCounts = data.statusCounts || {};
        console.log('[PropertiesView] Raw statusCounts from API:', apiCounts);

        // API returns single letters (J, A, P, U) - use them directly
        const counts = {
          J: typeof apiCounts.J === 'number' ? apiCounts.J : 0,
          A: typeof apiCounts.A === 'number' ? apiCounts.A : 0,
          P: typeof apiCounts.P === 'number' ? apiCounts.P : 0,
          U: typeof apiCounts.U === 'number' ? apiCounts.U : (typeof apiCounts.other === 'number' ? apiCounts.other : 0),
        };
        
        console.log('[PropertiesView] Mapped statusCounts:', counts);
        return counts;
      }
    } catch (e) {
      console.error('[PropertiesView] Error parsing statusCounts:', e);
    }
    return { J: 0, A: 0, P: 0, U: 0 };
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
  
  // Workflow stage funnel data (same system as pre-foreclosure)
  const WORKFLOW_FUNNEL_STAGES: { key: WorkflowStage; label: string; color: string }[] = [
    { key: 'not_started', label: 'Not Started', color: '#6B7280' },
    { key: 'initial_visit', label: 'Initial Visit', color: '#3B82F6' },
    { key: 'people_search', label: 'People Search', color: '#8B5CF6' },
    { key: 'call_owner', label: 'Call Owner', color: '#EC4899' },
    { key: 'land_records', label: 'Land Records', color: '#F59E0B' },
    { key: 'visit_heirs', label: 'Visit Heirs', color: '#F97316' },
    { key: 'call_heirs', label: 'Call Heirs', color: '#EF4444' },
    { key: 'negotiating', label: 'Negotiating', color: '#10B981' },
  ];

  const workflowStageCounts = useMemo(() => {
    const counts: Record<WorkflowStage, number> = {
      not_started: 0, initial_visit: 0, people_search: 0, call_owner: 0,
      land_records: 0, visit_heirs: 0, call_heirs: 0, negotiating: 0, dead_end: 0,
    };
    for (const p of rawProperties) {
      const stage = (p.workflow_stage as WorkflowStage) || 'not_started';
      if (stage in counts) counts[stage]++;
    }
    return counts;
  }, [rawProperties]);

  const maxWorkflowStageCount = useMemo(() => {
    const activeCounts = WORKFLOW_FUNNEL_STAGES.map(s => workflowStageCounts[s.key]);
    return Math.max(1, ...activeCounts);
  }, [workflowStageCounts]);

  // Helper function to normalize status to single letter (J, A, P, U)
  // This matches exactly how StatusBadge handles statuses - it checks statusConfig keys
  // StatusBadge does: status?.toString().toUpperCase() and looks up in statusConfig
  // So we normalize the same way to ensure filtering matches display
  const normalizeStatus = (status: string | undefined): string => {
    if (!status) return 'U'; // Default to U for empty status
    const upper = status.toString().toUpperCase().trim();
    
    // Direct match with statusConfig keys (same as StatusBadge lookup)
    // Single letters (primary format)
    if (upper === 'J') return 'J';
    if (upper === 'A') return 'A';
    if (upper === 'P') return 'P';
    if (upper === 'U') return 'U';
    
    // Legacy full enum names (StatusBadge also handles these)
    if (upper === 'JUDGMENT' || upper.startsWith('JUDG')) return 'J';
    if (upper === 'ACTIVE' || upper.startsWith('ACTI')) return 'A';
    if (upper === 'PENDING' || upper.startsWith('PEND')) return 'P';
    if (upper === 'UNKNOWN' || upper.startsWith('UNKN')) return 'U';
    
    // Default to U for unrecognized statuses (StatusBadge uses defaultConfig)
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
    
    // Always use frontend filtering when statuses are selected (since apiStatusFilter is always undefined)
    // This ensures we properly normalize database enum names (PENDING, ACTIVE, JUDGMENT) to single letters (P, A, J)
    const needsFrontendStatusFilter = advancedFilters.statuses.length > 0 || searchStatus !== null;
    
    // Debug: Log filter state
    if (needsFrontendStatusFilter || hasActiveFilters) {
      console.log('[FILTER] Filtering properties:', {
        totalProperties: rawProperties.length,
        selectedStatuses: advancedFilters.statuses,
        apiStatusFilter,
        needsFrontendStatusFilter,
        searchStatus,
        hasActiveFilters,
        amountDueMin: advancedFilters.amountDueMin,
        amountDueMax: advancedFilters.amountDueMax,
        marketValueMin: advancedFilters.marketValueMin,
        marketValueMax: advancedFilters.marketValueMax,
        ratioMin: advancedFilters.ratioMin,
        ratioMax: advancedFilters.ratioMax,
        taxYear: advancedFilters.taxYear,
        hasNotes: advancedFilters.hasNotes,
        hasLink: advancedFilters.hasLink,
        hasExemptions: advancedFilters.hasExemptions,
        sampleStatuses: rawProperties.slice(0, 5).map(p => ({ accountNumber: p.accountNumber, status: p.status, totalAmountDue: p.totalAmountDue }))
      });
    }
    
    // If no filters at all, return raw properties
    if (!hasActiveFilters && !needsFrontendStatusFilter && !workflowStageFilter) {
      return rawProperties;
    }

    // Single pass filtering for better performance
    // Match exactly how StatusBadge displays statuses - simple direct comparison
    const filtered = rawProperties.filter(p => {
      // Workflow stage filter (from clicking Sales Funnel bars)
      if (workflowStageFilter) {
        const stage = (p.workflow_stage as WorkflowStage) || 'not_started';
        if (stage !== workflowStageFilter) return false;
      }
      // Status filter - ALWAYS apply when statuses are selected (database uses PENDING/ACTIVE/JUDGMENT, filter uses P/A/J)
      if (needsFrontendStatusFilter) {
        // Normalize property status from database format (PENDING, ACTIVE, JUDGMENT) to single letter (J, A, P, U)
        const originalStatus = p.status || '';
        const propertyStatus = normalizeStatus(originalStatus);
        
        // Check if property matches any selected statuses
        let matchesStatus = false;
        if (advancedFilters.statuses.length > 0) {
          // advancedFilters.statuses contains single letters (J, A, P, U)
          // Normalize them to ensure consistency (handles any edge cases)
          const normalizedFilterStatuses = advancedFilters.statuses.map(s => normalizeStatus(s));
          matchesStatus = normalizedFilterStatuses.includes(propertyStatus);
          
          // Debug logging for first 20 properties when filtering to see normalization in action
          if (rawProperties.indexOf(p) < 20) {
            console.log('[FILTER DEBUG] Status comparison:', {
              accountNumber: p.accountNumber,
              originalStatus,
              normalizedPropertyStatus: propertyStatus,
              selectedStatuses: advancedFilters.statuses,
              normalizedFilterStatuses,
              matches: matchesStatus
            });
          }
        }
        
        // Also check if search query matches status
        if (!matchesStatus && searchStatus) {
          matchesStatus = propertyStatus === searchStatus;
        }
        
        // If status filter is active and property doesn't match, exclude it
        if (advancedFilters.statuses.length > 0 && !matchesStatus) {
          return false;
        }
      }
      
      // Amount Due range
      if (advancedFilters.amountDueMin !== undefined && advancedFilters.amountDueMin !== null) {
        const minValue = typeof advancedFilters.amountDueMin === 'number' ? advancedFilters.amountDueMin : parseFloat(String(advancedFilters.amountDueMin));
        if (!isNaN(minValue)) {
          if (p.totalAmountDue < minValue) {
            return false;
          }
          // Debug logging for first few properties
          if (rawProperties.indexOf(p) < 5) {
            console.log('[FILTER DEBUG] Amount Due Min check:', {
              accountNumber: p.accountNumber,
              totalAmountDue: p.totalAmountDue,
              minValue,
              passes: p.totalAmountDue >= minValue
            });
          }
        }
      }
      if (advancedFilters.amountDueMax !== undefined && advancedFilters.amountDueMax !== null) {
        const maxValue = typeof advancedFilters.amountDueMax === 'number' ? advancedFilters.amountDueMax : parseFloat(String(advancedFilters.amountDueMax));
        if (!isNaN(maxValue)) {
          if (p.totalAmountDue > maxValue) {
            return false;
          }
          // Debug logging for first few properties
          if (rawProperties.indexOf(p) < 5) {
            console.log('[FILTER DEBUG] Amount Due Max check:', {
              accountNumber: p.accountNumber,
              totalAmountDue: p.totalAmountDue,
              maxValue,
              passes: p.totalAmountDue <= maxValue
            });
          }
        }
      }
      
      // Market Value range
      if (advancedFilters.marketValueMin !== undefined && advancedFilters.marketValueMin !== null) {
        const minValue = typeof advancedFilters.marketValueMin === 'number' ? advancedFilters.marketValueMin : parseFloat(String(advancedFilters.marketValueMin));
        if (!isNaN(minValue) && (p.marketValue === undefined || p.marketValue < minValue)) {
          return false;
        }
      }
      if (advancedFilters.marketValueMax !== undefined && advancedFilters.marketValueMax !== null) {
        const maxValue = typeof advancedFilters.marketValueMax === 'number' ? advancedFilters.marketValueMax : parseFloat(String(advancedFilters.marketValueMax));
        if (!isNaN(maxValue) && (p.marketValue === undefined || p.marketValue > maxValue)) {
          return false;
        }
      }
      
      // Ratio range (calculated as: amountDue / marketValue * 100)
      if (advancedFilters.ratioMin !== undefined || advancedFilters.ratioMax !== undefined) {
        // Calculate ratio
        const ratio = (p.marketValue && p.marketValue !== 0) 
          ? (p.totalAmountDue / p.marketValue) * 100 
          : null;
        
        // If ratio is null (no market value) and min is set, exclude it
        if (ratio === null && advancedFilters.ratioMin !== undefined && advancedFilters.ratioMin !== null) {
          return false;
        }
        
        // Check min ratio
        if (ratio !== null && advancedFilters.ratioMin !== undefined && advancedFilters.ratioMin !== null) {
          const minValue = typeof advancedFilters.ratioMin === 'number' ? advancedFilters.ratioMin : parseFloat(String(advancedFilters.ratioMin));
          if (!isNaN(minValue) && ratio < minValue) {
            return false;
          }
        }
        
        // Check max ratio
        if (ratio !== null && advancedFilters.ratioMax !== undefined && advancedFilters.ratioMax !== null) {
          const maxValue = typeof advancedFilters.ratioMax === 'number' ? advancedFilters.ratioMax : parseFloat(String(advancedFilters.ratioMax));
          if (!isNaN(maxValue) && ratio > maxValue) {
            return false;
          }
        }
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
      
      // Has Visited (check if property is in routes and marked as visited)
      if (advancedFilters.hasVisited === 'yes') {
        if (!propertiesInRoutes.has(p.id)) return false;
      } else if (advancedFilters.hasVisited === 'no') {
        if (propertiesInRoutes.has(p.id)) return false;
      }
      
      // Property Type (primary vs secondary)
      if (advancedFilters.propertyType === 'primary') {
        if (p.isPrimaryProperty === false) return false;
      } else if (advancedFilters.propertyType === 'secondary') {
        if (p.isPrimaryProperty !== false) return false;
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
    
    // Debug: Log filtering results
    if (hasActiveFilters || needsFrontendStatusFilter) {
      console.log('[FILTER] Filtering complete:', {
        inputCount: rawProperties.length,
        outputCount: filtered.length,
        amountDueMin: advancedFilters.amountDueMin,
        amountDueMax: advancedFilters.amountDueMax,
        marketValueMin: advancedFilters.marketValueMin,
        marketValueMax: advancedFilters.marketValueMax,
        sampleFiltered: filtered.slice(0, 5).map(p => ({ 
          accountNumber: p.accountNumber, 
          totalAmountDue: p.totalAmountDue,
          marketValue: p.marketValue 
        }))
      });
    }
    
    // Debug logging when status filter is active
    if (needsFrontendStatusFilter && advancedFilters.statuses.length > 0) {
      // Count how many properties match each status after normalization
      const statusBreakdown: Record<string, number> = {};
      rawProperties.forEach(p => {
        const normalized = normalizeStatus(p.status);
        statusBreakdown[normalized] = (statusBreakdown[normalized] || 0) + 1;
      });
      
      console.log('[FILTER] Status filtering summary:', {
        totalProperties: rawProperties.length,
        filteredCount: filtered.length,
        selectedStatuses: advancedFilters.statuses,
        normalizedSelectedStatuses: advancedFilters.statuses.map(s => normalizeStatus(s)),
        searchStatus,
        statusBreakdown,
        sampleStatuses: rawProperties.slice(0, 10).map(p => ({ 
          original: p.status, 
          normalized: normalizeStatus(p.status),
          accountNumber: p.accountNumber 
        }))
      });
    }
    
    return filtered;
  }, [rawProperties, advancedFilters, hasActiveAdvancedFilters, debouncedSearchQuery, propertiesInRoutes, workflowStageFilter]);
  
  // Apply sorting to all properties before pagination (only for filtered cases)
  const sortedProperties = useMemo(() => {
    let propertiesToSort: Property[] = [];

    if (selectedStatuses.length > 0 || hasActiveAdvancedFilters || workflowStageFilter) {
      // Any filters applied (status or advanced) - use filtered results
      propertiesToSort = filteredProperties;
      console.log('[SORT] Using filteredProperties for sorting:', {
        filteredPropertiesCount: filteredProperties.length,
        selectedStatuses: selectedStatuses.length,
        hasActiveAdvancedFilters,
        sampleProperties: filteredProperties.slice(0, 3).map(p => ({ id: p.id, status: p.status, accountNumber: p.accountNumber }))
      });
    } else {
      // No filters - all properties are loaded, use raw properties for sorting
      // If sorting is not active, return raw properties as-is
      if (!isSortingActive) {
        return rawProperties;
      }
      // Sorting is active, so sort all raw properties
      propertiesToSort = rawProperties;
    }
    
    // Apply sorting with proper handling of null/undefined values
    const sorted = [...propertiesToSort].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      // Handle special case: ratio is calculated (totalAmountDue / marketValue * 100)
      if (sortField === 'ratio') {
        // Calculate ratio: (amountDue / marketValue) * 100
        aVal = (a.marketValue && a.marketValue !== 0) 
          ? (a.totalAmountDue / a.marketValue) * 100 
          : null;
        bVal = (b.marketValue && b.marketValue !== 0) 
          ? (b.totalAmountDue / b.marketValue) * 100 
          : null;
      } else {
        // Normal field access
        aVal = a[sortField];
        bVal = b[sortField];
      }
      
      // Handle null/undefined values - put them at the end
      const aIsNull = aVal === undefined || aVal === null || (typeof aVal === 'number' && isNaN(aVal));
      const bIsNull = bVal === undefined || bVal === null || (typeof bVal === 'number' && isNaN(bVal));
      
      if (aIsNull && bIsNull) return 0; // Both null, maintain order
      if (aIsNull) return 1; // a is null, put it after b
      if (bIsNull) return -1; // b is null, put it after a
      
      // Both values exist, compare them
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // String comparison for non-numeric values
      return sortDirection === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    
    console.log('[SORT] Sorting complete:', {
      inputCount: propertiesToSort.length,
      outputCount: sorted.length,
      sortField,
      sortDirection
    });
    
    return sorted;
  }, [selectedStatuses, hasActiveAdvancedFilters, filteredProperties, rawProperties, sortField, sortDirection, isSortingActive, workflowStageFilter]);
  
  // Calculate totals and pagination
  const { properties, total, totalPages, allFilteredPropertyIds } = useMemo(() => {
    try {
      console.log('[PropertiesView] Calculating pagination:', {
        selectedStatuses: selectedStatuses.length,
        selectedStatusesValues: selectedStatuses,
        hasActiveAdvancedFilters,
        isSortingActive,
        rawPropertiesCount: rawProperties.length,
        sortedPropertiesCount: sortedProperties.length,
        filteredPropertiesCount: filteredProperties.length,
        page
      });
      
      let finalProperties: Property[] = [];
      let finalTotal = 0;
      let finalTotalPages = 1;
    
    // All properties are now fetched and paginated on frontend
    // Use sorted properties if filters or sorting are active, otherwise use raw properties
    // sortedProperties already contains filtered properties when filters are active
    const hasAnyFilterOrSort = selectedStatuses.length > 0 || hasActiveAdvancedFilters || isSortingActive;
    const propertiesToPaginate = hasAnyFilterOrSort ? sortedProperties : rawProperties;
    finalTotal = propertiesToPaginate.length || totalUnfiltered;
    finalTotalPages = Math.ceil(finalTotal / ITEMS_PER_PAGE);
    
    // Apply pagination
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    finalProperties = propertiesToPaginate.slice(startIndex, endIndex);
    
      console.log('[PropertiesView] Pagination result:', {
        propertiesCount: finalProperties.length,
        total: finalTotal,
        totalPages: finalTotalPages,
        page,
        selectedStatuses: selectedStatuses.length,
        hasActiveAdvancedFilters,
        sortedPropertiesCount: sortedProperties.length,
        filteredPropertiesCount: filteredProperties.length,
        rawPropertiesCount: rawProperties.length,
        sampleFinalProperties: finalProperties.slice(0, 3).map(p => ({ id: p.id, status: p.status, accountNumber: p.accountNumber }))
      });
      
    const result = {
      properties: finalProperties || [],
      total: finalTotal || 0,
      totalPages: finalTotalPages || 1,
      allFilteredPropertyIds: propertiesToPaginate.map(p => p.id),
    };
    
    // Ensure all values are numbers, not undefined
    if (typeof result.total !== 'number') result.total = 0;
    if (typeof result.totalPages !== 'number') result.totalPages = 1;
    
    // Final safety check - if we have a total but no properties, log a warning
    if (result.total > 0 && result.properties.length === 0) {
      console.error('[PropertiesView] WARNING: Total is', result.total, 'but properties array is empty!', {
        sortedPropertiesLength: sortedProperties.length,
        filteredPropertiesLength: filteredProperties.length,
        rawPropertiesLength: rawProperties.length,
        selectedStatuses,
        hasActiveAdvancedFilters
      });
    }
    
    return result;
    } catch (err) {
      console.error('[PropertiesView] Error in pagination calculation:', err);
      return {
        properties: [],
        total: 0,
        totalPages: 1,
        allFilteredPropertyIds: [],
      };
    }
  }, [selectedStatuses, hasActiveAdvancedFilters, sortedProperties, statusCounts, totalUnfiltered, rawProperties, page, data, isSortingActive]);
  
  // Helper function to generate page numbers for pagination
  const getPageNumbers = (currentPage: number, totalPages: number): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5; // Show up to 5 page numbers
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is 5 or less
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage <= 3) {
        // Near the beginning: show 1, 2, 3, 4, 5, ..., last
        for (let i = 2; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near the end: show 1, ..., n-3, n-2, n-1, n
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // In the middle: show 1, ..., current-1, current, current+1, ..., last
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.statuses.length > 0) count += advancedFilters.statuses.length;
    if (advancedFilters.amountDueMin !== undefined) count++;
    if (advancedFilters.amountDueMax !== undefined) count++;
    if (advancedFilters.marketValueMin !== undefined) count++;
    if (advancedFilters.marketValueMax !== undefined) count++;
    if (advancedFilters.ratioMin !== undefined) count++;
    if (advancedFilters.ratioMax !== undefined) count++;
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
    console.log('[FILTERS] Filters changed:', filters);
    setAdvancedFilters(filters);
    setPage(1); // Reset to first page when filters change
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [advancedFilters]);

  const clearAllFilters = () => {
    setAdvancedFilters({
      statuses: [],
      amountDueMin: undefined,
      amountDueMax: undefined,
      marketValueMin: undefined,
      marketValueMax: undefined,
      ratioMin: undefined,
      ratioMax: undefined,
      taxYear: undefined,
      hasNotes: 'any',
      hasLink: 'any',
      hasExemptions: 'any',
      hasVisited: 'any',
      propertyType: 'any',
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

  const handleSort = (field: keyof Property | 'ratio') => {
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

  const handlePropertySelect = (propertyId: string, selected: boolean) => {
    setSelectedPropertyIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(propertyId);
      } else {
        newSet.delete(propertyId);
      }
      return newSet;
    });
  };

  // Point-in-polygon algorithm (ray casting)
  const isPointInPolygon = (point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]) => {
    if (polygon.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;
      
      const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleAreaSelected = async (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
    center?: { lat: number; lng: number };
    radius?: number;
    polygon?: { lat: number; lng: number }[];
  }) => {
    // Filter properties within the selected area
    // Use filteredProperties to match what's shown in the table
    const propertiesInArea = filteredProperties.filter(p => {
      if (!p.latitude || !p.longitude) return false;
      
      // If polygon is provided, use point-in-polygon check
      if (bounds.polygon && bounds.polygon.length >= 3) {
        return isPointInPolygon({ lat: p.latitude, lng: p.longitude }, bounds.polygon);
      }
      
      // For circle with radius, check distance from center
      if (bounds.center && bounds.radius) {
        const distance = Math.sqrt(
          Math.pow(p.latitude - bounds.center.lat, 2) + 
          Math.pow(p.longitude - bounds.center.lng, 2)
        ) * 111; // Convert degrees to km
        return distance <= bounds.radius;
      }
      
      // Check if property is within rectangular bounds
      return p.latitude >= bounds.south &&
             p.latitude <= bounds.north &&
             p.longitude >= bounds.west &&
             p.longitude <= bounds.east;
    });

    if (propertiesInArea.length === 0) {
      toast({
        title: "No properties in area",
        description: "No properties found within the selected area. Try selecting a different area.",
        variant: "destructive",
      });
      return;
    }

    if (propertiesInArea.length > 500) {
      toast({
        title: "Too many properties",
        description: `Found ${propertiesInArea.length} properties in the selected area. Maximum 500 allowed. Please select a smaller area.`,
        variant: "destructive",
      });
      return;
    }

    // Auto-select properties in area, but preserve custom starting point if set
    const areaPropertyIds = new Set(propertiesInArea.map(p => p.id));
    
    // If a custom starting point was set, ensure it's included in the selection
    if (customDepotPropertyId) {
      areaPropertyIds.add(customDepotPropertyId);
    }
    
    setSelectedPropertyIds(areaPropertyIds);
    
    // Automatically create route with custom starting point if it was set
    if (customDepotPropertyId) {
      const depotProperty = filteredProperties.find(p => p.id === customDepotPropertyId);
      if (depotProperty && customDepot) {
        await handleCreateRouteWithDepot(depotProperty, customDepot);
        return;
      }
    }
    
    toast({
      title: "Area Selected",
      description: `Found ${propertiesInArea.length} properties in the selected area. ${customDepotPropertyId ? 'Route optimized with custom starting point.' : 'Click "Optimize Route" to continue.'}`,
    });
  };

  const handleStartingPointSelected = (property: Property, pinLocation: { lat: number; lng: number }) => {
    setCustomDepot(pinLocation);
    setCustomDepotPropertyId(property.id); // Store the specific property ID to use as depot
    // Ensure the closest property is selected
    if (!selectedPropertyIds.has(property.id)) {
      setSelectedPropertyIds(new Set([...selectedPropertyIds, property.id]));
    }
    toast({
      title: "Starting Point Selected",
      description: `Starting point set. Route will begin from: ${property.propertyAddress}. You can now draw an area or select properties, then click "Optimize Route".`,
    });
    // Don't automatically optimize route - let user draw area first, then optimize manually
  };

  const handleCreateRouteWithDepot = async (depotProperty?: Property, depotLocation?: { lat: number; lng: number }, providedProperties?: Property[]) => {
    console.log('[handleCreateRouteWithDepot] Called with:', {
      hasProvidedProperties: !!providedProperties,
      providedPropertiesCount: providedProperties?.length || 0,
      selectedPropertyIdsCount: selectedPropertyIds.size,
      hasDepotProperty: !!depotProperty,
      depotPropertyId: depotProperty?.id || customDepotPropertyId
    });

    // CRITICAL VALIDATION: If providedProperties is passed (area selector), it can have up to 25 properties
    // This is: 1 depot (starting point) + 24 properties to optimize
    // After excluding the depot, we'll have exactly 24 properties for optimization
    let validatedProvidedProperties = providedProperties;
    if (providedProperties && providedProperties.length > 25) {
      console.error('[handleCreateRouteWithDepot] FATAL ERROR: providedProperties has MORE than 25 properties!');
      console.error('[handleCreateRouteWithDepot] providedProperties.length:', providedProperties.length);
      console.error('[handleCreateRouteWithDepot] This should NEVER happen! Limiting to 25 (1 depot + 24 properties) immediately.');
      
      // Force limit to 25 (1 depot + 24 properties) - this should never happen if AreaSelectorMap is working correctly
      const depotId = depotProperty?.id || customDepotPropertyId;
      const depot = depotProperty || (providedProperties.find(p => p.id === depotId));
      const others = providedProperties.filter(p => p.id !== depotId).slice(0, 24);
      validatedProvidedProperties = depot ? [depot, ...others] : providedProperties.slice(0, 25);
      console.error('[handleCreateRouteWithDepot] Force-limited providedProperties to:', validatedProvidedProperties.length, '(1 depot + 24 properties)');
    }

    // Use custom depot if provided, otherwise use default (first property)
    const depotLat = depotLocation?.lat || customDepot?.lat;
    const depotLon = depotLocation?.lng || customDepot?.lng;
    const depotPropertyId = depotProperty?.id || customDepotPropertyId; // Use the specific property ID

    // Get selected properties with valid coordinates
    // Filter out properties that are already in existing routes
    // IMPORTANT: If providedProperties is passed, ONLY use those - do NOT fall back to selectedPropertyIds
    // This ensures the area selector's 25-property limit is respected
    // CRITICAL: When no providedProperties, ONLY use properties that are in selectedPropertyIds
    let availableProperties: Property[];
    
    if (validatedProvidedProperties && validatedProvidedProperties.length > 0) {
      console.log('[handleCreateRouteWithDepot] Using validatedProvidedProperties (from area selector):', validatedProvidedProperties.length);
      availableProperties = validatedProvidedProperties.filter(p => {
        if (p.latitude == null || p.longitude == null) {
          console.warn('[handleCreateRouteWithDepot] Property missing coordinates:', p.id);
          return false;
        }
        // Allow depot property even if it's visited (it's the starting point)
        if (depotPropertyId && p.id === depotPropertyId) return true;
        // Filter out properties that are explicitly marked as visited (not just in routes)
        // This matches pre-foreclosure behavior - only exclude if visited
        const isVisited = propertiesInRoutes.has(p.id);
        if (isVisited) {
          console.log('[handleCreateRouteWithDepot] Property is marked as visited, filtering out:', p.id);
        }
        return !isVisited;
      });
      console.log('[handleCreateRouteWithDepot] After filtering providedProperties:', availableProperties.length);
    } else {
      console.log('[handleCreateRouteWithDepot] No providedProperties, using ONLY selectedPropertyIds');
      console.log('[handleCreateRouteWithDepot] Selected property IDs:', Array.from(selectedPropertyIds));
      
      // CRITICAL: Only use properties that are explicitly selected
      // Filter rawProperties to ONLY include those in selectedPropertyIds
      availableProperties = rawProperties.filter(p => {
        // FIRST CHECK: Must be in selectedPropertyIds - this is the most important filter
        if (!selectedPropertyIds.has(p.id)) {
          return false; // Not selected, exclude immediately
        }
        // Must have valid coordinates
        if (p.latitude == null || p.longitude == null) {
          console.warn('[handleCreateRouteWithDepot] Selected property missing coordinates, excluding:', p.id);
          return false;
        }
        // Allow depot property even if it's visited (it's the starting point)
        if (depotPropertyId && p.id === depotPropertyId) return true;
        // Filter out properties that are explicitly marked as visited (not just in routes)
        // Check both: properties in routes marked as visited AND properties with visited: true on the Property model
        const isVisitedInRoute = propertiesInRoutes.has(p.id);
        const isVisitedOnProperty = p.visited === true;
        const isVisited = isVisitedInRoute || isVisitedOnProperty;
        if (isVisited) {
          console.log('[handleCreateRouteWithDepot] Selected property is marked as visited, excluding:', p.id, { isVisitedInRoute, isVisitedOnProperty });
        }
        return !isVisited;
      });
      
      console.log('[handleCreateRouteWithDepot] Filtered from selectedPropertyIds:', {
        selectedCount: selectedPropertyIds.size,
        availableCount: availableProperties.length,
        availableIds: availableProperties.map(p => p.id)
      });
      
      // Safety limit: If using legacy path (no area selector), warn if too many properties
      if (availableProperties.length > 25) {
        console.error('[handleCreateRouteWithDepot] ERROR: Too many properties selected via legacy path!', availableProperties.length);
        toast({
          title: "Too Many Properties",
          description: `You have ${availableProperties.length} properties selected. Please use "Optimize by Area" to limit to 24 properties, or manually select up to 24 properties.`,
          variant: "destructive",
        });
        setIsOptimizingRoute(false);
        return;
      }
      
      // Final validation: Ensure we're only using selected properties
      const unselectedProperties = availableProperties.filter(p => !selectedPropertyIds.has(p.id));
      if (unselectedProperties.length > 0) {
        console.error('[handleCreateRouteWithDepot] CRITICAL ERROR: Found properties not in selectedPropertyIds!', unselectedProperties.map(p => p.id));
        // Remove any unselected properties
        availableProperties = availableProperties.filter(p => selectedPropertyIds.has(p.id));
        console.log('[handleCreateRouteWithDepot] Removed unselected properties, new count:', availableProperties.length);
      }
    }

    // IMPORTANT: If a custom depot property is specified, ensure it's included in the route
    // If providedProperties is passed (from area selector), only use properties from that list
    // This ensures we respect the area boundaries and property limits
    if (depotPropertyId) {
      if (providedProperties) {
        // When using validatedProvidedProperties (from area selector), only use properties from that list
        // The depot should already be in validatedProvidedProperties, but ensure it's first
        const depotInList = availableProperties.find(p => p.id === depotPropertyId);
        if (!depotInList) {
          // Try to find depot in the original validatedProvidedProperties (before filtering)
          const depotFromProvided = validatedProvidedProperties.find(p => p.id === depotPropertyId);
          if (depotFromProvided && depotFromProvided.latitude != null && depotFromProvided.longitude != null) {
            // Only add if it's not already in routes (or handle it specially)
            const wasInRoutes = propertiesInRoutes.has(depotPropertyId);
            if (wasInRoutes) {
              // Temporarily remove from tracking so it can be used as starting point
              setPropertiesInRoutes(prev => {
                const newSet = new Set(prev);
                newSet.delete(depotPropertyId);
                return newSet;
              });
            }
            availableProperties = [depotFromProvided, ...availableProperties];
          } else {
            console.warn('[Properties] Depot property not found in validatedProvidedProperties:', depotPropertyId);
          }
        } else {
          // Depot is already in list, ensure it's first
          const depotIndex = availableProperties.findIndex(p => p.id === depotPropertyId);
          if (depotIndex > 0) {
            const depot = availableProperties[depotIndex];
            availableProperties.splice(depotIndex, 1);
            availableProperties.unshift(depot);
          }
        }
      } else {
        // Legacy behavior: when not using providedProperties, allow finding depot from rawProperties
        const depotProp = rawProperties.find(p => p.id === depotPropertyId);
        if (depotProp && depotProp.latitude != null && depotProp.longitude != null) {
          const depotInList = availableProperties.find(p => p.id === depotPropertyId);
          if (!depotInList) {
            const wasInRoutes = propertiesInRoutes.has(depotPropertyId);
            if (wasInRoutes) {
              setPropertiesInRoutes(prev => {
                const newSet = new Set(prev);
                newSet.delete(depotPropertyId);
                return newSet;
              });
            }
            availableProperties = [depotProp, ...availableProperties];
          }
        }
      }
    }

    // Check if any selected properties are already marked as visited
    // Note: propertiesInRoutes now only contains properties that are explicitly marked as visited
    const propertiesToCheck = providedProperties || availableProperties;
    const duplicateCount = propertiesToCheck.filter(p => 
      propertiesInRoutes.has(p.id) && 
      p.latitude != null &&
      p.longitude != null &&
      p.id !== depotPropertyId // Don't count depot property as duplicate if it's visited
    ).length;

    console.log('[handleCreateRouteWithDepot] Properties in routes check:', {
      totalPropertiesToCheck: propertiesToCheck.length,
      propertiesInRoutesCount: propertiesInRoutes.size,
      duplicateCount,
      availablePropertiesCount: availableProperties.length,
      propertiesExcludingDepot: availableProperties.filter(p => p.id !== depotPropertyId).length
    });

    if (duplicateCount > 0) {
      toast({
        title: "Properties Already Visited",
        description: `${duplicateCount} selected properties are already marked as visited. They will be excluded from this route. Only visited properties are excluded - properties in routes but not visited can still be selected.`,
        variant: "default",
      });
    }

    // Check if we only have the depot property (no other properties to visit)
    const hasOnlyDepot = availableProperties.length === 1 && 
                         depotPropertyId && 
                         availableProperties[0].id === depotPropertyId;

    if (availableProperties.length === 0 || hasOnlyDepot) {
      const reason = hasOnlyDepot || duplicateCount > 0
        ? `All ${propertiesToCheck.length} selected properties are already marked as visited. Only visited properties are excluded - properties in routes but not visited can still be selected.`
        : "Please select properties with latitude and longitude coordinates, or use the area selector.";
      toast({
        title: "No valid locations",
        description: reason,
        variant: "destructive",
      });
      setIsOptimizingRoute(false);
      return;
    }

    // IMPORTANT: If validatedProvidedProperties was passed (from area selector), allow up to 25 total
    // This is 1 depot + 24 properties. The backend will exclude the depot from visitable stops.
    // Note: We filter out properties already in routes, which might reduce the count
    if (validatedProvidedProperties && validatedProvidedProperties.length > 0) {
      // Don't filter out the depot from availableProperties - we need it for the backend to identify it
      // But count how many non-depot properties we have for validation
      const nonDepotProperties = availableProperties.filter(p => p.id !== depotPropertyId);
      
      if (availableProperties.length > 25) {
        console.error('[handleCreateRouteWithDepot] CRITICAL ERROR: More than 25 properties after filtering!');
        console.error('[handleCreateRouteWithDepot] validatedProvidedProperties:', validatedProvidedProperties.length, 'availableProperties:', availableProperties.length);
        // Keep depot first, then limit to 24 more
        const depot = availableProperties.find(p => p.id === depotPropertyId);
        const others = availableProperties.filter(p => p.id !== depotPropertyId).slice(0, 24);
        availableProperties = depot ? [depot, ...others] : others.slice(0, 25);
        console.warn('[handleCreateRouteWithDepot] Force-limited to 25 (1 depot + 24 properties):', availableProperties.length);
      }
      
      // ABSOLUTE HARD CAP: Never allow more than 25 properties for area selector (1 depot + 24 properties)
      if (availableProperties.length > 25) {
        console.error('[handleCreateRouteWithDepot] CRITICAL: Still more than 25 after filtering! Force limiting.');
        const depot = availableProperties.find(p => p.id === depotPropertyId);
        const others = availableProperties.filter(p => p.id !== depotPropertyId).slice(0, 24);
        availableProperties = depot ? [depot, ...others] : availableProperties.slice(0, 25);
      }
      
      console.log('[handleCreateRouteWithDepot] Final count (area selector):', {
        total: availableProperties.length,
        depotIncluded: availableProperties.some(p => p.id === depotPropertyId),
        nonDepotProperties: availableProperties.filter(p => p.id !== depotPropertyId).length,
        note: 'Backend will exclude depot from visitable stops, leaving these properties to visit'
      });
    } else if (availableProperties.length > 500) {
      toast({
        title: "Too many properties",
        description: "Maximum 500 properties allowed for route optimization. For larger batches, please select fewer properties.",
        variant: "destructive",
      });
      return;
    }

    console.log('[handleCreateRouteWithDepot] Final availableProperties count:', availableProperties.length);
    
    // CRITICAL: Final validation - ensure ONLY selected properties are used
    // If no providedProperties was passed, double-check that all properties are in selectedPropertyIds
    let selectedProperties: Property[];
    if (!validatedProvidedProperties || validatedProvidedProperties.length === 0) {
      // When using manual selection, ensure every property is in selectedPropertyIds
      selectedProperties = availableProperties.filter(p => {
        const isSelected = selectedPropertyIds.has(p.id);
        if (!isSelected) {
          console.error('[handleCreateRouteWithDepot] CRITICAL: Property not in selectedPropertyIds:', p.id);
        }
        return isSelected;
      });
      console.log('[handleCreateRouteWithDepot] Final validation - only selected properties:', {
        before: availableProperties.length,
        after: selectedProperties.length,
        selectedIds: Array.from(selectedPropertyIds),
        propertiesInRoute: selectedProperties.map(p => p.id)
      });
    } else {
      // When using providedProperties (area selector), use those directly
      selectedProperties = availableProperties;
    }

    setIsOptimizingRoute(true);

    try {
      // Debug: Log the depot property ID being sent
      if (depotPropertyId) {
        const depotProp = selectedProperties.find(p => p.id === depotPropertyId);
        console.log('[Route Optimization] Using depot property:', {
          depotPropertyId,
          foundInSelected: !!depotProp,
          property: depotProp ? {
            id: depotProp.id,
            accountNumber: depotProp.accountNumber,
            address: depotProp.propertyAddress
          } : null,
          selectedCount: selectedProperties.length
        });
      }

      // CRITICAL: Final safeguard - Exclude depot before sending to optimizer
      // If validatedProvidedProperties was passed, we allow up to 25 total (1 depot + 24 properties)
      // After excluding depot, we'll have exactly 24 properties for optimization
      let finalPropertiesForOptimization = selectedProperties;
      if (validatedProvidedProperties && validatedProvidedProperties.length > 0) {
        // After excluding depot, we should have at most 24 properties
        const propertiesWithoutDepot = finalPropertiesForOptimization.filter(p => p.id !== depotPropertyId);
        if (propertiesWithoutDepot.length > 24) {
          console.error('[Route Optimization] CRITICAL: More than 24 properties (excluding depot)! Limiting now.');
          finalPropertiesForOptimization = propertiesWithoutDepot.slice(0, 24);
          // Add depot back at the beginning for consistency (will be excluded again below)
          if (depotPropertyId) {
            const depot = validatedProvidedProperties.find(p => p.id === depotPropertyId);
            if (depot) {
              finalPropertiesForOptimization = [depot, ...finalPropertiesForOptimization];
            }
          }
        }
        console.log('[Route Optimization] Properties before depot exclusion:', finalPropertiesForOptimization.length);
      }

      // CRITICAL: Final validation - ensure we never send more than 25 properties (1 depot + 24 to visit)
      // This is the absolute final check before sending to backend
      if (validatedProvidedProperties && validatedProvidedProperties.length > 0) {
        // For area selector, we must have exactly 25 or fewer (1 depot + 24 properties)
        if (finalPropertiesForOptimization.length > 25) {
          console.error('[Route Optimization] FATAL: Still more than 25 properties! Force limiting now.');
          const depot = finalPropertiesForOptimization.find(p => p.id === depotPropertyId);
          const others = finalPropertiesForOptimization.filter(p => p.id !== depotPropertyId).slice(0, 24);
          finalPropertiesForOptimization = depot ? [depot, ...others] : finalPropertiesForOptimization.slice(0, 25);
        }
        
        // ABSOLUTE HARD LIMIT: Slice to exactly 25 max
        finalPropertiesForOptimization = finalPropertiesForOptimization.slice(0, 25);
        
        console.error('[Route Optimization] FINAL VALIDATION - Properties being sent to backend:', {
          count: finalPropertiesForOptimization.length,
          expected: '25 (1 depot + 24 properties)',
          depotIncluded: finalPropertiesForOptimization.some(p => p.id === depotPropertyId),
          nonDepotCount: finalPropertiesForOptimization.filter(p => p.id !== depotPropertyId).length
        });
      }

      // IMPORTANT: Include the depot property in the properties array so the backend can identify it
      // The backend will exclude it from the visitable stops list, but needs it to:
      // 1. Find the depot property when depotPropertyId is provided
      // 2. Use its coordinates as the depot location
      // The backend code will filter it out from the visitable stops (otherProperties)
      const propertiesForVRP = finalPropertiesForOptimization.map(p => ({
        ...p,
        latitude: p.latitude!,
        longitude: p.longitude!,
      }));
      
      // Count properties excluding depot for logging
      const propertiesWithoutDepot = depotPropertyId 
        ? propertiesForVRP.filter(p => p.id !== depotPropertyId)
        : propertiesForVRP;
      
      console.log('[Route Optimization] Preparing for solveVRP:', {
        totalPropertiesIncludingDepot: propertiesForVRP.length,
        propertiesToVisitExcludingDepot: propertiesWithoutDepot.length,
        depotPropertyId,
        depotIncludedInArray: propertiesForVRP.some(p => p.id === depotPropertyId),
        note: 'Depot is included in array so backend can find it, but backend will exclude it from visitable stops'
      });
      
      // FINAL SAFETY CHECK: Throw error if still too many (should never happen)
      if (validatedProvidedProperties && propertiesForVRP.length > 25) {
        console.error('[Route Optimization] CRITICAL ERROR: About to send too many properties to backend!', propertiesForVRP.length);
        throw new Error(`Cannot optimize: ${propertiesForVRP.length} properties exceeds maximum of 25 (1 depot + 24 properties). Please use area selector to limit properties.`);
      }
      
      console.log('[Route Optimization] Calling solveVRP with:', {
        propertyCount: propertiesForVRP.length,
        numVehicles,
        depotLat,
        depotLon,
        depotPropertyId,
        routeType: 'PROPERTY',
        expectedResult: `${propertiesWithoutDepot.length} visitable stops (depot excluded)`
      });

      const solution = await solveVRP(propertiesForVRP, numVehicles, depotLat, depotLon, depotPropertyId, 'PROPERTY');

      if (!solution.success || !solution.routes || solution.routes.length === 0) {
        throw new Error('No routes generated');
      }

      // Extract all property IDs from the generated routes to track them
      // NOTE: We do NOT mark properties as "in route" here - only after the route is saved
      // This prevents properties from being stuck as "in route" if the user closes without saving
      const routePropertyIds = new Set<string>();
      solution.routes.forEach((route: any) => {
        route.waypoints.forEach((wp: any) => {
          if (wp.id && wp.id !== 'depot') {
            routePropertyIds.add(wp.id);
          }
        });
      });

      // Include the depot property ID if it was used
      if (depotPropertyId) {
        routePropertyIds.add(depotPropertyId);
      }

      // Store routes and show map visualization
      // Properties will only be marked as "in route" after the route is saved (in onRouteSaved callback)
      setOptimizedRoutes(solution);
      setRouteMapOpen(true);
      
      const actualOptimizedCount = propertiesForVRP.length;
      toast({
        title: "Route Optimized",
        description: `Optimized route for ${actualOptimizedCount} properties using ${numVehicles} vehicle(s). Total distance: ${solution.totalDistance.toFixed(2)} km. ${routePropertyIds.size} properties added to routes.`,
      });
    } catch (error) {
      console.error('[Route Optimization] Error:', error);
      toast({
        title: "Route Optimization Failed",
        description: error instanceof Error ? error.message : 'Failed to optimize route. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsOptimizingRoute(false);
    }
  };

  const handleCreateRoute = async () => {
    // Safety check: If too many properties are selected, warn user to use area selector
    if (selectedPropertyIds.size > 25) {
      toast({
        title: "Too Many Properties Selected",
        description: `You have ${selectedPropertyIds.size} properties selected. Please use the "Optimize by Area" button to optimize up to 24 properties within a selected area, or select fewer properties manually.`,
        variant: "destructive",
      });
      return;
    }
    // If no custom depot is set, just proceed with optimization
    await handleCreateRouteWithDepot();
  };

  // Load active routes on mount
  const loadActiveRoutes = async () => {
    setIsLoadingActiveRoutes(true);
    try {
      console.log('[Properties] Loading active routes...');
      const routes = await getActiveRoutes();
      console.log('[Properties] Loaded routes:', routes.length, routes);

      // Filter for PROPERTY routes only
      const propertyRoutes = routes.filter((r: RouteType) => r.routeType === 'PROPERTY');
      console.log('[Properties] Filtered property routes:', propertyRoutes.length);
      setActiveRoutes(propertyRoutes);

      // Update propertiesInRoutes based on active routes
      // IMPORTANT: Only mark properties as "in route" if they are explicitly marked as VISITED
      // This matches the pre-foreclosure behavior where properties are only excluded when marked as visited
      const activePropertyIds = new Set<string>();
      const routeMap = new Map<string, { routeId: string; routeRecordId: string }>();

      propertyRoutes.forEach((route: RouteType) => {
        route.records?.forEach((rr: any) => {
          const propId = rr.record?.id;
          if (propId) {
            routeMap.set(propId, { routeId: route.id, routeRecordId: rr.id });
          }
          // Only add to propertiesInRoutes if the property is explicitly marked as visited
          // Properties in routes but not visited can still be selected for new routes
          if (propId && (rr.visited === true || rr.record?.visited === true)) {
            activePropertyIds.add(propId);
          }
        });
      });

      // Also add properties that have visited: true directly on the Property model
      // This ensures properties marked as visited in the property details modal are also excluded
      rawProperties.forEach((p: Property) => {
        if (p.visited === true) {
          activePropertyIds.add(p.id);
        }
      });

      setPropertiesInRoutes(activePropertyIds);
      setPropertyRouteMap(routeMap);
    } catch (error) {
      console.error('[Properties] Error loading active routes:', error);
    } finally {
      setIsLoadingActiveRoutes(false);
    }
  };

  useEffect(() => {
    loadActiveRoutes();
  }, []);

  // Geocode addresses function
  const handleGeocodeAddresses = async () => {
    // If properties are selected, only geocode those. Otherwise geocode all filtered properties.
    const targetProperties = selectedPropertyIds.size > 0
      ? properties.filter(p => selectedPropertyIds.has(p.id))
      : filteredProperties;

    // Get properties that don't have coordinates AND have valid addresses
    const propertiesNeedingGeocode = targetProperties.filter(
      (p: Property) => {
        // Must not have coordinates
        if (p.latitude && p.longitude) return false;

        // Must have a propertyAddress
        if (!p.propertyAddress) return false;

        // Address must contain a number somewhere (for geocoding to work)
        // Format is "OWNER NAME + ADDRESS" so we look for any number
        const hasNumber = /\d/.test(p.propertyAddress);

        return hasNumber;
      }
    );

    if (propertiesNeedingGeocode.length === 0) {
      toast({
        title: 'No properties to geocode',
        description: selectedPropertyIds.size > 0
          ? 'Selected properties already have coordinates or have invalid addresses'
          : 'All visible properties already have coordinates or have invalid addresses',
      });
      return;
    }

    setIsGeocoding(true);
    setGeocodeOpen(true);
    setGeocodeResults(new Map());
    setGeocodeCancelled(false);

    // Use a ref-like object to track cancellation
    geocodeCancelledRef.current = false;

    try {
      const addressesToGeocode = propertiesNeedingGeocode.map((p: Property) => {
        // Extract actual address from "OWNER NAME + ADDRESS" format
        // Example: "GOODWIN BOBBY J 190 SWEET BAY LANE SANTEE, SC 29142"
        // We want: "190 SWEET BAY LANE SANTEE, SC 29142"
        let cleanAddress = p.propertyAddress || '';

        // Find first number in the string (start of actual address)
        const match = cleanAddress.match(/\d+/);
        if (match && match.index !== undefined) {
          // Extract from first number onwards
          cleanAddress = cleanAddress.substring(match.index);
        }

        return {
          id: p.id,
          address: cleanAddress,
          city: '',
          state: 'TX',
          zip: '',
        };
      });

      const results = await batchGeocodeAddresses(
        addressesToGeocode,
        (completed, total, current) => {
          setGeocodeProgress({ current: completed, total, address: current });
          // Update cancel ref when state changes
          setGeocodeCancelled(prev => {
            geocodeCancelledRef.current = prev;
            return prev;
          });
        },
        () => geocodeCancelledRef.current
      );

      setGeocodeResults(results);

      // Update properties with geocoded coordinates
      let successCount = 0;
      for (const [id, coords] of results.entries()) {
        try {
          // Call API to update property coordinates
          const response = await fetch(`${API_BASE_URL}/api/properties/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: coords.latitude,
              longitude: coords.longitude,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            console.error(`Failed to update property ${id}: ${response.status} ${response.statusText}`);
          }
        } catch (err) {
          console.error(`Failed to update property ${id}:`, err);
        }
      }

      if (geocodeCancelled) {
        toast({
          title: 'Geocoding Cancelled',
          description: `Stopped after geocoding ${successCount} properties`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Geocoding Complete',
          description: `Successfully geocoded ${successCount} of ${propertiesNeedingGeocode.length} properties`,
        });
      }

      // Refresh data to reflect changes (only if some were geocoded)
      if (successCount > 0) {
        await queryClient.invalidateQueries({ queryKey: ['properties'] });
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast({
        title: 'Geocoding Failed',
        description: error instanceof Error ? error.message : 'Failed to geocode addresses',
        variant: 'destructive',
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  // Batch geocode all properties
  const handleBatchGeocodeAll = async () => {
    try {
      setIsBatchGeocoding(true);
      setBatchGeocodeOpen(true);
      setBatchGeocodeProgress({ processed: 0, successful: 0, errors: 0, skipped: 0, total: 0 });

      // First, get status to know how many need geocoding
      const status = await getGeocodeStatus();
      setGeocodeStatus(status);
      setBatchGeocodeProgress(prev => ({ ...prev, total: status.withoutCoordinates }));

      if (status.withoutCoordinates === 0) {
        toast({
          title: 'All Properties Geocoded',
          description: 'All properties already have coordinates.',
        });
        setBatchGeocodeOpen(false);
        setIsBatchGeocoding(false);
        return;
      }

      // Process in batches of 100
      const BATCH_SIZE = 100;
      let offset = 0;
      let totalProcessed = 0;
      let totalSuccessful = 0;
      let totalErrors = 0;
      let totalSkipped = 0;

      while (offset < status.withoutCoordinates) {
        const result = await batchGeocodeProperties(BATCH_SIZE, offset);
        
        totalProcessed += result.processed;
        totalSuccessful += result.successful;
        totalErrors += result.errors;
        totalSkipped += result.skipped;

        setBatchGeocodeProgress({
          processed: totalProcessed,
          successful: totalSuccessful,
          errors: totalErrors,
          skipped: totalSkipped,
          total: status.withoutCoordinates
        });

        // Update status
        const updatedStatus = await getGeocodeStatus();
        setGeocodeStatus(updatedStatus);

        // If we've processed all or no more need geocoding, break
        if (result.processed === 0 || updatedStatus.withoutCoordinates === 0) {
          break;
        }

        offset += BATCH_SIZE;
      }

      toast({
        title: 'Batch Geocoding Complete',
        description: `Processed ${totalProcessed} properties: ${totalSuccessful} successful, ${totalErrors} errors, ${totalSkipped} skipped`,
      });

      // Refresh properties data
      await queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch (error) {
      console.error('Batch geocoding error:', error);
      const errorMessage = error instanceof Error 
        ? `${error.message}${error.cause ? ` (${error.cause})` : ''}`
        : 'Failed to geocode properties';
      toast({
        title: 'Batch Geocoding Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      // Keep dialog open to show error
    } finally {
      setIsBatchGeocoding(false);
    }
  };

  // Load geocode status on mount
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await getGeocodeStatus();
        setGeocodeStatus(status);
      } catch (error) {
        console.error('Failed to load geocode status:', error);
      }
    };
    loadStatus();
  }, []);

  // Route management functions
  const handleViewRoute = (route: RouteType) => {
    console.log('[Properties] Viewing route:', route);
    setViewRoute(route);
    setRouteDetailsOpen(true);
  };

  const handleDeleteRoute = async (routeId: string) => {
    setDeletingRoute(routeId);
    try {
      await deleteRoute(routeId);
      toast({
        title: 'Route Deleted',
        description: 'Route has been successfully deleted',
      });
      // Reload active routes
      await loadActiveRoutes();
    } catch (error) {
      console.error('Error deleting route:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete route',
        variant: 'destructive',
      });
    } finally {
      setDeletingRoute(null);
    }
  };

  const handleRemovePropertyFromRoute = async (propertyId: string) => {
    const mapping = propertyRouteMap.get(propertyId);
    if (!mapping) {
      toast({ title: 'Error', description: 'Property is not on any route', variant: 'destructive' });
      return;
    }
    try {
      await removeRecordFromRoute(mapping.routeId, mapping.routeRecordId);
      toast({ title: 'Removed from Route', description: 'Property has been removed from its route' });
      await loadActiveRoutes();
    } catch (error) {
      console.error('Error removing property from route:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove property from route',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveRecordFromRoute = async (routeId: string, routeRecordId: string) => {
    setRemovingRecordId(routeRecordId);
    try {
      await removeRecordFromRoute(routeId, routeRecordId);
      toast({
        title: 'Property Removed',
        description: 'Property has been removed from the route',
      });

      // Update viewRoute
      if (viewRoute && viewRoute.id === routeId) {
        const updatedRecords = viewRoute.records.filter(r => r.id !== routeRecordId);
        setViewRoute({ ...viewRoute, records: updatedRecords, recordCount: updatedRecords.length });
      }

      // Reload active routes
      await loadActiveRoutes();
    } catch (error) {
      console.error('Error removing property from route:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove property',
        variant: 'destructive',
      });
    } finally {
      setRemovingRecordId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !viewRoute) return;

    if (active.id !== over.id) {
      const oldIndex = viewRoute.records.findIndex((r) => r.id === active.id);
      const newIndex = viewRoute.records.findIndex((r) => r.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const newRecords = arrayMove(viewRoute.records, oldIndex, newIndex);
      setViewRoute({ ...viewRoute, records: newRecords });

      // Update order in backend
      const propertyId = viewRoute.records[oldIndex].record.id;
      setReorderingRecordId(propertyId);

      try {
        await reorderRecordInRoute(viewRoute.id, propertyId, newIndex);
        toast({
          title: 'Route Updated',
          description: 'Stop order has been updated',
        });
        await loadActiveRoutes();
      } catch (error) {
        console.error('Error reordering route:', error);
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to reorder stops',
          variant: 'destructive',
        });
        // Revert on error
        setViewRoute(viewRoute);
      } finally {
        setReorderingRecordId(null);
      }
    }
  };

  const handleViewRecordDetails = (propertyId: string) => {
    const property = rawProperties.find(p => p.id === propertyId);
    if (property) {
      setSelectedProperty(property);
    }
  };

  const handleMarkVisited = async (propertyId: string, driver: 'Luciano' | 'Raul', visited: boolean = true) => {
    if (!viewRoute) return;
    
    setMarkingVisited(propertyId);
    try {
      // Find the route record ID for this property
      const routeRecord = viewRoute.records.find(rr => rr.record.id === propertyId);
      if (!routeRecord) {
        throw new Error('Property not found in route');
      }

      await markPropertyVisitedInRoute(viewRoute.id, routeRecord.id, driver, visited);
      
      // Update viewRoute to trigger re-render
      if (viewRoute) {
        const updatedRecords = viewRoute.records.map(rr => {
          if (rr.record.id === propertyId) {
            return {
              ...rr,
              visited: visited,
              visitedAt: visited ? new Date().toISOString() : null,
              visitedBy: visited ? driver : null,
            };
          }
          return rr;
        });
        setViewRoute({ ...viewRoute, records: updatedRecords });
      }

      // Reload active routes to update propertiesInRoutes
      await loadActiveRoutes();
    } catch (error) {
      console.error('Error updating visited status:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update visited status',
        variant: 'destructive',
      });
    } finally {
      setMarkingVisited(null);
    }
  };

  const handleDealStageChange = async (propertyId: string, dealStage: 'new_lead' | 'contacted' | 'interested' | 'offer_sent' | 'negotiating' | 'under_contract' | 'closed' | 'dead') => {
    try {
      await updatePropertyDealStage(propertyId, dealStage);
      
      // Update viewRoute to trigger re-render
      if (viewRoute) {
        const updatedRecords = viewRoute.records.map(rr => {
          if (rr.record.id === propertyId) {
            return {
              ...rr,
              record: {
                ...rr.record,
                dealStage: dealStage
              }
            };
          }
          return rr;
        });
        setViewRoute({ ...viewRoute, records: updatedRecords });
      }

      // Refresh properties data
      await queryClient.invalidateQueries({ queryKey: ['properties'] });
      
      toast({
        title: 'Deal Stage Updated',
        description: 'Property deal stage has been updated',
      });
    } catch (error) {
      console.error('Error updating deal stage:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update deal stage',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-3 md:p-6">
      <div className="mb-4 md:mb-6">
        {/* Header - Mobile First */}
        <div className="mb-4">
          <h2 className="text-lg md:text-xl font-semibold">Property List</h2>
          {/* <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Browse and filter tax-delinquent properties.
            <span className="hidden sm:inline"> Click on a property to view details.</span>
            {totalUnfiltered && typeof totalUnfiltered === 'number' && totalUnfiltered > 0 && (
              <span className="block sm:inline mt-1 sm:mt-0">
                {' '}{totalUnfiltered.toLocaleString()} total properties.
              </span>
            )}
          </p> */}
        </div>

        {/* Sales Funnel - Workflow Stages */}
        <div className="mb-4 rounded-xl border border-border bg-card p-6">
          <h3 className="text-xl font-bold tracking-tight">Sales Funnel</h3>
          <p className="text-sm text-muted-foreground mt-1">Current pipeline snapshot</p>
          <div className="mt-5 space-y-3">
            {workflowStageFilter && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-primary">Filtering by: {WORKFLOW_FUNNEL_STAGES.find(s => s.key === workflowStageFilter)?.label || workflowStageFilter}</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setWorkflowStageFilter(null)}
                >
                  Clear filter
                </button>
              </div>
            )}
            {WORKFLOW_FUNNEL_STAGES.map((stage) => {
              const count = workflowStageCounts[stage.key];
              const width = Math.max(count > 0 ? 5 : 0, (count / maxWorkflowStageCount) * 100);
              const isActive = workflowStageFilter === stage.key;
              return (
                <div
                  key={stage.key}
                  className={cn("cursor-pointer rounded-lg p-1.5 -mx-1.5 transition-colors", isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary/30")}
                  onClick={() => setWorkflowStageFilter(prev => prev === stage.key ? null : stage.key)}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted-foreground">{count} {count === 1 ? 'deal' : 'deals'}</span>
                  </div>
                  <div className="relative w-full h-8 bg-secondary/50 rounded-lg overflow-hidden">
                    {count > 0 && (
                      <div
                        className="h-full flex items-center justify-center text-white font-semibold text-sm rounded-lg transition-all duration-300"
                        style={{ backgroundColor: stage.color, width: `${width}%` }}
                      >
                        {width > 15 ? count : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {workflowStageCounts.dead_end > 0 && (
            <div
              className={cn("mt-4 pt-4 border-t border-border cursor-pointer rounded-lg p-1.5 -mx-1.5 transition-colors", workflowStageFilter === 'dead_end' ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary/30")}
              onClick={() => setWorkflowStageFilter(prev => prev === 'dead_end' ? null : 'dead_end')}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />
                  Dead End
                </span>
                <span className="text-muted-foreground">{workflowStageCounts.dead_end} deals</span>
              </div>
            </div>
          )}
        </div>

        {/* Route Actions - Mobile Optimized */}
        {selectedPropertyIds.size > 0 && (
          <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex flex-col gap-3">
              {/* Selection Count */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-primary">
                  {selectedPropertyIds.size} selected
                  {propertiesInRoutes.size > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({propertiesInRoutes.size} marked as visited)
                    </span>
                  )}
                </span>
                <div className="flex gap-2">
                  {propertiesInRoutes.size > 0 && (
                    <>
                      <Button
                        onClick={async () => {
                          // Clear all properties from routes tracking - reset to empty
                          // This makes all properties available again, even if they were incorrectly marked
                          setPropertiesInRoutes(new Set());
                          toast({
                            title: "Selection Cleared",
                            description: "All properties are now available for route optimization. Only explicitly visited properties will be excluded.",
                          });
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8"
                        title="Clear all properties from routes - makes them all available again"
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Clear Selection
                      </Button>
                      <Button
                        onClick={async () => {
                          // Refresh properties in routes from actual saved routes only
                          await loadActiveRoutes();
                          toast({
                            title: "Routes Refreshed",
                            description: "Properties in routes have been refreshed from saved routes (only visited properties are excluded).",
                          });
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8"
                        title="Refresh properties in routes (only shows visited properties from actually saved routes)"
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Refresh
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={() => setSelectedPropertyIds(new Set())}
                    variant="ghost"
                    size="sm"
                    disabled={isOptimizingRoute}
                    className="h-8"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>

              {/* Route Controls - Stacked on Mobile */}
              <div className="flex flex-col sm:flex-row gap-2">
                {/* Area Selector Button */}
                <Button
                  onClick={async () => {
                    // Check if we have any properties with coordinates
                    const propertiesWithCoords = rawProperties.filter(p => p.latitude && p.longitude);
                    const propertiesNeedingGeocode = rawProperties.filter(p => {
                      if (p.latitude && p.longitude) return false;
                      if (!p.propertyAddress) return false;
                      return /\d/.test(p.propertyAddress);
                    });

                    // If no properties have coordinates, prompt user to geocode first
                    if (propertiesWithCoords.length === 0 && propertiesNeedingGeocode.length > 0) {
                      toast({
                        title: 'Geocoding Required',
                        description: `Please click "Geocode Addresses" first to convert ${propertiesNeedingGeocode.length} property addresses to coordinates.`,
                        variant: 'default',
                      });
                      return;
                    }

                    setAreaSelectorOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto mobile-touch-target"
                  title="Select area on map to filter properties"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Select Area
                </Button>

                {/* Custom Depot Clear */}
                {customDepot && (
                  <Button
                    onClick={() => {
                      setCustomDepot(null);
                      setCustomDepotPropertyId(null);
                      toast({
                        title: "Starting Point Cleared",
                        description: "Starting point has been cleared. Route will use default starting point.",
                      });
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto mobile-touch-target"
                    title="Clear custom starting point"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear Start
                  </Button>
                )}
              </div>

              {/* Primary Action - Full Width on Mobile */}
              <Button
                onClick={handleCreateRoute}
                className="bg-primary text-primary-foreground w-full mobile-touch-target"
                size="sm"
                disabled={isOptimizingRoute}
              >
                {isOptimizingRoute ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Optimizing Route...
                  </>
                ) : (
                  <>
                    <Route className="h-4 w-4 mr-2" />
                    Optimize Route ({selectedPropertyIds.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Search Bar - Full Width on Mobile */}
        <div className="mb-4">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 w-full mobile-input"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground mobile-touch-target"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {debouncedSearchQuery && (
            <p className="text-xs md:text-sm text-muted-foreground mt-2">
              {total && typeof total === 'number' && total > 0 ? (
                <>Found {total.toLocaleString()} result{total !== 1 ? 's' : ''}</>
              ) : (
                <>Searching for "{debouncedSearchQuery}"...</>
              )}
            </p>
          )}
        </div>

        {/* Geocode Buttons */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleGeocodeAddresses}
            variant="outline"
            size="sm"
            disabled={isGeocoding || isBatchGeocoding}
          >
            {isGeocoding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Geocoding...
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 mr-2" />
                Geocode Selected/Visible
              </>
            )}
          </Button>
          <Button
            onClick={handleBatchGeocodeAll}
            variant="default"
            size="sm"
            disabled={isGeocoding || isBatchGeocoding}
          >
            {isBatchGeocoding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Geocoding All...
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 mr-2" />
                Geocode All Properties
              </>
            )}
          </Button>
          {geocodeStatus && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{geocodeStatus.withCoordinates.toLocaleString()} / {geocodeStatus.total.toLocaleString()} geocoded</span>
              <span>({geocodeStatus.percentageComplete}%)</span>
            </div>
          )}
        </div>

        {/* Advanced Filters - Mobile Optimized */}
        <div className="mt-4">
          <AdvancedFiltersPanel
            filters={advancedFilters}
            onFiltersChange={handleFiltersChange}
            onClear={clearAllFilters}
            statusCounts={statusCounts}
            totalUnfiltered={totalUnfiltered}
            activeFilterCount={activeFilterCount}
          />

          {activeFilterCount > 0 && (
            <div className="mt-3 p-2 bg-secondary/30 rounded-lg">
              <span className="text-xs md:text-sm text-muted-foreground">
                Showing {total && typeof total === 'number' ? total.toLocaleString() : 0} filtered {total === 1 ? 'property' : 'properties'}
              </span>
            </div>
          )}
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
            selectedPropertyIds={selectedPropertyIds}
            onPropertySelect={handlePropertySelect}
            allFilteredPropertyIds={allFilteredPropertyIds}
            propertiesInRoutes={new Set(propertyRouteMap.keys())}
            onDeleteProperty={handleRemovePropertyFromRoute}
          />
          
          {/* Pagination controls - Mobile First */}
          {totalPages > 0 && (
            <div className="mt-6 space-y-3">
              {/* Info Text */}
              <div className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
                Showing {(startItem || 0).toLocaleString()} to {(endItem || 0).toLocaleString()} of {(total || 0).toLocaleString()}
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center md:justify-between gap-2">
                {/* First/Prev - Hidden on mobile, shown on desktop */}
                <div className="hidden md:flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="mobile-touch-target"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="mobile-touch-target"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    <span className="hidden lg:inline">Previous</span>
                  </Button>
                </div>

                {/* Center: Page info and page numbers */}
                <div className="flex items-center gap-2">
                  {/* Mobile: Just Prev/Next with page indicator */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="md:hidden mobile-touch-target"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <span className="text-sm font-medium px-3 py-1 bg-secondary/30 rounded min-w-[100px] text-center">
                    Page {page} of {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="md:hidden mobile-touch-target"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  {/* Desktop: Page number buttons */}
                  <div className="hidden md:flex items-center gap-1">
                    {getPageNumbers(page, totalPages).map((pageNum, index) => {
                      if (pageNum === '...') {
                        return (
                          <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">
                            ...
                          </span>
                        );
                      }
                      const pageNumber = pageNum as number;
                      return (
                        <Button
                          key={pageNumber}
                          variant={pageNumber === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(pageNumber)}
                          className={pageNumber === page ? "" : "min-w-[2.5rem]"}
                        >
                          {pageNumber}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Next/Last - Hidden on mobile, shown on desktop */}
                <div className="hidden md:flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="mobile-touch-target"
                  >
                    <span className="hidden lg:inline mr-1">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="mobile-touch-target"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Active Routes Dashboard */}
      <div className="mt-6 bg-card border border-border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Active Routes</h3>
        {isLoadingActiveRoutes ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Loading routes...</span>
          </div>
        ) : Array.isArray(activeRoutes) && activeRoutes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRoutes.map((route: RouteType) => {
              const stopCount = route.records?.length || 0;
              const driverColor = route.driver === 'Luciano' ? 'bg-blue-500' : 'bg-green-500';
              return (
                <div
                  key={route.id}
                  className="p-4 border border-border rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors relative group cursor-pointer"
                  onClick={() => handleViewRoute(route)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={cn('w-3 h-3 rounded-full', driverColor)} />
                        <h4 className="font-semibold text-sm">{route.driver}</h4>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoute(route.id);
                      }}
                      disabled={deletingRoute === route.id}
                    >
                      {deletingRoute === route.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {new Date(route.createdAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No active routes</p>
            <p className="text-xs mt-1">Create a route to get started</p>
          </div>
        )}
      </div>

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
      
      {/* Route Map Modal */}
          {optimizedRoutes && (
            <RouteMap
              routes={optimizedRoutes.routes}
              numVehicles={numVehicles}
              totalDistance={optimizedRoutes.totalDistance}
              isOpen={routeMapOpen}
              onClose={() => {
                setRouteMapOpen(false);
                setOptimizedRoutes(null);
              }}
              recordIds={Array.from(selectedPropertyIds)}
              routeType="PROPERTY"
              onRouteSaved={() => {
                // Reload active routes after route is saved
                // This will update propertiesInRoutes based on actual saved routes
                loadActiveRoutes();
              }}
            />
          )}

      {/* Area Selector Map */}
      <AreaSelectorMap
        isOpen={areaSelectorOpen}
        onClose={() => setAreaSelectorOpen(false)}
        onOptimize={async ({ startingPoint, area, selectedProperties }) => {
          console.log('[onOptimize] Called from AreaSelectorMap:', {
            selectedPropertiesCount: selectedProperties.length,
            startingPointId: startingPoint.property.id,
            areaType: area.polygon ? 'polygon' : area.radius !== undefined ? 'circle' : 'rectangle'
          });

          // Find the property that matches the starting point (use filteredProperties to match what's shown on map)
          const depotProperty = filteredProperties.find(p => p.id === startingPoint.property.id);
          
          if (!depotProperty) {
            toast({
              title: "Error",
              description: "Starting point property not found.",
              variant: "destructive",
            });
            return;
          }

          // Helper functions to check if point is within area (matching AreaSelectorMap logic)
          const isPointInBounds = (point: { lat: number; lng: number }, bounds: { north: number; south: number; east: number; west: number }): boolean => {
            return point.lat >= bounds.south &&
                   point.lat <= bounds.north &&
                   point.lng >= bounds.west &&
                   point.lng <= bounds.east;
          };

          const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const R = 6371; // Earth's radius in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = 
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
          };

          const isPointInCircle = (point: { lat: number; lng: number }, center: { lat: number; lng: number }, radiusKm: number): boolean => {
            const distance = calculateDistance(point.lat, point.lng, center.lat, center.lng);
            return distance <= radiusKm;
          };

          const isPointInPolygon = (point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean => {
            if (polygon.length < 3) return false;
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
              const xi = polygon[i].lng;
              const yi = polygon[i].lat;
              const xj = polygon[j].lng;
              const yj = polygon[j].lat;
              const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
                (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            return inside;
          };

          console.log('[onOptimize] selectedProperties from AreaSelectorMap:', {
            count: selectedProperties.length,
            firstFew: selectedProperties.slice(0, 3).map(p => ({ id: p.id, lat: p.latitude, lng: p.longitude }))
          });

          // Convert selectedProperties (PropertyLike) to full Property objects from filteredProperties
          // IMPORTANT: selectedProperties from AreaSelectorMap is ALREADY limited to 26 (1 depot + 25 properties)
          // and has already been validated against the area. We should trust this limit.
          // Use filteredProperties to match what's shown on the map
          const propertyMap = new Map(filteredProperties.map(p => [p.id, p]));
          const propertiesToOptimize: Property[] = [];
          
          console.log('[onOptimize] Converting selectedProperties from AreaSelectorMap:', {
            selectedPropertiesCount: selectedProperties.length,
            expectedMax: 26
          });
          
          // Convert to Property objects - trust that AreaSelectorMap already limited and validated
          for (const sp of selectedProperties) {
            const fullProperty = propertyMap.get(sp.id);
            if (!fullProperty || fullProperty.latitude == null || fullProperty.longitude == null) {
              console.warn(`[Route Optimization] Property ${sp.id} not found or missing coordinates, skipping`);
              continue;
            }
            propertiesToOptimize.push(fullProperty);
          }

          console.log('[Route Optimization] Converted to Property objects:', {
            selectedPropertiesCount: selectedProperties.length,
            convertedCount: propertiesToOptimize.length
          });

          if (propertiesToOptimize.length === 0) {
            toast({
              title: "Error",
              description: "No valid properties found. Please try selecting the area again.",
              variant: "destructive",
            });
            return;
          }

          // Ensure depot is included and is first
          const depotIndex = propertiesToOptimize.findIndex(p => p.id === depotProperty.id);
          if (depotIndex > 0) {
            // Move depot to first position
            propertiesToOptimize.splice(depotIndex, 1);
            propertiesToOptimize.unshift(depotProperty);
          } else if (depotIndex === -1) {
            // Depot not in list, add it first
            propertiesToOptimize.unshift(depotProperty);
          }

          // CRITICAL: Enforce 25 property limit (1 depot + 24 properties to visit)
          // selectedProperties from AreaSelectorMap should already be limited, but double-check here
          // The backend will exclude the depot from visitable stops, so we need 25 total
          // After backend excludes depot, we'll have exactly 24 properties to visit
          if (propertiesToOptimize.length > 25) {
            console.error('[onOptimize] ERROR: More than 25 properties! Force limiting to 25 (1 depot + 24 properties).');
            // Keep depot first, then take 24 closest
            const depot = propertiesToOptimize[0]?.id === depotProperty.id ? propertiesToOptimize[0] : propertiesToOptimize.find(p => p.id === depotProperty.id) || depotProperty;
            const others = propertiesToOptimize.filter(p => p.id !== depotProperty.id).slice(0, 24);
            propertiesToOptimize.length = 0; // Clear array
            propertiesToOptimize.push(depot, ...others); // 25 total: 1 depot + 24 properties
            console.error('[onOptimize] Force-limited to:', propertiesToOptimize.length);
          }
          
          // Final hard limit: slice to exactly 25
          if (propertiesToOptimize.length > 25) {
            propertiesToOptimize.splice(25);
          }

          // IMPORTANT: Keep the depot in the properties array
          // The backend needs the depot in the array to identify it via depotPropertyId
          // The backend will then exclude it from the visitable stops list
          // This ensures the depot appears as stop 0/START, not as a visitable stop
          
          // Count properties excluding depot for validation
          const propertiesWithoutDepot = propertiesToOptimize.filter(p => p.id !== depotProperty.id);
          
          console.log('[Route Optimization] Final properties to send to backend:', {
            totalIncludingDepot: propertiesToOptimize.length,
            propertiesToVisitExcludingDepot: propertiesWithoutDepot.length,
            depotId: depotProperty.id,
            depotAddress: depotProperty.propertyAddress,
            propertyIds: propertiesWithoutDepot.map(p => p.id).slice(0, 5).join(',') + (propertiesWithoutDepot.length > 5 ? `... (+${propertiesWithoutDepot.length - 5} more)` : ''),
            maxAllowed: 25,
            note: 'Depot is included in array so backend can find it, but backend will exclude it from visitable stops'
          });

          if (propertiesWithoutDepot.length === 0) {
            toast({
              title: "Error",
              description: "No valid properties found to optimize (excluding starting point). Please try again.",
              variant: "destructive",
            });
            return;
          }

          // Auto-select all selected properties (for UI consistency)
          const propertyIds = new Set(propertiesToOptimize.map(p => p.id));
          setSelectedPropertyIds(propertyIds);
          
          // Create route with depot, passing properties INCLUDING the depot
          // The backend will exclude the depot from visitable stops, so it won't appear as a stop
          await handleCreateRouteWithDepot(depotProperty, startingPoint.pinLocation, propertiesToOptimize);
        }}
        properties={filteredProperties.filter(p => {
          // Must have coordinates
          if (p.latitude == null || p.longitude == null) return false;
          // Exclude properties that are in routes OR marked as visited
          const isVisitedInRoute = propertiesInRoutes.has(p.id);
          const isVisitedOnProperty = p.visited === true;
          return !isVisitedInRoute && !isVisitedOnProperty;
        }).map(p => ({
          id: p.id,
          latitude: p.latitude!,
          longitude: p.longitude!,
          propertyAddress: p.propertyAddress || '',
          address: p.propertyAddress || '',
          ownerName: p.ownerName || '',
          accountNumber: p.accountNumber || ''
        }))}
        numVehicles={numVehicles}
      />

      {/* Route Details Modal - Matching pre-foreclosure design */}
      <Dialog open={routeDetailsOpen} onOpenChange={setRouteDetailsOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RouteIcon className="h-5 w-5" />
              Route Details
            </DialogTitle>
            <DialogDescription>
              {viewRoute ? (
                <>
                  Driver: {viewRoute.driver} • {(viewRoute.records || []).filter(rr => rr && rr.record).length} stops • 
                  {viewRoute.routeData?.totalDistance ? ` ${viewRoute.routeData.totalDistance.toFixed(2)} km` : ''}
                </>
              ) : (
                'Loading route details...'
              )}
            </DialogDescription>
          </DialogHeader>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={(() => {
                if (!viewRoute) return [];
                const validRecords = (viewRoute.records || []).filter(rr => rr && rr.record);
                return validRecords.sort((a, b) => a.orderIndex - b.orderIndex).map(rr => rr.id);
              })()}
              strategy={verticalListSortingStrategy}
            >
              {!viewRoute ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Route Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary/30 rounded-lg">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Driver</div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${viewRoute.driver === 'Luciano' ? 'bg-blue-500' : 'bg-green-500'}`} />
                        <span className="font-semibold">{viewRoute.driver}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Status</div>
                      <div className="font-semibold">{viewRoute.status}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Created</div>
                      <div className="font-semibold">
                        {viewRoute.createdAt ? new Date(viewRoute.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                    {viewRoute.routeData?.totalDistance && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Distance</div>
                        <div className="font-semibold">{viewRoute.routeData.totalDistance.toFixed(2)} km</div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (viewRoute?.routeData) {
                          // Extract property IDs from the route (current records in the route)
                          const routePropertyIds = (viewRoute.records || [])
                            .map((rr: any) => {
                              const propId = rr.record?.id;
                              return propId;
                            })
                            .filter(Boolean);
                          
                          // Ensure we have property IDs
                          if (routePropertyIds.length === 0) {
                            toast({
                              title: "Error",
                              description: "No properties found in route. Cannot display route map.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // Get current route records sorted by orderIndex
                          const sortedRecords = [...(viewRoute.records || [])].sort((a, b) => a.orderIndex - b.orderIndex);
                          
                          // Create a map of property IDs to route records for quick lookup
                          const recordMap = new Map<string, any>();
                          sortedRecords.forEach(rr => {
                            const propId = rr.record?.id;
                            if (propId) {
                              recordMap.set(propId, rr);
                            }
                          });
                          
                          // Rebuild waypoints in the correct order based on current orderIndex
                          const allWaypoints: any[] = [];
                          sortedRecords.forEach(rr => {
                            const propId = rr.record?.id;
                            if (!propId) return;
                            
                            // Find matching waypoint in original routeData
                            const matchingWaypoint = viewRoute.routeData?.routes?.[0]?.waypoints?.find((wp: any) => {
                              const wpId = wp.id || wp.propertyId || wp.originalId;
                              return wpId === propId || (wpId === 'depot' && rr.isDepot);
                            });
                            
                            if (matchingWaypoint) {
                              allWaypoints.push({
                                ...matchingWaypoint,
                                id: rr.isDepot ? 'depot' : propId,
                                isDepot: rr.isDepot,
                                order: rr.orderIndex
                              });
                            }
                          });
                          
                          // Rebuild routeData with reordered waypoints
                          const filteredRouteData = {
                            ...viewRoute.routeData,
                            routes: [{
                              ...viewRoute.routeData.routes?.[0],
                              waypoints: allWaypoints,
                              distance: viewRoute.routeData.routes?.[0]?.distance || 0
                            }]
                          };
                          
                          // Recalculate total distance
                          filteredRouteData.totalDistance = filteredRouteData.routes.reduce(
                            (sum: number, route: any) => sum + (route.distance || 0), 
                            0
                          );
                          
                          // Set optimizedPropertyIds BEFORE setting optimizedRoutes to ensure it's available when RouteMap opens
                          setSelectedPropertyIds(new Set(routePropertyIds));
                          setOptimizedRoutes(filteredRouteData);
                          setRouteMapOpen(true);
                        }
                      }}
                    >
                      <RouteIcon className="h-4 w-4 mr-2" />
                      View Route Map
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteRoute(viewRoute.id)}
                      disabled={deletingRoute === viewRoute.id}
                    >
                      {deletingRoute === viewRoute.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Route
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Route Records List */}
                  <div>
                    {(() => {
                      const validRecords = (viewRoute.records || []).filter(rr => rr && rr.record);
                      const sortedRecords = validRecords.sort((a, b) => a.orderIndex - b.orderIndex);
                      
                      return (
                        <>
                          <h3 className="text-lg font-semibold mb-3">Route Stops ({validRecords.length})</h3>

                          {sortedRecords.length === 0 ? (
                            <div className="px-4 py-8 text-center text-muted-foreground border border-border rounded-lg">
                              No properties in this route.
                            </div>
                          ) : (
                            <>
                              {/* Mobile: card list */}
                              <div className="md:hidden space-y-2">
                                {sortedRecords.map((routeRecord, index) => {
                                  const record = routeRecord.record;
                                  if (!record) return null;
                                  const propertyId = record.id;
                                  if (!propertyId) return null;
                                  return (
                                    <SortableRouteRow
                                      key={routeRecord.id}
                                      routeRecord={routeRecord}
                                      index={index}
                                      viewRoute={viewRoute}
                                      propertyId={propertyId}
                                      record={record}
                                      removingRecordId={removingRecordId}
                                      reorderingRecordId={reorderingRecordId}
                                      handleRemoveRecordFromRoute={handleRemoveRecordFromRoute}
                                      handleMarkVisited={handleMarkVisited}
                                      handleViewRecordDetails={handleViewRecordDetails}
                                      markingVisited={markingVisited}
                                      handleDealStageChange={handleDealStageChange}
                                    />
                                  );
                                })}
                              </div>

                              {/* Desktop: table */}
                              <div className="hidden md:block border border-border rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                  <table className="w-full">
                                    <thead className="bg-secondary/50">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-24">Order</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Address</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-40">Deal Stage</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-32">Status</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-24">Details</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-12"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sortedRecords.map((routeRecord, index) => {
                                        const record = routeRecord.record;
                                        if (!record) return null;
                                        const propertyId = record.id;
                                        if (!propertyId) return null;
                                        return (
                                          <SortableRouteRow
                                            key={routeRecord.id}
                                            routeRecord={routeRecord}
                                            index={index}
                                            viewRoute={viewRoute}
                                            propertyId={propertyId}
                                            record={record}
                                            removingRecordId={removingRecordId}
                                            reorderingRecordId={reorderingRecordId}
                                            handleRemoveRecordFromRoute={handleRemoveRecordFromRoute}
                                            handleMarkVisited={handleMarkVisited}
                                            handleViewRecordDetails={handleViewRecordDetails}
                                            markingVisited={markingVisited}
                                            handleDealStageChange={handleDealStageChange}
                                          />
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </SortableContext>
          </DndContext>
        </DialogContent>
      </Dialog>

      {/* Geocoding Progress Modal */}
      <Dialog open={geocodeOpen} onOpenChange={(open) => {
        if (!open && isGeocoding) {
          // User clicked X or pressed Escape while geocoding
          setGeocodeCancelled(true);
        }
        setGeocodeOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Geocoding Addresses</DialogTitle>
            <DialogDescription>
              {geocodeCancelled ? 'Cancelling...' : 'Converting addresses to coordinates...'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">
                Progress: {geocodeProgress.current} / {geocodeProgress.total}
              </span>
            </div>
            {geocodeProgress.address && (
              <div className="text-xs text-muted-foreground">
                Current: {geocodeProgress.address}
              </div>
            )}
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{
                  width: `${geocodeProgress.total > 0 ? (geocodeProgress.current / geocodeProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            {isGeocoding && (
              <Button
                onClick={() => setGeocodeCancelled(true)}
                variant="destructive"
                size="sm"
                disabled={geocodeCancelled}
              >
                {geocodeCancelled ? 'Stopping...' : 'Stop Geocoding'}
              </Button>
            )}
            {!isGeocoding && geocodeResults.size > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold text-sm mb-2">Results:</h4>
                <p className="text-sm text-muted-foreground">
                  Successfully geocoded {geocodeResults.size} properties
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Geocoding Dialog */}
      <Dialog open={batchGeocodeOpen} onOpenChange={(open) => {
        if (!open && isBatchGeocoding) {
          // Don't allow closing while geocoding
          return;
        }
        setBatchGeocodeOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Geocoding All Properties</DialogTitle>
            <DialogDescription>
              {isBatchGeocoding ? 'Geocoding all properties in batches...' : 'Batch geocoding complete'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {geocodeStatus && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Total Properties:</span>
                  <span className="font-semibold">{geocodeStatus.total.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>With Coordinates:</span>
                  <span className="font-semibold text-green-500">{geocodeStatus.withCoordinates.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Without Coordinates:</span>
                  <span className="font-semibold text-yellow-500">{geocodeStatus.withoutCoordinates.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Completion:</span>
                  <span className="font-semibold">{geocodeStatus.percentageComplete}%</span>
                </div>
              </div>
            )}
            
            {isBatchGeocoding && (
              <>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm">
                    Processing batch: {batchGeocodeProgress.processed.toLocaleString()} / {batchGeocodeProgress.total.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${batchGeocodeProgress.total > 0 ? (batchGeocodeProgress.processed / batchGeocodeProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Successful</div>
                    <div className="font-semibold text-green-500">{batchGeocodeProgress.successful.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Errors</div>
                    <div className="font-semibold text-red-500">{batchGeocodeProgress.errors.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Skipped</div>
                    <div className="font-semibold text-yellow-500">{batchGeocodeProgress.skipped.toLocaleString()}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This process may take several hours for 33k+ properties. You can close this dialog and it will continue in the background.
                </p>
              </>
            )}
            
            {!isBatchGeocoding && batchGeocodeProgress.processed > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold">Batch Complete!</div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Successful</div>
                    <div className="font-semibold text-green-500">{batchGeocodeProgress.successful.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Errors</div>
                    <div className="font-semibold text-red-500">{batchGeocodeProgress.errors.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Skipped</div>
                    <div className="font-semibold text-yellow-500">{batchGeocodeProgress.skipped.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
