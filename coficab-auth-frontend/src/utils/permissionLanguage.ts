/** Libellés métier (traduits). Le code technique (action_plan:approve) reste en base, il n'est pas montré au responsable. */
import i18n from '../i18n';

/** Rights with a business label; the text lives in permissions.<name>.label / .description. */
const KNOWN = new Set<string>(["action_plan:view","action_plan:create","action_plan:edit","action_plan:delete","action_plan:approve","action_plan:export","data:import","maintenance:view","maintenance:create","maintenance:close","hr:view","hr:manage_employees","claims:create","claims:view_own","claims:view_all","claims:assign","claims:close","claims:import","capa:create","capa:assign","capa:validate","capa:archive","analysis:conduct","analysis:generate_ai","8d:complete_steps","alerts:view","alerts:propose_action","alerts:validate","alerts:resolve","employees:manage","employees:view_performance","employees:generate_hr_report","employees:award_badge","reports:view_dashboard","reports:export","admin:manage_permissions","admin:manage_process","admin:manage_departments"]);
const CATEGORIES = new Set<string>(["Claims","CAPA","Quality","Alerts","Employees","Reports","Admin","Maintenance","RH"]);

const rightKey = (name: string) => `permissions.${name.replace(/:/g, '_')}`;

export function permissionTitle(name: string, displayName?: string | null): string {
  if (KNOWN.has(name)) return i18n.t(`${rightKey(name)}.label`);
  const text = (displayName || '').trim();
  if (text && text !== name && !text.includes(':')) return text;
  return i18n.t('permissions.custom');
}

export function permissionHelp(name: string, description?: string | null): string {
  if (KNOWN.has(name)) return i18n.t(`${rightKey(name)}.description`);
  const text = (description || '').trim();
  return text || i18n.t('permissions.customHelp');
}

export function categoryTitle(category?: string | null): string {
  const value = (category || '').trim();
  if (!value) return i18n.t('permissions.other');
  return CATEGORIES.has(value) ? i18n.t(`permissions.category.${value}`) : value;
}
