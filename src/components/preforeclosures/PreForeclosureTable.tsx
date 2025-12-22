import { useState } from 'react';
import { FileText, ChevronUp, ChevronDown } from 'lucide-react';
import { PreForeclosure, PreForeclosureInternalStatus } from '@/types/property';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PreForeclosureTableProps {
  preforeclosures: PreForeclosure[];
  onViewDetails: (pf: PreForeclosure) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (column: string) => void;
}

const statusColors: Record<PreForeclosureInternalStatus, string> = {
  'New': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Contact Attempted': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Monitoring': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Dead': 'bg-red-500/20 text-red-400 border-red-500/30',
};

const typeColors: Record<'Mortgage' | 'Tax', string> = {
  'Mortgage': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Tax': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

export function PreForeclosureTable({ 
  preforeclosures, 
  onViewDetails,
  sortBy,
  sortOrder,
  onSortChange 
}: PreForeclosureTableProps) {
  const SortHeader = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => onSortChange(column)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortBy === column && (
          sortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        )}
      </div>
    </TableHead>
  );

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <SortHeader column="document_number">Document #</SortHeader>
            <SortHeader column="type">Type</SortHeader>
            <SortHeader column="address">Address</SortHeader>
            <SortHeader column="city">City</SortHeader>
            <SortHeader column="zip">ZIP</SortHeader>
            <SortHeader column="filing_month">Filing Month</SortHeader>
            <SortHeader column="internal_status">Internal Status</SortHeader>
            <SortHeader column="last_action_date">Last Action</SortHeader>
            <SortHeader column="next_follow_up_date">Next Follow-Up</SortHeader>
            <TableHead className="w-[60px]">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preforeclosures.map((pf) => (
            <TableRow 
              key={pf.document_number}
              className={cn(
                "cursor-pointer hover:bg-muted/50 transition-colors",
                pf.inactive && "opacity-50"
              )}
              onClick={() => onViewDetails(pf)}
            >
              <TableCell className="font-mono text-sm">{pf.document_number}</TableCell>
              <TableCell>
                <Badge variant="outline" className={typeColors[pf.type]}>
                  {pf.type}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[200px] truncate" title={pf.address}>
                {pf.address}
              </TableCell>
              <TableCell>{pf.city}</TableCell>
              <TableCell>{pf.zip}</TableCell>
              <TableCell>{pf.filing_month}</TableCell>
              <TableCell>
                <Badge variant="outline" className={statusColors[pf.internal_status]}>
                  {pf.internal_status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(pf.last_action_date)}
              </TableCell>
              <TableCell className="text-sm">
                {pf.next_follow_up_date ? (
                  <span className={cn(
                    new Date(pf.next_follow_up_date) <= new Date() && "text-yellow-400 font-medium"
                  )}>
                    {formatDate(pf.next_follow_up_date)}
                  </span>
                ) : '-'}
              </TableCell>
              <TableCell>
                {pf.notes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails(pf);
                    }}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}