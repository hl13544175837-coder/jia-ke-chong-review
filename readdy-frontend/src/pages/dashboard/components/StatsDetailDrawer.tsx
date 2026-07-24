import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidateList, type Candidate } from '@/mocks/candidates';
import { requisitions } from '@/mocks/jobs';
import { interviews, interviewerPool } from '@/mocks/interviews';

interface StatsDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  statId: number;
  statLabel: string;
  role?: string;
}

const THIS_WEEK_START = '2026-07-09';

export default function StatsDetailDrawer({ open, onClose, statId, statLabel, role = 'recruiter' }: StatsDetailDrawerProps) {
  const navigate = useNavigate();

  const getDetailData = () => {
    switch (statId) {
      case 1: {
        // 在招岗位
        const activeReqs = requisitions.filter(r => r.statusCode === 'active');
        const withCounts = activeReqs.map(req => {
          const count = candidateList.filter(c => {
            const cp = c.position.toLowerCase();
            const rt = req.title.toLowerCase();
            return cp.includes(rt) || rt.includes(cp) ||
              (rt.includes('前端') && cp.includes('前端')) ||
              (rt.includes('java') && cp.includes('java')) ||
              (rt.includes('ui') && cp.includes('ui')) ||
              (rt.includes('测试') && cp.includes('测试')) ||
              (rt.includes('产品') && cp.includes('产品')) ||
              (rt.includes('数据') && cp.includes('数据')) ||
              (rt.includes('设计') && cp.includes('设计')) ||
              (rt.includes('hrbp') && cp.includes('hrbp')) ||
              (rt.includes('市场') && cp.includes('市场'));
          }).length;
          return { ...req, candidateCount: count };
        });
        return { type: 'positions' as const, items: withCounts };
      }
      case 2: {
        // 本周新增简历
        const thisWeek = candidateList.filter(c => c.appliedAt >= THIS_WEEK_START);
        return { type: 'candidates' as const, items: thisWeek };
      }
      case 3: {
        // 本月Offer数
        const offerCands = candidateList.filter(c => c.stage === 'Offer发放中');
        return { type: 'candidates' as const, items: offerCands };
      }
      case 4: {
        // 本月已入职
        const hired = candidateList.filter(c => c.stage === '已入职' || c.stage === '正式到岗中');
        return { type: 'candidates' as const, items: hired };
      }
      case 5: {
        // 待面试（面试官视角）
        const myInterviews = interviews.filter(
          iv => (iv.interviewerId === 'iv5' || iv.interviewer === '周明辉') && iv.status === '待面试'
        );
        return { type: 'interviews' as const, items: myInterviews };
      }
      default:
        return { type: 'empty' as const, items: [] };
    }
  };

  const data = getDetailData();

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-[90vw] bg-white shadow-xl z-50 overflow-hidden flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="px-6 py-5 border-b border-background-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-heading font-bold text-foreground-900">{statLabel} · 明细</h2>
            <p className="text-xs text-foreground-500 mt-0.5">共 {data.items.length} 条记录</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-background-100 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {data.type === 'positions' && (
            <div className="space-y-3">
              {(data.items as Array<typeof requisitions[0] & { candidateCount: number }>).map((req) => (
                <div
                  key={req.id}
                  className="bg-background-50 rounded-lg border border-background-200 p-4 hover:border-primary-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-foreground-900">{req.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          req.priority === 'urgent' ? 'bg-accent-50 text-accent-600' :
                          req.priority === 'high' ? 'bg-primary-50 text-primary-600' :
                          'bg-background-100 text-foreground-500'
                        }`}>
                          {req.priority === 'urgent' ? '紧急' : req.priority === 'high' ? '高优' : '普通'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-foreground-500">
                        <span>{req.department}</span>
                        <span className="text-foreground-300">·</span>
                        <span>HC {req.headcount} / 已填充 {req.filled}</span>
                        <span className="text-foreground-300">·</span>
                        <span>候选人 {req.candidateCount} 位</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        navigate('/jobs');
                      }}
                      className="flex-shrink-0 text-xs text-primary-600 hover:text-primary-700 font-medium cursor-pointer whitespace-nowrap flex items-center gap-1"
                    >
                      查看岗位
                      <i className="ri-arrow-right-line text-[10px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.type === 'candidates' && (
            <div className="space-y-3">
              {(data.items as Candidate[]).map((c) => (
                <div
                  key={c.id}
                  className="bg-background-50 rounded-lg border border-background-200 p-4 hover:border-primary-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-600">{c.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground-900">{c.name}</p>
                          <p className="text-[11px] text-foreground-500">{c.position}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-foreground-500 ml-10">
                        <span>{c.source}</span>
                        <span className="text-foreground-300">·</span>
                        <span>{c.appliedAt} 投递</span>
                        <span className="text-foreground-300">·</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${c.stageColor}`}>{c.stage}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        navigate('/candidates');
                      }}
                      className="flex-shrink-0 text-xs text-primary-600 hover:text-primary-700 font-medium cursor-pointer whitespace-nowrap flex items-center gap-1"
                    >
                      查看简历
                      <i className="ri-arrow-right-line text-[10px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.type === 'interviews' && (
            <div className="space-y-3">
              {(data.items as typeof interviews).map((iv) => (
                <div
                  key={iv.id}
                  className="bg-background-50 rounded-lg border border-background-200 p-4 hover:border-primary-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-8 h-8 rounded-full bg-accent-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-accent-600">{iv.candidateName.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground-900">{iv.candidateName}</p>
                          <p className="text-[11px] text-foreground-500">{iv.position} · {iv.stage}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-foreground-500 ml-10">
                        <i className="ri-calendar-line text-[10px]"></i>
                        <span>{iv.scheduledAt}</span>
                        <span className="text-foreground-300">·</span>
                        <span>{iv.type} · {iv.location}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        navigate('/dashboard/interviews');
                      }}
                      className="flex-shrink-0 text-xs text-primary-600 hover:text-primary-700 font-medium cursor-pointer whitespace-nowrap flex items-center gap-1"
                    >
                      进入面试
                      <i className="ri-arrow-right-line text-[10px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.type === 'empty' && (
            <div className="text-center py-12">
              <div className="w-12 h-12 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
                <i className="ri-information-line text-foreground-400 text-xl"></i>
              </div>
              <p className="text-sm text-foreground-500">暂无数据</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}