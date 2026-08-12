import { apiRequest, externalApiBaseUrl } from '@/lib/api';
import { companyAuthHeaders } from '@/auth/companyAuth';
import type {
  AgentChatEvent,
  AgentConversation,
  AgentConversationListResponse,
  AgentConversationSummary,
  AgentToolsResponse,
} from './types';

export const aiAssistantApi = {
  listTools(): Promise<AgentToolsResponse> {
    return apiRequest<AgentToolsResponse>('/agent/tools');
  },
  listConversations(archived = false): Promise<AgentConversationListResponse> {
    return apiRequest<AgentConversationListResponse>(
      `/agent/conversations?page=1&per_page=50&archived=${archived ? 1 : 0}`,
    );
  },
  createConversation(title?: string): Promise<AgentConversationSummary> {
    return apiRequest<AgentConversationSummary>('/agent/conversations', {
      method: 'POST',
      body: title ? { title } : {},
    });
  },
  getConversation(id: number): Promise<AgentConversation> {
    return apiRequest<AgentConversation>(`/agent/conversations/${id}`);
  },
  renameConversation(id: number, title: string): Promise<AgentConversationSummary> {
    return apiRequest<AgentConversationSummary>(`/agent/conversations/${id}`, {
      method: 'PATCH',
      body: { title },
    });
  },
  archiveConversation(id: number): Promise<{ id: number; archived: boolean }> {
    return apiRequest<{ id: number; archived: boolean }>(
      `/agent/conversations/${id}`,
      { method: 'DELETE' },
    );
  },
  /**
   * 流式对话（SSE）。服务端每次会话持久化后返回 conversation_started，
   * 之后逐条 thought / tool_call / tool_result / token，最后 done。
   */
  async chatStream(
    message: string,
    conversationId: number | null,
    onEvent: (event: AgentChatEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${externalApiBaseUrl()}/agent/chat`, {
      method: 'POST',
      headers: { ...companyAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation_id: conversationId ?? undefined,
      }),
      signal,
    });
    if (!response.ok || !response.body) {
      if (response.status === 401) {
        window.dispatchEvent(new Event('hireinsight:unauthorized'));
      }
      let message = `请求失败（HTTP ${response.status}）`;
      try {
        const data = await response.json();
        if (data && typeof data.error === 'string') message = data.error;
      } catch {
        // 非 JSON 响应保留默认文案
      }
      throw new Error(message);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = raw
          .split('\n')
          .find((item) => item.startsWith('data: '));
        if (!line) continue;
        try {
          onEvent(JSON.parse(line.slice(6)) as AgentChatEvent);
        } catch {
          // 忽略无法解析的事件行
        }
      }
    }
  },
};
