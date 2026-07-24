import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CURRENT_INTERVIEWER, myInterviews, getTodayInterviews, getPendingFeedback, getUpcomingInterviews, getPendingConfirmations } from '@/mocks/interviewer';
import type { InterviewerInterview } from '@/mocks/interviewer';
import { resumePushRecords, getPendingReviews, type ResumePushRecord } from '@/mocks/resumePush';
import { candidateList, stageColorMap } from '@/mocks/candidates';
import { interviews } from '@/mocks/interviews';
import ReviewActionModal from './components/ReviewActionModal';
import RescheduleModal from './components/RescheduleModal';
import InterviewDetailDrawer from '@/pages/interviewer/interviews/components/InterviewDetailDrawer';
import { useToast } from '@/hooks/useToast';

export default function InterviewerDashboardPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const todayInterviews = useMemo(() => getTodayInterviews(), []);
  const pendingConfirmations = useMemo(() => getPendingConfirmations(), []);
  const pendingFeedback = useMemo(() => getPendingFeedback(), []);
  const upcomingInterviews = useMemo(() => getUpcomingInterviews(), []);
  const [reviewModalRecord, setReviewModalRecord] = useState<ResumePushRecord | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<InterviewerInterview | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);

  // Refs for scroll targets
  const pendingReviewsRef = useRef<HTMLDivElement>(null);
  const todayInterviewsRef = useRef<HTMLDivElement>(null);
  const pendingFeedbackRef = useRef<HTMLDivElement>(null);
  const upcomingInterviewsRef = useRef<HTMLDivElement>(null);

  const handleStatCardClick = useCallback((label: string) => {
    switch (label) {
      case '待评审简历':
        pendingReviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case '今日面试':
        todayInterviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case '待确认邀请':
        navigate('/interviewer/interviews');
        break;
      case '待提交反馈':
        pendingFeedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case '即将开始的面试':
        upcomingInterviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
    }
  }, [navigate]);

  const pendingReviews = useMemo(
    () => getPendingReviews(CURRENT_INTERVIEWER.id),
    []
  );
  const [localPendingReviews, setLocalPendingReviews] = useState<typeof pendingReviews>(pendingReviews);

  const handleReviewSubmit = useCallback((action: 'approved' | 'rejected' | 'needMoreInfo', comment: string) => {
    if (!reviewModalRecord) return;
    const now = new Date().toISOString();

    // Update push record
    const record = resumePushRecords.find((r) => r.id === reviewModalRecord.id);
    if (record) {
      record.status = action;
      record.reviewComment = comment;
      record.reviewTime = now;
    }

    // Update candidate in candidateList
    const cand = candidateList.find((c) => c.id === reviewModalRecord.candidateId);
    if (cand) {
      if (action === 'approved') {
        cand.stage = '同意面试';
        cand.stageColor = stageColorMap['同意面试'];
        cand.reviewerFeedback = 'approved';
      } else if (action === 'rejected') {
        cand.stage = '已淘汰';
        cand.stageColor = stageColorMap['已淘汰'];
        cand.reviewerFeedback = 'rejected';
        cand.blockReason = `面试官${CURRENT_INTERVIEWER.name}评审不通过：${comment}`;
      } else {
        // needMoreInfo: candidate stays in 面试官评审中 but marked as need info
        cand.reviewerFeedback = 'pending';
        cand.blockReason = `面试官${CURRENT_INTERVIEWER.name}要求补充信息：${comment}`;
      }
    }

    // If approved and the candidate isn't yet in interviews list, add them
    if (action === 'approved') {
      const existingInterview = interviews.find(
        (iv) => iv.candidateName === reviewModalRecord.candidateName
      );
      if (!existingInterview) {
        const maxId = interviews.reduce((m, iv) => Math.max(m, iv.id), 0);
        const scoreDimensions = ['技术深度', '编码能力', '架构思维', '工程化能力', '协作能力', '学习能力'];
        interviews.push({
          id: maxId + 1,
          candidateName: reviewModalRecord.candidateName,
          candidateAvatar: reviewModalRecord.candidateName.charAt(0),
          position: reviewModalRecord.position,
          stage: '一面',
          interviewer: '',
          interviewerId: '',
          interviewerRole: '',
          scheduledAt: '',
          scheduledEndAt: '',
          type: '线下面试',
          location: '',
          status: '待安排',
          scores: scoreDimensions.map((d) => ({ dimension: d, score: null, max: 10, note: '' })),
          overall: null,
          feedback: '',
          recruiter: reviewModalRecord.pusher,
          source: reviewModalRecord.source,
          jdSent: false,
          scorecardSent: false,
          wecomSynced: false,
          candidateNotified: false,
          interviewerNotified: false,
          reqId: `REQ-${record?.reviewerId || 'DEFAULT'}`,
          reqName: reviewModalRecord.position,
          submittedBy: '',
          submittedByRole: '',
        });
      }
    }

    setLocalPendingReviews((prev) => prev.filter((r) => r.id !== reviewModalRecord.id));
    setReviewModalRecord(null);

    const actionLabel = action === 'approved' ? '同意面试' : action === 'rejected' ? '标记为不合适' : '要求补充信息';
    showToast(`已对「${reviewModalRecord.candidateName}」${actionLabel}`);
  }, [reviewModalRecord, showToast]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '上午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const getStatusBadge = (status: InterviewerInterview['status']) => {
    switch (status) {
      case '待面试': return 'bg-accent-100 text-accent-700';
      case '待确认': return 'bg-accent-100 text-accent-700';
      case '待反馈': return 'bg-primary-100 text-primary-700';
      case '已完成': return 'bg-background-200 text-foreground-400';
    }
  };

  const getStatusLabel = (status: InterviewerInterview['status']) => {
    switch (status) {
      case '待面试': return '待面试';
      case '待确认': return '待确认';
      case '待反馈': return '待提交反馈';
      case '已完成': return '已完成';
    }
  };

  const statCards = [
    {
      label: '待评审简历',
      count: localPendingReviews.length,
      icon: 'ri-file-search-line',
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
    },
    {
      label: '今日面试',
      count: todayInterviews.length,
      icon: 'ri-calendar-check-line',
      color: 'bg-accent-500',
      bgColor: 'bg-accent-50',
      textColor: 'text-accent-700',
    },
    {
      label: '待确认邀请',
      count: pendingConfirmations.length,
      icon: 'ri-question-answer-line',
      color: 'bg-accent-500',
      bgColor: 'bg-accent-50',
      textColor: 'text-accent-700',
    },
    {
      label: '待提交反馈',
      count: pendingFeedback.length,
      icon: 'ri-survey-line',
      color: 'bg-primary-500',
      bgColor: 'bg-primary-50',
      textColor: 'text-primary-700',
    },
    {
      label: '即将开始的面试',
      count: upcomingInterviews.length,
      icon: 'ri-timer-line',
      color: 'bg-accent-500',
      bgColor: 'bg-accent-50',
      textColor: 'text-accent-700',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <span className="text-lg font-bold text-primary-600">{CURRENT_INTERVIEWER.avatar}</span>
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground-900">
            {getGreeting()}，{CURRENT_INTERVIEWER.name}
          </h1>
          <p className="text-sm text-foreground-500 mt-0.5">
            {CURRENT_INTERVIEWER.role} · {CURRENT_INTERVIEWER.department}
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            onClick={() => handleStatCardClick(card.label)}
            className="bg-white rounded-xl border border-background-200 p-5 cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground-500">{card.label}</p>
                <p className="text-3xl font-bold text-foreground-900 mt-1">{card.count}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl ${card.bgColor} flex items-center justify-center`}>
                <i className={`${card.icon} ${card.textColor} text-xl`}></i>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pending Resume Reviews */}
      {localPendingReviews.length > 0 && (
        <div ref={pendingReviewsRef} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <i className="ri-file-search-line text-amber-600"></i>
              </div>
              <div>
                <h3 className="font-semibold text-foreground-900 text-sm">待评审简历</h3>
                <p className="text-xs text-foreground-500">招聘专员推送的简历等待你的评审</p>
              </div>
            </div>
            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">{localPendingReviews.length} 份</span>
          </div>
          <div className="divide-y divide-background-100">
            {localPendingReviews.map((pr) => (
              <div key={pr.id} className="px-5 py-4 flex items-center gap-4 hover:bg-background-50/50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary-600">{pr.candidateName.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground-900">{pr.candidateName}</p>
                  <p className="text-xs text-foreground-500 mt-0.5">
                    {pr.position} · {pr.source} · 推送人：{pr.pusher}
                  </p>
                  <p className="text-xs text-foreground-400 mt-1 truncate">
                    截止：{pr.deadline} · {pr.keyRequirements.slice(0, 40)}...
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setReviewModalRecord(pr)}
                    className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    去评审
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's interviews */}
      <div ref={todayInterviewsRef} className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
          <h3 className="font-semibold text-foreground-900 text-sm">今日面试</h3>
          <span className="text-xs text-foreground-500">{todayInterviews.length} 场</span>
        </div>
        {todayInterviews.length > 0 ? (
          <div className="divide-y divide-background-100">
            {todayInterviews.map((iv) => (
              <div
                key={iv.id}
                onClick={() => setSelectedInterview(iv)}
                className="px-5 py-4 flex items-center gap-4 hover:bg-background-50/50 transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary-600">{iv.candidateAvatar}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground-900">{iv.candidateName}</p>
                  <p className="text-xs text-foreground-500 mt-0.5">{iv.position} · {iv.stage}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-foreground-700">{iv.scheduledAt.slice(11, 16)} - {iv.scheduledEndAt.slice(11, 16)}</p>
                  <p className="text-xs text-foreground-400 mt-0.5">{iv.type} · {iv.location}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${getStatusBadge(iv.status)}`}>
                  {getStatusLabel(iv.status)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
              <i className="ri-calendar-check-line text-xl text-foreground-400"></i>
            </div>
            <p className="text-sm text-foreground-500">今日暂无面试安排</p>
          </div>
        )}
      </div>

      {/* Upcoming interviews */}
      {upcomingInterviews.length > 0 && (
        <div ref={upcomingInterviewsRef} className="bg-white rounded-xl border border-background-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="font-semibold text-foreground-900 text-sm">即将开始的面试</h3>
            <span className="text-xs text-foreground-500">{upcomingInterviews.length} 场</span>
          </div>
          <div className="divide-y divide-background-100">
            {upcomingInterviews.slice(0, 5).map((iv) => (
              <div
                key={iv.id}
                onClick={() => setSelectedInterview(iv)}
                className="px-5 py-4 flex items-center gap-4 hover:bg-background-50/50 transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary-600">{iv.candidateAvatar}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground-900">{iv.candidateName}</p>
                  <p className="text-xs text-foreground-500 mt-0.5">{iv.position} · {iv.stage}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-foreground-700">{iv.scheduledAt.slice(0, 10)}</p>
                  <p className="text-xs text-foreground-400 mt-0.5">{iv.scheduledAt.slice(11, 16)} - {iv.scheduledEndAt.slice(11, 16)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${getStatusBadge(iv.status)}`}>
                  {getStatusLabel(iv.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending feedback reminder */}
      {pendingFeedback.length > 0 && (
        <div ref={pendingFeedbackRef} className="bg-primary-50 border border-primary-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-survey-line text-lg text-primary-600"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-700">待提交面试反馈</p>
              <p className="text-xs text-primary-500 mt-1">你有 {pendingFeedback.length} 场面试反馈待提交，请尽快完成以推进招聘流程。</p>
              <div className="mt-3 space-y-2">
                {pendingFeedback.map((iv) => (
                  <div
                    key={iv.id}
                    onClick={() => setSelectedInterview(iv)}
                    className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 cursor-pointer hover:bg-primary-100/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-foreground-900">{iv.candidateName}</span>
                    <span className="text-xs text-foreground-500">{iv.position}</span>
                    <span className="text-xs text-foreground-400 ml-auto">{iv.scheduledAt.slice(0, 10)}</span>
                    <i className="ri-arrow-right-s-line text-foreground-400 text-sm"></i>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {reviewModalRecord && (
        <ReviewActionModal
          record={reviewModalRecord}
          onClose={() => setReviewModalRecord(null)}
          onSubmit={handleReviewSubmit}
        />
      )}
      {selectedInterview && (
        <InterviewDetailDrawer
          interview={selectedInterview}
          onClose={() => setSelectedInterview(null)}
          onReschedule={() => setShowReschedule(true)}
        />
      )}
      {showReschedule && selectedInterview && (
        <RescheduleModal
          interview={selectedInterview}
          onClose={() => setShowReschedule(false)}
          onConfirm={(newDate, newStart, newEnd, reason) => {
            const idx = myInterviews.findIndex((iv) => iv.id === selectedInterview.id);
            if (idx !== -1) {
              myInterviews[idx].scheduledAt = `${newDate} ${newStart}`;
              myInterviews[idx].scheduledEndAt = `${newDate} ${newEnd}`;
            }
            setSelectedInterview(null);
            setShowReschedule(false);
            showToast(`已为「${selectedInterview.candidateName}」提交改约申请，新时间：${newDate} ${newStart}-${newEnd}`);
          }}
        />
      )}
    </div>
  );
}