export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      constraint_logs: {
        Row: {
          created_at: string;
          details: Json;
          id: string;
          rule_code: string;
          swap_request_id: string | null;
          user_id: string;
          violation_message: string;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          id?: string;
          rule_code: string;
          swap_request_id?: string | null;
          user_id: string;
          violation_message: string;
        };
        Update: {
          created_at?: string;
          details?: Json;
          id?: string;
          rule_code?: string;
          swap_request_id?: string | null;
          user_id?: string;
          violation_message?: string;
        };
      };
      leave_requests: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          requested_start_date: string;
          requested_end_date: string;
          requested_notes: string | null;
          status:
            | "draft"
            | "pending"
            | "approved"
            | "rejected"
            | "soft_declined";
          sent_to_hr_at: string | null;
          decision_due_at: string | null;
          approved_start_date: string | null;
          approved_end_date: string | null;
          approved_notes: string | null;
          hr_response_notes: string | null;
          soft_declined_at: string | null;
          calendar_applied_at: string | null;
          google_event_id: string | null;
          leave_uid: string | null;
          last_synced_calendar_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          requested_start_date: string;
          requested_end_date: string;
          requested_notes?: string | null;
          status?:
            | "draft"
            | "pending"
            | "approved"
            | "rejected"
            | "soft_declined";
          sent_to_hr_at?: string | null;
          decision_due_at?: string | null;
          approved_start_date?: string | null;
          approved_end_date?: string | null;
          approved_notes?: string | null;
          hr_response_notes?: string | null;
          soft_declined_at?: string | null;
          calendar_applied_at?: string | null;
          google_event_id?: string | null;
          leave_uid?: string | null;
          last_synced_calendar_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          requested_start_date?: string;
          requested_end_date?: string;
          requested_notes?: string | null;
          status?:
            | "draft"
            | "pending"
            | "approved"
            | "rejected"
            | "soft_declined";
          sent_to_hr_at?: string | null;
          decision_due_at?: string | null;
          approved_start_date?: string | null;
          approved_end_date?: string | null;
          approved_notes?: string | null;
          hr_response_notes?: string | null;
          soft_declined_at?: string | null;
          calendar_applied_at?: string | null;
          google_event_id?: string | null;
          leave_uid?: string | null;
          last_synced_calendar_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      schedule_access_requests: {
        Row: {
          consent_given: boolean;
          created_at: string;
          id: string;
          requester_user_id: string;
          reviewed_at: string | null;
          reviewed_by_user_id: string | null;
          schedule_upload_id: string;
          status: "pending" | "approved" | "rejected";
          updated_at: string;
        };
        Insert: {
          consent_given?: boolean;
          created_at?: string;
          id?: string;
          requester_user_id: string;
          reviewed_at?: string | null;
          reviewed_by_user_id?: string | null;
          schedule_upload_id: string;
          status?: "pending" | "approved" | "rejected";
          updated_at?: string;
        };
        Update: {
          consent_given?: boolean;
          created_at?: string;
          id?: string;
          requester_user_id?: string;
          reviewed_at?: string | null;
          reviewed_by_user_id?: string | null;
          schedule_upload_id?: string;
          status?: "pending" | "approved" | "rejected";
          updated_at?: string;
        };
      };
      schedule_uploads: {
        Row: {
          consent_to_share: boolean;
          file_hash: string;
          id: string;
          metadata: Json;
          uploaded_at: string;
          uploader_user_id: string;
        };
        Insert: {
          consent_to_share?: boolean;
          file_hash: string;
          id?: string;
          metadata?: Json;
          uploaded_at?: string;
          uploader_user_id: string;
        };
        Update: {
          consent_to_share?: boolean;
          file_hash?: string;
          id?: string;
          metadata?: Json;
          uploaded_at?: string;
          uploader_user_id?: string;
        };
      };
      hr_settings: {
        Row: {
          id: string;
          user_id: string;
          hr_email: string;
          cc_emails: string[];
          selected_calendar_id: string | null;
          selected_calendar_name: string | null;
          last_synced_calendar_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          hr_email: string;
          cc_emails?: string[];
          selected_calendar_id?: string | null;
          selected_calendar_name?: string | null;
          last_synced_calendar_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          hr_email?: string;
          cc_emails?: string[];
          selected_calendar_id?: string | null;
          selected_calendar_name?: string | null;
          last_synced_calendar_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      external_calendar_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: "google";
          google_email: string | null;
          default_calendar_id: string | null;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          watch_channel_id: string | null;
          watch_resource_id: string | null;
          watch_expiration: string | null;
          sync_enabled: boolean;
          last_synced_at: string | null;
          last_sync_status: string | null;
          last_sync_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider?: "google";
          google_email?: string | null;
          default_calendar_id?: string | null;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          watch_channel_id?: string | null;
          watch_resource_id?: string | null;
          watch_expiration?: string | null;
          sync_enabled?: boolean;
          last_synced_at?: string | null;
          last_sync_status?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: "google";
          google_email?: string | null;
          default_calendar_id?: string | null;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          watch_channel_id?: string | null;
          watch_resource_id?: string | null;
          watch_expiration?: string | null;
          sync_enabled?: boolean;
          last_synced_at?: string | null;
          last_sync_status?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shifts: {
        Row: {
          created_at: string;
          date: string;
          ends_at: string;
          google_event_id: string | null;
          id: string;
          last_calendar_synced_at: string | null;
          last_modified_at: string | null;
          last_modified_source: "app" | "google" | "system" | null;
          last_seen_at: string | null;
          location: string | null;
          role: string | null;
          shift_uid: string | null;
          source_upload_id: string | null;
          starts_at: string;
          status: "active" | "deleted" | null;
          upload_batch_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          ends_at: string;
          google_event_id?: string | null;
          id?: string;
          last_calendar_synced_at?: string | null;
          last_modified_at?: string | null;
          last_modified_source?: "app" | "google" | "system" | null;
          last_seen_at?: string | null;
          location?: string | null;
          role?: string | null;
          shift_uid?: string | null;
          source_upload_id?: string | null;
          starts_at: string;
          status?: "active" | "deleted" | null;
          upload_batch_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          ends_at?: string;
          google_event_id?: string | null;
          id?: string;
          last_calendar_synced_at?: string | null;
          last_modified_at?: string | null;
          last_modified_source?: "app" | "google" | "system" | null;
          last_seen_at?: string | null;
          location?: string | null;
          role?: string | null;
          shift_uid?: string | null;
          source_upload_id?: string | null;
          starts_at?: string;
          status?: "active" | "deleted" | null;
          upload_batch_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
      };
      swap_availability: {
        Row: {
          closed_at: string | null;
          created_at: string;
          id: string;
          is_open: boolean;
          opened_at: string;
          opened_by_user_id: string;
          shift_id: string;
          updated_at: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          is_open?: boolean;
          opened_at?: string;
          opened_by_user_id: string;
          shift_id: string;
          updated_at?: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          is_open?: boolean;
          opened_at?: string;
          opened_by_user_id?: string;
          shift_id?: string;
          updated_at?: string;
        };
      };
      swap_requests: {
        Row: {
          accepted_at: string | null;
          approved_at: string | null;
          calendar_applied: boolean;
          calendar_update_enabled: boolean;
          created_at: string;
          hr_email_sent: boolean;
          id: string;
          message: string | null;
          pending_at: string | null;
          rejected_at: string | null;
          requester_hr_approved: boolean;
          requester_hr_sent: boolean;
          requester_shift_id: string;
          requester_user_id: string;
          rule_violation: string | null;
          status_history: Json;
          status:
            | "pending"
            | "accepted"
            | "rejected"
            | "submitted_to_hr"
            | "approved"
            | "awaiting_hr_request"
            | "ready_to_apply"
            | "applied";
          submitted_to_hr_at: string | null;
          target_hr_approved: boolean;
          target_hr_sent: boolean;
          target_shift_id: string | null;
          target_user_id: string;
          updated_at: string;
          violation_reason: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          approved_at?: string | null;
          calendar_applied?: boolean;
          calendar_update_enabled?: boolean;
          created_at?: string;
          hr_email_sent?: boolean;
          id?: string;
          message?: string | null;
          pending_at?: string | null;
          rejected_at?: string | null;
          requester_hr_approved?: boolean;
          requester_hr_sent?: boolean;
          requester_shift_id: string;
          requester_user_id: string;
          rule_violation?: string | null;
          status_history?: Json;
          status?:
            | "pending"
            | "accepted"
            | "rejected"
            | "submitted_to_hr"
            | "approved"
            | "awaiting_hr_request"
            | "ready_to_apply"
            | "applied";
          submitted_to_hr_at?: string | null;
          target_hr_approved?: boolean;
          target_hr_sent?: boolean;
          target_shift_id?: string | null;
          target_user_id: string;
          updated_at?: string;
          violation_reason?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          approved_at?: string | null;
          calendar_applied?: boolean;
          calendar_update_enabled?: boolean;
          created_at?: string;
          hr_email_sent?: boolean;
          id?: string;
          message?: string | null;
          pending_at?: string | null;
          rejected_at?: string | null;
          requester_hr_approved?: boolean;
          requester_hr_sent?: boolean;
          requester_shift_id?: string;
          requester_user_id?: string;
          rule_violation?: string | null;
          status_history?: Json;
          status?:
            | "pending"
            | "accepted"
            | "rejected"
            | "submitted_to_hr"
            | "approved"
            | "awaiting_hr_request"
            | "ready_to_apply"
            | "applied";
          submitted_to_hr_at?: string | null;
          target_hr_approved?: boolean;
          target_hr_sent?: boolean;
          target_shift_id?: string | null;
          target_user_id?: string;
          updated_at?: string;
          violation_reason?: string | null;
        };
      };
      users: {
        Row: {
          created_at: string;
          email: string | null;
          employee_code: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          employee_code: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          employee_code?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
      };
      user_calendar_preferences: {
        Row: {
          id: string;
          user_id: string;
          calendar_id: string;
          calendar_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          calendar_id: string;
          calendar_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          calendar_id?: string;
          calendar_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      leave_request_status: "pending" | "approved" | "rejected";
      schedule_access_request_status: "pending" | "approved" | "rejected";
      swap_request_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "submitted_to_hr"
        | "approved"
        | "awaiting_hr_request"
        | "ready_to_apply"
        | "applied";
    };
    CompositeTypes: Record<string, never>;
  };
}
