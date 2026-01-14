import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2, AlertCircle, Upload, Filter, Search, X, FileText, Calendar, Trash2, Eye, Send, ExternalLink, MapPin, CheckCircle, Target, Route as RouteIcon, Check, RotateCcw, GripVertical, Phone, Star } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { usePreForeclosures, useUpdatePreForeclosure, useUploadPreForeclosureFile, useDeletePreForeclosures } from '@/hooks/usePreForeclosure';
import { PreForeclosureRecord, PreForeclosureType, PreForeclosureStatus } from '@/types/property';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { solveVRP, getActiveRoutes, markPreForeclosureVisited, deleteRoute, removeRecordFromRoute, reorderRecordInRoute } from '@/lib/api';

// Local type alias to avoid runtime reference issues
type RouteType = {
  id: string;
  driver: 'Luciano' | 'Raul';
  status: 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  routeData: any;
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
      document_number?: string;
      documentNumber?: string;
      address: string;
      city: string;
      zip: string;
      latitude?: number;
      longitude?: number;
      visited: boolean;
      visited_at?: string;
      visited_by?: string;
      visitedAt?: string;
      visitedBy?: string;
    };
  }>;
};
import { RouteMap } from '@/components/routing/RouteMap';
import { AreaSelectorMap } from '@/components/routing/AreaSelectorMap';
import { AdvancedFiltersPanel, PreForeclosureAdvancedFilters } from './AdvancedFilters';

