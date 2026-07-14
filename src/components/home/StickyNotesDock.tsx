import { Loader2, Pencil, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  useCreateStickyNote,
  useDeleteStickyNote,
  useStickyNotes,
  useUpdateStickyNote,
} from '@/hooks/useStickyNotes';
import { getStickyNoteText, sanitizeStickyNoteHtml } from '@/lib/stickyNoteHtml';
import { cn } from '@/lib/utils';
import type { StickyNote as StickyNoteItem, StickyNoteColor } from '@/types/stickyNote';

const stickyNotesPinnedStorageKey = 'overwatch-tracker:sticky-notes-pinned';
const StickyNoteEditorDialog = lazy(() =>
  import('@/components/home/StickyNoteEditorDialog').then((module) => ({
    default: module.StickyNoteEditorDialog,
  })),
);

const colorStyles: Record<
  StickyNoteColor,
  {
    active: string;
    card: string;
    stripe: string;
    swatch: string;
  }
> = {
  amber: {
    active: 'ring-2 ring-amber-500/60 ring-offset-2',
    card: 'border-border bg-card',
    stripe: 'bg-amber-400',
    swatch: 'bg-amber-400',
  },
  emerald: {
    active: 'ring-2 ring-emerald-500/60 ring-offset-2',
    card: 'border-border bg-card',
    stripe: 'bg-emerald-400',
    swatch: 'bg-emerald-400',
  },
  rose: {
    active: 'ring-2 ring-rose-500/60 ring-offset-2',
    card: 'border-border bg-card',
    stripe: 'bg-rose-400',
    swatch: 'bg-rose-400',
  },
  sky: {
    active: 'ring-2 ring-sky-500/60 ring-offset-2',
    card: 'border-border bg-card',
    stripe: 'bg-sky-400',
    swatch: 'bg-sky-400',
  },
  violet: {
    active: 'ring-2 ring-violet-500/60 ring-offset-2',
    card: 'border-border bg-card',
    stripe: 'bg-violet-400',
    swatch: 'bg-violet-400',
  },
};

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const getInitialPinnedState = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(stickyNotesPinnedStorageKey) === 'true';
};

interface StickyNotesDockProps {
  onDesktopOpenChange?: (isOpen: boolean) => void;
}

