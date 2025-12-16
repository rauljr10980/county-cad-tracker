import { useEffect, useState } from 'react';
import { Download, Trash2, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAllFiles, deleteFile, FileMetadata, getUploadQuota, UploadQuota } from '@/services/fileStorage';
import { getGCSInstance } from '@/services/googleCloudStorage';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function FileHistory() {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [quota, setQuota] = useState<UploadQuota | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const [allFiles, uploadQuota] = await Promise.all([
        getAllFiles(),
        getUploadQuota(),
      ]);
      setFiles(allFiles);
      setQuota(uploadQuota);
    } catch (error) {
      console.error('Error loading files:', error);
      toast({
        title: 'Error',
        description: 'Failed to load file history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleDownload = async (file: FileMetadata) => {
    try {
      if (file.gcsFileName) {
        const gcs = getGCSInstance();
        const blob = await gcs.downloadFile(file.gcsFileName);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.filename;
        a.click();
        URL.revokeObjectURL(url);

        toast({
          title: 'Download Started',
          description: file.filename,
        });
      } else {
        toast({
          title: 'Download Unavailable',
          description: 'File not stored in cloud',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: 'Download Failed',
        description: 'Unable to download file',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (file: FileMetadata) => {
    if (!confirm(`Delete ${file.filename}? This will also delete all associated property data.`)) {
      return;
    }

    try {
      // Delete from cloud storage if exists
      if (file.gcsFileName) {
        try {
          const gcs = getGCSInstance();
          await gcs.deleteFile(file.gcsFileName);
        } catch (error) {
          console.warn('Cloud delete failed:', error);
        }
      }

      // Delete from local storage
      await deleteFile(file.id);

      toast({
        title: 'File Deleted',
        description: file.filename,
      });

      // Reload files
      loadFiles();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete Failed',
        description: 'Unable to delete file',
        variant: 'destructive',
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

  const quotaPercentage = quota ? (quota.count / quota.limit) * 100 : 0;

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">File History</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage previously uploaded files
            </p>
          </div>
          <Button onClick={loadFiles} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Upload Quota */}
      {quota && (
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Monthly Upload Quota</h3>
            <span className="text-sm text-muted-foreground">
              {quota.count.toLocaleString()} / {quota.limit.toLocaleString()}
            </span>
          </div>
          <Progress value={quotaPercentage} className="h-2 mb-2" />
          <p className="text-xs text-muted-foreground">
            {quota.limit - quota.count} uploads remaining this month
            {quotaPercentage > 80 && (
              <span className="text-warning ml-2">⚠️ Approaching limit</span>
            )}
          </p>
        </Card>
      )}

      {/* Files Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Loading files...</p>
          </div>
        ) : files.length > 0 ? (
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
                    <div className="flex items-center gap-2">
                      {getStatusIcon(file.status)}
                      <span
                        className={cn(
                          'text-xs capitalize',
                          file.status === 'completed' && 'text-success',
                          file.status === 'processing' && 'text-warning',
                          file.status === 'error' && 'text-destructive'
                        )}
                      >
                        {file.status}
                      </span>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDownload(file)}
                        disabled={!file.gcsFileName}
                        title={file.gcsFileName ? 'Download' : 'Not in cloud storage'}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(file)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No files uploaded yet</p>
            <p className="text-sm text-muted-foreground">
              Upload your first Excel file to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
