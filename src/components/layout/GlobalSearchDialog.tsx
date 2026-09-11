import { useEffect, useState } from 'react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { searchAll, type SearchResult } from '@/lib/api'
import { setPendingSearch } from '@/lib/pendingSearch'
import type { TabType } from './navItems'

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  property: 'Properties',
  preforeclosure: 'Pre-Foreclosure',
  crmLead: 'Contacts',
  mlsLead: 'MLS Leads',
}

const GROUP_ORDER: SearchResult['type'][] = ['property', 'preforeclosure', 'crmLead', 'mlsLead']

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (tab: TabType) => void
}

export function GlobalSearchDialog({ open, onOpenChange, onNavigate }: GlobalSearchDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setError(null)
      return
    }
    const timer = setTimeout(() => {
      searchAll(query)
        .then((r) => {
          setResults(r)
          setError(null)
        })
        .catch(() => setError('Search failed. Try again.'))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (result: SearchResult) => {
    setPendingSearch(result.tab, result.label)
    onNavigate(result.tab as TabType)
    onOpenChange(false)
  }

  const grouped = GROUP_ORDER
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search contacts, addresses, opportunities, or anything..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {error && <p className="px-4 py-3 text-sm text-destructive">{error}</p>}
        {!error && query.trim().length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {!error && grouped.map((group) => (
          // forceMount: results are already filtered server-side by
          // searchAll and grouped above, so cmdk's own client-side re-filter
          // (matching its typed search text against each item's rendered
          // text) is redundant here — and would otherwise hide valid results
          // whose label/sublabel don't literally contain the typed substring
          // (e.g. a contact found by phone number). forceMount opts every
          // group/item out of that re-filter so visibility is driven only by
          // the `grouped` data computed above.
          <CommandGroup key={group.type} heading={GROUP_LABELS[group.type]} forceMount>
            {group.items.map((result) => (
              <CommandItem
                key={`${result.type}-${result.id}`}
                onSelect={() => handleSelect(result)}
                forceMount
              >
                <div className="flex flex-col">
                  <span>{result.label}</span>
                  {result.sublabel && <span className="text-xs text-muted-foreground">{result.sublabel}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
