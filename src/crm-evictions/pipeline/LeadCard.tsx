import { useDraggable } from '@dnd-kit/core';
import { Building2, User } from 'lucide-react';
import type { Lead } from '../types/crm';

export function LeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`rounded-md border bg-card p-2.5 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="text-sm font-medium leading-tight">{lead.name}</p>
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
        {lead.isCorporate ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
        <span>{lead.filingCount} filings</span>
        <span>·</span>
        <span>{lead.addressCount} addr</span>
      </div>
      {lead.assignedTo && <p className="text-[11px] text-primary mt-1">{lead.assignedTo.username}</p>}
    </div>
  );
}
