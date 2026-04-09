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
          created_at: string;
          end_date: string;
          id: string;
          notes: string | null;
          start_date: string;
          status: "pending" | "approved" | "rejected";
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          notes?: string | null;
          start_date: string;
          status?: "pending" | "approved" | "rejected";
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          notes?: string | null;
          start_date?: string;
          status?: "pending" | "approved" | "rejected";
          type?: string;
          updated_at?: string;
          user_id?: string;
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
      shifts: {
        Row: {
          created_at: string;
          date: string;
          ends_at: string;
          google_event_id: string | null;
          id: string;
          location: string | null;
          role: string | null;
          source_upload_id: string | null;
          starts_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          ends_at: string;
          google_event_id?: string | null;
          id?: string;
          location?: string | null;
          role?: string | null;
          source_upload_id?: string | null;
          starts_at: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          ends_at?: string;
          google_event_id?: string | null;
          id?: string;
          location?: string | null;
          role?: string | null;
          source_upload_id?: string | null;
          starts_at?: string;
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
          created_at: string;
          id: string;
          message: string | null;
          requester_shift_id: string;
          requester_user_id: string;
          status:
            | "pending"
            | "accepted"
            | "rejected"
            | "submitted_to_hr"
            | "approved";
          target_shift_id: string | null;
          target_user_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message?: string | null;
          requester_shift_id: string;
          requester_user_id: string;
          status?:
            | "pending"
            | "accepted"
            | "rejected"
            | "submitted_to_hr"
            | "approved";
          target_shift_id?: string | null;
          target_user_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string | null;
          requester_shift_id?: string;
          requester_user_id?: string;
          status?:
            | "pending"
            | "accepted"
            | "rejected"
            | "submitted_to_hr"
            | "approved";
          target_shift_id?: string | null;
          target_user_id?: string;
          updated_at?: string;
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
        | "approved";
    };
    CompositeTypes: Record<string, never>;
  };
}
