import { Download, Trash2, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mockFiles } from '@/data/mockData';
import { cn } from '@/lib/utils';

export function FileHistory() {
  const files = mockFiles;

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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">File History</h2>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage previously uploaded files
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
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
                    <span className={cn(
                      'text-xs capitalize',
                      file.status === 'completed' && 'text-success',
                      file.status === 'processing' && 'text-warning',
                      file.status === 'error' && 'text-destructive'
                    )}>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {files.length === 0 && (
          <div className="p-12 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No files uploaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
