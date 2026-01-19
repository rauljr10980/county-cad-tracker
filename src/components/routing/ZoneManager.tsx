/**
 * Zone Manager Component
 * UI for creating, editing, and deleting predefined service zones
 */

import { useState, useEffect } from 'react';
import { Trash2, Edit, Plus, Save, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SavedZone, loadZones, deleteZone, ZONE_COLORS } from '@/lib/zones';
import { cn } from '@/lib/utils';

interface ZoneManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectZone: (zone: SavedZone) => void;
  onEditZone?: (zone: SavedZone) => void;
}

export function ZoneManager({ isOpen, onClose, onSelectZone, onEditZone }: ZoneManagerProps) {
  const [zones, setZones] = useState<SavedZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setZones(loadZones());
    }
  }, [isOpen]);

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this zone?')) {
      deleteZone(id);
      setZones(loadZones());
    }
  };

  const handleSelect = (zone: SavedZone) => {
    setSelectedZoneId(zone.id);
    onSelectZone(zone);
    onClose();
  };

  const getZoneTypeIcon = (type: string) => {
    switch (type) {
      case 'rectangle':
        return '▭';
      case 'circle':
        return '●';
      case 'polygon':
        return '⬟';
      default:
        return '▢';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Saved Service Zones</DialogTitle>
          <DialogDescription>
            Select a predefined zone to quickly set up route optimization areas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {zones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No saved zones yet</p>
              <p className="text-xs mt-1">
                Create zones by drawing areas and saving them for future use
              </p>
            </div>
          ) : (
            zones.map((zone) => (
              <div
                key={zone.id}
                className={cn(
                  "p-4 border rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer",
                  selectedZoneId === zone.id && "ring-2 ring-primary"
                )}
                onClick={() => handleSelect(zone)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className="w-10 h-10 rounded flex items-center justify-center text-white text-xl flex-shrink-0"
                      style={{ backgroundColor: zone.color }}
                    >
                      {getZoneTypeIcon(zone.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{zone.name}</h3>
                      {zone.description && (
                        <p className="text-xs text-muted-foreground mt-1">{zone.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="capitalize">{zone.type}</span>
                        <span>•</span>
                        <span>Created {formatDate(zone.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {onEditZone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditZone(zone);
                          onClose();
                        }}
                        title="Edit zone"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(zone.id);
                      }}
                      title="Delete zone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
