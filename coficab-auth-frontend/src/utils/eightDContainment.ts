import i18n from '../i18n';

export type ContainmentKind =
  | 'STOP_SHIP'
  | 'QUARANTINE'
  | 'SORT_100'
  | 'INFORM_CUSTOMER'
  | 'IN_TRANSIT'
  | 'OTHER';

export type ContainmentStatus = 'TODO' | 'DOING' | 'DONE';

export interface ContainmentAction {
  id: string;
  kind: ContainmentKind;
  title: string;
  owner: string;
  location: string;
  qtyChecked: number | '';
  qtyNok: number | '';
  status: ContainmentStatus;
  notes: string;
  required: boolean;
  originalOwner?: string;
  originalLocation?: string;
  originalStatus?: string;
  originalNotes?: string;
  originalQtyChecked?: number | '';
  originalQtyNok?: number | '';
}

export const DEFAULT_CONTAINMENT_ACTIONS: ContainmentAction[] = [
  {
    id: 'ica-stop-ship',
    kind: 'STOP_SHIP',
    title: 'Bloquer les expéditions',
    owner: '',
    location: 'Expédition / quai',
    qtyChecked: '',
    qtyNok: '',
    status: 'TODO',
    notes: '',
    required: true,
  },
  {
    id: 'ica-quarantine',
    kind: 'QUARANTINE',
    title: 'Quarantaine du lot / stock / WIP',
    owner: '',
    location: 'Magasin / ligne',
    qtyChecked: '',
    qtyNok: '',
    status: 'TODO',
    notes: '',
    required: true,
  },
  {
    id: 'ica-sort',
    kind: 'SORT_100',
    title: 'Tri 100 % des pièces à risque',
    owner: '',
    location: 'Ligne / stock',
    qtyChecked: '',
    qtyNok: '',
    status: 'TODO',
    notes: '',
    required: true,
  },
  {
    id: 'ica-inform',
    kind: 'INFORM_CUSTOMER',
    title: 'Informer le client',
    owner: '',
    location: 'Qualité client',
    qtyChecked: '',
    qtyNok: '',
    status: 'TODO',
    notes: '',
    required: true,
  },
  {
    id: 'ica-transit',
    kind: 'IN_TRANSIT',
    title: 'Contrôler les lots en transit',
    owner: '',
    location: 'Transit',
    qtyChecked: '',
    qtyNok: '',
    status: 'TODO',
    notes: '',
    required: false,
  },
];

const KINDS: ContainmentKind[] = [
  'STOP_SHIP', 'QUARANTINE', 'SORT_100', 'INFORM_CUSTOMER', 'IN_TRANSIT', 'OTHER',
];

function asKind(v?: string): ContainmentKind {
  const k = String(v || '').toUpperCase() as ContainmentKind;
  return KINDS.includes(k) ? k : 'OTHER';
}

function asStatus(v?: string): ContainmentStatus {
  const s = String(v || '').toUpperCase();
  if (s === 'DONE' || s === 'DOING') return s;
  return 'TODO';
}

export type ContainmentActionInput = {
  id?: string;
  kind?: string;
  title?: string;
  owner?: string;
  location?: string;
  qtyChecked?: number | string | null;
  qtyNok?: number | string | null;
  status?: string;
  notes?: string;
  required?: boolean;
  originalOwner?: string;
  originalLocation?: string;
  originalStatus?: string;
  originalNotes?: string;
  originalQtyChecked?: number | string | null;
  originalQtyNok?: number | string | null;
};

