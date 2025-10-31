// Refactored API service for UniMate frontend
// With TypeScript interfaces, centralized request handling, and token management

import type {
  // Auth
  LoginRequest,
  SignupRequest,
  AuthResponse,
  User,
  UserProfileResponse,
  // Tasks
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  TasksResponse,
  TaskResponse,
  // Reminders
  Reminder,
  CreateReminderRequest,
  UpdateReminderRequest,
  RemindersResponse,
  ReminderResponse,
  // Challenges
  Challenge,
  UserChallengeProgress,
  ChallengesResponse,
  ChallengeResponse,
  ChallengeProgressResponse,
  ChallengeProgress,
  // Rewards
  RewardVoucher,
  RewardVouchersResponse,
  RewardVoucherResponse,
  UserPointsResponse,
  UserPoints,
  UserVoucher,
  MyVouchersResponse,
  // Calendar
  CalendarEvent,
  CalendarEventsResponse,
  // Lighthouse
  TrustedContact,
  CreateContactRequest,
  UpdateContactRequest,
  TrustedContactsResponse,
  TrustedContactResponse,
  MentalHealthResourcesResponse,
  MentalHealthResource,
  // Blockchain
  SmartAccountResponse,
  SmartAccountInfo,
  TokenBalanceResponse,
  TokenBalance,
  TransactionResponse,
  TransactionResult,
  RedeemRequest,
  // Generic
  DeleteResponse,
} from '../types/api';

// API Base URL from environment variable
// Falls back to localhost if not set
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';


