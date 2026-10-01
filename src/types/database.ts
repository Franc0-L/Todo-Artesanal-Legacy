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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cancellations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          updated_at: string
          week_day_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          updated_at?: string
          week_day_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          week_day_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellations_week_day_id_fkey"
            columns: ["week_day_id"]
            isOneToOne: false
            referencedRelation: "week_days"
            referencedColumns: ["id"]
          },
        ]
      }
      client_prices: {
        Row: {
          client_id: string
          created_at: string
          id: string
          modality: string
          price: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          modality: string
          price: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          modality?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_prices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_product_prices: {
        Row: {
          client_id: string
          created_at: string
          dish_id: string
          id: string
          price: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          dish_id: string
          id?: string
          price: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          dish_id?: string
          id?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_product_prices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_product_prices_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tokens: {
        Row: {
          client_id: string
          created_at: string
          id: string
          invalidated_at: string | null
          token_hash: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          invalidated_at?: string | null
          token_hash: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          invalidated_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          address: string | null
          allows_half_portion: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          special_care: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          allows_half_portion?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          special_care?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          allows_half_portion?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          special_care?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dish_versions: {
        Row: {
          created_at: string
          dish_id: string
          id: string
          name: string
          price: number
          version_number: number
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          name: string
          price: number
          version_number: number
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          name?: string
          price?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "dish_versions_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dishes: {
        Row: {
          active: boolean
          category: string | null
          climate: string | null
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          climate?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          climate?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      menu_version_items: {
        Row: {
          created_at: string
          dish_version_id: string
          id: string
          menu_version_id: string
          role: string
        }
        Insert: {
          created_at?: string
          dish_version_id: string
          id?: string
          menu_version_id: string
          role: string
        }
        Update: {
          created_at?: string
          dish_version_id?: string
          id?: string
          menu_version_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_version_items_dish_version_id_fkey"
            columns: ["dish_version_id"]
            isOneToOne: false
            referencedRelation: "dish_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_version_items_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_versions: {
        Row: {
          created_at: string
          id: string
          menu_id: string
          name: string
          price: number
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          menu_id: string
          name: string
          price: number
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          menu_id?: string
          name?: string
          price?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_versions_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          active: boolean
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          applied_price: number
          client_id: string
          created_at: string
          dish_version_id: string | null
          id: string
          menu_version_id: string | null
          modality: string
          notes: string | null
          quantity: number
          updated_at: string
          week_day_id: string
          week_day_option_id: string | null
        }
        Insert: {
          applied_price: number
          client_id: string
          created_at?: string
          dish_version_id?: string | null
          id?: string
          menu_version_id?: string | null
          modality: string
          notes?: string | null
          quantity?: number
          updated_at?: string
          week_day_id: string
          week_day_option_id?: string | null
        }
        Update: {
          applied_price?: number
          client_id?: string
          created_at?: string
          dish_version_id?: string | null
          id?: string
          menu_version_id?: string | null
          modality?: string
          notes?: string | null
          quantity?: number
          updated_at?: string
          week_day_id?: string
          week_day_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_dish_version_id_fkey"
            columns: ["dish_version_id"]
            isOneToOne: false
            referencedRelation: "dish_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_week_day_id_fkey"
            columns: ["week_day_id"]
            isOneToOne: false
            referencedRelation: "week_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_week_day_option_id_fkey"
            columns: ["week_day_option_id"]
            isOneToOne: false
            referencedRelation: "week_day_options"
            referencedColumns: ["id"]
          },
        ]
      }
      week_day_options: {
        Row: {
          created_at: string
          dish_version_id: string | null
          id: string
          menu_version_id: string | null
          offer_modality: string
          option_type: string
          week_day_id: string
        }
        Insert: {
          created_at?: string
          dish_version_id?: string | null
          id?: string
          menu_version_id?: string | null
          offer_modality: string
          option_type: string
          week_day_id: string
        }
        Update: {
          created_at?: string
          dish_version_id?: string | null
          id?: string
          menu_version_id?: string | null
          offer_modality?: string
          option_type?: string
          week_day_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_day_options_dish_version_id_fkey"
            columns: ["dish_version_id"]
            isOneToOne: false
            referencedRelation: "dish_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_day_options_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_day_options_week_day_id_fkey"
            columns: ["week_day_id"]
            isOneToOne: false
            referencedRelation: "week_days"
            referencedColumns: ["id"]
          },
        ]
      }
      week_days: {
        Row: {
          created_at: string
          date: string
          day_of_week: number
          id: string
          week_id: string
        }
        Insert: {
          created_at?: string
          date: string
          day_of_week: number
          id?: string
          week_id: string
        }
        Update: {
          created_at?: string
          date?: string
          day_of_week?: number
          id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_days_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      week_expected_clients: {
        Row: {
          client_id: string
          created_at: string
          week_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          week_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_expected_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_expected_clients_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          created_at: string
          end_date: string
          id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_week: { Args: { p_week_id: string }; Returns: undefined }
      calculate_catalog_media_vianda_price: {
        Args: {
          p_client_id: string
          p_dish_version_id: string
          p_menu_version_id: string
        }
        Returns: number
      }
      calculate_my_order_price: {
        Args: {
          p_dish_version_id: string
          p_menu_version_id: string
          p_modality: string
          p_week_day_option_id: string
        }
        Returns: number
      }
      calculate_order_price: {
        Args: {
          p_client_id: string
          p_modality: string
          p_week_day_option_id: string
        }
        Returns: number
      }
      close_week: { Args: { p_week_id: string }; Returns: undefined }
      create_menu: {
        Args: {
          p_active?: boolean
          p_items: Json
          p_name: string
          p_price: number
        }
        Returns: string
      }
      create_menu_version: {
        Args: {
          p_items: Json
          p_menu_id: string
          p_name: string
          p_price: number
        }
        Returns: string
      }
      create_week: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: string
      }
      is_user_admin: { Args: { p_user_id: string }; Returns: boolean }
      list_client_catalog: {
        Args: never
        Returns: {
          name: string
          product_id: string
          product_type: string
          version_id: string
        }[]
      }
      update_week: {
        Args: { p_end_date: string; p_start_date: string; p_week_id: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
