import { sanitizeRichTextHtml } from '@/lib/richTextHtml';
import { supabase } from '@/supabase/client';
import type { Database, Json } from '@/supabase/database.types';
import type {
  CommunityFeedCursor,
  CommunityPost,
  CommunityPostAuthor,
  CommunityPostImage,
  CommunityStoryGroup,
  CommunityStoryPost,
  CreateCommunityPostInput,
} from '@/types/communityPost';

type CommunityFeedRow = Database['public']['Functions']['list_community_feed']['Returns'][number];
type CommunityStoryRow =
  Database['public']['Functions']['list_community_stories']['Returns'][number];

interface CommunityFeedPage {
  items: CommunityPost[];
  nextCursor: CommunityFeedCursor | null;
}

const sanitizeAvatarUrl = (avatarUrl: string | null) => {
  if (!avatarUrl) {
    return null;
  }

  try {
    const url = new URL(avatarUrl);

    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const asRecord = (value: Json | unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: Json | unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const rowToAuthor = ({
  avatarUrl,
  nickname,
  userId,
}: {
  avatarUrl: string | null;
  nickname: string | null;
  userId: string;
}): CommunityPostAuthor => ({
  avatarUrl: sanitizeAvatarUrl(avatarUrl),
  nickname: nickname || '닉네임 없음',
  userId,
});

const parseImage = (value: Json): CommunityPostImage | null => {
  const record = asRecord(value);
  const id = asString(record.id);
  const imageUrl = sanitizeAvatarUrl(asString(record.imageUrl));
  const height = asNumber(record.height);
  const width = asNumber(record.width);

  if (!id || !imageUrl || height <= 0 || width <= 0) {
    return null;
  }

  return {
    height,
    id,
    imageUrl,
    sortOrder: asNumber(record.sortOrder),
    width,
  };
};

const parseImages = (value: Json) =>
  asArray(value)
    .map(parseImage)
    .filter((image): image is CommunityPostImage => Boolean(image))
    .sort((a, b) => a.sortOrder - b.sortOrder);

const rowToPost = (row: CommunityFeedRow): CommunityPost => ({
  author: rowToAuthor({
    avatarUrl: row.author_avatar_url,
    nickname: row.author_nickname,
    userId: row.author_user_id,
  }),
  bodyHtml: sanitizeRichTextHtml(row.body_html),
  bodyText: row.body_text,
  createdAt: row.created_at,
  id: row.post_id,
  images: parseImages(row.images),
  storyExpiresAt: row.story_expires_at,
  updatedAt: row.updated_at,
  viewerHasSeenStory: row.viewer_has_seen_story,
});

const parseStoryPost = (value: Json): CommunityStoryPost | null => {
  const record = asRecord(value);
  const id = asString(record.id);
  const createdAt = asString(record.createdAt);
  const storyExpiresAt = asString(record.storyExpiresAt);
  const updatedAt = asString(record.updatedAt);

  if (!id || !createdAt || !storyExpiresAt || !updatedAt) {
    return null;
  }

  return {
    bodyHtml: sanitizeRichTextHtml(asString(record.bodyHtml)),
    bodyText: asString(record.bodyText),
    createdAt,
    id,
    images: parseImages((record.images ?? []) as Json),
    storyExpiresAt,
    updatedAt,
    viewerHasSeenStory: asBoolean(record.viewerHasSeenStory),
  };
};

const rowToStoryGroup = (row: CommunityStoryRow): CommunityStoryGroup => ({
  author: rowToAuthor({
    avatarUrl: row.author_avatar_url,
    nickname: row.author_nickname,
    userId: row.author_user_id,
  }),
  hasUnseen: row.has_unseen,
  posts: asArray(row.posts)
    .map(parseStoryPost)
    .filter((post): post is CommunityStoryPost => Boolean(post)),
});

export const listCommunityFeed = async ({
  cursor,
  limit = 20,
}: {
  cursor?: CommunityFeedCursor | null;
  limit?: number;
} = {}): Promise<CommunityFeedPage> => {
  const { data, error } = await supabase.rpc('list_community_feed', {
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  const items = (data ?? []).map(rowToPost);
  const lastItem = items.at(-1);

  return {
    items,
    nextCursor:
      items.length === limit && lastItem
        ? {
            createdAt: lastItem.createdAt,
            id: lastItem.id,
          }
        : null,
  };
};

export const listCommunityStories = async () => {
  const { data, error } = await supabase.rpc('list_community_stories');

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToStoryGroup).filter((group) => group.posts.length > 0);
};

export const createCommunityPost = async (input: CreateCommunityPostInput) => {
  const { data, error } = await supabase.rpc('create_community_post', {
    p_body_html: input.bodyHtml,
    p_body_text: input.bodyText,
    p_images: input.images as unknown as Json,
  });

  if (error) {
    throw error;
  }

  return data?.[0]?.post_id ?? null;
};

export const deleteCommunityPost = async (postId: string) => {
  const { error } = await supabase.rpc('delete_community_post', {
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }
};

export const markCommunityStoryViewed = async (postId: string) => {
  const { error } = await supabase.rpc('mark_community_story_viewed', {
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }
};
