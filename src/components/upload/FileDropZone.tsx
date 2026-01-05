import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUploadFile } from '@/hooks/useFiles';

interface FileDropZoneProps {
  onUploadComplete?: () => void;
  compact?: boolean;
}

export function FileDropZone({ onUploadComplete, compact = false }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadMutation = useUploadFile();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): boolean => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return false;
    }
    const fileSizeMB = file.size / 1024 / 1024;
    if (file.size > 100 * 1024 * 1024) {
      setError(`File size (${fileSizeMB.toFixed(1)}MB) exceeds 100MB limit. Please split the file into smaller batches.`);
      return false;
    }
    // Warn for very large files (but still allow)
    if (file.size > 50 * 1024 * 1024) {
      console.warn(`Large file detected: ${fileSizeMB.toFixed(1)}MB - upload may take several minutes`);
    }
    return true;
  };

  const handleUpload = async (file: File) => {
    setSelectedFile(file);
    setError(null);

    try {
      await uploadMutation.mutateAsync(file);
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      handleUpload(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      handleUpload(file);
    }
  };

  const resetUpload = () => {
    uploadMutation.reset();
    setSelectedFile(null);
    setError(null);
  };

  const isUploading = uploadMutation.isPending;
  const isSuccess = uploadMutation.isSuccess;
  const isError = uploadMutation.isError || !!error;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed rounded-lg transition-all',
        compact ? 'p-6' : 'p-12',
        isDragging ? 'border-primary bg-primary/5 shadow-lg' : 'border-border',
        isError && 'border-destructive bg-destructive/5',
        isSuccess && 'border-success bg-success/5'
      )}
    >
      {!isUploading && !isSuccess && !isError && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className={cn(
              "rounded-full bg-secondary flex items-center justify-center flex-shrink-0",
              compact ? "w-10 h-10" : "w-16 h-16"
            )}>
              <Upload className={cn(compact ? "h-5 w-5" : "h-8 w-8", "text-muted-foreground")} />
            </div>
            <div className="flex-1">
              <h3 className={cn("font-semibold", compact ? "text-sm" : "text-lg")}>
                Drag and drop your Excel file here, or click to browse
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .xlsx and .xls files up to 100MB
              </p>
            </div>
          </div>
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button asChild size={compact ? "sm" : "default"}>
              <span className="cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Select File
              </span>
            </Button>
          </label>
        </div>
      )}

      {isUploading && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className={cn(
              "rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0",
              compact ? "w-10 h-10" : "w-16 h-16"
            )}>
              <Loader2 className={cn(compact ? "h-5 w-5" : "h-8 w-8", "text-primary animate-spin")} />
            </div>
            <div className="flex-1">
              <h3 className={cn("font-semibold", compact ? "text-sm" : "text-lg")}>
                Uploading & Processing...
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedFile?.name}
              </p>
            </div>
          </div>
        </div>
      )}

      {isSuccess && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className={cn(
              "rounded-full bg-success/10 flex items-center justify-center flex-shrink-0",
              compact ? "w-10 h-10" : "w-16 h-16"
            )}>
              <CheckCircle2 className={cn(compact ? "h-5 w-5" : "h-8 w-8", "text-success")} />
            </div>
            <div className="flex-1">
              <h3 className={cn("font-semibold text-success", compact ? "text-sm" : "text-lg")}>
                Upload Complete!
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedFile?.name} has been processed successfully.
              </p>
            </div>
          </div>
          <Button onClick={resetUpload} variant="outline" size={compact ? "sm" : "default"}>
            Upload Another
          </Button>
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className={cn(
              "rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0",
              compact ? "w-10 h-10" : "w-16 h-16"
            )}>
              <AlertCircle className={cn(compact ? "h-5 w-5" : "h-8 w-8", "text-destructive")} />
            </div>
            <div className="flex-1">
              <h3 className={cn("font-semibold text-destructive", compact ? "text-sm" : "text-lg")}>
                Upload Error
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {error || (uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Upload failed')}
              </p>
            </div>
          </div>
          <Button onClick={resetUpload} variant="outline" size={compact ? "sm" : "default"}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
