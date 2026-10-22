import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import { capaBtnPrimary, capaBtnSecondary } from './capa/CapaAdminUi';

type Schedule = {
  id: string; title: string; frequency: 'weekly' | 'monthly'; dayOfWeek: number; dayOfMonth: number; hour: number; periodDays: number;
  isActive: boolean; nextRunAt: string; lastRunAt?: string | null; lastError?: string | null;
};

type Props = {
  /** the criteria of the report on screen (without its dates), kept by the schedule */
  criteria: unknown;
  /** length in days of the period on screen */
  periodDays: number;
  defaultTitle: string;
  /** called after a report has been generated, so that the saved reports list can refresh */
  onGenerated: () => void;
};

const PERIODS = [7, 30, 90, 365];

/** Reports that generate themselves every week or every month; each run saves a report in "Saved reports". */
export default function ReportSchedulesBar({ criteria, periodDays, defaultTitle, onGenerated }: Props) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<Schedule[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(7);
  const [period, setPeriod] = useState(30);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Schedule | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await axios.get<Schedule[]>(`${ACTION_PLAN_API_URL}/report-schedules`, { headers: { Authorization: `Bearer ${accessToken}` } });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRows([]);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const weekday = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(i18n.language, { weekday: 'long' });
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const when = (s: Schedule) => (s.frequency === 'weekly'
    ? t('reportSchedules.whenWeekly', { day: weekday(s.dayOfWeek), hour: hh(s.hour) })
    : t('reportSchedules.whenMonthly', { day: s.dayOfMonth, hour: hh(s.hour) }));

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice({ ok: true, text: ok });
      await load();
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || t('reportSchedules.failed') });
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  const create = () => run(async () => {
    await axios.post(`${ACTION_PLAN_API_URL}/report-schedules`, {
      title: title.trim(), frequency, dayOfWeek, dayOfMonth, hour, periodDays: period, criteriaJson: JSON.stringify(criteria),
    }, { headers });
    setOpen(false);
  }, t('reportSchedules.created'));

  const selectCls = 'px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
      {ask && (
        <ConfirmDialog
          title={t('reportSchedules.archiveTitle')}
          text={t('reportSchedules.archiveText', { title: ask.title })}
          confirmLabel={t('adminLists.archive')}
          danger
          busy={busy}
          onConfirm={() => void run(() => axios.post(`${ACTION_PLAN_API_URL}/report-schedules/${ask.id}/archive`, {}, { headers }))}
          onCancel={() => setAsk(null)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 m-0">{t('reportSchedules.title')}</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-0">{t('reportSchedules.hint')}</p>
        </div>
        {!open && (
          <button type="button" className={capaBtnSecondary} onClick={() => { setOpen(true); setTitle(defaultTitle); setPeriod(PERIODS.includes(periodDays) ? periodDays : 30); setNotice(null); }}>
            {t('reportSchedules.add')}
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-4">
              {t('reportSchedules.name')}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={selectCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              {t('reportSchedules.frequency')}
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')} className={selectCls}>
                <option value="weekly">{t('reportSchedules.weekly')}</option>
                <option value="monthly">{t('reportSchedules.monthly')}</option>
              </select>
            </label>
            {frequency === 'weekly' ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                {t('reportSchedules.day')}
                <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={selectCls}>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{weekday(d)}</option>)}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                {t('reportSchedules.dayOfMonth')}
                <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className={selectCls}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              {t('reportSchedules.hour')}
              <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={selectCls}>
                {Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              {t('reportSchedules.period')}
              <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className={selectCls}>
                {PERIODS.map((p) => <option key={p} value={p}>{t('reportSchedules.lastDays', { count: p })}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 mb-3">{t('reportSchedules.criteriaNote')}</p>
          <div className="flex gap-2">
            <button type="button" className={capaBtnPrimary} disabled={busy || !title.trim()} onClick={() => void create()}>{t('reportSchedules.create')}</button>
            <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {notice && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 m-0">{t('reportSchedules.none')}</p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-slate-100">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {s.title}
                  {!s.isActive && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{t('reportSchedules.paused')}</span>}
                </div>
                <div className="text-[11px] text-slate-500">
                  {when(s)} · {t('reportSchedules.lastDays', { count: s.periodDays })}
                  {s.isActive ? ` · ${t('reportSchedules.next', { date: new Date(s.nextRunAt).toLocaleString(i18n.language) })}` : ''}
                  {s.lastRunAt ? ` · ${t('reportSchedules.last', { date: new Date(s.lastRunAt).toLocaleString(i18n.language) })}` : ''}
                </div>
                {s.lastError && <div className="text-[11px] text-red-600">{t('reportSchedules.lastError')}: {s.lastError}</div>}
              </div>
              <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => void run(async () => { await axios.post(`${ACTION_PLAN_API_URL}/report-schedules/${s.id}/run`, {}, { headers }); onGenerated(); }, t('reportSchedules.generated'))}>
                {t('reportSchedules.runNow')}
              </button>
              <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => void run(() => axios.post(`${ACTION_PLAN_API_URL}/report-schedules/${s.id}/active`, {}, { headers, params: { value: !s.isActive } }))}>
                {s.isActive ? t('reportSchedules.pause') : t('reportSchedules.resume')}
              </button>
              <button type="button" className={`${capaBtnSecondary} !text-red-600`} disabled={busy} onClick={() => setAsk(s)}>{t('adminLists.archive')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
