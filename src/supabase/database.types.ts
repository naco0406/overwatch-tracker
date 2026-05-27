export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      match_heroes: {
        Row: {
          created_at: string;
          hero_id: string;
          id: string;
          match_id: string;
          order_index: number;
          source: Database['public']['Enums']['match_source'];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          hero_id: string;
          id?: string;
          match_id: string;
          order_index?: number;
          source?: Database['public']['Enums']['match_source'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          hero_id?: string;
          id?: string;
          match_id?: string;
          order_index?: number;
          source?: Database['public']['Enums']['match_source'];
          user_id?: string;
        };
        Relationships: [
          {
            columns: ['match_id', 'user_id'];
            foreignKeyName: 'match_heroes_match_id_user_id_fkey';
            referencedColumns: ['id', 'user_id'];
            referencedRelation: 'matches';
          },
        ];
      };
      matches: {
        Row: {
          account: Database['public']['Enums']['account_type'];
          account_id: string | null;
          created_at: string;
          enemy_score: number;
          id: string;
          map_id: string;
          memo: string;
          mode_id: Database['public']['Enums']['mode_id'];
          ocr_confidence: Json | null;
          played_at: string;
          queue_type: Database['public']['Enums']['queue_type'];
          result: Database['public']['Enums']['match_result'];
          session_id: string;
          source: Database['public']['Enums']['match_source'];
          tags: string[];
          team_comp: Json | null;
          team_score: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account?: Database['public']['Enums']['account_type'];
          account_id?: string | null;
          created_at?: string;
          enemy_score: number;
          id?: string;
          map_id: string;
          memo?: string;
          mode_id: Database['public']['Enums']['mode_id'];
          ocr_confidence?: Json | null;
          played_at?: string;
          queue_type?: Database['public']['Enums']['queue_type'];
          result: Database['public']['Enums']['match_result'];
          session_id: string;
          source?: Database['public']['Enums']['match_source'];
          tags?: string[];
          team_comp?: Json | null;
          team_score: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account?: Database['public']['Enums']['account_type'];
          account_id?: string | null;
          created_at?: string;
          enemy_score?: number;
          id?: string;
          map_id?: string;
          memo?: string;
          mode_id?: Database['public']['Enums']['mode_id'];
          ocr_confidence?: Json | null;
          played_at?: string;
          queue_type?: Database['public']['Enums']['queue_type'];
          result?: Database['public']['Enums']['match_result'];
          session_id?: string;
          source?: Database['public']['Enums']['match_source'];
          tags?: string[];
          team_comp?: Json | null;
          team_score?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      player_accounts: {
        Row: {
          battle_tag: string;
          created_at: string;
          deactivated_at: string | null;
          display_name: string;
          id: string;
          is_active: boolean;
          is_main: boolean;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          battle_tag: string;
          created_at?: string;
          deactivated_at?: string | null;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          is_main?: boolean;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          battle_tag?: string;
          created_at?: string;
          deactivated_at?: string | null;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          is_main?: boolean;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          created_at: string;
          default_account: Database['public']['Enums']['account_type'];
          default_queue_type: Database['public']['Enums']['queue_type'];
          roi_config: Json | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_account?: Database['public']['Enums']['account_type'];
          default_queue_type?: Database['public']['Enums']['queue_type'];
          roi_config?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_account?: Database['public']['Enums']['account_type'];
          default_queue_type?: Database['public']['Enums']['queue_type'];
          roi_config?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      account_type: 'main' | 'sub';
      match_result: 'win' | 'loss' | 'draw';
      match_source: 'ocr' | 'manual' | 'mixed';
      mode_id: 'control' | 'hybrid' | 'push' | 'escort' | 'flashpoint' | 'clash';
      queue_type: 'solo' | 'duo' | 'trio' | 'quad' | 'five';
    };
    CompositeTypes: Record<string, never>;
  };
}
