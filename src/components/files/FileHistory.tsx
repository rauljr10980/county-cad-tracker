import { Download, Trash2, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFiles, useDeleteFile, useReprocessFile } from '@/hooks/useFiles';
import { toast } from '@/hooks/use-toast';

export function FileHistory() {
  const { data: files = [], isLoading, error, refetch } = useFiles();
  const deleteMutation = useDeleteFile();
  const reprocessMutation = useReprocessFile();

  const handleDelete = (fileId: string, filename: string) => {
    if (confirm(`Are you sure you want to delete "${filename}"?`)) {
      deleteMutation.mutate(fileId);
    }
  };

  const handleReprocess = (fileId: string, filename: string) => {
    const message = `Reprocess "${filename}" with the latest parsing logic? This will extract all NEW- columns and may take a few minutes.`;
    if (confirm(message)) {
      reprocessMutation.mutate(fileId, {
        onSuccess: (data) => {
          toast({
            title: "Reprocessing Started",
            description: `"${filename}" is being reprocessed. This may take a few minutes.`,
          });
          // Refetch files to show updated status (processing)
          setTimeout(() => {
            refetch();
          }, 1000);
        },
        onError: (error: Error) => {
          toast({
            title: "Reprocessing Failed",
            description: error.message || 'Failed to start reprocessing. Please check the server logs.',
            variant: "destructive",
          });
        },
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-warning animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Failed to load file history</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">File History</h2>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage previously uploaded files
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Loading files...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Filename</th>
                <th>Properties</th>
                <th>Uploaded</th>
                <th>Processed</th>
                <th className="w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
              <tr key={file.id}>
                <td>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(file.status)}
                      <span className={cn(
                        'text-xs capitalize',
                        file.status === 'completed' && 'text-success',
                        file.status === 'processing' && 'text-warning',
                        file.status === 'error' && 'text-destructive'
                      )}>
                        {file.status}
                      </span>
                    </div>
                    {file.status === 'processing' && file.processingMessage && (
                      <div className="text-xs text-muted-foreground ml-6">
                        {file.processingMessage}
                        {file.processingProgress !== undefined && (
                          <span className="ml-2">({file.processingProgress}%)</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="font-mono text-sm">{file.filename}</td>
                <td className="font-mono">{file.propertyCount.toLocaleString()}</td>
                <td className="text-muted-foreground text-sm">
                  {formatDate(file.uploadedAt)}
                </td>
                <td className="text-muted-foreground text-sm">
                  {file.processedAt ? formatDate(file.processedAt) : '—'}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Download className="h-4 w-4" />
                    </Button>
                    {(file.status === 'completed' || file.status === 'error') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary hover:text-primary"
                        onClick={() => handleReprocess(file.id, file.filename)}
                        disabled={reprocessMutation.isPending || file.status === 'processing'}
                        title={file.status === 'error' ? 'Retry processing this file' : 'Reprocess file to extract all NEW- columns'}
                      >
                        {(reprocessMutation.isPending && reprocessMutation.variables === file.id) || file.status === 'processing' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(file.id, file.filename)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending && deleteMutation.variables === file.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}

        {!isLoading && files.length === 0 && (
          <div className="p-12 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No files uploaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