class ApiService {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Set authentication token for subsequent requests
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Get current authentication token
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Centralized request handler
   * Handles authentication, error handling, and response parsing
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };

      // Add authentication if token is available
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.detail || result.message || `Request failed with status ${response.status}`,
        };
      }

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error occurred',
      };
    }
  }

  // ============================================================
  // Authentication
  // ============================================================

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const { success, data, error } = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    console.log('[API] Login response:', { success, hasData: !!data, hasToken: !!data?.access_token, hasUser: !!data?.user });

    if (success && data?.access_token && data?.user) {
      this.setAuthToken(data.access_token);

      // Map Supabase auth user to our User type
      const supabaseUser = data.user as any;
      const mappedUser: User = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.name || '',
        avatar_url: supabaseUser.user_metadata?.avatar_url,
        created_at: supabaseUser.created_at,
        updated_at: supabaseUser.updated_at,
      };

      console.log('[API] Mapped user:', mappedUser.name);

      return {
        success: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: mappedUser
      };
    }

    return { success: false, error };
  }

  async signup(data: SignupRequest): Promise<AuthResponse> {
    const { success, data: result, error } = await this.request<AuthResponse>('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (success && result?.access_token && result?.user) {
      this.setAuthToken(result.access_token);

      // Map Supabase auth user to our User type
      const supabaseUser = result.user as any;
      const mappedUser: User = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.name || data.name, // Fallback to signup name
        avatar_url: supabaseUser.user_metadata?.avatar_url,
        created_at: supabaseUser.created_at,
        updated_at: supabaseUser.updated_at,
      };

      console.log('[API] Signup mapped user:', mappedUser.name);

      return {
        success: true,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        user: mappedUser
      };
    }

    return { success: false, error };
  }

  async logout(): Promise<void> {
    this.setAuthToken(null);
  }

  async getUserProfile(): Promise<UserProfileResponse> {
    // Backend returns profile object directly (not nested under "user" key)
    const { success, data, error } = await this.request<User>('/users/profile');
    if (success && data) {
      return { success, user: data };  // data is the User object directly
    }
    return { success, error };
  }

  async updateUserProfile(profileData: {
    name?: string;
    phone?: string;
    address?: string;
    date_of_birth?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relation?: string;
  }): Promise<UserProfileResponse> {
    const { success, data, error } = await this.request<User>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
    if (success && data) {
      return { success, user: data };
    }
    return { success, error };
  }

  async updateMedicalInfo(medicalData: {
    blood_type?: string;
    allergies?: string;
    medications?: string;
    medical_history?: string;
    emergency_conditions?: string;
    preferred_clinic?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { success, error } = await this.request('/users/profile/medical', {
      method: 'PUT',
      body: JSON.stringify(medicalData),
    });
    return { success, error };
  }

  async updateMood(mood: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    const { success, error } = await this.request('/users/profile/mood', {
      method: 'POST',
      body: JSON.stringify({ mood, notes }),
    });
    return { success, error };
  }

  // ============================================================
  // Tasks
  // ============================================================

  async getTasks(completed?: boolean): Promise<TasksResponse> {
    const queryParam = completed !== undefined ? `?completed=${completed}` : '';
    const { success, data, error } = await this.request<Task[]>(`/tasks${queryParam}`);
    return { success, tasks: data, error };
  }

  async getTask(taskId: string): Promise<TaskResponse> {
    const { success, data, error } = await this.request<Task>(`/tasks/${taskId}`);
    return { success, task: data, error };
  }

  async createTask(taskData: CreateTaskRequest): Promise<TaskResponse> {
    const { success, data, error } = await this.request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
    return { success, task: data, error };
  }

  async updateTask(taskId: string, taskData: UpdateTaskRequest): Promise<TaskResponse> {
    const { success, data, error } = await this.request<Task>(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    });
    return { success, task: data, error };
  }

  async deleteTask(taskId: string): Promise<DeleteResponse> {
    const { success, error } = await this.request(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
    return { success, error };
  }

  // ============================================================
  // Reminders
  // ============================================================

  async getReminders(): Promise<RemindersResponse> {
    const { success, data, error } = await this.request<Reminder[]>('/tasks/reminders');
    return { success, reminders: data, error };
  }

  async createReminder(reminderData: CreateReminderRequest): Promise<ReminderResponse> {
    const { success, data, error } = await this.request<Reminder>('/tasks/reminders', {
      method: 'POST',
      body: JSON.stringify(reminderData),
    });
    return { success, reminder: data, error };
  }

  async updateReminder(reminderId: string, reminderData: UpdateReminderRequest): Promise<ReminderResponse> {
    const { success, data, error } = await this.request<Reminder>(`/tasks/reminders/${reminderId}`, {
      method: 'PUT',
      body: JSON.stringify(reminderData),
    });
    return { success, reminder: data, error };
  }

  async deleteReminder(reminderId: string): Promise<DeleteResponse> {
    const { success, error } = await this.request(`/tasks/reminders/${reminderId}`, {
      method: 'DELETE',
    });
    return { success, error };
  }

  // ============================================================
  // Challenges
  // ============================================================

  async getChallenges(): Promise<ChallengesResponse> {
    // Backend returns: { date, challenges, user_progress, completed_today, total_challenges, progress_percentage }
    const { success, data, error } = await this.request<{
      date: string;
      challenges: Challenge[];
      user_progress: UserChallengeProgress[];
      completed_today: number;
      total_challenges: number;
      progress_percentage: number;
    }>('/challenges/daily');  // Backend uses /challenges/daily endpoint

    if (success && data) {
      return {
        success,
        date: data.date,
        challenges: data.challenges,
        user_progress: data.user_progress,
        completed_today: data.completed_today,
        total_challenges: data.total_challenges,
        progress_percentage: data.progress_percentage,
      };
    }
    return { success, error };
  }

  async startChallenge(challengeId: string): Promise<ChallengeResponse> {
    const { success, data, error } = await this.request<Challenge>('/challenges/start', {
      method: 'POST',
      body: JSON.stringify({ challenge_id: challengeId }),
    });
    return { success, challenge: data, error };
  }

  async completeChallenge(challengeId: string, durationSec: number): Promise<ChallengeResponse> {
    const { success, data, error } = await this.request<Challenge>('/challenges/complete', {
      method: 'POST',
      body: JSON.stringify({
        challenge_id: challengeId,
        duration_sec: durationSec,
      }),
    });
    return { success, challenge: data, error };
  }

  async getChallengeProgress(): Promise<ChallengeProgressResponse> {
    const { success, data, error } = await this.request<ChallengeProgress>('/challenges/progress');
    return { success, progress: data, error };
  }

  // ============================================================
  // Rewards
  // ============================================================

  async getRewardVouchers(): Promise<RewardVouchersResponse> {
    const { success, data, error } = await this.request<RewardVoucher[]>('/rewards/vouchers/available');
    return { success, vouchers: data, error };
  }

  async redeemVoucher(voucherId: string): Promise<RewardVoucherResponse> {
    const { success, data, error } = await this.request<RewardVoucher>(`/rewards/vouchers/${voucherId}/redeem`, {
      method: 'POST',
    });
    return { success, voucher: data, error };
  }

  async getUserPoints(): Promise<UserPointsResponse> {
    const { success, data, error } = await this.request<UserPoints>('/rewards/points');
    return { success, points: data, error };
  }

  async getMyVouchers(): Promise<MyVouchersResponse> {
    const { success, data, error } = await this.request<UserVoucher[]>('/rewards/vouchers/my-vouchers');
    return { success, vouchers: data, error };
  }

  async getEarnActionsToday(): Promise<{ success: boolean; actions?: any[]; date?: string; total_completed?: number; total_available?: number; error?: string }> {
    const { success, data, error } = await this.request<{
      date: string;
      actions: Array<{ id: string; label: string; points: number; completed: boolean }>;
      total_completed: number;
      total_available: number;
    }>('/rewards/earn-actions/today');

    if (success && data) {
      return {
        success: true,
        actions: data.actions,
        date: data.date,
        total_completed: data.total_completed,
        total_available: data.total_available,
      };
    }
    return { success, error };
  }

  // ============================================================
  // Calendar
  // ============================================================

  async getCalendarEvents(startDate: string, endDate: string): Promise<CalendarEventsResponse> {
    // Backend returns: { events: CalendarEvent[], total: number }
    const { success, data, error } = await this.request<{
      events: CalendarEvent[];
      total: number;
    }>(`/calendar/events?start_date=${startDate}&end_date=${endDate}`);

    if (success && data) {
      return {
        success,
        events: data.events,
        total: data.total,
      };
    }
    return { success, error };
  }

  // ============================================================
  // Lighthouse - Trusted Contacts
  // ============================================================

  async getTrustedContacts(): Promise<TrustedContactsResponse> {
    const { success, data, error } = await this.request<TrustedContact[]>('/lighthouse/contacts');
    return { success, contacts: data, error };
  }

  async addTrustedContact(contactData: CreateContactRequest): Promise<TrustedContactResponse> {
    const { success, data, error } = await this.request<TrustedContact>('/lighthouse/contacts', {
      method: 'POST',
      body: JSON.stringify(contactData),
    });
    return { success, contact: data, error };
  }

  async updateTrustedContact(contactId: string, contactData: UpdateContactRequest): Promise<TrustedContactResponse> {
    const { success, data, error } = await this.request<TrustedContact>(`/lighthouse/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(contactData),
    });
    return { success, contact: data, error };
  }

  async deleteTrustedContact(contactId: string): Promise<DeleteResponse> {
    const { success, error } = await this.request(`/lighthouse/contacts/${contactId}`, {
      method: 'DELETE',
    });
    return { success, error };
  }

  // ============================================================
  // Lighthouse - Mental Health Resources
  // ============================================================

  async getMentalHealthResources(): Promise<MentalHealthResourcesResponse> {
    const { success, data, error } = await this.request<MentalHealthResource[]>('/lighthouse/resources');
    return { success, resources: data, error };
  }

  // ============================================================
  // Blockchain & Smart Accounts
  // ============================================================

  async getSmartAccount(): Promise<SmartAccountResponse> {
    // Backend uses POST /chain/aa/get-smart-account (creates if doesn't exist)
    const { success, data, error } = await this.request<SmartAccountInfo>('/chain/aa/get-smart-account', {
      method: 'POST',
    });
    if (success && data) {
      return { success, account: data, smart_account_address: data.smart_account_address };
    }
    return { success, error };
  }

  async createSmartAccount(): Promise<SmartAccountResponse> {
    // Backend endpoint creates account via POST /auth/accounts
    const { success, data, error } = await this.request<SmartAccountInfo>('/auth/accounts', {
      method: 'POST',
    });
    if (success && data) {
      return { success, account: data, smart_account_address: data.smart_account_address };
    }
    return { success, error };
  }

  async getTokenBalance(): Promise<TokenBalanceResponse> {
    const { success, data, error } = await this.request<TokenBalance>('/chain/balance');
    return { success, balance: data, error };
  }

  async getTokenBalanceByAddress(address: string): Promise<TokenBalanceResponse> {
    const { success, data, error } = await this.request<TokenBalance>(`/chain/balance/${address}`);
    return { success, balance: data, error };
  }

  async redeemTokens(request: RedeemRequest): Promise<TransactionResponse> {
    const { success, data, error } = await this.request<TransactionResult>('/chain/redeem', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return { success, transaction: data, error };
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
