import { Property } from '@/types/property';

// Determine API URL based on environment
// In production (GitHub Pages), use Railway backend
// In development, use localhost or VITE_API_URL if set
const getApiBaseUrl = () => {
  // Check if VITE_API_URL is explicitly set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In production (deployed), use Railway backend
  if (import.meta.env.PROD) {
    // Railway backend URL - Update this with your actual Railway deployment URL
    // Get it from: Railway Dashboard → Your Service → Settings → Public Domain
    return 'https://county-cad-tracker-production.up.railway.app';
  }
  
  // In development, use localhost
  return 'http://localhost:8080';
};

export const API_BASE_URL = getApiBaseUrl();

// Debug: Log API URL
console.log('[API] Using API URL:', API_BASE_URL);

// Helper function to get auth token
function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
}

// Helper function to get headers with auth
function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
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
    // Validate file size before reading
    if (file.size > 100 * 1024 * 1024) {
      reject(new Error(`File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds 100MB limit`));
      return;
    }

    const reader = new FileReader();
    
    // Set timeout for large files (5 minutes)
    const timeout = setTimeout(() => {
      reader.abort();
      reject(new Error('File read timeout - file may be too large. Please try a smaller file or split it into batches.'));
    }, 5 * 60 * 1000);
    
    reader.onload = async (e) => {
      clearTimeout(timeout);
      try {
        const fileResult = e.target?.result as string;
        if (!fileResult) {
          throw new Error('Failed to read file - no data returned');
        }

        const base64 = fileResult.split(',')[1];
        if (!base64) {
          throw new Error('Failed to extract base64 data from file');
        }

        console.log(`[UPLOAD] Sending file: ${file.name}, size: ${Math.round(file.size / 1024 / 1024)}MB, base64 length: ${base64.length}`);
        
        console.log(`[UPLOAD] Sending request to: ${API_BASE_URL}/api/upload`);
        
        let response;
        try {
          response = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filename: file.name,
              fileData: base64,
            }),
          });
        } catch (fetchError) {
          // Network error - server might not be running or CORS issue
          console.error('[UPLOAD] Fetch error:', fetchError);
          if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
            throw new Error(`Cannot connect to server at ${API_BASE_URL}. Make sure the server is running.`);
          }
          throw new Error(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
        }

        if (!response.ok) {
          let errorMessage = 'Upload failed';
          try {
            const error = await response.json();
            errorMessage = error.error || error.message || errorMessage;
          } catch (parseError) {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const uploadResult = await response.json() as { fileId?: string };
        if (!uploadResult.fileId) {
          throw new Error('Upload succeeded but no fileId returned');
        }
        resolve({ fileId: uploadResult.fileId });
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Unknown upload error'));
      }
    };

    reader.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to read file - file may be corrupted or too large'));
    };

    reader.onabort = () => {
      clearTimeout(timeout);
      reject(new Error('File read was aborted - file may be too large'));
    };

    try {
      reader.readAsDataURL(file);
    } catch (error) {
      clearTimeout(timeout);
      reject(new Error(`Failed to start file read: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
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
    console.log('[API] Files response headers:', {
      'content-type': response.headers.get('content-type'),
      'content-length': response.headers.get('content-length')
    });
    
    if (!response.ok) {
      // Check if response is HTML (error page)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const text = await response.text();
        console.error('[API] Server returned HTML instead of JSON:', text.substring(0, 200));
        throw new Error(`Server error: Received HTML response (${response.status}). The API endpoint may not be available.`);
      }
      throw new Error(`Failed to fetch files: ${response.status} ${response.statusText}`);
    }
    
    // Verify response is JSON
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[API] Server returned non-JSON response:', text.substring(0, 200));
      throw new Error(`Invalid response format: Expected JSON but received ${contentType}`);
    }
    
    const data = await response.json();
    console.log('[API] Files data:', data);
    return data;
  } catch (error) {
    console.error('[API] Error fetching files:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Cannot connect to server at ${API_BASE_URL}. Make sure the server is running.`);
    }
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
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  // Return mock data for dashboard
  return {
    totalProperties: 58432,
    byStatus: {
      judgment: 3829,
      active: 3965,
      pending: 578,
    },
    totalAmountDue: 847293847,
    avgAmountDue: 14500,
    newThisMonth: 1243,
    removedThisMonth: 702,
    deadLeads: 702,
    amountDueDistribution: [
      { range: '$0-$5K', count: Math.floor(58432 * 0.25), color: '#3B82F6' },
      { range: '$5K-$10K', count: Math.floor(58432 * 0.30), color: '#8B5CF6' },
      { range: '$10K-$25K', count: Math.floor(58432 * 0.25), color: '#EC4899' },
      { range: '$25K-$50K', count: Math.floor(58432 * 0.12), color: '#F59E0B' },
      { range: '$50K+', count: Math.floor(58432 * 0.08), color: '#EF4444' },
    ],
    pipeline: {
      totalValue: 2450000,
      activeDeals: 127,
      byStage: {
        new_lead: 1245,
        contacted: 892,
        interested: 234,
        offer_sent: 89,
        negotiating: 45,
        under_contract: 23,
        closed: 156,
        dead: 3412,
      },
      conversionRate: 12.3,
      avgDealValue: 19291,
    },
    tasks: {
      total: 1,
      luciano: 1,
      raul: 0,
      callsDueToday: 0,
      followUpsThisWeek: 0,
      textsScheduled: 0,
      mailCampaignActive: 0,
      drivebyPlanned: 0,
    },
  };
}

