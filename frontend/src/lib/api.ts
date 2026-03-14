const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const auth = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    }),
  register: (email: string, password: string, name: string) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password, name })
    }),
  me: () => request<User>('/api/auth/me'),
};

export const activities = {
  list: (params?: { source_type?: string; date?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ activities: Activity[]; total: number }>(`/api/activities?${q}`);
  },
  stats: (date?: string) => {
    const q = date ? `?date=${date}` : '';
    return request<ActivityStats>(`/api/activities/stats${q}`);
  },
  getUntaggedCount: () => request<{ count: number }>('/api/activities/untagged'),
  assign: (id: string, data: { client_id: string; matter?: string }) =>
    request<Activity>(`/api/activities/${id}/assign`, { method: 'PATCH', body: JSON.stringify(data) })
};

export const entries = {
  list: (params?: { client?: string; date?: string; limit?: number }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ entries: ManualEntry[]; total: number }>(`/api/entries?${q}`);
  },
  create: (data: Partial<ManualEntry>) =>
    request<ManualEntry>('/api/entries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ManualEntry>) =>
    request<ManualEntry>(`/api/entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/entries/${id}`, { method: 'DELETE' }),
};

export const suggestions = {
  list: (params?: { status?: string; date?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ suggestions: BillableSuggestion[] }>(`/api/suggestions?${q}`);
  },
  generate: (date?: string) =>
    request<{ generated: number; suggestions: BillableSuggestion[] }>(
      '/api/suggestions/generate', { method: 'POST', body: JSON.stringify({ date }) }
    ),
  accept: (id: string, data: { client: string; matter?: string; notes?: string }) =>
    request<{ suggestion: BillableSuggestion; entry: ManualEntry }>(
      `/api/suggestions/${id}/accept`, { method: 'PATCH', body: JSON.stringify(data) }
    ),
  dismiss: (id: string) =>
    request<BillableSuggestion>(`/api/suggestions/${id}/dismiss`, { method: 'PATCH' }),
};

export const clients = {
  list: () => request<Client[]>('/api/clients'),
  get: (id: string) => request<Client & { total_billed: number }>(`/api/clients/${id}`),
  create: (data: Partial<Client>) => request<Client>('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Client>) => request<Client>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string; id: string }>(`/api/clients/${id}`, { method: 'DELETE' }),
};

export const bills = {
  list: () => request<Bill[]>('/api/bills'),
  get: (id: string) => request<Bill & { line_items: BillLineItem[] }>(`/api/bills/${id}`),
  generate: (data: { client_id: string; date_from: string; date_to: string; matter?: string; include_tracked_activities?: boolean }) => 
    request<Bill & { line_items: BillLineItem[] }>('/api/bills/generate', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: 'draft' | 'sent' | 'paid') => 
    request<Bill>(`/api/bills/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  delete: (id: string) => request<{ message: string }>(`/api/bills/${id}`, { method: 'DELETE' }),
  downloadPdf: async (id: string) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/bills/${id}/pdf`, { headers });
    if (!res.ok) throw new Error('Download failed');
    return res.blob();
  }
};

export const rules = {
  list: () => request<TrackingRule[]>('/api/rules'),
  create: (data: Partial<TrackingRule>) => request<TrackingRule>('/api/rules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TrackingRule>) => request<TrackingRule>(`/api/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/rules/${id}`, { method: 'DELETE' }),
  test: (data: { domain?: string; app_name?: string; window_title?: string; file_name?: string }) => 
    request<{ match: boolean; rule: TrackingRule | null; client_name?: string; matter?: string }>('/api/rules/test', { method: 'POST', body: JSON.stringify(data) })
};

export const sessions = {
  active: () => request<ActiveSession | null>('/api/sessions/active'),
  start: (data: { client_id: string; matter?: string }) => request<ActiveSession>('/api/sessions/start', { method: 'POST', body: JSON.stringify(data) }),
  end: () => request<ActiveSession | { message: string }>('/api/sessions/end', { method: 'POST' }),
};

export interface User { id: string; email: string; name: string; created_at: string; }
export interface Activity {
  id: string; user_id: string; source_type: 'browser' | 'desktop';
  app_name: string; window_title: string; domain: string;
  file_name: string; url: string;
  start_time: string; end_time: string; duration_seconds: number;
  client_id: string | null; matter: string | null; client_name?: string;
  created_at: string;
}
export interface ActivityStats {
  date: string;
  by_source: { source_type: string; event_count: string; total_seconds: string; total_hours: string }[];
  top_apps: { app_name: string; total_seconds: string }[];
}
export interface ManualEntry {
  id: string; user_id: string; client: string; matter: string; client_id?: string | null;
  description: string; date: string; duration_minutes: number;
  source_type: string; notes: string;
  created_at: string; updated_at: string;
}
export interface BillableSuggestion {
  id: string; user_id: string; activity_id: string;
  description: string; category: string;
  app_name: string; domain: string;
  duration_minutes: number; date: string;
  status: 'pending' | 'accepted' | 'dismissed';
  created_at: string;
}
export interface Client {
  id: string; user_id: string; name: string; contact_person: string;
  email: string; phone: string; address: string; pan_number: string;
  default_hourly_rate: number; is_vat_applicable: boolean; notes: string;
  created_at: string; updated_at: string;
}
export interface Bill {
  id: string; user_id: string; client_id: string; bill_number: string;
  matter: string; date_from: string; date_to: string;
  subtotal_npr: number; vat_amount_npr: number; total_npr: number;
  status: 'draft' | 'sent' | 'paid'; notes: string;
  created_at: string; updated_at: string;
  client_name?: string;
}
export interface BillLineItem {
  id: string; bill_id: string; entry_id: string; description: string; source: 'manual' | 'tracked';
  date: string; duration_minutes: number; hourly_rate_npr: number; amount_npr: number;
}
export interface TrackingRule {
  id: string; user_id: string; client_id: string; matter: string;
  rule_type: 'domain' | 'app_name' | 'window_title' | 'file_extension';
  pattern: string; match_type: 'exact' | 'contains' | 'starts_with';
  priority: number; created_at: string; client_name?: string;
}
export interface ActiveSession {
  id: string; user_id: string; client_id: string; matter: string;
  started_at: string; ended_at: string; is_active: boolean; client_name?: string;
}
export { getToken };
