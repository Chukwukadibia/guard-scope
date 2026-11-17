import { issueApprovalLink } from '../../lib/api/changeOrders';
import { buildApprovalUrl } from '../../lib/domain/publicLink';

export type IssuedLink = { url: string; expiresAt: string };

/** Public base URL for shared links: VITE_APP_URL if set, else this site's origin. */
export function appBaseUrl(): string {
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  return configured || window.location.origin;
}

export async function issueLink(versionId: string): Promise<IssuedLink> {
  const { token, expiresAt } = await issueApprovalLink(versionId);
  return { url: buildApprovalUrl(appBaseUrl(), token), expiresAt };
}
