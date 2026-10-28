import i18n from '../i18n';

/** An entry of the defect-type reference list: the value claims store, and the wording the screens show. */
export interface DefectItem {
  value: string;
  label?: string | null;
  /** Set when this spelling is an alias of another one (a renamed code): it shows the wording of the kept one. */
  mergedInto?: string | null;
}

/** Inspection defect codes whose wording is translated (fr / en / it); see the `defectTypes` block of the locales. */
const CODED_DEFECTS = [
  'CUT_INSULATION', 'SCRATCH_INSULATION', 'COPPER_BROKEN', 'MARKING_DEFECT',
  'COLOR_NON_CONFORMITY', 'INSULATION_THICKNESS', 'SPOOL_DAMAGED', 'SPARK_TEST_FAILURE',
  'CONDUCTOR_DIAMETER', 'OUTER_DIAMETER', 'ECCENTRICITY', 'CONDUCTOR_RESISTANCE',
  'COPPER_OXIDATION', 'COPPER_BURNT', 'INSULATION_BLISTER', 'FOREIGN_MATTER', 'STRAND_COUNT',
  'SPOOL_LENGTH', 'LAY_LENGTH', 'ADHESION_FAILURE', 'CABLE_CRUSHED',
];

let items: DefectItem[] = [];

/** Keeps the labels of the reference list at hand for every screen (called when the lists are loaded). */
export function setDefectItems(next: DefectItem[]) {
  items = next;
}

/** Same words once case, accents and punctuation are ignored (CUT_INSULATION = cut insulation). */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function labelOfItem(item: DefectItem, depth = 0): string {
  // an alias shows the wording of the name it was merged into (one hop is enough; spellings that fold to the same words are not aliases of each other)
  if (item.mergedInto && depth < 2 && fold(item.mergedInto) !== fold(item.value)) return defectLabel(item.mergedInto, depth + 1);
  const code = CODED_DEFECTS.find((c) => fold(c) === fold(item.value));
  if (code) return i18n.t(`defectTypes.${code}`, { defaultValue: item.label?.trim() || item.value });
  return item.label?.trim() || item.value;
}

/** The wording to show for a defect type: its translated or configured label, else the name as stored. */
export function defectLabel(value?: string | null, depth = 0): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const key = fold(raw);
  const item = items.find((i) => fold(i.value) === key && !i.mergedInto) ?? items.find((i) => fold(i.value) === key);
  if (item) return labelOfItem(item, depth);
  const code = CODED_DEFECTS.find((c) => fold(c) === key);
  return code ? i18n.t(`defectTypes.${code}`, { defaultValue: raw }) : raw;
}

/** What the form should store when the user picks or types a wording: the code behind a label, else the text itself. */
export function defectValueFromInput(text: string): string {
  const typed = fold(text);
  if (!typed) return text;
  const all: DefectItem[] = [...items, ...CODED_DEFECTS.filter((c) => !items.some((i) => fold(i.value) === fold(c))).map((c) => ({ value: c }))];
  const match = all.find((i) => fold(labelOfItem(i)) === typed && fold(labelOfItem(i)) !== fold(i.value));
  return match ? match.value : text;
}
