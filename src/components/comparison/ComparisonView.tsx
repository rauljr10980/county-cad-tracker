import { useState } from 'react';
import { ArrowRightLeft, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { StatusBadge, StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyTable } from '@/components/properties/PropertyTable';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { mockComparisonReport, mockStatusTransitions } from '@/data/mockData';
import { Property, PropertyStatus } from '@/types/property';
import { cn } from '@/lib/utils';

type ViewMode = 'summary' | 'new' | 'removed' | 'changed';

export function ComparisonView() {
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [transitionFilter, setTransitionFilter] = useState<{ from: PropertyStatus; to: PropertyStatus } | null>(null);

  const report = mockComparisonReport;
  const transitions = mockStatusTransitions;

  const tabs = [
    { id: 'summary' as ViewMode, label: 'Summary', count: null },
    { id: 'new' as ViewMode, label: 'New Properties', count: report.summary.newProperties },
    { id: 'removed' as ViewMode, label: 'Removed (Dead Leads)', count: report.summary.removedProperties },
    { id: 'changed' as ViewMode, label: 'Status Changes', count: report.summary.statusChanges },
  ];

  const filteredChangedProperties = transitionFilter
    ? transitions.find(t => t.from === transitionFilter.from && t.to === transitionFilter.to)?.properties || []
    : report.changedProperties;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Comparison Report
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {report.currentFile} vs {report.previousFile}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Generated: {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground">Current Total</span>
          </div>
          <p className="text-2xl font-semibold font-mono">
            {report.summary.totalCurrent.toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Previous Total</span>
          </div>
          <p className="text-2xl font-semibold font-mono">
            {report.summary.totalPrevious.toLocaleString()}
          </p>
        </div>
        <div className="bg-success/10 border border-success/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-success">New Properties</span>
          </div>
          <p className="text-2xl font-semibold font-mono text-success">
            +{report.summary.newProperties.toLocaleString()}
          </p>
        </div>
        <div className="bg-judgment/10 border border-judgment/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-judgment" />
            <span className="text-xs text-judgment">Dead Leads</span>
          </div>
          <p className="text-2xl font-semibold font-mono text-judgment">
            -{report.summary.removedProperties.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Status Transitions */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3">Status Transitions</h3>
        <div className="flex flex-wrap gap-2">
          {transitions.map((transition, index) => (
            <StatusTransitionBadge
              key={index}
              from={transition.from}
              to={transition.to}
              count={transition.count}
              onClick={() => {
                setTransitionFilter({ from: transition.from, to: transition.to });
                setViewMode('changed');
              }}
            />
          ))}
          {transitionFilter && (
            <button
              onClick={() => setTransitionFilter(null)}
              className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive hover:bg-destructive/30"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      {/* View Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-all relative',
                viewMode === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.count !== null && (
                <span className={cn(
                  'ml-2 text-xs px-1.5 py-0.5 rounded',
                  viewMode === tab.id ? 'bg-primary/20' : 'bg-secondary'
                )}>
                  {tab.count.toLocaleString()}
                </span>
              )}
              {viewMode === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'summary' && (
        <div className="bg-secondary/30 rounded-lg p-6 text-center">
          <p className="text-muted-foreground">
            Select a tab above to view detailed property lists, or click on a status transition to filter properties.
          </p>
        </div>
      )}

      {viewMode === 'new' && (
        <PropertyTable
          properties={report.newProperties}
          onViewProperty={setSelectedProperty}
        />
      )}

      {viewMode === 'removed' && (
        <PropertyTable
          properties={report.removedProperties}
          onViewProperty={setSelectedProperty}
        />
      )}

      {viewMode === 'changed' && (
        <>
          {transitionFilter && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">Showing:</span>
              <StatusTransitionBadge
                from={transitionFilter.from}
                to={transitionFilter.to}
              />
            </div>
          )}
          <PropertyTable
            properties={filteredChangedProperties}
            onViewProperty={setSelectedProperty}
          />
        </>
      )}

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  );
}
