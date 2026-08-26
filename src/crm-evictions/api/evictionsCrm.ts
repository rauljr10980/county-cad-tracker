import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import type {
  CrmStats, GeocodeStatus, LeadDetail, LeadListResponse, LeadRow, ListLeadsParams, MapPoint, PipelineCounts,
} from '../types/crm';

type MapParams = { stage?: string; service?: string; assignedTo?: string };

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = { ...getAuthHeaders(), ...(init?.headers || {}) } as Record<string, string>;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();

  let body: Record<string, unknown> = {};
  try {
    if (text) body = JSON.parse(text);
  } catch {
    body = { error: text || `Request failed (${res.status})` };
  }

  if (!res.ok) throw new Error((body.error as string) || `Request failed (${res.status})`);
  return body as T;
};

export const verifyPassword = (password: string) =>
  request<{ ok: true }>('/api/auth/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

export const getStats = () => request<CrmStats>('/api/evictions/stats');

export const listLeads = (params: ListLeadsParams = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return request<LeadListResponse>(`/api/evictions/landlords?${query}`);
};

export const getPipelineCounts = (params: ListLeadsParams = {}) => {
  const query = new URLSearchParams();
  // The counts endpoint applies every filter except the queue, since each tab
  // counts its own slice of the same filter set.
  Object.entries(params).forEach(([key, value]) => {
    if (key !== 'queue' && key !== 'page' && key !== 'pageSize' && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return request<PipelineCounts>(`/api/evictions/pipeline/counts${suffix ? `?${suffix}` : ''}`);
};

export const getLead = (id: string) => request<LeadDetail>(`/api/evictions/landlords/${id}`);

export const getGeocodeStatus = () => request<GeocodeStatus>('/api/evictions/geocode/status');

export const getMapPoints = (params: MapParams = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const suffix = query.toString();
  return request<{ points: MapPoint[]; total: number }>(`/api/evictions/map${suffix ? `?${suffix}` : ''}`);
};

// PATCH /landlords/:id returns a bare `update(...)` with no `include` — see LeadRow.
export const patchLead = (id: string, data: Record<string, unknown>) =>
  request<LeadRow>(`/api/evictions/landlords/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
