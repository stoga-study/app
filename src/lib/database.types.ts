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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          last4: string
          provider: string
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          last4: string
          provider?: string
          user_id: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          last4?: string
          provider?: string
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: []
      }
      card_reviews: {
        Row: {
          card_id: string
          client_id: string | null
          id: string
          rating: number
          reviewed_at: string
          state: number
          user_id: string
        }
        Insert: {
          card_id: string
          client_id?: string | null
          id?: string
          rating: number
          reviewed_at?: string
          state: number
          user_id?: string
        }
        Update: {
          card_id?: string
          client_id?: string | null
          id?: string
          rating?: number
          reviewed_at?: string
          state?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_reviews_card_owner"
            columns: ["card_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      cards: {
        Row: {
          back: string
          created_at: string
          difficulty: number
          due: string
          edited: boolean
          elapsed_days: number
          front: string
          id: string
          lapses: number
          last_review: string | null
          learning_steps: number
          pages: number[]
          reps: number
          scheduled_days: number
          source_id: string | null
          stability: number
          state: number
          subject_id: string
          user_id: string
        }
        Insert: {
          back: string
          created_at?: string
          difficulty?: number
          due?: string
          edited?: boolean
          elapsed_days?: number
          front: string
          id?: string
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          pages?: number[]
          reps?: number
          scheduled_days?: number
          source_id?: string | null
          stability?: number
          state?: number
          subject_id: string
          user_id?: string
        }
        Update: {
          back?: string
          created_at?: string
          difficulty?: number
          due?: string
          edited?: boolean
          elapsed_days?: number
          front?: string
          id?: string
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          pages?: number[]
          reps?: number
          scheduled_days?: number
          source_id?: string | null
          stability?: number
          state?: number
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_subject_owner"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          citations: Json
          content: string
          created_at: string
          hint_level: number | null
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          citations?: Json
          content: string
          created_at?: string
          hint_level?: number | null
          id?: string
          role: string
          thread_id: string
          user_id?: string
        }
        Update: {
          citations?: Json
          content?: string
          created_at?: string
          hint_level?: number | null
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_owner"
            columns: ["thread_id", "user_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          subject_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subject_id: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          subject_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_subject_owner"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      feedback: {
        Row: {
          body: string
          consent_to_publish: boolean
          created_at: string
          id: string
          kind: string
          page: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          consent_to_publish?: boolean
          created_at?: string
          id?: string
          kind: string
          page?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          consent_to_publish?: boolean
          created_at?: string
          id?: string
          kind?: string
          page?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      guide_sections: {
        Row: {
          body_md: string
          id: string
          minutes: number | null
          pages: number[]
          position: number
          source_id: string
          title: string
          user_id: string
        }
        Insert: {
          body_md: string
          id?: string
          minutes?: number | null
          pages?: number[]
          position: number
          source_id: string
          title: string
          user_id?: string
        }
        Update: {
          body_md?: string
          id?: string
          minutes?: number | null
          pages?: number[]
          position?: number
          source_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_sections_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_sections_source_owner"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      mistakes: {
        Row: {
          attempt_id: string | null
          chosen_index: number | null
          created_at: string
          id: string
          question_id: string
          resolved_at: string | null
          user_id: string
        }
        Insert: {
          attempt_id?: string | null
          chosen_index?: number | null
          created_at?: string
          id?: string
          question_id: string
          resolved_at?: string | null
          user_id?: string
        }
        Update: {
          attempt_id?: string | null
          chosen_index?: number | null
          created_at?: string
          id?: string
          question_id?: string
          resolved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mistakes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_question_owner"
            columns: ["question_id", "user_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      notes_sections: {
        Row: {
          body_md: string
          id: string
          pages: number[]
          position: number
          source_id: string
          title: string
          user_id: string
        }
        Insert: {
          body_md: string
          id?: string
          pages?: number[]
          position: number
          source_id: string
          title: string
          user_id?: string
        }
        Update: {
          body_md?: string
          id?: string
          pages?: number[]
          position?: number
          source_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_sections_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_sections_source_owner"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          kind: Database["public"]["Enums"]["usage_kind"]
          limit: number | null
          period: string
          plan: Database["public"]["Enums"]["plan"]
        }
        Insert: {
          kind: Database["public"]["Enums"]["usage_kind"]
          limit?: number | null
          period: string
          plan: Database["public"]["Enums"]["plan"]
        }
        Update: {
          kind?: Database["public"]["Enums"]["usage_kind"]
          limit?: number | null
          period?: string
          plan?: Database["public"]["Enums"]["plan"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          grade: string | null
          graduation_year: number | null
          onboarded: boolean
          plan: Database["public"]["Enums"]["plan"]
          school: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          grade?: string | null
          graduation_year?: number | null
          onboarded?: boolean
          plan?: Database["public"]["Enums"]["plan"]
          school?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          grade?: string | null
          graduation_year?: number | null
          onboarded?: boolean
          plan?: Database["public"]["Enums"]["plan"]
          school?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json
          correct: number
          created_at: string
          finished_at: string | null
          id: string
          quiz_id: string
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json
          correct?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          quiz_id: string
          total?: number
          user_id?: string
        }
        Update: {
          answers?: Json
          correct?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          quiz_id?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_quiz_owner"
            columns: ["quiz_id", "user_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          answer_index: number
          explanation: string
          hint: string | null
          id: string
          options: Json
          pages: number[]
          position: number
          prompt: string
          quiz_id: string
          topic: string | null
          user_id: string
        }
        Insert: {
          answer_index: number
          explanation: string
          hint?: string | null
          id?: string
          options: Json
          pages?: number[]
          position: number
          prompt: string
          quiz_id: string
          topic?: string | null
          user_id?: string
        }
        Update: {
          answer_index?: number
          explanation?: string
          hint?: string | null
          id?: string
          options?: Json
          pages?: number[]
          position?: number
          prompt?: string
          quiz_id?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_quiz_owner"
            columns: ["quiz_id", "user_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          id: string
          source_id: string | null
          subject_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_id?: string | null
          subject_id: string
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          source_id?: string | null
          subject_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_subject_owner"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      source_pages: {
        Row: {
          page_no: number
          source_id: string
          text: string
          tsv: unknown
          user_id: string
        }
        Insert: {
          page_no: number
          source_id: string
          text: string
          tsv?: unknown
          user_id?: string
        }
        Update: {
          page_no?: number
          source_id?: string
          text?: string
          tsv?: unknown
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_pages_source_owner"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      sources: {
        Row: {
          bytes: number | null
          created_at: string
          error_code: string | null
          filename: string
          id: string
          kind: string
          page_count: number
          status: Database["public"]["Enums"]["source_status"]
          steps: Json
          storage_path: string | null
          subject_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          error_code?: string | null
          filename: string
          id?: string
          kind: string
          page_count?: number
          status?: Database["public"]["Enums"]["source_status"]
          steps?: Json
          storage_path?: string | null
          subject_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          bytes?: number | null
          created_at?: string
          error_code?: string | null
          filename?: string
          id?: string
          kind?: string
          page_count?: number
          status?: Database["public"]["Enums"]["source_status"]
          steps?: Json
          storage_path?: string | null
          subject_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_subject_owner"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      subjects: {
        Row: {
          archived: boolean
          area: string | null
          catalog_id: string | null
          color_index: number
          course_code: string | null
          created_at: string
          id: string
          level: string | null
          name: string
          school_year: string | null
          user_id: string
        }
        Insert: {
          archived?: boolean
          area?: string | null
          catalog_id?: string | null
          color_index?: number
          course_code?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name: string
          school_year?: string | null
          user_id?: string
        }
        Update: {
          archived?: boolean
          area?: string | null
          catalog_id?: string | null
          color_index?: number
          course_code?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name?: string
          school_year?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          byok: boolean
          created_at: string
          id: number
          kind: Database["public"]["Enums"]["usage_kind"]
          user_id: string
        }
        Insert: {
          byok?: boolean
          created_at?: string
          id?: never
          kind: Database["public"]["Enums"]["usage_kind"]
          user_id: string
        }
        Update: {
          byok?: boolean
          created_at?: string
          id?: never
          kind?: Database["public"]["Enums"]["usage_kind"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allowance_status: {
        Args: never
        Returns: {
          kind: Database["public"]["Enums"]["usage_kind"]
          limit: number
          resets_at: string
          used: number
        }[]
      }
      begin_upload: {
        Args: {
          p_bytes: number
          p_filename: string
          p_kind: string
          p_subject: string
        }
        Returns: string
      }
      cancel_upload: { Args: { p_source: string }; Returns: undefined }
      consume_allowance: {
        Args: {
          p_byok?: boolean
          p_kind: Database["public"]["Enums"]["usage_kind"]
          p_user: string
        }
        Returns: boolean
      }
      period_end: { Args: { p_period: string }; Returns: string }
      period_start: { Args: { p_period: string }; Returns: string }
      read_api_key: { Args: { p_user: string }; Returns: string }
      refund_allowance: {
        Args: {
          p_kind: Database["public"]["Enums"]["usage_kind"]
          p_user: string
        }
        Returns: undefined
      }
      remove_api_key: { Args: never; Returns: undefined }
      search_pages: {
        Args: { p_limit?: number; p_query: string; p_subject: string }
        Returns: {
          filename: string
          page_no: number
          rank: number
          source_id: string
          text: string
        }[]
      }
      store_api_key: {
        Args: { p_key: string; p_provider: string; p_user: string }
        Returns: undefined
      }
    }
    Enums: {
      plan: "essential" | "independent" | "unlimited"
      source_status:
        | "uploaded"
        | "ready_text"
        | "generating"
        | "ready"
        | "failed"
      usage_kind: "tutor_message" | "upload"
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
  public: {
    Enums: {
      plan: ["essential", "independent", "unlimited"],
      source_status: [
        "uploaded",
        "ready_text",
        "generating",
        "ready",
        "failed",
      ],
      usage_kind: ["tutor_message", "upload"],
    },
  },
} as const
