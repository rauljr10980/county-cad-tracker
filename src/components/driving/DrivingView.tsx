import { useState, useRef, useEffect } from 'react';
import { MapPin, Trash2, Loader2, StickyNote, Plus, Camera, X, FileText, Search, ChevronDown, Phone } from 'lucide-react';
import { D4dPipelineView } from './D4dPipelineView';
import { HeirsCallTrackerView } from './HeirsCallTrackerView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDrivingLeads, useCreateDrivingLead, useUpdateDrivingLead, useDeleteDrivingLead, useUploadDrivingPhotos, useDrivingPhotos, useDeleteDrivingPhoto } from '@/hooks/useDrivingLeads';
import type { DrivingLeadStatus, Property } from '@/types/property';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { getProperties } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { compressImage } from '@/lib/imageCompress';

const STATUS_CONFIG: Record<DrivingLeadStatus, { label: string; color: string }> = {
  NEW: { label: 'New', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  RESEARCHING: { label: 'Researching', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
  CONTACTED: { label: 'Contacted', color: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
  UNDER_CONTRACT: { label: 'Under Contract', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
  DEAD: { label: 'Dead', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
  FOUND_OBITUARY: { label: 'Found Obituary', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
};

function PhotoGallery({ leadId }: { leadId: string }) {
  const { data: photos = [], isLoading } = useDrivingPhotos(leadId);
  const deleteMutation = useDeleteDrivingPhoto();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No photos yet.</p>;
  }

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      {photos.map((photo) => (
        <div key={photo.id} className="relative">
          <img
            src={`data:image/jpeg;base64,${photo.data}`}
            alt="Property"
            className="w-full rounded-lg"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={() => deleteMutation.mutate({ leadId, photoId: photo.id })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}

function PhotoThumbnails({ leadId, onViewAll }: { leadId: string; onViewAll: () => void }) {
  const { data: photos = [] } = useDrivingPhotos(leadId);

  if (photos.length === 0) return null;

  return (
    <div className="flex gap-1.5 mt-2 cursor-pointer" onClick={onViewAll}>
      {photos.slice(0, 3).map((photo) => (
        <img
          key={photo.id}
          src={`data:image/jpeg;base64,${photo.data}`}
          alt="Property"
          className="h-12 w-12 rounded object-cover border"
        />
      ))}
      {photos.length > 3 && (
        <div className="h-12 w-12 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
          +{photos.length - 3}
        </div>
      )}
    </div>
  );
}

export function DrivingView() {
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingPhotosLeadId, setViewingPhotosLeadId] = useState<string | null>(null);
  const [uploadingLeadId, setUploadingLeadId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<Record<string, 'found' | 'not_found'>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddresses, setShowAddresses] = useState(false);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'heirs'>('pipeline');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [callSort, setCallSort] = useState<'latest' | 'earliest' | null>(null);

  const { data: leads = [], isLoading } = useDrivingLeads();
  const createMutation = useCreateDrivingLead();
  const updateMutation = useUpdateDrivingLead();
  const deleteMutation = useDeleteDrivingLead();
  const uploadPhotosMutation = useUploadDrivingPhotos();

  // Check all leads against the properties DB on load
  useEffect(() => {
    if (leads.length === 0) return;
    const unchecked = leads.filter(l => !dbStatus[l.id]);
    if (unchecked.length === 0) return;

    (async () => {
      try {
        const result = await getProperties(1, 50000);
        const properties = (result.properties || result.data || result) as Property[];
        const statusMap: Record<string, 'found' | 'not_found'> = { ...dbStatus };
        for (const lead of unchecked) {
          const street = (lead.street || '').toLowerCase();
          if (!street) { statusMap[lead.id] = 'not_found'; continue; }
          const match = properties.find(p =>
            p.propertyAddress?.toLowerCase().includes(street)
          );
          statusMap[lead.id] = match ? 'found' : 'not_found';
        }
        setDbStatus(statusMap);
      } catch {
        // silently fail — dots just won't show
      }
    })();
  }, [leads]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    try {
      await createMutation.mutateAsync({
        address: address.trim(),
        notes: notes.trim() || undefined,
      });
      setAddress('');
      setNotes('');
      setShowNotes(false);
      inputRef.current?.focus();
      toast({ title: 'Address logged!' });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  };

  const handleStatusChange = (id: string, status: DrivingLeadStatus) => {
    updateMutation.mutate({ id, status });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: 'Lead deleted' });
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewDetails = async (lead: typeof leads[0]) => {
    setLoadingDetailsId(lead.id);
    try {
      const searchTerm = lead.street || lead.rawAddress;
      const result = await getProperties(1, 100, undefined, searchTerm);
      const properties = result.properties || result.data || result;
      const found = (properties as Property[]).find(p =>
        p.propertyAddress?.toLowerCase().includes(lead.street?.toLowerCase() || '')
      );
      if (found) {
        setDbStatus(prev => ({ ...prev, [lead.id]: 'found' }));
        setSelectedProperty({
          ...found,
          d4dLeadId: lead.id,
          d4dStatus: lead.status,
          metadata: (lead as any).metadata || null,
        } as unknown as Property);
      } else {
        // No match — open modal with a stub so user can still view address & enter details
        setDbStatus(prev => ({ ...prev, [lead.id]: 'not_found' }));
        const fullAddress = [lead.street, lead.city, lead.state, lead.zip].filter(Boolean).join(', ') || lead.rawAddress || '';
        setSelectedProperty({
          id: `d4d-${lead.id}`,
          accountNumber: '',
          ownerName: (lead as any).ownerName || '',
          propertyAddress: fullAddress,
          mailingAddress: '',
          status: 'UNKNOWN',
          totalAmountDue: 0,
          totalPercentage: 0,
          latitude: lead.latitude,
          longitude: lead.longitude,
          notes: lead.notes || '',
          phoneNumbers: (lead as any).phoneNumbers || [],
          ownerPhoneIndex: (lead as any).ownerPhoneIndex ?? undefined,
          emails: (lead as any).emails || [],
          contacts: (lead as any).contacts || null,
          d4dStatus: lead.status,
          metadata: (lead as any).metadata || null,
        } as unknown as Property);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load property details', variant: 'destructive' });
    } finally {
      setLoadingDetailsId(null);
    }
  };

  const handlePhotoCapture = async (leadId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingLeadId(leadId);
    try {
      const compressed = await Promise.all(
        files.slice(0, 5).map(async (file) => ({
          data: await compressImage(file),
        }))
      );
      await uploadPhotosMutation.mutateAsync({ leadId, photos: compressed });
      toast({ title: `${compressed.length} photo${compressed.length > 1 ? 's' : ''} uploaded!` });
    } catch {
      toast({ title: 'Failed to upload photo', variant: 'destructive' });
    } finally {
      setUploadingLeadId(null);
    }
    e.target.value = '';
  };

  const filteredLeads = leads
    .filter(lead => {
      if (statusFilter && lead.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (lead.rawAddress && lead.rawAddress.toLowerCase().includes(q)) ||
        (lead.street && lead.street.toLowerCase().includes(q)) ||
        ((lead as any).ownerName && (lead as any).ownerName.toLowerCase().includes(q)) ||
        ((lead as any).notes && (lead as any).notes.toLowerCase().includes(q)) ||
        ((lead as any).phoneNumbers && Array.isArray((lead as any).phoneNumbers) &&
          (lead as any).phoneNumbers.some((p: string) => p && p.toLowerCase().includes(q)))
      );
    })
    .sort((a, b) => {
      if (!callSort) return 0;
      const aT = (a as any).lastCallTime ? new Date((a as any).lastCallTime).getTime() : null;
      const bT = (b as any).lastCallTime ? new Date((b as any).lastCallTime).getTime() : null;
      // Never-called always goes to the end regardless of sort direction
      if (aT === null && bT === null) return 0;
      if (aT === null) return 1;
      if (bT === null) return -1;
      return callSort === 'latest' ? bT - aT : aT - bT;
    });

  return (
    <div className="p-2 md:p-4 space-y-4 max-w-7xl mx-auto">
      {/* Quick-add form */}
      <form onSubmit={handleSubmit} className="space-y-2 bg-card rounded-lg p-3 border">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            autoFocus
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, San Antonio, TX 78201"
            className="flex-1 text-base"
            disabled={createMutation.isPending}
          />
          <Button type="submit" disabled={!address.trim() || createMutation.isPending} size="icon" className="flex-shrink-0">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <StickyNote className="h-3 w-3" />
            {showNotes ? 'Hide notes' : 'Add notes'}
          </button>
        </div>

        {showNotes && (
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Boarded windows, overgrown yard, mail piling up..."
            rows={2}
            className="text-sm"
          />
        )}
      </form>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by address, phone, name, notes..."
          className="pl-8 text-sm h-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Tab switcher */}
      {leads.length > 0 && (
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={cn(
              'flex-1 text-xs py-1.5 rounded-md font-medium transition-colors',
              activeTab === 'pipeline' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('heirs')}
            className={cn(
              'flex-1 text-xs py-1.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5',
              activeTab === 'heirs' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Phone className="h-3 w-3" />
            Heirs Call Tracker
          </button>
        </div>
      )}

      {/* Heirs Call Tracker tab */}
      {activeTab === 'heirs' && leads.length > 0 && <HeirsCallTrackerView />}

      {/* Pipeline + addresses (hidden when heirs tab is active) */}
      {activeTab === 'pipeline' && (
        <>
          {/* D4$ Pipeline */}
          {leads.length > 0 && <D4dPipelineView
            leads={leads as any}
            onViewDetails={handleViewDetails}
            activeFilter={statusFilter}
            onStageFilter={(s) => {
              setStatusFilter(s);
              if (s) setShowAddresses(true);
            }}
          />}

          {/* Count + collapsible addresses */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="flex items-center justify-between flex-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-w-0"
              onClick={() => setShowAddresses(prev => !prev)}
            >
              <span className="truncate">
                {statusFilter || searchQuery
                  ? `${filteredLeads.length} of ${leads.length}`
                  : leads.length} address{leads.length !== 1 ? 'es' : ''} logged
                {statusFilter && <span className="ml-1.5 text-xs text-primary font-medium">· filtered</span>}
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform shrink-0 ml-1', showAddresses && 'rotate-180')} />
            </button>
            {/* Sort by last call */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                className={cn('text-[11px] px-2 py-0.5 rounded border transition-colors',
                  callSort === 'latest' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground')}
                onClick={() => setCallSort(prev => prev === 'latest' ? null : 'latest')}
              >
                Latest call
              </button>
              <button
                className={cn('text-[11px] px-2 py-0.5 rounded border transition-colors',
                  callSort === 'earliest' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground')}
                onClick={() => setCallSort(prev => prev === 'earliest' ? null : 'earliest')}
              >
                Earliest call
              </button>
            </div>
            {statusFilter && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                onClick={() => setStatusFilter(null)}
              >
                Clear filter
              </button>
            )}
          </div>

      {/* Lead list */}
      {showAddresses && (isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No addresses logged yet.</p>
          <p className="text-xs mt-1">Type an address above while driving around!</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No results for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-muted/40 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>Status</span>
            <span>Address</span>
            <span className="text-right">Last Called</span>
            <span>Actions</span>
          </div>
          {/* Rows */}
          <div className="divide-y divide-border/50">
          {filteredLeads.map((lead) => {
            const heirRows = ((lead as any).contacts?.phoneRows || []).filter(
              (r: any) => r.phones?.some((p: any) => p.number?.trim())
            );
            const lastCallT = (lead as any).lastCallTime;

            function fmtTime(iso: string) {
              const d = new Date(iso);
              const diffH = (Date.now() - d.getTime()) / 3600000;
              if (diffH < 24) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
              if (diffH < 48) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
              return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }

            return (
              <div key={lead.id} className={cn(lead.status === 'DEAD' && 'opacity-40')}>
                {/* Main row */}
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2.5 items-center hover:bg-muted/20 transition-colors">
                  {/* Status */}
                  <Select
                    value={lead.status}
                    onValueChange={(v) => handleStatusChange(lead.id, v as DrivingLeadStatus)}
                  >
                    <SelectTrigger className={cn("h-6 w-[120px] text-[11px] border px-2", STATUS_CONFIG[lead.status].color)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(STATUS_CONFIG) as [DrivingLeadStatus, { label: string }][]).map(([value, { label }]) => (
                        <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Address + notes */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {dbStatus[lead.id] && (
                        <span className={cn("h-2 w-2 rounded-full shrink-0", dbStatus[lead.id] === 'found' ? 'bg-green-500' : 'bg-red-500')} />
                      )}
                      <span className="text-sm font-medium truncate">{lead.street}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{lead.city}, {lead.state}</span>
                    </div>
                    {lead.notes && (
                      <p className="text-xs text-muted-foreground italic truncate mt-0.5">{lead.notes}</p>
                    )}
                  </div>

                  {/* Last called */}
                  <span className={cn('text-xs whitespace-nowrap', lastCallT ? 'text-muted-foreground' : 'text-orange-400')}>
                    {lastCallT ? fmtTime(lastCallT) : '—'}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => handleViewDetails(lead)} disabled={loadingDetailsId === lead.id}>
                      {loadingDetailsId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary relative"
                      onClick={() => fileInputRefs.current[lead.id]?.click()} disabled={uploadingLeadId === lead.id}>
                      {uploadingLeadId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                        <>
                          <Camera className="h-3.5 w-3.5" />
                          {(lead.photoCount ?? 0) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5 leading-none">
                              {lead.photoCount}
                            </span>
                          )}
                        </>
                      )}
                    </Button>
                    <input ref={(el) => { fileInputRefs.current[lead.id] = el; }} type="file"
                      accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => handlePhotoCapture(lead.id, e)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(lead.id)} disabled={deletingId === lead.id}>
                      {deletingId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Photo thumbnails */}
                {(lead.photoCount ?? 0) > 0 && (
                  <div className="px-3 pb-2">
                    <PhotoThumbnails leadId={lead.id} onViewAll={() => setViewingPhotosLeadId(lead.id)} />
                  </div>
                )}

                {/* Heir sub-rows */}
                {heirRows.length > 0 && (
                  <div className="border-t border-dashed border-border/40 divide-y divide-border/20">
                    {heirRows.map((row: any, i: number) => {
                      const phones: any[] = row.phones?.filter((p: any) => p.number?.trim()) || [];
                      const lastCall = phones.reduce((latest: string | null, p: any) => {
                        if (!p.lastCallTime) return latest;
                        return !latest || p.lastCallTime > latest ? p.lastCallTime : latest;
                      }, null);
                      return (
                        <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-1.5 items-center bg-muted/10">
                          <div /> {/* align under Status */}
                          <span className="text-xs text-foreground/70 pl-3 truncate">
                            ↳ {row.name?.trim() || `Contact ${i + 1}`}
                          </span>
                          <span className={cn('text-[10px] whitespace-nowrap', lastCall ? 'text-muted-foreground' : 'text-orange-400')}>
                            {lastCall ? fmtTime(lastCall) : 'Never called'}
                          </span>
                          <div className="w-[88px]" /> {/* align under Actions */}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ))}

        {/* End collapsible addresses list */}
        </>
      )}

      {/* Photo Gallery Dialog */}
      <Dialog open={!!viewingPhotosLeadId} onOpenChange={() => setViewingPhotosLeadId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Photos</DialogTitle>
          </DialogHeader>
          {viewingPhotosLeadId && <PhotoGallery leadId={viewingPhotosLeadId} />}
        </DialogContent>
      </Dialog>

      {/* Property Details Modal */}
      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}