/**
 * Delete a file
 */
export async function deleteFile(fileId: string) {
  try {
    console.log(`[API] Deleting file: ${fileId}`);
    const response = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    
    console.log(`[API] Delete response status: ${response.status}`);
    
    if (!response.ok) {
      // Try to extract error message from response
      let errorMessage = 'Failed to delete file';
      try {
        const errorData = await response.json();
        console.error(`[API] Delete error data:`, errorData);
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        // If response is not JSON, use status text
        console.error(`[API] Failed to parse error response:`, parseError);
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log(`[API] File deleted successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[API] Delete error:`, error);
    throw error;
  }
}

/**
 * Reprocess an existing file with current parsing logic
 */
export async function reprocessFile(fileId: string) {
  try {
    console.log(`[API] Reprocessing file: ${fileId}`);
    const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/reprocess`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    
    console.log(`[API] Reprocess response status: ${response.status}`);
    
    if (!response.ok) {
      // Try to extract error message from response
      let errorMessage = 'Failed to reprocess file';
      try {
        const errorData = await response.json();
        console.error(`[API] Reprocess error data:`, errorData);
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        // If response is not JSON, use status text
        console.error(`[API] Failed to parse error response:`, parseError);
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log(`[API] Reprocess started successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[API] Reprocess error:`, error);
    throw error;
  }
}

/**
 * Get properties from latest completed file
 */
export async function getProperties(page = 1, limit = 100, status?: string, search?: string) {
  try {
    // Ensure page and limit are valid numbers
    const validPage = Math.max(1, Math.floor(Number(page)) || 1);
    // When a single status is provided (no search), allow larger limits to fetch ALL properties
    // Otherwise cap at 10000 for performance
    const maxLimit = (status && !search) ? 50000 : 10000;
    const validLimit = Math.max(1, Math.min(maxLimit, Math.floor(Number(limit)) || 100));
    
    console.log(`[API] Fetching properties: page=${validPage}, limit=${validLimit}, status=${status}, search=${search}`);
    let url = `${API_BASE_URL}/api/properties?page=${validPage}&limit=${validLimit}`;
    if (status) {
      url += `&status=${encodeURIComponent(status)}`;
    }
    if (search && search.trim()) {
      url += `&search=${encodeURIComponent(search.trim())}`;
    }
    
    console.log(`[API] Properties URL: ${url}`);
    const response = await fetch(url);
    
    console.log(`[API] Properties response status: ${response.status}`);
    
    if (!response.ok) {
      // Try to extract error message from response
      let errorMessage = 'Failed to fetch properties';
      try {
        const errorData = await response.json();
        console.error(`[API] Properties error data:`, errorData);
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        // If response is not JSON, use status text
        console.error(`[API] Failed to parse error response:`, parseError);
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log(`[API] Properties response:`, {
      propertiesCount: Array.isArray(result) ? result.length : result.properties?.length || 0,
      total: result.total || (Array.isArray(result) ? result.length : 0),
      hasStatusCounts: !!(result.statusCounts)
    });
    return result;
  } catch (error) {
    console.error(`[API] Properties fetch error:`, error);
    throw error;
  }
}

/**
 * Update property follow-up date
 */
export async function updatePropertyFollowUp(propertyId: string, followUpDate: string) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/followup`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ followUpDate }),
  });
  if (!response.ok) {
    throw new Error('Failed to update follow-up date');
  }
  return response.json();
}

