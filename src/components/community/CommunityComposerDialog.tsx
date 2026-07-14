import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useCreateCommunityPost } from '@/hooks/useCommunityPosts';
import {
  prepareCommunityPostImage,
  uploadCommunityPostImage,
  type PreparedCommunityImage,
} from '@/lib/communityImageUpload';
import { getRichTextPlainText, sanitizeRichTextHtml } from '@/lib/richTextHtml';
import { cn } from '@/lib/utils';

const maxImages = 8;

type ComposerImageStatus = 'error' | 'ready' | 'uploading';

interface ComposerImage {
  error?: string;
  height?: number;
  id: string;
  imageUrl?: string;
  mimeType?: string;
  objectKey?: string;
  previewUrl: string;
  sizeBytes?: number;
  status: ComposerImageStatus;
  width?: number;
}

interface CommunityComposerDialogProps {
  avatarUrl?: string | null;
  nickname?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createId = () => crypto.randomUUID();
const getInitial = (value?: string | null) => value?.trim().slice(0, 1).toUpperCase() ?? '';

const CommunityComposerDialog = ({
  avatarUrl,
  nickname,
  onOpenChange,
  open,
}: CommunityComposerDialogProps) => {
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [draftId] = useState(createId);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const createPostMutation = useCreateCommunityPost();
  const hasUploadingImage = images.some((image) => image.status === 'uploading');
  const hasFailedImage = images.some((image) => image.status === 'error');
  const readyImages = images.filter(isReadyImage);
  const isSubmitting = createPostMutation.isPending;
  const selectedImageIndex = images.findIndex((image) => image.id === selectedImageId);
  const activeImageIndex = selectedImageIndex >= 0 ? selectedImageIndex : 0;
  const activeImage = images[activeImageIndex];
  const draftText = useMemo(() => getRichTextPlainText(sanitizeRichTextHtml(bodyHtml)), [bodyHtml]);
  const canSubmit =
    !isSubmitting &&
    !hasUploadingImage &&
    !hasFailedImage &&
    Boolean(draftText || readyImages.length > 0);

  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
    },
    [],
  );

  const close = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    onOpenChange(false);
  };

  const updateImage = (imageId: string, updater: (image: ComposerImage) => ComposerImage) => {
    setImages((current) => current.map((image) => (image.id === imageId ? updater(image) : image)));
  };

  const uploadImage = async (file: File, imageId: string) => {
    let preparedImage: PreparedCommunityImage;

    try {
      preparedImage = await prepareCommunityPostImage(file);
      const uploadedImage = await uploadCommunityPostImage({
        blob: preparedImage.blob,
        draftId,
        imageId,
      });

      updateImage(imageId, (image) => ({
        ...image,
        height: preparedImage.height,
        imageUrl: uploadedImage.imageUrl,
        mimeType: preparedImage.mimeType,
        objectKey: uploadedImage.objectKey,
        sizeBytes: preparedImage.sizeBytes,
        status: 'ready',
        width: preparedImage.width,
      }));
    } catch (error) {
      updateImage(imageId, (image) => ({
        ...image,
        error: error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.',
        status: 'error',
      }));
    }
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      return;
    }

    const remainingSlots = maxImages - images.length;
    const nextFiles = Array.from(fileList).slice(0, remainingSlots);

    if (nextFiles.length < fileList.length) {
      toast({
        description: `이미지는 최대 ${maxImages}장까지 첨부할 수 있습니다.`,
        title: '일부 이미지를 제외했습니다',
      });
    }

    const nextImages = nextFiles.map((file) => {
      const id = createId();
      const previewUrl = URL.createObjectURL(file);

      previewUrlsRef.current.push(previewUrl);

      return {
        id,
        previewUrl,
        status: 'uploading' as const,
      };
    });

    setImages((current) => [...current, ...nextImages]);
    if (!selectedImageId && nextImages[0]) {
      setSelectedImageId(nextImages[0].id);
    }

    nextFiles.forEach((file, index) => {
      void uploadImage(file, nextImages[index].id);
    });

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
  };

  const removeImage = (imageId: string) => {
    const targetIndex = images.findIndex((image) => image.id === imageId);
    const targetImage = images[targetIndex];

    if (targetImage) {
      URL.revokeObjectURL(targetImage.previewUrl);
      previewUrlsRef.current = previewUrlsRef.current.filter(
        (url) => url !== targetImage.previewUrl,
      );
    }

    const nextImages = images.filter((image) => image.id !== imageId);

    setImages(nextImages);

    if (selectedImageId === imageId) {
      setSelectedImageId(nextImages[Math.min(targetIndex, nextImages.length - 1)]?.id ?? null);
    }
  };

  const selectAdjacentImage = (offset: -1 | 1) => {
    if (!images.length) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(images.length - 1, activeImageIndex + offset));

    setSelectedImageId(images[nextIndex].id);
  };

  const submit = async () => {
    const sanitizedHtml = sanitizeRichTextHtml(bodyHtml);
    const bodyText = getRichTextPlainText(sanitizedHtml);

    if (!bodyText && readyImages.length === 0) {
      toast({
        description: '본문이나 이미지를 추가하세요.',
        title: '게시할 수 없습니다',
        variant: 'destructive',
      });
      return;
    }

    if (hasUploadingImage || hasFailedImage) {
      toast({
        description: '이미지 업로드 상태를 확인하세요.',
        title: '게시할 수 없습니다',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createPostMutation.mutateAsync({
        bodyHtml: sanitizedHtml,
        bodyText,
        images: readyImages.map((image, sortOrder) => ({
          height: image.height,
          imageUrl: image.imageUrl,
          mimeType: image.mimeType,
          objectKey: image.objectKey,
          sizeBytes: image.sizeBytes,
          sortOrder,
          width: image.width,
        })),
      });

      toast({ title: '게시글을 올렸습니다' });
      close();
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '게시 실패',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) {
          return;
        }

        if (nextOpen) {
          onOpenChange(true);
          return;
        }

        close();
      }}
    >
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-5xl flex-col gap-0 p-0 sm:h-[760px] sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader className="border-b border-border bg-card px-4 py-4 pr-14 text-center sm:px-5">
          <DialogTitle>새 게시글</DialogTitle>
          <DialogDescription className="sr-only">
            친구들에게 공유할 게시글 본문과 이미지를 작성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 bg-card lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
          <div className="min-h-[300px] border-b border-border bg-white lg:min-h-0 lg:border-b-0 lg:border-r">
            {activeImage ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="relative flex min-h-0 flex-1 items-center justify-center">
                  <img
                    key={activeImage.id}
                    alt=""
                    className={cn(
                      'max-h-full max-w-full select-none object-contain',
                      activeImage.status !== 'ready' && 'opacity-60',
                    )}
                    draggable={false}
                    src={activeImage.previewUrl}
                  />
                  {images.length > 1 ? (
                    <div className="absolute right-3 top-3 rounded-full bg-slate-950/65 px-2.5 py-1 text-xs font-bold text-white">
                      {activeImageIndex + 1}/{images.length}
                    </div>
                  ) : null}
                  {activeImageIndex > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-card/92 shadow-sm"
                      disabled={isSubmitting}
                      aria-label="이전 이미지"
                      title="이전 이미지"
                      onClick={() => selectAdjacentImage(-1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {activeImageIndex < images.length - 1 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-card/92 shadow-sm"
                      disabled={isSubmitting}
                      aria-label="다음 이미지"
                      title="다음 이미지"
                      onClick={() => selectAdjacentImage(1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {activeImage.status === 'uploading' ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/45">
                      <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    </div>
                  ) : null}
                  {activeImage.status === 'error' ? (
                    <div className="absolute inset-x-4 bottom-4 rounded-md bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground">
                      {activeImage.error}
                    </div>
                  ) : null}
                </div>
                <div className="mobile-scroll flex gap-2 overflow-x-auto border-t border-border bg-card/95 p-3">
                  {images.map((image) => (
                    <div
                      key={image.id}
                      className={cn(
                        'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white transition-[border-color,box-shadow]',
                        image.id === activeImage.id
                          ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.22)]'
                          : 'border-border',
                      )}
                    >
                      <button
                        type="button"
                        className="block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                        aria-label="이미지 선택"
                        onClick={() => setSelectedImageId(image.id)}
                      >
                        <img
                          alt=""
                          className={cn(
                            'h-full w-full object-cover',
                            image.status !== 'ready' && 'opacity-50',
                          )}
                          src={image.previewUrl}
                        />
                      </button>
                      <button
                        type="button"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="이미지 제거"
                        disabled={isSubmitting}
                        onClick={() => removeImage(image.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      {image.status === 'uploading' ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/55">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      ) : null}
                      {image.status === 'error' ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-destructive/80 text-white">
                          <XCircle className="h-4 w-4" />
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {images.length < maxImages ? (
                    <button
                      type="button"
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-[hsl(var(--surface-2))] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      disabled={isSubmitting}
                      aria-label="이미지 추가"
                      onClick={() => inputRef.current?.click()}
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-3 text-foreground transition-colors hover:bg-background/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                disabled={isSubmitting}
                onClick={() => inputRef.current?.click()}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card/90 shadow-sm">
                  <ImagePlus className="h-7 w-7" />
                </span>
                <span className="text-sm font-bold">이미지 선택</span>
              </button>
            )}
            <input
              ref={inputRef}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              multiple
              type="file"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Avatar className="h-10 w-10">
                <AvatarImage alt={nickname ?? '내 프로필'} src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-sm font-black text-primary">
                  {getInitial(nickname)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{nickname}</p>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                  {images.length}/{maxImages}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
              <RichTextEditor
                className="border-0 shadow-none"
                disabled={isSubmitting}
                editorClassName="border-t-0"
                minHeightClassName="min-h-[320px]"
                placeholder="문구 입력..."
                value={bodyHtml}
                onChange={setBodyHtml}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-border bg-card px-4 py-3 sm:px-5">
          <p className="min-w-0 truncate text-xs font-semibold text-muted-foreground">
            {hasUploadingImage
              ? '이미지 업로드 중'
              : hasFailedImage
                ? '실패한 이미지가 있습니다'
                : images.length > 0
                  ? `${readyImages.length}장 선택됨`
                  : '이미지 없이 게시 가능'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={isSubmitting}
              onClick={close}
            >
              취소
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              게시
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const isReadyImage = (
  image: ComposerImage,
): image is ComposerImage &
  Required<
    Pick<ComposerImage, 'height' | 'imageUrl' | 'mimeType' | 'objectKey' | 'sizeBytes' | 'width'>
  > =>
  image.status === 'ready' &&
  Boolean(
    image.height &&
    image.imageUrl &&
    image.mimeType &&
    image.objectKey &&
    image.sizeBytes &&
    image.width,
  );

export { CommunityComposerDialog };
