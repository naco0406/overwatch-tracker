import { ImagePlus, Loader2, Send, Trash2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { RichTextEditor } from '@/components/editor/RichTextEditor';
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createId = () => crypto.randomUUID();

const CommunityComposerDialog = ({ onOpenChange, open }: CommunityComposerDialogProps) => {
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [draftId] = useState(createId);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const createPostMutation = useCreateCommunityPost();
  const hasUploadingImage = images.some((image) => image.status === 'uploading');
  const hasFailedImage = images.some((image) => image.status === 'error');
  const readyImages = images.filter(isReadyImage);
  const isSubmitting = createPostMutation.isPending;

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
    setImages((current) => {
      const targetImage = current.find((image) => image.id === imageId);

      if (targetImage) {
        URL.revokeObjectURL(targetImage.previewUrl);
        previewUrlsRef.current = previewUrlsRef.current.filter(
          (url) => url !== targetImage.previewUrl,
        );
      }

      return current.filter((image) => image.id !== imageId);
    });
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
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 p-0 sm:h-[760px] sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader className="border-b border-border bg-card px-4 py-4 pr-14 sm:px-5">
          <DialogTitle>새 게시글</DialogTitle>
          <DialogDescription className="sr-only">
            친구들에게 공유할 게시글 본문과 이미지를 작성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--surface-2))] p-3.5 sm:p-5">
          <RichTextEditor
            disabled={isSubmitting}
            minHeightClassName="min-h-[240px]"
            placeholder="친구들에게 공유할 내용을 입력하세요."
            value={bodyHtml}
            onChange={setBodyHtml}
          />

          <div className="mt-4 rounded-md border border-border bg-card p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black">이미지</p>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                  {images.length}/{maxImages}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                disabled={isSubmitting || images.length >= maxImages}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                추가
              </Button>
              <input
                ref={inputRef}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                multiple
                type="file"
                onChange={handleFileChange}
              />
            </div>

            {images.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className="relative overflow-hidden rounded-md border border-border bg-[hsl(var(--surface-2))]"
                  >
                    <div className="aspect-square">
                      <img
                        alt=""
                        className={cn(
                          'h-full w-full object-cover',
                          image.status !== 'ready' && 'opacity-55',
                        )}
                        src={image.previewUrl}
                      />
                    </div>
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-card/95 text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                      aria-label="이미지 제거"
                      disabled={isSubmitting}
                      onClick={() => removeImage(image.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {image.status === 'uploading' ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/24">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    ) : null}
                    {image.status === 'error' ? (
                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-destructive px-2 py-1 text-[10px] font-bold text-destructive-foreground">
                        <XCircle className="h-3 w-3 shrink-0" />
                        <span className="truncate">{image.error}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-end border-t border-border bg-card px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className="bg-transparent"
            disabled={isSubmitting}
            onClick={close}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || hasUploadingImage || hasFailedImage}
            onClick={() => void submit()}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            게시
          </Button>
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
