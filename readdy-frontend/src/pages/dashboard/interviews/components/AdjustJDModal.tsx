import { useState } from 'react';
import type { Interview } from '@/mocks/interviews';
import { positionJDs } from '@/mocks/interviews';

interface Props {
  interview: Interview;
  onClose: () => void;
  onSave: (position: string, newJd: string) => void;
}

export default function AdjustJDModal({ interview, onClose, onSave }: Props) {
  const currentJD = positionJDs[interview.position] || '';
  const [jdContent, setJdContent] = useState(currentJD);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      onSave(interview.position, jdContent);
      setSaving(false);
    }, 400);
  };

  const feedbackSuggestions = extractSuggestions(interview.feedback);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[720px] mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-background-200">
          <div>
            <h3 className="text-lg font-heading font-bold text-foreground-900">调整岗位需求与 JD</h3>
            <p className="text-xs text-foreground-500 mt-0.5">
              候选人：{interview.candidateName} · 岗位：{interview.position} · 面试官：{interview.interviewer}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 cursor-pointer transition-colors">
            <i className="ri-close-line text-foreground-500"></i>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 面试结果摘要 */}
          <div className={`rounded-xl border p-4 ${interview.overall === '通过' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${interview.overall === '通过' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <i className={`${interview.overall === '通过' ? 'ri-check-double-line text-emerald-600' : 'ri-close-circle-line text-rose-600'}`}></i>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-900">
                  面试结果：{interview.overall}
                </p>
                <p className="text-xs text-foreground-500">
                  {interview.scores.filter(s => s.score !== null).length} / {interview.scores.length} 个维度已评分
                  {interview.scores.filter(s => s.score !== null).length > 0 && (
                    <span className="ml-2">
                      平均分：
                      <strong className={interview.overall === '通过' ? 'text-emerald-700' : 'text-rose-700'}>
                        {(interview.scores.filter(s => s.score !== null).reduce((a, s) => a + (s.score || 0), 0) / interview.scores.filter(s => s.score !== null).length).toFixed(1)}
                      </strong>
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 评分维度明细 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {interview.scores.map((score, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-background-100 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground-600">{score.dimension}</span>
                    <span className={`text-xs font-bold ${(score.score || 0) >= 7 ? 'text-emerald-600' : (score.score || 0) >= 5 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {score.score !== null ? `${score.score}/${score.max}` : '未评'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-background-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(score.score || 0) >= 7 ? 'bg-emerald-400' : (score.score || 0) >= 5 ? 'bg-amber-400' : 'bg-rose-400'}`}
                      style={{ width: `${((score.score || 0) / score.max) * 100}%` }}
                    />
                  </div>
                  {score.note && <p className="text-[11px] text-foreground-500 mt-1.5 leading-relaxed">{score.note}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* 面试官反馈 */}
          <div className="bg-accent-50 rounded-xl border border-accent-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="ri-chat-quote-line text-accent-600"></i>
              <p className="text-sm font-semibold text-accent-700">面试官反馈</p>
            </div>
            <p className="text-sm text-accent-800 leading-relaxed">{interview.feedback || '暂无反馈内容'}</p>
          </div>

          {/* 系统提取的JD调整建议 */}
          {feedbackSuggestions.length > 0 && (
            <div className="bg-primary-50 rounded-xl border border-primary-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <i className="ri-lightbulb-line text-primary-600"></i>
                <p className="text-sm font-semibold text-primary-700">系统提取的 JD 调整建议</p>
              </div>
              <ul className="space-y-1.5">
                {feedbackSuggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-primary-600">{i + 1}</span>
                    </span>
                    <p className="text-sm text-primary-800">{s}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 当前 JD 编辑区 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground-800">岗位 JD 内容</p>
              <span className="text-xs text-foreground-400">修改后将同步至该岗位的所有面试记录</span>
            </div>
            <textarea
              value={jdContent}
              onChange={(e) => setJdContent(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 bg-white border border-background-200 rounded-xl text-sm text-foreground-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-300 resize-y"
              placeholder="在此编辑岗位 JD..."
            />
            <p className="text-xs text-foreground-400 mt-1">{jdContent.length} 字符</p>
          </div>

          {/* 调整记录（假数据） */}
          <div className="border-t border-background-200 pt-4">
            <p className="text-sm font-semibold text-foreground-800 mb-3">该岗位 JD 调整历史</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-background-300 mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-xs text-foreground-500">2026-07-10 由 张敏 调整</p>
                  <p className="text-sm text-foreground-700 mt-0.5">将"1年以上经验"调整为"2年以上经验"</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-background-300 mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-xs text-foreground-500">2026-06-28 由 李华 调整</p>
                  <p className="text-sm text-foreground-700 mt-0.5">新增"熟悉 CI/CD 流程"至任职要求</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-background-200">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-foreground-600 bg-white border border-background-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors hover:bg-background-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || jdContent === currentJD}
            className="px-4 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 disabled:bg-background-300 disabled:text-foreground-400 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                保存中...
              </>
            ) : (
              <>
                <i className="ri-save-line"></i>
                保存 JD 调整
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function extractSuggestions(feedback: string): string[] {
  const suggestions: string[] = [];
  if (feedback.includes('建议JD')) {
    const match = feedback.match(/建议JD[^，。]*[，。]/);
    if (match) suggestions.push(match[0].trim());
  }
  if (feedback.includes('硬性要求')) {
    suggestions.push('根据面试官反馈，将相关能力要求设为硬性条件');
  }
  if (feedback.includes('差距较大') || feedback.includes('不足')) {
    suggestions.push('结合评分短板维度，补充或强化 JD 中对应的能力要求描述');
  }
  if (suggestions.length === 0) {
    suggestions.push('请仔细阅读面试官反馈，根据评分短板维度调整 JD 任职要求');
  }
  return suggestions;
}