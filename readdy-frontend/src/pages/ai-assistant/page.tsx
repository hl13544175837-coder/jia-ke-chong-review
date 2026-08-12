import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { aiAssistantApi } from '@/features/aiAssistant/api';
import type {
  AgentConversation,
  AgentConversationSummary,
  AgentMessage,
  AgentTool,
} from '@/features/aiAssistant/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thoughts?: string[];
  toolCalls?: string[];
  streaming?: boolean;
}

const quickActions = [
  { icon: 'ri-file-search-line', label: '简历分析', prompt: '帮我分析一下前端开发工程师的候选人简历匹配度' },
  { icon: 'ri-lightbulb-line', label: '渠道推荐', prompt: '推荐适合招聘 Java 开发工程师的渠道' },
  { icon: 'ri-draft-line', label: 'JD优化', prompt: '帮我优化一下产品经理的岗位描述' },
  { icon: 'ri-bar-chart-box-line', label: '数据分析', prompt: '分析我们最近一个月的招聘转化率' },
];

function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function toChatMessage(message: AgentMessage): ChatMessage {
  return {
    id: String(message.id),
    role: message.role,
    content: message.content || '',
    thoughts: message.thoughts ?? undefined,
    toolCalls: (message.tool_calls ?? []).map((call) => call.tool),
  };
}

