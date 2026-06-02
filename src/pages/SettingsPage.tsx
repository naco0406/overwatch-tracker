import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  Database,
  Download,
  LogOut,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCreateMatch, useMatches } from '@/hooks/useMatches';
import {
  useCreatePlayerAccount,
  useDeletePlayerAccount,
  usePlayerAccounts,
  useRestorePlayerAccount,
  useUpdatePlayerAccount,
} from '@/hooks/usePlayerAccounts';
import { buildMatchesCsv, createCsvFileName, parseMatchesCsv } from '@/lib/matchCsv';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const SettingsPage = () => {
  const { signOut, user } = useAuth();
  const { data: playerAccounts = [] } = usePlayerAccounts();
  const { data: matches = [] } = useMatches();
  const createPlayerAccount = useCreatePlayerAccount();
  const createMatch = useCreateMatch();
  const updatePlayerAccount = useUpdatePlayerAccount();
  const deletePlayerAccount = useDeletePlayerAccount();
  const restorePlayerAccount = useRestorePlayerAccount();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [battleTag, setBattleTag] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingBattleTag, setEditingBattleTag] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const activeAccounts = playerAccounts.filter((account) => account.isActive);
  const inactiveAccounts = playerAccounts.filter((account) => !account.isActive);
  const isAccountMutating =
    createPlayerAccount.isPending ||
    updatePlayerAccount.isPending ||
    deletePlayerAccount.isPending ||
    restorePlayerAccount.isPending;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      toast({
        title: '로그아웃 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateAccount = async () => {
    const normalizedBattleTag = battleTag.trim();

    if (!normalizedBattleTag) {
      return;
    }

    try {
      await createPlayerAccount.mutateAsync({
        battleTag: normalizedBattleTag,
        displayName,
        isMain: activeAccounts.length === 0,
      });
      setBattleTag('');
      setDisplayName('');
      toast({
        title: '계정 추가 완료',
        description: '경기 입력에서 선택할 수 있습니다.',
      });
    } catch (error) {
      toast({
        title: '계정 추가 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const startEditAccount = (account: PlayerAccount) => {
    setEditingAccountId(account.id);
    setEditingBattleTag(account.battleTag);
    setEditingDisplayName(account.displayName);
  };

  const cancelEditAccount = () => {
    setEditingAccountId(null);
    setEditingBattleTag('');
    setEditingDisplayName('');
  };

  const handleSaveAccount = async (accountId: string) => {
    const normalizedBattleTag = editingBattleTag.trim();

    if (!normalizedBattleTag) {
      toast({
        title: '배틀태그를 입력하세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updatePlayerAccount.mutateAsync({
        battleTag: normalizedBattleTag,
        displayName: editingDisplayName.trim(),
        id: accountId,
      });
      cancelEditAccount();
      toast({ title: '계정 수정 완료' });
    } catch (error) {
      toast({
        title: '계정 수정 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleMain = async (account: PlayerAccount) => {
    try {
      await updatePlayerAccount.mutateAsync({ id: account.id, isMain: !account.isMain });
      toast({ title: account.isMain ? '본계 지정 해제 완료' : '본계 지정 완료' });
    } catch (error) {
      toast({
        title: '본계 변경 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    const targetAccount = activeAccounts.find((account) => account.id === accountId);

    try {
      await deletePlayerAccount.mutateAsync(accountId);
      toast({
        title: '계정 삭제 완료',
        description: targetAccount?.isMain ? '본계 지정도 함께 해제했습니다.' : undefined,
      });
    } catch (error) {
      toast({
        title: '계정 삭제 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleRestoreAccount = async (accountId: string) => {
    try {
      await restorePlayerAccount.mutateAsync({
        id: accountId,
        isMain: activeAccounts.length === 0,
      });
      toast({ title: '계정 복원 완료' });
    } catch (error) {
      toast({
        title: '계정 복원 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleExportCsv = () => {
    const csv = buildMatchesCsv(matches, playerAccounts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = createCsvFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast({
      title: 'CSV 내보내기 완료',
      description: `${matches.length.toLocaleString('ko-KR')}개 경기 기록을 저장했습니다.`,
    });
  };

  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: 'CSV 파일이 아닙니다.',
        description: '내보내기한 CSV 형식으로 가져올 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);

    try {
      const text = await file.text();
      const parsed = parseMatchesCsv(text, playerAccounts);

      if (parsed.matches.length === 0) {
        const firstIssue = parsed.issues[0];

        toast({
          title: '가져올 기록이 없습니다.',
          description: firstIssue ? `${firstIssue.row}행: ${firstIssue.message}` : undefined,
          variant: 'destructive',
        });
        return;
      }

      for (const match of parsed.matches) {
        await createMatch.mutateAsync(match);
      }

      toast({
        title: 'CSV 가져오기 완료',
        description:
          parsed.issues.length > 0
            ? `${parsed.matches.length.toLocaleString('ko-KR')}개 저장, ${parsed.issues.length.toLocaleString('ko-KR')}개 항목은 확인이 필요합니다.`
            : `${parsed.matches.length.toLocaleString('ko-KR')}개 경기 기록을 저장했습니다.`,
      });
    } catch (error) {
      toast({
        title: 'CSV 가져오기 실패',
        description: error instanceof Error ? error.message : '파일을 다시 확인하세요.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow="설정" title="설정" description="계정과 데이터 파일을 관리합니다." />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-4">
        <div className="workspace-panel overflow-hidden">
          <div className="flat-row grid gap-3 p-3.5 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4 sm:p-5">
            <SectionLead icon={ShieldCheck} label="계정" title="계정" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 rounded-md border border-border/70 bg-secondary p-3 sm:min-w-[320px]">
                <p className="metric-label">이메일</p>
                <p className="mt-1 truncate text-sm font-semibold">{user?.email}</p>
              </div>
              <Button variant="outline" className="bg-transparent" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                로그아웃
              </Button>
            </div>
          </div>

          <div className="flat-row grid gap-3 p-3.5 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4 sm:p-5">
            <SectionLead icon={UserRound} label="게임 계정" title="배틀태그" />
            <div className="space-y-4">
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_96px]">
                <Input
                  placeholder="BattleTag#1234"
                  value={battleTag}
                  onChange={(event) => setBattleTag(event.target.value)}
                />
                <Input
                  placeholder="표시명"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <Button
                  disabled={!battleTag.trim() || createPlayerAccount.isPending}
                  onClick={handleCreateAccount}
                >
                  <Plus className="h-4 w-4" />
                  추가
                </Button>
              </div>

              <div className="subpanel">
                {activeAccounts.length > 0 ? (
                  activeAccounts.map((account) => {
                    const editing = editingAccountId === account.id;

                    return (
                      <div
                        key={account.id}
                        className="flat-row grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        {editing ? (
                          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                            <Input
                              aria-label="배틀태그"
                              className="bg-card"
                              placeholder="BattleTag#1234"
                              value={editingBattleTag}
                              onChange={(event) => setEditingBattleTag(event.target.value)}
                            />
                            <Input
                              aria-label="표시명"
                              className="bg-card"
                              placeholder="표시명"
                              value={editingDisplayName}
                              onChange={(event) => setEditingDisplayName(event.target.value)}
                            />
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold">
                                {getPlayerAccountLabel(account)}
                              </p>
                              {account.isMain ? (
                                <Badge
                                  className="gap-1 bg-primary/10 text-primary"
                                  variant="outline"
                                >
                                  <Star className="h-3 w-3" />
                                  본계
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {account.battleTag}
                            </p>
                          </div>
                        )}

                        <div
                          className={
                            editing
                              ? 'grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end'
                              : 'grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end'
                          }
                        >
                          {editing ? (
                            <>
                              <Button
                                className="h-10 sm:h-9"
                                disabled={isAccountMutating || !editingBattleTag.trim()}
                                size="sm"
                                type="button"
                                onClick={() => handleSaveAccount(account.id)}
                              >
                                <Save className="h-4 w-4" />
                                저장
                              </Button>
                              <Button
                                className="h-10 bg-transparent sm:h-9"
                                disabled={isAccountMutating}
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={cancelEditAccount}
                              >
                                <X className="h-4 w-4" />
                                취소
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                className="h-10 bg-transparent sm:h-9"
                                disabled={isAccountMutating}
                                size="sm"
                                type="button"
                                variant={account.isMain ? 'secondary' : 'outline'}
                                onClick={() => handleToggleMain(account)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {account.isMain ? '본계 해제' : '본계'}
                              </Button>
                              <Button
                                className="h-10 bg-transparent sm:h-9"
                                disabled={isAccountMutating}
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => startEditAccount(account)}
                              >
                                <Pencil className="h-4 w-4" />
                                수정
                              </Button>
                              <Button
                                className="h-10 bg-transparent sm:h-9"
                                disabled={isAccountMutating}
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => handleDeleteAccount(account.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                                삭제
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    등록된 배틀태그가 없습니다.
                  </div>
                )}
              </div>

              {inactiveAccounts.length > 0 ? (
                <div className="subpanel">
                  <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] p-3">
                    <p className="metric-label">비활성 계정</p>
                  </div>
                  {inactiveAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flat-row grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {getPlayerAccountLabel(account)}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {account.battleTag}
                        </p>
                      </div>
                      <Button
                        className="h-10 bg-transparent sm:h-9"
                        disabled={restorePlayerAccount.isPending}
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestoreAccount(account.id)}
                      >
                        복원
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="workspace-panel overflow-hidden">
          <div className="section-header">
            <SectionLead icon={Database} label="데이터" title="파일" />
          </div>

          <div className="section-pad space-y-4">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              <div className="rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
                <p className="metric-label">저장 기록</p>
                <p className="mt-2 text-2xl font-bold">{matches.length.toLocaleString('ko-KR')}</p>
              </div>
              <div className="rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
                <p className="metric-label">파일 형식</p>
                <p className="mt-2 text-2xl font-bold">CSV</p>
              </div>
            </div>

            <div className="rounded-md border border-border/70 bg-card p-3">
              <p className="text-sm font-semibold">CSV 백업과 이전</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                현재 기록을 CSV로 저장하고, 같은 컬럼 구조의 CSV 파일을 다시 가져옵니다.
              </p>
            </div>

            <input
              ref={importInputRef}
              accept=".csv,text/csv"
              className="hidden"
              type="file"
              onChange={handleImportCsv}
            />

            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                disabled={isImporting || createMatch.isPending}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {isImporting ? '가져오는 중' : 'CSV 가져오기'}
              </Button>
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                disabled={matches.length === 0}
                onClick={handleExportCsv}
              >
                <Download className="h-4 w-4" />
                CSV 내보내기
              </Button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
};

interface SectionLeadProps {
  icon: LucideIcon;
  label: string;
  title: string;
}

const SectionLead = ({ icon: Icon, label, title }: SectionLeadProps) => (
  <div className="flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="metric-label">{label}</p>
      <h2 className="mt-1 text-lg font-bold">{title}</h2>
    </div>
  </div>
);

export { SettingsPage };
