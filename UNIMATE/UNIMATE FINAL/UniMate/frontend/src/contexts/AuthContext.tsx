// src/contexts/AuthContext.tsx
// Context for managing authentication state globally

import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../services/api';
import type { User, LoginRequest, SignupRequest } from '../types/api';
import { registerPendingPushToken } from '../../services/notificationService';

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<{ success: boolean; error?: string }>;
  signup: (data: SignupRequest) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored auth data on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [storedToken, storedUser] = await Promise.all([
        AsyncStorage.getItem(AUTH_TOKEN_KEY),
        AsyncStorage.getItem(AUTH_USER_KEY),
      ]);

      console.log('[AuthContext] Loading stored auth...');
      console.log('[AuthContext] Stored token exists:', !!storedToken);
      console.log('[AuthContext] Stored user exists:', !!storedUser);

      if (storedToken) {
        setToken(storedToken);
        apiService.setAuthToken(storedToken);
        console.log('[AuthContext] Token restored');
      }

      if (storedUser) {
        setUser(JSON.parse(storedUser));
        console.log('[AuthContext] User restored:', JSON.parse(storedUser).name);
      }
    } catch (error) {
      console.warn('Failed to load stored auth:', error);
    } finally {
      setIsLoading(false);
      console.log('[AuthContext] Auth loading complete. isAuthenticated:', !!storedToken);
    }
  };

  const login = useCallback(async (credentials: LoginRequest) => {
    try {
      console.log('[AuthContext] Login attempt...');
      const response = await apiService.login(credentials);
      console.log('[AuthContext] Login response:', { success: response.success, hasToken: !!response.access_token, hasUser: !!response.user });

      if (response.success && response.access_token) {
        // Store token and user
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, response.access_token);
        console.log('[AuthContext] Token saved to AsyncStorage');

        if (response.user) {
          await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
          setUser(response.user);
          console.log('[AuthContext] User saved:', response.user.name);
        }

        setToken(response.access_token);
        console.log('[AuthContext] Login successful, isAuthenticated will be:', true);
        // Token already set in apiService by login method

        // ✅ Register push notification token after login
        await registerPendingPushToken();

        return { success: true };
      }

      return { success: false, error: response.error || 'Login failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }, []);

  const signup = useCallback(async (data: SignupRequest) => {
    try {
      const response = await apiService.signup(data);

      if (response.success && response.access_token) {
        // Store token and user
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, response.access_token);
        if (response.user) {
          await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
          setUser(response.user);
        }

        setToken(response.access_token);
        // Token already set in apiService by signup method

        return { success: true };
      }

      return { success: false, error: response.error || 'Signup failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Signup failed',
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Clear stored data
      await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, AUTH_USER_KEY]);

      // Clear state
      setUser(null);
      setToken(null);

      // Clear token in API service
      apiService.setAuthToken(null);
    } catch (error) {
      console.warn('Logout error:', error);
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    if (!token) return;

    try {
      const response = await apiService.getUserProfile();

      if (response.success && response.user) {
        setUser(response.user);
        await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
      }
    } catch (error) {
      console.warn('Failed to refresh user profile:', error);
    }
  }, [token]);

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!token,
    login,
    signup,
    logout,
    refreshUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