/**
 * Update property notes
 */
export async function updatePropertyNotes(propertyId: string, notes: string) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/notes`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ notes }),
  });
  if (!response.ok) {
    throw new Error('Failed to update notes');
  }
  return response.json();
}

/**
 * Update property phone numbers
 */
export async function updatePropertyPhoneNumbers(propertyId: string, phoneNumbers: string[], ownerPhoneIndex?: number) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/phones`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ phoneNumbers, ownerPhoneIndex }),
  });
  if (!response.ok) {
    throw new Error('Failed to update phone numbers');
  }
  return response.json();
}

/**
 * Get all properties with actions/tasks (dueTime or actionType)
 */
export async function getTasks(): Promise<Property[]> {
  const response = await fetch(`${API_BASE_URL}/api/tasks`);
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  const data = await response.json();
  // Backend returns array directly, not wrapped in { tasks: [...] }
  return Array.isArray(data) ? data : [];
}

/**
 * Update property action (actionType, priority, dueTime, assignedTo)
 */
export async function updatePropertyAction(
  propertyId: string,
  actionType: 'call' | 'text' | 'mail' | 'driveby',
  priority: 'high' | 'med' | 'low',
  dueTime: string,
  assignedTo?: 'Luciano' | 'Raul'
) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/action`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ actionType, priority, dueTime, assignedTo }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to schedule action' }));
    throw new Error(errorData.error || 'Failed to schedule action');
  }
  return response.json();
}

/**
 * Update property priority only (quick update)
 */
export async function updatePropertyPriority(
  propertyId: string,
  priority: 'high' | 'med' | 'low'
) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/priority`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ priority }),
  });
  if (!response.ok) {
    throw new Error('Failed to update priority');
  }
  return response.json();
}

/**
 * Mark task as done with outcome
 */
export async function markTaskDone(
  propertyId: string,
  outcome: 'no_answer' | 'voicemail' | 'text_sent' | 'spoke_owner' | 'wrong_number' | 'not_interested' | 'new_owner' | 'call_back_later',
  nextAction?: 'call' | 'text' | 'mail' | 'driveby'
) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/task-done`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ outcome, nextAction }),
  });
  if (!response.ok) {
    throw new Error('Failed to mark task as done');
  }
  return response.json();
}

/**
 * Update property deal stage
 */
export async function updatePropertyDealStage(
  propertyId: string,
  dealStage: 'new_lead' | 'contacted' | 'interested' | 'offer_sent' | 'negotiating' | 'under_contract' | 'closed' | 'dead',
  estimatedDealValue?: number,
  offerAmount?: number,
  expectedCloseDate?: string
) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/deal-stage`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ dealStage, estimatedDealValue, offerAmount, expectedCloseDate }),
  });
  if (!response.ok) {
    throw new Error('Failed to update deal stage');
  }
  return response.json();
}

