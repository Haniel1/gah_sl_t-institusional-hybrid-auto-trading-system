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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          id: string
          selected_notify_pairs: string[] | null
          telegram_notify_mode: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          selected_notify_pairs?: string[] | null
          telegram_notify_mode?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          selected_notify_pairs?: string[] | null
          telegram_notify_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      auto_trade_config: {
        Row: {
          coin_balance: number
          coin_symbol: string | null
          created_at: string
          current_balance: number
          current_capital: number
          enabled: boolean
          entry_price: number | null
          entry_time: string | null
          fabio_buy_signal: boolean
          gainz_buy_signal: boolean
          id: string
          initial_balance: number
          initial_capital: number
          last_check_at: string | null
          last_trade_at: string | null
          loss_count: number
          notify_telegram: boolean
          pair: string
          position: string
          sl_pct: number
          status: string
          strategy: string
          telegram_enabled: boolean
          total_pnl: number
          tp_pct: number
          updated_at: string
          user_id: string | null
          win_count: number
        }
        Insert: {
          coin_balance?: number
          coin_symbol?: string | null
          created_at?: string
          current_balance?: number
          current_capital?: number
          enabled?: boolean
          entry_price?: number | null
          entry_time?: string | null
          fabio_buy_signal?: boolean
          gainz_buy_signal?: boolean
          id?: string
          initial_balance?: number
          initial_capital?: number
          last_check_at?: string | null
          last_trade_at?: string | null
          loss_count?: number
          notify_telegram?: boolean
          pair: string
          position?: string
          sl_pct?: number
          status?: string
          strategy?: string
          telegram_enabled?: boolean
          total_pnl?: number
          tp_pct?: number
          updated_at?: string
          user_id?: string | null
          win_count?: number
        }
        Update: {
          coin_balance?: number
          coin_symbol?: string | null
          created_at?: string
          current_balance?: number
          current_capital?: number
          enabled?: boolean
          entry_price?: number | null
          entry_time?: string | null
          fabio_buy_signal?: boolean
          gainz_buy_signal?: boolean
          id?: string
          initial_balance?: number
          initial_capital?: number
          last_check_at?: string | null
          last_trade_at?: string | null
          loss_count?: number
          notify_telegram?: boolean
          pair?: string
          position?: string
          sl_pct?: number
          status?: string
          strategy?: string
          telegram_enabled?: boolean
          total_pnl?: number
          tp_pct?: number
          updated_at?: string
          user_id?: string | null
          win_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "auto_trade_config_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "trading_users"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_trade_log: {
        Row: {
          coin_amount: number
          coin_symbol: string
          created_at: string
          id: string
          idr_value: number
          pnl: number
          pnl_pct: number
          price: number
          reason: string | null
          telegram_sent: boolean
          trade_type: string
        }
        Insert: {
          coin_amount?: number
          coin_symbol: string
          created_at?: string
          id?: string
          idr_value?: number
          pnl?: number
          pnl_pct?: number
          price: number
          reason?: string | null
          telegram_sent?: boolean
          trade_type: string
        }
        Update: {
          coin_amount?: number
          coin_symbol?: string
          created_at?: string
          id?: string
          idr_value?: number
          pnl?: number
          pnl_pct?: number
          price?: number
          reason?: string | null
          telegram_sent?: boolean
          trade_type?: string
        }
        Relationships: []
      }
      simulation_coins: {
        Row: {
          added_at: string
          coin_symbol: string
          id: string
        }
        Insert: {
          added_at?: string
          coin_symbol: string
          id?: string
        }
        Update: {
          added_at?: string
          coin_symbol?: string
          id?: string
        }
        Relationships: []
      }
      simulation_snapshots: {
        Row: {
          capital: number
          coin_balance: number
          coin_price: number
          coin_symbol: string
          created_at: string
          id: string
          signal_action: string | null
          strategy: string
          total_value: number
        }
        Insert: {
          capital?: number
          coin_balance?: number
          coin_price?: number
          coin_symbol: string
          created_at?: string
          id?: string
          signal_action?: string | null
          strategy?: string
          total_value?: number
        }
        Update: {
          capital?: number
          coin_balance?: number
          coin_price?: number
          coin_symbol?: string
          created_at?: string
          id?: string
          signal_action?: string | null
          strategy?: string
          total_value?: number
        }
        Relationships: []
      }
      simulation_state: {
        Row: {
          capital: number
          coin_balance: number
          coin_symbol: string
          created_at: string
          entry_price: number | null
          entry_reasons: string[] | null
          entry_time: string | null
          highest_price_seen: number | null
          id: string
          is_running: boolean
          last_tick_at: string | null
          loss_count: number
          strategy: string
          total_pnl: number
          updated_at: string
          win_count: number
        }
        Insert: {
          capital?: number
          coin_balance?: number
          coin_symbol: string
          created_at?: string
          entry_price?: number | null
          entry_reasons?: string[] | null
          entry_time?: string | null
          highest_price_seen?: number | null
          id?: string
          is_running?: boolean
          last_tick_at?: string | null
          loss_count?: number
          strategy?: string
          total_pnl?: number
          updated_at?: string
          win_count?: number
        }
        Update: {
          capital?: number
          coin_balance?: number
          coin_symbol?: string
          created_at?: string
          entry_price?: number | null
          entry_reasons?: string[] | null
          entry_time?: string | null
          highest_price_seen?: number | null
          id?: string
          is_running?: boolean
          last_tick_at?: string | null
          loss_count?: number
          strategy?: string
          total_pnl?: number
          updated_at?: string
          win_count?: number
        }
        Relationships: []
      }
      simulation_trades: {
        Row: {
          coin_amount: number
          coin_symbol: string
          created_at: string
          hold_duration_ms: number
          id: string
          idr_value: number
          pnl: number
          pnl_pct: number
          price: number
          signal_action: string | null
          signal_reasons: string[] | null
          strategy: string
          trade_type: string
        }
        Insert: {
          coin_amount?: number
          coin_symbol: string
          created_at?: string
          hold_duration_ms?: number
          id?: string
          idr_value?: number
          pnl?: number
          pnl_pct?: number
          price: number
          signal_action?: string | null
          signal_reasons?: string[] | null
          strategy?: string
          trade_type: string
        }
        Update: {
          coin_amount?: number
          coin_symbol?: string
          created_at?: string
          hold_duration_ms?: number
          id?: string
          idr_value?: number
          pnl?: number
          pnl_pct?: number
          price?: number
          signal_action?: string | null
          signal_reasons?: string[] | null
          strategy?: string
          trade_type?: string
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          pair: string
          price: number
          profit_loss: number | null
          strategy: string
          total: number
          type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          pair: string
          price: number
          profit_loss?: number | null
          strategy: string
          total: number
          type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          pair?: string
          price?: number
          profit_loss?: number | null
          strategy?: string
          total?: number
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "trading_users"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_users: {
        Row: {
          created_at: string | null
          id: string
          indodax_api_key: string | null
          indodax_secret: string | null
          is_active: boolean | null
          name: string
          password_hash: string
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          indodax_api_key?: string | null
          indodax_secret?: string | null
          is_active?: boolean | null
          name: string
          password_hash: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          id?: string
          indodax_api_key?: string | null
          indodax_secret?: string | null
          is_active?: boolean | null
          name?: string
          password_hash?: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hash_password: { Args: { _password: string }; Returns: string }
      verify_password: {
        Args: { _password: string; _username: string }
        Returns: boolean
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
