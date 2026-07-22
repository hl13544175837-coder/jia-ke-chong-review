// AI 助手对话状态 Context。
// 把对话历史从 AgentPage 组件内提升到此 Provider —— Provider 挂在 AppShell 的
// Outlet 之上，切换路由时 AppShell 不卸载，故对话历史跨页面保留（刷新才清空）。
// 仅持有状态与跨渲染的 ref；具体收发逻辑仍在 AgentPage，以保持关注点分离。

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from 'react';
import { authHeaders, getEmpCode } from './api';
import { api } from './api';
import { API_BASE } from './apiBase';
import type { ConversationSummary } from '../types';

// 本地会话编号按当前登录用户隔离：不同账号共用同一浏览器时互不串会话。
// 工号在网关登录时写入（见 api.ts 的 EMP_CODE_KEY），无工号时退化为匿名空间。
const STORAGE_KEY_CONV_BASE = 'zhipin:agent:conversation_id';

function userStorageKey(base: string): string {
  const empCode = (getEmpCode() ?? '').trim();
  return empCode ? `${base}:${empCode}` : `${base}:anonymous`;
}

export interface ConversationMessageItem {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }> | null;
  thoughts?: string[] | null;
  created_at: string | null;
}

// ---- 对话视图模型（AgentPage 与本 Context 共用）----

export interface ToolCallView {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export type ConfirmStatus = 'pending' | 'executing' | 'done' | 'failed' | 'cancelled';

export interface WriteProposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  status: ConfirmStatus;
  resultText?: string;
}

export type TurnStatus = 'streaming' | 'done' | 'error';

export interface UserMessage {
  kind: 'user';
  id: number;
  text: string;
}

export interface AssistantMessage {
  kind: 'assistant';
  id: number;
  thoughts: string[];
  toolCalls: ToolCallView[];
  answer: string;
  status: TurnStatus;
  error?: string;
  proposal?: WriteProposal;
}

export type Message = UserMessage | AssistantMessage;

interface AgentChatValue {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  streaming: boolean;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  // 跨渲染保留的引用
  abortRef: MutableRefObject<AbortController | null>;
  toolSeqRef: MutableRefObject<number>;
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  loadConversationMessages: (id: number) => Promise<ConversationMessageItem[]>;
  hydrateMessagesFromDb: (dbMessages: ConversationMessageItem[]) => void;
  // 会话列表与管理（跨路由保留）
  conversations: ConversationSummary[];
  archivedConversations: ConversationSummary[];
  reloadConversations: () => Promise<void>;
  switchConversation: (id: number) => Promise<void>;
  createNewConversation: (title?: string) => Promise<number>;
  renameConversation: (id: number, title: string) => Promise<void>;
  archiveConversation: (id: number, archived: boolean) => Promise<void>;
  // 会话级内存缓存：id -> messages，切换时先读缓存避免闪烁
  conversationCache: MutableRefObject<Map<number, Message[]>>;
  // 会话列表加载失败信息（null 表示正常）；配合 reloadConversations 重试
  conversationsError: string | null;
  // 会话内容加载失败信息（切换或恢复历史会话时）；null 表示正常
  conversationLoadError: string | null;
  clearConversationLoadError: () => void;
}

const AgentChatContext = createContext<AgentChatValue | undefined>(undefined);

