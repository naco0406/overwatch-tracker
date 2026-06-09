import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  ClipboardPaste,
  Database,
  Download,
  ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from 'react';
import { NavLink, useParams } from 'react-router-dom';

import { SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchRoleLabel } from '@/components/match/MatchRoleBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOwnProfile, useSaveOwnProfile } from '@/hooks/useCommunity';
import { prepareAvatarImage, uploadAvatarImage } from '@/lib/avatarUpload';
import { cn } from '@/lib/utils';
import { matchRoleOptions, queueOptions } from '@/data/matchOptions';
import { useCreateMatch, useMatches } from '@/hooks/useMatches';
import {
  useCreatePlayerAccount,
  useDeactivatePlayerAccount,
  usePermanentlyDeletePlayerAccount,
  usePlayerAccounts,
  useRestorePlayerAccount,
  useUpdatePlayerAccount,
} from '@/hooks/usePlayerAccounts';
import { useUpdateUserSettings, useUserSettings } from '@/hooks/useUserSettings';
import { buildMatchesCsv, createCsvFileName, parseMatchesCsv } from '@/lib/matchCsv';
import type { MatchRole, QueueType } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';

type SettingsSection = 'account' | 'battle-net' | 'data';

const settingsSectionMeta: Record<
  SettingsSection,
  {
    description: string;
    eyebrow: string;
    title: string;
  }
> = {
  account: {
    description: '로그인 정보, 커뮤니티 닉네임, 빠른 입력 기본값과 보안을 관리합니다.',
    eyebrow: '설정',
    title: '내 계정 설정',
  },
  'battle-net': {
    description: '빠른 기록과 통계 필터에 사용할 배틀넷 계정을 관리합니다.',
    eyebrow: '설정',
    title: '내 배틀넷 계정 설정',
  },
  data: {
    description: '경기 기록을 CSV나 스프레드시트 표로 가져오고 내보냅니다.',
    eyebrow: '설정',
    title: '데이터 가져오기/내보내기',
  },
};

const isSettingsSection = (value?: string): value is SettingsSection =>
  value === 'account' || value === 'battle-net' || value === 'data';

