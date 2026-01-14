import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { PreForeclosureType, PreForeclosureStatus } from '@/types/property';
import { Filter, X } from 'lucide-react';

export interface PreForeclosureAdvancedFilters {
  type: PreForeclosureType | 'all';
  city: string;
  zip: string;
  month: string;
  status: PreForeclosureStatus | 'all';
  needsFollowUp: boolean;
  hasVisited: boolean;
  hasNotes: boolean;
  hasPhoneNumbers: boolean;
  hasTask: boolean;
}

interface AdvancedFiltersProps {
  filters: PreForeclosureAdvancedFilters;
  onFiltersChange: (filters: PreForeclosureAdvancedFilters) => void;
  onClear: () => void;
  uniqueCities: string[];
  uniqueZips: string[];
  uniqueMonths: string[];
  activeFilterCount: number;
}

export function AdvancedFiltersPanel({
  filters,
  onFiltersChange,
  onClear,
  uniqueCities,
  uniqueZips,
  uniqueMonths,
  activeFilterCount,
}: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);

  const updateFilter = <K extends keyof PreForeclosureAdvancedFilters>(
    key: K,
    value: PreForeclosureAdvancedFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = activeFilterCount > 0;

  const handleClear = () => {
    onClear();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="w-full sm:w-auto min-w-[120px]"
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
            Filter pre-foreclosure records by multiple criteria to find exactly what you're looking for.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Type Filter */}
          <div className="space-y-3">
            <Label>Type</Label>
            <Select value={filters.type} onValueChange={(v) => updateFilter('type', v as PreForeclosureType | 'all')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Mortgage">Mortgage</SelectItem>
                <SelectItem value="Tax">Tax</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* City Filter */}
          <div className="space-y-3">
            <Label>City</Label>
            <Select value={filters.city} onValueChange={(v) => updateFilter('city', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {uniqueCities.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ZIP Filter */}
          <div className="space-y-3">
            <Label>ZIP Code</Label>
            <Select value={filters.zip} onValueChange={(v) => updateFilter('zip', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All ZIPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ZIPs</SelectItem>
                {uniqueZips.map(zip => (
                  <SelectItem key={zip} value={zip}>{zip}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filing Month Filter */}
          <div className="space-y-3">
            <Label>Filing Month</Label>
            <Select value={filters.month} onValueChange={(v) => updateFilter('month', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {uniqueMonths.map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="space-y-3">
            <Label>Internal Status</Label>
            <Select value={filters.status} onValueChange={(v) => updateFilter('status', v as PreForeclosureStatus | 'all')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Contact Attempted">Contact Attempted</SelectItem>
                <SelectItem value="Monitoring">Monitoring</SelectItem>
                <SelectItem value="Dead">Dead</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Needs Follow-Up Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="needsFollowUp"
                checked={filters.needsFollowUp}
                onCheckedChange={(checked) => updateFilter('needsFollowUp', checked as boolean)}
              />
              <Label htmlFor="needsFollowUp" className="cursor-pointer">
                Needs Follow-Up
              </Label>
            </div>
          </div>

          {/* Has Visited Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hasVisited"
                checked={filters.hasVisited}
                onCheckedChange={(checked) => updateFilter('hasVisited', checked as boolean)}
              />
              <Label htmlFor="hasVisited" className="cursor-pointer">
                Has Been Visited
              </Label>
            </div>
          </div>

          {/* Has Notes Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hasNotes"
                checked={filters.hasNotes}
                onCheckedChange={(checked) => updateFilter('hasNotes', checked as boolean)}
              />
              <Label htmlFor="hasNotes" className="cursor-pointer">
                Has Notes
              </Label>
            </div>
          </div>

          {/* Has Phone Numbers Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hasPhoneNumbers"
                checked={filters.hasPhoneNumbers}
                onCheckedChange={(checked) => updateFilter('hasPhoneNumbers', checked as boolean)}
              />
              <Label htmlFor="hasPhoneNumbers" className="cursor-pointer">
                Has Phone Numbers
              </Label>
            </div>
          </div>

          {/* Has Task Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hasTask"
                checked={filters.hasTask}
                onCheckedChange={(checked) => updateFilter('hasTask', checked as boolean)}
              />
              <Label htmlFor="hasTask" className="cursor-pointer">
                Has Task
              </Label>
            </div>
          </div>

          {/* Clear All Button */}
          {hasActiveFilters && (
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleClear}
              >
                <X className="h-4 w-4 mr-2" />
                Clear All Filters
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
