import { supabase } from '@/supabase/client';

const AVATAR_SIZE = 512;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const ALLOWED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface UploadAvatarResult {
  key: string;
  publicUrl: string;
}

const getAvatarUploadEndpoint = () => {
  const baseUrl = import.meta.env.VITE_AVATAR_UPLOAD_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('프로필 이미지 업로드 URL이 설정되지 않았습니다.');
  }

  return `${baseUrl}/avatars/upload`;
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

export const prepareAvatarImage = async (file: File) => {
  if (!ALLOWED_SOURCE_TYPES.has(file.type)) {
    throw new Error('JPG, PNG, WebP 이미지만 사용할 수 있습니다.');
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('원본 이미지는 8MB 이하만 사용할 수 있습니다.');
  }

  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('브라우저가 이미지 처리를 지원하지 않습니다.');
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );

  for (const quality of [0.86, 0.78, 0.68, 0.58]) {
    const blob = await blobFromCanvas(canvas, 'image/webp', quality);

    if (blob && blob.size <= MAX_OUTPUT_BYTES) {
      return blob;
    }
  }

  throw new Error('이미지 용량을 줄일 수 없습니다. 다른 이미지를 선택하세요.');
};

export const uploadAvatarImage = async (blob: Blob): Promise<UploadAvatarResult> => {
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

  const response = await fetch(getAvatarUploadEndpoint(), {
    body: blob,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': blob.type || 'image/webp',
    },
    method: 'PUT',
  });

  const body = (await response.json().catch(() => null)) as Partial<UploadAvatarResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body?.error ?? '프로필 이미지 업로드에 실패했습니다.');
  }

  if (!body?.publicUrl || !body.key) {
    throw new Error('업로드 응답을 확인할 수 없습니다.');
  }

  return {
    key: body.key,
    publicUrl: body.publicUrl,
  };
};
