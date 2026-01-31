import React from 'react';
import { FileText, Download, Trash2 } from 'lucide-react';
import { ForeclosureUpload } from './ForeclosureUpload';

export function ForeclosureView() {
  const [foreclosures, setForeclosures] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeOnly, setActiveOnly] = React.useState(true);

  const loadForeclosures = async () => {
    try {
      setLoading(true);
      // Fetch foreclosures from API
      const response = await fetch(
        `/api/foreclosure?active=${activeOnly}`
      );
      const data = await response.json();
      setForeclosures(data.data || []);
    } catch (error) {
      console.error('Failed to load foreclosures:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadForeclosures();
  }, [activeOnly]);

  const handleExport = () => {
    // Export foreclosures to CSV
    const headers = [
      'Doc Number',
      'Recorded Date',
      'Sale Date',
      'Type',
      'Street Address',
      'City',
      'State',
      'Zip Code',
      'Remarks',
    ];

    const csvData = foreclosures.map((f: any) => [
      f.docNumber,
      f.recordedDate || '',
      f.saleDate || '',
      f.type || '',
      f.streetAddress || '',
      f.city || '',
      f.state || '',
      f.zipCode || '',
      f.remarks || '',
    ]);

    const csv = [headers, ...csvData]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foreclosures-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Foreclosure Records
              </h1>
              <p className="text-gray-600 mt-1">
                Manage foreclosure notices and auction dates
              </p>
            </div>

            <div className="flex items-center gap-3">
              <ForeclosureUpload onUploadComplete={loadForeclosures} />

              {foreclosures.length > 0 && (
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show Active Only
          </label>

          <div className="text-sm text-gray-600">
            {loading ? (
              'Loading...'
            ) : (
              <span>
                {foreclosures.length} record{foreclosures.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : foreclosures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mb-3 text-gray-400" />
              <p className="text-lg font-medium">No foreclosure records found</p>
              <p className="text-sm mt-1">
                Upload a file to get started
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Doc Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sale Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {foreclosures.map((foreclosure: any) => (
                    <tr key={foreclosure.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {foreclosure.docNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <div>{foreclosure.streetAddress}</div>
                          <div className="text-xs text-gray-400">
                            {foreclosure.city}, {foreclosure.state} {foreclosure.zipCode}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {foreclosure.saleDate
                          ? new Date(foreclosure.saleDate).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {foreclosure.type || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            foreclosure.active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {foreclosure.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}