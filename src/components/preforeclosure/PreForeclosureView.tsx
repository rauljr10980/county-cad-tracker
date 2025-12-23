import { useState, useMemo, useCallback } from 'react';
import { FileSpreadsheet, Loader2, AlertCircle, Upload, Filter, Search, X, FileText, Calendar, MapPin, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { usePreForeclosures, useUpdatePreForeclosure, useUploadPreForeclosureFile } from '@/hooks/usePreForeclosure';
import { PreForeclosureRecord, PreForeclosureType, PreForeclosureStatus } from '@/types/property';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

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

  const { data: records = [], isLoading, error } = usePreForeclosures();
  const updateMutation = useUpdatePreForeclosure();
  const uploadMutation = useUploadPreForeclosureFile();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      // Validate file type
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select an Excel file (.xlsx or .xls)',
          variant: 'destructive',
        });
        return;
      }
      // Validate file size (100MB limit)
      if (file.size > 100 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'File size must be less than 100MB',
          variant: 'destructive',
        });
        return;
      }
      handleFileUpload(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select an Excel file (.xlsx or .xls)',
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
      <Button onClick={() => setUploadOpen(true)} size="lg">
        <Upload className="h-4 w-4 mr-2" />
        Upload Pre-Foreclosure File
      </Button>
    </div>
  );

  // Upload Modal Component (rendered once at the end)
  const uploadModal = (
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Pre-Foreclosure File</DialogTitle>
              <DialogDescription>
                Upload an Excel file (.xlsx or .xls) with pre-foreclosure records.
                Required columns: Document Number, Type (Mortgage/Tax), Address, City, ZIP, Filing Month (optional).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Excel File (.xlsx or .xls)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validate file type
                      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                        toast({
                          title: 'Invalid file type',
                          description: 'Please select an Excel file (.xlsx or .xls)',
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Pre-Foreclosure File</DialogTitle>
              <DialogDescription>
                Upload an Excel file (.xlsx or .xls) with pre-foreclosure records.
                Required columns: Document Number, Type (Mortgage/Tax), Address, City, ZIP, Filing Month (optional).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Excel File (.xlsx or .xls)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validate file type
                      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                        toast({
                          title: 'Invalid file type',
                          description: 'Please select an Excel file (.xlsx or .xls)',
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
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {headerSection}

      {/* File Upload Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-all',
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-secondary/20',
          uploadMutation.isPending && 'border-primary/50 bg-primary/5',
          uploadMutation.isSuccess && 'border-green-500/50 bg-green-500/5',
          uploadMutation.isError && 'border-destructive/50 bg-destructive/5'
        )}
      >
        {!uploadMutation.isPending && !uploadMutation.isSuccess && !uploadMutation.isError && (
          <>
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-2">Upload Pre-Foreclosure File</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Drag and drop your Excel file here, or click to browse
            </p>
            <label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button asChild>
                <span className="cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Select File
                </span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-3">
              Supports .xlsx and .xls files up to 100MB
            </p>
          </>
        )}

        {uploadMutation.isPending && (
          <>
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
            <h3 className="text-base font-semibold mb-2">Uploading & Processing...</h3>
            <p className="text-sm text-muted-foreground">
              Processing your pre-foreclosure file...
            </p>
          </>
        )}

        {uploadMutation.isSuccess && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="text-base font-semibold mb-2 text-green-500">Upload Complete!</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Your file has been processed successfully.
            </p>
            <Button onClick={() => uploadMutation.reset()} variant="outline" size="sm">
              Upload Another File
            </Button>
          </>
        )}

        {uploadMutation.isError && (
          <>
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-base font-semibold mb-2 text-destructive">Upload Error</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Upload failed'}
            </p>
            <Button onClick={() => uploadMutation.reset()} variant="outline" size="sm">
              Try Again
            </Button>
          </>
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
      {filteredRecords.length === 0 ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Records Found</h3>
          <p className="text-muted-foreground">
            {records.length === 0
              ? 'Upload a pre-foreclosure file to get started.'
              : 'No records match your current filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRecords.map((record) => (
                  <tr key={record.document_number} className="hover:bg-secondary/30 transition-colors">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal}
          <DialogHeader>
            <DialogTitle>Upload Pre-Foreclosure File</DialogTitle>
            <DialogDescription>
              Upload an Excel file (.xlsx or .xls) with pre-foreclosure records.
              Required columns: Document Number, Type (Mortgage/Tax), Address, City, ZIP, Filing Month (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Excel File (.xlsx or .xls)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Validate file type
                    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                      toast({
                        title: 'Invalid file type',
                        description: 'Please select an Excel file (.xlsx or .xls)',
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
    </div>
  );
}

