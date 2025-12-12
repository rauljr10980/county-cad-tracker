import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUploadFile } from '@/hooks/useFiles';

interface FileUploadProps {
  onUploadComplete?: () => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
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
    if (file.size > 100 * 1024 * 1024) {
      setError('File size must be less than 100MB');
      return false;
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
    <div className="max-w-2xl mx-auto">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center transition-all',
          isDragging ? 'border-primary bg-primary/5' : 'border-border',
          isError && 'border-destructive bg-destructive/5',
          isSuccess && 'border-success bg-success/5'
        )}
      >
        {!isUploading && !isSuccess && !isError && (
          <>
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Upload Excel File</h3>
            <p className="text-muted-foreground mb-4">
              Drag and drop your Bexar County tax-delinquent Excel file here
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Supports .xlsx and .xls files up to 100MB
            </p>
            <label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button asChild>
                <span className="cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Select File
                </span>
              </Button>
            </label>
          </>
        )}

        {isUploading && (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Uploading & Processing...</h3>
            <p className="text-muted-foreground mb-4">
              {selectedFile?.name}
            </p>
            <p className="text-sm text-muted-foreground">
              Uploading file to backend and processing property data...
            </p>
          </>
        )}

        {isSuccess && (
          <>
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-success">Upload Complete!</h3>
            <p className="text-muted-foreground mb-4">
              {selectedFile?.name} has been processed successfully.
            </p>
            <Button onClick={resetUpload} variant="outline">
              Upload Another File
            </Button>
          </>
        )}

        {isError && (
          <>
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-destructive">Upload Error</h3>
            <p className="text-muted-foreground mb-4">
              {error || (uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Upload failed')}
            </p>
            <Button onClick={resetUpload} variant="outline">
              Try Again
            </Button>
          </>
        )}
      </div>

      {/* Processing Info */}
      <div className="mt-6 bg-secondary/50 rounded-lg p-4">
        <h4 className="text-sm font-medium mb-2">What happens after upload?</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Automatic header detection and column mapping</li>
          <li>• Status detection for each property (J/A/P)</li>
          <li>• Comparison with previous uploads</li>
          <li>• Optional CAD data fetching from Bexar County</li>
        </ul>
      </div>
    </div>
  );
}
