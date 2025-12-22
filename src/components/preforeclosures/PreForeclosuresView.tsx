import { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Loader2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Filter, 
  Search, 
  X,
  Home,
  Building
} from 'lucide-react';
import { PreForeclosureTable } from './PreForeclosureTable';
import { PreForeclosureDetailsModal } from './PreForeclosureDetailsModal';
import { PreForeclosure, PreForeclosureType, PreForeclosureInternalStatus } from '@/types/property';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 100;

// Mock data for now - will be replaced with API calls when backend is ready
const generateMockData = (): PreForeclosure[] => {
  const types: PreForeclosureType[] = ['Mortgage', 'Tax'];
  const statuses: PreForeclosureInternalStatus[] = ['New', 'Contact Attempted', 'Monitoring', 'Dead'];
  const cities = ['San Antonio', 'Helotes', 'Leon Valley', 'Converse', 'Universal City'];
  const zips = ['78201', '78207', '78212', '78227', '78245', '78250', '78254'];
  
  const data: PreForeclosure[] = [];
  
  for (let i = 1; i <= 350; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const zip = zips[Math.floor(Math.random() * zips.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    data.push({
      document_number: `2025-${String(i).padStart(6, '0')}`,
      type,
      address: `${1000 + i} ${['Main', 'Oak', 'Elm', 'Cedar', 'Pine'][i % 5]} St`,
      city,
      zip,
      filing_month: 'January 2025',
      county: 'Bexar',
      first_seen_month: 'January 2025',
      last_seen_month: 'January 2025',
      inactive: Math.random() > 0.9,
      internal_status: status,
      notes: Math.random() > 0.7 ? 'Some notes about this property' : undefined,
      last_action_date: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      next_follow_up_date: Math.random() > 0.6 ? new Date(Date.now() + Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString() : undefined,
    });
  }
  
  return data;
};

export function PreForeclosuresView() {
  const [selectedRecord, setSelectedRecord] = useState<PreForeclosure | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('document_number');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Filters
  const [typeFilter, setTypeFilter] = useState<PreForeclosureType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PreForeclosureInternalStatus | 'all'>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [zipFilter, setZipFilter] = useState<string>('all');
  const [showNeedsFollowUp, setShowNeedsFollowUp] = useState(false);
  
  // Mock data - replace with API call
  const [allData] = useState<PreForeclosure[]>(() => generateMockData());
  const [isLoading] = useState(false);
  const [error] = useState<Error | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Extract unique cities and zips for filter dropdowns
  const uniqueCities = useMemo(() => 
    [...new Set(allData.map(pf => pf.city))].sort(),
    [allData]
  );
  
  const uniqueZips = useMemo(() => 
    [...new Set(allData.map(pf => pf.zip))].sort(),
    [allData]
  );

  // Filter and sort data
  const filteredData = useMemo(() => {
    let result = [...allData];
    
    // Apply filters
    if (typeFilter !== 'all') {
      result = result.filter(pf => pf.type === typeFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(pf => pf.internal_status === statusFilter);
    }
    if (cityFilter !== 'all') {
      result = result.filter(pf => pf.city === cityFilter);
    }
    if (zipFilter !== 'all') {
      result = result.filter(pf => pf.zip === zipFilter);
    }
    if (showNeedsFollowUp) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      result = result.filter(pf => 
        pf.next_follow_up_date && new Date(pf.next_follow_up_date) <= today
      );
    }
    
    // Apply search
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(pf => 
        pf.document_number.toLowerCase().includes(query) ||
        pf.address.toLowerCase().includes(query) ||
        pf.city.toLowerCase().includes(query) ||
        pf.zip.includes(query)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      const aVal = a[sortBy as keyof PreForeclosure] || '';
      const bVal = b[sortBy as keyof PreForeclosure] || '';
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [allData, typeFilter, statusFilter, cityFilter, zipFilter, showNeedsFollowUp, debouncedSearchQuery, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const startItem = filteredData.length > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
  const endItem = Math.min(page * ITEMS_PER_PAGE, filteredData.length);

  // Stats
  const stats = useMemo(() => ({
    total: allData.length,
    mortgage: allData.filter(pf => pf.type === 'Mortgage').length,
    tax: allData.filter(pf => pf.type === 'Tax').length,
    active: allData.filter(pf => !pf.inactive).length,
    inactive: allData.filter(pf => pf.inactive).length,
  }), [allData]);

  const handleSortChange = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleUpdate = (documentNumber: string, updates: Partial<PreForeclosure>) => {
    // TODO: Implement API call to update record
    console.log('Updating:', documentNumber, updates);
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setCityFilter('all');
    setZipFilter('all');
    setShowNeedsFollowUp(false);
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || cityFilter !== 'all' || zipFilter !== 'all' || showNeedsFollowUp || searchQuery;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Home className="h-5 w-5" />
              Pre-Foreclosures
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.total.toLocaleString()} total filings • {stats.mortgage.toLocaleString()} Mortgage • {stats.tax.toLocaleString()} Tax
            </p>
          </div>
          
          {/* Quick Stats Badges */}
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
              {stats.active} Active
            </Badge>
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {stats.inactive} Inactive
            </Badge>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by document #, address, city, or ZIP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setDebouncedSearchQuery(''); }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-card/50 border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Filters:</span>
          </div>

          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as PreForeclosureType | 'all'); setPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Mortgage">Mortgage</SelectItem>
              <SelectItem value="Tax">Tax</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as PreForeclosureInternalStatus | 'all'); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Contact Attempted">Contact Attempted</SelectItem>
              <SelectItem value="Monitoring">Monitoring</SelectItem>
              <SelectItem value="Dead">Dead</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {uniqueCities.map(city => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={zipFilter} onValueChange={(v) => { setZipFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="ZIP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ZIPs</SelectItem>
              {uniqueZips.map(zip => (
                <SelectItem key={zip} value={zip}>{zip}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            variant={showNeedsFollowUp ? "default" : "outline"} 
            size="sm"
            onClick={() => { setShowNeedsFollowUp(!showNeedsFollowUp); setPage(1); }}
            className={cn(
              showNeedsFollowUp && "bg-yellow-500 hover:bg-yellow-600"
            )}
          >
            Needs Follow-Up
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}

          {filteredData.length !== allData.length && (
            <span className="text-sm text-muted-foreground ml-auto">
              Showing {filteredData.length.toLocaleString()} of {allData.length.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <Loader2 className="h-16 w-16 text-muted-foreground mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold mb-2">Loading Pre-Foreclosures...</h3>
        </div>
      ) : error ? (
        <div className="bg-destructive/10 rounded-lg p-12 text-center border border-destructive/30">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2 text-destructive">Error Loading Data</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {error.message}
          </p>
        </div>
      ) : paginatedData.length === 0 ? (
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Records Found</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {hasActiveFilters 
              ? 'No pre-foreclosure records match your current filters. Try adjusting your filters.'
              : 'Upload a pre-foreclosure file to start tracking records.'}
          </p>
        </div>
      ) : (
        <>
          <PreForeclosureTable
            preforeclosures={paginatedData}
            onViewDetails={setSelectedRecord}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{startItem.toLocaleString()}</span> to{' '}
                <span className="font-medium text-foreground">{endItem.toLocaleString()}</span> of{' '}
                <span className="font-medium text-foreground">{filteredData.length.toLocaleString()}</span> records
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="ml-1">Previous</span>
                </Button>
                
                <div className="flex items-center gap-2 px-3">
                  <span className="text-sm">Page</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={page}
                    onChange={(e) => {
                      const newPage = parseInt(e.target.value) || 1;
                      setPage(Math.max(1, Math.min(totalPages, newPage)));
                    }}
                    className="w-16 px-2 py-1 text-center text-sm border border-border rounded bg-background"
                  />
                  <span className="text-sm text-muted-foreground">of {totalPages}</span>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <span className="mr-1">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Details Modal */}
      <PreForeclosureDetailsModal
        preforeclosure={selectedRecord}
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onUpdate={handleUpdate}
      />
    </div>
  );
}