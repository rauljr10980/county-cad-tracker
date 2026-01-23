import { useState, useEffect } from 'react';
import { X, Save, FileText, MapPin, Calendar, AlertCircle, Eye, Send, ExternalLink, Phone, Star } from 'lucide-react';
import { PreForeclosure, PreForeclosureInternalStatus } from '@/types/property';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { updatePreForeclosure } from '@/lib/api';

interface PreForeclosureDetailsModalProps {
  preforeclosure: PreForeclosure | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (documentNumber: string, updates: Partial<PreForeclosure>) => void;
}

const statusOptions: PreForeclosureInternalStatus[] = ['New', 'Contact Attempted', 'Monitoring', 'Dead'];

const statusColors: Record<PreForeclosureInternalStatus, string> = {
  'New': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Contact Attempted': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Monitoring': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Dead': 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function PreForeclosureDetailsModal({ 
  preforeclosure, 
  isOpen, 
  onClose,
  onUpdate 
}: PreForeclosureDetailsModalProps) {
  const [notes, setNotes] = useState(preforeclosure?.notes || '');
  const [internalStatus, setInternalStatus] = useState<PreForeclosureInternalStatus>(
    preforeclosure?.internal_status || 'New'
  );
  const [nextFollowUp, setNextFollowUp] = useState(preforeclosure?.next_follow_up_date || '');
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>(['', '', '', '', '', '']);
  const [ownerPhoneIndex, setOwnerPhoneIndex] = useState<number | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [savingPhones, setSavingPhones] = useState(false);
  const [activeAction, setActiveAction] = useState<'view' | 'send' | 'external'>('view');

  // Reset form when modal opens with new data
  useEffect(() => {
    if (preforeclosure) {
      setNotes(preforeclosure.notes || '');
      setInternalStatus(preforeclosure.internal_status || 'New');
      setNextFollowUp(preforeclosure.next_follow_up_date || '');
      const phones = preforeclosure.phoneNumbers || [];
      setPhoneNumbers([
        phones[0] || '',
        phones[1] || '',
        phones[2] || '',
        phones[3] || '',
        phones[4] || '',
        phones[5] || '',
      ]);
      setOwnerPhoneIndex(preforeclosure.ownerPhoneIndex);
    }
  }, [preforeclosure]);

  const handleSave = async () => {
    if (!preforeclosure) return;
    
    setIsSaving(true);
    try {
      const updates: Partial<PreForeclosure> = {
        notes,
        internal_status: internalStatus,
        next_follow_up_date: nextFollowUp || undefined,
        last_action_date: new Date().toISOString(),
      };
      
      onUpdate(preforeclosure.document_number, updates);
      toast.success('Record updated successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to update record');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePhoneNumbers = async () => {
    if (!preforeclosure) return;
    
    setSavingPhones(true);
    try {
      const filteredPhones = phoneNumbers.filter(p => p.trim() !== '');
      await updatePreForeclosure({
        document_number: preforeclosure.document_number,
        phoneNumbers: filteredPhones,
        ownerPhoneIndex: ownerPhoneIndex,
      });
      toast.success('Phone numbers saved successfully');
      onUpdate(preforeclosure.document_number, {
        phoneNumbers: filteredPhones,
        ownerPhoneIndex: ownerPhoneIndex,
      });
    } catch (error) {
      toast.error('Failed to save phone numbers');
    } finally {
      setSavingPhones(false);
    }
  };

  if (!preforeclosure) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Pre-Foreclosure Details
          </DialogTitle>
        </DialogHeader>

        {/* Actions Panel - Prominent at top */}
        <div className="bg-secondary/30 rounded-lg p-4 mb-4">
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
              onClick={() => setActiveAction('send')}
              className={cn(
                "flex-1",
                activeAction === 'send' && "bg-primary text-primary-foreground"
              )}
              disabled
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

        <div className="space-y-6">
          {/* Immutable Data Section */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              File Data (Read-Only)
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Document #</Label>
                <p className="font-mono text-sm">{preforeclosure.document_number}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Type</Label>
                <Badge 
                  variant="outline" 
                  className={preforeclosure.type === 'Mortgage' 
                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' 
                    : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  }
                >
                  {preforeclosure.type}
                </Badge>
              </div>
            </div>
            
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Address
              </Label>
              <p className="text-sm">{preforeclosure.address}</p>
              <p className="text-sm text-muted-foreground">
                {preforeclosure.city}, TX {preforeclosure.zip}
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Filing Month</Label>
                <p className="text-sm">{preforeclosure.filing_month}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">County</Label>
                <p className="text-sm">{preforeclosure.county}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">First Seen</Label>
                <p className="text-sm">{preforeclosure.first_seen_month}</p>
              </div>
            </div>

            {preforeclosure.inactive && (
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                This record is inactive (not in latest file)
              </div>
            )}
          </div>

          {/* Property Information Section */}
          <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Property Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {preforeclosure.latitude != null && (
                <div>
                  <Label className="text-muted-foreground text-xs">Latitude</Label>
                  <p className="font-mono text-sm">{preforeclosure.latitude.toFixed(6)}</p>
                </div>
              )}
              {preforeclosure.longitude != null && (
                <div>
                  <Label className="text-muted-foreground text-xs">Longitude</Label>
                  <p className="font-mono text-sm">{preforeclosure.longitude.toFixed(6)}</p>
                </div>
              )}
              {preforeclosure.school_district && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground text-xs">School District</Label>
                  <p className="text-sm">{preforeclosure.school_district}</p>
                </div>
              )}
            </div>
          </div>

          {/* Phone Numbers Section */}
          <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Phone Numbers</span>
            </div>
            <div className="space-y-2">
              {phoneNumbers.map((phone, index) => {
                const isOwnerPhone = ownerPhoneIndex === index;
                return (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      value={phone}
                      onChange={(e) => {
                        const newPhones = [...phoneNumbers];
                        newPhones[index] = e.target.value;
                        setPhoneNumbers(newPhones);
                      }}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-10 w-10",
                        isOwnerPhone && "text-yellow-500"
                      )}
                      onClick={() => {
                        const newOwnerPhoneIndex = isOwnerPhone ? undefined : index;
                        setOwnerPhoneIndex(newOwnerPhoneIndex);
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
                  onClick={handleSavePhoneNumbers}
                  disabled={savingPhones}
                >
                  {savingPhones ? 'Saving...' : 'Save Phone Numbers'}
                </Button>
              </div>
            </div>
          </div>

          {/* Operator-Editable Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Operator Data (Editable)
            </h3>

            <div>
              <Label htmlFor="status">Internal Status</Label>
              <Select value={internalStatus} onValueChange={(v) => setInternalStatus(v as PreForeclosureInternalStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      <Badge variant="outline" className={statusColors[status]}>
                        {status}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="followup" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Next Follow-Up Date
              </Label>
              <Input
                id="followup"
                type="date"
                value={nextFollowUp ? nextFollowUp.split('T')[0] : ''}
                onChange={(e) => setNextFollowUp(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="notes" className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" />
                Notes
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this property..."
                rows={4}
              />
            </div>

            {preforeclosure.last_action_date && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(preforeclosure.last_action_date).toLocaleString()}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}