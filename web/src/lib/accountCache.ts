import { queryClient } from './queryClientInstance';
import { purgeAccountStorage } from './accountStorage';

/**
 * Drop everything cached for the signed-in account: the TanStack Query cache
 * (server data of that account) and the account-scoped browser storage. Call it
 * on sign-out and when the signed-in account changes.
 */
export function purgeAccountCaches(): void {
  queryClient.clear();
  purgeAccountStorage();
}
