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
      candidate_profiles: Table<{
        user_id: string;
        full_name: string;
        city: string;
        state_province: string;
        country: Database['public']['Enums']['country_code'];
        phone: string | null;
        headline: string;
        summary: string;
        years_experience: number;
        work_authorization: string;
        searchable: boolean;
        identity_status: Database['public']['Enums']['identity_status'];
        identity_reference_id: string | null;
        identity_verified_at: string | null;
        date_of_birth_confirmed: boolean;
        created_at: string;
        updated_at: string;
      }>;
      candidate_skills: Table<{
        id: string;
        candidate_id: string;
        skill_name: string;
        years_experience: number;
      }>;
      candidate_experience: Table<{
        id: string;
        candidate_id: string;
        company: string;
        job_title: string;
        start_date: string;
        end_date: string | null;
        description: string;
      }>;
      candidate_education: Table<{
        id: string;
        candidate_id: string;
        school: string;
        qualification: string;
        field: string;
        graduation_year: number | null;
      }>;
      resume_files: Table<{
        candidate_id: string;
        storage_path: string;
        original_filename: string;
        mime_type: string;
        size_bytes: number;
        uploaded_at: string;
      }>;
      employer_profiles: Table<{
        user_id: string;
        company_name: string;
        website: string;
        company_email: string;
        registration_number: string;
        country: Database['public']['Enums']['country_code'];
        review_status: Database['public']['Enums']['employer_review_status'];
        reviewed_by: string | null;
        reviewed_at: string | null;
        rejection_reason: string | null;
        created_at: string;
        updated_at: string;
      }>;
      employer_documents: Table<{
        id: string;
        employer_id: string;
        storage_path: string;
        original_filename: string;
        mime_type: string;
        size_bytes: number;
        document_type: string;
        file_sha256: string;
        uploaded_at: string;
        delete_after: string | null;
        legal_hold: boolean;
      }>;
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
      applications: Table<{
        id: string;
        job_id: string;
        candidate_id: string;
        cover_note: string | null;
        status: string;
        applied_at: string;
      }>;
      credit_wallets: Table<{ employer_id: string; available_credits: number; purchased_credits: number; used_credits: number; updated_at: string }>;
      payments: Table<{
        id: string;
        user_id: string;
        purpose: Database['public']['Enums']['payment_purpose'];
        amount_cents: number;
        currency: string;
        stripe_checkout_session_id: string | null;
        stripe_payment_intent_id: string | null;
        status: Database['public']['Enums']['payment_status'];
        created_at: string;
        updated_at: string;
      }>;
      credit_transactions: Table<{
        id: string;
        employer_id: string;
        type: Database['public']['Enums']['credit_transaction_type'];
        quantity: number;
        payment_id: string | null;
        metadata: Json;
        created_at: string;
      }>;
      contact_unlocks: Table<Record<string, unknown>>;
      identity_verifications: Table<{
        id: string;
        candidate_id: string;
        payment_id: string;
        provider_reference_id: string | null;
        status: Database['public']['Enums']['identity_status'];
        country: Database['public']['Enums']['country_code'];
        started_at: string | null;
        verified_at: string | null;
        updated_at: string;
      }>;
      webhook_events: Table<{
        provider: string;
        event_id: string;
        event_type: string;
        processed_at: string;
      }>;
      audit_logs: Table<Record<string, unknown>>;
      reports: Table<{
        id: string;
        reporter_user_id: string | null;
        target_type: string;
        target_id: string;
        reason: string;
        status: Database['public']['Enums']['report_status'];
        created_at: string;
        resolved_at: string | null;
      }>;
      account_deletion_requests: Table<Record<string, unknown>>;
    };
    Views: Record<never, never>;
    Functions: {
      grant_credit_purchase: {
        Args: { p_employer_id: string; p_quantity: number; p_payment_id: string };
        Returns: undefined;
      };
      publish_job: {
        Args: { p_job_id: string };
        Returns: Database['public']['Tables']['jobs']['Row'];
      };
      renew_job: {
        Args: { p_job_id: string };
        Returns: Database['public']['Tables']['jobs']['Row'];
      };
      apply_to_job: {
        Args: { p_job_id: string; p_cover_note?: string | null };
        Returns: { application_id: string; employer_id: string }[];
      };
    };
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
