export interface AgentTool {
  name: string;
  description: string;
  params: Record<string, unknown>;
}

export interface AgentConversationSummary {
  id: number;
  title: string;
  title_source: 'default' | 'manual' | 'auto';
  archived: boolean;
  created_at: string | null;
  updated_at: string | null;
  message_count: number;
}

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface AgentMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tool_calls: AgentToolCall[] | null;
  thoughts: string[] | null;
  created_at: string | null;
}

export interface AgentConversation extends AgentConversationSummary {
  messages: AgentMessage[];
}

export interface AgentConversationListResponse {
  items: AgentConversationSummary[];
  page: number;
  per_page: number;
  total: number;
}

export interface AgentToolsResponse {
  tools: AgentTool[];
}

export type AgentChatEvent =
  | { type: 'conversation_started'; id: number }
  | { type: 'thought'; text: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'token'; text: string }
  | { type: 'done'; answer: string }
  | { type: 'error'; message?: string };
