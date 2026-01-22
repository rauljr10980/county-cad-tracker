import { useLatestPreForeclosureUploadStats } from '@/hooks/usePreForeclosure';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, FileText, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export function UploadStatsCard() {
  const { data: stats, isLoading, error } = useLatestPreForeclosureUploadStats();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest Upload</CardTitle>
          <CardDescription>Loading stats...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !stats?.hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest Upload</CardTitle>
          <CardDescription>No upload data available yet</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Upload a file to see comparison stats
        </CardContent>
      </Card>
    );
  }

  const uploadDate = stats.uploadedAt ? new Date(stats.uploadedAt) : null;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Latest Upload Summary</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Calendar className="h-3 w-3" />
              {uploadDate ? format(uploadDate, 'PPp') : 'Unknown date'}
            </CardDescription>
          </div>
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Info */}
        <div className="text-sm">
          <div className="font-medium text-muted-foreground">File:</div>
          <div className="text-foreground">{stats.filename}</div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* New Records */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-500">
                New
              </Badge>
              <TrendingUp className="h-3 w-3 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-600">
              {stats.newRecords?.toLocaleString() || 0}
            </div>
            <div className="text-xs text-muted-foreground">New properties added</div>
          </div>

          {/* Updated Records */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Updated</Badge>
            </div>
            <div className="text-2xl font-bold">
              {stats.updatedRecords?.toLocaleString() || 0}
            </div>
            <div className="text-xs text-muted-foreground">Records updated</div>
          </div>

          {/* Inactive Records */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-orange-500 text-orange-600">
                Inactive
              </Badge>
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {stats.inactiveRecords?.toLocaleString() || 0}
            </div>
            <div className="text-xs text-muted-foreground">Missing from upload</div>
          </div>

          {/* Total Active */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge>Total Active</Badge>
            </div>
            <div className="text-2xl font-bold">
              {stats.activeRecords?.toLocaleString() || 0}
            </div>
            <div className="text-xs text-muted-foreground">Active records</div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