/**
 * Login user
 */
export async function login(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }
  
  const data = await response.json();
  return data;
}

/**
 * Logout user
 */
export async function logout() {
  const token = getAuthToken();
  if (!token) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      // Even if API call fails, we'll clear local storage
      console.error('Logout API call failed');
    }
  } catch (error) {
    // Network error - still clear local storage
    console.error('Logout error:', error);
  }
}

/**
 * Check current session
 */
export async function checkSession() {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No token found');
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('authToken');
      throw new Error('Session expired');
    }
    const error = await response.json();
    throw new Error(error.error || 'Failed to check session');
  }
  
  return response.json();
}

/**
 * Register new user
 */
export async function register(username: string, email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, email, password }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Registration failed');
  }
  
  return response.json();
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Email verification failed');
  }
  
  return response.json();
}

/**
 * Get all pre-foreclosure records
 * @param filters Optional filters for address, city, zip
 */
export async function getPreForeclosures(filters?: { address?: string; city?: string; zip?: string }) {
  const params = new URLSearchParams();
  if (filters?.address) params.append('address', filters.address);
  if (filters?.city) params.append('city', filters.city);
  if (filters?.zip) params.append('zip', filters.zip);
  
  const url = `${API_BASE_URL}/api/preforeclosure${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch pre-foreclosure records');
  }
  return response.json();
}

/**
 * Solve Vehicle Routing Problem (VRP) for selected properties
 */
export async function solveVRP(properties: Array<{
  id: string;
  latitude: number;
  longitude: number;
  propertyAddress?: string;
  address?: string;
  [key: string]: any;
}>, numVehicles: 1 | 2 = 1, depotLat?: number, depotLon?: number, depotPropertyId?: string) {
  const response = await fetch(`${API_BASE_URL}/api/routing/solve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      properties,
      numVehicles,
      depotLat,
      depotLon,
      depotPropertyId, // Pass the specific property ID to use as depot
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to solve routing problem');
  }
  
  return response.json();
}

/**
 * Update a pre-foreclosure record (operator-entered fields only)
 */
export async function updatePreForeclosure(updates: {
  document_number: string;
  internal_status?: string;
  notes?: string;
  phoneNumbers?: string[];
  ownerPhoneIndex?: number;
  last_action_date?: string;
  next_follow_up_date?: string;
  actionType?: 'call' | 'text' | 'mail' | 'driveby';
  priority?: 'high' | 'med' | 'low';
  dueTime?: string;
  assignedTo?: 'Luciano' | 'Raul';
}) {
  const response = await fetch(`${API_BASE_URL}/api/preforeclosure/${updates.document_number}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update pre-foreclosure record');
  }
  return response.json();
}

/**
 * Upload pre-foreclosure file
 */
export async function uploadPreForeclosureFile(file: File): Promise<{
  success: boolean;
  fileId: string;
  recordsProcessed: number;
  totalRecords: number;
  activeRecords: number;
  inactiveRecords: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const base64 = (e.target?.result as string).split(',')[1];
        
        const response = await fetch(`${API_BASE_URL}/api/preforeclosure/upload`, {
          method: 'POST',
          headers: getAuthHeaders(),
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
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Get pre-foreclosure upload history
 */
export async function getPreForeclosureUploadHistory(limit: number = 10): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/api/preforeclosure/upload-history?limit=${limit}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch upload history');
  }

  return response.json();
}

/**
 * Get latest pre-foreclosure upload stats (for dashboard)
 */
export async function getLatestPreForeclosureUploadStats(): Promise<{
  hasData: boolean;
  filename?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  newRecords?: number;
  updatedRecords?: number;
  inactiveRecords?: number;
  totalRecords?: number;
  activeRecords?: number;
  newDocumentNumbers?: string[];
  message?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/preforeclosure/upload-stats/latest`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch latest upload stats');
  }

  return response.json();
}

/**
 * Delete all pre-foreclosure records
 */
