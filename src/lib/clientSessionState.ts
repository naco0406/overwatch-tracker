export const activeSessionStorageKey = 'overwatch-tracker:active-session-id';
export const quickMatchEntryPreferenceStorageKey =
  'overwatch-tracker:quick-match-entry-preferences';

export const clearUserScopedClientState = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(activeSessionStorageKey);
  } catch {
    // Storage cleanup should never block auth transitions.
  }

  try {
    window.sessionStorage.removeItem(quickMatchEntryPreferenceStorageKey);
  } catch {
    // Storage cleanup should never block auth transitions.
  }
};
