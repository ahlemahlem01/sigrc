import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  sendQualityAssistantMessage,
  type QualityAssistantHistoryItem,
  type QualityAssistantScope,
} from '../../services/qualityAssistantService';
import './QualityAssistantWidget.css';

export interface QualityAssistantWidgetProps {
  /** Affichage / copy uniquement — le backend impose le filtre réel via le JWT. */
  scope: QualityAssistantScope;
}

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function QualityAssistantWidget({ scope }: QualityAssistantWidgetProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const welcomeKey = scope === 'admin' ? 'qualityAssistant.welcomeAdmin' : 'qualityAssistant.welcomeEmployee';

  // Keep the welcome bubble in sync with language / scope; preserve chat history.
  useEffect(() => {
    setMessages((prev) => {
      const rest = prev.filter((m) => m.id !== 'welcome');
      return [
        {
          id: 'welcome',
          role: 'assistant',
          content: t(welcomeKey),
        },
        ...rest,
      ];
    });
  }, [t, welcomeKey, i18n.language]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    inputRef.current?.focus();
  }, [open, messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setInput('');
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    const history: QualityAssistantHistoryItem[] = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }));

    const lang = (i18n.language || 'fr').slice(0, 2).toLowerCase();

    try {
      const res = await sendQualityAssistantMessage(text, history, lang);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.reply?.trim() || t('qualityAssistant.emptyReply'),
        },
      ]);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (err as Error)?.message
        || t('qualityAssistant.errorFallback');
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: t('qualityAssistant.errorGeneric'),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, i18n.language, t]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="qa-root" data-scope={scope}>
      {open && (
        <div className="qa-panel" role="dialog" aria-label={t('qualityAssistant.title')}>
          <header className="qa-header">
            <div className="qa-header-text">
              <span className="qa-title">{t('qualityAssistant.title')}</span>
              <span className="qa-subtitle">
                {scope === 'admin'
                  ? t('qualityAssistant.scopeAdmin')
                  : t('qualityAssistant.scopeEmployee')}
              </span>
            </div>
            <button
              type="button"
              className="qa-icon-btn"
              aria-label={t('qualityAssistant.close')}
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>

          <div className="qa-messages" ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`qa-bubble ${m.role === 'user' ? 'qa-bubble-user' : 'qa-bubble-assistant'}`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="qa-bubble qa-bubble-assistant qa-typing">
                <Loader2 size={14} className="qa-spin" />
                {t('qualityAssistant.typing')}
              </div>
            )}
          </div>

          {error && <div className="qa-error">{error}</div>}

          <div className="qa-composer">
            <textarea
              ref={inputRef}
              className="qa-input"
              rows={2}
              placeholder={t('qualityAssistant.placeholder')}
              value={input}
              disabled={sending}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              className="qa-send"
              disabled={sending || !input.trim()}
              aria-label={t('qualityAssistant.send')}
              onClick={() => void send()}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`qa-fab${open ? ' open' : ''}`}
        aria-label={open ? t('qualityAssistant.closePanel') : t('qualityAssistant.open')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>
    </div>
  );
}
