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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          claim_id: string
          created_at: string
          details: string | null
          id: string
          new_status: string | null
          previous_status: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          claim_id: string
          created_at?: string
          details?: string | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          claim_id?: string
          created_at?: string
          details?: string | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
        }
        Relationships: []
      }
      claim_disputes: {
        Row: {
          admin_note: string | null
          claim_id: string
          counter_image_url: string | null
          created_at: string
          id: string
          reason: string
          status: string
          step_state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          claim_id: string
          counter_image_url?: string | null
          created_at?: string
          id?: string
          reason: string
          status?: string
          step_state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          claim_id?: string
          counter_image_url?: string | null
          created_at?: string
          id?: string
          reason?: string
          status?: string
          step_state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      claim_images: {
        Row: {
          claim_id: string
          created_at: string
          id: string
          image_timestamp: string | null
          image_url: string
          label: string | null
          latitude: number | null
          longitude: number | null
          metadata_valid: boolean
          sort_order: number
          user_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          id?: string
          image_timestamp?: string | null
          image_url: string
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata_valid?: boolean
          sort_order?: number
          user_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          id?: string
          image_timestamp?: string | null
          image_url?: string
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata_valid?: boolean
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          assigned_garage_id: string | null
          awaiting_confirmation: boolean | null
          billing: Json | null
          claim_number: string
          created_at: string
          damage_image_url: string | null
          damage_severity: string | null
          description: string
          fraud_analysis: Json | null
          garage: string | null
          id: string
          image_latitude: number | null
          image_longitude: number | null
          image_metadata_valid: boolean | null
          image_timestamp: string | null
          incident_datetime: string | null
          location: string
          paused: boolean | null
          pending_step: number | null
          policy_id: string
          policy_verification: Json | null
          spare_parts: Json | null
          status: string
          steps: Json
          updated_at: string
          user_id: string
          vehicle_number: string
          vehicle_type: string | null
        }
        Insert: {
          assigned_garage_id?: string | null
          awaiting_confirmation?: boolean | null
          billing?: Json | null
          claim_number: string
          created_at?: string
          damage_image_url?: string | null
          damage_severity?: string | null
          description: string
          fraud_analysis?: Json | null
          garage?: string | null
          id?: string
          image_latitude?: number | null
          image_longitude?: number | null
          image_metadata_valid?: boolean | null
          image_timestamp?: string | null
          incident_datetime?: string | null
          location: string
          paused?: boolean | null
          pending_step?: number | null
          policy_id: string
          policy_verification?: Json | null
          spare_parts?: Json | null
          status?: string
          steps?: Json
          updated_at?: string
          user_id: string
          vehicle_number: string
          vehicle_type?: string | null
        }
        Update: {
          assigned_garage_id?: string | null
          awaiting_confirmation?: boolean | null
          billing?: Json | null
          claim_number?: string
          created_at?: string
          damage_image_url?: string | null
          damage_severity?: string | null
          description?: string
          fraud_analysis?: Json | null
          garage?: string | null
          id?: string
          image_latitude?: number | null
          image_longitude?: number | null
          image_metadata_valid?: boolean | null
          image_timestamp?: string | null
          incident_datetime?: string | null
          location?: string
          paused?: boolean | null
          pending_step?: number | null
          policy_id?: string
          policy_verification?: Json | null
          spare_parts?: Json | null
          status?: string
          steps?: Json
          updated_at?: string
          user_id?: string
          vehicle_number?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_assigned_garage_id_fkey"
            columns: ["assigned_garage_id"]
            isOneToOne: false
            referencedRelation: "garages"
            referencedColumns: ["id"]
          },
        ]
      }
      garages: {
        Row: {
          address: string
          cashless_supported: boolean
          city: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          max_daily_capacity: number | null
          name: string
          phone: string | null
          repair_capabilities: string[]
          state: string
          vehicle_types: string[]
        }
        Insert: {
          address: string
          cashless_supported?: boolean
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          max_daily_capacity?: number | null
          name: string
          phone?: string | null
          repair_capabilities?: string[]
          state: string
          vehicle_types?: string[]
        }
        Update: {
          address?: string
          cashless_supported?: boolean
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          max_daily_capacity?: number | null
          name?: string
          phone?: string | null
          repair_capabilities?: string[]
          state?: string
          vehicle_types?: string[]
        }
        Relationships: []
      }
      policy_documents: {
        Row: {
          coverage_type: string | null
          created_at: string
          document_name: string
          document_type: string | null
          document_url: string
          expiry_date: string | null
          id: string
          policy_id: string
          user_id: string
        }
        Insert: {
          coverage_type?: string | null
          created_at?: string
          document_name: string
          document_type?: string | null
          document_url: string
          expiry_date?: string | null
          id?: string
          policy_id: string
          user_id: string
        }
        Update: {
          coverage_type?: string | null
          created_at?: string
          document_name?: string
          document_type?: string | null
          document_url?: string
          expiry_date?: string | null
          id?: string
          policy_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
