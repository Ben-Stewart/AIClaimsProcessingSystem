const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Don't attempt refresh if this request IS the refresh endpoint (prevents infinite loop)
  if (response.status === 401 && url !== '/api/auth/refresh') {
    // Try to refresh
    const refreshed = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshed.ok) {
      const data = await refreshed.json() as { data: { accessToken: string } };
      setAccessToken(data.data.accessToken);
      headers['Authorization'] = `Bearer ${data.data.accessToken}`;
      return fetch(`${API_BASE}${url}`, { ...options, headers, credentials: 'include' });
    }

    setAccessToken(null);
    // Dispatch event so AuthContext can redirect via React Router (no hard page reload)
    window.dispatchEvent(new CustomEvent('auth:sessionExpired'));
  }

  return response;
}

export const api = {
  get: async <T>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path);
    if (!res.ok) throw await res.json();
    return res.json() as Promise<T>;
  },

  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await res.json();
    return res.json() as Promise<T>;
  },

  patch: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await res.json();
    return res.json() as Promise<T>;
  },

  delete: async <T>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: 'DELETE' });
    if (!res.ok) throw await res.json();
    return res.json() as Promise<T>;
  },

  uploadFile: async <T>(path: string, formData: FormData): Promise<T> => {
    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      body: formData,
      headers,
      credentials: 'include',
    });
    if (!res.ok) throw await res.json();
    return res.json() as Promise<T>;
  },
};
