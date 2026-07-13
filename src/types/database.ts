export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationship[];
};

export type Database = {
  public: {
    Tables: {
      users: Table<{
        id: string;
        email: string;
        role: Database['public']['Enums']['user_role'];
        status: Database['public']['Enums']['user_status'];
        country: Database['public']['Enums']['country_code'] | null;
        created_at: string;
        updated_at: string;
      }, {
        id: string;
        email: string;
        role: Database['public']['Enums']['user_role'];
        status?: Database['public']['Enums']['user_status'];
        country?: Database['public']['Enums']['country_code'] | null;
        created_at?: string;
        updated_at?: string;
      }>;
      candidate_profiles: Table<Record<string, unknown>>;
      candidate_skills: Table<Record<string, unknown>>;
      candidate_experience: Table<Record<string, unknown>>;
      candidate_education: Table<Record<string, unknown>>;
      resume_files: Table<Record<string, unknown>>;
      employer_profiles: Table<Record<string, unknown>>;
      employer_documents: Table<Record<string, unknown>>;
      jobs: Table<{
        id: string;
        employer_id: string;
        slug: string;
        title: string;
        description: string;
        city: string;
        state_province: string;
        country: Database['public']['Enums']['country_code'];
        employment_type: string;
        workplace_type: string;
        salary_min: number | null;
        salary_max: number | null;
        status: Database['public']['Enums']['job_status'];
        published_at: string | null;
        expires_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      applications: Table<Record<string, unknown>>;
      credit_wallets: Table<{ employer_id: string; available_credits: number; purchased_credits: number; used_credits: number; updated_at: string }>;
      payments: Table<Record<string, unknown>>;
      credit_transactions: Table<Record<string, unknown>>;
      contact_unlocks: Table<Record<string, unknown>>;
      identity_verifications: Table<Record<string, unknown>>;
      webhook_events: Table<Record<string, unknown>>;
      audit_logs: Table<Record<string, unknown>>;
      reports: Table<Record<string, unknown>>;
      account_deletion_requests: Table<Record<string, unknown>>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      user_role: 'candidate' | 'employer' | 'admin';
      user_status: 'active' | 'disabled' | 'suspended';
      country_code: 'US' | 'CA';
      identity_status: 'not_started' | 'payment_pending' | 'requires_input' | 'processing' | 'verified' | 'failed';
      employer_review_status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
      job_status: 'draft' | 'published' | 'closed' | 'expired' | 'removed';
      unlock_source: 'paid_search' | 'application';
      credit_transaction_type: 'purchase' | 'unlock' | 'refund' | 'adjustment';
      payment_purpose: 'identity_fee' | 'credit_pack_10' | 'credit_pack_25';
      payment_status: 'pending' | 'paid' | 'refunded' | 'failed';
      report_status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
    };
    CompositeTypes: Record<never, never>;
  };
};
