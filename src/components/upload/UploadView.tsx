import { FileUpload } from './FileUpload';
import { useToast } from '@/hooks/use-toast';

export function UploadView() {
  const { toast } = useToast();

  const handleUpload = (file: File) => {
    toast({
      title: 'File Uploaded',
      description: `${file.name} has been uploaded and is being processed.`,
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold">Upload Property Data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your monthly Bexar County tax-delinquent Excel file
        </p>
      </div>

      <FileUpload onUpload={handleUpload} />
    </div>
  );
}
