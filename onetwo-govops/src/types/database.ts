export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_console_modules: {
        Row: {
          created_at: string
          id: string
          name: string
          section: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          section: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          section?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      admin_console_permissions: {
        Row: {
          access_level: string
          created_at: string
          id: number
          module_id: string
          role_id: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: number
          module_id: string
          role_id: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: number
          module_id?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_console_permissions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "admin_console_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_console_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_console_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_console_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      captured_items: {
        Row: {
          id: string
          thread_id: string
          type: string
          title: string
          feedback_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          type: string
          title: string
          feedback_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          type?: string
          title?: string
          feedback_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "captured_items_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captured_items_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_assocs: {
        Row: {
          feedback_id: string
          tenancy_id: string
        }
        Insert: {
          feedback_id: string
          tenancy_id: string
        }
        Update: {
          feedback_id?: string
          tenancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_assocs_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_items: {
        Row: {
          id: string
          title: string
          description: string | null
          theme: string
          type: string
          status: string
          votes: number
          impact: string | null
          quarter: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          theme?: string
          type?: string
          status?: string
          votes?: number
          impact?: string | null
          quarter?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          theme?: string
          type?: string
          status?: string
          votes?: number
          impact?: string | null
          quarter?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_source_threads: {
        Row: {
          feedback_id: string
          thread_id: string
        }
        Insert: {
          feedback_id: string
          thread_id: string
        }
        Update: {
          feedback_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_source_threads_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_source_threads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachment_url: string | null
          body: string
          created_at: string
          id: string
          sender_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          thread_id: string
        }
        Insert: {
          attachment_url?: string | null
          body?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          thread_id: string
        }
        Update: {
          attachment_url?: string | null
          body?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          id: string
          tenancy_id: string
          subject: string
          status: string
          priority: string
          module: string
          assignee_name: string | null
          ai_summary: string | null
          created_by_user_id: string | null
          created_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenancy_id: string
          subject: string
          status?: string
          priority?: string
          module?: string
          assignee_name?: string | null
          ai_summary?: string | null
          created_by_user_id?: string | null
          created_by_name?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenancy_id?: string
          subject?: string
          status?: string
          priority?: string
          module?: string
          assignee_name?: string | null
          ai_summary?: string | null
          created_by_user_id?: string | null
          created_by_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor: string
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: number
          ip_address: unknown
          metadata: Json | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor: string
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: never
          ip_address?: unknown
          metadata?: Json | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor?: string
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: never
          ip_address?: unknown
          metadata?: Json | null
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          atom_id: string
          atom_type: Database["public"]["Enums"]["atom_type"]
          created_at: string
          id: number
          inclusion: Database["public"]["Enums"]["inclusion_level"]
          plan_id: string
          updated_at: string
        }
        Insert: {
          atom_id: string
          atom_type: Database["public"]["Enums"]["atom_type"]
          created_at?: string
          id?: never
          inclusion?: Database["public"]["Enums"]["inclusion_level"]
          plan_id: string
          updated_at?: string
        }
        Update: {
          atom_id?: string
          atom_type?: Database["public"]["Enums"]["atom_type"]
          created_at?: string
          id?: never
          inclusion?: Database["public"]["Enums"]["inclusion_level"]
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          created_at: string
          description: string | null
          id: string
          impl_status: Database["public"]["Enums"]["impl_status"]
          name: string
          slug: string
          sort_order: number
          submodule_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          impl_status?: Database["public"]["Enums"]["impl_status"]
          name: string
          slug: string
          sort_order?: number
          submodule_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          impl_status?: Database["public"]["Enums"]["impl_status"]
          name?: string
          slug?: string
          sort_order?: number
          submodule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "features_submodule_id_fkey"
            columns: ["submodule_id"]
            isOneToOne: false
            referencedRelation: "submodules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      plan_role_availability: {
        Row: {
          plan_id: string
          role_id: string
        }
        Insert: {
          plan_id: string
          role_id: string
        }
        Update: {
          plan_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_role_availability_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_role_availability_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          trial_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_users: {
        Row: {
          admin_console_role_id: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          platform_role: Database["public"]["Enums"]["platform_role"]
          updated_at: string
        }
        Insert: {
          admin_console_role_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          platform_role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
        }
        Update: {
          admin_console_role_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          platform_role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_users_admin_console_role_id_fkey"
            columns: ["admin_console_role_id"]
            isOneToOne: false
            referencedRelation: "admin_console_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"]
          atom_id: string
          atom_type: Database["public"]["Enums"]["atom_type"]
          created_at: string
          id: number
          role_id: string
          updated_at: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"]
          atom_id: string
          atom_type: Database["public"]["Enums"]["atom_type"]
          created_at?: string
          id?: never
          role_id: string
          updated_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"]
          atom_id?: string
          atom_type?: Database["public"]["Enums"]["atom_type"]
          created_at?: string
          id?: never
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      submodules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          impl_status: Database["public"]["Enums"]["impl_status"]
          is_leaf: boolean
          module_id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          impl_status?: Database["public"]["Enums"]["impl_status"]
          is_leaf?: boolean
          module_id: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          impl_status?: Database["public"]["Enums"]["impl_status"]
          is_leaf?: boolean
          module_id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submodules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          price_monthly: number
          price_yearly: number
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["plan_status"]
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          stripe_product_id: string | null
          stripe_sync_status: Database["public"]["Enums"]["stripe_sync_status"]
          stripe_synced_at: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id: string
          name: string
          price_monthly: number
          price_yearly: number
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_status"]
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          stripe_sync_status?: Database["public"]["Enums"]["stripe_sync_status"]
          stripe_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_monthly?: number
          price_yearly?: number
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_status"]
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          stripe_sync_status?: Database["public"]["Enums"]["stripe_sync_status"]
          stripe_synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenancies: {
        Row: {
          address: string | null
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          board_members: number
          created_at: string
          id: string
          jurisdiction: string | null
          last_payment_at: string | null
          managers: number
          name: string
          residents: number
          slug: string
          staff: number
          status: Database["public"]["Enums"]["tenancy_status"]
          stripe_customer_id: string | null
          stripe_sub_status: Database["public"]["Enums"]["stripe_sub_status"] | null
          stripe_subscription_id: string | null
          subscription_id: string
          trial_ends_at: string | null
          units: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          board_members?: number
          created_at?: string
          id?: string
          jurisdiction?: string | null
          last_payment_at?: string | null
          managers?: number
          name: string
          residents?: number
          slug: string
          staff?: number
          status?: Database["public"]["Enums"]["tenancy_status"]
          stripe_customer_id?: string | null
          stripe_sub_status?: Database["public"]["Enums"]["stripe_sub_status"] | null
          stripe_subscription_id?: string | null
          subscription_id: string
          trial_ends_at?: string | null
          units?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          board_members?: number
          created_at?: string
          id?: string
          jurisdiction?: string | null
          last_payment_at?: string | null
          managers?: number
          name?: string
          residents?: number
          slug?: string
          staff?: number
          status?: Database["public"]["Enums"]["tenancy_status"]
          stripe_customer_id?: string | null
          stripe_sub_status?: Database["public"]["Enums"]["stripe_sub_status"] | null
          stripe_subscription_id?: string | null
          subscription_id?: string
          trial_ends_at?: string | null
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenancies_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          activated_at: string | null
          auth_user_id: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          invited_at: string
          role_id: string
          status: string
          tenancy_id: string
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          invited_at?: string
          role_id: string
          status?: string
          tenancy_id: string
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          invited_at?: string
          role_id?: string
          status?: string
          tenancy_id?: string
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "v_tenancy_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          error_message: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          status: Database["public"]["Enums"]["webhook_status"]
          tenancy_id: string | null
          type: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          id: string
          payload?: Json | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["webhook_status"]
          tenancy_id?: string | null
          type: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["webhook_status"]
          tenancy_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "v_tenancy_stats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_permission_atoms: {
        Row: {
          atom_id: string | null
          atom_type: string | null
          name: string | null
          parent_module_id: string | null
          sort_order: number | null
        }
        Relationships: []
      }
      v_tenancy_stats: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"] | null
          board_members: number | null
          created_at: string | null
          id: string | null
          last_payment_at: string | null
          managers: number | null
          name: string | null
          plan_name: string | null
          price_monthly: number | null
          price_yearly: number | null
          residents: number | null
          slug: string | null
          staff: number | null
          status: Database["public"]["Enums"]["tenancy_status"] | null
          trial_ends_at: string | null
          units: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_platform_admin: { Args: never; Returns: boolean }
      resolve_permissions: {
        Args: { p_plan_id: string; p_role_id: string }
        Returns: {
          access: Database["public"]["Enums"]["access_level"]
          atom_id: string
          atom_name: string
          atom_type: Database["public"]["Enums"]["atom_type"]
          effective_access: string
          inclusion: Database["public"]["Enums"]["inclusion_level"]
          module_name: string
        }[]
      }
      user_tenancy_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      access_level: "contributor" | "reader" | "no_access"
      atom_type: "submodule" | "feature"
      audit_action:
        | "tenancy.created"
        | "tenancy.updated"
        | "tenancy.status_changed"
        | "tenancy.deleted"
        | "plan.created"
        | "plan.updated"
        | "plan.price_updated"
        | "plan.archived"
        | "module.created"
        | "module.updated"
        | "entitlement.changed"
        | "rbac.permission_changed"
        | "role.created"
        | "role.updated"
        | "stripe.sync_completed"
        | "stripe.sync_failed"
        | "stripe.webhook_received"
        | "user.invited"
        | "user.role_changed"
        | "user.deactivated"
        | "platform.trial_days_updated"
      billing_cycle: "monthly" | "yearly"
      impl_status: "implemented" | "future" | "tbd"
      inclusion_level: "included" | "not_included" | "tbd"
      plan_status: "active" | "archived" | "draft"
      platform_role: "platform_admin" | "platform_viewer"
      stripe_sub_status:
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "paused"
      stripe_sync_status: "synced" | "pending" | "error" | "not_synced"
      tenancy_status: "active" | "trial" | "suspended" | "churned"
      webhook_status: "pending" | "processed" | "failed" | "skipped"
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
