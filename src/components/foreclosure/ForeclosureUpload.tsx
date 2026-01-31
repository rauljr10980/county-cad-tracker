import React, { useState } from 'react';
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useUploadForeclosureFile } from '../../hooks/useForeclosure';
import { toast } from 'sonner';

interface ForeclosureUploadProps {
  onUploadComplete?: () => void;
}

export function ForeclosureUpload({ onUploadComplete }: ForeclosureUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'standard' | 'address-only'>('standard');
  const uploadMutation = useUploadForeclosureFile();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

      if (!validExtensions.includes(fileExtension)) {
        toast.error('Invalid file type. Please upload .xlsx, .xls, or .csv files only.');
        return;
      }

      // Validate file size (100MB max)
      const maxSize = 100 * 1024 * 1024; // 100MB in bytes
      if (file.size > maxSize) {
        toast.error('File size exceeds 100MB limit.');
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first.');
      return;
    }

    try {
      const result = await uploadMutation.mutateAsync({
        file: selectedFile,
        mode: uploadMode,
      });

      toast.success(
        `Successfully uploaded ${result.recordsProcessed} foreclosure records!`,
        {
          description: `Active: ${result.activeRecords} | Inactive: ${result.inactiveRecords}`,
        }
      );

      setIsOpen(false);
      setSelectedFile(null);
      onUploadComplete?.();
    } catch (error) {
      toast.error('Upload failed', {
        description: error instanceof Error ? error.message : 'An error occurred during upload',
      });
    }
  };

  const handleClose = () => {
    if (!uploadMutation.isPending) {
      setIsOpen(false);
      setSelectedFile(null);
      uploadMutation.reset();
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Upload className="w-4 h-4" />
        Upload Foreclosure File
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Upload Foreclosure File</h2>
              <button
                onClick={handleClose}
                disabled={uploadMutation.isPending}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              <p className="text-gray-600">
                Choose an upload mode and select your file.
              </p>

              {/* Upload Mode Selection */}
              <div className="flex gap-3">
                <button
                  onClick={() => setUploadMode('standard')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                    uploadMode === 'standard'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Standard Upload
                </button>
                <button
                  onClick={() => setUploadMode('address-only')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                    uploadMode === 'address-only'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Address-Only Upload
                </button>
              </div>

              {/* File Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900">
                  Select File (.xlsx, .xls, or .csv)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    disabled={uploadMutation.isPending}
                    className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed file:mr-4 file:py-2 file:px-4 file:rounded-l-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                {selectedFile && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>{selectedFile.name}</span>
                    <span className="text-gray-400">
                      ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                )}
              </div>

              {/* File Requirements */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-gray-900">File Requirements:</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>
                      <strong>Document Number</strong> (required)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>
                      <strong>Type:</strong> Mortgage or Tax
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>
                      <strong>Address, City, ZIP</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>
                      <strong>Filing Month</strong> (optional, defaults to current month)
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-gray-500 mt-3">
                  Records are matched by Document Number. Missing records from new uploads are
                  marked inactive.
                </p>
              </div>

              {/* Upload Status */}
              {uploadMutation.isPending && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                  <span className="text-blue-900 font-medium">Uploading and processing file...</span>
                </div>
              )}

              {uploadMutation.isError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-red-900 font-medium">Upload Failed</p>
                    <p className="text-red-700 text-sm mt-1">
                      {uploadMutation.error instanceof Error
                        ? uploadMutation.error.message
                        : 'An error occurred during upload'}
                    </p>
                  </div>
                </div>
              )}

              {uploadMutation.isSuccess && (
                <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-green-900 font-medium">Upload Successful!</p>
                    <p className="text-green-700 text-sm mt-1">
                      Your foreclosure data has been processed successfully.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={handleClose}
                disabled={uploadMutation.isPending}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploadMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploadMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}