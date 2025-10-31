// src/types/api.ts
// TypeScript interfaces for API requests and responses

// ============================================================
// User & Authentication
// ============================================================

export interface MedicalInfo {
  blood_type?: string;
  allergies?: string;
  medications?: string;
  medical_history?: string;
  emergency_conditions?: string;
  preferred_clinic?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  current_mood?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  medical_info?: MedicalInfo;
  profile_completeness?: number;
  created_at?: string;
  updated_at?: string;
  smart_account_address?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  confirm_password: string;  // Backend requires password confirmation
  name: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  user_id?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  message?: string;
  error?: string;
}

export interface UserProfileResponse {
  success: boolean;
  user?: User;
  error?: string;
}

// ============================================================
// Tasks & Reminders
// ============================================================

export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  notes?: string;                   // Backend uses "notes"
  category?: string;                // Event category (academic, health, social, other)
  kind?: string;                    // Type: event, reminder, task
  starts_at?: string;               // Start datetime
  ends_at?: string;                 // End datetime
  priority?: TaskPriority;          // Priority level
  is_completed: boolean;            // Completion status
  remind_minutes_before?: number;   // Reminder minutes
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTaskRequest {
  title: string;
  notes?: string;
  category?: string;
  kind?: string;
  starts_at?: string;
  ends_at?: string;
  priority?: TaskPriority;
  is_completed?: boolean;
  remind_minutes_before?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  notes?: string;
  category?: string;
  kind?: string;
  starts_at?: string;
  ends_at?: string;
  priority?: TaskPriority;
  is_completed?: boolean;
  remind_minutes_before?: number;
}

export interface TasksResponse {
  success: boolean;
  tasks?: Task[];
  error?: string;
}

export interface TaskResponse {
  success: boolean;
  task?: Task;
  error?: string;
}

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly';

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  reminder_time: string;
  repeat_type: RepeatType;
  is_active: boolean;
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateReminderRequest {
  title: string;
  description?: string;
  reminder_time: string;
  repeat_type?: RepeatType;
}

export interface UpdateReminderRequest {
  title?: string;
  description?: string;
  reminder_time?: string;
  repeat_type?: RepeatType;
}

export interface RemindersResponse {
  success: boolean;
  reminders?: Reminder[];
  error?: string;
}

export interface ReminderResponse {
  success: boolean;
  reminder?: Reminder;
  error?: string;
}

// ============================================================
// Challenges
// ============================================================

export type ChallengeType = 'daily' | 'weekly' | 'special';
export type ChallengeStatus = 'not_started' | 'in_progress' | 'completed';

export interface Challenge {
  id: string;
  title: string;                    // Backend uses "title" not "name"
  subtitle: string;                 // Backend uses "subtitle" for description
  duration_minutes: number;         // Backend provides duration
  points_reward: number;            // Backend uses "points_reward" not "reward_points"
  character_src?: string;           // Optional character image
  background_src?: string;          // Optional background image
  is_active?: boolean;              // Active status
}

export interface UserChallengeProgress {
  challenge_id: string;
  status: string;                   // not_started, in_progress, completed, failed
  started_at?: number;
  completed_at?: number;
  duration_sec?: number;
}

export interface ChallengesResponse {
  success: boolean;
  date?: string;                    // Today's date
  challenges?: Challenge[];         // Array of challenges
  user_progress?: UserChallengeProgress[];  // User's progress on challenges
  completed_today?: number;         // Number completed today
  total_challenges?: number;        // Total challenges available
  progress_percentage?: number;     // Overall progress percentage
  error?: string;
}

export interface ChallengeResponse {
  success: boolean;
  challenge?: Challenge;
  error?: string;
}

export interface ChallengeProgress {
  total: number;
  completed: number;
  in_progress: number;
}

export interface ChallengeProgressResponse {
  success: boolean;
  progress?: ChallengeProgress;
  error?: string;
}

// ============================================================
// Rewards & Vouchers
// ============================================================

