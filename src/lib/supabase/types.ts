// Tipos de la base de datos — generados desde el schema real de Supabase
// (proyecto "delpercio Project") y recortados a las 9 tablas del panel.
// Cada tabla incluye `Relationships` (requerido por supabase-js) y se mantiene
// `__InternalSupabase` para el tipado correcto de insert/update.
// Regenerar tras cambios de schema: ver README > "Cómo personalizar".

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)";
  };
  public: {
    Tables: {
      profiles: {
        Row: { id: string; name: string; role: string; client_slug: string; created_at: string };
        Insert: { id?: string; name: string; role?: string; client_slug?: string; created_at?: string };
        Update: { id?: string; name?: string; role?: string; client_slug?: string; created_at?: string };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          display_name: string;
          source: string;
          external_id: string | null;
          status: string;
          created_by: string | null;
          client_slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          display_name: string;
          source?: string;
          external_id?: string | null;
          status?: string;
          created_by?: string | null;
          client_slug?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          source?: string;
          external_id?: string | null;
          status?: string;
          created_by?: string | null;
          client_slug?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          trace_id: string | null;
          client_slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: string;
          content: string;
          trace_id?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: string;
          content?: string;
          trace_id?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_traces: {
        Row: {
          id: string;
          conversation_id: string;
          user_message_id: string | null;
          assistant_message_id: string | null;
          status: string;
          iterations: number;
          total_input_tokens: number;
          total_output_tokens: number;
          total_latency_ms: number;
          evaluator_passed: boolean | null;
          escalation_reason: string | null;
          provider: string;
          client_slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_message_id?: string | null;
          assistant_message_id?: string | null;
          status: string;
          iterations?: number;
          total_input_tokens?: number;
          total_output_tokens?: number;
          total_latency_ms?: number;
          evaluator_passed?: boolean | null;
          escalation_reason?: string | null;
          provider?: string;
          client_slug?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_message_id?: string | null;
          assistant_message_id?: string | null;
          status?: string;
          iterations?: number;
          total_input_tokens?: number;
          total_output_tokens?: number;
          total_latency_ms?: number;
          evaluator_passed?: boolean | null;
          escalation_reason?: string | null;
          provider?: string;
          client_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_trace_steps: {
        Row: {
          id: string;
          trace_id: string;
          step_order: number;
          step_type: string;
          step_name: string;
          iteration: number;
          model: string;
          provider: string;
          input: Json | null;
          output: Json | null;
          input_tokens: number;
          output_tokens: number;
          latency_ms: number;
          error: string | null;
          client_slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          trace_id: string;
          step_order: number;
          step_type: string;
          step_name: string;
          iteration?: number;
          model: string;
          provider: string;
          input?: Json | null;
          output?: Json | null;
          input_tokens?: number;
          output_tokens?: number;
          latency_ms?: number;
          error?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          trace_id?: string;
          step_order?: number;
          step_type?: string;
          step_name?: string;
          iteration?: number;
          model?: string;
          provider?: string;
          input?: Json | null;
          output?: Json | null;
          input_tokens?: number;
          output_tokens?: number;
          latency_ms?: number;
          error?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_jobs: {
        Row: {
          id: string;
          conversation_id: string;
          user_message_id: string;
          status: string;
          attempts: number;
          max_attempts: number;
          error: string | null;
          trace_id: string | null;
          client_slug: string;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_message_id: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          error?: string | null;
          trace_id?: string | null;
          client_slug?: string;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_message_id?: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          error?: string | null;
          trace_id?: string | null;
          client_slug?: string;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          target_type: string;
          target_id: string;
          author_id: string;
          content: string;
          client_slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          target_type: string;
          target_id: string;
          author_id: string;
          content: string;
          client_slug?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          target_type?: string;
          target_id?: string;
          author_id?: string;
          content?: string;
          client_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      outbound_webhooks: {
        Row: {
          id: string;
          name: string;
          url: string;
          events: string[];
          secret: string | null;
          active: boolean;
          client_slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          url: string;
          events: string[];
          secret?: string | null;
          active?: boolean;
          client_slug?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          url?: string;
          events?: string[];
          secret?: string | null;
          active?: boolean;
          client_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_notifications: {
        Row: {
          id: string;
          conversation_id: string;
          trace_id: string | null;
          category: string;
          reason: string | null;
          summary: string | null;
          client_slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          trace_id?: string | null;
          category: string;
          reason?: string | null;
          summary?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          trace_id?: string | null;
          category?: string;
          reason?: string | null;
          summary?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      outbound_webhook_deliveries: {
        Row: {
          id: string;
          webhook_id: string;
          event: string;
          payload: Json;
          response_status: number | null;
          response_body: string | null;
          delivered_at: string | null;
          client_slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          webhook_id: string;
          event: string;
          payload: Json;
          response_status?: number | null;
          response_body?: string | null;
          delivered_at?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          webhook_id?: string;
          event?: string;
          payload?: Json;
          response_status?: number | null;
          response_body?: string | null;
          delivered_at?: string | null;
          client_slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_agent_jobs: {
        Args: { p_limit: number };
        Returns: Database["public"]["Tables"]["agent_jobs"]["Row"][];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// Atajos de tipo por tabla.
type PublicTables = Database["public"]["Tables"];
export type Row<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type Insert<T extends keyof PublicTables> = PublicTables[T]["Insert"];
export type Update<T extends keyof PublicTables> = PublicTables[T]["Update"];

export type Profile = Row<"profiles">;
export type Conversation = Row<"conversations">;
export type Message = Row<"messages">;
export type AgentTrace = Row<"agent_traces">;
export type AgentTraceStep = Row<"agent_trace_steps">;
export type AgentJob = Row<"agent_jobs">;
export type Comment = Row<"comments">;
export type AgentNotification = Row<"agent_notifications">;
export type OutboundWebhook = Row<"outbound_webhooks">;
export type OutboundWebhookDelivery = Row<"outbound_webhook_deliveries">;

// Uniones de valores cerrados (los CHECK constraints del schema).
export type ProfileRole = "dev" | "client";
export type ConversationSource = "test" | "whatsapp";
export type MessageRole = "user" | "assistant" | "system" | "human";
export type TraceStatus = "running" | "completed" | "escalated" | "failed";
export type StepType = "orchestrator" | "subagent" | "tool" | "evaluator";
export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type CommentTargetType = "conversation" | "message";
export type Provider = "anthropic" | "openrouter";
/**
 * Categoría de una notificación al equipo. Texto libre en snake_case: cada
 * cliente define sus propias categorías en el prompt del orquestador. El
 * worker tiene etiquetas legibles para las comunes y un fallback que
 * humaniza el snake_case.
 */
export type NotificationCategory = string;