const StickyNotesDock = ({ onDesktopOpenChange }: StickyNotesDockProps) => {
  const [isHoverOpen, setIsHoverOpen] = useState(false);
  const [isTapOpen, setIsTapOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isPinned, setIsPinned] = useState(getInitialPinnedState);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<StickyNoteItem | null>(null);
  const { data: notes = [], isLoading } = useStickyNotes();
  const createNoteMutation = useCreateStickyNote();
  const updateNoteMutation = useUpdateStickyNote();
  const deleteNoteMutation = useDeleteStickyNote();
  const isPanelOpen = isPinned || isHoverOpen || isTapOpen || editorOpen;
  const isDesktopPanelOpen = isPinned || isHoverOpen || editorOpen;

  const sortedNotes = useMemo(
    () =>
      [...notes].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
      ),
    [notes],
  );

  const setPinned = (nextPinned: boolean) => {
    setIsPinned(nextPinned);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(stickyNotesPinnedStorageKey, String(nextPinned));
    }

    if (nextPinned) {
      setIsTapOpen(false);
    }
  };

  const handlePointerEnter = () => {
    if (!isDesktopViewport) {
      return;
    }

    setIsHoverOpen(true);
  };

  const handlePointerLeave = () => {
    if (!isDesktopViewport) {
      return;
    }

    setIsHoverOpen(false);
  };

  useEffect(() => {
    onDesktopOpenChange?.(isDesktopPanelOpen);
  }, [isDesktopPanelOpen, onDesktopOpenChange]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const query = window.matchMedia('(min-width: 1280px)');
    const updateViewportMode = () => {
      const nextIsDesktopViewport = query.matches;

      setIsDesktopViewport(nextIsDesktopViewport);

      if (nextIsDesktopViewport) {
        setIsTapOpen(false);
        return;
      }

      setIsHoverOpen(false);
    };

    updateViewportMode();
    query.addEventListener('change', updateViewportMode);

    return () => query.removeEventListener('change', updateViewportMode);
  }, []);

  const openEditor = (note: StickyNoteItem | null) => {
    setEditingNote(note);
    setEditorOpen(true);

    if (isDesktopViewport) {
      setIsHoverOpen(false);
      setIsTapOpen(false);
      return;
    }

    setIsTapOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingNote(null);

    if (isDesktopViewport) {
      setIsHoverOpen(false);
      setIsTapOpen(false);
    }
  };

  const openCreateEditor = () => openEditor(null);

  const openEditEditor = (note: StickyNoteItem) => openEditor(note);

  const handleSaveNote = async (html: string, color: StickyNoteColor) => {
    const sanitizedHtml = sanitizeStickyNoteHtml(html);

    if (!getStickyNoteText(sanitizedHtml)) {
      toast({
        description: '내용을 입력하세요.',
        title: '메모 저장 불가',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (editingNote) {
        await updateNoteMutation.mutateAsync({
          body: sanitizedHtml,
          color,
          id: editingNote.id,
        });
      } else {
        await createNoteMutation.mutateAsync({
          body: sanitizedHtml,
          color,
        });
      }

      closeEditor();
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '메모 저장 실패',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNoteMutation.mutate(noteId, {
      onError: (error) => {
        toast({
          description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
          title: '메모 삭제 실패',
          variant: 'destructive',
        });
      },
    });
  };

  const isSaving = createNoteMutation.isPending || updateNoteMutation.isPending;

  return (
    <>
      <aside
        className={cn(
          'fixed bottom-24 right-0 top-16 z-40 w-[calc(100vw-0.75rem)] max-w-[390px] transition-transform duration-300 ease-out sm:bottom-5 sm:top-20',
          'xl:bottom-6 xl:top-8',
          isPanelOpen ? 'translate-x-0' : 'translate-x-[calc(100%-2.5rem)]',
        )}
        onMouseEnter={handlePointerEnter}
        onMouseLeave={handlePointerLeave}
      >
        <div className="grid h-full grid-cols-[2.5rem_minmax(0,1fr)]">
          <button
            type="button"
            className={cn(
              'group flex h-full min-h-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isPanelOpen && 'text-foreground',
            )}
            aria-expanded={isPanelOpen}
            aria-label={isPanelOpen ? '메모 패널 닫기' : '메모 패널 열기'}
            onClick={() => {
              if (isDesktopViewport) {
                setPinned(!isPinned);
                return;
              }

              if (isPinned) {
                return;
              }

              setIsTapOpen((value) => !value);
            }}
          >
            <span
              className={cn(
                'flex min-h-24 w-8 flex-col items-center justify-center gap-2 rounded-l-[3px] border border-r-0 border-border bg-card transition-[background-color,border-color]',
                'group-hover:border-primary/30 group-hover:bg-secondary',
                isPanelOpen && 'border-primary/25 bg-secondary text-foreground',
              )}
            >
              <StickyNote className="h-4 w-4 shrink-0" />
              {notes.length > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded bg-primary px-1 text-[10px] font-black text-primary-foreground">
                  {notes.length}
                </span>
              ) : null}
              {isPinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </span>
          </button>

          <div
            aria-hidden={!isPanelOpen}
            className={cn(
              'flex min-w-0 flex-col overflow-hidden rounded-l-md border border-border bg-[hsl(216_38%_90%)] transition-[opacity,visibility,box-shadow] duration-150',
              isPanelOpen
                ? 'visible opacity-100 shadow-xl shadow-slate-950/10'
                : 'invisible pointer-events-none opacity-0 shadow-none',
            )}
          >
            <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3.5">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border bg-[hsl(var(--surface-2))] text-primary">
                  <StickyNote className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">메모 보드</p>
                  <p className="truncate text-[11px] font-semibold text-muted-foreground">
                    {isLoading
                      ? '불러오는 중'
                      : notes.length > 0
                        ? `${notes.length}개`
                        : '비어 있음'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="새 메모"
                  title="새 메모"
                  onClick={openCreateEditor}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={isPinned ? 'default' : 'ghost'}
                  size="icon"
                  className="h-9 w-9"
                  aria-label={isPinned ? '메모 패널 고정 해제' : '메모 패널 고정'}
                  title={isPinned ? '고정 해제' : '고정'}
                  onClick={() => setPinned(!isPinned)}
                >
                  {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[hsl(216_38%_90%)] p-3.5">
              {isLoading ? (
                <StickyNotesSkeleton />
              ) : sortedNotes.length > 0 ? (
                <div className="space-y-3">
                  {sortedNotes.map((note) => (
                    <StickyNoteCard
                      key={note.id}
                      isDeleting={deleteNoteMutation.isPending}
                      note={note}
                      onDelete={() => handleDeleteNote(note.id)}
                      onEdit={() => openEditEditor(note)}
                    />
                  ))}
                </div>
              ) : (
                <InlineEmptyState
                  action={
                    <Button type="button" size="sm" onClick={openCreateEditor}>
                      <Plus className="h-4 w-4" />
                      추가
                    </Button>
                  }
                  className="border-border bg-card"
                  title="메모 없음"
                />
              )}
            </div>
          </div>
        </div>
      </aside>

      {editorOpen ? (
        <Suspense fallback={null}>
          <StickyNoteEditorDialog
            key={editingNote?.id ?? 'new'}
            initialColor={editingNote?.color ?? 'amber'}
            initialHtml={sanitizeStickyNoteHtml(editingNote?.body ?? '')}
            isSaving={isSaving}
            mode={editingNote ? 'edit' : 'create'}
            open={editorOpen}
            onOpenChange={(open) => {
              if (open) {
                setEditorOpen(true);
                return;
              }

              closeEditor();
            }}
            onSave={handleSaveNote}
          />
        </Suspense>
      ) : null}
    </>
  );
};

const StickyNotesSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, index) => (
      <div key={index} className="rounded-sm border border-border bg-card p-3">
        <SkeletonBlock className="h-20 w-full" />
        <div className="mt-3 flex justify-between">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-8 w-8" />
        </div>
      </div>
    ))}
  </div>
);

