import { useState } from 'react';
import type { InterviewerInterview } from '@/mocks/interviewer';
import { myCandidates, myPositions } from '@/mocks/interviewer';
import { positionJDs, pastInterviewEvaluations } from '@/mocks/interviews';
import { candidateList, type Candidate } from '@/mocks/candidates';

interface InterviewDetailDrawerProps {
  interview: InterviewerInterview;
  onClose: () => void;
  initialTab?: 'info' | 'position' | 'feedback' | 'history' | 'resume';
  onReschedule?: () => void;
}

const statusBadgeMap: Record<string, string> = {
  '待确认': 'bg-amber-50 text-amber-700 border border-amber-200',
  '待面试': 'bg-primary-50 text-primary-700 border border-primary-200',
  '待反馈': 'bg-accent-50 text-accent-700 border border-accent-200',
  '已完成': 'bg-background-100 text-foreground-500 border border-background-200',
};

const statusLabelMap: Record<string, string> = {
  '待确认': '待确认',
  '待面试': '待面试',
  '待反馈': '待提交反馈',
  '已完成': '已完成',
};

const tabs = [
  { key: 'info' as const, label: '面试信息', icon: 'ri-information-line' },
  { key: 'position' as const, label: '岗位详情', icon: 'ri-briefcase-line' },
  { key: 'resume' as const, label: '简历详情', icon: 'ri-file-user-line' },
  { key: 'feedback' as const, label: '评分反馈', icon: 'ri-survey-line' },
  { key: 'history' as const, label: '过往评价', icon: 'ri-history-line' },
];

