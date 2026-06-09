export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      friend_requests: {
        Row: {
          created_at: string;
          id: string;
          recipient_id: string;
          requester_id: string;
          responded_at: string | null;
          status: Database['public']['Enums']['friend_request_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          recipient_id: string;
          requester_id: string;
          responded_at?: string | null;
          status?: Database['public']['Enums']['friend_request_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          recipient_id?: string;
          requester_id?: string;
          responded_at?: string | null;
          status?: Database['public']['Enums']['friend_request_status'];
          updated_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          created_at: string;
          id: string;
          requested_by: string | null;
          user_high_id: string;
          user_low_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          requested_by?: string | null;
          user_high_id: string;
          user_low_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          requested_by?: string | null;
          user_high_id?: string;
          user_low_id?: string;
        };
        Relationships: [];
      };
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
          match_role: Database['public']['Enums']['match_role'];
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
          match_role?: Database['public']['Enums']['match_role'];
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
          match_role?: Database['public']['Enums']['match_role'];
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
          default_match_role: Database['public']['Enums']['match_role'];
          default_player_account_id: string | null;
          default_queue_type: Database['public']['Enums']['queue_type'];
          roi_config: Json | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_account?: Database['public']['Enums']['account_type'];
          default_match_role?: Database['public']['Enums']['match_role'];
          default_player_account_id?: string | null;
          default_queue_type?: Database['public']['Enums']['queue_type'];
          roi_config?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_account?: Database['public']['Enums']['account_type'];
          default_match_role?: Database['public']['Enums']['match_role'];
          default_player_account_id?: string | null;
          default_queue_type?: Database['public']['Enums']['queue_type'];
          roi_config?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          avatar_updated_at: string | null;
          avatar_url: string | null;
          created_at: string;
          is_discoverable: boolean;
          nickname: string | null;
          normalized_nickname: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_updated_at?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          is_discoverable?: boolean;
          nickname?: string | null;
          normalized_nickname?: never;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_updated_at?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          is_discoverable?: boolean;
          nickname?: string | null;
          normalized_nickname?: never;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_friend_request: {
        Args: { p_request_id: string };
        Returns: Array<{
          friend_id: string;
          request_id: string;
        }>;
      };
      are_friends: {
        Args: { p_user_a: string; p_user_b: string };
        Returns: boolean;
      };
      cancel_friend_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      delete_current_user: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      decline_friend_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      get_friend_stats: {
        Args: { p_friend_id: string };
        Returns: Array<{
          heroes: Json;
          maps: Json;
          modes: Json;
          profile: Json;
          recent_form: Json;
          summary: Json;
        }>;
      };
      list_friend_requests: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          created_at: string;
          direction: string;
          nickname: string;
          request_id: string;
          responded_at: string | null;
          status: Database['public']['Enums']['friend_request_status'];
          user_id: string;
        }>;
      };
      list_friends: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          avatar_url: string | null;
          draws: number;
          friend_id: string;
          friends_since: string;
          losses: number;
          nickname: string;
          total_matches: number;
          win_rate: number;
          wins: number;
        }>;
      };
      remove_friend: {
        Args: { p_friend_id: string };
        Returns: undefined;
      };
      search_user_profiles: {
        Args: { p_limit?: number; p_query: string };
        Returns: Array<{
          created_at: string;
          nickname: string;
          relationship: string;
          request_id: string | null;
          user_id: string;
        }>;
      };
      send_friend_request: {
        Args: { p_recipient_id: string };
        Returns: Array<{
          request_id: string | null;
          status: string;
        }>;
      };
    };
    Enums: {
      account_type: 'main' | 'sub';
      friend_request_status: 'pending' | 'accepted' | 'declined' | 'canceled';
      match_result: 'win' | 'loss' | 'draw';
      match_role: 'tank' | 'damage' | 'support';
      match_source: 'ocr' | 'manual' | 'mixed';
      mode_id: 'control' | 'hybrid' | 'push' | 'escort' | 'flashpoint' | 'clash';
      queue_type: 'solo' | 'duo' | 'trio' | 'quad' | 'five';
    };
    CompositeTypes: Record<string, never>;
  };
}
