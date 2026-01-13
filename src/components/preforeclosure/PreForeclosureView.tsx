import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2, AlertCircle, Upload, Filter, Search, X, FileText, Calendar, Trash2, Eye, Send, ExternalLink, MapPin, CheckCircle, Target, Route as RouteIcon, Check, RotateCcw } from 'lucide-react';
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
import { solveVRP, getActiveRoutes, markPreForeclosureVisited, deleteRoute, removeRecordFromRoute } from '@/lib/api';

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

export function PreForeclosureView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PreForeclosureType | 'all'>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [zipFilter, setZipFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<PreForeclosureStatus | 'all'>('all');
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
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
    if (typeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === typeFilter);
    }

    // City filter
    if (cityFilter !== 'all') {
      filtered = filtered.filter(r => r.city === cityFilter);
    }

    // ZIP filter
    if (zipFilter !== 'all') {
      filtered = filtered.filter(r => r.zip === zipFilter);
    }

    // Month filter
    if (monthFilter !== 'all') {
      filtered = filtered.filter(r => r.filing_month === monthFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.internal_status === statusFilter);
    }

    // Needs follow-up filter
    if (needsFollowUp) {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(r => 
        r.next_follow_up_date && r.next_follow_up_date <= today
      );
    }

    return filtered;
  }, [records, searchQuery, typeFilter, cityFilter, zipFilter, monthFilter, statusFilter, needsFollowUp]);

  const handleStatusChange = async (record: PreForeclosureRecord, newStatus: PreForeclosureStatus) => {
    await updateMutation.mutateAsync({
      document_number: record.document_number,
      internal_status: newStatus,
    });
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
      setViewRecord(record);
      setViewOpen(true);
    } else {
      toast({
        title: 'Record Not Found',
        description: `Could not find record with document number ${documentNumber}`,
        variant: 'destructive',
      });
    }
  };

  const handleRemoveRecordFromRoute = async (routeId: string, recordId: string, documentNumber: string) => {
    if (!confirm(`Are you sure you want to remove this property (${documentNumber}) from the route?`)) {
      return;
    }

    setRemovingRecordId(recordId);
    try {
      const result = await removeRecordFromRoute(routeId, recordId);
      
      // Update the viewRoute with the updated route
      if (result.route) {
        setViewRoute(result.route);
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
        description: `Optimized route for ${selectedRecords.length} records using ${numVehicles} vehicle(s). Total distance: ${solution.totalDistance.toFixed(2)} km. ${routeRecordIds.size} records added to routes.`,
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
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold">Pre-Foreclosure Records</h2>
        {!isLoading && !error && (
          <p className="text-sm text-muted-foreground mt-1">
            {filteredRecords.length.toLocaleString()} active record{filteredRecords.length !== 1 ? 's' : ''}
            {records.length > filteredRecords.length && (
              <span className="ml-2">
                ({records.length - filteredRecords.length} inactive)
              </span>
            )}
          </p>
        )}
      </div>
      <div className="flex gap-2 items-center">
        {selectedRecordIds.size > 0 && (
          <>
            <span className="text-sm text-muted-foreground mr-2">
              {selectedRecordIds.size} selected
            </span>
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
              className="bg-primary text-primary-foreground"
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
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete All Records
        </Button>
        <Button onClick={() => setUploadOpen(true)} size="lg">
          <Upload className="h-4 w-4 mr-2" />
          Upload Pre-Foreclosure File
        </Button>
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

      {/* Actions Panel */}
      <div className="bg-secondary/30 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium">Actions</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeAction === 'view' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveAction('view')}
            className={cn(
              "flex-1",
              activeAction === 'view' && "bg-primary text-primary-foreground"
            )}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant={activeAction === 'send' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveAction('send');
              // If there's a selected record, open Google Maps
              if (selectedRecord && selectedRecord.latitude != null && selectedRecord.longitude != null) {
                const mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(selectedRecord.address)},+${encodeURIComponent(selectedRecord.city)},+TX+${selectedRecord.zip}/@${selectedRecord.latitude},${selectedRecord.longitude},16z`;
                window.open(mapsUrl, '_blank');
              } else if (viewRecord && viewRecord.latitude != null && viewRecord.longitude != null) {
                const mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(viewRecord.address)},+${encodeURIComponent(viewRecord.city)},+TX+${viewRecord.zip}/@${viewRecord.latitude},${viewRecord.longitude},16z`;
                window.open(mapsUrl, '_blank');
              } else {
                toast({
                  title: 'No location available',
                  description: 'Please select a record with latitude and longitude to open in Google Maps',
                  variant: 'destructive',
                });
              }
            }}
            className={cn(
              "flex-1",
              activeAction === 'send' && "bg-primary text-primary-foreground"
            )}
            title="Open selected record in Google Maps"
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            variant={activeAction === 'external' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveAction('external');
              window.open('https://bexar.acttax.com/act_webdev/bexar/index.jsp', '_blank');
            }}
            className={cn(
              "flex-1",
              activeAction === 'external' && "bg-primary text-primary-foreground"
            )}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
                      console.log('Route card clicked:', route.id);
                      setViewRoute(route);
                      setRouteDetailsOpen(true);
                      console.log('Modal should open, routeDetailsOpen:', true);
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${driverColor}`} />
                        <span className="font-semibold">{route.driver}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(route.createdAt).toLocaleDateString()}
                      </span>
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
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground">
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

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filters:</span>
          </div>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as PreForeclosureType | 'all')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Mortgage">Mortgage</SelectItem>
              <SelectItem value="Tax">Tax</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {uniqueCities.map(city => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={zipFilter} onValueChange={setZipFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="ZIP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ZIPs</SelectItem>
              {uniqueZips.map(zip => (
                <SelectItem key={zip} value={zip}>{zip}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filing Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {uniqueMonths.map(month => (
                <SelectItem key={month} value={month}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PreForeclosureStatus | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Contact Attempted">Contact Attempted</SelectItem>
              <SelectItem value="Monitoring">Monitoring</SelectItem>
              <SelectItem value="Dead">Dead</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={needsFollowUp ? "default" : "outline"}
            size="sm"
            onClick={() => setNeedsFollowUp(!needsFollowUp)}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Needs Follow-Up
          </Button>

          {(typeFilter !== 'all' || cityFilter !== 'all' || zipFilter !== 'all' || monthFilter !== 'all' || statusFilter !== 'all' || needsFollowUp || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTypeFilter('all');
                setCityFilter('all');
                setZipFilter('all');
                setMonthFilter('all');
                setStatusFilter('all');
                setNeedsFollowUp(false);
                setSearchQuery('');
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
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
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                    <Checkbox
                      checked={selectedRecordIds.size > 0 && selectedRecordIds.size === filteredRecords.length && filteredRecords.length > 0}
                      onCheckedChange={(checked) => {
                        try {
                          // Batch update: create a new Set with all selected/unselected IDs at once
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
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Document #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">City</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">ZIP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Filing Month</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Internal Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Visited</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Next Follow-Up</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRecords.map((record) => (
                  <tr 
                    key={record.document_number} 
                    className={cn(
                      "hover:bg-secondary/30 transition-colors",
                      selectedRecordIds.has(record.document_number) && "bg-primary/10"
                    )}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedRecordIds.has(record.document_number)}
                        onCheckedChange={(checked) => {
                          handleRecordSelect(record.document_number, checked as boolean);
                        }}
                        title="Select record"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{record.document_number}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={getTypeColor(record.type)}>
                        {record.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{record.address}</td>
                    <td className="px-4 py-3 text-sm">{record.city}</td>
                    <td className="px-4 py-3 font-mono text-sm">{record.zip}</td>
                    <td className="px-4 py-3 text-sm">{record.filing_month}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={record.internal_status}
                        onValueChange={(v) => handleStatusChange(record, v as PreForeclosureStatus)}
                      >
                        <SelectTrigger className="w-[160px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Contact Attempted">Contact Attempted</SelectItem>
                          <SelectItem value="Monitoring">Monitoring</SelectItem>
                          <SelectItem value="Dead">Dead</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {record.visited === true ? (
                        <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                          Visited
                        </Badge>
                      ) : recordsInRoutes && recordsInRoutes.has(record.document_number) ? (
                        <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                          In Progress
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          Not in Route
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {record.last_action_date
                        ? format(new Date(record.last_action_date), 'MMM d, yyyy')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.next_follow_up_date ? (
                        <span className={cn(
                          "font-medium",
                          new Date(record.next_follow_up_date) <= new Date()
                            ? "text-red-500"
                            : "text-muted-foreground"
                        )}>
                          {format(new Date(record.next_follow_up_date), 'MMM d, yyyy')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleNotesClick(record)}
                        title={record.notes ? 'View/Edit Notes' : 'Add Notes'}
                      >
                        <FileText className={cn(
                          "h-4 w-4",
                          record.notes ? "text-primary" : "text-muted-foreground"
                        )} />
                      </Button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setViewRecord(record);
                            setViewOpen(true);
                          }}
                          title="View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
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
                          title="Open in Google Maps"
                          disabled={record.latitude == null || record.longitude == null}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            window.open('https://bexar.acttax.com/act_webdev/bexar/index.jsp', '_blank');
                          }}
                          title="External Link"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                              documentNumber: viewRecord.document_number,
                              updates: {
                                notes: viewRecord.notes || '',
                              },
                            });
                            toast({
                              title: 'Notes Saved',
                              description: 'Notes have been saved successfully.',
                            });
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
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Current Task</span>
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
              {viewRoute && (
                <>
                  Driver: {viewRoute.driver} • {viewRoute.records?.length || 0} stops • 
                  {viewRoute.routeData?.totalDistance ? ` ${viewRoute.routeData.totalDistance.toFixed(2)} km` : ''}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewRoute && (
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
                  <div className="font-semibold">{new Date(viewRoute.createdAt).toLocaleDateString()}</div>
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
                      // Extract record IDs from the route
                      const routeRecordIds = viewRoute.records
                        ?.map((rr: any) => {
                          const docNumber = rr.record?.documentNumber || rr.record?.document_number || rr.documentNumber || rr.document_number;
                          return docNumber;
                        })
                        .filter(Boolean) || [];
                      setOptimizedRecordIds(routeRecordIds);
                      setOptimizedRoutes(viewRoute.routeData);
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
                <h3 className="text-lg font-semibold mb-3">Route Stops ({viewRoute.records?.length || 0})</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-secondary/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-24">Order</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Document #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Address</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">City</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">ZIP</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-32">Actions</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-24">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRoute.records
                          ?.sort((a, b) => {
                            // Always put depot first
                            if (a.isDepot && !b.isDepot) return -1;
                            if (!a.isDepot && b.isDepot) return 1;
                            // Then sort by orderIndex for non-depot records
                            return a.orderIndex - b.orderIndex;
                          })
                          .map((routeRecord, index) => {
                            const record = routeRecord.record;
                            // Handle both camelCase (from backend) and snake_case (from interface)
                            const documentNumber = record.document_number || record.documentNumber || '';
                            return (
                              <tr
                                key={routeRecord.id}
                                className={`border-t border-border hover:bg-secondary/30 ${
                                  routeRecord.isDepot ? 'bg-primary/10' : ''
                                }`}
                              >
                                <td className="px-4 py-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    {routeRecord.isDepot ? (
                                      <Badge variant="default" className="bg-primary">Depot</Badge>
                                    ) : (
                                      <>
                                        <span className="font-medium">{routeRecord.orderIndex}</span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRecordFromRoute(viewRoute.id, routeRecord.id, documentNumber);
                                          }}
                                          disabled={removingRecordId === routeRecord.id}
                                          className="h-7 w-7 p-0 text-red-500 border-red-500/50 hover:text-red-600 hover:bg-red-500/20 hover:border-red-500"
                                          title="Remove from route"
                                        >
                                          {removingRecordId === routeRecord.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
                                          ) : (
                                            <X className="h-3.5 w-3.5" />
                                          )}
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-sm font-mono">{documentNumber}</td>
                                <td className="px-4 py-2 text-sm">{record.address}</td>
                                <td className="px-4 py-2 text-sm">{record.city}</td>
                                <td className="px-4 py-2 text-sm">{record.zip}</td>
                                <td className="px-4 py-2 text-sm">
                                  {record.visited ? (
                                    <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-500">
                                      Visited
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">Pending</Badge>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  {documentNumber && (
                                    <>
                                      {!record.visited ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMarkVisited(documentNumber, viewRoute.driver, true);
                                          }}
                                          disabled={markingVisited === documentNumber}
                                          className="h-7 text-xs"
                                        >
                                          {markingVisited === documentNumber ? (
                                            <>
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              Marking...
                                            </>
                                          ) : (
                                            'Mark Visited'
                                          )}
                                        </Button>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMarkVisited(documentNumber, viewRoute.driver, false);
                                          }}
                                          disabled={markingVisited === documentNumber}
                                          className="h-7 text-xs text-muted-foreground"
                                        >
                                          {markingVisited === documentNumber ? (
                                            <>
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              Updating...
                                            </>
                                          ) : (
                                            <>
                                              <RotateCcw className="h-3 w-3 mr-1" />
                                              Set Pending
                                            </>
                                          )}
                                        </Button>
                                      )}
                                    </>
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
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      </div>
    );
  }