export interface RewardVoucher {
  id: string;
  title: string;                // Backend uses "title" not "name"
  description: string;
  points_required: number;      // Backend uses "points_required" not "cost_points"
  category: string;             // Voucher category
  image_url?: string;           // Voucher image
  expires_at?: string;          // Expiration datetime
  terms_conditions?: string;    // Terms and conditions
}

export interface RewardVouchersResponse {
  success: boolean;
  vouchers?: RewardVoucher[];
  error?: string;
}

export interface RewardVoucherResponse {
  success: boolean;
  voucher?: RewardVoucher;
  error?: string;
}

export interface UserPoints {
  total_points: number;
  available_points: number;
  earned_today: number;        // Backend uses "earned_today" not "redeemed_points"
  earned_this_week: number;    // Weekly earnings
}

export interface UserPointsResponse {
  success: boolean;
  points?: UserPoints;
  error?: string;
}

export interface UserVoucher {
  id: string;
  voucher: RewardVoucher;
  redeemed_at: string;
  status: string; // active, used, expired
  redemption_code: string;
}

export interface MyVouchersResponse {
  success: boolean;
  vouchers?: UserVoucher[];
  error?: string;
}

// ============================================================
// Calendar
// ============================================================

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;                    // Backend uses "start" (datetime)
  end?: string;                     // Backend uses "end" (datetime, optional)
  colors?: string[];                // Color palette for display
  category?: string;                // Event category
  notes?: string;                   // Event notes
  priority?: string;                // Priority level (low, medium, high)
  is_completed?: boolean;           // Completion status
}

export interface CalendarEventsResponse {
  success: boolean;
  events?: CalendarEvent[];         // Backend returns array of TaskItem directly
  total?: number;                   // Total number of events
  error?: string;
}

// ============================================================
// Lighthouse (Emergency & Wellness)
// ============================================================

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relation: string;  // Changed from relationship to match backend
  is_primary: boolean;
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateContactRequest {
  name: string;
  phone: string;
  relation: string;  // Changed from relationship to match backend
  is_primary?: boolean;
}

export interface UpdateContactRequest {
  name?: string;
  phone?: string;
  relation?: string;  // Changed from relationship to match backend
  is_primary?: boolean;
}

export interface TrustedContactsResponse {
  success: boolean;
  contacts?: TrustedContact[];
  error?: string;
}

export interface TrustedContactResponse {
  success: boolean;
  contact?: TrustedContact;
  error?: string;
}

export interface WellnessCheckIn {
  id: string;
  mood: string;
  stress_level: number;
  notes?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  user_id: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateWellnessCheckInRequest {
  mood: string;
  stress_level: number;
  notes?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface WellnessCheckInsResponse {
  success: boolean;
  checkIns?: WellnessCheckIn[];
  history?: WellnessCheckIn[];
  error?: string;
}

export interface WellnessCheckInResponse {
  success: boolean;
  checkIn?: WellnessCheckIn;
  error?: string;
}

export interface MentalHealthResource {
  id: string;
  title: string;
  description: string;
  category: string;
  url?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MentalHealthResourcesResponse {
  success: boolean;
  resources?: MentalHealthResource[];
  error?: string;
}

// ============================================================
// Blockchain & Smart Accounts
// ============================================================

export interface SmartAccountInfo {
  smart_account_address: string;
  owner_address: string;
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface SmartAccountResponse {
  success: boolean;
  account?: SmartAccountInfo;
  smart_account_address?: string;
  error?: string;
}

export interface TokenBalance {
  address: string;
  wei: string;
  balance: string;
  user_id?: string;
}

export interface TokenBalanceResponse {
  success: boolean;
  balance?: TokenBalance;
  error?: string;
}

export type TransactionStatus = 'pending' | 'success' | 'failed';

export interface TransactionResult {
  transaction_hash: string;
  status: TransactionStatus;
  details: string;
  user_operation_hash?: string;
}

export interface TransactionResponse {
  success: boolean;
  transaction?: TransactionResult;
  error?: string;
}

export interface RedeemRequest {
  voucher_id: string;
  recipient_address?: string;
}

// ============================================================
// Generic API Response
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DeleteResponse {
  success: boolean;
  error?: string;
}
