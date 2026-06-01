import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMapLabel, getResultLabel } from '@/data/matchOptions';
import type { Match } from '@/types/match';

interface MatchDeleteDialogProps {
  isDeleting?: boolean;
  match?: Match | null;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const formatPlayedAt = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));

const MatchDeleteDialog = ({
  isDeleting = false,
  match,
  onConfirm,
  onOpenChange,
  open,
}: MatchDeleteDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md p-0">
      <DialogHeader className="border-b border-border/70 px-4 py-4 pr-14 sm:px-5 sm:py-5">
        <DialogTitle>경기 삭제</DialogTitle>
        <DialogDescription>삭제한 경기는 통계와 세션에서 제외됩니다.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 p-4 sm:p-5">
        {match ? (
          <div className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3">
            <p className="text-sm font-bold">{getMapLabel(match.mapId)}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {formatPlayedAt(match.playedAt)} · {getResultLabel(match.result)} · {match.teamScore}:
              {match.enemyScore}
            </p>
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            {isDeleting ? '삭제 중' : '삭제'}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export { MatchDeleteDialog };
