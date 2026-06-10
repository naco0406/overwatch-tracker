export interface CommunityPostAuthor {
  avatarUrl: string | null;
  nickname: string;
  userId: string;
}

export interface CommunityPostImage {
  height: number;
  id: string;
  imageUrl: string;
  sortOrder: number;
  width: number;
}

export interface CommunityPost {
  author: CommunityPostAuthor;
  bodyHtml: string;
  bodyText: string;
  createdAt: string;
  id: string;
  images: CommunityPostImage[];
  storyExpiresAt: string;
  updatedAt: string;
  viewerHasSeenStory: boolean;
}

export interface CommunityStoryPost {
  bodyHtml: string;
  bodyText: string;
  createdAt: string;
  id: string;
  images: CommunityPostImage[];
  storyExpiresAt: string;
  updatedAt: string;
  viewerHasSeenStory: boolean;
}

export interface CommunityStoryGroup {
  author: CommunityPostAuthor;
  hasUnseen: boolean;
  posts: CommunityStoryPost[];
}

export interface CommunityFeedCursor {
  createdAt: string;
  id: string;
}

export interface CreateCommunityPostImageInput {
  height: number;
  imageUrl: string;
  mimeType: string;
  objectKey: string;
  sizeBytes: number;
  sortOrder: number;
  width: number;
}

export interface CreateCommunityPostInput {
  bodyHtml: string;
  bodyText: string;
  images: CreateCommunityPostImageInput[];
}
