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
      ai_usage: {
        Row: {
          byok: boolean
          cached_tokens: number
          created_at: string
          feature: string
          flex: boolean
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          reasoning_tokens: number
          user_id: string | null
        }
        Insert: {
          byok?: boolean
          cached_tokens?: number
          created_at?: string
          feature: string
          flex?: boolean
          id?: never
          input_tokens?: number
          model: string
          output_tokens?: number
          reasoning_tokens?: number
          user_id?: string | null
        }
        Update: {
          byok?: boolean
          cached_tokens?: number
          created_at?: string
          feature?: string
          flex?: boolean
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          reasoning_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          base_url: string
          created_at: string
          last4: string
          model: string
          provider: string
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          base_url: string
          created_at?: string
          last4: string
          model: string
          provider?: string
          user_id: string
          vault_secret_id: string
        }
        Update: {
          base_url?: string
          created_at?: string
          last4?: string
          model?: string
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
          gen_part: number | null
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
          gen_part?: number | null
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
          gen_part?: number | null
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
          mode: string | null
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
          mode?: string | null
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
          mode?: string | null
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
      generation_caps: {
        Row: {
          cards: number
          guide: number
          plan: Database["public"]["Enums"]["plan"]
          quiz: number
        }
        Insert: {
          cards: number
          guide: number
          plan: Database["public"]["Enums"]["plan"]
          quiz: number
        }
        Update: {
          cards?: number
          guide?: number
          plan?: Database["public"]["Enums"]["plan"]
          quiz?: number
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
      model_prices: {
        Row: {
          cached_per_m: number
          input_per_m: number
          model: string
          note: string | null
          output_per_m: number
          updated_at: string
        }
        Insert: {
          cached_per_m: number
          input_per_m: number
          model: string
          note?: string | null
          output_per_m: number
          updated_at?: string
        }
        Update: {
          cached_per_m?: number
          input_per_m?: number
          model?: string
          note?: string | null
          output_per_m?: number
          updated_at?: string
        }
        Relationships: []
      }
      notes_sections: {
        Row: {
          body_md: string
          gen_part: number | null
          id: string
          pages: number[]
          position: number
          source_id: string
          title: string
          user_id: string
        }
        Insert: {
          body_md: string
          gen_part?: number | null
          id?: string
          pages?: number[]
          position: number
          source_id: string
          title: string
          user_id?: string
        }
        Update: {
          body_md?: string
          gen_part?: number | null
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
          last_seen_version: string | null
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
          last_seen_version?: string | null
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
          last_seen_version?: string | null
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
          gen_run: number | null
          id: string
          source_id: string | null
          subject_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gen_run?: number | null
          id?: string
          source_id?: string | null
          subject_id: string
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          gen_run?: number | null
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
      shared_sets: {
        Row: {
          content_hash: string
          created_at: string
          gen_version: number
          kind: string
          options_key: string
          page_count: number
          payload: Json
          uses: number
        }
        Insert: {
          content_hash: string
          created_at?: string
          gen_version: number
          kind: string
          options_key?: string
          page_count: number
          payload: Json
          uses?: number
        }
        Update: {
          content_hash?: string
          created_at?: string
          gen_version?: number
          kind?: string
          options_key?: string
          page_count?: number
          payload?: Json
          uses?: number
        }
        Relationships: []
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
          content_hash: string | null
          counted: boolean
          created_at: string
          error_code: string | null
          filename: string
          id: string
          kind: string
          lesson: string | null
          options: Json | null
          original_filename: string | null
          page_count: number
          status: Database["public"]["Enums"]["source_status"]
          steps: Json
          storage_path: string | null
          subject_id: string
          unit_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bytes?: number | null
          content_hash?: string | null
          counted?: boolean
          created_at?: string
          error_code?: string | null
          filename: string
          id?: string
          kind: string
          lesson?: string | null
          options?: Json | null
          original_filename?: string | null
          page_count?: number
          status?: Database["public"]["Enums"]["source_status"]
          steps?: Json
          storage_path?: string | null
          subject_id: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          bytes?: number | null
          content_hash?: string | null
          counted?: boolean
          created_at?: string
          error_code?: string | null
          filename?: string
          id?: string
          kind?: string
          lesson?: string | null
          options?: Json | null
          original_filename?: string | null
          page_count?: number
          status?: Database["public"]["Enums"]["source_status"]
          steps?: Json
          storage_path?: string | null
          subject_id?: string
          unit_id?: string | null
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
          {
            foreignKeyName: "sources_unit_id_user_id_fkey"
            columns: ["unit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      student_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          search: unknown
          source_id: string | null
          subject_id: string
          title: string
          unit_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id: string
          search?: unknown
          source_id?: string | null
          subject_id: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          search?: unknown
          source_id?: string | null
          subject_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_source_id_user_id_fkey"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "student_notes_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "student_notes_unit_id_user_id_fkey"
            columns: ["unit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          current_unit_id: string | null
          current_unit_pinned: boolean
          id: string
          level: string | null
          name: string
          school_year: string | null
          study_defaults: Json | null
          user_id: string
        }
        Insert: {
          archived?: boolean
          area?: string | null
          catalog_id?: string | null
          color_index?: number
          course_code?: string | null
          created_at?: string
          current_unit_id?: string | null
          current_unit_pinned?: boolean
          id?: string
          level?: string | null
          name: string
          school_year?: string | null
          study_defaults?: Json | null
          user_id?: string
        }
        Update: {
          archived?: boolean
          area?: string | null
          catalog_id?: string | null
          color_index?: number
          course_code?: string | null
          created_at?: string
          current_unit_id?: string | null
          current_unit_pinned?: boolean
          id?: string
          level?: string | null
          name?: string
          school_year?: string | null
          study_defaults?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_current_unit_id_user_id_fkey"
            columns: ["current_unit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          id: string
          number: string | null
          subject_id: string
          title: string | null
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          number?: string | null
          subject_id: string
          title?: string | null
          user_id?: string
          word?: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: string | null
          subject_id?: string
          title?: string | null
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
      ai_usage_costed: {
        Row: {
          byok: boolean | null
          cached_tokens: number | null
          cost_usd: number | null
          created_at: string | null
          feature: string | null
          flex: boolean | null
          id: number | null
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          priced: boolean | null
          reasoning_tokens: number | null
          user_id: string | null
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          byok: boolean | null
          cached_tokens: number | null
          calls: number | null
          cost_usd: number | null
          day: string | null
          feature: string | null
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          reasoning_tokens: number | null
        }
        Relationships: []
      }
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
      read_byok: {
        Args: { p_user: string }
        Returns: {
          api_key: string
          base_url: string
          model: string
        }[]
      }
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
      store_byok: {
        Args: {
          p_base_url: string
          p_key: string
          p_model: string
          p_user: string
        }
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
  graphql_public: {
    Enums: {},
  },
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
