import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Redo2,
  Save,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { plainTextToStickyNoteHtml, sanitizeStickyNoteHtml } from '@/lib/stickyNoteHtml';
import { cn } from '@/lib/utils';
import type { StickyNoteColor } from '@/types/stickyNote';

const stickyNoteColors: StickyNoteColor[] = ['amber', 'sky', 'emerald', 'rose', 'violet'];

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

export interface StickyNoteEditorDialogProps {
  initialColor: StickyNoteColor;
  initialHtml: string;
  isSaving: boolean;
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (html: string, color: StickyNoteColor) => Promise<void>;
}

const StickyNoteEditorDialog = ({
  initialColor,
  initialHtml,
  isSaving,
  mode,
  open,
  onOpenChange,
  onSave,
}: StickyNoteEditorDialogProps) => {
  const [color, setColor] = useState<StickyNoteColor>(initialColor);
  const [, setEditorRenderKey] = useState(0);
  const editor = useEditor({
    content: initialHtml || '<p></p>',
    editorProps: {
      attributes: {
        class: 'min-h-[320px] px-4 py-3 focus:outline-none',
      },
      handlePaste(_view, event) {
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain');
        const sanitizedHtml = html
          ? sanitizeStickyNoteHtml(html)
          : plainTextToStickyNoteHtml(text ?? '');

        if (!sanitizedHtml) {
          return false;
        }

        event.preventDefault();
        editor?.chain().focus().insertContent(sanitizedHtml).run();
        return true;
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: '메모를 입력하세요.',
      }),
    ],
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const rerenderToolbar = () => setEditorRenderKey((value) => value + 1);

    editor.on('selectionUpdate', rerenderToolbar);
    editor.on('transaction', rerenderToolbar);
    editor.on('update', rerenderToolbar);

    return () => {
      editor.off('selectionUpdate', rerenderToolbar);
      editor.off('transaction', rerenderToolbar);
      editor.off('update', rerenderToolbar);
    };
  }, [editor]);

  const save = async () => {
    if (!editor) {
      return;
    }

    await onSave(editor.getHTML(), color);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 p-0 sm:h-[680px] sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader className="border-b border-border bg-card px-4 py-4 pr-14 sm:px-5">
          <DialogTitle>{mode === 'edit' ? '메모 편집' : '새 메모'}</DialogTitle>
          <DialogDescription className="sr-only">
            리치텍스트 메모 내용을 작성하고 저장합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border bg-[hsl(var(--surface-2))] px-3.5 py-2">
          <RichEditorToolbar editor={editor} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[hsl(216_38%_90%)] p-3.5">
          <div
            className={cn(
              'relative min-h-full overflow-hidden rounded-sm border bg-card',
              colorStyles[color].card,
            )}
          >
            <div className={cn('absolute inset-x-0 top-0 h-1', colorStyles[color].stripe)} />
            <EditorContent
              className={cn(
                'sticky-note-editor pt-1 text-sm font-semibold leading-6 text-foreground',
                '[&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ol]:my-2',
                '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ol]:list-decimal',
                '[&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:pl-5',
                '[&_.ProseMirror_li]:my-1 [&_.ProseMirror_u]:underline',
                '[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
              )}
              editor={editor}
            />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-border bg-card px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1.5">
            {stickyNoteColors.map((noteColor) => (
              <button
                key={noteColor}
                type="button"
                className={cn(
                  'h-6 w-6 rounded-sm border border-black/10 transition-transform hover:scale-105',
                  colorStyles[noteColor].swatch,
                  color === noteColor && colorStyles[noteColor].active,
                )}
                aria-label={`${noteColor} 메모 색상`}
                onClick={() => setColor(noteColor)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="button" disabled={isSaving || !editor} onClick={() => void save()}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  icon: typeof Bold;
  label: string;
  onClick: () => void;
}

const ToolbarButton = ({
  active = false,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: ToolbarButtonProps) => (
  <button
    type="button"
    className={cn(
      'flex h-9 w-9 items-center justify-center rounded-sm border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-40',
      active && 'border-primary/30 bg-primary/10 text-primary',
    )}
    disabled={disabled}
    title={label}
    aria-label={label}
    onClick={onClick}
  >
    <Icon className="h-4 w-4" />
  </button>
);

const RichEditorToolbar = ({ editor }: { editor: Editor | null }) => {
  const canUndo = editor?.can().undo() ?? false;
  const canRedo = editor?.can().redo() ?? false;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolbarButton
        active={editor?.isActive('bold')}
        disabled={!editor}
        icon={Bold}
        label="굵게"
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        active={editor?.isActive('italic')}
        disabled={!editor}
        icon={Italic}
        label="기울임"
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        active={editor?.isActive('underline')}
        disabled={!editor}
        icon={UnderlineIcon}
        label="밑줄"
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        active={editor?.isActive('bulletList')}
        disabled={!editor}
        icon={List}
        label="글머리 기호"
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        active={editor?.isActive('orderedList')}
        disabled={!editor}
        icon={ListOrdered}
        label="번호 목록"
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        disabled={!canUndo}
        icon={Undo2}
        label="실행 취소"
        onClick={() => editor?.chain().focus().undo().run()}
      />
      <ToolbarButton
        disabled={!canRedo}
        icon={Redo2}
        label="다시 실행"
        onClick={() => editor?.chain().focus().redo().run()}
      />
    </div>
  );
};

export { StickyNoteEditorDialog };
