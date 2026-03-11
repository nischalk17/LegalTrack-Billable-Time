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

// ── Auth ──────────────────────────────────────────────────────
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

// ── Activities ─────────────────────────────────────────────────
export const activities = {
  list: (params?: { source_type?: string; date?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ activities: Activity[]; total: number }>(`/api/activities?${q}`);
  },
  stats: (date?: string) => {
    const q = date ? `?date=${date}` : '';
    return request<ActivityStats>(`/api/activities/stats${q}`);
  },
};

// ── Manual Entries ─────────────────────────────────────────────
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

// ── Suggestions ───────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────
export interface User {
  id: string; email: string; name: string; created_at: string;
}
export interface Activity {
  id: string; user_id: string; source_type: 'browser' | 'desktop';
  app_name: string; window_title: string; domain: string;
  file_name: string; url: string;
  start_time: string; end_time: string; duration_seconds: number;
  created_at: string;
}
export interface ActivityStats {
  date: string;
  by_source: { source_type: string; event_count: string; total_seconds: string; total_hours: string }[];
  top_apps: { app_name: string; total_seconds: string }[];
}
export interface ManualEntry {
  id: string; user_id: string; client: string; matter: string;
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

export { getToken };
