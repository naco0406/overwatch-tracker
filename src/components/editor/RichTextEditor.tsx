import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { plainTextToRichTextHtml, sanitizeRichTextHtml } from '@/lib/richTextHtml';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  className?: string;
  disabled?: boolean;
  editorClassName?: string;
  minHeightClassName?: string;
  placeholder?: string;
  value: string;
  onChange: (html: string) => void;
}

const RichTextEditor = ({
  className,
  disabled = false,
  editorClassName,
  minHeightClassName = 'min-h-[260px]',
  onChange,
  placeholder = '내용을 입력하세요.',
  value,
}: RichTextEditorProps) => {
  const [, setRenderKey] = useState(0);
  const editor = useEditor({
    content: value || '<p></p>',
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn('px-4 py-3 focus:outline-none', minHeightClassName),
      },
      handlePaste(_view, event) {
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain');
        const sanitizedHtml = html
          ? sanitizeRichTextHtml(html)
          : plainTextToRichTextHtml(text ?? '');

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
      Placeholder.configure({ placeholder }),
    ],
    immediatelyRender: false,
    onUpdate({ editor: nextEditor }) {
      onChange(sanitizeRichTextHtml(nextEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || editor.isFocused) {
      return;
    }

    const sanitizedValue = sanitizeRichTextHtml(value || '<p></p>');

    if (sanitizeRichTextHtml(editor.getHTML()) !== sanitizedValue) {
      editor.commands.setContent(sanitizedValue || '<p></p>');
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const rerenderToolbar = () => setRenderKey((current) => current + 1);

    editor.on('selectionUpdate', rerenderToolbar);
    editor.on('transaction', rerenderToolbar);
    editor.on('update', rerenderToolbar);

    return () => {
      editor.off('selectionUpdate', rerenderToolbar);
      editor.off('transaction', rerenderToolbar);
      editor.off('update', rerenderToolbar);
    };
  }, [editor]);

  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-card', className)}>
      <RichTextToolbar disabled={disabled} editor={editor} />
      <EditorContent
        className={cn(
          'rich-text-editor border-t border-border text-sm font-semibold leading-6 text-foreground',
          '[&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ol]:my-2',
          '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ol]:list-decimal',
          '[&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:pl-5',
          '[&_.ProseMirror_li]:my-1 [&_.ProseMirror_u]:underline',
          '[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          editorClassName,
        )}
        editor={editor}
      />
    </div>
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

const RichTextToolbar = ({ disabled, editor }: { disabled: boolean; editor: Editor | null }) => (
  <div className="flex flex-wrap items-center gap-1 bg-[hsl(var(--surface-2))] px-2.5 py-2">
    <ToolbarButton
      active={editor?.isActive('bold')}
      disabled={disabled || !editor}
      icon={Bold}
      label="굵게"
      onClick={() => editor?.chain().focus().toggleBold().run()}
    />
    <ToolbarButton
      active={editor?.isActive('italic')}
      disabled={disabled || !editor}
      icon={Italic}
      label="기울임"
      onClick={() => editor?.chain().focus().toggleItalic().run()}
    />
    <ToolbarButton
      active={editor?.isActive('underline')}
      disabled={disabled || !editor}
      icon={UnderlineIcon}
      label="밑줄"
      onClick={() => editor?.chain().focus().toggleUnderline().run()}
    />
    <span className="mx-1 h-6 w-px bg-border" />
    <ToolbarButton
      active={editor?.isActive('bulletList')}
      disabled={disabled || !editor}
      icon={List}
      label="글머리 기호"
      onClick={() => editor?.chain().focus().toggleBulletList().run()}
    />
    <ToolbarButton
      active={editor?.isActive('orderedList')}
      disabled={disabled || !editor}
      icon={ListOrdered}
      label="번호 목록"
      onClick={() => editor?.chain().focus().toggleOrderedList().run()}
    />
    <span className="mx-1 h-6 w-px bg-border" />
    <ToolbarButton
      disabled={disabled || !editor || !editor.can().undo()}
      icon={Undo2}
      label="실행 취소"
      onClick={() => editor?.chain().focus().undo().run()}
    />
    <ToolbarButton
      disabled={disabled || !editor || !editor.can().redo()}
      icon={Redo2}
      label="다시 실행"
      onClick={() => editor?.chain().focus().redo().run()}
    />
  </div>
);

export { RichTextEditor };
