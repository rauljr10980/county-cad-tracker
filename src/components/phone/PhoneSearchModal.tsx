import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Phone, Search, Loader2 } from 'lucide-react';
import { useProperties } from '@/hooks/useFiles';
import { Property, getPropertyById } from '@/lib/api';

interface PhoneSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProperty: (property: Property) => void;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  rings:       { label: 'Rings',       color: 'text-green-400' },
  not_working: { label: 'Not Working', color: 'text-red-400' },
  voicemail:   { label: 'Voicemail',   color: 'text-yellow-400' },
  contacted:   { label: 'Contacted',   color: 'text-blue-400' },
};

export function PhoneSearchModal({ isOpen, onClose, onSelectProperty }: PhoneSearchModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data } = useProperties({ limit: 50000 });

  const allProperties: Property[] = Array.isArray(data) ? data : (data as any)?.properties ?? [];

  const results = query.replace(/\D/g, '').length >= 4
    ? allProperties.filter(p =>
        Array.isArray(p.phoneNumbers) &&
        p.phoneNumbers.some(n => normalizePhone(n).includes(normalizePhone(query)))
      ).slice(0, 10)
    : [];

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  async function handleSelect(p: Property) {
    setLoading(true);
    try {
      // Always fetch fresh data so statuses/contacts are up-to-date
      const fresh = await getPropertyById(p.id);
      onSelectProperty(fresh);
    } catch {
      onSelectProperty(p); // fallback to cached if fetch fails
    } finally {
      setLoading(false);
      onClose();
    }
  }

  // Get phone statuses from contacts JSON for a property
  function getPhoneStatuses(p: Property): Record<string, string> {
    const contacts = (p as any).contacts;
    if (!contacts?.phoneRows) return {};
    const map: Record<string, string> = {};
    for (const row of contacts.phoneRows) {
      for (const ph of row.phones || []) {
        if (ph.number && ph.status) map[normalizePhone(ph.number)] = ph.status;
      }
    }
    return map;
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-green-400" />
            Phone Number Search
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Type a phone number..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
            disabled={loading}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {results.length > 0 ? (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {results.map(p => {
              const statusMap = getPhoneStatuses(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted flex flex-col gap-1"
                    onClick={() => handleSelect(p)}
                    disabled={loading}
                  >
                    <span className="text-sm font-medium">{p.ownerName || p.propertyAddress || p.accountNumber}</span>
                    <span className="text-xs text-muted-foreground">{p.propertyAddress}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {p.phoneNumbers?.filter(n => normalizePhone(n).includes(normalizePhone(query))).map(n => {
                        const status = statusMap[normalizePhone(n)];
                        const s = status ? STATUS_LABEL[status] : null;
                        return (
                          <span key={n} className="flex items-center gap-1">
                            <span className="text-xs text-green-400">{n}</span>
                            {s && <span className={`text-[10px] font-medium ${s.color}`}>{s.label}</span>}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : query.replace(/\D/g, '').length >= 4 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No properties found</p>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Enter at least 4 digits to search</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
