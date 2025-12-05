import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property, PropertyStatus } from '@/types/property';
import { cn } from '@/lib/utils';

interface PropertyTableProps {
  properties: Property[];
  onViewProperty: (property: Property) => void;
  statusFilter?: PropertyStatus;
  onStatusFilterChange?: (status: PropertyStatus | undefined) => void;
}

const ITEMS_PER_PAGE = 25;

export function PropertyTable({ 
  properties, 
  onViewProperty,
  statusFilter,
  onStatusFilterChange 
}: PropertyTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof Property>('totalAmountDue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredProperties = statusFilter 
    ? properties.filter(p => p.status === statusFilter)
    : properties;

  const sortedProperties = [...filteredProperties].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal === undefined || bVal === undefined) return 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDirection === 'asc' 
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const totalPages = Math.ceil(sortedProperties.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProperties = sortedProperties.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSort = (field: keyof Property) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by status:</span>
          <div className="flex gap-1">
            {(['J', 'A', 'P'] as PropertyStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => onStatusFilterChange?.(statusFilter === status ? undefined : status)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-all',
                  statusFilter === status 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
                {status === 'J' ? 'Judgment' : status === 'A' ? 'Active' : 'Pending'}
              </button>
            ))}
          </div>
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredProperties.length.toLocaleString()} properties
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-24">Status</th>
              <th 
                className="cursor-pointer hover:bg-secondary"
                onClick={() => handleSort('accountNumber')}
              >
                Account #
              </th>
              <th>Owner</th>
              <th>Property Address</th>
              <th 
                className="cursor-pointer hover:bg-secondary text-right"
                onClick={() => handleSort('totalAmountDue')}
              >
                Amount Due
              </th>
              <th 
                className="cursor-pointer hover:bg-secondary text-right"
                onClick={() => handleSort('marketValue')}
              >
                Market Value
              </th>
              <th>Last Payment</th>
              <th className="w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProperties.map((property) => (
              <tr 
                key={property.id}
                className={cn(
                  'transition-colors',
                  property.isNew && 'bg-success/5',
                  property.statusChanged && 'bg-warning/5'
                )}
              >
                <td>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={property.status} />
                    {property.previousStatus && (
                      <span className="text-[10px] text-muted-foreground">
                        ← {property.previousStatus}
                      </span>
                    )}
                  </div>
                </td>
                <td className="font-mono text-sm">{property.accountNumber}</td>
                <td className="max-w-[200px] truncate">{property.ownerName}</td>
                <td className="max-w-[300px] truncate text-muted-foreground">
                  {property.propertyAddress}
                </td>
                <td className="text-right font-mono">
                  {formatCurrency(property.totalAmountDue)}
                </td>
                <td className="text-right font-mono text-muted-foreground">
                  {property.marketValue ? formatCurrency(property.marketValue) : '—'}
                </td>
                <td className="text-muted-foreground text-sm">
                  {property.lastPaymentDate || '—'}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => onViewProperty(property)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      asChild
                    >
                      <a 
                        href={`https://bexar.trueautomation.com/clientdb/Property.aspx?prop_id=${property.accountNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-border flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredProperties.length)} of {filteredProperties.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-mono px-3">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
