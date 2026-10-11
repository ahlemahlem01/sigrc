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
): Promise<QualityAssistantChatResponse> {
  const { data } = await actionPlanApi.post<QualityAssistantChatResponse>(
    '/api/quality-assistant/chat',
    {
      message,
      language,
      history: history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
    },
  );
  return data;
}