function readStoredConversationId(): number | null {
  try {
    const raw = localStorage.getItem(userStorageKey(STORAGE_KEY_CONV_BASE));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredConversationId(id: number | null) {
  try {
    const key = userStorageKey(STORAGE_KEY_CONV_BASE);
    if (id === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(id));
    }
  } catch {
    // localStorage may be unavailable in private contexts.
  }
}

async function authFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`请求失败 (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  // Do not activate the cached id until its server record is checked below.
  // This prevents a stale archived id from ever being used as a chat target.
  const [conversationId, setConversationIdState] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<ConversationSummary[]>([]);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolSeqRef = useRef(0);
  // 会话级内存缓存：切回某会话时先读缓存，避免后端往返闪烁
  const conversationCache = useRef<Map<number, Message[]>>(new Map());

  const setConversationId = useCallback((id: number | null) => {
    setConversationIdState(id);
    writeStoredConversationId(id);
  }, []);

  const loadConversationMessages = useCallback(
    async (id: number): Promise<ConversationMessageItem[]> => {
      const data = await authFetch<{ messages: ConversationMessageItem[] }>(
        `${API_BASE}/agent/conversations/${id}`,
      );
      return data.messages ?? [];
    },
    [],
  );

  const hydrateMessagesFromDb = useCallback((dbMessages: ConversationMessageItem[]) => {
    const restored: Message[] = dbMessages.map((message, index) => {
      if (message.role === 'user') {
        return { kind: 'user', id: index + 1, text: message.content };
      }
      return {
        kind: 'assistant',
        id: index + 1,
        thoughts: message.thoughts ?? [],
        toolCalls: (message.tool_calls ?? []).map((call, callIndex) => ({
          id: callIndex + 1,
          tool: call.tool,
          args: call.args ?? {},
          result: call.result,
        })),
        answer: message.content,
        status: 'done',
      };
    });
    setMessages(restored);
  }, []);

  const reloadConversations = useCallback(async () => {
    const [active, archived] = await Promise.allSettled([
      api.listConversations({ archived: false, per_page: 100 }),
      api.listConversations({ archived: true, per_page: 100 }),
    ]);
    const errors: string[] = [];
    if (active.status === 'fulfilled') {
      setConversations(active.value.items ?? []);
    } else {
      errors.push(`当前会话：${active.reason instanceof Error ? active.reason.message : '加载失败'}`);
    }
    if (archived.status === 'fulfilled') {
      setArchivedConversations(archived.value.items ?? []);
    } else {
      errors.push(`已归档会话：${archived.reason instanceof Error ? archived.reason.message : '加载失败'}`);
    }
    // 任一分组失败都明确展示，重试会同时刷新两个真实列表。
    setConversationsError(errors.length ? errors.join('；') : null);
  }, []);

  const clearConversationLoadError = useCallback(() => {
    setConversationLoadError(null);
  }, []);

  const switchConversation = useCallback(
    async (id: number) => {
      // 流式生成中不允许切换（避免状态错乱）
      if (streaming) return;
      setConversationLoadError(null);
      // 先读内存缓存，避免闪烁
      const cached = conversationCache.current.get(id);
      if (cached) {
        setMessages(cached);
      } else {
        setMessages([]);
      }
      setConversationId(id);
      try {
        const dbMessages = await loadConversationMessages(id);
        hydrateMessagesFromDb(dbMessages);
      } catch (error) {
        // 加载失败保留缓存或空状态，但提示用户可重试
        setConversationLoadError(
          error instanceof Error ? error.message : '会话内容加载失败',
        );
      }
    },
    [streaming, setConversationId, loadConversationMessages, hydrateMessagesFromDb],
  );

  const createNewConversation = useCallback(
    async (title?: string): Promise<number> => {
      if (streaming) throw new Error('生成中，暂不能新建会话');
      const created = await api.createConversation(title);
      await reloadConversations();
      setMessages([]);
      conversationCache.current.delete(created.id);
      setConversationId(created.id);
      return created.id;
    },
    [streaming, reloadConversations, setConversationId],
  );

  const renameConversation = useCallback(
    async (id: number, title: string) => {
      if (streaming) return;
      await api.updateConversation(id, { title });
      await reloadConversations();
    },
    [streaming, reloadConversations],
  );

  const archiveConversation = useCallback(
    async (id: number, archived: boolean) => {
      if (streaming) return;
      await api.updateConversation(id, { archived });
      // 归档当前会话后立即丢弃其活动引用和视图，不能继续往已归档会话发送。
      if (archived && id === conversationId) {
        conversationCache.current.delete(id);
        setConversationId(null);
        setMessages([]);
        setInput('');
      }
      await reloadConversations();
    },
    [streaming, conversationId, reloadConversations, setConversationId],
  );

  // 切换会话前，把当前会话消息缓存起来（供切回时快速恢复）
  useEffect(() => {
    if (conversationId !== null) {
      conversationCache.current.set(conversationId, messages);
    }
  }, [messages, conversationId]);

  // 挂载时：恢复最近会话（修复 A2 —— 不再清空，而是尝试恢复或引导新建）
  useEffect(() => {
    let cancelled = false;
    reloadConversations();
    const stored = readStoredConversationId();
    if (!stored) return;
    authFetch<{ archived?: boolean; messages: ConversationMessageItem[] }>(
      `${API_BASE}/agent/conversations/${stored}`,
    )
      .then((data) => {
        if (!cancelled) {
          // A cached id may have been archived in another tab. It is never a
          // valid active target, so discard it before users can send a turn.
          if (data.archived) {
            setConversationId(null);
            setMessages([]);
            setConversationLoadError('该历史会话已归档，请先恢复后再继续对话');
            return;
          }
          setConversationId(stored);
          hydrateMessagesFromDb(data.messages ?? []);
        }
      })
      .catch(() => {
        // 读不到不再清空 messages —— 保留当前（空）状态，引导用户新建或选历史
        if (!cancelled) {
          setConversationId(null);
          setConversationLoadError('历史会话恢复失败，可重新发起对话或从列表选择');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateMessagesFromDb, reloadConversations, setConversationId]);

  return (
    <AgentChatContext.Provider
      value={{
        messages,
        setMessages,
        input,
        setInput,
        streaming,
        setStreaming,
        abortRef,
        toolSeqRef,
        conversationId,
        setConversationId,
        loadConversationMessages,
        hydrateMessagesFromDb,
        conversations,
        archivedConversations,
        reloadConversations,
        switchConversation,
        createNewConversation,
        renameConversation,
        archiveConversation,
        conversationCache,
        conversationsError,
        conversationLoadError,
        clearConversationLoadError,
      }}
    >
      {children}
    </AgentChatContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgentChat(): AgentChatValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx) {
    throw new Error('useAgentChat must be used within an AgentChatProvider');
  }
  return ctx;
}
