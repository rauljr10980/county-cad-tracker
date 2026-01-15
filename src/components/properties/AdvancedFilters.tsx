import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PropertyStatus } from '@/types/property';
import { Filter, ChevronDown, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdvancedFilters {
  statuses: PropertyStatus[];
  amountDueMin?: number;
  amountDueMax?: number;
  marketValueMin?: number;
  marketValueMax?: number;
  ratioMin?: number;
  ratioMax?: number;
  taxYear?: string;
  hasNotes?: 'yes' | 'no' | 'any';
  hasLink?: 'yes' | 'no' | 'any';
  hasExemptions?: 'yes' | 'no' | 'any';
  followUpDateFrom?: string;
  followUpDateTo?: string;
  lastPaymentDateFrom?: string;
  lastPaymentDateTo?: string;
}

interface AdvancedFiltersProps {
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  onClear: () => void;
  statusCounts: { J: number; A: number; P: number; U: number };
  totalUnfiltered: number;
  activeFilterCount: number;
}

export function AdvancedFiltersPanel({
  filters,
  onFiltersChange,
  onClear,
  statusCounts,
  totalUnfiltered,
  activeFilterCount,
}: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);

  const updateFilter = <K extends keyof AdvancedFilters>(
    key: K,
    value: AdvancedFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleStatus = (status: PropertyStatus) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter(s => s !== status)
      : [...filters.statuses, status];
    updateFilter('statuses', newStatuses);
  };

  const getStatusButtonText = () => {
    if (filters.statuses.length === 0) {
      return `All (${(totalUnfiltered || 0).toLocaleString()})`;
    }
    if (filters.statuses.length === 1) {
      const status = filters.statuses[0];
      const statusLabels: Record<string, string> = {
        'J': 'Judgment',
        'A': 'Active',
        'P': 'Pending',
        'U': 'Unknown'
      };
      const label = statusLabels[status] || status;
      const count = statusCounts[status as keyof typeof statusCounts] || 0;
      return `${label} (${(count || 0).toLocaleString()})`;
    }
    return `${filters.statuses.length} selected`;
  };

  const hasActiveFilters = activeFilterCount > 0;

  const handleSearch = () => {
    // Close the sheet when search is clicked
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="w-full sm:w-auto min-w-[120px] mobile-touch-target"
        >
          <Filter className="h-4 w-4 mr-2" />
          <span className="flex-1 sm:flex-initial">Filters</span>
          {hasActiveFilters && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-background text-foreground rounded-full">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Advanced Filters</SheetTitle>
          <SheetDescription>
            Filter properties by multiple criteria to find exactly what you're looking for.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status Filter */}
          <div className="space-y-3">
            <Label>Status</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                >
                  <span>{getStatusButtonText()}</span>
                  <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 z-[100]">
                <DropdownMenuLabel>Select Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.length === 0}
                  onCheckedChange={() => updateFilter('statuses', [])}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>All</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({(totalUnfiltered || 0).toLocaleString()})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.includes('P')}
                  onCheckedChange={() => toggleStatus('P')}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      <span>Pending</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({((statusCounts?.P) || 0).toLocaleString()})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.includes('A')}
                  onCheckedChange={() => toggleStatus('A')}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span>Active</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({((statusCounts?.A) || 0).toLocaleString()})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.includes('J')}
                  onCheckedChange={() => toggleStatus('J')}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      <span>Judgment</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({((statusCounts?.J) || 0).toLocaleString()})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.includes('U')}
                  onCheckedChange={() => toggleStatus('U')}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-gray-500" />
                      <span>Unknown</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({((statusCounts?.U) || 0).toLocaleString()})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Amount Due Range */}
          <div className="space-y-3">
            <Label>Amount Due</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="amountDueMin" className="text-xs text-muted-foreground">
                  Min ($)
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="amountDueMin"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="0.01"
                  value={filters.amountDueMin || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    updateFilter('amountDueMin', isNaN(value as number) ? undefined : value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amountDueMax" className="text-xs text-muted-foreground">
                  Max ($)
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="amountDueMax"
                  type="number"
                  placeholder="No limit"
                  min="0"
                  step="0.01"
                  value={filters.amountDueMax || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    updateFilter('amountDueMax', isNaN(value as number) ? undefined : value);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Market Value Range */}
          <div className="space-y-3">
            <Label>Market Value</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="marketValueMin" className="text-xs text-muted-foreground">
                  Min ($)
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="marketValueMin"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="0.01"
                  value={filters.marketValueMin || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    updateFilter('marketValueMin', isNaN(value as number) ? undefined : value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marketValueMax" className="text-xs text-muted-foreground">
                  Max ($)
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="marketValueMax"
                  type="number"
                  placeholder="No limit"
                  min="0"
                  step="0.01"
                  value={filters.marketValueMax || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    updateFilter('marketValueMax', isNaN(value as number) ? undefined : value);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Ratio Range */}
          <div className="space-y-3">
            <Label>Ratio (%)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ratioMin" className="text-xs text-muted-foreground">
                  Min (%)
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="ratioMin"
                  type="number"
                  placeholder="0"
                  min="0"
                  max="100"
                  step="0.1"
                  value={filters.ratioMin || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    updateFilter('ratioMin', isNaN(value as number) ? undefined : value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ratioMax" className="text-xs text-muted-foreground">
                  Max (%)
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="ratioMax"
                  type="number"
                  placeholder="No limit"
                  min="0"
                  step="0.1"
                  value={filters.ratioMax || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    updateFilter('ratioMax', isNaN(value as number) ? undefined : value);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Tax Year */}
          <div className="space-y-3">
            <Label htmlFor="taxYear">Tax Year</Label>
            <Input 
              className="mobile-input w-full"
              id="taxYear"
              type="text"
              placeholder="e.g., 2024"
              value={filters.taxYear || ''}
              onChange={(e) => updateFilter('taxYear', e.target.value || undefined)}
            />
          </div>

          {/* Has Notes */}
          <div className="space-y-3">
            <Label>Has Notes</Label>
            <div className="flex gap-2">
              <Button
                variant={filters.hasNotes === 'any' || !filters.hasNotes ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasNotes', 'any')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                Any
              </Button>
              <Button
                variant={filters.hasNotes === 'yes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasNotes', 'yes')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                Yes
              </Button>
              <Button
                variant={filters.hasNotes === 'no' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasNotes', 'no')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                No
              </Button>
            </div>
          </div>

          {/* Has Link */}
          <div className="space-y-3">
            <Label>Has Property Link</Label>
            <div className="flex gap-2">
              <Button
                variant={filters.hasLink === 'any' || !filters.hasLink ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasLink', 'any')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                Any
              </Button>
              <Button
                variant={filters.hasLink === 'yes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasLink', 'yes')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                Yes
              </Button>
              <Button
                variant={filters.hasLink === 'no' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasLink', 'no')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                No
              </Button>
            </div>
          </div>

          {/* Has Exemptions */}
          <div className="space-y-3">
            <Label>Has Exemptions</Label>
            <div className="flex gap-2">
              <Button
                variant={filters.hasExemptions === 'any' || !filters.hasExemptions ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasExemptions', 'any')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                Any
              </Button>
              <Button
                variant={filters.hasExemptions === 'yes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasExemptions', 'yes')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                Yes
              </Button>
              <Button
                variant={filters.hasExemptions === 'no' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilter('hasExemptions', 'no')}
                className="flex-1 mobile-touch-target text-xs sm:text-sm"
              >
                No
              </Button>
            </div>
          </div>

          {/* Follow-up Date Range */}
          <div className="space-y-3">
            <Label>Follow-up Date</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="followUpDateFrom" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="followUpDateFrom"
                  type="date"
                  value={filters.followUpDateFrom || ''}
                  onChange={(e) => updateFilter('followUpDateFrom', e.target.value || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followUpDateTo" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="followUpDateTo"
                  type="date"
                  value={filters.followUpDateTo || ''}
                  onChange={(e) => updateFilter('followUpDateTo', e.target.value || undefined)}
                />
              </div>
            </div>
          </div>

          {/* Last Payment Date Range */}
          <div className="space-y-3">
            <Label>Last Payment Date</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="lastPaymentDateFrom" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="lastPaymentDateFrom"
                  type="date"
                  value={filters.lastPaymentDateFrom || ''}
                  onChange={(e) => updateFilter('lastPaymentDateFrom', e.target.value || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastPaymentDateTo" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input 
                  className="mobile-input w-full"
                  id="lastPaymentDateTo"
                  type="date"
                  value={filters.lastPaymentDateTo || ''}
                  onChange={(e) => updateFilter('lastPaymentDateTo', e.target.value || undefined)}
                />
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t space-y-2">
            <Button
              variant="default"
              onClick={handleSearch}
              className="w-full mobile-touch-target"
            >
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={onClear}
                className="w-full mobile-touch-target"
              >
                <X className="h-4 w-4 mr-2" />
                Clear All Filters
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

