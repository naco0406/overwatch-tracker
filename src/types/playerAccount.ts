export interface PlayerAccount {
  battleTag: string;
  createdAt: string;
  deactivatedAt?: string | null;
  displayName: string;
  id: string;
  isActive: boolean;
  isMain: boolean;
  sortOrder: number;
  updatedAt: string;
  userId: string;
}

export interface PlayerAccountCreateInput {
  battleTag: string;
  displayName?: string;
  isMain?: boolean;
  sortOrder?: number;
}

export interface PlayerAccountUpdateInput {
  battleTag?: string;
  displayName?: string;
  id: string;
  isActive?: boolean;
  isMain?: boolean;
  sortOrder?: number;
}

export const getPlayerAccountLabel = (
  account?: Pick<PlayerAccount, 'battleTag' | 'displayName'>,
) => {
  if (!account) {
    return '미지정';
  }

  return account.displayName.trim() || account.battleTag;
};
