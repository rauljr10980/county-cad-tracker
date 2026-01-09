import { useState, useMemo, useEffect } from 'react';
import { FileSpreadsheet, Loader2, AlertCircle, Upload, Filter, Search, X, FileText, Calendar, Trash2, Eye, Send, ExternalLink, MapPin, CheckCircle, Target, Route } from 'lucide-react';
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
import { solveVRP } from '@/lib/api';
import { RouteMap } from '@/components/routing/RouteMap';

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
    setSelectedRecordIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(documentNumber);
      } else {
        newSet.delete(documentNumber);
      }
      return newSet;
    });
  };

  const handleCreateRoute = async () => {
    // Get selected records with valid coordinates
    const selectedRecords = filteredRecords.filter(r => 
      selectedRecordIds.has(r.document_number) && 
      r.latitude != null && 
      r.longitude != null
    );

    if (selectedRecords.length === 0) {
      toast({
        title: "No valid locations",
        description: "Please select records with latitude and longitude coordinates",
        variant: "destructive",
      });
      return;
    }

    if (selectedRecords.length > 500) {
      toast({
        title: "Too many records",
        description: "Maximum 500 records allowed for route optimization. For larger batches, please select fewer records.",
        variant: "destructive",
      });
      return;
    }

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
      const solution = await solveVRP(properties, numVehicles);

      if (!solution.success || !solution.routes || solution.routes.length === 0) {
        throw new Error('No routes generated');
      }

      // Store routes and show map visualization
      setOptimizedRoutes(solution);
      setRouteMapOpen(true);
      
      toast({
        title: "Route Optimized",
        description: `Optimized route for ${selectedRecords.length} records using ${numVehicles} vehicle(s). Total distance: ${solution.totalDistance.toFixed(2)} km.`,
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
                  <Route className="h-4 w-4 mr-2" />
                  Optimize Route
                </>
              )}
            </Button>
            <Button
              onClick={() => setSelectedRecordIds(new Set())}
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
                        filteredRecords.forEach(record => {
                          handleRecordSelect(record.document_number, checked as boolean);
                        });
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
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

