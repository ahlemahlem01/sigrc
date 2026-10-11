/**
 * The claim workflow refuses a status change with HTTP 409 { code: "workflow", message, allowed }.
 * Returns that message (it names the two statuses concerned), or null for any other error,
 * so each screen can keep its own generic wording as the fallback.
 */
export function workflowMessage(err: unknown): string | null {
  const response = (err as { response?: { status?: number; data?: { code?: string; message?: string } } })?.response;
  if (response?.status === 409 && response.data?.code === 'workflow' && response.data.message) {
    return response.data.message;
  }
  return null;
}