interface StickyNoteCardProps {
  isDeleting: boolean;
  note: StickyNoteItem;
  onDelete: () => void;
  onEdit: () => void;
}

const StickyNoteCard = ({ isDeleting, note, onDelete, onEdit }: StickyNoteCardProps) => {
  const sanitizedHtml = sanitizeStickyNoteHtml(note.body);
  const noteText = getStickyNoteText(sanitizedHtml);

  return (
    <article
      className={cn(
        'group/note relative overflow-hidden rounded-sm border p-3 pt-4 shadow-sm shadow-slate-950/5 transition-colors hover:border-primary/25',
        colorStyles[note.color].card,
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1', colorStyles[note.color].stripe)} />
      <button
        type="button"
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        onClick={onEdit}
      >
        <div
          className={cn(
            'min-h-[96px] max-h-48 overflow-hidden text-sm font-semibold leading-6 text-foreground',
            '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:list-disc [&_ol]:list-decimal',
            '[&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_u]:underline',
          )}
          dangerouslySetInnerHTML={{
            __html: noteText ? sanitizedHtml : '<p class="text-muted-foreground">빈 메모</p>',
          }}
        />
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="truncate text-[11px] font-bold text-muted-foreground">
          수정 {formatUpdatedAt(note.updatedAt)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="메모 편집"
            title="메모 편집"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            disabled={isDeleting}
            aria-label="메모 삭제"
            title="메모 삭제"
            onClick={onDelete}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </article>
  );
};

export { StickyNotesDock };
