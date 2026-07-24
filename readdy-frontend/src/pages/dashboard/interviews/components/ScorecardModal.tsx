import { useState } from 'react';
import type { Interview, ScoreDimension } from '@/mocks/interviews';
import { positionJDs } from '@/mocks/interviews';

interface ScorecardModalProps {
  interview: Interview;
  mode: 'view' | 'edit';
  onClose: () => void;
  onSave?: (scores: ScoreDimension[], overall: '通过' | '不通过', feedback: string) => void;
}

export default function ScorecardModal({ interview, mode, onClose, onSave }: ScorecardModalProps) {
  const [scores, setScores] = useState<ScoreDimension[]>(
    interview.scores.map(s => ({ ...s }))
  );
  const [overall, setOverall] = useState<'通过' | '不通过' | null>(interview.overall);
  const [feedback, setFeedback] = useState(interview.feedback);
  const [observationNotes, setObservationNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'scorecard' | 'jd' | 'jdCompare'>('scorecard');

  const userRole = localStorage.getItem('zhipin-current-role');
  const isInterviewer = userRole === 'interviewer';
  const isMyInterview = interview.interviewerId === 'iv5' || interview.interviewer === '周明辉';
  const isReadonly = isInterviewer ? (mode === 'view' || !isMyInterview) : (mode === 'view');
  const jdContent = positionJDs[interview.position] || '暂无该岗位JD信息';

  const handleScoreChange = (index: number, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    const clamped = Math.max(1, Math.min(10, num));
    const updated = [...scores];
    updated[index] = { ...updated[index], score: clamped };
    setScores(updated);
  };

  const handleNoteChange = (index: number, value: string) => {
    const updated = [...scores];
    updated[index] = { ...updated[index], note: value };
    setScores(updated);
  };

  const handleSubmit = () => {
    if (!overall) return;
    const hasAllScores = scores.every(s => s.score !== null);
    if (!hasAllScores) return;
    // 面试官提交评分时，将观察记录合并到反馈中
    const finalFeedback = isInterviewer && observationNotes.trim()
      ? `【面试观察记录】\n${observationNotes.trim()}\n\n【综合评价】\n${feedback}`
      : feedback;
    onSave?.(scores, overall, finalFeedback);
  };

  const allScored = scores.every(s => s.score !== null);
  const belowStandard = scores.filter(s => s.score !== null && s.score < 6);
  const aboveStandard = scores.filter(s => s.score !== null && s.score >= 9);
  const metStandard = scores.filter(s => s.score !== null && s.score >= 6 && s.score < 9);
  const avgScore = allScored
    ? (scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length).toFixed(1)
    : '-';
  const passRate = allScored
    ? Math.round((metStandard.length + aboveStandard.length) / scores.length * 100)
    : 0;

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-foreground-400';
    if (score >= 8) return 'text-emerald-600';
    if (score >= 6) return 'text-amber-600';
    return 'text-red-500';
  };

  const getScoreBg = (score: number | null) => {
    if (score === null) return 'bg-background-100';
    if (score >= 8) return 'bg-emerald-50';
    if (score >= 6) return 'bg-amber-50';
    return 'bg-red-50';
  };

  // JD对比分析
  const jdAnalysis = (() => {
    if (!allScored) return null;
    const suggestions: string[] = [];
    if (belowStandard.length > 0) {
      const dims = belowStandard.map(s => s.dimension).join('、');
      suggestions.push(`建议JD中明确将「${dims}」设为硬性要求，或在面试环节增加专项考察。`);
    }
    if (aboveStandard.length > scores.length / 2) {
      suggestions.push('候选人多项能力远超当前JD要求，建议评估岗位层级是否需要上调，或将此候选人纳入人才储备库。');
    }
    if (interview.feedback && interview.feedback.includes('JD')) {
      const match = interview.feedback.match(/建议JD中[^。]+/);
      if (match) suggestions.push(`面试官反馈：${match[0]}。`);
    }
    if (suggestions.length === 0) {
      suggestions.push('候选人能力整体匹配JD要求，当前JD描述无需调整。');
    }
    return {
      passRate,
      avgScore,
      belowCount: belowStandard.length,
      aboveCount: aboveStandard.length,
      suggestions,
    };
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-background-200 flex-shrink-0">
          <div>
            <h3 className="text-lg font-heading font-bold text-foreground-900">
              {isInterviewer && !isReadonly ? '面试评分卡 · 面试官评分' : (mode === 'view' ? '面试评分详情' : '面试评分卡')}
            </h3>
            <p className="text-sm text-foreground-500 mt-0.5">
              {interview.candidateName} · {interview.position} · {interview.stage}
              {interview.interviewer && <span> · 面试官：{interview.interviewer}</span>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-background-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`flex-1 py-3 text-sm font-medium cursor-pointer whitespace-nowrap transition-colors border-b-2 ${
              activeTab === 'scorecard'
                ? 'text-primary-600 border-primary-500'
                : 'text-foreground-400 border-transparent hover:text-foreground-600'
            }`}
          >
            <i className={`${isInterviewer ? 'ri-survey-line' : 'ri-survey-line'} mr-1.5`}></i>{isInterviewer ? '评分与评价' : '评分卡'}
          </button>
          {!isInterviewer && (
            <button
              onClick={() => setActiveTab('jdCompare')}
              className={`flex-1 py-3 text-sm font-medium cursor-pointer whitespace-nowrap transition-colors border-b-2 ${
                activeTab === 'jdCompare'
                  ? 'text-primary-600 border-primary-500'
                  : 'text-foreground-400 border-transparent hover:text-foreground-600'
              }`}
            >
              <i className="ri-file-search-line mr-1.5"></i>JD匹配分析
            </button>
          )}
          <button
            onClick={() => setActiveTab('jd')}
            className={`flex-1 py-3 text-sm font-medium cursor-pointer whitespace-nowrap transition-colors border-b-2 ${
              activeTab === 'jd'
                ? 'text-primary-600 border-primary-500'
                : 'text-foreground-400 border-transparent hover:text-foreground-600'
            }`}
          >
            <i className="ri-file-text-line mr-1.5"></i>岗位JD
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {activeTab === 'scorecard' && (
            <div className="p-6 space-y-5">
              {/* Interviewer: 面试观察记录区（评分前先记录面试印象）*/}
              {isInterviewer && !isReadonly && (
                <div className="bg-accent-50/60 rounded-xl border border-accent-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <i className="ri-quill-pen-line text-accent-600 text-lg"></i>
                    <p className="text-sm font-semibold text-accent-700">面试观察与记录</p>
                    <span className="text-[11px] text-accent-500 ml-1">面试官专用</span>
                  </div>
                  <p className="text-xs text-accent-600 mb-3 leading-relaxed">
                    请记录面试过程中的关键观察，包括候选人的言谈举止、技术深度、沟通风格、对岗位的理解程度等。这些记录将作为评分依据。
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-accent-700 mb-1.5">
                        <i className="ri-star-line mr-1"></i>候选人亮点
                      </label>
                      <textarea
                        value={observationNotes}
                        onChange={e => setObservationNotes(e.target.value)}
                        placeholder="例如：技术基础扎实，对React源码有深入理解；沟通表达逻辑清晰，能主动引导讨论方向；对业务的思考超出预期..."
                        rows={4}
                        maxLength={800}
                        className="w-full px-4 py-3 text-sm border border-accent-200 rounded-lg focus:outline-none focus:border-accent-400 resize-none bg-white placeholder:text-foreground-300"
                      ></textarea>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-accent-500">
                    <i className="ri-information-line"></i>
                    <span>此观察记录将在提交评分时自动附加到综合评价中</span>
                  </div>
                </div>
              )}

              {/* Score summary */}
              {(mode === 'view' || (isInterviewer && isReadonly)) && allScored && (
                <div className="bg-background-50 rounded-xl p-4 flex items-center gap-5">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground-900">{avgScore}</p>
                    <p className="text-xs text-foreground-400 mt-0.5">平均分</p>
                  </div>
                  <div className="w-px h-10 bg-background-200"></div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${overall === '通过' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {overall === '通过' ? '通过' : overall === '不通过' ? '不通过' : '-'}
                    </p>
                    <p className="text-xs text-foreground-400 mt-0.5">综合评定</p>
                  </div>
                  <div className="w-px h-10 bg-background-200"></div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${belowStandard.length > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {belowStandard.length}
                    </p>
                    <p className="text-xs text-foreground-400 mt-0.5">不达标项</p>
                  </div>
                </div>
              )}

              {/* Interviewer editing: prominent scoring prompt */}
              {isInterviewer && !isReadonly && allScored && (
                <div className="bg-background-50 rounded-xl p-4 flex items-center gap-5">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground-900">{avgScore}</p>
                    <p className="text-xs text-foreground-400 mt-0.5">当前平均分</p>
                  </div>
                  <div className="w-px h-10 bg-background-200"></div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground-900">{scores.length}</p>
                    <p className="text-xs text-foreground-400 mt-0.5">已评维度</p>
                  </div>
                  <div className="w-px h-10 bg-background-200"></div>
                  <div className="flex-1">
                    <p className="text-xs text-foreground-500 leading-relaxed">
                      请核对各维度评分，确保每个维度的评分都有明确的观察依据。完成后选择综合评定并提交。
                    </p>
                  </div>
                </div>
              )}

              {/* Score dimensions */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm font-medium text-foreground-700">评分维度（1-10分）</p>
                  {isInterviewer && !isReadonly && (
                    <span className="text-[11px] px-2 py-0.5 bg-accent-100 text-accent-600 rounded-full font-medium">请逐项评分</span>
                  )}
                </div>
                <div className="space-y-3">
                  {scores.map((dim, idx) => (
                    <div
                      key={dim.dimension}
                      className={`rounded-xl border p-4 transition-colors ${
                        dim.score !== null && dim.score < 6
                          ? 'border-red-200 bg-red-50/50'
                          : dim.score !== null && isInterviewer && !isReadonly
                          ? 'border-accent-200 bg-accent-50/30'
                          : 'border-background-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground-800">{dim.dimension}</span>
                          {dim.score !== null && dim.score < 6 && (
                            <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">不达标</span>
                          )}
                          {dim.score !== null && dim.score >= 8 && (
                            <span className="text-[11px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium">优秀</span>
                          )}
                          {isInterviewer && !isReadonly && dim.score === null && (
                            <span className="text-[11px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">待评分</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isReadonly ? (
                            <span className={`text-lg font-bold ${getScoreColor(dim.score)}`}>
                              {dim.score ?? '-'}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {isInterviewer && (
                                <div className="flex items-center gap-0.5 mr-1">
                                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                    <button
                                      key={n}
                                      onClick={() => handleScoreChange(idx, String(n))}
                                      className={`w-7 h-7 rounded-md text-xs font-bold cursor-pointer transition-all ${
                                        dim.score === n
                                          ? n >= 8 ? 'bg-emerald-500 text-white shadow-sm' : n >= 6 ? 'bg-amber-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm'
                                          : 'bg-background-100 text-foreground-400 hover:bg-background-200 hover:text-foreground-600'
                                      }`}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!isInterviewer && (
                                <>
                                  <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={dim.score ?? ''}
                                    onChange={e => handleScoreChange(idx, e.target.value)}
                                    placeholder="-"
                                    className={`w-14 text-center px-2 py-1.5 rounded-lg border text-sm font-bold focus:outline-none focus:border-primary-400 transition-colors ${
                                      dim.score !== null && dim.score < 6 ? 'border-red-300 bg-red-50' : 'border-background-300 bg-white'
                                    }`}
                                  />
                                  <span className="text-xs text-foreground-400">/ 10</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Score bar */}
                      {dim.score !== null && (
                        <div className="w-full h-1.5 rounded-full bg-background-200 mb-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              dim.score >= 8 ? 'bg-emerald-500' : dim.score >= 6 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${(dim.score / 10) * 100}%` }}
                          ></div>
                        </div>
                      )}
                      {/* Notes */}
                      {isReadonly ? (
                        dim.note ? (
                          <p className="text-sm text-foreground-500 mt-1 leading-relaxed">{dim.note}</p>
                        ) : (
                          <p className="text-xs text-foreground-300 italic mt-1">暂无备注</p>
                        )
                      ) : (
                        <textarea
                          value={dim.note}
                          onChange={e => handleNoteChange(idx, e.target.value)}
                          placeholder={isInterviewer ? '该维度的具体评价依据，如候选人的回答、表现、代码质量等...' : '添加评分备注（该维度表现的具体说明）...'}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-background-200 rounded-lg focus:outline-none focus:border-primary-400 resize-none bg-background-50 placeholder:text-foreground-300"
                        ></textarea>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Overall & Feedback */}
              {!isReadonly && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-foreground-700 mb-2">
                      {isInterviewer ? '面试结果评定' : '综合评定'} <span className="text-red-500">*</span>
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setOverall('通过')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
                          overall === '通过'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-background-100 text-foreground-600 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                      >
                        <i className="ri-check-line mr-1"></i>通过
                      </button>
                      <button
                        onClick={() => setOverall('不通过')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
                          overall === '不通过'
                            ? 'bg-red-500 text-white'
                            : 'bg-background-100 text-foreground-600 hover:bg-red-50 hover:text-red-600'
                        }`}
                      >
                        <i className="ri-close-line mr-1"></i>不通过
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground-700 mb-2">
                      {isInterviewer ? '综合评价与录用建议' : '综合评价'}
                    </p>
                    <textarea
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      placeholder={isInterviewer ? '基于面试观察给出综合评价，包括是否推荐录用、建议的岗位级别和薪酬范围参考...' : '请填写综合评价，包括候选人优势、不足及后续建议...'}
                      rows={4}
                      maxLength={500}
                      className="w-full px-4 py-3 text-sm border border-background-200 rounded-lg focus:outline-none focus:border-primary-400 resize-none placeholder:text-foreground-300"
                    ></textarea>
                    <p className="text-xs text-foreground-400 mt-1 text-right">{feedback.length}/500</p>
                  </div>
                </div>
              )}

              {/* Read-only feedback */}
              {isReadonly && interview.feedback && (
                <div className="bg-background-50 rounded-xl p-4">
                  <p className="text-sm font-medium text-foreground-700 mb-2">{isInterviewer ? '面试官评语' : '综合评价'}</p>
                  <p className="text-sm text-foreground-600 leading-relaxed whitespace-pre-wrap">{interview.feedback}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'jdCompare' && (
            <div className="p-6 space-y-5">
              {!allScored ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
                    <i className="ri-file-search-line text-foreground-400 text-xl"></i>
                  </div>
                  <p className="text-sm text-foreground-500">面试官尚未完成评分，暂无法生成JD匹配分析</p>
                </div>
              ) : (
                <>
                  {/* Match Overview */}
                  <div className="bg-background-50 rounded-xl p-5">
                    <p className="text-sm font-medium text-foreground-800 mb-4">匹配度总览</p>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-foreground-900">{jdAnalysis?.passRate}%</p>
                        <p className="text-xs text-foreground-400 mt-0.5">达标率</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-foreground-900">{jdAnalysis?.avgScore}</p>
                        <p className="text-xs text-foreground-400 mt-0.5">平均分</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${overall === '通过' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {overall === '通过' ? '通过' : '不通过'}
                        </p>
                        <p className="text-xs text-foreground-400 mt-0.5">综合评定</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${(jdAnalysis?.belowCount ?? 0) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                          {jdAnalysis?.belowCount}
                        </p>
                        <p className="text-xs text-foreground-400 mt-0.5">不达标项</p>
                      </div>
                    </div>
                  </div>

                  {/* Below standard items */}
                  {belowStandard.length > 0 && (
                    <div className="bg-red-50/60 rounded-xl border border-red-200 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="ri-error-warning-line text-red-500"></i>
                        <p className="text-sm font-medium text-red-700">不达标项 · 当前JD可能要求不足</p>
                      </div>
                      <div className="space-y-3">
                        {belowStandard.map(s => (
                          <div key={s.dimension} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-red-100">
                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-red-600">{s.score}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground-800">{s.dimension}</p>
                              <p className="text-xs text-foreground-500 mt-1">{s.note || '面试官未填写备注'}</p>
                            </div>
                            <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">不达标</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 p-3 bg-red-100/50 rounded-lg">
                        <p className="text-xs text-red-700">
                          <i className="ri-lightbulb-line mr-1"></i>
                          建议：在JD中将上述能力明确列为硬性要求，或在面试环节增加专项考察。
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Above standard items */}
                  {aboveStandard.length > 0 && (
                    <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="ri-star-line text-emerald-500"></i>
                        <p className="text-sm font-medium text-emerald-700">优秀/超出项 · 候选人能力超过当前JD</p>
                      </div>
                      <div className="space-y-3">
                        {aboveStandard.map(s => (
                          <div key={s.dimension} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-emerald-100">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-emerald-600">{s.score}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground-800">{s.dimension}</p>
                              <p className="text-xs text-foreground-500 mt-1">{s.note || '面试官未填写备注'}</p>
                            </div>
                            <span className="text-[11px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">优秀</span>
                          </div>
                        ))}
                      </div>
                      {aboveStandard.length > scores.length / 2 && (
                        <div className="mt-3 p-3 bg-emerald-100/50 rounded-lg">
                          <p className="text-xs text-emerald-700">
                            <i className="ri-lightbulb-line mr-1"></i>
                            该候选人多项能力远超当前JD要求，建议评估岗位层级是否需要上调。
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Met standard items */}
                  {metStandard.length > 0 && (
                    <div className="bg-background-50 rounded-xl border border-background-200 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="ri-check-line text-foreground-500"></i>
                        <p className="text-sm font-medium text-foreground-700">达标项 · 符合JD要求</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {metStandard.map(s => (
                          <span key={s.dimension} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-background-200 text-xs text-foreground-600">
                            <span className="font-medium">{s.dimension}</span>
                            <span className="text-amber-600 font-bold">{s.score}分</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* JD adjustment suggestions */}
                  {jdAnalysis && jdAnalysis.suggestions.length > 0 && (
                    <div className="bg-primary-50/60 rounded-xl border border-primary-200 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="ri-lightbulb-line text-primary-500"></i>
                        <p className="text-sm font-medium text-primary-700">JD调整建议</p>
                      </div>
                      <ul className="space-y-2">
                        {jdAnalysis.suggestions.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-primary-700">
                            <span className="text-primary-400 mt-0.5">{i + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'jd' && (
            /* JD Tab */
            <div className="p-6">
              <div className="bg-background-50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-file-text-line text-primary-500"></i>
                  <span className="text-sm font-medium text-foreground-700">{interview.position} · 岗位JD</span>
                </div>
                <pre className="text-sm text-foreground-600 leading-relaxed whitespace-pre-wrap font-sans">{jdContent}</pre>
              </div>
              <div className="mt-4 p-4 bg-primary-50 rounded-xl">
                <div className="flex items-start gap-3">
                  <i className="ri-lightbulb-line text-primary-500 text-lg mt-0.5"></i>
                  <div>
                    <p className="text-sm font-medium text-primary-700 mb-1">JD匹配建议</p>
                    <p className="text-xs text-primary-600 leading-relaxed">
                      面试后请结合候选人在各维度的实际表现，对照JD要求评估匹配度。若多项核心能力不达标，建议与用人部门沟通是否需要调整JD中对应的硬性要求或权重。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isReadonly && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-background-200 bg-background-50 rounded-b-2xl flex-shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-foreground-600 hover:text-foreground-800 bg-white border border-background-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allScored || !overall}
              className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-2 ${
                allScored && overall
                  ? isInterviewer ? 'bg-accent-500 hover:bg-accent-600' : 'bg-primary-500 hover:bg-primary-600'
                  : 'bg-background-300 text-foreground-400 cursor-not-allowed'
              }`}
            >
              <i className="ri-check-double-line"></i>
              {isInterviewer ? '提交面试评分' : '提交评分'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}