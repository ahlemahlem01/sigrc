import { actionPlanApi } from './apiClient';

export type QualityAssistantScope = 'employee' | 'admin';

export interface QualityAssistantHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface QualityAssistantChatResponse {
  reply: string;
  scope: QualityAssistantScope;
  generatedAt: string;
}

export async function sendQualityAssistantMessage(
  message: string,
  history: QualityAssistantHistoryItem[] = [],
  language: string = 'fr',
  token?: string | null,
): Promise<QualityAssistantChatResponse> {
  const { data } = await actionPlanApi.post<QualityAssistantChatResponse>(
    '/quality-assistant/chat',
    {
      message,
      language,
      history: history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
    },
    // the access token lives in memory (AuthContext), not in localStorage: it is passed by the caller
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
  return data;
}
