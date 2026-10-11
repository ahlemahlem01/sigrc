import i18n from '../i18n';

export type ActivityStatus = 'Active' | 'LowActivity' | 'Inactive';

/** i18n keys */
const LABEL: Record<ActivityStatus, string> = {
  Active: 'activity.active',
  LowActivity: 'activity.low',
  Inactive: 'activity.inactive',
};

const CSS: Record<ActivityStatus, string> = {
  Active: 'active',
  LowActivity: 'low',
  Inactive: 'inactive',
};

export function normalizeActivityStatus(raw: unknown): ActivityStatus {
  if (raw === 0 || raw === '0' || raw === 'Active' || raw === 'active') return 'Active';
  if (raw === 1 || raw === '1' || raw === 'LowActivity' || raw === 'lowActivity' || raw === 'Low') return 'LowActivity';
  if (raw === 2 || raw === '2' || raw === 'Inactive' || raw === 'inactive') return 'Inactive';
  return 'Inactive';
}

export function activityStatusLabel(status: ActivityStatus | unknown): string {
  return i18n.t(LABEL[normalizeActivityStatus(status)]);
}

export function activityStatusClass(status: ActivityStatus | unknown): string {
  return CSS[normalizeActivityStatus(status)];
}

// Labels are getters so they follow the current UI language wherever the options are rendered.
const option = (value: ActivityStatus | 'all', key: string) => ({
  value,
  get label() {
    return i18n.t(key);
  },
});

export const ACTIVITY_STATUS_OPTIONS: { value: ActivityStatus | 'all'; readonly label: string }[] = [
  option('all', 'activity.all'),
  option('Active', 'activity.active'),
  option('LowActivity', 'activity.low'),
  option('Inactive', 'activity.inactive'),
];
