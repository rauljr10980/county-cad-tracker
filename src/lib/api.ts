import { Property } from '@/types/property';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Debug: Log API URL in production
if (import.meta.env.PROD) {
  console.log('[API] Using API URL:', API_BASE_URL);
}

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
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  const response = await fetch(`${API_BASE_URL}/api/dashboard`);
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard stats');
  }
  return response.json();
}

/**
 * Delete a file
 */
export async function deleteFile(fileId: string) {
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete file');
  }
  return response.json();
}

/**
 * Get properties from latest completed file
 */
export async function getProperties(page = 1, limit = 100, status?: string, search?: string) {
  let url = `${API_BASE_URL}/api/properties?page=${page}&limit=${limit}`;
  if (status) {
    url += `&status=${status}`;
  }
  if (search && search.trim()) {
    url += `&search=${encodeURIComponent(search.trim())}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch properties');
  }
  return response.json();
}

/**
 * Update property follow-up date
 */
export async function updatePropertyFollowUp(propertyId: string, followUpDate: string) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/followup`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
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
 * Update property action (actionType, priority, dueTime)
 */
export async function updatePropertyAction(
  propertyId: string,
  actionType: 'call' | 'text' | 'mail' | 'driveby',
  priority: 'high' | 'med' | 'low',
  dueTime: string
) {
  const response = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/action`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ actionType, priority, dueTime }),
  });
  if (!response.ok) {
    throw new Error('Failed to update action');
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
    },
    body: JSON.stringify({ outcome, nextAction }),
  });
  if (!response.ok) {
    throw new Error('Failed to mark task as done');
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
 */
export async function getPreForeclosures() {
  const response = await fetch(`${API_BASE_URL}/api/preforeclosure`);
  if (!response.ok) {
    throw new Error('Failed to fetch pre-foreclosure records');
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
  last_action_date?: string;
  next_follow_up_date?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/preforeclosure/${updates.document_number}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
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