export default function AIAssistantPage() {
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [showTools, setShowTools] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  const loadConversations = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const response = await aiAssistantApi.listConversations();
      setConversations(response.items);
      return response.items;
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : '会话列表加载失败');
      return [];
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    aiAssistantApi
      .listTools()
      .then((response) => setTools(response.tools))
      .catch(() => setTools([]));
  }, [loadConversations]);

  const openConversation = useCallback(async (id: number) => {
    abortRef.current?.abort();
    setActiveId(id);
    setDetailLoading(true);
    setDetailError('');
    try {
      const conversation = await aiAssistantApi.getConversation(id);
      setMessages(conversation.messages.map(toChatMessage));
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : '会话内容加载失败');
      setMessages([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setDetailError('');
    setStreamError('');
  }, []);

  const renameConversation = useCallback(async (id: number) => {
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    try {
      await aiAssistantApi.renameConversation(id, title);
      setConversations((prev) =>
        prev.map((item) => (item.id === id ? { ...item, title, title_source: 'manual' } : item)),
      );
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : '重命名失败');
    } finally {
      setEditingId(null);
    }
  }, [editingTitle]);

  const archiveConversation = useCallback(async (id: number) => {
    try {
      await aiAssistantApi.archiveConversation(id);
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (activeId === id) startNewConversation();
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : '归档失败');
    }
  }, [activeId, startNewConversation]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || streaming) return;

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setStreamError('');
    setStreaming(true);

    const assistantMessage: ChatMessage = {
      id: `local-ai-${Date.now()}`,
      role: 'assistant',
      content: '',
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    const abort = new AbortController();
    abortRef.current = abort;
    let thoughts: string[] = [];
    const toolNames: string[] = [];
    let failed = false;
    let stopped = false;

    const updateAssistant = (patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id ? { ...item, ...patch } : item,
        ),
      );
    };

    try {
      await aiAssistantApi.chatStream(
        text,
        activeId,
        (event) => {
          if (event.type === 'conversation_started') {
            setActiveId(event.id);
            assistantMessage.id = `conversation-${event.id}`;
          } else if (event.type === 'thought') {
            thoughts = [...thoughts, event.text];
            updateAssistant({ thoughts });
          } else if (event.type === 'tool_call') {
            if (!toolNames.includes(event.tool)) toolNames.push(event.tool);
            updateAssistant({ toolCalls: [...toolNames] });
          } else if (event.type === 'token') {
            updateAssistant({
              content: assistantMessage.content + event.text,
            });
          } else if (event.type === 'done') {
            updateAssistant({
              content: event.answer || assistantMessage.content,
              streaming: false,
            });
          } else if (event.type === 'error') {
            failed = true;
            updateAssistant({
              content: event.message || 'AI 服务暂时不可用，请稍后重试',
              streaming: false,
            });
          }
        },
        abort.signal,
      );
    } catch (cause) {
      if ((cause as Error).name === 'AbortError') {
        stopped = true;
        updateAssistant({ content: assistantMessage.content || '已停止生成', streaming: false });
      } else {
        failed = true;
        updateAssistant({
          content: cause instanceof Error ? cause.message : '发送失败，请重试',
          streaming: false,
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
    if (failed || stopped) return;
    // 完成后刷新会话列表（标题/消息数由服务端持久化），并在新建会话场景下切到该会话
    const refreshed = await loadConversations();
    const currentId = assistantMessage.id.startsWith('conversation-')
      ? Number(assistantMessage.id.slice('conversation-'.length))
      : null;
    if (currentId && refreshed.some((item) => item.id === currentId)) {
      setActiveId(currentId);
      setConversations((prev) =>
        prev.map((item) =>
          item.id === currentId
            ? { ...item, message_count: item.message_count + 2 }
            : item,
        ),
      );
    }
  }, [activeId, loadConversations, streaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      void sendMessage(input);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 会话列表侧栏 */}
      <aside className="w-64 flex-shrink-0 border-r border-background-200 bg-white flex flex-col min-h-0">
        <div className="p-4 border-b border-background-200">
          <button
            onClick={startNewConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-add-line"></i>
            新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
          {listLoading && (
            <p className="text-xs text-foreground-400 text-center py-8">加载会话中...</p>
          )}
          {!listLoading && listError && (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-accent-600 mb-2">{listError}</p>
              <button
                onClick={() => void loadConversations()}
                className="px-3 py-1.5 bg-background-100 rounded-lg text-xs text-foreground-600 cursor-pointer"
              >
                重新加载
              </button>
            </div>
          )}
          {!listLoading && !listError && conversations.length === 0 && (
            <p className="text-xs text-foreground-400 text-center py-8">暂无历史会话</p>
          )}
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                activeId === conversation.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'hover:bg-background-50 text-foreground-700'
              }`}
              onClick={() => void openConversation(conversation.id)}
            >
              {editingId === conversation.id ? (
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onBlur={() => void renameConversation(conversation.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void renameConversation(conversation.id);
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                  onClick={(event) => event.stopPropagation()}
                  className="w-full px-2 py-1 bg-white border border-primary-300 rounded-md text-sm outline-none"
                />
              ) : (
                <>
                  <i className="ri-chat-3-line text-sm flex-shrink-0"></i>
                  <span className="flex-1 min-w-0 truncate text-sm">{conversation.title}</span>
                  <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingId(conversation.id);
                        setEditingTitle(conversation.title);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-600 hover:bg-background-100 cursor-pointer"
                      title="重命名"
                    >
                      <i className="ri-edit-2-line text-xs"></i>
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void archiveConversation(conversation.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-accent-600 hover:bg-accent-50 cursor-pointer"
                      title="归档"
                    >
                      <i className="ri-archive-line text-xs"></i>
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-background-200">
          <button
            onClick={() => setShowTools((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-background-50 text-xs text-foreground-500 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <i className="ri-tools-line"></i>
              能力目录（{tools.length}）
            </span>
            <i className={`${showTools ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm`}></i>
          </button>
          {showTools && (
            <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
              {tools.map((tool) => (
                <div key={tool.name} className="px-3 py-2 bg-background-50 rounded-lg">
                  <p className="text-xs font-semibold text-foreground-700">{tool.name}</p>
                  <p className="text-[11px] text-foreground-400 mt-0.5 leading-relaxed">{tool.description}</p>
                </div>
              ))}
              {tools.length === 0 && (
                <p className="text-[11px] text-foreground-400 px-3 py-2">能力目录加载失败或暂无工具</p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* 聊天主区 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-6 py-4 border-b border-background-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-500 flex items-center justify-center">
              <i className="ri-robot-2-line text-white text-lg"></i>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground-900">AI 助手</h1>
              <p className="text-xs text-foreground-500">
                {streaming ? '正在生成回答...' : '基于真实系统数据回答 · 只读建议，不代替人工决策'}
              </p>
            </div>
          </div>
        </div>

        {detailError && (
          <div className="mx-6 mt-4 flex items-center justify-between gap-3 px-4 py-3 bg-accent-50 border border-accent-200 rounded-xl text-sm text-accent-700">
            <span>{detailError}</span>
            {activeId && (
              <button
                onClick={() => void openConversation(activeId)}
                className="px-3 py-1.5 bg-white border border-accent-200 rounded-lg text-accent-600 hover:bg-accent-100 cursor-pointer whitespace-nowrap"
              >
                重新加载
              </button>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {!activeId && messages.length === 0 && (
            <div className="py-14 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-50 flex items-center justify-center">
                <i className="ri-robot-2-line text-accent-500 text-3xl"></i>
              </div>
              <h2 className="text-lg font-bold text-foreground-900 mb-2">您好，我是智聘 AI 助手</h2>
              <p className="text-sm text-foreground-500 max-w-md mx-auto leading-relaxed">
                我可以查询真实的招聘数据（岗位状态、候选人、面试进度、招聘分析），
                辅助生成邀约话术和文案，并给出基于真实系统数据的建议。AI 只读不改，
                不会自动推进流程、淘汰候选人或发送 Offer。
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'assistant' ? 'bg-accent-500' : 'bg-primary-500'
              }`}>
                <i className={`${msg.role === 'assistant' ? 'ri-robot-2-line' : 'ri-user-line'} text-white text-sm`}></i>
              </div>
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                {msg.thoughts && msg.thoughts.length > 0 && (
                  <details className="mb-1.5 text-left">
                    <summary className="text-[11px] text-foreground-400 cursor-pointer select-none">
                      思考过程（{msg.thoughts.length}）
                    </summary>
                    <div className="mt-1.5 space-y-1.5">
                      {msg.thoughts.map((thought, index) => (
                        <p key={index} className="text-[11px] text-foreground-400 bg-background-50 rounded-lg px-3 py-2 leading-relaxed">
                          {thought}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5 justify-start">
                    {msg.toolCalls.map((tool) => (
                      <span key={tool} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md text-[10px] font-medium">
                        <i className="ri-tools-line"></i>
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-left ${
                  msg.role === 'assistant'
                    ? 'bg-white border border-background-200 text-foreground-800'
                    : 'bg-primary-500 text-white'
                }`}>
                  {msg.content || (msg.streaming ? '正在思考...' : '')}
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-2 h-4 ml-1 align-middle bg-accent-400 animate-pulse"></span>
                  )}
                </div>
                <p className={`text-[10px] text-foreground-400 mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                  {msg.streaming ? '生成中...' : ''}
                </p>
              </div>
            </div>
          ))}
          {detailLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center flex-shrink-0">
                <i className="ri-robot-2-line text-white text-sm"></i>
              </div>
              <div className="bg-white border border-background-200 rounded-2xl px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-accent-400 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef}></div>
        </div>

        {streamError && (
          <div className="mx-6 mb-2 px-4 py-2.5 bg-accent-50 border border-accent-200 rounded-xl text-sm text-accent-700">
            {streamError}
          </div>
        )}

        {/* Quick actions */}
        <div className="px-6 py-3 bg-white border-t border-background-200 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => void sendMessage(action.prompt)}
                disabled={streaming}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-background-100 hover:bg-background-200 rounded-lg text-xs text-foreground-600 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <i className={`${action.icon} text-sm`}></i>
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="px-6 py-4 bg-white border-t border-background-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题，例如：帮我看看有哪些候选人在等面试反馈..."
                className="w-full px-4 py-3 bg-background-100 border border-background-200 rounded-xl text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
              />
            </div>
            {streaming ? (
              <button
                onClick={stopStreaming}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-background-100 hover:bg-background-200 text-foreground-600 transition-colors cursor-pointer flex-shrink-0"
                title="停止生成"
              >
                <i className="ri-stop-circle-line text-lg"></i>
              </button>
            ) : (
              <button
                onClick={() => void sendMessage(input)}
                disabled={!input.trim()}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white transition-colors cursor-pointer flex-shrink-0"
              >
                <i className="ri-send-plane-fill text-lg"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
