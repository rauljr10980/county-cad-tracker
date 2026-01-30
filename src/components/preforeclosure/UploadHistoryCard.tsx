import { useState } from 'react';
import { usePreForeclosureUploadHistory } from '@/hooks/usePreForeclosure';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Calendar, TrendingUp, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function UploadHistoryCard() {
  const { data: history = [], isLoading, error } = usePreForeclosureUploadHistory(5);
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (uploadId: string, filename: string) => {
    if (!confirm(`Delete upload "${filename}"? This will permanently remove the upload history and all records that were imported in this upload.`)) {
      return;
    }

    setDeletingId(uploadId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/preforeclosure/upload-history/${uploadId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete upload history');
      }

      const result = await response.json();

      toast({
        title: 'Upload deleted',
        description: `Successfully deleted "${filename}" and ${result.deletedRecords || 0} records`,
      });

      // Refresh both the upload history list and pre-foreclosure records
      queryClient.invalidateQueries({ queryKey: ['preforeclosure-upload-history'] });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure-upload-stats-latest'] });
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete upload',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload History</CardTitle>
          <CardDescription>Loading upload history...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !history || history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload History</CardTitle>
          <CardDescription>Files in the system</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No upload history available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Upload History</CardTitle>
            <CardDescription>Recent files in the system</CardDescription>
          </div>
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {history.map((upload: any, index: number) => {
            const uploadDate = upload.uploadedAt ? new Date(upload.uploadedAt) : null;
            const isLatest = index === 0;

            return (
              <div
                key={upload.id || index}
                className={`p-3 rounded-lg border ${
                  isLatest ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                {/* File Name and Date */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold truncate">
                        {upload.filename || 'Unknown file'}
                      </p>
                      {isLatest && (
                        <Badge variant="default" className="text-xs">
                          Latest
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {uploadDate ? format(uploadDate, 'MMM d, yyyy h:mm a') : 'Unknown date'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(upload.id, upload.filename || 'Unknown file')}
                    disabled={deletingId === upload.id}
                  >
                    {deletingId === upload.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium text-green-600">New</span>
                    </div>
                    <div className="text-sm font-bold">
                      {upload.newRecords?.toLocaleString() || 0}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Updated
                    </div>
                    <div className="text-sm font-bold">
                      {upload.updatedRecords?.toLocaleString() || 0}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs font-medium text-orange-600 mb-1">
                      Inactive
                    </div>
                    <div className="text-sm font-bold text-orange-600">
                      {upload.inactiveRecords?.toLocaleString() || 0}
                    </div>
                  </div>
                </div>

                {/* Uploaded By */}
                {upload.uploadedBy && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      By: <span className="font-medium text-foreground">{upload.uploadedBy}</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground text-center">
          Showing last {history.length} upload{history.length !== 1 ? 's' : ''}
        </div>
      </CardContent>
    </Card>
  );
}
