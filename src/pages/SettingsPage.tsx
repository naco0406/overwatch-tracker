import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  BookOpenCheck,
  Database,
  Download,
  ExternalLink,
  LogOut,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  useCreatePlayerAccount,
  useDeletePlayerAccount,
  usePlayerAccounts,
  useRestorePlayerAccount,
  useUpdatePlayerAccount,
} from '@/hooks/usePlayerAccounts';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const SettingsPage = () => {
  const { signOut, user } = useAuth();
  const { data: playerAccounts = [] } = usePlayerAccounts();
  const createPlayerAccount = useCreatePlayerAccount();
  const updatePlayerAccount = useUpdatePlayerAccount();
  const deletePlayerAccount = useDeletePlayerAccount();
  const restorePlayerAccount = useRestorePlayerAccount();
  const [battleTag, setBattleTag] = useState('');
  const [displayName, setDisplayName] = useState('');
  const activeAccounts = playerAccounts.filter((account) => account.isActive);
  const inactiveAccounts = playerAccounts.filter((account) => !account.isActive);

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

  const handleSetMain = async (accountId: string) => {
    try {
      await updatePlayerAccount.mutateAsync({ id: accountId, isMain: true });
      toast({ title: '본계 변경 완료' });
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
    const replacementExists = activeAccounts.some((account) => account.id !== accountId);

    try {
      await deletePlayerAccount.mutateAsync(accountId);
      toast({
        title: '계정 삭제 완료',
        description:
          targetAccount?.isMain && replacementExists
            ? '남은 계정 중 하나를 본계로 지정했습니다.'
            : undefined,
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader eyebrow="설정" title="설정" />

      <section className="workspace-panel overflow-hidden">
        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={ShieldCheck} label="계정" title="계정" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 rounded-md border border-border bg-secondary p-3 sm:min-w-[320px]">
              <p className="metric-label">이메일</p>
              <p className="mt-1 truncate text-sm font-semibold">{user?.email}</p>
            </div>
            <Button variant="outline" className="bg-transparent" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </div>

        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
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

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {activeAccounts.length > 0 ? (
                activeAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flat-row grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold">
                          {getPlayerAccountLabel(account)}
                        </p>
                        {account.isMain ? (
                          <Badge className="gap-1 bg-primary/10 text-primary" variant="outline">
                            <Star className="h-3 w-3" />
                            본계
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {account.battleTag}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="bg-transparent"
                        disabled={account.isMain || updatePlayerAccount.isPending}
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetMain(account.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        본계
                      </Button>
                      <Button
                        className="bg-transparent"
                        disabled={deletePlayerAccount.isPending}
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteAccount(account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        삭제
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-muted-foreground">등록된 배틀태그가 없습니다.</div>
              )}
            </div>

            {inactiveAccounts.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border bg-[hsl(var(--surface-2))] p-3">
                  <p className="metric-label">비활성 계정</p>
                </div>
                {inactiveAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flat-row grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{getPlayerAccountLabel(account)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {account.battleTag}
                      </p>
                    </div>
                    <Button
                      className="bg-transparent"
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

        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={BookOpenCheck} label="마스터 데이터" title="열람" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              영웅 초상화, 전장 이미지, 역할/모드 아이콘을 정적 asset으로 열람합니다.
            </p>
            <Button asChild variant="outline" className="bg-transparent sm:w-auto">
              <Link to="/master-data">
                <ExternalLink className="h-4 w-4" />
                열기
              </Link>
            </Button>
          </div>
        </div>

        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={CheckCircle2} label="이미지 분석" title="파이프라인" />
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              { label: '영역', value: 'UI 탐지' },
              { label: 'OCR', value: '텍스트' },
              { label: '전장', value: '이미지 매칭' },
              { label: '영웅', value: '내 행' },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-border bg-card p-3">
                <p className="metric-label">{item.label}</p>
                <p className="mt-2 text-sm font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={Database} label="데이터" title="데이터" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="bg-transparent" disabled>
              <Upload className="h-4 w-4" />
              가져오기
            </Button>
            <Button variant="outline" className="bg-transparent" disabled>
              <Download className="h-4 w-4" />
              내보내기
            </Button>
          </div>
        </div>
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
