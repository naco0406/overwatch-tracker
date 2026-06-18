export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      competitive_seasons: {
        Row: {
          created_at: string;
          display_name: string;
          ends_at: string | null;
          id: string;
          season_number: number;
          starts_at: string;
          updated_at: string;
          year: number;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          ends_at?: string | null;
          id: string;
          season_number: number;
          starts_at: string;
          updated_at?: string;
          year: number;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          ends_at?: string | null;
          id?: string;
          season_number?: number;
          starts_at?: string;
          updated_at?: string;
          year?: number;
        };
        Relationships: [];
      };
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
      community_post_images: {
        Row: {
          created_at: string;
          height: number;
          id: string;
          image_url: string;
          mime_type: string;
          object_key: string;
          post_id: string;
          size_bytes: number;
          sort_order: number;
          user_id: string;
          width: number;
        };
        Insert: {
          created_at?: string;
          height: number;
          id?: string;
          image_url: string;
          mime_type: string;
          object_key: string;
          post_id: string;
          size_bytes: number;
          sort_order?: number;
          user_id: string;
          width: number;
        };
        Update: {
          created_at?: string;
          height?: number;
          id?: string;
          image_url?: string;
          mime_type?: string;
          object_key?: string;
          post_id?: string;
          size_bytes?: number;
          sort_order?: number;
          user_id?: string;
          width?: number;
        };
        Relationships: [];
      };
      community_posts: {
        Row: {
          body_html: string;
          body_text: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          story_expires_at: string;
          updated_at: string;
          user_id: string;
          visibility: string;
        };
        Insert: {
          body_html?: string;
          body_text?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          story_expires_at?: string;
          updated_at?: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          body_html?: string;
          body_text?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          story_expires_at?: string;
          updated_at?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [];
      };
      community_story_views: {
        Row: {
          post_id: string;
          viewed_at: string;
          viewer_id: string;
        };
        Insert: {
          post_id: string;
          viewed_at?: string;
          viewer_id: string;
        };
        Update: {
          post_id?: string;
          viewed_at?: string;
          viewer_id?: string;
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
          competitive_season_id: string | null;
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
          competitive_season_id?: string | null;
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
          competitive_season_id?: string | null;
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
      sticky_notes: {
        Row: {
          body: string;
          color: string;
          created_at: string;
          id: string;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string;
          color?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          color?: string;
          created_at?: string;
          id?: string;
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
          favorite_esports_team: Json | null;
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
          favorite_esports_team?: Json | null;
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
          favorite_esports_team?: Json | null;
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
      can_view_community_post: {
        Args: { p_post_id: string; p_user_id: string };
        Returns: boolean;
      };
      cancel_friend_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      create_community_post: {
        Args: { p_body_html: string; p_body_text: string; p_images?: Json };
        Returns: Array<{ post_id: string }>;
      };
      delete_community_post: {
        Args: { p_post_id: string };
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
      list_community_feed: {
        Args: {
          p_cursor_created_at?: string | null;
          p_cursor_id?: string | null;
          p_limit?: number;
        };
        Returns: Array<{
          author_avatar_url: string | null;
          author_nickname: string | null;
          author_user_id: string;
          body_html: string;
          body_text: string;
          created_at: string;
          images: Json;
          post_id: string;
          story_expires_at: string;
          updated_at: string;
          viewer_has_seen_story: boolean;
        }>;
      };
      list_community_stories: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          author_avatar_url: string | null;
          author_nickname: string | null;
          author_user_id: string;
          has_unseen: boolean;
          posts: Json;
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
      mark_community_story_viewed: {
        Args: { p_post_id: string };
        Returns: undefined;
      };
      search_user_profiles: {
        Args: { p_limit?: number; p_query: string };
        Returns: Array<{
          avatar_url: string | null;
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