const SettingsPage = () => {
  const { section } = useParams<{ section?: string }>();
  const activeSection: SettingsSection = isSettingsSection(section) ? section : 'account';
  const meta = settingsSectionMeta[activeSection];
  const { deleteAccount, signOut, updatePassword, user } = useAuth();
  const { data: ownProfile, isLoading: isOwnProfileLoading } = useOwnProfile();
  const saveOwnProfile = useSaveOwnProfile();
  const { data: playerAccounts = [], isLoading: isAccountsLoading } = usePlayerAccounts();
  const { data: matches = [], isLoading: isMatchesLoading } = useMatches();
  const { data: userSettings, isLoading: isUserSettingsLoading } = useUserSettings();
  const createPlayerAccount = useCreatePlayerAccount();
  const createMatch = useCreateMatch();
  const updatePlayerAccount = useUpdatePlayerAccount();
  const deactivatePlayerAccount = useDeactivatePlayerAccount();
  const permanentlyDeletePlayerAccount = usePermanentlyDeletePlayerAccount();
  const restorePlayerAccount = useRestorePlayerAccount();
  const updateUserSettings = useUpdateUserSettings();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [battleTag, setBattleTag] = useState('');
  const [defaultPlayerAccountIdDraft, setDefaultPlayerAccountIdDraft] = useState<string | null>(
    null,
  );
  const [defaultQueueTypeDraft, setDefaultQueueTypeDraft] = useState<QueueType | null>(null);
  const [defaultMatchRoleDraft, setDefaultMatchRoleDraft] = useState<MatchRole | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingBattleTag, setEditingBattleTag] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isAvatarDragging, setIsAvatarDragging] = useState(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isNicknameDirty, setIsNicknameDirty] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [pasteDefaultAccountId, setPasteDefaultAccountId] = useState('auto');
  const [pasteImportOpen, setPasteImportOpen] = useState(false);
  const [pasteImportText, setPasteImportText] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNext, setPasswordNext] = useState('');
  const [deleteUserConfirmText, setDeleteUserConfirmText] = useState('');
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [permanentDeleteAccountId, setPermanentDeleteAccountId] = useState<string | null>(null);
  const activeAccounts = playerAccounts.filter((account) => account.isActive);
  const inactiveAccounts = playerAccounts.filter((account) => !account.isActive);
  const permanentDeleteAccount =
    playerAccounts.find((account) => account.id === permanentDeleteAccountId) ?? null;
  const isAccountMutating =
    createPlayerAccount.isPending ||
    updatePlayerAccount.isPending ||
    deactivatePlayerAccount.isPending ||
    permanentlyDeletePlayerAccount.isPending ||
    restorePlayerAccount.isPending;
  const canDeleteUser = deleteUserConfirmText.trim() === '회원탈퇴';
  const avatarUrlInput = avatarPreviewUrl ?? ownProfile?.avatarUrl ?? '';
  const nicknameInput = isNicknameDirty ? nicknameDraft : (ownProfile?.nickname ?? '');
  const savedDefaultPlayerAccountId = activeAccounts.some(
    (account) => account.id === userSettings?.defaultPlayerAccountId,
  )
    ? userSettings?.defaultPlayerAccountId
    : null;
  const savedDefaultPlayerAccountValue = savedDefaultPlayerAccountId ?? 'auto';
  const effectiveDefaultPlayerAccountId =
    defaultPlayerAccountIdDraft ?? savedDefaultPlayerAccountValue;
  const effectiveDefaultQueueType =
    defaultQueueTypeDraft ?? userSettings?.defaultQueueType ?? 'solo';
  const effectiveDefaultMatchRole =
    defaultMatchRoleDraft ?? userSettings?.defaultMatchRole ?? 'damage';
  const defaultSettingsDirty = Boolean(
    userSettings &&
    (!userSettings.createdAt ||
      effectiveDefaultPlayerAccountId !== savedDefaultPlayerAccountValue ||
      effectiveDefaultQueueType !== userSettings.defaultQueueType ||
      effectiveDefaultMatchRole !== userSettings.defaultMatchRole),
  );

  useEffect(
    () => () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    },
    [avatarPreviewUrl],
  );

  const getPasswordErrorDescription = (error: unknown) => {
    if (!(error instanceof Error)) {
      return '잠시 후 다시 시도하세요.';
    }

    const message = error.message.toLowerCase();

    if (
      message.includes('current') ||
      message.includes('invalid') ||
      message.includes('credential')
    ) {
      return '현재 비밀번호가 올바른지 확인하세요.';
    }

    if (message.includes('different') || message.includes('same')) {
      return '기존 비밀번호와 다른 새 비밀번호를 입력하세요.';
    }

    if (message.includes('weak') || message.includes('least') || message.includes('short')) {
      return '새 비밀번호가 보안 기준을 만족하는지 확인하세요.';
    }

    return error.message;
  };

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

  const handleSaveNickname = async () => {
    try {
      const savedProfile = await saveOwnProfile.mutateAsync({
        nickname: nicknameInput,
      });
      setNicknameDraft(savedProfile.nickname ?? '');
      setIsNicknameDirty(false);
      toast({ title: '프로필 저장 완료' });
    } catch (error) {
      toast({
        title: '프로필 저장 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const saveProfileWithAvatar = async (avatarUrl: string | null) => {
    const savedProfile = await saveOwnProfile.mutateAsync({
      avatarUrl,
      nickname: nicknameInput,
    });

    setNicknameDraft(savedProfile.nickname ?? '');
    setIsNicknameDirty(false);

    return savedProfile;
  };

  const uploadAvatarFile = async (file?: File) => {
    if (!file) {
      return;
    }

    if (!nicknameInput.trim()) {
      toast({
        title: '닉네임을 먼저 입력하세요.',
        description: '프로필 이미지는 닉네임과 함께 저장됩니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsAvatarUploading(true);
    setAvatarPreviewUrl(URL.createObjectURL(file));

    try {
      const blob = await prepareAvatarImage(file);
      const { publicUrl } = await uploadAvatarImage(blob);

      await saveProfileWithAvatar(publicUrl);
      setAvatarPreviewUrl(null);
      toast({
        title: '프로필 이미지 저장 완료',
        description: 'GNB와 커뮤니티 프로필에 반영됩니다.',
      });
    } catch (error) {
      setAvatarPreviewUrl(null);
      toast({
        title: '프로필 이미지 저장 실패',
        description: error instanceof Error ? error.message : '이미지를 다시 확인하세요.',
        variant: 'destructive',
      });
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    void uploadAvatarFile(file);
  };

  const handleAvatarDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsAvatarDragging(false);
    void uploadAvatarFile(event.dataTransfer.files?.[0]);
  };

  const handleRemoveAvatar = async () => {
    if (!nicknameInput.trim()) {
      toast({
        title: '닉네임을 먼저 입력하세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setAvatarPreviewUrl(null);
      await saveProfileWithAvatar(null);
      toast({ title: '프로필 이미지 제거 완료' });
    } catch (error) {
      toast({
        title: '프로필 이미지 제거 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordCurrent || !passwordNext || !passwordConfirm) {
      toast({
        title: '비밀번호를 모두 입력하세요.',
        variant: 'destructive',
      });
      return;
    }

    if (passwordNext.length < 8) {
      toast({
        title: '새 비밀번호가 너무 짧습니다.',
        description: '8자 이상으로 입력하세요.',
        variant: 'destructive',
      });
      return;
    }

    if (passwordNext !== passwordConfirm) {
      toast({
        title: '새 비밀번호가 일치하지 않습니다.',
        description: '확인 입력값을 다시 확인하세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updatePassword(passwordCurrent, passwordNext);
      setPasswordCurrent('');
      setPasswordNext('');
      setPasswordConfirm('');
      toast({
        title: '비밀번호 변경 완료',
        description: '다음 로그인부터 새 비밀번호를 사용합니다.',
      });
    } catch (error) {
      toast({
        title: '비밀번호 변경 실패',
        description: getPasswordErrorDescription(error),
        variant: 'destructive',
      });
    }
  };

  const handleSaveDefaultSettings = async () => {
    try {
      await updateUserSettings.mutateAsync({
        defaultMatchRole: effectiveDefaultMatchRole,
        defaultPlayerAccountId:
          effectiveDefaultPlayerAccountId === 'auto' ? null : effectiveDefaultPlayerAccountId,
        defaultQueueType: effectiveDefaultQueueType,
      });
      toast({
        title: '기본 입력값 저장 완료',
        description: '빠른 기록과 상세 입력의 기본값으로 사용합니다.',
      });
    } catch (error) {
      toast({
        title: '기본 입력값 저장 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUserAccount = async () => {
    if (!canDeleteUser) {
      toast({
        title: '확인 문구를 입력하세요.',
        description: '회원탈퇴를 정확히 입력해야 탈퇴할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsDeletingUser(true);

    try {
      await deleteAccount();
      setDeleteUserDialogOpen(false);
      setDeleteUserConfirmText('');
      toast({
        title: '회원탈퇴 완료',
        description: '계정과 저장된 데이터가 삭제되었습니다.',
      });
    } catch (error) {
      toast({
        title: '회원탈퇴 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingUser(false);
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

  const handleDeactivateAccount = async (accountId: string) => {
    const targetAccount = activeAccounts.find((account) => account.id === accountId);

    try {
      await deactivatePlayerAccount.mutateAsync(accountId);
      toast({
        title: '계정 비활성화 완료',
        description: targetAccount?.isMain ? '본계 지정도 함께 해제했습니다.' : undefined,
      });
    } catch (error) {
      toast({
        title: '계정 비활성화 실패',
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

  const handlePermanentlyDeleteAccount = async () => {
    if (!permanentDeleteAccountId) {
      return;
    }

    try {
      await permanentlyDeletePlayerAccount.mutateAsync(permanentDeleteAccountId);
      setPermanentDeleteAccountId(null);
      toast({
        title: '계정 영구 삭제 완료',
        description: '이 계정으로 연결된 기존 기록은 계정 미지정으로 남습니다.',
      });
    } catch (error) {
      toast({
        title: '계정 영구 삭제 실패',
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

  const resolvePasteDefaultAccount = () => {
    if (pasteDefaultAccountId === 'unassigned') {
      return null;
    }

    if (pasteDefaultAccountId !== 'auto') {
      return activeAccounts.find((account) => account.id === pasteDefaultAccountId) ?? null;
    }

    return activeAccounts.find((account) => account.isMain) ?? activeAccounts[0] ?? null;
  };

  const importMatchesFromText = async ({
    defaultAccount,
    label,
    text,
  }: {
    defaultAccount?: PlayerAccount | null;
    label: string;
    text: string;
  }) => {
    const parsed = parseMatchesCsv(text, playerAccounts);
    const importedMatches = parsed.matches.map((match) => {
      if (match.accountId || defaultAccount === undefined) {
        return match;
      }

      return {
        ...match,
        account: defaultAccount?.isMain === false ? ('sub' as const) : ('main' as const),
        accountId: defaultAccount?.id ?? null,
      };
    });

    if (importedMatches.length === 0) {
      const firstIssue = parsed.issues[0];

      toast({
        title: '가져올 기록이 없습니다.',
        description: firstIssue ? `${firstIssue.row}행: ${firstIssue.message}` : undefined,
        variant: 'destructive',
      });
      return false;
    }

    for (const match of importedMatches) {
      await createMatch.mutateAsync(match);
    }

    toast({
      title: `${label} 가져오기 완료`,
      description:
        parsed.issues.length > 0
          ? `${importedMatches.length.toLocaleString('ko-KR')}개 저장, ${parsed.issues.length.toLocaleString('ko-KR')}개 항목은 확인이 필요합니다.`
          : `${importedMatches.length.toLocaleString('ko-KR')}개 경기 기록을 저장했습니다.`,
    });
    return true;
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
      await importMatchesFromText({ label: 'CSV', text });
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

  const handleImportPastedRows = async () => {
    const text = pasteImportText.trim();

    if (!text) {
      toast({
        title: '붙여넣을 표가 없습니다.',
        description: '스프레드시트의 헤더와 행을 함께 붙여넣으세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);

    try {
      const imported = await importMatchesFromText({
        defaultAccount: resolvePasteDefaultAccount(),
        label: '표',
        text,
      });

      if (imported) {
        setPasteImportOpen(false);
        setPasteImportText('');
      }
    } catch (error) {
      toast({
        title: '표 가져오기 실패',
        description: error instanceof Error ? error.message : '입력한 표를 다시 확인하세요.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow={meta.eyebrow} title={meta.title} description={meta.description} />

      {activeSection === 'account' ? (
        <AccountSettingsSection
          activeAccounts={activeAccounts}
          avatarInputRef={avatarInputRef}
          avatarUrlInput={avatarUrlInput}
          defaultMatchRole={effectiveDefaultMatchRole}
          defaultPlayerAccountId={effectiveDefaultPlayerAccountId}
          defaultQueueType={effectiveDefaultQueueType}
          defaultSettingsDirty={defaultSettingsDirty}
          hasAvatar={Boolean(avatarUrlInput)}
          isAvatarDragging={isAvatarDragging}
          isAvatarUploading={isAvatarUploading}
          isDefaultSettingsLoading={isUserSettingsLoading || isAccountsLoading}
          isOwnProfileLoading={isOwnProfileLoading}
          isSavingDefaultSettings={updateUserSettings.isPending}
          isSavingNickname={saveOwnProfile.isPending}
          nickname={ownProfile?.nickname ?? null}
          nicknameInput={nicknameInput}
          passwordConfirm={passwordConfirm}
          passwordCurrent={passwordCurrent}
          passwordNext={passwordNext}
          userEmail={user?.email}
          onAvatarFileChange={handleAvatarFileChange}
          onAvatarDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsAvatarDragging(false);
            }
          }}
          onAvatarDragOver={(event) => {
            event.preventDefault();
            setIsAvatarDragging(true);
          }}
          onAvatarDrop={handleAvatarDrop}
          onAvatarPickerOpen={() => avatarInputRef.current?.click()}
          onAvatarRemove={handleRemoveAvatar}
          onDefaultMatchRoleChange={(value) => setDefaultMatchRoleDraft(value)}
          onDefaultPlayerAccountIdChange={(value) => setDefaultPlayerAccountIdDraft(value)}
          onDefaultQueueTypeChange={(value) => setDefaultQueueTypeDraft(value)}
          onDeleteUserDialogOpenChange={setDeleteUserDialogOpen}
          onNicknameInputChange={(value) => {
            setIsNicknameDirty(true);
            setNicknameDraft(value);
          }}
          onPasswordConfirmChange={setPasswordConfirm}
          onPasswordCurrentChange={setPasswordCurrent}
          onPasswordNextChange={setPasswordNext}
          onSaveDefaultSettings={handleSaveDefaultSettings}
          onSaveNickname={handleSaveNickname}
          onSignOut={handleSignOut}
          onUpdatePassword={handleUpdatePassword}
        />
      ) : null}

      {activeSection === 'battle-net' ? (
        <BattleNetSettingsSection
          activeAccounts={activeAccounts}
          battleTag={battleTag}
          displayName={displayName}
          editingAccountId={editingAccountId}
          editingBattleTag={editingBattleTag}
          editingDisplayName={editingDisplayName}
          inactiveAccounts={inactiveAccounts}
          isAccountMutating={isAccountMutating}
          isAccountsLoading={isAccountsLoading}
          isCreatingAccount={createPlayerAccount.isPending}
          isPermanentlyDeletingAccount={permanentlyDeletePlayerAccount.isPending}
          isRestoringAccount={restorePlayerAccount.isPending}
          onBattleTagChange={setBattleTag}
          onCancelEditAccount={cancelEditAccount}
          onCreateAccount={handleCreateAccount}
          onDeactivateAccount={handleDeactivateAccount}
          onDisplayNameChange={setDisplayName}
          onEditingBattleTagChange={setEditingBattleTag}
          onEditingDisplayNameChange={setEditingDisplayName}
          onPermanentlyDeleteAccountClick={setPermanentDeleteAccountId}
          onRestoreAccount={handleRestoreAccount}
          onSaveAccount={handleSaveAccount}
          onStartEditAccount={startEditAccount}
          onToggleMain={handleToggleMain}
        />
      ) : null}

      {activeSection === 'data' ? (
        <DataSettingsSection
          createMatchPending={createMatch.isPending}
          importInputRef={importInputRef}
          isAccountsLoading={isAccountsLoading}
          isImporting={isImporting}
          isMatchesLoading={isMatchesLoading}
          matchesCount={matches.length}
          onExportCsv={handleExportCsv}
          onImportCsv={handleImportCsv}
          onPasteImportOpen={() => setPasteImportOpen(true)}
        />
      ) : null}

      <PasteImportDialog
        activeAccounts={activeAccounts}
        isImporting={isImporting}
        open={pasteImportOpen}
        pasteDefaultAccountId={pasteDefaultAccountId}
        pasteImportText={pasteImportText}
        onImport={handleImportPastedRows}
        onOpenChange={setPasteImportOpen}
        onPasteDefaultAccountIdChange={setPasteDefaultAccountId}
        onPasteImportTextChange={setPasteImportText}
      />

      <DeleteUserDialog
        canDeleteUser={canDeleteUser}
        confirmText={deleteUserConfirmText}
        isDeletingUser={isDeletingUser}
        open={deleteUserDialogOpen}
        onConfirmTextChange={setDeleteUserConfirmText}
        onDelete={handleDeleteUserAccount}
        onOpenChange={setDeleteUserDialogOpen}
      />

      <PermanentDeletePlayerAccountDialog
        account={permanentDeleteAccount}
        isDeleting={permanentlyDeletePlayerAccount.isPending}
        open={Boolean(permanentDeleteAccountId)}
        onDelete={handlePermanentlyDeleteAccount}
        onOpenChange={(open) => {
          if (!open) setPermanentDeleteAccountId(null);
        }}
      />
    </div>
  );
};

interface AccountSettingsSectionProps {
  activeAccounts: PlayerAccount[];
  avatarInputRef: RefObject<HTMLInputElement>;
  avatarUrlInput: string;
  defaultMatchRole: MatchRole;
  defaultPlayerAccountId: string;
  defaultQueueType: QueueType;
  defaultSettingsDirty: boolean;
  hasAvatar: boolean;
  isAvatarDragging: boolean;
  isAvatarUploading: boolean;
  isDefaultSettingsLoading: boolean;
  isOwnProfileLoading: boolean;
  isSavingDefaultSettings: boolean;
  isSavingNickname: boolean;
  nickname: string | null;
  nicknameInput: string;
  passwordConfirm: string;
  passwordCurrent: string;
  passwordNext: string;
  userEmail?: string;
  onAvatarDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarPickerOpen: () => void;
  onAvatarRemove: () => void;
  onDefaultMatchRoleChange: (value: MatchRole) => void;
  onDefaultPlayerAccountIdChange: (value: string) => void;
  onDefaultQueueTypeChange: (value: QueueType) => void;
  onDeleteUserDialogOpenChange: (open: boolean) => void;
  onNicknameInputChange: (value: string) => void;
  onPasswordConfirmChange: (value: string) => void;
  onPasswordCurrentChange: (value: string) => void;
  onPasswordNextChange: (value: string) => void;
  onSaveDefaultSettings: () => void;
  onSaveNickname: () => void;
  onSignOut: () => void;
  onUpdatePassword: () => void;
}

const AccountSettingsSection = ({
  activeAccounts,
  avatarInputRef,
  avatarUrlInput,
  defaultMatchRole,
  defaultPlayerAccountId,
  defaultQueueType,
  defaultSettingsDirty,
  hasAvatar,
  isAvatarDragging,
  isAvatarUploading,
  isDefaultSettingsLoading,
  isOwnProfileLoading,
  isSavingDefaultSettings,
  isSavingNickname,
  nickname,
  nicknameInput,
  passwordConfirm,
  passwordCurrent,
  passwordNext,
  userEmail,
  onAvatarDragLeave,
  onAvatarDragOver,
  onAvatarDrop,
  onAvatarFileChange,
  onAvatarPickerOpen,
  onAvatarRemove,
  onDefaultMatchRoleChange,
  onDefaultPlayerAccountIdChange,
  onDefaultQueueTypeChange,
  onDeleteUserDialogOpenChange,
  onNicknameInputChange,
  onPasswordConfirmChange,
  onPasswordCurrentChange,
  onPasswordNextChange,
  onSaveDefaultSettings,
  onSaveNickname,
  onSignOut,
  onUpdatePassword,
}: AccountSettingsSectionProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header">
      <SectionLead icon={ShieldCheck} label="내 계정" title="로그인과 커뮤니티 프로필" />
    </div>
    <div className="divide-y divide-border/70">
      <div className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <div
          aria-label="프로필 이미지 업로드"
          className={cn(
            'grid content-start gap-4 transition-opacity',
            (isAvatarUploading || isSavingNickname) && 'pointer-events-none opacity-75',
          )}
          onDragLeave={onAvatarDragLeave}
          onDragOver={onAvatarDragOver}
          onDrop={onAvatarDrop}
        >
          <input
            ref={avatarInputRef}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            type="file"
            onChange={onAvatarFileChange}
          />
          <div className="flex items-end gap-4 lg:grid lg:justify-items-start lg:gap-3">
            <div className="relative">
              <Avatar
                className={cn(
                  'h-24 w-24 rounded-2xl border border-border/70 bg-card shadow-sm transition-[box-shadow,border-color]',
                  isAvatarDragging &&
                    'border-primary/70 shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]',
                )}
              >
                <AvatarImage alt={nickname ?? '프로필'} src={avatarUrlInput || undefined} />
                <AvatarFallback className="rounded-2xl bg-primary/10 text-3xl font-black text-primary">
                  {nickname ? (
                    nickname.trim().slice(0, 1).toUpperCase()
                  ) : (
                    <UserRound className="h-7 w-7" />
                  )}
                </AvatarFallback>
              </Avatar>
              {isAvatarUploading ? (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : null}
            </div>
            <div className="min-w-0 pb-1 lg:pb-0">
              <p className="flex items-center gap-2 text-sm font-black">
                <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                프로필 이미지
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                {isAvatarUploading ? '저장 중' : hasAvatar ? '설정됨' : '미설정'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:max-w-[240px]">
            <Button
              className="min-w-0 bg-transparent"
              disabled={isAvatarUploading || isSavingNickname}
              type="button"
              variant="outline"
              onClick={onAvatarPickerOpen}
            >
              {isAvatarUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {hasAvatar ? '교체' : '업로드'}
            </Button>
            <Button
              className="min-w-0 bg-transparent"
              disabled={!hasAvatar || isAvatarUploading || isSavingNickname}
              type="button"
              variant="outline"
              onClick={onAvatarRemove}
            >
              <Trash2 className="h-4 w-4" />
              제거
            </Button>
          </div>
        </div>

        <div className="grid content-start gap-5 lg:min-h-[168px]">
          <div className="min-w-0 border-b border-border/70 pb-4">
            <p className="metric-label">프로필</p>
            <h2 className="mt-1 truncate text-xl font-black">
              {isOwnProfileLoading ? '불러오는 중' : nicknameInput || '닉네임 미설정'}
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">{userEmail}</p>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="metric-label" htmlFor="community-display-nickname">
                닉네임
              </label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_104px] sm:items-center">
                <Input
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  id="community-display-nickname"
                  maxLength={20}
                  name="community_display_nickname"
                  placeholder="닉네임"
                  spellCheck={false}
                  value={nicknameInput}
                  onChange={(event) => onNicknameInputChange(event.target.value)}
                />
                <Button
                  className="min-w-0 whitespace-nowrap"
                  disabled={isAvatarUploading || isSavingNickname || !nicknameInput.trim()}
                  onClick={onSaveNickname}
                >
                  {isSavingNickname ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  저장
                </Button>
              </div>
            </div>

            <div className="grid border-y border-border/70 sm:grid-cols-2">
              <div className="min-w-0 border-b border-border/70 py-3 sm:border-b-0 sm:border-r sm:pr-4">
                <p className="metric-label">로그인 이메일</p>
                <p className="mt-1 truncate text-sm font-bold">{userEmail}</p>
              </div>
              <div className="min-w-0 py-3 sm:pl-4">
                <p className="metric-label">커뮤니티 표시</p>
                {isOwnProfileLoading ? (
                  <SkeletonBlock className="mt-2 h-5 w-28" />
                ) : (
                  <p className="mt-1 truncate text-sm font-bold">{nickname ?? '닉네임 미설정'}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button asChild variant="outline" className="min-w-0 justify-start bg-transparent">
                <NavLink to="/friends">
                  <UserRound className="h-4 w-4" />
                  친구
                </NavLink>
              </Button>
              <Button
                variant="outline"
                className="min-w-0 justify-start bg-transparent"
                onClick={onSignOut}
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </div>

      <QuickInputDefaultsPanel
        activeAccounts={activeAccounts}
        defaultMatchRole={defaultMatchRole}
        defaultPlayerAccountId={defaultPlayerAccountId}
        defaultQueueType={defaultQueueType}
        defaultSettingsDirty={defaultSettingsDirty}
        isLoading={isDefaultSettingsLoading}
        isSaving={isSavingDefaultSettings}
        onDefaultMatchRoleChange={onDefaultMatchRoleChange}
        onDefaultPlayerAccountIdChange={onDefaultPlayerAccountIdChange}
        onDefaultQueueTypeChange={onDefaultQueueTypeChange}
        onSave={onSaveDefaultSettings}
      />

      <div className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <div className="lg:min-h-[104px]">
          <p className="metric-label">보안</p>
          <h2 className="mt-1 text-base font-bold">비밀번호 변경</h2>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-muted-foreground">
            현재 비밀번호 확인 후 교체합니다.
          </p>
        </div>
        <div className="grid content-start gap-3.5 lg:min-h-[104px]">
          <input
            aria-hidden="true"
            autoComplete="username"
            className="pointer-events-none absolute h-0 w-0 opacity-0"
            name="account_email_autofill_anchor"
            readOnly
            tabIndex={-1}
            type="text"
            value={userEmail ?? ''}
          />
          <div className="grid gap-2 xl:grid-cols-3">
            <Input
              autoComplete="current-password"
              placeholder="현재 비밀번호"
              type="password"
              value={passwordCurrent}
              onChange={(event) => onPasswordCurrentChange(event.target.value)}
            />
            <Input
              autoComplete="new-password"
              placeholder="새 비밀번호"
              type="password"
              value={passwordNext}
              onChange={(event) => onPasswordNextChange(event.target.value)}
            />
            <Input
              autoComplete="new-password"
              placeholder="새 비밀번호 확인"
              type="password"
              value={passwordConfirm}
              onChange={(event) => onPasswordConfirmChange(event.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              className="w-full min-w-24 whitespace-nowrap sm:w-auto"
              disabled={!passwordCurrent || !passwordNext || !passwordConfirm}
              onClick={onUpdatePassword}
            >
              <KeyRound className="h-4 w-4" />
              변경
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 bg-destructive/5 px-4 py-5 sm:px-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center lg:gap-6">
        <div>
          <p className="metric-label text-destructive">위험 영역</p>
          <h2 className="mt-1 text-base font-bold">회원탈퇴</h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-muted-foreground sm:truncate">
            계정과 저장된 기록을 삭제합니다.
          </p>
          <Button
            className="w-full min-w-28 shrink-0 whitespace-nowrap border-destructive/30 bg-card text-destructive hover:text-destructive sm:w-auto"
            variant="outline"
            onClick={() => onDeleteUserDialogOpenChange(true)}
          >
            <Trash2 className="h-4 w-4" />
            회원탈퇴
          </Button>
        </div>
      </div>
    </div>
  </section>
);

interface QuickInputDefaultsPanelProps {
  activeAccounts: PlayerAccount[];
  defaultMatchRole: MatchRole;
  defaultPlayerAccountId: string;
  defaultQueueType: QueueType;
  defaultSettingsDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onDefaultMatchRoleChange: (value: MatchRole) => void;
  onDefaultPlayerAccountIdChange: (value: string) => void;
  onDefaultQueueTypeChange: (value: QueueType) => void;
  onSave: () => void;
}

const QuickInputDefaultsPanel = ({
  activeAccounts,
  defaultMatchRole,
  defaultPlayerAccountId,
  defaultQueueType,
  defaultSettingsDirty,
  isLoading,
  isSaving,
  onDefaultMatchRoleChange,
  onDefaultPlayerAccountIdChange,
  onDefaultQueueTypeChange,
  onSave,
}: QuickInputDefaultsPanelProps) => (
  <div className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
    <div>
      <p className="metric-label">빠른 입력</p>
      <h2 className="mt-1 text-base font-bold">기본값</h2>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-muted-foreground">
        새 경기 입력의 초기 계정, 큐, 포지션입니다.
      </p>
    </div>

    {isLoading ? (
      <div className="grid gap-3 sm:grid-cols-3">
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
      </div>
    ) : (
      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="metric-label mb-2">기본 계정</p>
            <Select
              value={defaultPlayerAccountId}
              disabled={isSaving}
              onValueChange={onDefaultPlayerAccountIdChange}
            >
              <SelectTrigger className="h-10 bg-card">
                <SelectValue placeholder="계정" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">본계 또는 첫 계정</SelectItem>
                {activeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {getPlayerAccountLabel(account)}
                    {account.isMain ? ' · 본계' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="metric-label mb-2">기본 큐</p>
            <div className="grid grid-cols-3 gap-1.5 min-[460px]:grid-cols-5 xl:grid-cols-5">
              {queueOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'h-9 rounded-md border px-2 text-xs font-bold transition-colors',
                    defaultQueueType === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                  )}
                  disabled={isSaving}
                  onClick={() => onDefaultQueueTypeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_112px] xl:items-end">
          <div>
            <p className="metric-label mb-2">기본 포지션</p>
            <div className="grid grid-cols-3 gap-1.5 sm:max-w-md">
              {matchRoleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'h-9 rounded-md border px-2 text-xs font-bold transition-colors',
                    defaultMatchRole === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                  )}
                  disabled={isSaving}
                  onClick={() => onDefaultMatchRoleChange(option.value)}
                >
                  <MatchRoleLabel className="justify-center" role={option.value} />
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full min-w-0 xl:w-auto"
            disabled={isSaving || !defaultSettingsDirty}
            type="button"
            onClick={onSave}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </Button>
        </div>
      </div>
    )}
  </div>
);

interface BattleNetSettingsSectionProps {
  activeAccounts: PlayerAccount[];
  battleTag: string;
  displayName: string;
  editingAccountId: string | null;
  editingBattleTag: string;
  editingDisplayName: string;
  inactiveAccounts: PlayerAccount[];
  isAccountMutating: boolean;
  isAccountsLoading: boolean;
  isCreatingAccount: boolean;
  isPermanentlyDeletingAccount: boolean;
  isRestoringAccount: boolean;
  onBattleTagChange: (value: string) => void;
  onCancelEditAccount: () => void;
  onCreateAccount: () => void;
  onDeactivateAccount: (accountId: string) => void;
  onDisplayNameChange: (value: string) => void;
  onEditingBattleTagChange: (value: string) => void;
  onEditingDisplayNameChange: (value: string) => void;
  onPermanentlyDeleteAccountClick: (accountId: string) => void;
  onRestoreAccount: (accountId: string) => void;
  onSaveAccount: (accountId: string) => void;
  onStartEditAccount: (account: PlayerAccount) => void;
  onToggleMain: (account: PlayerAccount) => void;
}

const BattleNetSettingsSection = ({
  activeAccounts,
  battleTag,
  displayName,
  editingAccountId,
  editingBattleTag,
  editingDisplayName,
  inactiveAccounts,
  isAccountMutating,
  isAccountsLoading,
  isCreatingAccount,
  isPermanentlyDeletingAccount,
  isRestoringAccount,
  onBattleTagChange,
  onCancelEditAccount,
  onCreateAccount,
  onDeactivateAccount,
  onDisplayNameChange,
  onEditingBattleTagChange,
  onEditingDisplayNameChange,
  onPermanentlyDeleteAccountClick,
  onRestoreAccount,
  onSaveAccount,
  onStartEditAccount,
  onToggleMain,
}: BattleNetSettingsSectionProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header">
      <SectionLead icon={UserRound} label="배틀넷" title="배틀태그 관리" />
    </div>
    <div className="section-pad space-y-5">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_96px]">
        <Input
          placeholder="BattleTag#1234"
          value={battleTag}
          onChange={(event) => onBattleTagChange(event.target.value)}
        />
        <Input
          placeholder="표시명"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
        />
        <Button disabled={!battleTag.trim() || isCreatingAccount} onClick={onCreateAccount}>
          <Plus className="h-4 w-4" />
          추가
        </Button>
      </div>

      <div className="subpanel">
        {isAccountsLoading ? (
          <AccountRowsSkeleton />
        ) : activeAccounts.length > 0 ? (
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
                      onChange={(event) => onEditingBattleTagChange(event.target.value)}
                    />
                    <Input
                      aria-label="표시명"
                      className="bg-card"
                      placeholder="표시명"
                      value={editingDisplayName}
                      onChange={(event) => onEditingDisplayNameChange(event.target.value)}
                    />
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold">{getPlayerAccountLabel(account)}</p>
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
                        onClick={() => onSaveAccount(account.id)}
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
                        onClick={onCancelEditAccount}
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
                        onClick={() => onToggleMain(account)}
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
                        onClick={() => onStartEditAccount(account)}
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
                        onClick={() => onDeactivateAccount(account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        비활성화
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-4 text-sm text-muted-foreground">등록된 배틀태그가 없습니다.</div>
        )}
      </div>

      {!isAccountsLoading && inactiveAccounts.length > 0 ? (
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
                <p className="truncate text-sm font-bold">{getPlayerAccountLabel(account)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{account.battleTag}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button
                  className="h-10 bg-transparent sm:h-9"
                  disabled={isRestoringAccount || isPermanentlyDeletingAccount}
                  size="sm"
                  variant="outline"
                  onClick={() => onRestoreAccount(account.id)}
                >
                  복원
                </Button>
                <Button
                  className="h-10 bg-transparent text-destructive hover:text-destructive sm:h-9"
                  disabled={isRestoringAccount || isPermanentlyDeletingAccount}
                  size="sm"
                  variant="outline"
                  onClick={() => onPermanentlyDeleteAccountClick(account.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  영구 삭제
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  </section>
);

interface DataSettingsSectionProps {
  createMatchPending: boolean;
  importInputRef: RefObject<HTMLInputElement>;
  isAccountsLoading: boolean;
  isImporting: boolean;
  isMatchesLoading: boolean;
  matchesCount: number;
  onExportCsv: () => void;
  onImportCsv: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasteImportOpen: () => void;
}

const DataSettingsSection = ({
  createMatchPending,
  importInputRef,
  isAccountsLoading,
  isImporting,
  isMatchesLoading,
  matchesCount,
  onExportCsv,
  onImportCsv,
  onPasteImportOpen,
}: DataSettingsSectionProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header">
      <SectionLead icon={Database} label="데이터" title="파일과 표 이전" />
    </div>
    <div className="divide-y divide-border/70">
      <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-5">
        <div>
          <p className="metric-label">요약</p>
          <h2 className="mt-1 text-base font-bold">현재 데이터</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="metric-label">저장 기록</p>
            {isMatchesLoading ? (
              <SkeletonBlock className="mt-3 h-7 w-16" />
            ) : (
              <p className="mt-2 text-2xl font-bold">{matchesCount.toLocaleString('ko-KR')}</p>
            )}
          </div>
          <div className="min-w-0">
            <p className="metric-label">지원 형식</p>
            <p className="mt-2 text-2xl font-bold">CSV / 표</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-5">
        <div>
          <p className="metric-label">이전</p>
          <h2 className="mt-1 text-base font-bold">가져오기/내보내기</h2>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-muted-foreground">
            맵, 결과, 계정은 ID 대신 이름으로 입력할 수 있습니다.
          </p>
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
          <p className="text-sm leading-6 text-muted-foreground">
            표 붙여넣기는 외부 스프레드시트 데이터를 이전할 때 가장 편한 방식입니다. CSV는 백업과
            재가져오기에 사용합니다.
          </p>
          <div className="grid gap-2">
            <input
              ref={importInputRef}
              accept=".csv,text/csv"
              className="hidden"
              type="file"
              onChange={onImportCsv}
            />
            <Button
              variant="outline"
              className="justify-start bg-card"
              disabled={isAccountsLoading || isImporting || createMatchPending}
              onClick={onPasteImportOpen}
            >
              <ClipboardPaste className="h-4 w-4" />표 붙여넣기
            </Button>
            <Button
              variant="outline"
              className="justify-start bg-card"
              disabled={isAccountsLoading || isImporting || createMatchPending}
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {isImporting ? '가져오는 중' : 'CSV 가져오기'}
            </Button>
            <Button
              variant="outline"
              className="justify-start bg-card"
              disabled={isMatchesLoading || matchesCount === 0}
              onClick={onExportCsv}
            >
              <Download className="h-4 w-4" />
              CSV 내보내기
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>
);

interface PasteImportDialogProps {
  activeAccounts: PlayerAccount[];
  isImporting: boolean;
  open: boolean;
  pasteDefaultAccountId: string;
  pasteImportText: string;
  onImport: () => void;
  onOpenChange: (open: boolean) => void;
  onPasteDefaultAccountIdChange: (value: string) => void;
  onPasteImportTextChange: (value: string) => void;
}

const PasteImportDialog = ({
  activeAccounts,
  isImporting,
  open,
  pasteDefaultAccountId,
  pasteImportText,
  onImport,
  onOpenChange,
  onPasteDefaultAccountIdChange,
  onPasteImportTextChange,
}: PasteImportDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 p-0 sm:h-[620px] sm:max-h-[calc(100dvh-3rem)]">
      <DialogHeader className="border-b border-border/70 px-4 py-4 pr-12 sm:px-5">
        <DialogTitle>표 붙여넣기</DialogTitle>
        <DialogDescription>
          스프레드시트에서 헤더와 행을 복사해 붙여넣습니다. ID 대신 이름을 사용할 수 있습니다.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <p className="metric-label mb-2">빈 계정 기본값</p>
            <Select value={pasteDefaultAccountId} onValueChange={onPasteDefaultAccountIdChange}>
              <SelectTrigger className="h-10 bg-card">
                <SelectValue placeholder="계정" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">본계 또는 첫 계정</SelectItem>
                <SelectItem value="unassigned">미지정</SelectItem>
                {activeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {getPlayerAccountLabel(account)}
                    {account.isMain ? ' · 본계' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
            <p className="text-xs font-bold text-foreground">권장 헤더</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
              시간, 맵, 우리, 상대, 결과, 큐, 포지션, 계정 순서로 붙여넣으면 됩니다. 결과, 큐,
              포지션은 비워도 점수와 기본값으로 보정됩니다.
            </p>
          </div>
        </div>

        <textarea
          className="min-h-[280px] w-full resize-none rounded-md border border-input bg-card p-3 font-mono text-sm leading-6 outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          placeholder={
            '시간\t맵\t우리\t상대\t결과\t큐\t포지션\t계정\n2026-06-02 22:10\t네팔\t2\t1\t승리\t솔로\t딜러\tLUXY\n2026-06-02 22:35\t오아시스\t0\t2\t패배\t솔로\t지원\tLUXY'
          }
          spellCheck={false}
          value={pasteImportText}
          onChange={(event) => onPasteImportTextChange(event.target.value)}
        />
      </div>

      <DialogFooter className="border-t border-border/70 px-4 py-4 sm:px-5">
        <Button
          type="button"
          variant="outline"
          className="bg-transparent"
          disabled={isImporting}
          onClick={() => onOpenChange(false)}
        >
          취소
        </Button>
        <Button type="button" disabled={isImporting || !pasteImportText.trim()} onClick={onImport}>
          <Upload className="h-4 w-4" />
          {isImporting ? '가져오는 중' : '가져오기'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

interface DeleteUserDialogProps {
  canDeleteUser: boolean;
  confirmText: string;
  isDeletingUser: boolean;
  open: boolean;
  onConfirmTextChange: (value: string) => void;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
}

const DeleteUserDialog = ({
  canDeleteUser,
  confirmText,
  isDeletingUser,
  open,
  onConfirmTextChange,
  onDelete,
  onOpenChange,
}: DeleteUserDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>회원탈퇴</DialogTitle>
        <DialogDescription className="sm:whitespace-nowrap">
          계정과 저장된 데이터를 삭제하고 닉네임은 다시 사용할 수 있게 됩니다.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-1">
        <div className="border-y border-border/70 py-3">
          <p className="metric-label text-destructive">삭제 대상</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
            로그인 계정, 경기 기록, 설정, 배틀태그, 친구 관계
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold text-muted-foreground">
            계속하려면 <span className="text-foreground">회원탈퇴</span>를 입력하세요.
          </p>
          <Input
            autoComplete="off"
            placeholder="회원탈퇴"
            value={confirmText}
            onChange={(event) => onConfirmTextChange(event.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="bg-transparent"
          disabled={isDeletingUser}
          onClick={() => onOpenChange(false)}
        >
          취소
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!canDeleteUser || isDeletingUser}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          {isDeletingUser ? '탈퇴 처리 중' : '탈퇴하기'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

interface PermanentDeletePlayerAccountDialogProps {
  account: PlayerAccount | null;
  isDeleting: boolean;
  open: boolean;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
}

const PermanentDeletePlayerAccountDialog = ({
  account,
  isDeleting,
  open,
  onDelete,
  onOpenChange,
}: PermanentDeletePlayerAccountDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-0 p-0 sm:max-w-md">
      <DialogHeader className="gap-3 border-b border-border/70 px-4 py-4 pr-14 sm:px-5 sm:py-5">
        <DialogTitle>배틀넷 계정 영구 삭제</DialogTitle>
        <DialogDescription>
          비활성 계정을 목록에서 완전히 삭제합니다. 기존 경기 기록은 삭제되지 않고 계정만 미지정으로
          바뀝니다.
        </DialogDescription>
      </DialogHeader>

      <div className="px-4 py-4 sm:px-5">
        <div className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3">
          <p className="metric-label text-destructive">삭제 대상</p>
          <p className="mt-1 truncate text-sm font-bold">
            {account ? getPlayerAccountLabel(account) : '선택된 계정 없음'}
          </p>
          {account?.battleTag ? (
            <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
              {account.battleTag}
            </p>
          ) : null}
        </div>
      </div>

      <DialogFooter className="border-t border-border/70 px-4 py-4 sm:px-5">
        <Button
          type="button"
          variant="outline"
          className="bg-transparent"
          disabled={isDeleting}
          onClick={() => onOpenChange(false)}
        >
          취소
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!account || isDeleting}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          {isDeleting ? '삭제 중' : '영구 삭제'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

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

const AccountRowsSkeleton = () => (
  <>
    {Array.from({ length: 3 }, (_, index) => (
      <div key={index} className="flat-row grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-4 w-32 max-w-full" />
            <SkeletonBlock className="h-6 w-12" />
          </div>
          <SkeletonBlock className="mt-2 h-3 w-40 max-w-full" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
          <SkeletonBlock className="h-10 sm:h-9 sm:w-20" />
          <SkeletonBlock className="h-10 sm:h-9 sm:w-16" />
          <SkeletonBlock className="h-10 sm:h-9 sm:w-16" />
        </div>
      </div>
    ))}
  </>
);

export { SettingsPage };
