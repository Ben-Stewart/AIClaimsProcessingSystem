import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { User } from '@claims/shared';
import { api, setAccessToken } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; accessToken: string } }
  | { type: 'LOGOUT' }
  | { type: 'LOADING_DONE' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { user: action.payload.user, accessToken: action.payload.accessToken, isLoading: false };
    case 'LOGOUT':
      return { user: null, accessToken: null, isLoading: false };
    case 'LOADING_DONE':
      return { ...state, isLoading: false };
    default:
      return state;
  }
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, policyNumber: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    accessToken: null,
    isLoading: true,
  });

  // Attempt silent refresh on mount
  useEffect(() => {
    api
      .post<{ data: { accessToken: string } }>('/api/auth/refresh')
      .then(async (res) => {
        setAccessToken(res.data.accessToken);
        const me = await api.get<{ data: User }>('/api/auth/me');
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: me.data, accessToken: res.data.accessToken } });
        connectSocket();
      })
      .catch(() => {
        dispatch({ type: 'LOADING_DONE' });
      });
  }, []);

  // Handle session expiry from api.ts (triggers when a token refresh fails mid-session)
  useEffect(() => {
    const handleSessionExpired = () => {
      setAccessToken(null);
      disconnectSocket();
      dispatch({ type: 'LOGOUT' });
    };
    window.addEventListener('auth:sessionExpired', handleSessionExpired);
    return () => window.removeEventListener('auth:sessionExpired', handleSessionExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ data: { accessToken: string; user: User } }>('/api/auth/login', { email, password });
    setAccessToken(res.data.accessToken);
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user: res.data.user, accessToken: res.data.accessToken } });
    connectSocket();
  };

  const register = async (name: string, email: string, password: string, policyNumber: string) => {
    const res = await api.post<{ data: { accessToken: string; user: User } }>('/api/auth/register', { name, email, password, policyNumber });
    setAccessToken(res.data.accessToken);
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user: res.data.user, accessToken: res.data.accessToken } });
    connectSocket();
  };

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setAccessToken(null);
    disconnectSocket();
    dispatch({ type: 'LOGOUT' });
  };

  return (
    <AuthContext.Provider value={{ user: state.user, isLoading: state.isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
