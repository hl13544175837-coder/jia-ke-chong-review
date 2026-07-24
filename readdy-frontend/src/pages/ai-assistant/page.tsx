import { useState, useRef, useEffect } from 'react';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'assistant',
    content: '您好，我是智聘 AI 助手。我可以帮您：\n\n• 分析候选人简历匹配度\n• 推荐合适的招聘渠道\n• 解答招聘流程相关问题\n• 生成岗位 JD 建议\n• 分析招聘数据趋势\n\n请问有什么可以帮您的？',
    timestamp: '14:30',
  },
];

const quickActions = [
  { icon: 'ri-file-search-line', label: '简历分析', prompt: '帮我分析一下前端开发工程师的候选人简历匹配度' },
  { icon: 'ri-lightbulb-line', label: '渠道推荐', prompt: '推荐适合招聘 Java 开发工程师的渠道' },
  { icon: 'ri-draft-line', label: 'JD优化', prompt: '帮我优化一下产品经理的岗位描述' },
  { icon: 'ri-bar-chart-box-line', label: '数据分析', prompt: '分析我们最近一个月的招聘转化率' },
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: messages.length + 1,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const responses: Record<string, string> = {
        default: '收到您的请求，我来为您分析一下...\n\n根据当前数据，建议您优先关注以下候选人，他们的技能匹配度较高。',
        '简历': '我来为您分析候选人匹配度...\n\n基于岗位要求，推荐以下候选人进入下一环节：\n\n1. **陈伟** - 高级前端工程师\n   技能匹配度：92%\n   优势：React/Vue 经验丰富，有大型项目经验\n\n2. **孙明** - 前端开发工程师\n   技能匹配度：88%\n   优势：全栈经验，熟悉 Next.js\n\n建议安排陈伟进入技术面试环节。',
        '渠道': '根据 Java 开发工程师的岗位特征，推荐以下招聘渠道优先级：\n\n1. **BOSS直聘** - 技术人才活跃，响应快\n2. **猎聘网** - 中高端人才集中\n3. **内推** - 转化率最高（约45%）\n4. **拉勾网** - 互联网行业精准\n\n建议同时开放多个渠道，重点维护内推渠道。',
        'JD': '优化后的产品经理岗位描述建议：\n\n【岗位职责】\n• 负责 B 端 SaaS 产品的功能规划与迭代\n• 深入理解用户需求，产出高质量 PRD\n• 协同设计、研发团队推进产品落地\n\n【任职要求】\n• 3年以上 B 端产品经验\n• 优秀的逻辑思维与数据分析能力\n• 熟悉敏捷开发流程\n\n【加分项】\n• 有招聘/HR SaaS 行业经验\n• 掌握 SQL 基础数据分析',
        '数据': '最近一个月招聘数据分析：\n\n| 指标 | 数值 | 环比 |\n|------|------|------|\n| 简历投递量 | 450 | +12% |\n| 初筛通过率 | 40% | +3% |\n| 面试到场率 | 78% | -5% |\n| Offer接受率 | 82% | +5% |\n| 平均招聘周期 | 18天 | -3天 |\n\n建议重点关注面试到场率的下降，可考虑优化面试邀约流程。',
      };

      let reply = responses.default;
      if (text.includes('简历') || text.includes('匹配')) reply = responses['简历'];
      else if (text.includes('渠道')) reply = responses['渠道'];
      else if (text.includes('JD') || text.includes('岗位') || text.includes('描述')) reply = responses['JD'];
      else if (text.includes('数据') || text.includes('分析') || text.includes('转化率')) reply = responses['数据'];

      const aiMsg: Message = {
        id: messages.length + 2,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-background-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent-500 flex items-center justify-center">
            <i className="ri-robot-2-line text-white text-lg"></i>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground-900">AI 助手</h1>
            <p className="text-xs text-foreground-500">Powered by 智聘 AI · 招聘智能助手</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'assistant' ? 'bg-accent-500' : 'bg-primary-500'
            }`}>
              <i className={`${msg.role === 'assistant' ? 'ri-robot-2-line' : 'ri-user-line'} text-white text-sm`}></i>
            </div>
            <div className={`max-w-[70%] ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'assistant'
                  ? 'bg-white border border-background-200 text-foreground-800'
                  : 'bg-primary-500 text-white'
              }`}>
                {msg.content}
              </div>
              <p className={`text-[10px] text-foreground-400 mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center flex-shrink-0">
              <i className="ri-robot-2-line text-white text-sm"></i>
            </div>
            <div className="bg-white border border-background-200 rounded-2xl px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef}></div>
      </div>

      {/* Quick actions */}
      <div className="px-6 py-3 bg-white border-t border-background-200 flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.prompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background-100 hover:bg-background-200 rounded-lg text-xs text-foreground-600 transition-colors whitespace-nowrap cursor-pointer"
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
              placeholder="输入问题或选择上方快捷操作..."
              className="w-full px-4 py-3 bg-background-100 border border-background-200 rounded-xl text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white transition-colors cursor-pointer flex-shrink-0"
          >
            <i className="ri-send-plane-fill text-lg"></i>
          </button>
        </div>
      </div>
    </div>
  );
}