export function normalizeContainmentAction(raw: ContainmentActionInput): ContainmentAction {
  const kind = asKind(raw.kind);
  const def = DEFAULT_CONTAINMENT_ACTIONS.find((d) => d.id === raw.id || d.kind === kind);
  const qty = (v: unknown) => {
    if (v === '' || v == null) return '' as const;
    const n = Number(v);
    return Number.isFinite(n) ? n : ('' as const);
  };
  return {
    id: raw.id || def?.id || `ica-${Date.now()}`,
    kind,
    title: raw.title || def?.title || 'Action de confinement',
    owner: raw.owner || '',
    location: raw.location || def?.location || '',
    qtyChecked: qty(raw.qtyChecked),
    qtyNok: qty(raw.qtyNok),
    status: asStatus(raw.status),
    notes: raw.notes || '',
    required: raw.required ?? def?.required ?? false,
    originalOwner: raw.originalOwner || undefined,
    originalLocation: raw.originalLocation || undefined,
    originalStatus: raw.originalStatus || undefined,
    originalNotes: raw.originalNotes || undefined,
    originalQtyChecked: qty(raw.originalQtyChecked),
    originalQtyNok: qty(raw.originalQtyNok),
  };
}

export function mergeContainmentActions(saved?: ContainmentActionInput[] | null): ContainmentAction[] {
  const list = saved || [];
  const used = new Set<string>();
  const merged = DEFAULT_CONTAINMENT_ACTIONS.map((def) => {
    const hit = list.find((s) => s.id === def.id) || list.find((s) => asKind(s.kind) === def.kind && !used.has(String(s.id || s.kind)));
    if (!hit) return { ...def };
    used.add(String(hit.id || hit.kind));
    return normalizeContainmentAction({ ...def, ...hit, id: def.id, kind: def.kind, required: def.required });
  });
  const extras = list.filter((s) => {
    const id = String(s.id || '');
    const kind = asKind(s.kind);
    return !DEFAULT_CONTAINMENT_ACTIONS.some((d) => d.id === id || d.kind === kind);
  });
  return [...merged, ...extras.map((e) => normalizeContainmentAction(e))];
}

export function inferContainmentStatus(action: Pick<ContainmentAction, 'kind' | 'owner' | 'notes' | 'qtyChecked' | 'location'>): ContainmentStatus {
  const ownerOk = String(action.owner || '').trim().length > 1;
  const notesOk = String(action.notes || '').trim().length > 0;
  const qtyStarted = action.kind === 'SORT_100' && action.qtyChecked !== '' && action.qtyChecked != null;
  const sortOk = action.kind !== 'SORT_100' || Number(action.qtyChecked) > 0;
  const started = ownerOk || notesOk || qtyStarted;
  if (!started) return 'TODO';
  // « Fait » seulement quand l’action est vraiment complète — pas dès la 1re lettre.
  return ownerOk && notesOk && sortOk ? 'DONE' : 'DOING';
}

export function containmentStatusLabel(status: ContainmentStatus): string {
  if (status === 'DONE') return i18n.t('containment.statusDone');
  if (status === 'DOING') return i18n.t('containment.statusDoing');
  return i18n.t('containment.statusTodo');
}

/** Display title: default actions follow the UI language; custom (OTHER) actions keep what the user typed. */
export function containmentActionTitle(action: Pick<ContainmentAction, 'kind' | 'title'>): string {
  if (action.kind === 'OTHER') return action.title;
  return i18n.t(`containment.kind.${action.kind}`, { defaultValue: action.title });
}

export function requiredContainmentDone(actions: ContainmentAction[]): boolean {
  const required = actions.filter((a) => a.required);
  if (required.length === 0) return false;
  return required.every((a) => inferContainmentStatus(a) === 'DONE');
}

export function toSaveContainmentActions(actions: ContainmentAction[]) {
  const qty = (v: number | '') => (v === '' ? undefined : Number(v));
  return actions.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    owner: a.owner || undefined,
    location: a.location || undefined,
    qtyChecked: qty(a.qtyChecked),
    qtyNok: qty(a.qtyNok),
    status: a.status,
    notes: a.notes || undefined,
    required: a.required,
    originalOwner: a.originalOwner || undefined,
    originalLocation: a.originalLocation || undefined,
    originalStatus: a.originalStatus || undefined,
    originalNotes: a.originalNotes || undefined,
    originalQtyChecked: qty(a.originalQtyChecked ?? ''),
    originalQtyNok: qty(a.originalQtyNok ?? ''),
  }));
}
