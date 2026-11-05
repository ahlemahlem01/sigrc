import type { NotificationItem } from '../hooks/useNotifications';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The text of a notification in the language of the reader. A notification that carries its facts (dataJson) is written
 * from the translations; any other one, or one whose data cannot be read, keeps the text the server stored.
 */
export function localizedNotification(
  n: Pick<NotificationItem, 'type' | 'title' | 'message' | 'dataJson'>,
  t: Translate,
  formatDate: (iso: string) => string,
): { title: string; message: string } {
  const fallback = { title: n.title, message: n.message };
  const kind = String(n.type || '').toLowerCase();
  if (!n.dataJson || !kind.endsWith('deadline_extended')) return fallback;
  try {
    const d = JSON.parse(n.dataJson) as { title?: string; oldDeadline?: string; newDeadline?: string; days?: number; reason?: string };
    if (!d.title || !d.oldDeadline || !d.newDeadline) return fallback;
    return {
      title: t('notificationBell.deadlineExtended.title'),
      message: t('notificationBell.deadlineExtended.message', {
        title: d.title,
        newDate: formatDate(d.newDeadline),
        oldDate: formatDate(d.oldDeadline),
        days: d.days ?? 0,
        reason: d.reason ?? '',
      }),
    };
  } catch {
    return fallback;
  }
}

/**
 * Where a notification leads. A plan opens in the management section for an administrator, and in "my action plans" for an
 * employee (the management pages are closed to employees, who would otherwise land on their dashboard).
 */
export function notificationPath(
  n: Pick<NotificationItem, 'type' | 'linkPath' | 'claimId' | 'actionPlanId'>,
  isAdmin: boolean,
): string | null {
  // notifications stored with a page that does not exist (the old 8D link) lead to the claim's 8D file
  if (n.claimId && /^\/pages\/front\/quality-analyses\/admin(\?|$)/.test(n.linkPath ?? '')) {
    return `/pages/front/quality-analyses/8d/${encodeURIComponent(n.claimId)}`;
  }
  if (n.linkPath && n.linkPath.startsWith('/') && !n.linkPath.startsWith('//')) {
    return isAdmin ? n.linkPath : n.linkPath.replace(/^\/pages\/front\/action-plans\/(?!pending|history|assignments)/, '/pages/front/my-action-plans/');
  }
  if (n.claimId) return `/pages/front/my-claims?claimId=${encodeURIComponent(n.claimId)}`;
  if (n.type === 'recognition_podium') return '/dashboard';
  if (n.actionPlanId) {
    return isAdmin ? `/pages/front/action-plans/${n.actionPlanId}` : `/pages/front/my-action-plans/${n.actionPlanId}`;
  }
  return null;
}
