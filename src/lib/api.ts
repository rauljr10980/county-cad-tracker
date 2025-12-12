const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Debug: Log API URL in production
if (import.meta.env.PROD) {
  console.log('[API] Using API URL:', API_BASE_URL);
}

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

/**
 * Upload a file to the backend
 */
export async function uploadFile(file: File): Promise<{ fileId: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const base64 = (e.target?.result as string).split(',')[1];
        
        const response = await fetch(`${API_BASE_URL}/api/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            fileData: base64,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const result = await response.json();
        resolve({ fileId: result.fileId });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Get file upload history
 */
export async function getFiles() {
  const url = `${API_BASE_URL}/api/files`;
  console.log('[API] Fetching files from:', url);
  try {
    const response = await fetch(url);
    console.log('[API] Files response status:', response.status);
    if (!response.ok) {
      throw new Error('Failed to fetch files');
    }
    const data = await response.json();
    console.log('[API] Files data:', data);
    return data;
  } catch (error) {
    console.error('[API] Error fetching files:', error);
    throw error;
  }
}

/**
 * Get comparison report for a specific file
 */
export async function getComparison(fileId: string) {
  const response = await fetch(`${API_BASE_URL}/api/comparisons/${fileId}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch comparison');
  }
  return response.json();
}

/**
 * Get latest comparison report
 */
export async function getLatestComparison() {
  const response = await fetch(`${API_BASE_URL}/api/comparisons/latest`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch latest comparison');
  }
  return response.json();
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  const response = await fetch(`${API_BASE_URL}/api/dashboard`);
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard stats');
  }
  return response.json();
}

