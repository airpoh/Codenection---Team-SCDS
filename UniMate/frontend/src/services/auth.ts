// Authentication service for managing user session
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService, User } from './api';

const AUTH_TOKEN_KEY = '@unimate_auth_token';
const REFRESH_TOKEN_KEY = '@unimate_refresh_token';
const USER_KEY = '@unimate_user';
const EXPIRES_AT_KEY = '@unimate_expires_at';

export class AuthService {
  // Store authentication data
  async storeAuthData(
    accessToken: string,
    refreshToken: string,
    user: User,
    expiresAt: number
  ): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(AUTH_TOKEN_KEY, accessToken),
        AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
        AsyncStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString()),
      ]);
    } catch (error) {
      console.error('Error storing auth data:', error);
      throw error;
    }
  }

  // Get stored access token
  async getAccessToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  }

  // Get stored refresh token
  async getRefreshToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error('Error getting refresh token:', error);
      return null;
    }
  }

  // Get stored user
  async getUser(): Promise<User | null> {
    try {
      const userJson = await AsyncStorage.getItem(USER_KEY);
      return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  // Check if token is expired
  async isTokenExpired(): Promise<boolean> {
    try {
      const expiresAtStr = await AsyncStorage.getItem(EXPIRES_AT_KEY);
      if (!expiresAtStr) return true;

      const expiresAt = parseInt(expiresAtStr);
      const currentTime = Math.floor(Date.now() / 1000);

      // Add 5 minute buffer before expiration
      return currentTime >= (expiresAt - 300);
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true;
    }
  }

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      if (!token) return false;

      const isExpired = await this.isTokenExpired();
      return !isExpired;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  // Clear all authentication data (logout)
  async logout(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(AUTH_TOKEN_KEY),
        AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
        AsyncStorage.removeItem(USER_KEY),
        AsyncStorage.removeItem(EXPIRES_AT_KEY),
      ]);
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  }

  // Update stored user data
  async updateUser(user: User): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // Get current user profile from API
  async getCurrentUserProfile(): Promise<{success: boolean, user?: User, error?: string}> {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return {
          success: false,
          error: 'No access token found'
        };
      }

      const isExpired = await this.isTokenExpired();
      if (isExpired) {
        return {
          success: false,
          error: 'Token expired'
        };
      }

      return await apiService.getUserProfile(token);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const authService = new AuthService();