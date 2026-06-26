export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Enums: {
      dog_size: "SMALL" | "MEDIUM" | "LARGE" | "GIANT";
      station_status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
      station_type: "WASH_BASIN" | "DRYING_ZONE" | "GROOMING_TABLE";
      booking_status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
      token_transaction_type: "CHARGE" | "DEBIT" | "BONUS";
      operating_mode: "SELF_ONLY" | "ASSISTED_ONLY" | "HYBRID";
      booking_service_type: "SELF_SERVICE" | "ASSISTED_WASH" | "FULL_GROOMING";
    };
    Tables: {
      tenant_customers: {
        Row: {
          customer_id: string;
          tenant_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          customer_id: string;
          tenant_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          customer_id?: string;
          tenant_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: string;
          settings: Json;
          subscription_ends_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: string;
          settings?: Json;
          subscription_ends_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan?: string;
          settings?: Json;
          subscription_ends_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          email: string | null;
          avatar_url: string | null;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      dogs: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          breed: string | null;
          size: Database["public"]["Enums"]["dog_size"];
          weight: number | null;
          notes: string | null;
          photo_url: string | null;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          breed?: string | null;
          size: Database["public"]["Enums"]["dog_size"];
          weight?: number | null;
          notes?: string | null;
          photo_url?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          breed?: string | null;
          size?: Database["public"]["Enums"]["dog_size"];
          weight?: number | null;
          notes?: string | null;
          photo_url?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      stations: {
        Row: {
          id: string;
          name: string;
          type: Database["public"]["Enums"]["station_type"];
          status: Database["public"]["Enums"]["station_status"];
          cost_per_minute: number;
          layout_x: number;
          layout_y: number;
          layout_w: number;
          layout_h: number;
          layout_zone: string;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["station_type"];
          status?: Database["public"]["Enums"]["station_status"];
          cost_per_minute: number;
          layout_x?: number;
          layout_y?: number;
          layout_w?: number;
          layout_h?: number;
          layout_zone?: string;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["station_type"];
          status?: Database["public"]["Enums"]["station_status"];
          cost_per_minute?: number;
          layout_x?: number;
          layout_y?: number;
          layout_w?: number;
          layout_h?: number;
          layout_zone?: string;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          customer_id: string;
          dog_id: string;
          station_id: string;
          start_time: string;
          end_time: string;
          status: Database["public"]["Enums"]["booking_status"];
          total_credits: number;
          service_type: Database["public"]["Enums"]["booking_service_type"];
          operator_cost_credits: number;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          dog_id: string;
          station_id: string;
          start_time: string;
          end_time: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_credits: number;
          service_type?: Database["public"]["Enums"]["booking_service_type"];
          operator_cost_credits?: number;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          dog_id?: string;
          station_id?: string;
          start_time?: string;
          end_time?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_credits?: number;
          service_type?: Database["public"]["Enums"]["booking_service_type"];
          operator_cost_credits?: number;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          customer_id: string;
          balance_credits: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          balance_credits?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Update: {
          balance_credits?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      token_transactions: {
        Row: {
          id: string;
          wallet_id: string;
          type: Database["public"]["Enums"]["token_transaction_type"];
          amount_credits: number;
          amount_currency: number;
          stripe_intent_id: string | null;
          note: string | null;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          type: Database["public"]["Enums"]["token_transaction_type"];
          amount_credits: number;
          amount_currency: number;
          stripe_intent_id?: string | null;
          note?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          type?: Database["public"]["Enums"]["token_transaction_type"];
          amount_credits?: number;
          amount_currency?: number;
          stripe_intent_id?: string | null;
          note?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      active_sessions: {
        Row: {
          id: string;
          booking_id: string | null;
          station_id: string;
          customer_id: string;
          remaining_seconds: number;
          is_paused: boolean;
          tenant_id: string;
          activated_at: string;
        };
        Insert: {
          id?: string;
          booking_id?: string | null;
          station_id: string;
          customer_id: string;
          remaining_seconds: number;
          is_paused?: boolean;
          tenant_id?: string;
          activated_at?: string;
        };
        Update: {
          booking_id?: string | null;
          remaining_seconds?: number;
          is_paused?: boolean;
          tenant_id?: string;
          activated_at?: string;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          amount_credits: number;
          max_uses: number | null;
          current_uses: number;
          expires_at: string | null;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          amount_credits: number;
          max_uses?: number | null;
          current_uses?: number;
          expires_at?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          amount_credits?: number;
          max_uses?: number | null;
          current_uses?: number;
          expires_at?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_coupons: {
        Row: {
          id: string;
          customer_id: string;
          coupon_id: string;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          coupon_id: string;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          coupon_id?: string;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_audit_logs: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          payload: Json | null;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          payload?: Json | null;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          admin_id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          payload?: Json | null;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      pet_treatments: {
        Row: {
          id: string;
          dog_id: string;
          treatment_date: string;
          treatment_type: string;
          products_used: string | null;
          groomer_notes: string | null;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          dog_id: string;
          treatment_date?: string;
          treatment_type: string;
          products_used?: string | null;
          groomer_notes?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          dog_id?: string;
          treatment_date?: string;
          treatment_type?: string;
          products_used?: string | null;
          groomer_notes?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      pet_gallery: {
        Row: {
          id: string;
          dog_id: string;
          photo_url: string;
          caption: string | null;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          dog_id: string;
          photo_url: string;
          caption?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Update: {
          dog_id?: string;
          photo_url?: string;
          caption?: string | null;
          tenant_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      system_settings: {
        Row: {
          tenant_id: string;
          mode: Database["public"]["Enums"]["operating_mode"];
          max_concurrent_assisted: number;
          enable_assisted_wash: boolean;
          price_assisted_wash_credits: number;
          enable_full_grooming: boolean;
          price_full_grooming_credits: number;
          updated_at: string;
        };
        Insert: {
          tenant_id?: string;
          mode?: Database["public"]["Enums"]["operating_mode"];
          max_concurrent_assisted?: number;
          enable_assisted_wash?: boolean;
          price_assisted_wash_credits?: number;
          enable_full_grooming?: boolean;
          price_full_grooming_credits?: number;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          mode?: Database["public"]["Enums"]["operating_mode"];
          max_concurrent_assisted?: number;
          enable_assisted_wash?: boolean;
          price_assisted_wash_credits?: number;
          enable_full_grooming?: boolean;
          price_full_grooming_credits?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      admin_customers_overview: {
        Row: {
          customer_id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          balance_credits: number | null;
          bookings_total: number;
          bookings_upcoming: number;
        };
        Insert: {
          customer_id?: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          balance_credits?: number | null;
          bookings_total?: number;
          bookings_upcoming?: number;
        };
        Update: {
          customer_id?: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          balance_credits?: number | null;
          bookings_total?: number;
          bookings_upcoming?: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_booking: {
        Args: {
          p_station_id: string;
          p_dog_id: string;
          p_start_time: string;
          p_end_time: string;
          p_service_type?: Database["public"]["Enums"]["booking_service_type"];
        };
        Returns: {
          booking_id: string;
          total_credits: number;
          status: Database["public"]["Enums"]["booking_status"];
        }[];
      };
      cancel_booking: {
        Args: {
          p_booking_id: string;
        };
        Returns: {
          cancelled: boolean;
          refunded: boolean;
          refund_credits: number;
        }[];
      };
      get_booking_availability: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: {
          station_id: string;
          start_time: string;
          end_time: string;
        }[];
      };
      admin_adjust_wallet: {
        Args: {
          p_customer_id: string;
          p_amount_credits: number;
          p_reason?: string | null;
        };
        Returns: {
          balance_credits: number;
        }[];
      };
      apply_wallet_topup: {
        Args: {
          p_amount_credits: number;
          p_amount_currency?: number;
          p_reference?: string | null;
        };
        Returns: {
          applied: boolean;
          balance_credits: number;
        }[];
      };
      admin_update_booking_status: {
        Args: {
          p_booking_id: string;
          p_status: Database["public"]["Enums"]["booking_status"];
          p_reason?: string | null;
        };
        Returns: {
          status: Database["public"]["Enums"]["booking_status"];
          refunded: boolean;
          refund_credits: number;
        }[];
      };
      redeem_coupon_code: {
        Args: {
          p_code: string;
        };
        Returns: {
          applied: boolean;
          balance_credits: number;
          amount_credits: number;
        }[];
      };
      extend_booking_session: {
        Args: {
          p_booking_id: string;
          p_extension_minutes: number;
          p_cost_credits: number;
        };
        Returns: {
          extended: boolean;
          new_end_time: string;
          new_balance_credits: number;
          new_remaining_seconds: number;
        }[];
      };
      current_tenant_id: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
  };
};