export async function deletePreForeclosures(): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/preforeclosure`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete pre-foreclosure records');
  }

  return response.json();
}

/**
 * Mark or unmark pre-foreclosure record as visited
 */
export async function markPreForeclosureVisited(documentNumber: string, driver?: 'Luciano' | 'Raul', visited: boolean = true) {
  const url = `${API_BASE_URL}/api/preforeclosure/${encodeURIComponent(documentNumber)}/visit`;
  console.log('[API] Updating pre-foreclosure visited status:', { url, documentNumber, driver, visited });
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ driver, visited }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[API] Error updating visited status:', error);
    throw new Error(error.error || 'Failed to update visited status');
  }
  
  return response.json();
}

// ============================================================================
// ROUTE MANAGEMENT
// ============================================================================

export interface Route {
  id: string;
  driver: 'Luciano' | 'Raul';
  status: 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  routeData: any;
  createdAt: string;
  finishedAt?: string;
  updatedAt: string;
  recordCount: number;
  records: Array<{
    id: string;
    orderIndex: number;
    isDepot: boolean;
    record: {
      id: string;
      document_number?: string; // snake_case (from interface)
      documentNumber?: string; // camelCase (from backend)
      address: string;
      city: string;
      zip: string;
      latitude?: number;
      longitude?: number;
      visited: boolean;
      visited_at?: string;
      visited_by?: string;
      visitedAt?: string; // camelCase (from backend)
      visitedBy?: string; // camelCase (from backend)
    };
  }>;
}

/**
 * Get all routes (optionally filtered by status)
 */
export async function getRoutes(status?: 'ACTIVE' | 'FINISHED' | 'CANCELLED'): Promise<Route[]> {
  const url = status 
    ? `${API_BASE_URL}/api/routes?status=${status}`
    : `${API_BASE_URL}/api/routes`;
  
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch routes');
  }
  
  return response.json();
}

/**
 * Get only active routes
 */
export async function getActiveRoutes(): Promise<Route[]> {
  const response = await fetch(`${API_BASE_URL}/api/routes/active`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch active routes');
  }
  
  return response.json();
}

/**
 * Create a new route
 */
export async function createRoute(
  driver: 'Luciano' | 'Raul',
  routeData: any,
  recordIds: string[],
  routeType: 'PROPERTY' | 'PREFORECLOSURE' = 'PREFORECLOSURE'
): Promise<{ id: string; driver: string; status: string; createdAt: string; recordCount: number }> {
  const response = await fetch(`${API_BASE_URL}/api/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ driver, routeData, recordIds, routeType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create route');
  }

  return response.json();
}

/**
 * Reorder a record in a route
 */
export async function reorderRecordInRoute(
  routeId: string,
  recordId: string,
  newOrderIndex: number
): Promise<{ success: boolean; route: Route }> {
  const response = await fetch(`${API_BASE_URL}/api/routes/${routeId}/records/${recordId}/reorder`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ newOrderIndex }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reorder record in route');
  }
  
  return response.json();
}

/**
 * Finish a route (mark as finished)
 */
export async function finishRoute(routeId: string): Promise<Route> {
  const response = await fetch(`${API_BASE_URL}/api/routes/${routeId}/finish`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to finish route');
  }
  
  return response.json();
}

/**
 * Cancel a route
 */
export async function cancelRoute(routeId: string): Promise<Route> {
  const response = await fetch(`${API_BASE_URL}/api/routes/${routeId}/cancel`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel route');
  }
  
  return response.json();
}

/**
 * Delete a route (preserves pre-foreclosure records and their visited status)
 */
export async function deleteRoute(routeId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/routes/${routeId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete route');
  }
  
  return response.json();
}

/**
 * Remove a specific record from a route
 */
export async function removeRecordFromRoute(routeId: string, recordId: string): Promise<{ success: boolean; route: Route; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/routes/${routeId}/records/${recordId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove record from route');
  }
  
  return response.json();
}
