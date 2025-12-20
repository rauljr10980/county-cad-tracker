import { useState } from 'react';
import { ArrowRightLeft, TrendingUp, TrendingDown, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { StatusBadge, StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyTable } from '@/components/properties/PropertyTable';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { useLatestComparison } from '@/hooks/useFiles';
import { Property, PropertyStatus } from '@/types/property';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { generateComparison } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

type ViewMode = 'summary' | 'new' | 'removed' | 'changed';

export function ComparisonView() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [transitionFilter, setTransitionFilter] = useState<{ from: PropertyStatus; to: PropertyStatus } | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const { data: report, isLoading, error, refetch } = useLatestComparison();

  const handleRegenerateComparison = async () => {
    setIsRegenerating(true);
    try {
      console.log('[COMPARISON] Starting comparison generation...');
      
      // Call the generate endpoint directly
      const result = await generateComparison();
      console.log('[COMPARISON] Generation result:', result);
      
      // Check if we have comparison data
      if (!result || (!result.summary && !result.currentFile)) {
        console.error('[COMPARISON] Invalid result structure:', result);
        throw new Error('Comparison generation returned invalid data structure');
      }
      
      // Wait a moment for the file to be saved to storage
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Invalidate queries to force fresh fetch
      queryClient.invalidateQueries({ queryKey: ['comparisons', 'latest'] });
      
      // Wait a bit more and then refetch
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try multiple refetches with delays
      let refetchResult = await refetch();
      let attempts = 0;
      while (!refetchResult.data && attempts < 3) {
        console.log(`[COMPARISON] Refetch attempt ${attempts + 1} - no data yet, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        refetchResult = await refetch();
        attempts++;
      }
      
      console.log('[COMPARISON] Final refetch result:', refetchResult);
      
      if (refetchResult.data) {
        toast({
          title: "Comparison Generated",
          description: "Comparison report has been generated successfully",
        });
      } else {
        // If refetch didn't work, use the result directly
        console.log('[COMPARISON] Refetch failed, using generation result directly');
        const comparisonData = result;
        if (comparisonData && (comparisonData.summary || comparisonData.currentFile)) {
          queryClient.setQueryData(['comparisons', 'latest'], comparisonData);
          toast({
            title: "Comparison Generated",
            description: "Comparison report generated successfully",
          });
        } else {
          console.error('[COMPARISON] Result data is invalid:', comparisonData);
          toast({
            title: "Warning",
            description: "Comparison generated but data structure is invalid. Please refresh the page.",
            variant: "default",
          });
        }
      }
    } catch (err: any) {
      console.error('[COMPARISON] Failed to regenerate comparison:', err);
      const errorMessage = err?.message || err?.error || "Failed to generate comparison";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive">Failed to load comparison</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6">
        <div className="bg-secondary/30 rounded-lg p-8 text-center">
          <ArrowRightLeft className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Comparison Available</h3>
          <p className="text-muted-foreground mb-4">
            {isLoading ? (
              <>
                <Loader2 className="h-6 w-6 text-primary mx-auto mb-2 animate-spin" />
                <span>Loading comparison...</span>
              </>
            ) : (
              <>
                Upload at least two files to generate a comparison report.
                <br />
                <span className="text-sm mt-2 block">
                  Comparisons are automatically generated when you upload your second file.
                </span>
              </>
            )}
          </p>
          {!isLoading && (
            <Button
              onClick={handleRegenerateComparison}
              disabled={isRegenerating}
              className="mt-4"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generate Comparison
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const transitions = report.statusTransitions || [];

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

      {/* Status Transitions - Detailed */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Status Transitions</h3>
          <span className="text-xs text-muted-foreground">
            {transitions.length} transition type{transitions.length !== 1 ? 's' : ''} • {report.summary.statusChanges.toLocaleString()} total changes
          </span>
        </div>
        
        {transitions.length > 0 ? (
          <div className="space-y-3">
            {/* Quick Badge View */}
            <div className="flex flex-wrap gap-2 mb-4">
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
                  onClick={() => {
                    setTransitionFilter(null);
                    setViewMode('changed');
                  }}
                  className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive hover:bg-destructive/30"
                >
                  Clear Filter
                </button>
              )}
            </div>
            
            {/* Detailed Transition Table */}
            <div className="bg-secondary/30 rounded-lg p-4">
              <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Detailed Breakdown
              </h4>
              <div className="space-y-2">
                {transitions
                  .sort((a, b) => b.count - a.count) // Sort by count descending
                  .map((transition, index) => {
                    const statusLabels = {
                      P: 'Pending',
                      A: 'Active',
                      J: 'Judgment',
                      U: 'Unknown',
                    };
                    const fromLabel = statusLabels[transition.from as keyof typeof statusLabels] || transition.from;
                    const toLabel = statusLabels[transition.to as keyof typeof statusLabels] || transition.to;
                    
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer border border-transparent",
                          transitionFilter?.from === transition.from && transitionFilter?.to === transition.to && "border-primary bg-primary/10"
                        )}
                        onClick={() => {
                          setTransitionFilter({ from: transition.from, to: transition.to });
                          setViewMode('changed');
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <StatusTransitionBadge
                            from={transition.from}
                            to={transition.to}
                            count={transition.count}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {fromLabel} → {toLabel}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {transition.properties.length > 0 && (
                                <span>
                                  Sample: {transition.properties[0].accountNumber} - {transition.properties[0].ownerName?.substring(0, 30)}...
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-lg font-semibold font-mono text-primary">
                              {transition.count.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">properties</div>
                          </div>
                          <button
                            className="text-xs px-3 py-1.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTransitionFilter({ from: transition.from, to: transition.to });
                              setViewMode('changed');
                            }}
                          >
                            View All
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No status transitions found</p>
        )}
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
