export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      fca_analyses: {
        Row: {
          approval_date: string | null
          approved: boolean | null
          compa_ratio_current: number | null
          compa_ratio_proposed: number | null
          contract_type: string | null
          country: string
          created_at: string
          created_by: string | null
          currency: string | null
          current_salary: number | null
          employee_name: string
          fx_rate: number | null
          fx_year: string | null
          humanforce_record_id: string | null
          id: string
          inflation_rate: number | null
          kf_midpoint: number | null
          level: string
          performance_rating: string | null
          proposed_salary: number | null
          rationale: string | null
          recommendation: string | null
          updated_at: string
          wtw_midpoint: number | null
          years_experience: number | null
          years_in_role: number | null
        }
        Insert: {
          approval_date?: string | null
          approved?: boolean | null
          compa_ratio_current?: number | null
          compa_ratio_proposed?: number | null
          contract_type?: string | null
          country: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          current_salary?: number | null
          employee_name: string
          fx_rate?: number | null
          fx_year?: string | null
          humanforce_record_id?: string | null
          id?: string
          inflation_rate?: number | null
          kf_midpoint?: number | null
          level: string
          performance_rating?: string | null
          proposed_salary?: number | null
          rationale?: string | null
          recommendation?: string | null
          updated_at?: string
          wtw_midpoint?: number | null
          years_experience?: number | null
          years_in_role?: number | null
        }
        Update: {
          approval_date?: string | null
          approved?: boolean | null
          compa_ratio_current?: number | null
          compa_ratio_proposed?: number | null
          contract_type?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          current_salary?: number | null
          employee_name?: string
          fx_rate?: number | null
          fx_year?: string | null
          humanforce_record_id?: string | null
          id?: string
          inflation_rate?: number | null
          kf_midpoint?: number | null
          level?: string
          performance_rating?: string | null
          proposed_salary?: number | null
          rationale?: string | null
          recommendation?: string | null
          updated_at?: string
          wtw_midpoint?: number | null
          years_experience?: number | null
          years_in_role?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fca_analyses_humanforce_record_id_fkey"
            columns: ["humanforce_record_id"]
            isOneToOne: false
            referencedRelation: "humanforce_data"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_approvals: {
        Row: {
          approved_by_arantxa: boolean | null
          approved_by_brian: boolean | null
          approved_by_casely: boolean | null
          approved_by_tim: boolean | null
          created_at: string
          document_content: Json | null
          fca_analysis_id: string | null
          id: string
          status: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          approved_by_arantxa?: boolean | null
          approved_by_brian?: boolean | null
          approved_by_casely?: boolean | null
          approved_by_tim?: boolean | null
          created_at?: string
          document_content?: Json | null
          fca_analysis_id?: string | null
          id?: string
          status?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          approved_by_arantxa?: boolean | null
          approved_by_brian?: boolean | null
          approved_by_casely?: boolean | null
          approved_by_tim?: boolean | null
          created_at?: string
          document_content?: Json | null
          fca_analysis_id?: string | null
          id?: string
          status?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_approvals_fca_analysis_id_fkey"
            columns: ["fca_analysis_id"]
            isOneToOne: false
            referencedRelation: "fca_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      humanforce_data: {
        Row: {
          compa_ratio: number | null
          country: string
          currency: string | null
          current_salary: number | null
          employee_id: string | null
          employee_name: string
          employment_condition: string | null
          hire_date: string | null
          id: string
          job_title: string | null
          level: string | null
          performance_rating: string | null
          raw_data: Json | null
          upload_batch_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          compa_ratio?: number | null
          country: string
          currency?: string | null
          current_salary?: number | null
          employee_id?: string | null
          employee_name: string
          employment_condition?: string | null
          hire_date?: string | null
          id?: string
          job_title?: string | null
          level?: string | null
          performance_rating?: string | null
          raw_data?: Json | null
          upload_batch_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          compa_ratio?: number | null
          country?: string
          currency?: string | null
          current_salary?: number | null
          employee_id?: string | null
          employee_name?: string
          employment_condition?: string | null
          hire_date?: string | null
          id?: string
          job_title?: string | null
          level?: string | null
          performance_rating?: string | null
          raw_data?: Json | null
          upload_batch_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      payband_midpoints: {
        Row: {
          country: string
          currency: string | null
          effective_date: string
          id: string
          job_family: string | null
          kf_midpoint: number | null
          level: string
          notes: string | null
          uploaded_at: string
          uploaded_by: string | null
          wtw_midpoint: number | null
        }
        Insert: {
          country: string
          currency?: string | null
          effective_date: string
          id?: string
          job_family?: string | null
          kf_midpoint?: number | null
          level: string
          notes?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          wtw_midpoint?: number | null
        }
        Update: {
          country?: string
          currency?: string | null
          effective_date?: string
          id?: string
          job_family?: string | null
          kf_midpoint?: number | null
          level?: string
          notes?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          wtw_midpoint?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_currency_by_country: {
        Args: { country_name: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
