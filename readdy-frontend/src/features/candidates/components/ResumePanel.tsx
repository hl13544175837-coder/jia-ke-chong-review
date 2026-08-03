import { useEffect } from 'react';

// ResumeData is a generic shape that both Candidate and CandidateResume satisfy
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
  projects?: Array<{ name: string; role: string; desc: string }>;
  languages?: string[];
  certifications?: string[];
}

interface ResumePanelProps {
  candidate: ResumeData | null;
  onClose: () => void;
}

export default function ResumePanel({ candidate, onClose }: ResumePanelProps) {
  useEffect(() => {
    if (candidate) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [candidate]);

  if (!candidate) return null;

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/30 z-[60]" onClick={onClose}></div>
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-[70] flex flex-col animate-slide-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-background-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
              <span className="text-sm font-bold text-primary-600">{candidate.name.charAt(0)}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground-900">{candidate.name}</h2>
              <p className="text-xs text-foreground-400">{candidate.gender} · {candidate.age}岁 · {candidate.experienceYears}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Contact & Source */}
          <div className="bg-background-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground-800 flex items-center gap-1.5">
              <i className="ri-contacts-line text-base text-foreground-500"></i>
              联系方式
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-foreground-400">电话</p>
                <p className="text-sm font-medium text-foreground-800">{candidate.phone}</p>
              </div>
              <div>
                <p className="text-xs text-foreground-400">邮箱</p>
                <p className="text-sm font-medium text-foreground-800">{candidate.email}</p>
              </div>
              <div>
                <p className="text-xs text-foreground-400">来源</p>
                <p className="text-sm font-medium text-foreground-800">{candidate.source}</p>
              </div>
              <div>
                <p className="text-xs text-foreground-400">投递时间</p>
                <p className="text-sm font-medium text-foreground-800">{candidate.appliedAt}</p>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div>
            <h3 className="text-sm font-semibold text-foreground-800 mb-2 flex items-center gap-1.5">
              <i className="ri-file-user-line text-base text-foreground-500"></i>
              个人简介
            </h3>
            <p className="text-sm text-foreground-700 leading-relaxed bg-background-50 rounded-xl p-4">{candidate.summary}</p>
          </div>

          {/* Skills */}
          <div>
            <h3 className="text-sm font-semibold text-foreground-800 mb-2 flex items-center gap-1.5">
              <i className="ri-lightbulb-line text-base text-foreground-500"></i>
              技能标签
            </h3>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-medium rounded-lg whitespace-nowrap"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Work History */}
          <div>
            <h3 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
              <i className="ri-briefcase-line text-base text-foreground-500"></i>
              工作经历
            </h3>
            <div className="space-y-3">
              {candidate.workHistory.map((w, i) => (
                <div key={i} className="border border-background-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground-900">{w.company}</p>
                      <p className="text-xs text-foreground-500">{w.role}</p>
                    </div>
                    <span className="text-xs text-foreground-400 whitespace-nowrap">{w.period}</span>
                  </div>
                  <ul className="space-y-1">
                    {w.highlights.map((h, hi) => (
                      <li key={hi} className="text-xs text-foreground-600 flex items-start gap-1.5">
                        <i className="ri-checkbox-circle-line text-primary-500 mt-0.5 flex-shrink-0"></i>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Education */}
          <div>
            <h3 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
              <i className="ri-graduation-cap-line text-base text-foreground-500"></i>
              教育经历
            </h3>
            <div className="space-y-3">
              {candidate.educationHistory.map((e, i) => (
                <div key={i} className="flex items-start justify-between border border-background-200 rounded-xl p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground-900">{e.school}</p>
                    <p className="text-xs text-foreground-500">{e.degree} · {e.major}</p>
                  </div>
                  <span className="text-xs text-foreground-400 whitespace-nowrap">{e.period}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Projects */}
          {candidate.projects && candidate.projects.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
                <i className="ri-folder-line text-base text-foreground-500"></i>
                项目经验
              </h3>
              <div className="space-y-3">
                {candidate.projects.map((p, i) => (
                  <div key={i} className="border border-background-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground-900">{p.name}</p>
                      <span className="text-xs text-primary-600 font-medium">{p.role}</span>
                    </div>
                    <p className="text-xs text-foreground-600 leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications & Languages */}
          <div className="grid grid-cols-2 gap-4">
            {candidate.certifications && candidate.certifications.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground-800 mb-2 flex items-center gap-1.5">
                  <i className="ri-award-line text-base text-foreground-500"></i>
                  证书
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.certifications.map((c) => (
                    <span
                      key={c}
                      className="px-2.5 py-1 bg-accent-50 text-accent-700 text-xs rounded-md whitespace-nowrap"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {candidate.languages && candidate.languages.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground-800 mb-2 flex items-center gap-1.5">
                  <i className="ri-translate-2 text-base text-foreground-500"></i>
                  语言能力
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.languages.map((l) => (
                    <span
                      key={l}
                      className="px-2.5 py-1 bg-secondary-50 text-secondary-700 text-xs rounded-md whitespace-nowrap"
                    >
                      {l}
                    </span>
                  ))}
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
