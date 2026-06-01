import { MatchEntryForm } from '@/components/input/MatchEntryForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Match, MatchCreateInput } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import type { UserSettings } from '@/types/userSettings';

interface ScreenshotContext {
  imageUrl: string;
  name: string;
}

interface MatchEntryDialogProps {
  accounts: PlayerAccount[];
  defaultSettings?: UserSettings;
  initialDraft?: Partial<MatchCreateInput>;
  isSubmitting?: boolean;
  match?: Match | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  onSubmit: (input: MatchCreateInput) => Promise<void>;
  open: boolean;
  screenshot?: ScreenshotContext | null;
  source?: MatchCreateInput['source'];
}

const MatchEntryDialog = ({
  accounts,
  defaultSettings,
  initialDraft,
  isSubmitting,
  match,
  onOpenChange,
  onSaved,
  onSubmit,
  open,
  screenshot,
  source,
}: MatchEntryDialogProps) => {
  const isEditing = Boolean(match);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-5xl gap-0 p-0 sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader className="border-b border-border/70 bg-card px-4 py-4 pr-14 sm:px-5 sm:py-5">
          <DialogTitle>{isEditing ? '경기 수정' : '경기 입력'}</DialogTitle>
          <DialogDescription>
            {isEditing ? '저장된 경기 정보' : '경기 결과와 플레이 정보'}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain p-4 sm:max-h-[calc(100dvh-9rem)] sm:p-5">
          {screenshot ? (
            <div className="mb-4 grid gap-3 rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="aspect-video overflow-hidden rounded-md bg-secondary">
                <img
                  alt={screenshot.name}
                  className="h-full w-full object-cover"
                  src={screenshot.imageUrl}
                />
              </div>
              <div className="min-w-0 self-center">
                <p className="metric-label">참고 이미지</p>
                <p className="mt-2 truncate text-sm font-bold">{screenshot.name}</p>
              </div>
            </div>
          ) : null}
          <MatchEntryForm
            key={match?.id ?? screenshot?.imageUrl ?? source ?? 'manual'}
            accounts={accounts}
            defaultSettings={defaultSettings}
            initialDraft={initialDraft}
            initialMatch={match ?? undefined}
            isSubmitting={isSubmitting}
            source={source ?? match?.source}
            submitLabel={isEditing ? '수정 저장' : '저장'}
            onSaved={onSaved}
            onSubmit={onSubmit}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { MatchEntryDialog };
