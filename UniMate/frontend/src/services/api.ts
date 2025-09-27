export const API_BASE_URL = "https://codenection-team-scds.onrender.com";

// API service for UniMate frontend
// Development configuration
const DEVELOPMENT_CONFIG = {
  // For physical devices/simulators, use your computer's actual IP address
  MOBILE_IP: 'http://192.168.1.39:8000',
  // For web development, use localhost
  WEB_LOCALHOST: 'http://localhost:8000',
};

// Automatically detect environment and use appropriate URL
const API_BASE_URL = DEVELOPMENT_CONFIG.MOBILE_IP; // Change to WEB_LOCALHOST for web testing

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface AuthResponse {
  success: boolean;
  user_id?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: any;
  message?: string;
  error?: string;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Traditional login without OTP
  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result.detail || 'Login failed',
          error: result.detail || 'Login failed'
        };
      }

      return {
        success: true,
        user_id: result.user?.id,
        user: result.user,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        token_type: result.token_type,
        expires_in: result.expires_in,
        message: 'Login successful'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Network error. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Traditional signup without OTP
  async signup(data: SignupRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/sign-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result.detail || 'Signup failed',
          error: result.detail || 'Signup failed'
        };
      }

      return {
        success: true,
        user_id: result.user_id,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        token_type: result.token_type,
        expires_in: result.expires_in,
        message: 'Account created successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Network error. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get user profile
  async getUserProfile(token: string): Promise<{success: boolean, user?: User, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get user profile'
        };
      }

      return {
        success: true,
        user: result.profile || result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Update user profile
  async updateUserProfile(token: string, data: {name?: string, avatar_url?: string}): Promise<{success: boolean, user?: User, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to update profile'
        };
      }

      return {
        success: true,
        user: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // === TASK MANAGEMENT ===

  // Get all tasks
  async getTasks(token: string, completed?: boolean): Promise<{success: boolean, tasks?: any[], error?: string}> {
    try {
      let url = `${this.baseUrl}/tasks`;
      if (completed !== undefined) {
        url += `?completed=${completed}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get tasks'
        };
      }

      return {
        success: true,
        tasks: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Create a new task
  async createTask(token: string, taskData: {title: string, description?: string, due_date?: string, priority?: string}): Promise<{success: boolean, task?: any, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to create task'
        };
      }

      return {
        success: true,
        task: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // === CALENDAR ===

  // Get calendar events
  async getCalendarEvents(token: string, startDate?: string, endDate?: string): Promise<{success: boolean, events?: any[], error?: string}> {
    try {
      let url = `${this.baseUrl}/calendar/events`;
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get calendar events'
        };
      }

      return {
        success: true,
        events: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // === LIGHTHOUSE (Emergency & Wellness) ===

  // Create emergency alert
  async createEmergencyAlert(token: string, alertData: {emergency_type: string, priority: string, message: string, location?: any}): Promise<{success: boolean, alert?: any, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/lighthouse/emergency-alert`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alertData),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to create emergency alert'
        };
      }

      return {
        success: true,
        alert: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get trusted contacts
  async getTrustedContacts(token: string): Promise<{success: boolean, contacts?: any[], error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/lighthouse/trusted-contacts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get trusted contacts'
        };
      }

      return {
        success: true,
        contacts: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // === CHALLENGES ===

  // Get available challenges
  async getChallenges(token: string): Promise<{success: boolean, challenges?: any[], error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/challenges`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get challenges'
        };
      }

      return {
        success: true,
        challenges: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // === REWARDS ===

  // Get user rewards/points
  async getUserRewards(token: string): Promise<{success: boolean, rewards?: any, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/chain/balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get user rewards'
        };
      }

      return {
        success: true,
        rewards: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get reward marketplace items
  async getRewardMarket(token: string): Promise<{success: boolean, items?: any[], error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/rewards`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get reward market'
        };
      }

      return {
        success: true,
        items: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // === MOOD & WELLNESS ===

  // Get mood history
  async getMoodHistory(token: string, days: number = 30): Promise<{success: boolean, mood_history?: any[], error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/users/mood-history?days=${days}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get mood history'
        };
      }

      return {
        success: true,
        mood_history: result.mood_history
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get user statistics
  async getUserStats(token: string): Promise<{success: boolean, stats?: any, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/users/stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get user stats'
        };
      }

      return {
        success: true,
        stats: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get user reminders
  async getReminders(token: string): Promise<{success: boolean, reminders?: any[], error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks/reminders`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get reminders'
        };
      }

      return {
        success: true,
        reminders: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Create a new reminder
  async createReminder(token: string, reminderData: {title: string, description?: string, reminder_time: string, repeat_type?: string}): Promise<{success: boolean, reminder?: any, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks/reminders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reminderData),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to create reminder'
        };
      }

      return {
        success: true,
        reminder: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get user points/coins
  async getUserPoints(token: string): Promise<{success: boolean, points?: number, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/rewards/points`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get user points'
        };
      }

      return {
        success: true,
        points: result.total_points || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Redeem a voucher
  async redeemVoucher(token: string, voucherId: string): Promise<{success: boolean, voucher?: any, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/rewards/vouchers/${voucherId}/redeem`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to redeem voucher'
        };
      }

      return {
        success: true,
        voucher: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get daily challenges
  async getDailyChallenges(token: string): Promise<{success: boolean, challenges?: any[], error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/challenges/daily`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to get daily challenges'
        };
      }

      return {
        success: true,
        challenges: result.challenges || result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Upload user avatar
  async uploadAvatar(token: string, formData: FormData): Promise<{success: boolean, avatar_url?: string, error?: string}> {
    try {
      const response = await fetch(`${this.baseUrl}/users/profile/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // 'Content-Type': 'multipart/form-data' is automatically set by the browser with the correct boundary
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || 'Failed to upload avatar'
        };
      }

      return {
        success: true,
        avatar_url: result.avatar_url
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const apiService = new ApiService();
