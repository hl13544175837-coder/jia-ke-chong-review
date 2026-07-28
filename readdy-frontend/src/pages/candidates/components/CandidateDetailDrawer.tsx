import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type CandidateProfile, type CandidateApplication, statusLabel, statusTagColor } from '@/mocks/candidateProfiles';
import { stageColorMap } from '@/mocks/candidates';

interface CandidateDetailDrawerProps {
  profile: CandidateProfile | null;
  initialTab?: 'current' | 'history';
  onClose: () => void;
  onViewResume: (profile: CandidateProfile) => void;
  onAddToPosition: (profile: CandidateProfile) => void;
  onMoveToPool: (profile: CandidateProfile) => void;
  onRemoveFromPool: (profile: CandidateProfile) => void;
}

export default function CandidateDetailDrawer({
  profile,
  initialTab = 'current',
  onClose,
  onViewResume,
  onAddToPosition,
  onMoveToPool,
  onRemoveFromPool,
}: CandidateDetailDrawerProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  useEffect(() => {
    if (profile) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [profile]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, profile]);

  if (!profile) return null;

  const c = profile.candidate;
  const currentApps = profile.applications.filter((a) => !['已入职', '已淘汰'].includes(a.stage));
  const historyApps = profile.applications.filter((a) => ['已入职', '已淘汰'].includes(a.stage));
  const displayApps = activeTab === 'current' ? currentApps : historyApps;

  const handleGoToRecruitment = (app: CandidateApplication, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate('/jobs', { state: { openTitle: app.reqTitle || app.position, candidateName: c.name } });
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/25 z-[80]" onClick={onClose}></div>
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-[90] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-background-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
              <span className="text-base font-bold text-primary-600">{c.name.charAt(0)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground-900">{c.name}</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${statusTagColor[profile.status]}`}>
                  {statusLabel[profile.status]}
                </span>
              </div>
              <p className="text-xs text-foreground-400 mt-0.5">{c.gender} · {c.age}岁 · {c.experienceYears}经验 · {c.education}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Contact Info */}
          <div className="bg-background-50 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <i className="ri-user-line text-sm"></i>基本信息
            </h3>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <div><p className="text-xs text-foreground-400">电话</p><p className="text-sm font-medium text-foreground-800">{c.phone}</p></div>
              <div><p className="text-xs text-foreground-400">邮箱</p><p className="text-sm font-medium text-foreground-800 truncate">{c.email}</p></div>
              <div><p className="text-xs text-foreground-400">来源</p><p className="text-sm font-medium text-foreground-800">{c.source}</p></div>
              <div><p className="text-xs text-foreground-400">部门</p><p className="text-sm font-medium text-foreground-800">{c.department}</p></div>
              <div><p className="text-xs text-foreground-400">负责人</p><p className="text-sm font-medium text-foreground-800">{c.recruiter || '未分配'}</p></div>
              <div><p className="text-xs text-foreground-400">入库时间</p><p className="text-sm font-medium text-foreground-800">{c.appliedAt}</p></div>
            </div>
          </div>

          {/* Resume Summary */}
          <div className="bg-background-50 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <i className="ri-file-text-line text-sm"></i>简历摘要
            </h3>
            <p className="text-sm text-foreground-700 leading-relaxed mb-3">{c.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {c.skills.map((skill) => (
                <span key={skill} className="px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-md whitespace-nowrap">{skill}</span>
              ))}
            </div>
            <button
              onClick={() => onViewResume(profile)}
              className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              <i className="ri-eye-line"></i> 查看完整简历
            </button>
          </div>

          {/* Talent Pool Info */}
          {profile.status === 'talentPool' && profile.talentPoolInfo && (
            <div className="bg-accent-50 rounded-xl p-4 border border-accent-100">
              <h3 className="text-xs font-semibold text-foreground-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <i className="ri-archive-line text-sm text-accent-600"></i>公司人才库记录
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-foreground-400 mb-1">入库原因</p>
                  <p className="text-sm text-foreground-700 leading-relaxed">{profile.talentPoolInfo.reason}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-400 mb-1">标签</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.talentPoolInfo.tags.map((t) => (
                      <span key={t} className="px-2.5 py-0.5 bg-white text-accent-700 text-xs font-medium rounded-md whitespace-nowrap">{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-foreground-400 mb-1">可联系时间</p>
                  <p className="text-sm font-medium text-foreground-800">{profile.talentPoolInfo.contactable}</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onRemoveFromPool(profile)}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-accent-200 hover:bg-accent-100 text-accent-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-logout-box-r-line mr-1"></i>移出公司人才库
                  </button>
                  <button
                    onClick={() => onAddToPosition(profile)}
                    className="px-3 py-1.5 text-xs font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-briefcase-line mr-1"></i>加入岗位
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Current + History Applications */}
          <div className="bg-background-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
                <i className="ri-briefcase-line text-sm"></i>
                {activeTab === 'current' ? '当前应聘' : '历史应聘'}
              </h3>
              <div className="flex items-center gap-1 bg-background-200 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveTab('current')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${activeTab === 'current' ? 'bg-white text-foreground-800 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'}`}
                >
                  当前应聘 {currentApps.length > 0 && `(${currentApps.length})`}
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${activeTab === 'history' ? 'bg-white text-foreground-800 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'}`}
                >
                  历史 {historyApps.length > 0 && `(${historyApps.length})`}
                </button>
              </div>
            </div>

            {displayApps.length > 0 ? (
              <div className="space-y-3">
                {displayApps.map((app, idx) => (
                  <div key={`${app.reqId}-${idx}`} className="border border-background-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-foreground-900">{app.position}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${stageColorMap[app.stage] || 'bg-background-200 text-foreground-400'}`}>
                        {app.stage}
                      </span>
                    </div>
                    <p className="text-xs text-foreground-500 mb-2">{app.progress}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-foreground-400">
                        <span>来源: {app.source}</span>
                        <span>负责人: {app.owner}</span>
                        <span>投递: {app.appliedAt}</span>
                      </div>
                      {app.reqId && (
                        <button
                          onClick={(e) => handleGoToRecruitment(app, e)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-external-link-line"></i> 前往招聘管理
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-foreground-400">
                  {activeTab === 'current' ? '暂无活跃应聘记录' : '暂无历史应聘记录'}
                </p>
              </div>
            )}
          </div>

          {/* Quick Actions Footer — 只保留一个主操作，避免与上方重复 */}
          <div className="flex items-center gap-2 pt-2">
            {profile.status === 'recruiting' && currentApps.length > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const app = currentApps[0];
                  navigate('/jobs', { state: { openTitle: app.reqTitle || app.position, candidateName: c.name } });
                }}
                className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
              >
                <i className="ri-eye-line"></i> 查看流程
              </button>
            ) : (
              <button
                onClick={() => onAddToPosition(profile)}
                className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
              >
                <i className="ri-briefcase-line"></i> 加入岗位
              </button>
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
