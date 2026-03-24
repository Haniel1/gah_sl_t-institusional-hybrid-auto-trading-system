import { createContext, useContext, ReactNode } from 'react';

// Auth has been removed - app runs without login
// This stub keeps compatibility with any components still referencing useAuth

interface AuthContextType {
  user: { id: string; name: string; username: string } | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoading: boolean;
}

const defaultValue: AuthContextType = {
  user: { id: 'default', name: 'Trader', username: 'trader' },
  login: async () => ({ success: true }),
  logout: () => {},
  isLoading: false,
};

const AuthContext = createContext<AuthContextType>(defaultValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={defaultValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