export default function InterviewDetailDrawer({ interview, onClose, initialTab = 'info', onReschedule }: InterviewDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'position' | 'feedback' | 'history' | 'resume'>(initialTab);

  const candidate = myCandidates.find(
    (c) => c.name === interview.candidateName && c.position === interview.position
  );
  const fullCandidate: Candidate | undefined = candidateList.find(
    (c) => c.name === interview.candidateName
  );
  const position = myPositions.find(
    (p) => p.id === interview.reqId
  );
  const jdText = position?.jd || positionJDs[interview.position] || '暂无岗位描述';

  const hasScores = interview.scores && interview.scores.some((s) => s.score !== null);

  const pastEvals = pastInterviewEvaluations[interview.candidateName] || [];
  const hasPastEvals = pastEvals.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-[600px] bg-white shadow-xl h-full overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 border-b border-background-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary-600">{interview.candidateAvatar}</span>
            </div>
            <div>
              <h3 className="text-base font-heading font-bold text-foreground-900">{interview.candidateName}</h3>
              <p className="text-xs text-foreground-500">{interview.position}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-foreground-500"></i>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Status badge */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusBadgeMap[interview.status] || 'bg-background-100 text-foreground-500'}`}>
              {statusLabelMap[interview.status] || interview.status}
            </span>
            {interview.overall && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                interview.overall === '通过'
                  ? 'bg-primary-50 text-primary-700 border border-primary-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {interview.overall}
              </span>
            )}
            {hasPastEvals && (
              <span className="text-xs text-foreground-400">
                已通过 {pastEvals.length} 轮面试
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
                  activeTab === tab.key ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
                }`}
              >
                <i className={`${tab.icon} text-[11px]`}></i>
                {tab.label}
                {tab.key === 'history' && hasPastEvals && (
                  <span className={`ml-0.5 text-[10px] px-1 py-0.5 rounded-full ${
                    activeTab === tab.key ? 'bg-background-100 text-foreground-600' : 'bg-background-200/70 text-foreground-400'
                  }`}>
                    {pastEvals.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Candidate Summary */}
              <div className="bg-background-50 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">候选人信息</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-foreground-400">姓名</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.candidateName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">应聘岗位</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.position}</p>
                  </div>
                  {candidate && (
                    <>
                      <div>
                        <p className="text-[11px] text-foreground-400">工作年限</p>
                        <p className="text-sm font-medium text-foreground-800">{candidate.experienceYears}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">学历</p>
                        <p className="text-sm font-medium text-foreground-800">{candidate.education}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">当前状态</p>
                        <p className="text-sm font-medium text-foreground-800">{candidate.currentStage}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">投递时间</p>
                        <p className="text-sm font-medium text-foreground-800">{candidate.appliedAt}</p>
                      </div>
                      {candidate.skills.length > 0 && (
                        <div className="col-span-2">
                          <p className="text-[11px] text-foreground-400 mb-1.5">技能标签</p>
                          <div className="flex flex-wrap gap-1.5">
                            {candidate.skills.map((skill) => (
                              <span key={skill} className="text-xs px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-100">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="col-span-2">
                        <p className="text-[11px] text-foreground-400 mb-1">简历摘要</p>
                        <p className="text-sm text-foreground-700 leading-relaxed">{candidate.resumeSummary}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Interview Details */}
              <div className="bg-background-50 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">本场面试安排</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-foreground-400">面试轮次</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.stage}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">面试形式</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.type}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">日期</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.scheduledAt.slice(0, 10)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">时间</p>
                    <p className="text-sm font-medium text-foreground-800">
                      {interview.scheduledAt.slice(11, 16)} - {interview.scheduledEndAt.slice(11, 16)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] text-foreground-400">地点/链接</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.location}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] text-foreground-400">关联需求</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.reqName || '未关联'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${interview.jdSent ? 'bg-primary-400' : 'bg-background-300'}`}></div>
                    <span className="text-xs text-foreground-500">{interview.jdSent ? 'JD已发送' : 'JD未发送'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${interview.scorecardSent ? 'bg-primary-400' : 'bg-background-300'}`}></div>
                    <span className="text-xs text-foreground-500">{interview.scorecardSent ? '评分表已发送' : '评分表未发送'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Position Tab */}
          {activeTab === 'position' && (
            <div className="space-y-4">
              {/* JD */}
              <div className="bg-background-50 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">岗位描述</h4>
                <div className="text-sm text-foreground-700 leading-relaxed whitespace-pre-wrap">{jdText}</div>
              </div>

              {/* Interview Process */}
              {position && position.interviewProcess && (
                <div className="bg-background-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">面试流程</h4>
                  <p className="text-sm text-foreground-700">{position.interviewProcess}</p>
                </div>
              )}

              {/* Focus Points */}
              {position && position.focusPoints.length > 0 && (
                <div className="bg-background-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">面试考察重点</h4>
                  <ul className="space-y-1.5">
                    {position.focusPoints.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-foreground-700">
                        <span className="text-accent-500 mt-0.5 flex-shrink-0">
                          <i className="ri-focus-2-line text-xs"></i>
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Resume Tab — Full candidate profile from candidates.ts */}
          {activeTab === 'resume' && (
            <div className="space-y-4">
              {fullCandidate ? (
                <>
                  {/* Personal Info */}
                  <div className="bg-background-50 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">基本信息</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] text-foreground-400">姓名</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.name}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">性别/年龄</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.gender} / {fullCandidate.age}岁</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">手机</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.phone}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">邮箱</p>
                        <p className="text-sm font-medium text-foreground-800 truncate">{fullCandidate.email}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">工作年限</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.experienceYears}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">学历</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.education}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">应聘来源</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.source}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">投递时间</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.appliedAt}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-foreground-400">当前阶段</p>
                        <p className="text-sm font-medium text-foreground-800">{fullCandidate.stage}</p>
                      </div>
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="bg-background-50 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">技能标签</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {fullCandidate.skills.map((skill) => (
                        <span key={skill} className="text-xs px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-100">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Professional Summary */}
                  <div className="bg-background-50 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">个人总结</h4>
                    <p className="text-sm text-foreground-700 leading-relaxed">{fullCandidate.summary}</p>
                  </div>

                  {/* Work History */}
                  {fullCandidate.workHistory.length > 0 && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">工作经历</h4>
                      <div className="relative pl-5 border-l-2 border-background-200 space-y-4">
                        {fullCandidate.workHistory.map((work, idx) => (
                          <div key={idx} className="relative">
                            <div className="absolute -left-[25px] w-2.5 h-2.5 rounded-full border-2 border-white bg-primary-400"></div>
                            <div>
                              <p className="text-sm font-semibold text-foreground-800">{work.role}</p>
                              <p className="text-xs text-foreground-500">{work.company} · {work.period}</p>
                              <ul className="mt-1.5 space-y-1">
                                {work.highlights.map((h, hi) => (
                                  <li key={hi} className="text-xs text-foreground-700 flex items-start gap-1.5">
                                    <span className="text-accent-500 mt-0.5 flex-shrink-0">
                                      <i className="ri-check-line text-[10px]"></i>
                                    </span>
                                    {h}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {fullCandidate.educationHistory.length > 0 && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">教育背景</h4>
                      <div className="space-y-2.5">
                        {fullCandidate.educationHistory.map((edu, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-accent-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <i className="ri-graduation-cap-line text-sm text-accent-600"></i>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground-800">{edu.school}</p>
                              <p className="text-xs text-foreground-500">{edu.degree} · {edu.major} · {edu.period}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Projects */}
                  {fullCandidate.projects && fullCandidate.projects.length > 0 && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">项目经验</h4>
                      <div className="space-y-3">
                        {fullCandidate.projects.map((proj, idx) => (
                          <div key={idx} className="border border-background-200 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-sm font-semibold text-foreground-800">{proj.name}</p>
                              <span className="text-xs text-foreground-500 bg-background-100 px-2 py-0.5 rounded-full">{proj.role}</span>
                            </div>
                            <p className="text-xs text-foreground-600 leading-relaxed">{proj.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {fullCandidate.certifications && fullCandidate.certifications.length > 0 && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">证书与资质</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {fullCandidate.certifications.map((cert) => (
                          <span key={cert} className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                            {cert}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Languages */}
                  {fullCandidate.languages && fullCandidate.languages.length > 0 && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">语言能力</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {fullCandidate.languages.map((lang) => (
                          <span key={lang} className="text-xs px-2 py-0.5 rounded-full bg-background-100 text-foreground-600 border border-background-200">
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-background-50 rounded-xl p-8 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
                    <i className="ri-file-user-line text-xl text-foreground-400"></i>
                  </div>
                  <p className="text-sm text-foreground-500 font-medium">暂无完整简历数据</p>
                  <p className="text-xs text-foreground-400 mt-1">该候选人的详细简历尚未录入系统</p>
                </div>
              )}
            </div>
          )}

          {/* Feedback Tab */}
          {activeTab === 'feedback' && (
            <div className="space-y-4">
              {hasScores ? (
                <>
                  <div className="bg-background-50 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">维度评分</h4>
                    <div className="space-y-2.5">
                      {interview.scores!.filter((s) => s.score !== null).map((s) => (
                        <div key={s.dimension} className="flex items-center justify-between">
                          <span className="text-sm text-foreground-700">{s.dimension}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-1.5 bg-background-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  (s.score || 0) >= 8 ? 'bg-primary-400' : (s.score || 0) >= 6 ? 'bg-amber-400' : 'bg-red-400'
                                }`}
                                style={{ width: `${((s.score || 0) / s.max) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-semibold text-foreground-800 w-6 text-right">{s.score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {interview.scores!.filter((s) => s.note).length > 0 && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-2.5">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">评分备注</h4>
                      <div className="space-y-2">
                        {interview.scores!.filter((s) => s.note).map((s) => (
                          <div key={s.dimension} className="flex items-start gap-2 text-sm">
                            <span className="text-foreground-500 flex-shrink-0 font-medium">{s.dimension}：</span>
                            <span className="text-foreground-700">{s.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {interview.feedback && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">综合评价</h4>
                      <p className="text-sm text-foreground-700 leading-relaxed">{interview.feedback}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-background-50 rounded-xl p-8 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
                    <i className="ri-survey-line text-xl text-foreground-400"></i>
                  </div>
                  <p className="text-sm text-foreground-500 font-medium">暂无评分反馈</p>
                  <p className="text-xs text-foreground-400 mt-1">面试完成后将在此展示评分与反馈</p>
                </div>
              )}
            </div>
          )}

          {/* History Tab — Past evaluations from other interviewers */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {hasPastEvals ? (
                pastEvals.map((ev, idx) => {
                  const avgScore = ev.scores.reduce((sum, s) => sum + s.score, 0) / ev.scores.length;
                  const maxScore = Math.max(...ev.scores.map(s => s.score));
                  const minScore = Math.min(...ev.scores.map(s => s.score));

                  return (
                    <div key={idx} className="bg-background-50 rounded-xl overflow-hidden">
                      {/* Eval header */}
                      <div className="px-4 py-3 border-b border-background-200/70">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-accent-700">{ev.interviewerAvatar}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground-800">{ev.roundLabel}</p>
                              <p className="text-xs text-foreground-500">{ev.interviewer} · {ev.interviewerRole}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground-800">{avgScore.toFixed(1)}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              ev.overall === '通过'
                                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {ev.overall}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Eval body */}
                      <div className="p-4 space-y-3">
                        {/* Meta row */}
                        <div className="flex items-center gap-4 text-xs text-foreground-500">
                          <span className="flex items-center gap-1">
                            <i className="ri-calendar-line text-[11px]"></i>
                            {ev.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <i className="ri-video-line text-[11px]"></i>
                            {ev.type}
                          </span>
                          <span className="flex items-center gap-1">
                            <i className="ri-map-pin-line text-[11px]"></i>
                            {ev.location}
                          </span>
                        </div>

                        {/* Summary bar */}
                        <div className="flex items-center gap-4 bg-white rounded-lg px-3 py-2 border border-background-100">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-foreground-400">最高</span>
                            <span className="text-sm font-semibold text-primary-600">{maxScore}</span>
                          </div>
                          <div className="w-px h-4 bg-background-200"></div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-foreground-400">平均</span>
                            <span className="text-sm font-semibold text-foreground-800">{avgScore.toFixed(1)}</span>
                          </div>
                          <div className="w-px h-4 bg-background-200"></div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-foreground-400">最低</span>
                            <span className="text-sm font-semibold text-amber-600">{minScore}</span>
                          </div>
                        </div>

                        {/* Dimension scores */}
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wide">维度评分</p>
                          {ev.scores.map((s) => (
                            <div key={s.dimension}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-foreground-700">{s.dimension}</span>
                                <span className={`text-xs font-semibold ${
                                  s.score >= 8 ? 'text-primary-600' : s.score >= 6 ? 'text-amber-600' : 'text-red-600'
                                }`}>{s.score}/{s.max}</span>
                              </div>
                              <div className="w-full h-1.5 bg-background-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    s.score >= 8 ? 'bg-primary-400' : s.score >= 6 ? 'bg-amber-400' : 'bg-red-400'
                                  }`}
                                  style={{ width: `${(s.score / s.max) * 100}%` }}
                                ></div>
                              </div>
                              <p className="text-xs text-foreground-500 mt-1 leading-relaxed">{s.note}</p>
                            </div>
                          ))}
                        </div>

                        {/* Comprehensive feedback */}
                        <div>
                          <p className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wide mb-1.5">综合评价</p>
                          <p className="text-sm text-foreground-700 leading-relaxed">{ev.feedback}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-background-50 rounded-xl p-8 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
                    <i className="ri-history-line text-xl text-foreground-400"></i>
                  </div>
                  <p className="text-sm text-foreground-500 font-medium">暂无过往评价</p>
                  <p className="text-xs text-foreground-400 mt-1">该候选人为首轮面试，尚未有其他面试官的评价记录</p>
                </div>
              )}
            </div>
          )}

          {/* Candidate Timeline */}
          {candidate && candidate.timeline.length > 0 && (
            <div className="bg-background-50 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">候选人历程</h4>
              <div className="relative pl-6 border-l-2 border-background-200 space-y-3">
                {candidate.timeline.map((event, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[25px] w-2.5 h-2.5 rounded-full border-2 border-white bg-background-300"></div>
                    <div>
                      <p className="text-[11px] text-foreground-400">{event.date}</p>
                      <p className="text-sm font-medium text-foreground-800 mt-0.5">{event.event}</p>
                      <p className="text-xs text-foreground-500 mt-1 leading-relaxed">{event.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-background-200 px-6 py-4 flex items-center justify-between gap-3">
          {onReschedule ? (
            <button
              onClick={onReschedule}
              className="px-4 py-2.5 text-sm font-medium border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5"
            >
              <i className="ri-calendar-event-line text-sm"></i>
              申请改约
            </button>
          ) : (
            <div></div>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium bg-background-100 hover:bg-background-200 text-foreground-600 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}