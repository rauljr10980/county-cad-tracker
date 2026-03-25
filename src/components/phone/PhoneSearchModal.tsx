import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Phone, Search } from 'lucide-react';
import { useProperties } from '@/hooks/useFiles';
import { Property } from '@/lib/api';

interface PhoneSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProperty: (property: Property) => void;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function PhoneSearchModal({ isOpen, onClose, onSelectProperty }: PhoneSearchModalProps) {
  const [query, setQuery] = useState('');
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

  function handleSelect(property: Property) {
    onSelectProperty(property);
    onClose();
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
          />
        </div>
        {results.length > 0 ? (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {results.map(p => {
              const matchedPhone = p.phoneNumbers?.find(n =>
                normalizePhone(n).includes(normalizePhone(query))
              );
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted flex flex-col gap-0.5"
                    onClick={() => handleSelect(p)}
                  >
                    <span className="text-sm font-medium">{p.ownerName || p.propertyAddress || p.accountNumber}</span>
                    <span className="text-xs text-muted-foreground">{p.propertyAddress}</span>
                    <span className="text-xs text-green-400">{matchedPhone}</span>
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
