import { useEffect } from 'react';

// ── Types ──────────────────────────────────────────────

interface ResumeData {
  name: string;
  gender: string;
  age: number;
  phone: string;
  email: string;
  source: string;
  appliedAt: string;
  experienceYears: string;
  summary: string;
  skills: string[];
  workHistory: Array<{ company: string; role: string; period: string; highlights: string[] }>;
  educationHistory: Array<{ school: string; degree: string; major: string; period: string }>;
}

interface ReqCandidate {
  id: string;
  name: string;
  position: string;
  source: string;
  stage: string;
  lastUpdate: string;
  interviewRound?: string;
  interviewer?: string;
  interviewTime?: string;
}

interface CandidateQuickDetailProps {
  candidate: ReqCandidate | null;
  resumeData: ResumeData | null;
  onClose: () => void;
}

// ── Stage tag colors ───────────────────────────────────

const stageTagColors: Record<string, string> = {
  '待筛选': 'bg-secondary-100 text-secondary-700',
  '初筛通过': 'bg-primary-100 text-primary-700',
  '面试官评审中': 'bg-accent-100 text-accent-700',
  '一面': 'bg-accent-100 text-accent-700',
  '一面待进行': 'bg-primary-100 text-primary-700',
  '二面': 'bg-accent-100 text-accent-700',
  '二面待进行': 'bg-primary-100 text-primary-700',
  '终面': 'bg-accent-100 text-accent-800',
  '终面待进行': 'bg-primary-100 text-primary-700',
  '面试中': 'bg-primary-100 text-primary-700',
  '谈薪中': 'bg-accent-100 text-accent-700',
  '沟通中': 'bg-primary-100 text-primary-700',
  'Offer发放中': 'bg-primary-100 text-primary-700',
  'Offer': 'bg-primary-100 text-primary-700',
  '正式到岗中': 'bg-primary-50 text-primary-600',
  '待入职': 'bg-primary-50 text-primary-600',
  '已入职': 'bg-primary-50 text-primary-600',
  '已淘汰': 'bg-background-200 text-foreground-400',
};

// ── Component ──────────────────────────────────────────

export default function CandidateQuickDetail({ candidate, resumeData, onClose }: CandidateQuickDetailProps) {
  useEffect(() => {
    if (candidate) document.body.style.overflow = 'hidden';
    return () => {
      // Don't restore overflow here — parent JobDetailPanel manages it
    };
  }, [candidate]);

  if (!candidate || !resumeData) return null;

  const r = resumeData;

  return (
    <>
      {/* Overlay — sits above ResumePanel (z-[70]) but below this */}
      <div className="fixed inset-0 bg-foreground-900/20 z-[80]" onClick={onClose}></div>

      {/* Quick Detail Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-[90] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary-600">{candidate.name.charAt(0)}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground-900">{candidate.name}</h2>
              <p className="text-xs text-foreground-400">{r.gender} · {r.age}岁 · {r.experienceYears}经验</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Basic Info */}
          <div className="bg-background-50 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <i className="ri-user-line text-sm"></i>
              基本信息
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p className="text-xs text-foreground-400">电话</p>
                <p className="text-sm font-medium text-foreground-800">{r.phone}</p>
              </div>
              <div>
                <p className="text-xs text-foreground-400">邮箱</p>
                <p className="text-sm font-medium text-foreground-800 truncate">{r.email}</p>
              </div>
              <div>
                <p className="text-xs text-foreground-400">来源</p>
                <p className="text-sm font-medium text-foreground-800">{r.source}</p>
              </div>
              <div>
                <p className="text-xs text-foreground-400">投递时间</p>
                <p className="text-sm font-medium text-foreground-800">{r.appliedAt}</p>
              </div>
            </div>
          </div>

          {/* Current Position & Stage */}
          <div className="bg-background-50 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <i className="ri-briefcase-line text-sm"></i>
              当前应聘
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-foreground-400 mb-1">应聘岗位</p>
                <p className="text-sm font-semibold text-foreground-900">{candidate.position}</p>
              </div>
              <div>
                <p className="text-xs text-foreground-400 mb-1">当前阶段</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap ${stageTagColors[candidate.stage] || 'bg-background-200 text-foreground-500'}`}>
                    {candidate.stage}
                    {candidate.interviewRound && <span className="ml-1 opacity-70">· {candidate.interviewRound}</span>}
                  </span>
                  {candidate.interviewTime && (
                    <span className="text-xs text-foreground-500">{candidate.interviewTime}</span>
                  )}
                </div>
              </div>
              {candidate.interviewer && (
                <div>
                  <p className="text-xs text-foreground-400 mb-1">面试官</p>
                  <p className="text-sm font-medium text-foreground-800">{candidate.interviewer}</p>
                </div>
              )}
            </div>
          </div>

          {/* Resume Preview */}
          <div className="bg-background-50 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <i className="ri-file-text-line text-sm"></i>
              简历预览
            </h3>

            {/* Summary */}
            <div className="mb-4">
              <p className="text-xs text-foreground-400 mb-1.5">个人简介</p>
              <p className="text-sm text-foreground-700 leading-relaxed line-clamp-4">{r.summary}</p>
            </div>

            {/* Skills */}
            <div className="mb-4">
              <p className="text-xs text-foreground-400 mb-1.5">技能标签</p>
              <div className="flex flex-wrap gap-1.5">
                {r.skills.slice(0, 6).map((skill) => (
                  <span key={skill} className="px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-md whitespace-nowrap">
                    {skill}
                  </span>
                ))}
                {r.skills.length > 6 && (
                  <span className="px-2.5 py-1 bg-background-100 text-foreground-500 text-xs rounded-md">
                    +{r.skills.length - 6}
                  </span>
                )}
              </div>
            </div>

            {/* Latest Work */}
            {r.workHistory.length > 0 && (
              <div>
                <p className="text-xs text-foreground-400 mb-1.5">最近工作</p>
                <div className="border border-background-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-foreground-900">{r.workHistory[0].company}</p>
                    <span className="text-xs text-foreground-400">{r.workHistory[0].period}</span>
                  </div>
                  <p className="text-xs text-foreground-500">{r.workHistory[0].role}</p>
                </div>
              </div>
            )}

            {/* Education preview */}
            {r.educationHistory.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-foreground-400 mb-1.5">学历</p>
                <div className="border border-background-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-foreground-900">{r.educationHistory[0].school}</p>
                  <p className="text-xs text-foreground-500">{r.educationHistory[0].degree} · {r.educationHistory[0].major}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  );
}