// Sortable Row Component
function SortableRow({ 
  routeRecord, 
  index, 
  viewRoute, 
  documentNumber, 
  record, 
  removingRecordId, 
  reorderingRecordId,
  handleRemoveRecordFromRoute,
  handleMarkVisited,
  handleViewRecordDetails,
  markingVisited,
  handleStatusChange,
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
    // Only allow dragging from the drag handle, not the entire row
    strategy: undefined,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-t border-border hover:bg-secondary/30 ${
        routeRecord.isDepot ? 'bg-primary/10' : ''
      } ${isDragging ? 'bg-secondary/50' : ''}`}
      // Don't attach drag listeners to the entire row - only to the drag handle
    >
      <td className="px-4 py-2 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {routeRecord.isDepot ? (
            <>
              <Badge variant="default" className="bg-primary">Depot</Badge>
              <Button
                size="sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveRecordFromRoute(viewRoute.id, routeRecord.id, documentNumber);
                }}
                disabled={removingRecordId === routeRecord.id}
                className="h-9 w-9 p-0 bg-red-600 hover:bg-red-700 text-white border-2 border-red-500 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                title="Remove from route"
              >
                {removingRecordId === routeRecord.id ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <X className="h-5 w-5" />
                )}
              </Button>
            </>
          ) : (
            <>
              <span className="font-medium">{routeRecord.orderIndex}</span>
              <Button
                size="sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveRecordFromRoute(viewRoute.id, routeRecord.id, documentNumber);
                }}
                disabled={removingRecordId === routeRecord.id}
                className="h-9 w-9 p-0 bg-red-600 hover:bg-red-700 text-white border-2 border-red-500 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                title="Remove from route"
              >
                {removingRecordId === routeRecord.id ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <X className="h-5 w-5" />
                )}
              </Button>
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-sm font-mono hidden">{documentNumber}</td>
      <td className="px-4 py-2 text-sm">{record.address}</td>
      <td className="px-4 py-2 text-sm hidden">{record.city}</td>
      <td className="px-4 py-2 text-sm hidden">{record.zip}</td>
      <td className="px-4 py-2 text-sm" style={{ position: 'relative', zIndex: 1 }}>
        {documentNumber && record && handleStatusChange && (
          <Select
            value={(record as any).internal_status || (record as any).internalStatus || 'New'}
            onValueChange={async (value) => {
              console.log('Select onValueChange called with:', value, 'for document:', documentNumber);
              if (handleStatusChange) {
                try {
                  // Create a proper PreForeclosureRecord object for handleStatusChange
                  const fullRecord: PreForeclosureRecord = {
                    document_number: documentNumber,
                    type: (record as any).type || 'Mortgage',
                    address: (record as any).address || '',
                    city: (record as any).city || '',
                    zip: (record as any).zip || '',
                    filing_month: (record as any).filing_month || (record as any).filingMonth || '',
                    county: (record as any).county || 'Bexar',
                    internal_status: value as PreForeclosureStatus,
                    inactive: (record as any).inactive || false,
                    first_seen_month: (record as any).first_seen_month || (record as any).firstSeenMonth || '',
                    last_seen_month: (record as any).last_seen_month || (record as any).lastSeenMonth || '',
                    created_at: (record as any).created_at || (record as any).createdAt || new Date().toISOString(),
                    updated_at: (record as any).updated_at || (record as any).updatedAt || new Date().toISOString(),
                    ...(record as any),
                  };
                  console.log('Calling handleStatusChange with:', fullRecord, value);
                  await handleStatusChange(fullRecord, value as PreForeclosureStatus);
                  console.log('handleStatusChange completed successfully');
                } catch (error) {
                  console.error('Error in onValueChange:', error);
                }
              } else {
                console.error('handleStatusChange is not available');
              }
            }}
          >
            <SelectTrigger 
              className="h-8 text-xs w-full cursor-pointer hover:bg-secondary/50 border-border"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Contact Attempted">Contact Attempted</SelectItem>
              <SelectItem value="Monitoring">Monitoring</SelectItem>
              <SelectItem value="Dead">Dead</SelectItem>
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="px-4 py-2 text-sm">
        {documentNumber && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              if (record.visited) {
                handleMarkVisited(documentNumber, viewRoute.driver, false);
              } else {
                handleMarkVisited(documentNumber, viewRoute.driver, true);
              }
            }}
            disabled={markingVisited === documentNumber}
            className={`h-7 text-xs w-full ${
              record.visited 
                ? 'bg-green-500/20 text-green-600 border-green-500 hover:bg-green-500/30' 
                : ''
            }`}
          >
            {markingVisited === documentNumber ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {record.visited ? 'Updating...' : 'Marking...'}
              </>
            ) : (
              record.visited ? 'Visited' : 'Pending'
            )}
          </Button>
        )}
      </td>
      <td className="px-4 py-2 text-sm">
        {documentNumber && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleViewRecordDetails(documentNumber);
            }}
            className="h-7 text-xs"
          >
            <Eye className="h-3 w-3 mr-1" />
            Details
          </Button>
        )}
      </td>
      <td className="px-4 py-2 text-sm">
        {/* Drag Handle - Far Right */}
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-secondary/50 rounded flex items-center justify-center"
          title="Drag to reorder"
          onPointerDown={(e) => {
            // Only allow dragging from this handle
            e.stopPropagation();
          }}
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
      </td>
    </tr>
  );
}

export function PreForeclosureView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState<PreForeclosureAdvancedFilters>({
    type: 'all',
    city: 'all',
    zip: 'all',
    month: 'all',
    status: 'all',
    needsFollowUp: false,
    hasVisited: false,
    hasNotes: false,
    hasPhoneNumbers: false,
    hasTask: false,
  });
  const [selectedRecord, setSelectedRecord] = useState<PreForeclosureRecord | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PreForeclosureRecord | null>(null);
  const [viewRecord, setViewRecord] = useState<PreForeclosureRecord | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data: records = [], isLoading, error } = usePreForeclosures();
  const updateMutation = useUpdatePreForeclosure();
  const uploadMutation = useUploadPreForeclosureFile();
  const deleteMutation = useDeletePreForeclosures();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<'view' | 'send' | 'external'>('view');
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [editingDateField, setEditingDateField] = useState<{ documentNumber: string; field: 'last_action_date' | 'next_follow_up_date' } | null>(null);
  const [numVehicles, setNumVehicles] = useState<1 | 2>(1);
  const [isOptimizingRoute, setIsOptimizingRoute] = useState(false);
  const [routeMapOpen, setRouteMapOpen] = useState(false);
  const [optimizedRoutes, setOptimizedRoutes] = useState<any>(null);
  const [optimizedRecordIds, setOptimizedRecordIds] = useState<string[]>([]); // Track record IDs for current optimized routes
  const [areaSelectorOpen, setAreaSelectorOpen] = useState(false);
  const [customDepot, setCustomDepot] = useState<{ lat: number; lng: number } | null>(null);
  const [customDepotRecordId, setCustomDepotRecordId] = useState<string | null>(null);
  const [recordsInRoutes, setRecordsInRoutes] = useState<Set<string>>(new Set());
  const [depotRecordIds, setDepotRecordIds] = useState<Set<string>>(new Set()); // Track which properties are depots (starting points)
  const [activeRoutes, setActiveRoutes] = useState<RouteType[]>([]);
  const [isLoadingActiveRoutes, setIsLoadingActiveRoutes] = useState(false);
  const [viewRoute, setViewRoute] = useState<RouteType | null>(null);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const [markingVisited, setMarkingVisited] = useState<string | null>(null);
  const [deletingRoute, setDeletingRoute] = useState<string | null>(null);
  const [removingRecordId, setRemovingRecordId] = useState<string | null>(null);
  const [reorderingRecordId, setReorderingRecordId] = useState<string | null>(null);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get unique values for filters
  const uniqueCities = useMemo(() => {
    const cities = new Set(records.map(r => r.city).filter(Boolean));
    return Array.from(cities).sort();
  }, [records]);

  const uniqueZips = useMemo(() => {
    const zips = new Set(records.map(r => r.zip).filter(Boolean));
    return Array.from(zips).sort();
  }, [records]);

  const uniqueMonths = useMemo(() => {
    const months = new Set(records.map(r => r.filing_month).filter(Boolean));
    return Array.from(months).sort();
  }, [records]);

  // Filter records
  const filteredRecords = useMemo(() => {
    let filtered = records.filter(r => !r.inactive);

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.document_number.toLowerCase().includes(query) ||
        r.address.toLowerCase().includes(query) ||
        r.city.toLowerCase().includes(query) ||
        r.zip.includes(query)
      );
    }

    // Type filter
    if (advancedFilters.type !== 'all') {
      filtered = filtered.filter(r => r.type === advancedFilters.type);
    }

    // City filter
    if (advancedFilters.city !== 'all') {
      filtered = filtered.filter(r => r.city === advancedFilters.city);
    }

    // ZIP filter
    if (advancedFilters.zip !== 'all') {
      filtered = filtered.filter(r => r.zip === advancedFilters.zip);
    }

    // Month filter
    if (advancedFilters.month !== 'all') {
      filtered = filtered.filter(r => r.filing_month === advancedFilters.month);
    }

    // Status filter
    if (advancedFilters.status !== 'all') {
      filtered = filtered.filter(r => r.internal_status === advancedFilters.status);
    }

    // Needs follow-up filter
    if (advancedFilters.needsFollowUp) {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(r => 
        r.next_follow_up_date && new Date(r.next_follow_up_date).toISOString().split('T')[0] <= today
      );
    }

    // Has visited filter
    if (advancedFilters.hasVisited) {
      filtered = filtered.filter(r => r.visited === true);
    }

    // Has notes filter
    if (advancedFilters.hasNotes) {
      filtered = filtered.filter(r => r.notes && r.notes.trim().length > 0);
    }

    // Has phone numbers filter
    if (advancedFilters.hasPhoneNumbers) {
      filtered = filtered.filter(r => {
        const phones = Array.isArray(r.phoneNumbers) ? r.phoneNumbers : [];
        return phones.length > 0 && phones.some(phone => phone && phone.trim().length > 0);
      });
    }

    // Has task filter
    if (advancedFilters.hasTask) {
      filtered = filtered.filter(r => {
        // A record has a task if it has actionType and dueTime
        return !!(r.actionType && r.dueTime);
      });
    }

    return filtered;
  }, [records, searchQuery, advancedFilters]);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.type !== 'all') count++;
    if (advancedFilters.city !== 'all') count++;
    if (advancedFilters.zip !== 'all') count++;
    if (advancedFilters.month !== 'all') count++;
    if (advancedFilters.status !== 'all') count++;
    if (advancedFilters.needsFollowUp) count++;
    if (advancedFilters.hasVisited) count++;
    if (advancedFilters.hasNotes) count++;
    if (advancedFilters.hasPhoneNumbers) count++;
    if (advancedFilters.hasTask) count++;
    return count;
  }, [advancedFilters]);

  // Handle filter changes
  const handleFiltersChange = (filters: PreForeclosureAdvancedFilters) => {
    setAdvancedFilters(filters);
  };

  // Handle clear all filters
  const handleClearFilters = () => {
    setAdvancedFilters({
      type: 'all',
      city: 'all',
      zip: 'all',
      month: 'all',
      status: 'all',
      needsFollowUp: false,
      hasVisited: false,
      hasNotes: false,
      hasPhoneNumbers: false,
      hasTask: false,
    });
    setSearchQuery('');
  };

  const handleStatusChange = async (record: PreForeclosureRecord, newStatus: PreForeclosureStatus) => {
    try {
      await updateMutation.mutateAsync({
        document_number: record.document_number,
        internal_status: newStatus,
      });
      
      // Update local record state
      record.internal_status = newStatus;
      
      // If we're viewing a route, update the route record as well
      if (viewRoute) {
        const routeRecord = viewRoute.records?.find(rr => {
          const docNum = rr.record?.document_number || rr.record?.documentNumber;
          return docNum === record.document_number;
        });
        if (routeRecord && routeRecord.record) {
          // Update the record's internal_status (handle both camelCase and snake_case)
          (routeRecord.record as any).internal_status = newStatus;
          // Update viewRoute to trigger re-render
          setViewRoute({ ...viewRoute });
        }
      }
      
      toast({
        title: 'Status Updated',
        description: `Status changed to "${newStatus}" for document ${record.document_number}`,
      });
      
      // Invalidate query to refresh the table
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const handleNotesClick = (record: PreForeclosureRecord) => {
    setEditingRecord(record);
    setNotesOpen(true);
  };

  const handleSaveNotes = async () => {
    if (!editingRecord) return;
    
    await updateMutation.mutateAsync({
      document_number: editingRecord.document_number,
      notes: editingRecord.notes,
      last_action_date: editingRecord.last_action_date,
      next_follow_up_date: editingRecord.next_follow_up_date,
    });
    
    setNotesOpen(false);
    setEditingRecord(null);
  };

  // Actions & Tasks state for view modal
  const [actionType, setActionType] = useState<'call' | 'text' | 'mail' | 'driveby' | ''>('');
  const [priority, setPriority] = useState<'high' | 'med' | 'low'>('med');
  const [dueDateTime, setDueDateTime] = useState<Date | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<'Luciano' | 'Raul' | ''>('');
  const [savingAction, setSavingAction] = useState(false);

  // Initialize action state when view record changes
  useEffect(() => {
    if (viewRecord) {
      setActionType(viewRecord.actionType || '');
      setPriority(viewRecord.priority || 'med');
      setDueDateTime(viewRecord.dueTime ? new Date(viewRecord.dueTime) : undefined);
      setAssignedTo(viewRecord.assignedTo || '');
    }
  }, [viewRecord]);

  const handleRecordSelect = (documentNumber: string, selected: boolean) => {
    try {
      if (!documentNumber) {
        console.warn('[PreForeclosure] handleRecordSelect called with invalid documentNumber');
        return;
      }
    setSelectedRecordIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(documentNumber);
      } else {
        newSet.delete(documentNumber);
      }
      return newSet;
    });
    } catch (error) {
      console.error('[PreForeclosure] Error in handleRecordSelect:', error);
    }
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
    // Filter records within the selected area (exclude visited and in-progress)
    const recordsInArea = filteredRecords.filter(r => {
      if (!r || !r.document_number) return false;
      if (!r.latitude || !r.longitude) return false;
      if (r.visited === true) return false; // Skip visited records
      if (recordsInRoutes && recordsInRoutes.has(r.document_number)) return false; // Skip records already in routes (in progress)
      
      // If polygon is provided, use point-in-polygon check
      if (bounds.polygon && bounds.polygon.length >= 3) {
        return isPointInPolygon({ lat: r.latitude, lng: r.longitude }, bounds.polygon);
      }
      
      // For circle with radius, check distance from center
      if (bounds.center && bounds.radius) {
        const distance = Math.sqrt(
          Math.pow(r.latitude - bounds.center.lat, 2) + 
          Math.pow(r.longitude - bounds.center.lng, 2)
        ) * 111; // Convert degrees to km
        return distance <= bounds.radius;
      }
      
      // Check if record is within rectangular bounds
      return r.latitude >= bounds.south &&
             r.latitude <= bounds.north &&
             r.longitude >= bounds.west &&
             r.longitude <= bounds.east;
    });

    // Count excluded records for user feedback
    const allRecordsInArea = filteredRecords.filter(r => {
      if (!r.latitude || !r.longitude) return false;
      if (bounds.polygon && bounds.polygon.length >= 3) {
        return isPointInPolygon({ lat: r.latitude, lng: r.longitude }, bounds.polygon);
      }
      if (bounds.center && bounds.radius) {
        const distance = Math.sqrt(
          Math.pow(r.latitude - bounds.center.lat, 2) + 
          Math.pow(r.longitude - bounds.center.lng, 2)
        ) * 111;
        return distance <= bounds.radius;
      }
      return r.latitude >= bounds.south &&
             r.latitude <= bounds.north &&
             r.longitude >= bounds.west &&
             r.longitude <= bounds.east;
    });
    const visitedCount = allRecordsInArea.filter(r => r && r.visited === true).length;
    const inProgressCount = allRecordsInArea.filter(r => r && r.document_number && recordsInRoutes && recordsInRoutes.has(r.document_number)).length;

    if (recordsInArea.length === 0) {
      let message = "No available records found within the selected area.";
      if (visitedCount > 0 || inProgressCount > 0) {
        message += ` (${visitedCount} visited, ${inProgressCount} in progress excluded)`;
      }
      toast({
        title: "No records in area",
        description: message + " Try selecting a different area.",
        variant: "destructive",
      });
      return;
    }

    // Inform user if some records were excluded
    if (visitedCount > 0 || inProgressCount > 0) {
      toast({
        title: "Some records excluded",
        description: `Found ${recordsInArea.length} available records. ${visitedCount} visited and ${inProgressCount} in-progress records were excluded.`,
      });
    }

    if (recordsInArea.length > 500) {
      toast({
        title: "Too many records",
        description: `Found ${recordsInArea.length} records in the selected area. Maximum 500 allowed. Please select a smaller area.`,
        variant: "destructive",
      });
      return;
    }

    // Auto-select records in area, but preserve custom starting point if set
    const areaRecordIds = new Set(recordsInArea.map(r => r.document_number));
    
    // If a custom starting point was set, ensure it's included in the selection
    if (customDepotRecordId) {
      areaRecordIds.add(customDepotRecordId);
    }
    
    setSelectedRecordIds(areaRecordIds);
    
    // Automatically create route with custom starting point if it was set
    if (customDepotRecordId) {
      const depotRecord = records.find(r => r.document_number === customDepotRecordId);
      if (depotRecord && customDepot) {
        await handleCreateRouteWithDepot(depotRecord, customDepot);
        return;
      }
    }
    
    toast({
      title: "Area Selected",
      description: `Found ${recordsInArea.length} records in the selected area. ${customDepotRecordId ? 'Route optimized with custom starting point.' : 'Click "Optimize Route" to continue.'}`,
    });
  };

  const loadActiveRoutes = async () => {
    setIsLoadingActiveRoutes(true);
    try {
      console.log('[PreForeclosure] Loading active routes...');
      const routes = await getActiveRoutes();
      console.log('[PreForeclosure] Loaded active routes:', routes.length, routes);
      setActiveRoutes(routes);
      
      // Update recordsInRoutes based on active routes
      // Also track which properties are depots (starting points)
      const activeRecordIds = new Set<string>();
      const depotIds = new Set<string>();
      routes.forEach(route => {
        route.records?.forEach((rr: any) => {
          // Handle both camelCase and snake_case document number fields
          const docNumber = rr.record?.documentNumber || rr.record?.document_number || rr.documentNumber || rr.document_number;
          if (docNumber) {
            activeRecordIds.add(docNumber);
            // Track depots (starting points)
            if (rr.isDepot === true) {
              depotIds.add(docNumber);
            }
          }
        });
      });
      setRecordsInRoutes(activeRecordIds);
      setDepotRecordIds(depotIds);
    } catch (error) {
      console.error('[PreForeclosure] Error loading active routes:', error);
    } finally {
      setIsLoadingActiveRoutes(false);
    }
  };

  // Load active routes on component mount
  useEffect(() => {
    loadActiveRoutes();
  }, []);

  const handleMarkVisited = async (documentNumber: string, driver: 'Luciano' | 'Raul', visited: boolean = true) => {
    setMarkingVisited(documentNumber);
    try {
      console.log('[PreForeclosure] Updating visited status:', { documentNumber, driver, visited });
      await markPreForeclosureVisited(documentNumber, driver, visited);
      toast({
        title: visited ? 'Record Marked as Visited' : 'Record Unmarked',
        description: `Document ${documentNumber} has been ${visited ? 'marked as visited' : 'set back to pending'}.`,
      });
      // Invalidate pre-foreclosure query to refresh the table
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
      // Reload active routes to refresh the visited status
      await loadActiveRoutes();
      // Update the viewRoute if it's the current route
      if (viewRoute) {
        const updatedRoutes = await getActiveRoutes();
        const updatedRoute = updatedRoutes.find(r => r.id === viewRoute.id);
        if (updatedRoute) {
          setViewRoute(updatedRoute);
        }
      }
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

  const handleViewRecordDetails = async (documentNumber: string) => {
    // Find the record in the records array
    const record = records.find(r => r.document_number === documentNumber);
    if (record) {
      // Ensure phoneNumbers is always an array
      const recordWithPhones = {
        ...record,
        phoneNumbers: record.phoneNumbers || [],
      };
      setViewRecord(recordWithPhones);
      setViewOpen(true);
    } else {
      toast({
        title: 'Record Not Found',
        description: `Could not find record with document number ${documentNumber}`,
        variant: 'destructive',
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !viewRoute) return;
    
    if (active.id === over.id) return;
    
    const sortedRecords = [...viewRoute.records].sort((a, b) => {
      return a.orderIndex - b.orderIndex;
    });
    
    const oldIndex = sortedRecords.findIndex(rr => rr.id === active.id);
    const newIndex = sortedRecords.findIndex(rr => rr.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    const recordId = active.id as string;
    setReorderingRecordId(recordId);
    
    try {
      const result = await reorderRecordInRoute(viewRoute.id, recordId, newIndex);
      
      if (result.route) {
        // Rebuild routeData waypoints based on new order
        const sortedRecords = [...result.route.records].sort((a, b) => a.orderIndex - b.orderIndex);
        const recordMap = new Map<string, any>();
        sortedRecords.forEach(rr => {
          const docNum = rr.record?.documentNumber || rr.record?.document_number;
          if (docNum) {
            recordMap.set(docNum, rr);
          }
        });
        
        // Rebuild waypoints in the correct order
        const allWaypoints: any[] = [];
        sortedRecords.forEach(rr => {
          const docNum = rr.record?.documentNumber || rr.record?.document_number;
          if (!docNum) return;
          
          // Find matching waypoint in original routeData
          const originalRouteData = result.route.routeData || viewRoute.routeData;
          const matchingWaypoint = originalRouteData?.routes?.[0]?.waypoints?.find((wp: any) => {
            const wpId = wp.id || wp.documentNumber || wp.document_number || wp.originalId;
            return wpId === docNum || (wpId === 'depot' && rr.isDepot);
          });
          
          if (matchingWaypoint) {
            allWaypoints.push({
              ...matchingWaypoint,
              id: rr.isDepot ? 'depot' : docNum,
              isDepot: rr.isDepot,
              order: rr.orderIndex
            });
          }
        });
        
        // Update routeData with reordered waypoints
        const updatedRoute = {
          ...result.route,
          routeData: {
            ...result.route.routeData,
            routes: [{
              ...result.route.routeData?.routes?.[0],
              waypoints: allWaypoints,
              distance: result.route.routeData?.routes?.[0]?.distance || 0
            }]
          }
        };
        
        setViewRoute(updatedRoute);
        
        // Update activeRoutes to reflect the change
        setActiveRoutes(prev => prev.map(route => 
          route.id === viewRoute.id ? updatedRoute : route
        ));
      }
      
      toast({
        title: 'Route updated',
        description: 'Route order has been updated.',
      });
    } catch (error: any) {
      console.error('[PreForeclosure] Error reordering record:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reorder record in route',
        variant: 'destructive',
      });
    } finally {
      setReorderingRecordId(null);
    }
  };

  const handleRemoveRecordFromRoute = async (routeId: string, recordId: string, documentNumber: string) => {
    const isDepot = viewRoute?.records?.find(rr => rr.id === recordId)?.isDepot;
    const message = isDepot 
      ? `Are you sure you want to remove the depot (${documentNumber}) from the route?\n\nNote: This will only remove it from the route. All property information (visited status, notes, dates) will be preserved.`
      : `Are you sure you want to remove this property (${documentNumber}) from the route?\n\nNote: This will only remove it from the route. All property information (visited status, notes, dates) will be preserved.`;
    
    if (!confirm(message)) {
      return;
    }

    setRemovingRecordId(recordId);
    try {
      const result = await removeRecordFromRoute(routeId, recordId);
      
      // Update the viewRoute with the updated route
      if (result.route) {
        // Get the removed record's address for matching waypoints (before updating viewRoute)
        const removedRecord = viewRoute?.records?.find((rr: any) => {
          const docNum = rr.record?.documentNumber || rr.record?.document_number;
          return docNum === documentNumber;
        });
        const removedAddress = removedRecord?.record?.address;
        
        setViewRoute(result.route);
        
        // Also update routeData in viewRoute if it exists
        // Filter waypoints to only include records that are still in the route
        if (result.route.routeData && result.route.records) {
          // Get all document numbers that are still in the route
          const currentRecordIds = new Set(
            result.route.records
              .map((rr: any) => {
                const docNum = rr.record?.documentNumber || rr.record?.document_number;
                return docNum;
              })
              .filter(Boolean)
          );
          
          console.log('[PreForeclosure] Filtering routeData waypoints:', {
            removedDocumentNumber: documentNumber,
            currentRecordIds: Array.from(currentRecordIds),
            routeDataWaypointCount: result.route.routeData.routes?.reduce((sum: number, r: any) => sum + (r.waypoints?.length || 0), 0) || 0
          });
          
          // Remove waypoints that are not in the current route records
          const updatedRouteData = {
            ...result.route.routeData,
            routes: result.route.routeData.routes?.map((route: any) => ({
              ...route,
              waypoints: route.waypoints.filter((wp: any) => {
                // Always keep depot waypoints
                if (wp.id === 'depot' || wp.isDepot) return true;
                
                // Check if this waypoint's ID matches any current record
                const wpId = wp.id || wp.documentNumber || wp.document_number || wp.originalId;
                const isInRoute = currentRecordIds.has(wpId);
                
                if (!isInRoute) {
                  console.log('[PreForeclosure] Filtering out waypoint:', {
                    wpId,
                    address: wp.address || wp.propertyAddress,
                    isInRoute
                  });
                }
                
                return isInRoute;
              })
            })).filter((route: any) => route.waypoints.length > 0) || []
          };
          
          // Recalculate total distance
          updatedRouteData.totalDistance = updatedRouteData.routes.reduce(
            (sum: number, route: any) => sum + (route.distance || 0), 
            0
          );
          
          console.log('[PreForeclosure] Updated routeData:', {
            waypointCountBefore: result.route.routeData.routes?.reduce((sum: number, r: any) => sum + (r.waypoints?.length || 0), 0) || 0,
            waypointCountAfter: updatedRouteData.routes.reduce((sum: number, r: any) => sum + (r.waypoints?.length || 0), 0),
            totalDistance: updatedRouteData.totalDistance
          });
          
          // Update viewRoute with cleaned routeData
          setViewRoute({
            ...result.route,
            routeData: updatedRouteData
          });
        }
        
        // Update optimizedRoutes if it contains the removed document number
        // This ensures the RouteMap (if open) reflects the updated route
        if (optimizedRoutes) {
          // Get all possible identifiers for the removed record
          const removedIdentifiers = new Set([
            documentNumber,
            recordId,
            removedAddress?.toLowerCase().trim()
          ].filter(Boolean));
          
          // Check if the current optimizedRoutes contains the removed document number
          // by checking all waypoints for any matching identifier
          let shouldUpdate = false;
          const waypointCountBefore = optimizedRoutes.routes?.reduce((sum: number, r: any) => 
            sum + (r.waypoints?.length || 0), 0) || 0;
          
          // Remove the waypoint from optimizedRoutes
          const updatedRoutes = optimizedRoutes.routes?.map((route: any) => ({
            ...route,
            waypoints: route.waypoints.filter((wp: any) => {
              // Get all possible identifiers from the waypoint
              const wpId = wp.id || wp.documentNumber || wp.document_number || wp.originalId;
              const wpAddress = (wp.address || wp.propertyAddress || '').toLowerCase().trim();
              
              // Check if this waypoint matches any of the removed identifiers
              const matchesId = removedIdentifiers.has(wpId) || 
                               removedIdentifiers.has(wpId?.toString());
              const matchesAddress = removedAddress && wpAddress && 
                                     removedIdentifiers.has(wpAddress);
              
              // Also check if the waypoint address contains the removed address (partial match)
              const partialAddressMatch = removedAddress && wpAddress && 
                                         wpAddress.includes(removedAddress.toLowerCase().trim());
              
              const shouldRemove = matchesId || matchesAddress || partialAddressMatch;
              
              if (shouldRemove) {
                shouldUpdate = true;
                console.log('[PreForeclosure] Removing waypoint from optimized route:', {
                  wpId,
                  wpAddress,
                  documentNumber,
                  removedAddress,
                  matchesId,
                  matchesAddress,
                  partialAddressMatch
                });
              }
              
              return !shouldRemove;
            })
          })).filter((route: any) => route.waypoints.length > 0) || [];
          
          const waypointCountAfter = updatedRoutes.reduce((sum: number, r: any) => 
            sum + (r.waypoints?.length || 0), 0);
          
          // If waypoints were removed, update optimizedRoutes
          if (shouldUpdate || waypointCountBefore !== waypointCountAfter) {
            console.log('[PreForeclosure] Updating optimized route:', {
              waypointCountBefore,
              waypointCountAfter,
              removedDocumentNumber: documentNumber,
              removedAddress
            });
            
            // Recalculate total distance (rough estimate - actual distance would need re-optimization)
            const updatedTotalDistance = updatedRoutes.reduce((sum: number, route: any) => sum + (route.distance || 0), 0);
            
            setOptimizedRoutes({
              ...optimizedRoutes,
              routes: updatedRoutes,
              totalDistance: updatedTotalDistance
            });
          }
        }
      }

      // Reload active routes to update the list
      await loadActiveRoutes();

      // Remove from recordsInRoutes if it's no longer in any route
      if (recordsInRoutes) {
        const updatedRecordsInRoutes = new Set(recordsInRoutes);
        // Check if this document number is still in any active route
        const activeRoutes = await getActiveRoutes();
        const stillInRoute = activeRoutes.some(route => 
          route.records?.some(rr => {
            const docNum = rr.record?.documentNumber || rr.record?.document_number;
            return docNum === documentNumber;
          })
        );
        if (!stillInRoute) {
          updatedRecordsInRoutes.delete(documentNumber);
          setRecordsInRoutes(updatedRecordsInRoutes);
        }
      }

      toast({
        title: 'Property Removed',
        description: `Property ${documentNumber} has been removed from the route.`,
      });
    } catch (error: any) {
      console.error('[PreForeclosure] Error removing record from route:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove property from route',
        variant: 'destructive',
      });
    } finally {
      setRemovingRecordId(null);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (!confirm('Are you sure you want to delete this route? This will remove the route but preserve all property visited status and details.')) {
      return;
    }

    setDeletingRoute(routeId);
    try {
      await deleteRoute(routeId);
      toast({
        title: 'Route Deleted',
        description: 'Route has been deleted. Property visited status and details are preserved.',
      });
      // Reload active routes to refresh the list
      await loadActiveRoutes();
      // Close route details modal if it was open for this route
      if (viewRoute?.id === routeId) {
        setRouteDetailsOpen(false);
        setViewRoute(null);
      }
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

  const handleStartingPointSelected = (record: PreForeclosureRecord, pinLocation: { lat: number; lng: number }) => {
    const documentNumber = record.document_number;
    
    // Check if property is already a depot (starting point) in an active route
    if (depotRecordIds.has(documentNumber)) {
      toast({
        title: "Property Already Used as Starting Point",
        description: `This property (${documentNumber}) is already being used as a starting point in an active route. Please select a different property.`,
        variant: "destructive",
      });
      return;
    }
    
    // Check if property is already in progress (part of an active route)
    if (recordsInRoutes && recordsInRoutes.has(documentNumber)) {
      toast({
        title: "Property Already in Progress",
        description: `This property (${documentNumber}) is already part of an active route. Please select a different property.`,
        variant: "destructive",
      });
      return;
    }
    
    setCustomDepot(pinLocation);
    setCustomDepotRecordId(documentNumber); // Store the specific record ID to use as depot
    // Ensure the closest record is selected
    if (!selectedRecordIds.has(documentNumber)) {
      setSelectedRecordIds(new Set([...selectedRecordIds, documentNumber]));
    }
    toast({
      title: "Starting Point Selected",
      description: `Starting point set. Route will begin from: ${record.address}. You can now draw an area or select records, then click "Optimize Route".`,
    });
    // Don't automatically optimize route - let user draw area first, then optimize manually
  };

  const handleCreateRouteWithDepot = async (depotRecord?: PreForeclosureRecord, depotLocation?: { lat: number; lng: number }, providedRecords?: PreForeclosureRecord[]) => {
    // If providedRecords is passed (from area selector), use those directly
    // Otherwise, get selected records with valid coordinates
    let availableRecords: PreForeclosureRecord[];
    
    if (providedRecords && providedRecords.length > 0) {
      // Use the limited records from area selector
      console.log('[PreForeclosure] Using providedRecords from area selector:', providedRecords.length);
      availableRecords = providedRecords.filter(r => {
        if (!r || !r.document_number) return false;
        if (r.latitude == null || r.longitude == null) return false;
        if (r.visited === true) return false; // Exclude visited records
        if (recordsInRoutes && recordsInRoutes.has(r.document_number)) return false; // Exclude records already in routes (in progress)
        return true;
      });
    } else {
      // Use selected records, but enforce 25-property limit for main optimize button
      const selectedFromFiltered = filteredRecords.filter(r => {
        if (!r || !r.document_number) return false;
        if (!selectedRecordIds.has(r.document_number)) return false;
        if (r.latitude == null || r.longitude == null) return false;
        if (r.visited === true) return false; // Exclude visited records
        if (recordsInRoutes && recordsInRoutes.has(r.document_number)) return false; // Exclude records already in routes (in progress)
        return true;
      });
      
      // CRITICAL: Limit to 25 properties (1 depot + 24 to visit) when using main optimize button
      if (selectedFromFiltered.length > 25) {
        console.warn('[PreForeclosure] Too many selected records (' + selectedFromFiltered.length + '). Limiting to 25 for optimization.');
        // Take first 25 records (sorted by distance from depot if depot is set, otherwise just first 25)
        availableRecords = selectedFromFiltered.slice(0, 25);
      } else {
        availableRecords = selectedFromFiltered;
      }
    }

    // Use custom depot if provided, otherwise use default (first record)
    const depotLat = depotLocation?.lat || customDepot?.lat;
    const depotLon = depotLocation?.lng || customDepot?.lng;
    const depotPropertyId = depotRecord?.document_number || customDepotRecordId; // Use the specific record ID

    // IMPORTANT: If a custom depot record is specified, ensure it's included in the route
    // even if it's not in the selected area (it will be the starting point)
    // Also, ensure it's NOT filtered out even if it's already in routes (it's the starting point)
    if (depotPropertyId) {
      const depotRec = filteredRecords.find(r => r.document_number === depotPropertyId) ||
                       records.find(r => r.document_number === depotPropertyId); // Also check all records
      if (depotRec && depotRec.latitude != null && depotRec.longitude != null) {
        // Check if depot record is already in available records
        const depotInList = availableRecords.find(r => r.document_number === depotPropertyId);
        if (!depotInList) {
          // Remove it from recordsInRoutes temporarily so it's not filtered out
          const wasInRoutes = recordsInRoutes.has(depotPropertyId);
          if (wasInRoutes) {
            // Temporarily remove from tracking so it can be used as starting point
            setRecordsInRoutes(prev => {
              const newSet = new Set(prev);
              newSet.delete(depotPropertyId);
              return newSet;
            });
          }
          // CRITICAL: Ensure we don't exceed 25 properties when adding depot
          // If we already have 25, remove the last one to make room for depot
          if (availableRecords.length >= 25) {
            console.warn('[PreForeclosure] availableRecords already at limit (25), removing last record to make room for depot');
            availableRecords = availableRecords.slice(0, 24); // Keep 24 to make room for depot (total 25)
          }
          // Add depot record as the first item (starting point)
          availableRecords = [depotRec, ...availableRecords];
          // Also add it to selectedRecordIds if not already there
          if (!selectedRecordIds.has(depotPropertyId)) {
            setSelectedRecordIds(new Set([...selectedRecordIds, depotPropertyId]));
          }
        } else {
          // Depot is already in the list, ensure it's first
          const depotIndex = availableRecords.findIndex(r => r.document_number === depotPropertyId);
          if (depotIndex > 0) {
            availableRecords.splice(depotIndex, 1);
            availableRecords.unshift(depotRec);
          }
        }
      } else {
        console.error('[PreForeclosure] Depot record not found:', depotPropertyId);
      }
    }

    // FINAL SAFETY CHECK: Ensure we never exceed 25 properties total
    if (availableRecords.length > 25) {
      console.error('[PreForeclosure] CRITICAL: availableRecords exceeds 25 after depot handling!', availableRecords.length);
      // Keep depot first if exists, then take first 24 others
      if (depotPropertyId) {
        const depotRec = availableRecords.find(r => r.document_number === depotPropertyId);
        const others = availableRecords.filter(r => r.document_number !== depotPropertyId).slice(0, 24);
        availableRecords = depotRec ? [depotRec, ...others] : availableRecords.slice(0, 25);
      } else {
        availableRecords = availableRecords.slice(0, 25);
      }
      console.warn('[PreForeclosure] Force-limited to 25 after depot handling:', availableRecords.length);
    }

    // Check if any selected records are already in routes
    const duplicateCount = Array.from(selectedRecordIds).filter(id => {
      if (!id || id === depotPropertyId) return false; // Don't count depot record as duplicate
      if (!recordsInRoutes || !recordsInRoutes.has(id)) return false;
      const record = filteredRecords.find(r => r && r.document_number === id);
      return record && record.latitude != null && record.longitude != null;
    }).length;

    if (duplicateCount > 0) {
      toast({
        title: "Records Already in Routes",
        description: `${duplicateCount} selected records are already in existing routes. They will be excluded from this route.`,
        variant: "default",
      });
    }

    // Check if we only have the depot record (no other records to visit)
    const hasOnlyDepot = availableRecords.length === 1 && 
                         depotPropertyId && 
                         availableRecords[0].document_number === depotPropertyId;

    if (availableRecords.length === 0 || hasOnlyDepot) {
      toast({
        title: "No valid locations",
        description: hasOnlyDepot || duplicateCount > 0
          ? "All selected records are already in existing routes. The starting point cannot be the only record. Please select additional records that are not already in routes."
          : "Please select records with latitude and longitude coordinates, or use the area selector.",
        variant: "destructive",
      });
      return;
    }

    // CRITICAL: Enforce 25 property limit (1 depot + 24 to visit) when using main optimize button
    // If providedRecords was passed, it should already be limited, but double-check
    if (!providedRecords && availableRecords.length > 25) {
      console.error('[PreForeclosure] CRITICAL: More than 25 records after filtering!', availableRecords.length);
      toast({
        title: "Too many records selected",
        description: `You selected ${selectedRecordIds.size} records, but only 25 are allowed for optimization (1 starting point + 24 properties). Please use the "Select Area" button to limit your selection, or manually select 24 or fewer records.`,
        variant: "destructive",
      });
      return;
    }

    // For area selector path (providedRecords), backend will validate, but also check here
    if (providedRecords && availableRecords.length > 25) {
      console.error('[PreForeclosure] ERROR: Area selector provided more than 25 records!', availableRecords.length);
      toast({
        title: "Too many records",
        description: `Area selector returned ${availableRecords.length} records, but maximum 25 allowed (1 starting point + 24 properties).`,
        variant: "destructive",
      });
      return;
    }

    // Legacy check for very large selections (should not happen with limits above)
    if (availableRecords.length > 500) {
      toast({
        title: "Too many records",
        description: "Maximum 500 records allowed for route optimization. For larger batches, please select fewer records.",
        variant: "destructive",
      });
      return;
    }

    const selectedRecords = availableRecords;

    setIsOptimizingRoute(true);

    try {
      // Convert pre-foreclosure records to property format for VRP solver
      const properties = selectedRecords.map(r => ({
        id: r.document_number,
        latitude: r.latitude!,
        longitude: r.longitude!,
        propertyAddress: r.address,
        address: r.address,
      }));

      // Solve VRP using the backend solver
      const solution = await solveVRP(properties, numVehicles, depotLat, depotLon, depotPropertyId);

      if (!solution.success || !solution.routes || solution.routes.length === 0) {
        throw new Error('No routes generated');
      }

      // Extract all record IDs from the generated routes to track them
      // Build the array in order from waypoints (depot first, then others in order)
      const routeRecordIdsOrdered: string[] = [];
      const seenIds = new Set<string>();
      
      solution.routes.forEach((route: any) => {
        route.waypoints.forEach((wp: any) => {
          // Skip 'depot' string placeholder, but include actual depot document number
          if (wp.id && wp.id !== 'depot' && !seenIds.has(wp.id)) {
            routeRecordIdsOrdered.push(wp.id);
            seenIds.add(wp.id);
          }
          // Also check originalId for depot
          if (wp.originalId && wp.originalId !== 'depot' && !seenIds.has(wp.originalId)) {
            routeRecordIdsOrdered.push(wp.originalId);
            seenIds.add(wp.originalId);
          }
        });
      });

      // Ensure depot is first if it exists and is not already first
      if (depotPropertyId && !seenIds.has(depotPropertyId)) {
        routeRecordIdsOrdered.unshift(depotPropertyId);
        seenIds.add(depotPropertyId);
      } else if (depotPropertyId && routeRecordIdsOrdered[0] !== depotPropertyId) {
        // Depot is in the list but not first - move it to the front
        const depotIndex = routeRecordIdsOrdered.indexOf(depotPropertyId);
        if (depotIndex > 0) {
          routeRecordIdsOrdered.splice(depotIndex, 1);
          routeRecordIdsOrdered.unshift(depotPropertyId);
        }
      }

      // Update the set of records in routes (for tracking)
      const routeRecordIdsSet = new Set(routeRecordIdsOrdered);
      setRecordsInRoutes(prev => new Set([...prev, ...routeRecordIdsSet]));

      // Store the record IDs for the current optimized routes (for saving)
      // This array should have depot first, then other stops in order
      setOptimizedRecordIds(routeRecordIdsOrdered);
      
      console.log('[PreForeclosure] Stored optimized record IDs:', routeRecordIdsOrdered.length, 'ids:', routeRecordIdsOrdered.slice(0, 5));

      // Store routes and show map visualization
      setOptimizedRoutes(solution);
      setRouteMapOpen(true);
      
      toast({
        title: "Route Optimized",
        description: `Optimized route for ${selectedRecords.length} records using ${numVehicles} vehicle(s). Total distance: ${solution.totalDistance.toFixed(2)} km. ${routeRecordIdsOrdered.length} records added to routes.`,
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
    // If no custom depot is set, just proceed with optimization
    await handleCreateRouteWithDepot();
  };

  const handleSaveAction = async () => {
    if (!viewRecord || !actionType || !dueDateTime) {
      toast({
        title: "Missing Information",
        description: "Please select an action type and due date/time",
        variant: "destructive",
      });
      return;
    }

    setSavingAction(true);
    try {
      const isoDateTime = dueDateTime.toISOString();
      // Update the record with action/task info
      await updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        last_action_date: new Date().toISOString(),
        actionType: actionType,
        priority: priority,
        dueTime: isoDateTime,
        assignedTo: assignedTo || undefined,
      });
      
      toast({
        title: "Action Scheduled",
        description: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} scheduled for ${format(dueDateTime, 'MMM d, yyyy h:mm a')}${assignedTo ? ` - Assigned to ${assignedTo}` : ''}`,
      });
      
      // Update local record
      viewRecord.actionType = actionType;
      viewRecord.priority = priority;
      viewRecord.dueTime = isoDateTime;
      viewRecord.assignedTo = assignedTo || undefined;
      
      // Invalidate tasks query so Tasks tab shows the new task
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error) {
      console.error('[PreForeclosure] Schedule action error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to schedule action';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleClearTask = async () => {
    if (!viewRecord) return;

    setSavingAction(true);
    try {
      // Clear all task fields by setting them to null/undefined
      await updateMutation.mutateAsync({
        document_number: viewRecord.document_number,
        actionType: undefined,
        priority: undefined,
        dueTime: undefined,
        assignedTo: undefined,
      });
      
      toast({
        title: "Task Cleared",
        description: "Task has been cleared successfully.",
      });
      
      // Update local record
      viewRecord.actionType = undefined;
      viewRecord.priority = undefined;
      viewRecord.dueTime = undefined;
      viewRecord.assignedTo = undefined;
      
      // Clear local state
      setActionType('');
      setPriority('med');
      setDueDateTime(undefined);
      setAssignedTo('');
      
      // Invalidate tasks query so Tasks tab updates
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    } catch (error) {
      console.error('[PreForeclosure] Clear task error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear task';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSavingAction(false);
    }
  };

  const getStatusColor = (status: PreForeclosureStatus) => {
    switch (status) {
      case 'New':
        return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'Contact Attempted':
        return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'Monitoring':
        return 'bg-green-500/20 text-green-500 border-green-500/30';
      case 'Dead':
        return 'bg-red-500/20 text-red-500 border-red-500/30';
      default:
        return 'bg-secondary text-muted-foreground';
    }
  };

  const getTypeColor = (type: PreForeclosureType) => {
    return type === 'Mortgage' 
      ? 'bg-purple-500/20 text-purple-500 border-purple-500/30'
      : 'bg-orange-500/20 text-orange-500 border-orange-500/30';
  };


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select an Excel file (.xlsx or .xls) or CSV file (.csv)',
          variant: 'destructive',
        });
        e.target.value = '';
        return;
      }
      // Validate file size (100MB limit)
      if (file.size > 100 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'File size must be less than 100MB',
          variant: 'destructive',
        });
        e.target.value = '';
        return;
      }
      handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      const result = await uploadMutation.mutateAsync(file);
      toast({
        title: 'Upload successful',
        description: `Processed ${result.recordsProcessed} records. Total: ${result.totalRecords} (${result.activeRecords} active, ${result.inactiveRecords} inactive)`,
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Upload failed',
        variant: 'destructive',
      });
      console.error('Upload error:', error);
    }
  };

  // Always show header with upload button, even during loading/error
  const headerSection = (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Pre-Foreclosure Records</h1>
        {!isLoading && !error && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
            {filteredRecords.length.toLocaleString()} active record{filteredRecords.length !== 1 ? 's' : ''}
              </span>
              {records.length > filteredRecords.length && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span>{records.length - filteredRecords.length} inactive</span>
                </>
            )}
            </div>
        )}
      </div>
        <div className="flex flex-wrap gap-2 items-center">
        {selectedRecordIds.size > 0 && (
          <>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-md text-sm font-medium">
                <CheckCircle className="h-4 w-4" />
              {selectedRecordIds.size} selected
              </div>
            <Select
              value={numVehicles.toString()}
              onValueChange={(value) => setNumVehicles(parseInt(value) as 1 | 2)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Vehicle</SelectItem>
                <SelectItem value="2">2 Vehicles</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => setAreaSelectorOpen(true)}
              variant="outline"
              size="sm"
              title="Select area on map to filter records"
            >
                <MapPin className="h-4 w-4 mr-2" />
              Select Area
            </Button>
            {customDepot && (
              <Button
                onClick={() => {
                  setCustomDepot(null);
                  setCustomDepotRecordId(null);
                  toast({
                    title: "Starting Point Cleared",
                    description: "Starting point has been cleared. Route will use default starting point.",
                  });
                }}
                variant="ghost"
                size="sm"
                title="Clear custom starting point"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              onClick={handleCreateRoute}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              size="sm"
              disabled={isOptimizingRoute}
            >
              {isOptimizingRoute ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                    <RouteIcon className="h-4 w-4 mr-2" />
                  Optimize Route
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                setSelectedRecordIds(new Set());
                setRecordsInRoutes(new Set()); // Clear routes tracking so records can be selected/optimized again
                setOptimizedRoutes(null); // Clear optimized routes
                setCustomDepot(null); // Clear custom depot
                setCustomDepotRecordId(null); // Clear custom depot record ID
              }}
              variant="outline"
              size="sm"
              disabled={isOptimizingRoute}
            >
              Clear Selection
            </Button>
          </>
        )}
        <Button 
          onClick={() => setDeleteConfirmOpen(true)} 
          variant="destructive" 
          size="default"
          disabled={records.length === 0}
            className="shadow-sm"
        >
          <Trash2 className="h-4 w-4 mr-2" />
            Delete All
        </Button>
          <Button 
            onClick={() => setUploadOpen(true)} 
            size="default"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
          <Upload className="h-4 w-4 mr-2" />
            Upload File
        </Button>
        </div>
      </div>
    </div>
  );

  // Upload Modal Component (rendered once at the end)
  const uploadModal = (
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Pre-Foreclosure File</DialogTitle>
              <DialogDescription>
                Upload an Excel file (.xlsx or .xls) or CSV file (.csv) with pre-foreclosure records.
                Required columns: Doc Number (or Document Number), Type (Mortgage/Tax), Address, City, ZIP, Filing Month (optional).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select File (.xlsx, .xls, or .csv)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validate file type
                      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
                        toast({
                          title: 'Invalid file type',
                          description: 'Please select an Excel file (.xlsx or .xls) or CSV file (.csv)',
                          variant: 'destructive',
                        });
                        e.target.value = ''; // Clear the input
                        return;
                      }
                      // Validate file size (100MB limit)
                      if (file.size > 100 * 1024 * 1024) {
                        toast({
                          title: 'File too large',
                          description: 'File size must be less than 100MB',
                          variant: 'destructive',
                        });
                        e.target.value = ''; // Clear the input
                        return;
                      }
                      setUploadFile(file);
                    }
                  }}
                  className="mt-2"
                />
                {uploadFile && (
                  <div className="mt-2 p-3 bg-secondary/30 rounded-lg">
                    <p className="text-sm font-medium">
                      Selected: {uploadFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Size: {(uploadFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                )}
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium">File Requirements:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Document Number (required)</li>
                  <li>Type: Mortgage or Tax</li>
                  <li>Address, City, ZIP</li>
                  <li>Filing Month (optional, defaults to current month)</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Records are matched by Document Number. Missing records from new uploads are marked inactive.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setUploadOpen(false);
                  setUploadFile(null);
                }}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!uploadFile) return;
                    try {
                      const result = await uploadMutation.mutateAsync(uploadFile);
                      toast({
                        title: 'Upload successful',
                        description: `Processed ${result.recordsProcessed} records. Total: ${result.totalRecords} (${result.activeRecords} active, ${result.inactiveRecords} inactive)`,
                      });
                      setUploadOpen(false);
                      setUploadFile(null);
                    } catch (error) {
                      toast({
                        title: 'Upload failed',
                        description: error instanceof Error ? error.message : 'Upload failed',
                        variant: 'destructive',
                      });
                      console.error('Upload error:', error);
                    }
                  }}
                  disabled={!uploadFile || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
  );


  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        {headerSection}
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 text-primary mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Loading pre-foreclosure records...</p>
          </div>
        </div>
        {uploadModal}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        {headerSection}
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive">Failed to load pre-foreclosure records</p>
        </div>
        {uploadModal}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {headerSection}
      


      {/* Active Routes Dashboard */}
      <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Active Routes</h3>
          {isLoadingActiveRoutes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Loading routes...</span>
            </div>
        ) : Array.isArray(activeRoutes) && activeRoutes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRoutes.map((route: any) => {
                const stopCount = route.records?.length || 0;
                const driverColor = route.driver === 'Luciano' ? 'bg-blue-500' : 'bg-green-500';
                return (
                  <div
                    key={route.id}
                  className="p-4 border border-border rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors relative group"
                >
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Route card clicked:', route.id, 'Route data:', route);
                      // Ensure route has records array and all required fields
                      const routeWithRecords = {
                        ...route,
                        records: (route.records || []).filter(rr => rr && rr.record), // Filter out null records
                        routeData: route.routeData || null,
                        createdAt: route.createdAt || new Date().toISOString(),
                        updatedAt: route.updatedAt || new Date().toISOString(),
                      };
                      console.log('Setting viewRoute with:', routeWithRecords);
                      setViewRoute(routeWithRecords);
                      setRouteDetailsOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${driverColor}`} />
                        <span className="font-semibold">{route.driver}</span>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                    </div>
                    {route.routeData?.totalDistance && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {route.routeData.totalDistance.toFixed(2)} km
                      </div>
                    )}
                  </div>
                  {/* Delete button - appears on hover */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRoute(route.id);
                    }}
                    disabled={deletingRoute === route.id}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    title="Delete route"
                  >
                    {deletingRoute === route.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 text-destructive" />
                    )}
                  </Button>
                  {/* Date - always visible in bottom right */}
                  <div className="absolute bottom-2 right-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(route.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No active routes
            </div>
          )}
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by document #, address, city, or ZIP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Advanced Filters */}
          <div className="flex items-center gap-2">
          <AdvancedFiltersPanel
            filters={advancedFilters}
            onFiltersChange={handleFiltersChange}
            onClear={handleClearFilters}
            uniqueCities={uniqueCities}
            uniqueZips={uniqueZips}
            uniqueMonths={uniqueMonths}
            activeFilterCount={activeFilterCount}
          />
        </div>
          </div>

      {/* Select All Checkbox */}
      {filteredRecords.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Checkbox
            checked={selectedRecordIds.size > 0 && selectedRecordIds.size === filteredRecords.length && filteredRecords.length > 0}
            onCheckedChange={(checked) => {
              try {
                const newSelectedIds = new Set<string>();
                if (checked) {
                  filteredRecords.forEach(record => {
                    if (record && record.document_number) {
                      newSelectedIds.add(record.document_number);
                    }
                  });
                }
                setSelectedRecordIds(newSelectedIds);
              } catch (error) {
                console.error('[PreForeclosure] Error in select all:', error);
              }
            }}
            title="Select all"
          />
          <span className="text-sm text-muted-foreground">
            Select all ({filteredRecords.length} records)
          </span>
        </div>
      )}

      {/* Cards Grid */}
      {filteredRecords.length === 0 && records.length === 0 ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Records Found</h3>
          <p className="text-muted-foreground">
            Upload a pre-foreclosure file using the drop zone above to get started.
          </p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Records Match Filters</h3>
          <p className="text-muted-foreground">
            No records match your current filters. Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-full">
                {filteredRecords.map((record) => (
            <div
                    key={record.document_number} 
                    className={cn(
                "bg-card border border-border rounded-lg p-4 relative transition-colors w-full max-w-full overflow-hidden",
                selectedRecordIds.has(record.document_number) && "bg-primary/10 border-primary/30"
                    )}
                  >
              {/* Checkbox */}
              <div className="absolute top-4 left-4 z-10">
                      <Checkbox
                        checked={selectedRecordIds.has(record.document_number)}
                        onCheckedChange={(checked) => {
                          handleRecordSelect(record.document_number, checked as boolean);
                        }}
                        title="Select record"
                      />
              </div>

              {/* Eye Icon - Hidden */}
              {/* <div className="absolute top-4 right-4 z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setViewRecord({
                      ...record,
                      phoneNumbers: record.phoneNumbers || [],
                    });
                    setViewOpen(true);
                  }}
                  title="View details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div> */}

              {/* Type Badge */}
              <div className="flex items-center gap-2 mb-2 pr-8 pl-8">
                      <Badge variant="outline" className={getTypeColor(record.type)}>
                        {record.type}
                      </Badge>
              </div>

              {/* Document Number - Hidden on mobile */}
              <div className="mb-3 pr-8 pl-8 hidden sm:block">
                <div className="font-semibold text-base break-words">{record.document_number}</div>
                <div className="text-xs text-muted-foreground font-mono break-words">{record.filing_month}</div>
              </div>

              {/* Address */}
              <div className="mb-4 pr-8 pl-8">
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-muted-foreground min-w-0 flex-1 break-words">
                    <div className="break-words">{record.address}</div>
                    <div className="text-xs mt-0.5 break-words">{record.city}, TX <span className="hidden sm:inline">{record.zip}</span></div>
                  </div>
                </div>
              </div>

              {/* Status and Visited Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Internal Status</div>
                      <Select
                        value={record.internal_status}
                        onValueChange={(v) => handleStatusChange(record, v as PreForeclosureStatus)}
                      >
                    <SelectTrigger className="w-full h-8 text-xs min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Contact Attempted">Contact Attempted</SelectItem>
                          <SelectItem value="Monitoring">Monitoring</SelectItem>
                          <SelectItem value="Dead">Dead</SelectItem>
                        </SelectContent>
                      </Select>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Route Status</div>
                  <div>
                    {record.visited === true ? (
                      <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs whitespace-nowrap">
                        Visited
                      </Badge>
                    ) : recordsInRoutes && recordsInRoutes.has(record.document_number) ? (
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs whitespace-nowrap">
                        In Progress
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground text-xs whitespace-nowrap">
                        Not in Route
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Last Action</div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-auto p-1 text-xs font-normal w-full justify-start min-w-0",
                          record.last_action_date ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        <span className="truncate">
                      {record.last_action_date
                        ? format(new Date(record.last_action_date), 'MMM d, yyyy')
                            : 'Click to set'}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={record.last_action_date ? new Date(record.last_action_date) : undefined}
                        onSelect={async (date) => {
                          if (date) {
                            try {
                              await updateMutation.mutateAsync({
                                document_number: record.document_number,
                                last_action_date: date.toISOString(),
                              });
                              toast({
                                title: 'Last Action Date Updated',
                                description: `Last action date set to ${format(date, 'MMM d, yyyy')}`,
                              });
                              queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                            } catch (error) {
                              console.error('Error updating last action date:', error);
                              toast({
                                title: 'Error',
                                description: 'Failed to update last action date',
                                variant: 'destructive',
                              });
                            }
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Next Follow-Up</div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-auto p-1 text-xs font-normal w-full justify-start min-w-0",
                          record.next_follow_up_date 
                            ? new Date(record.next_follow_up_date) <= new Date()
                              ? "text-red-500 font-medium"
                              : "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        <span className="truncate">
                          {record.next_follow_up_date ? (
                            format(new Date(record.next_follow_up_date), 'MMM d, yyyy')
                          ) : (
                            'Click to set'
                          )}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={record.next_follow_up_date ? new Date(record.next_follow_up_date) : undefined}
                        onSelect={async (date) => {
                          if (date) {
                            try {
                              await updateMutation.mutateAsync({
                                document_number: record.document_number,
                                next_follow_up_date: date.toISOString(),
                              });
                              toast({
                                title: 'Next Follow-Up Date Updated',
                                description: `Next follow-up date set to ${format(date, 'MMM d, yyyy')}`,
                              });
                              queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                            } catch (error) {
                              console.error('Error updating next follow-up date:', error);
                              toast({
                                title: 'Error',
                                description: 'Failed to update next follow-up date',
                                variant: 'destructive',
                              });
                            }
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                        <Button
                          variant="outline"
                  size="sm"
                  className="flex-1 min-w-0"
                          onClick={() => {
                            setViewRecord({
                              ...record,
                              phoneNumbers: record.phoneNumbers || [],
                            });
                            setViewOpen(true);
                          }}
                        >
                  <Eye className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                  <span className="truncate">View</span>
                        </Button>
                        <Button
                          variant="outline"
                  size="sm"
                  className="flex-1 min-w-0"
                          onClick={() => {
                            if (record.latitude != null && record.longitude != null) {
                              const mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(record.address)},+${encodeURIComponent(record.city)},+TX+${record.zip}/@${record.latitude},${record.longitude},16z`;
                              window.open(mapsUrl, '_blank');
                            } else {
                              toast({
                                title: 'Location not available',
                                description: 'Latitude and longitude are not available for this property',
                                variant: 'destructive',
                              });
                            }
                          }}
                          disabled={record.latitude == null || record.longitude == null}
                        >
                  <Send className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                  <span className="truncate">Maps</span>
                        </Button>
                {/* External Link Button - Hidden */}
                {/* <Button
                          variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                          onClick={() => {
                            window.open('https://bexar.acttax.com/act_webdev/bexar/index.jsp', '_blank');
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                </Button> */}
                      </div>
            </div>
                ))}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal}

      {/* Notes Modal */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record Details</DialogTitle>
            <DialogDescription>
              Document #{editingRecord?.document_number} • {editingRecord?.address}
            </DialogDescription>
          </DialogHeader>
          {editingRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Last Action Date</Label>
                  <Input
                    type="date"
                    value={editingRecord.last_action_date?.split('T')[0] || ''}
                    onChange={(e) => setEditingRecord({
                      ...editingRecord,
                      last_action_date: e.target.value ? `${e.target.value}T00:00:00Z` : undefined,
                    })}
                  />
                </div>
                <div>
                  <Label>Next Follow-Up Date</Label>
                  <Input
                    type="date"
                    value={editingRecord.next_follow_up_date?.split('T')[0] || ''}
                    onChange={(e) => setEditingRecord({
                      ...editingRecord,
                      next_follow_up_date: e.target.value ? `${e.target.value}T00:00:00Z` : undefined,
                    })}
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editingRecord.notes || ''}
                  onChange={(e) => setEditingRecord({
                    ...editingRecord,
                    notes: e.target.value,
                  })}
                  placeholder="Enter notes about this record..."
                  rows={6}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNotesOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveNotes} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Pre-Foreclosure Records</DialogTitle>
            <DialogDescription>
              {records.length > 0 ? (
                <>
                  Are you sure you want to delete all pre-foreclosure records? This action cannot be undone.
                  <br />
                  <br />
                  <strong>This will delete {records.length.toLocaleString()} record{records.length !== 1 ? 's' : ''}.</strong>
                </>
              ) : (
                'No records to delete.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (records.length === 0) {
                  setDeleteConfirmOpen(false);
                  return;
                }
                try {
                  await deleteMutation.mutateAsync();
                  toast({
                    title: 'Records deleted',
                    description: 'All pre-foreclosure records have been deleted.',
                  });
                  setDeleteConfirmOpen(false);
                } catch (error) {
                  toast({
                    title: 'Delete failed',
                    description: error instanceof Error ? error.message : 'Failed to delete records',
                    variant: 'destructive',
                  });
                }
              }}
              disabled={deleteMutation.isPending || records.length === 0}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Pre-Foreclosure Details
            </DialogTitle>
            <DialogDescription>
              Document #{viewRecord?.document_number}
            </DialogDescription>
          </DialogHeader>

          {viewRecord && (
            <div className="space-y-6">
              {/* Actions Panel */}
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium">Actions</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 bg-primary text-primary-foreground"
                    disabled
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      if (viewRecord.latitude != null && viewRecord.longitude != null) {
                        const mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(viewRecord.address)},+${encodeURIComponent(viewRecord.city)},+TX+${viewRecord.zip}/@${viewRecord.latitude},${viewRecord.longitude},16z`;
                        window.open(mapsUrl, '_blank');
                      } else {
                        toast({
                          title: 'Location not available',
                          description: 'Latitude and longitude are not available for this property',
                          variant: 'destructive',
                        });
                      }
                    }}
                    disabled={viewRecord.latitude == null || viewRecord.longitude == null}
                    title="Open in Google Maps"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      window.open('https://bexar.acttax.com/act_webdev/bexar/index.jsp', '_blank');
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Property Information */}
              <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Property Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Document Number</Label>
                    <p className="font-mono text-sm">{viewRecord.document_number}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Type</Label>
                    <Badge 
                      variant="outline" 
                      className={getTypeColor(viewRecord.type)}
                    >
                      {viewRecord.type}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs mb-1">Internal Status</Label>
                    <Select
                      value={viewRecord.internal_status || 'New'}
                      onValueChange={async (value) => {
                        console.log('Select onValueChange called with:', value, 'for document:', viewRecord.document_number);
                        if (handleStatusChange) {
                          try {
                            await handleStatusChange(viewRecord, value as PreForeclosureStatus);
                            // Update local state
                            setViewRecord({
                              ...viewRecord,
                              internal_status: value as PreForeclosureStatus,
                            });
                            console.log('handleStatusChange completed successfully');
                          } catch (error) {
                            console.error('Error in onValueChange:', error);
                          }
                        } else {
                          console.error('handleStatusChange is not available');
                        }
                      }}
                    >
                      <SelectTrigger 
                        className="h-8 text-xs w-full cursor-pointer hover:bg-secondary/50 border-border"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[100]">
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Contact Attempted">Contact Attempted</SelectItem>
                        <SelectItem value="Monitoring">Monitoring</SelectItem>
                        <SelectItem value="Dead">Dead</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Address
                    </Label>
                    <p className="text-sm">{viewRecord.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {viewRecord.city}, TX {viewRecord.zip}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Latitude</Label>
                    <p className="font-mono text-sm">
                      {viewRecord.latitude != null ? viewRecord.latitude.toFixed(6) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Longitude</Label>
                    <p className="font-mono text-sm">
                      {viewRecord.longitude != null ? viewRecord.longitude.toFixed(6) : 'N/A'}
                    </p>
                  </div>
                  {viewRecord.school_district && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground text-xs">School District</Label>
                      <p className="text-sm">{viewRecord.school_district}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground text-xs">Filing Month</Label>
                    <p className="text-sm">{viewRecord.filing_month}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">County</Label>
                    <p className="text-sm">{viewRecord.county}</p>
                  </div>
                </div>
              </div>

              {/* Phone Numbers Section - Always Visible */}
              <div className="bg-secondary/30 rounded-lg p-4" style={{ display: 'block' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Phone Numbers</span>
                </div>
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    // Ensure phoneNumbers is always an array
                    const phoneNumbersArray = Array.isArray(viewRecord.phoneNumbers) ? viewRecord.phoneNumbers : [];
                    const phoneValue = phoneNumbersArray[index] || '';
                    const isOwnerPhone = viewRecord.ownerPhoneIndex === index;
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">
                          Phone {index + 1}:
                        </span>
                        <Input
                          type="tel"
                          value={phoneValue}
                          onChange={(e) => {
                            const currentPhones = viewRecord.phoneNumbers || [];
                            const newPhoneNumbers = [...currentPhones];
                            newPhoneNumbers[index] = e.target.value;
                            // Ensure array has max 6 elements
                            const trimmed = newPhoneNumbers.slice(0, 6);
                            setViewRecord({
                              ...viewRecord,
                              phoneNumbers: trimmed,
                            });
                          }}
                          placeholder="Enter phone number"
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-8 w-8 shrink-0",
                            isOwnerPhone && "text-yellow-500"
                          )}
                          onClick={() => {
                            const newOwnerPhoneIndex = isOwnerPhone ? undefined : index;
                            setViewRecord({
                              ...viewRecord,
                              ownerPhoneIndex: newOwnerPhoneIndex,
                            });
                            // Auto-save on click
                            const currentPhones = Array.isArray(viewRecord.phoneNumbers) ? viewRecord.phoneNumbers : [];
                            updateMutation.mutateAsync({
                              document_number: viewRecord.document_number,
                              phoneNumbers: currentPhones,
                              ownerPhoneIndex: newOwnerPhoneIndex,
                            }).catch((error) => {
                              console.error('Error saving owner phone index:', error);
                            });
                          }}
                          title={isOwnerPhone ? "Owner's phone (click to unmark)" : "Click star for owner phone number"}
                        >
                          <Star className={cn(
                            "h-4 w-4",
                            isOwnerPhone ? "fill-yellow-500" : "fill-none"
                          )} />
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          const currentPhones = Array.isArray(viewRecord.phoneNumbers) ? viewRecord.phoneNumbers : [];
                          await updateMutation.mutateAsync({
                            document_number: viewRecord.document_number,
                            phoneNumbers: currentPhones,
                            ownerPhoneIndex: viewRecord.ownerPhoneIndex,
                          });
                          toast({
                            title: 'Phone Numbers Saved',
                            description: 'Phone numbers have been saved successfully.',
                          });
                          queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                        } catch (error) {
                          console.error('Error saving phone numbers:', error);
                          toast({
                            title: 'Error',
                            description: 'Failed to save phone numbers. Please try again.',
                            variant: 'destructive',
                          });
                        }
                      }}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Phone Numbers'
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tasks Section */}
              <div className="space-y-4">
                  {/* Notes Section */}
                  <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Notes
                    </h3>
                    <div className="space-y-2">
                      <Textarea
                        value={viewRecord.notes || ''}
                        onChange={(e) => {
                          setViewRecord({
                            ...viewRecord,
                            notes: e.target.value,
                          });
                        }}
                        placeholder="Add notes about this property..."
                        className="min-h-[100px] resize-none"
                        onBlur={async () => {
                          // Auto-save on blur
                          try {
                            await updateMutation.mutateAsync({
                              document_number: viewRecord.document_number,
                              notes: viewRecord.notes || '',
                            });
                            toast({
                              title: 'Notes Saved',
                              description: 'Notes have been saved successfully.',
                            });
                            // Invalidate query to refresh the data
                            queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
                          } catch (error) {
                            console.error('Error saving notes:', error);
                            toast({
                              title: 'Error',
                              description: 'Failed to save notes. Please try again.',
                              variant: 'destructive',
                            });
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Notes are automatically saved when you click away from the text area.
                      </p>
                    </div>
                  </div>

                  {/* Route Status Section in Tasks Tab */}
                  <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Route Status
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-muted-foreground text-xs mb-2 block">Current Status</Label>
                        <div className="flex items-center gap-2">
                          {viewRecord.visited === true ? (
                            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                              Visited
                            </Badge>
                          ) : recordsInRoutes && recordsInRoutes.has(viewRecord.document_number) ? (
                            <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                              In Progress
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">
                              Not in Route
                            </Badge>
                          )}
                          {viewRecord.visited === true && viewRecord.visited_by && (
                            <span className="text-xs text-muted-foreground">
                              by {viewRecord.visited_by}
                            </span>
                          )}
                          {viewRecord.visited === true && viewRecord.visited_at && (
                            <span className="text-xs text-muted-foreground">
                              on {format(new Date(viewRecord.visited_at), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {viewRecord.visited === true ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const driver = viewRecord.visited_by || 'Luciano';
                              await handleMarkVisited(viewRecord.document_number, driver as 'Luciano' | 'Raul', false);
                              // Update local state
                              setViewRecord({
                                ...viewRecord,
                                visited: false,
                                visited_at: undefined,
                                visited_by: undefined,
                              });
                            }}
                            disabled={markingVisited === viewRecord.document_number}
                          >
                            {markingVisited === viewRecord.document_number ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Set Not Visited
                              </>
                            )}
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                await handleMarkVisited(viewRecord.document_number, 'Luciano', true);
                                // Update local state
                                setViewRecord({
                                  ...viewRecord,
                                  visited: true,
                                  visited_at: new Date().toISOString(),
                                  visited_by: 'Luciano',
                                });
                              }}
                              disabled={markingVisited === viewRecord.document_number}
                            >
                              {markingVisited === viewRecord.document_number ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Updating...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Mark Visited (Luciano)
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                await handleMarkVisited(viewRecord.document_number, 'Raul', true);
                                // Update local state
                                setViewRecord({
                                  ...viewRecord,
                                  visited: true,
                                  visited_at: new Date().toISOString(),
                                  visited_by: 'Raul',
                                });
                              }}
                              disabled={markingVisited === viewRecord.document_number}
                            >
                              {markingVisited === viewRecord.document_number ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Updating...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Mark Visited (Raul)
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                      {recordsInRoutes && recordsInRoutes.has(viewRecord.document_number) && (
                        <div className="text-xs text-muted-foreground">
                          This property is currently in an active route
                        </div>
                      )}
                </div>
              </div>

              {/* Actions & Tasks Section */}
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Actions & Tasks</span>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Action Type</label>
                      <Select value={actionType} onValueChange={(value) => setActionType(value as any)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select action type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">📞 Call</SelectItem>
                          <SelectItem value="text">💬 Text</SelectItem>
                          <SelectItem value="mail">✉️ Mail</SelectItem>
                          <SelectItem value="driveby">🚗 Drive-by</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Priority</label>
                      <div className="flex gap-2">
                        <Button
                          variant={priority === 'high' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPriority('high')}
                          className="flex-1"
                        >
                          High
                        </Button>
                        <Button
                          variant={priority === 'med' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPriority('med')}
                          className="flex-1"
                        >
                          Med
                        </Button>
                        <Button
                          variant={priority === 'low' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPriority('low')}
                          className="flex-1"
                        >
                          Low
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Due Date & Time</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !dueDateTime && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {dueDateTime ? format(dueDateTime, 'PPP p') : <span>Pick a date & time</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={dueDateTime}
                            onSelect={setDueDateTime}
                            initialFocus
                          />
                          <div className="p-3 border-t">
                            <Input
                              type="time"
                              value={dueDateTime ? format(dueDateTime, 'HH:mm') : ''}
                              onChange={(e) => {
                                if (dueDateTime && e.target.value) {
                                  const [hours, minutes] = e.target.value.split(':');
                                  const newDate = new Date(dueDateTime);
                                  newDate.setHours(parseInt(hours), parseInt(minutes));
                                  setDueDateTime(newDate);
                                }
                              }}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Assigned To</label>
                      <Select value={assignedTo} onValueChange={(value) => setAssignedTo(value as any)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Luciano">Luciano</SelectItem>
                          <SelectItem value="Raul">Raul</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSaveAction}
                      disabled={savingAction || !actionType || !dueDateTime}
                    >
                      {savingAction ? 'Scheduling...' : 'Schedule Action'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Current Status */}
              {viewRecord.actionType && (
                <div className="bg-secondary/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Current Task</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearTask}
                      disabled={savingAction}
                      className="h-8 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Clear Task
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Action:</span>
                      <div className="font-medium capitalize">{viewRecord.actionType}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Priority:</span>
                      <div className="font-medium capitalize">{viewRecord.priority}</div>
                    </div>
                    {viewRecord.dueTime && (
                      <div>
                        <span className="text-muted-foreground">Due:</span>
                        <div className="font-medium">{format(new Date(viewRecord.dueTime), 'MMM d, yyyy h:mm a')}</div>
                      </div>
                    )}
                    {viewRecord.assignedTo && (
                      <div>
                        <span className="text-muted-foreground">Assigned To:</span>
                        <div className="font-medium">{viewRecord.assignedTo}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
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
            setOptimizedRecordIds([]);
          }}
          recordIds={optimizedRecordIds}
          onRouteSaved={async () => {
            // Reload active routes after route is saved
            await loadActiveRoutes();
            setOptimizedRoutes(null);
            setOptimizedRecordIds([]);
          }}
          />
        )}

      {/* Area Selector Map - Wizard Version */}
      <AreaSelectorMap
        isOpen={areaSelectorOpen}
        onClose={() => setAreaSelectorOpen(false)}
        unavailablePropertyIds={new Set([...depotRecordIds, ...recordsInRoutes])}
        onOptimize={async ({ startingPoint, area, selectedProperties }) => {
          // Find the record that matches the starting point property
          const depotRecord = filteredRecords.find(r => r.document_number === startingPoint.property.id) ||
                              records.find(r => r.document_number === startingPoint.property.id);
          
          if (!depotRecord) {
            toast({
              title: "Error",
              description: "Starting point record not found.",
              variant: "destructive",
            });
            return;
          }

          // Convert selectedProperties (PropertyLike) to PreForeclosureRecord objects
          const propertyMap = new Map(records.map(r => [r.document_number, r]));
          const selectedRecords: PreForeclosureRecord[] = [];
          
          console.log('[PreForeclosure] Area selector received:', {
            selectedPropertiesCount: selectedProperties.length,
            depotId: depotRecord.document_number
          });

          // CRITICAL: AreaSelectorMap should already limit to 26, but if it didn't, limit here
          const limitedProperties = selectedProperties.length > 26 
            ? selectedProperties.slice(0, 26) 
            : selectedProperties;
          
          if (selectedProperties.length > 26) {
            console.error('[PreForeclosure] WARNING: Area selector returned more than 26 properties!', selectedProperties.length, '-> limiting to 26');
          }

          for (const sp of limitedProperties) {
            const record = propertyMap.get(sp.id);
            if (record && record.latitude != null && record.longitude != null) {
              selectedRecords.push(record);
            }
          }

          console.log('[PreForeclosure] Area selector optimization:', {
            selectedPropertiesCount: selectedProperties.length,
            limitedPropertiesCount: limitedProperties.length,
            convertedRecordsCount: selectedRecords.length,
            depotId: depotRecord.document_number
          });

          // Ensure depot is included and first
          const depotIndex = selectedRecords.findIndex(r => r.document_number === depotRecord.document_number);
          if (depotIndex > 0) {
            // Depot exists but not first - move to first
            selectedRecords.splice(depotIndex, 1);
            selectedRecords.unshift(depotRecord);
          } else if (depotIndex === -1) {
            // Depot not in list - add it first, remove last if needed
            if (selectedRecords.length >= 25) {
              selectedRecords.pop(); // Remove last to make room
            }
            selectedRecords.unshift(depotRecord);
          }

          // FINAL CHECK: Ensure exactly 25 or less (1 depot + up to 24 others)
          if (selectedRecords.length > 25) {
            console.error('[PreForeclosure] CRITICAL: selectedRecords still exceeds 25 after depot handling!', selectedRecords.length);
            const depotInFinal = selectedRecords[0]?.document_number === depotRecord.document_number;
            if (depotInFinal) {
              selectedRecords.splice(25); // Keep first 25 (depot + 24 others)
            } else {
              // Depot not first - fix it
              const finalDepotIndex = selectedRecords.findIndex(r => r.document_number === depotRecord.document_number);
              if (finalDepotIndex >= 0) {
                selectedRecords.splice(finalDepotIndex, 1);
                selectedRecords.unshift(depotRecord);
              }
              selectedRecords.splice(25); // Keep first 25
            }
            console.error('[PreForeclosure] Force-limited to 25:', selectedRecords.length);
          }

          // Final validation before sending to backend
          if (selectedRecords.length > 25) {
            toast({
              title: "Route Optimization Failed",
              description: `Too many records selected (${selectedRecords.length}). Maximum 25 allowed (1 starting point + 24 properties). Please select a smaller area.`,
              variant: "destructive",
            });
            console.error('[PreForeclosure] Aborting route creation - too many records:', selectedRecords.length);
            return;
          }

          console.log('[PreForeclosure] Final selectedRecords count before route creation:', selectedRecords.length);
          
          // Auto-select all selected properties (for UI consistency)
          const propertyIds = new Set(selectedRecords.map(r => r.document_number));
          setSelectedRecordIds(propertyIds);
          
          // Create route with depot, passing the limited records from area selector
          await handleCreateRouteWithDepot(depotRecord, startingPoint.pinLocation, selectedRecords);
        }}
        properties={filteredRecords.filter(r => r.latitude != null && r.longitude != null).map(r => ({
          id: r.document_number,
          latitude: r.latitude!,
          longitude: r.longitude!,
          propertyAddress: r.address || '',
          address: r.address || '',
          ownerName: r.property_owner || '',
          accountNumber: r.document_number
        }))}
        numVehicles={numVehicles}
      />

      {/* Route Details Modal */}
      <Dialog open={routeDetailsOpen} onOpenChange={setRouteDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (viewRoute?.routeData) {
                          // Extract record IDs from the route (current records in the route)
                          const routeRecordIds = (viewRoute.records || [])
                            .map((rr: any) => {
                              const docNumber = rr.record?.documentNumber || rr.record?.document_number || rr.documentNumber || rr.document_number;
                              return docNumber;
                            })
                            .filter(Boolean);
                          
                          // Ensure we have record IDs
                          if (routeRecordIds.length === 0) {
                            toast({
                              title: "Error",
                              description: "No records found in route. Cannot display route map.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // Get current route records sorted by orderIndex
                          const sortedRecords = [...(viewRoute.records || [])].sort((a, b) => a.orderIndex - b.orderIndex);
                          
                          // Create a map of document numbers to route records for quick lookup
                          const recordMap = new Map<string, any>();
                          sortedRecords.forEach(rr => {
                            const docNum = rr.record?.documentNumber || rr.record?.document_number;
                            if (docNum) {
                              recordMap.set(docNum, rr);
                            }
                          });
                          
                          // Rebuild waypoints in the correct order based on current orderIndex
                          const allWaypoints: any[] = [];
                          sortedRecords.forEach(rr => {
                            const docNum = rr.record?.documentNumber || rr.record?.document_number;
                            if (!docNum) return;
                            
                            // Find matching waypoint in original routeData
                            const matchingWaypoint = viewRoute.routeData?.routes?.[0]?.waypoints?.find((wp: any) => {
                              const wpId = wp.id || wp.documentNumber || wp.document_number || wp.originalId;
                              return wpId === docNum || wpId === 'depot' && rr.isDepot;
                            });
                            
                            if (matchingWaypoint) {
                              allWaypoints.push({
                                ...matchingWaypoint,
                                id: rr.isDepot ? 'depot' : docNum,
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
                          
                          // Set optimizedRecordIds BEFORE setting optimizedRoutes to ensure it's available when RouteMap opens
                          setOptimizedRecordIds(routeRecordIds);
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
                          <div className="border border-border rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="bg-secondary/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-24">Order</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground hidden">Document #</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Address</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground hidden">City</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground hidden">ZIP</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-40">Internal Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-32">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-24">Details</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-12"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedRecords.length === 0 ? (
                                    <tr>
                                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                                        No records in this route.
                                      </td>
                                    </tr>
                                  ) : (
                                    sortedRecords.map((routeRecord, index) => {
                                      const record = routeRecord.record;
                                      if (!record) return null; // Safety check
                                      // Handle both camelCase (from backend) and snake_case (from interface)
                                      const documentNumber = record.document_number || record.documentNumber || '';
                                      if (!documentNumber) return null; // Skip if no document number
                                      return (
                                        <SortableRow
                                          key={routeRecord.id}
                                          routeRecord={routeRecord}
                                          index={index}
                                          viewRoute={viewRoute}
                                          documentNumber={documentNumber}
                                          record={record}
                                          removingRecordId={removingRecordId}
                                          reorderingRecordId={reorderingRecordId}
                                          handleRemoveRecordFromRoute={handleRemoveRecordFromRoute}
                                          handleMarkVisited={handleMarkVisited}
                                          handleViewRecordDetails={handleViewRecordDetails}
                                          markingVisited={markingVisited}
                                          handleStatusChange={handleStatusChange}
                                        />
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
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

      </div>
    );
  }

