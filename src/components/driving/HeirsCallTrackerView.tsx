import { useState } from 'react';
import { Phone, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useDrivingLeads } from '@/hooks/useDrivingLeads';
import { updateDrivingLeadPhones, logCall } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

// Status label + colour for each phone
const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  rings:       { label: 'Rings',       color: 'text-green-400' },
  voicemail:   { label: 'Voicemail',   color: 'text-yellow-400' },
  contacted:   { label: 'Contacted',   color: 'text-blue-400' },
  not_working: { label: 'Not Working', color: 'text-red-400' },
};

function formatTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 1000 / 60 / 60;

  if (diffH < 24) {
    return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffH < 48) {
    return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Derive the "oldest last called" ISO string across all phones for a lead
// (null = never called — floats to top when sorting)
function oldestCallTime(contacts: any): string | null {
  const rows: any[] = contacts?.phoneRows || [];
  let oldest: string | null = null;
  for (const row of rows) {
    for (const ph of row.phones || []) {
      if (!ph.lastCallTime) return null; // never called → definitely oldest
      if (!oldest || ph.lastCallTime < oldest) oldest = ph.lastCallTime;
    }
  }
  return oldest;
}

export function HeirsCallTrackerView() {
  const { data: allLeads = [] } = useDrivingLeads();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [callingKey, setCallingKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Only show leads that have at least one heir phone
  const leads = (allLeads as any[])
    .filter(lead => {
      const rows: any[] = (lead as any).contacts?.phoneRows || [];
      return rows.some((r: any) => r.phones?.some((p: any) => p.number?.trim()));
    })
    .sort((a, b) => {
      // Sort: never-called first, then oldest-called first
      const aT = oldestCallTime((a as any).contacts);
      const bT = oldestCallTime((b as any).contacts);
      if (!aT && !bT) return 0;
      if (!aT) return -1;
      if (!bT) return 1;
      return aT < bT ? -1 : 1;
    });

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCall(lead: any, rowIdx: number, phoneIdx: number, phoneNumber: string) {
    const key = `${lead.id}-${rowIdx}-${phoneIdx}`;
    setCallingKey(key);
    try {
      const now = new Date().toISOString();
      // Deep-clone contacts, update per-phone lastCallTime
      const contacts = JSON.parse(JSON.stringify(lead.contacts || { phoneRows: [], emailRows: [] }));
      if (contacts.phoneRows[rowIdx]?.phones[phoneIdx]) {
        contacts.phoneRows[rowIdx].phones[phoneIdx].lastCallTime = now;
        contacts.phoneRows[rowIdx].phones[phoneIdx].callCount =
          (contacts.phoneRows[rowIdx].phones[phoneIdx].callCount || 0) + 1;
      }
      const allPhones = contacts.phoneRows.flatMap((r: any) =>
        r.phones.filter((p: any) => p.number?.trim()).map((p: any) => p.number)
      );
      await updateDrivingLeadPhones(lead.id, allPhones, lead.ownerPhoneIndex, contacts, lead.ownerName, now);
      logCall(undefined, lead.id, phoneNumber);
      queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
      queryClient.invalidateQueries({ queryKey: ['call-stats'] });
    } finally {
      setCallingKey(null);
    }
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No heirs/contacts saved yet. Open a property, add phone numbers under each heir name, then they'll appear here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">
        {leads.length} properties with heir contacts · sorted by least recently called
      </p>

      {leads.map((lead: any) => {
        const isOpen = expanded.has(lead.id);
        const contacts = lead.contacts || {};
        const phoneRows: any[] = contacts.phoneRows || [];
        const address = lead.street || lead.rawAddress || 'Unknown address';
        const city = [lead.city, lead.state].filter(Boolean).join(', ');

        // Compute oldest call across this lead's phones for the row badge
        const oldestT = oldestCallTime(contacts);

        return (
          <div key={lead.id} className="bg-card border rounded-lg overflow-hidden">
            {/* Property header row */}
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
              onClick={() => toggle(lead.id)}
            >
              {isOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{address}</span>
                {city && <span className="text-xs text-muted-foreground ml-2">{city}</span>}
              </div>
              {/* Last contacted badge */}
              <div className="flex items-center gap-1 shrink-0">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className={cn('text-[11px]', oldestT ? 'text-muted-foreground' : 'text-orange-400 font-medium')}>
                  {oldestT ? formatTime(oldestT) : 'Never called'}
                </span>
              </div>
            </button>

            {/* Heir sub-rows */}
            {isOpen && (
              <div className="border-t divide-y divide-border/50">
                {phoneRows.map((row: any, rowIdx: number) => {
                  const heirPhones = (row.phones || []).filter((p: any) => p.number?.trim());
                  if (heirPhones.length === 0) return null;
                  return (
                    <div key={rowIdx} className="px-4 py-2.5 bg-muted/20">
                      {/* Heir name */}
                      <p className="text-xs font-semibold text-foreground/80 mb-2">
                        {row.name?.trim() || `Contact ${rowIdx + 1}`}
                      </p>
                      {/* Phone entries */}
                      <div className="space-y-1.5">
                        {row.phones.map((ph: any, phoneIdx: number) => {
                          if (!ph.number?.trim()) return null;
                          const style = ph.status ? STATUS_STYLE[ph.status] : null;
                          const callKey = `${lead.id}-${rowIdx}-${phoneIdx}`;
                          const isCalling = callingKey === callKey;
                          return (
                            <div key={phoneIdx} className="flex items-center gap-2">
                              {/* Call button */}
                              {ph.status !== 'not_working' && (
                                <a
                                  href={`tel:+${ph.number.replace(/\D/g, '').length === 10 ? '1' + ph.number.replace(/\D/g, '') : ph.number.replace(/\D/g, '')}`}
                                  className={cn(
                                    'h-6 w-6 flex items-center justify-center rounded text-green-400 hover:bg-green-400/10 shrink-0',
                                    isCalling && 'opacity-50 pointer-events-none'
                                  )}
                                  onClick={() => handleCall(lead, rowIdx, phoneIdx, ph.number)}
                                  title={`Call ${ph.number}`}
                                >
                                  <Phone className="h-3 w-3" />
                                </a>
                              )}
                              {ph.status === 'not_working' && (
                                <div className="h-6 w-6 shrink-0" /> /* spacer */
                              )}
                              {/* Number */}
                              <span className={cn(
                                'text-xs font-medium',
                                ph.status === 'not_working' ? 'text-muted-foreground line-through' : 'text-green-400'
                              )}>
                                {ph.number}
                              </span>
                              {/* Status label */}
                              {style && (
                                <span className={cn('text-[10px] font-medium', style.color)}>
                                  {style.label}
                                </span>
                              )}
                              {/* Call count */}
                              {(ph.callCount || 0) > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  {ph.callCount}×
                                </span>
                              )}
                              {/* Last called */}
                              <span className={cn(
                                'ml-auto text-[10px]',
                                ph.lastCallTime ? 'text-muted-foreground' : 'text-orange-400'
                              )}>
                                {ph.lastCallTime ? formatTime(ph.lastCallTime) : 'Never'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {phoneRows.every((r: any) => !(r.phones || []).some((p: any) => p.number?.trim())) && (
                  <p className="px-4 py-3 text-xs text-muted-foreground">No phone numbers saved yet.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
