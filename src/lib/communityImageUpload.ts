import { supabase } from '@/supabase/client';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const ALLOWED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface PreparedCommunityImage {
  blob: Blob;
  height: number;
  mimeType: string;
  sizeBytes: number;
  width: number;
}

export interface UploadedCommunityImage {
  imageUrl: string;
  objectKey: string;
}

const getCommunityUploadEndpoint = () => {
  const baseUrl = (
    import.meta.env.VITE_COMMUNITY_IMAGE_UPLOAD_URL ??
    import.meta.env.VITE_AVATAR_UPLOAD_URL ??
    ''
  ).replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('커뮤니티 이미지 업로드 URL이 설정되지 않았습니다.');
  }

  return `${baseUrl}/community/images/upload`;
};

const blobFromCanvas = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    };

    image.src = objectUrl;
  });

export const prepareCommunityPostImage = async (file: File): Promise<PreparedCommunityImage> => {
  if (!ALLOWED_SOURCE_TYPES.has(file.type)) {
    throw new Error('JPG, PNG, WebP 이미지만 사용할 수 있습니다.');
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('원본 이미지는 8MB 이하만 사용할 수 있습니다.');
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('브라우저가 이미지 처리를 지원하지 않습니다.');
  }

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.88, 0.78, 0.68, 0.58, 0.48]) {
    const blob = await blobFromCanvas(canvas, 'image/webp', quality);

    if (blob && blob.size <= MAX_OUTPUT_BYTES) {
      return {
        blob,
        height,
        mimeType: 'image/webp',
        sizeBytes: blob.size,
        width,
      };
    }
  }

  throw new Error('이미지 용량을 줄일 수 없습니다. 다른 이미지를 선택하세요.');
};

export const uploadCommunityPostImage = async ({
  blob,
  draftId,
  imageId,
}: {
  blob: Blob;
  draftId: string;
  imageId: string;
}): Promise<UploadedCommunityImage> => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.access_token) {
    throw new Error('로그인이 필요합니다.');
  }

  const response = await fetch(getCommunityUploadEndpoint(), {
    body: blob,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': blob.type || 'image/webp',
      'X-Image-Id': imageId,
      'X-Post-Draft-Id': draftId,
    },
    method: 'PUT',
  });

  const body = (await response.json().catch(() => null)) as Partial<UploadedCommunityImage> & {
    error?: string;
    key?: string;
    publicUrl?: string;
  };

  if (!response.ok) {
    throw new Error(body?.error ?? '커뮤니티 이미지 업로드에 실패했습니다.');
  }

  const objectKey = body.objectKey ?? body.key;
  const imageUrl = body.imageUrl ?? body.publicUrl;

  if (!objectKey || !imageUrl) {
    throw new Error('업로드 응답을 확인할 수 없습니다.');
  }

  return {
    imageUrl,
    objectKey,
  };
};
