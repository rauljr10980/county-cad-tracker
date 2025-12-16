import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { getGCSInstance } from '@/services/googleCloudStorage';
import { parseExcelFile, ParserProgress } from '@/services/excelParser';
import { saveFileMetadata, saveProperties, incrementUploadQuota, canUpload, getAllFiles, getProperties } from '@/services/fileStorage';
import { detectDifferences } from '@/services/differenceDetector';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  onUpload?: (fileId: string) => void;
}

type UploadStage = 'idle' | 'checking' | 'uploading' | 'parsing' | 'processing' | 'complete' | 'error';

export function FileUpload({ onUpload }: FileUploadProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [propertyCount, setPropertyCount] = useState<number>(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): boolean => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      setError('Please upload an Excel file (.xlsx, .xls) or CSV file');
      return false;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('File size must be less than 100MB');
      return false;
    }
    return true;
  };

  const processUpload = async (file: File) => {
    try {
      setError(null);
      const fileId = `file-${Date.now()}`;

      // Check upload quota
      setUploadStage('checking');
      setStatusMessage('Checking upload quota...');
      const { allowed, quota } = await canUpload();

      if (!allowed) {
        setError(`Monthly upload limit reached (${quota.count}/${quota.limit}). Resets next month.`);
        setUploadStage('error');
        return;
      }

      // Upload to Google Cloud Storage
      setUploadStage('uploading');
      setStatusMessage('Uploading to cloud storage...');

      try {
        const gcs = getGCSInstance();
        const uploadResult = await gcs.uploadFile(file, (uploadProgress) => {
          setProgress(uploadProgress.percentage);
        });

        // Save file metadata
        await saveFileMetadata({
          id: fileId,
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          propertyCount: 0,
          status: 'processing',
          gcsFileName: uploadResult.name,
          gcsUrl: uploadResult.url,
        });

        // Increment upload quota
        await incrementUploadQuota();
      } catch (gcsError) {
        console.warn('GCS upload failed, processing locally:', gcsError);
        toast({
          title: 'Cloud upload unavailable',
          description: 'Processing file locally. Configure Google Cloud Storage for cloud sync.',
          variant: 'default',
        });
      }

      // Parse Excel file
      setUploadStage('parsing');
      setStatusMessage('Parsing Excel file...');
      setProgress(0);

      const properties = await parseExcelFile(file, (parserProgress: ParserProgress) => {
        setProgress(parserProgress.percentage);
        setStatusMessage(
          `Parsing: ${parserProgress.currentRow.toLocaleString()} / ${parserProgress.totalRows.toLocaleString()} rows`
        );
      });

      setPropertyCount(properties.length);

      // Process differences with previous upload
      setUploadStage('processing');
      setStatusMessage('Detecting changes...');
      setProgress(0);

      const allFiles = await getAllFiles();
      if (allFiles.length > 1) {
        // Get previous file
        const previousFile = allFiles.find(f => f.id !== fileId && f.status === 'completed');
        if (previousFile) {
          const previousProperties = await getProperties(previousFile.id);
          if (previousProperties) {
            const differences = detectDifferences(properties, previousProperties);
            toast({
              title: 'Changes Detected',
              description: `New: ${differences.newProperties.length}, Removed: ${differences.removedProperties.length}, Changed: ${differences.changedProperties.length}`,
            });
          }
        }
      }

      // Save properties
      await saveProperties(fileId, properties);

      // Update file metadata
      await saveFileMetadata({
        id: fileId,
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
        propertyCount: properties.length,
        status: 'completed',
      });

      setUploadStage('complete');
      setProgress(100);
      setStatusMessage(`Successfully processed ${properties.length.toLocaleString()} properties`);

      toast({
        title: 'Upload Complete',
        description: `${file.name} processed successfully`,
      });

      onUpload?.(fileId);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadStage('error');
      toast({
        title: 'Upload Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
      processUpload(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
      processUpload(file);
    }
  };

  const resetUpload = () => {
    setUploadStage('idle');
    setProgress(0);
    setSelectedFile(null);
    setError(null);
    setStatusMessage('');
    setPropertyCount(0);
  };

  const getStageIcon = () => {
    switch (uploadStage) {
      case 'uploading':
        return <Cloud className="h-8 w-8 text-primary animate-pulse" />;
      case 'parsing':
      case 'processing':
        return <Loader2 className="h-8 w-8 text-primary animate-spin" />;
      case 'complete':
        return <CheckCircle2 className="h-8 w-8 text-success" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-destructive" />;
      default:
        return <Upload className="h-8 w-8 text-muted-foreground" />;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center transition-all',
          isDragging ? 'border-primary bg-primary/5' : 'border-border',
          uploadStage === 'error' && 'border-destructive bg-destructive/5',
          uploadStage === 'complete' && 'border-success bg-success/5'
        )}
      >
        {uploadStage === 'idle' && (
          <>
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Upload Excel File</h3>
            <p className="text-muted-foreground mb-4">
              Drag and drop your Bexar County tax-delinquent Excel file here
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Supports .xlsx, .xls, and .csv files up to 100MB
            </p>
            <label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
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

        {(uploadStage === 'checking' || uploadStage === 'uploading' || uploadStage === 'parsing' || uploadStage === 'processing') && (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              {getStageIcon()}
            </div>
            <h3 className="text-lg font-semibold mb-2 capitalize">{uploadStage}...</h3>
            <p className="text-muted-foreground mb-4">{selectedFile?.name}</p>
            <div className="max-w-xs mx-auto">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
              {statusMessage && (
                <p className="text-xs text-muted-foreground mt-2">{statusMessage}</p>
              )}
            </div>
          </>
        )}

        {uploadStage === 'complete' && (
          <>
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-success">Upload Complete!</h3>
            <p className="text-muted-foreground mb-2">
              {selectedFile?.name} has been processed successfully.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {propertyCount.toLocaleString()} properties imported
            </p>
            <Button onClick={resetUpload} variant="outline">
              Upload Another File
            </Button>
          </>
        )}

        {error && (
          <>
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-destructive">Upload Error</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
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
          <li>• Upload to Google Cloud Storage (if configured)</li>
          <li>• Automatic header detection and column mapping</li>
          <li>• Status detection for each property (J/A/P/F/D)</li>
          <li>• Comparison with previous uploads</li>
          <li>• Auto-detection of foreclosed properties and dead leads</li>
        </ul>
      </div>
    </div>
  );
}
