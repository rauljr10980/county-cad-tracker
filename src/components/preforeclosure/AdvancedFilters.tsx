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
import { Input } from '@/components/ui/input';
import { PreForeclosureType, WorkflowStage } from '@/types/property';
import { Filter, X } from 'lucide-react';

export interface PreForeclosureAdvancedFilters {
  type: PreForeclosureType | 'all';
  city: string;
  zip: string;
  month: string;
  needsFollowUp: boolean;
  hasVisited: boolean;
  notVisited: boolean;
  hasNotes: boolean;
  hasPhoneNumbers: boolean;
  hasTask: boolean;
  showNewOnly: boolean;
  missingGeocode: boolean;
  recordedDateFrom: string;
  recordedDateTo: string;
  saleDateFrom: string;
  saleDateTo: string;
  workflowStage: WorkflowStage | 'all';
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

          {/* Workflow Stage Filter */}
          <div className="space-y-3">
            <Label>Workflow Stage</Label>
            <Select value={filters.workflowStage} onValueChange={(v) => updateFilter('workflowStage', v as WorkflowStage | 'all')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="initial_visit">Initial Visit</SelectItem>
                <SelectItem value="people_search">People Search</SelectItem>
                <SelectItem value="call_owner">Call Owner</SelectItem>
                <SelectItem value="land_records">Land Records</SelectItem>
                <SelectItem value="visit_heirs">Visit Heirs</SelectItem>
                <SelectItem value="call_heirs">Call Heirs</SelectItem>
                <SelectItem value="negotiating">Negotiating</SelectItem>
                <SelectItem value="dead_end">Dead End</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recorded Date Range */}
          <div className="space-y-3">
            <Label>Recorded Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={filters.recordedDateFrom}
                  onChange={(e) => updateFilter('recordedDateFrom', e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={filters.recordedDateTo}
                  onChange={(e) => updateFilter('recordedDateTo', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sale Date Range */}
          <div className="space-y-3">
            <Label>Sale Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={filters.saleDateFrom}
                  onChange={(e) => updateFilter('saleDateFrom', e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={filters.saleDateTo}
                  onChange={(e) => updateFilter('saleDateTo', e.target.value)}
                />
              </div>
            </div>
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
                onCheckedChange={(checked) => {
                  updateFilter('hasVisited', checked as boolean);
                  if (checked) updateFilter('notVisited', false);
                }}
              />
              <Label htmlFor="hasVisited" className="cursor-pointer">
                Has Been Visited
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="notVisited"
                checked={filters.notVisited}
                onCheckedChange={(checked) => {
                  updateFilter('notVisited', checked as boolean);
                  if (checked) updateFilter('hasVisited', false);
                }}
              />
              <Label htmlFor="notVisited" className="cursor-pointer">
                Not Visited
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

          {/* Show New Only Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showNewOnly"
                checked={filters.showNewOnly}
                onCheckedChange={(checked) => updateFilter('showNewOnly', checked as boolean)}
              />
              <Label htmlFor="showNewOnly" className="cursor-pointer">
                New Records Only
              </Label>
            </div>
          </div>

          {/* Missing Geocode Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="missingGeocode"
                checked={filters.missingGeocode}
                onCheckedChange={(checked) => updateFilter('missingGeocode', checked as boolean)}
              />
              <Label htmlFor="missingGeocode" className="cursor-pointer">
                Missing Geocode
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
