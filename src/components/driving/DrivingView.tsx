import { useState, useRef } from 'react';
import { MapPin, Trash2, Loader2, StickyNote, Plus, Camera, X, FileText } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: leads = [], isLoading } = useDrivingLeads();
  const createMutation = useCreateDrivingLead();
  const updateMutation = useUpdateDrivingLead();
  const deleteMutation = useDeleteDrivingLead();
  const uploadPhotosMutation = useUploadDrivingPhotos();

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
        setSelectedProperty(found);
      } else {
        toast({ title: 'No matching property found', description: 'This address is not in the properties database yet.', variant: 'destructive' });
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

  return (
    <div className="p-2 md:p-4 space-y-4 max-w-2xl mx-auto">
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

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {leads.length} address{leads.length !== 1 ? 'es' : ''} logged
      </div>

      {/* Lead list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No addresses logged yet.</p>
          <p className="text-xs mt-1">Type an address above while driving around!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <div key={lead.id} className={cn(
              "bg-card rounded-lg border p-3 space-y-2",
              lead.status === 'DEAD' && 'opacity-50'
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{lead.street}</p>
                  <p className="text-xs text-muted-foreground">
                    {lead.city}, {lead.state} {lead.zip}
                  </p>
                  {lead.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{lead.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Property Details button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => handleViewDetails(lead)}
                    disabled={loadingDetailsId === lead.id}
                  >
                    {loadingDetailsId === lead.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {/* Camera button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary relative"
                    onClick={() => fileInputRefs.current[lead.id]?.click()}
                    disabled={uploadingLeadId === lead.id}
                  >
                    {uploadingLeadId === lead.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
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
                  <input
                    ref={(el) => { fileInputRefs.current[lead.id] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handlePhotoCapture(lead.id, e)}
                  />
                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(lead.id)}
                    disabled={deletingId === lead.id}
                  >
                    {deletingId === lead.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Photo thumbnails */}
              {(lead.photoCount ?? 0) > 0 && (
                <PhotoThumbnails leadId={lead.id} onViewAll={() => setViewingPhotosLeadId(lead.id)} />
              )}

              <div className="flex items-center justify-between">
                <Select
                  value={lead.status}
                  onValueChange={(v) => handleStatusChange(lead.id, v as DrivingLeadStatus)}
                >
                  <SelectTrigger className={cn("h-7 w-[150px] text-xs border", STATUS_CONFIG[lead.status].color)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(STATUS_CONFIG) as [DrivingLeadStatus, { label: string }][]).map(([value, { label }]) => (
                      <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
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
