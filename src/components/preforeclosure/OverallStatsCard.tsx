import { usePreForeclosures } from '@/hooks/usePreForeclosure';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function OverallStatsCard() {
  const { data: records = [] } = usePreForeclosures();

  // Calculate visited properties
  const visitedCount = records.filter(r => r.visited === true).length;
  const totalCount = records.filter(r => r.inactive === false).length; // Only count active records

  const visitedPercentage = totalCount > 0 ? ((visitedCount / totalCount) * 100).toFixed(1) : '0.0';

  return (
    <Card className="border-l-4 border-l-green-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Progress Overview</CardTitle>
          <CheckCircle2 className="h-6 w-6 text-green-500" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Visited Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-500/30">
                Visited
              </Badge>
            </div>
            <span className="text-sm font-medium text-muted-foreground">{visitedPercentage}%</span>
          </div>

          <div className="text-3xl font-bold text-green-600">
            {visitedCount.toLocaleString()} <span className="text-xl text-muted-foreground">/ {totalCount.toLocaleString()}</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${visitedPercentage}%` }}
            />
          </div>
        </div>

        {/* Remaining to Visit */}
        <div className="pt-3 border-t">
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Remaining to Visit</span>
          </div>
          <div className="text-2xl font-bold">
            {(totalCount - visitedCount).toLocaleString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
