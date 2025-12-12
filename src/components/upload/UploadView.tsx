import { FileUpload } from './FileUpload';
import { useToast } from '@/hooks/use-toast';

export function UploadView() {
  const { toast } = useToast();

  const handleUploadComplete = () => {
    toast({
      title: 'File Uploaded Successfully',
      description: 'Your file has been uploaded and is being processed on the server.',
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

      <FileUpload onUploadComplete={handleUploadComplete} />
    </div>
  );
}
