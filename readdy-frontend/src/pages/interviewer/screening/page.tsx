import { useState, useMemo, useCallback } from 'react';
import { CURRENT_INTERVIEWER } from '@/mocks/interviewer';
import { resumePushRecords, getPendingReviews, type ResumePushRecord } from '@/mocks/resumePush';
import { candidateList, stageColorMap } from '@/mocks/candidates';
import { interviews } from '@/mocks/interviews';
import ReviewActionModal from '@/pages/interviewer/dashboard/components/ReviewActionModal';
import { useToast } from '@/hooks/useToast';

type TabKey = 'pending' | 'approved' | 'rejected' | 'needMoreInfo';

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'pending', label: '待筛选', icon: 'ri-file-search-line' },
  { key: 'approved', label: '已通过', icon: 'ri-check-double-line' },
  { key: 'rejected', label: '已拒绝', icon: 'ri-close-circle-line' },
  { key: 'needMoreInfo', label: '待补充', icon: 'ri-information-line' },
];

const statusLabelMap: Record<ResumePushRecord['status'], string> = {
  pending: '待筛选',
  approved: '已通过',
  rejected: '已拒绝',
  needMoreInfo: '待补充',
};

const statusStyleMap: Record<ResumePushRecord['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-accent-100 text-accent-700',
  needMoreInfo: 'bg-primary-100 text-primary-700',
};

export default function InterviewerScreeningPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [reviewModalRecord, setReviewModalRecord] = useState<ResumePushRecord | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);

  const myRecords = useMemo(
    () => resumePushRecords.filter(r => r.reviewerId === CURRENT_INTERVIEWER.id),
    []
  );

  const [localRecords, setLocalRecords] = useState<ResumePushRecord[]>(myRecords);

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { pending: 0, approved: 0, rejected: 0, needMoreInfo: 0 };
    localRecords.forEach(r => { counts[r.status]++; });
    return counts;
  }, [localRecords]);

  const filteredRecords = useMemo(() => {
    return localRecords.filter(r => r.status === activeTab);
  }, [localRecords, activeTab]);

  const handleReviewSubmit = useCallback((action: 'approved' | 'rejected' | 'needMoreInfo', comment: string) => {
    if (!reviewModalRecord) return;
    const now = new Date().toISOString();

    const record = resumePushRecords.find((r) => r.id === reviewModalRecord.id);
    if (record) {
      record.status = action;
      record.reviewComment = comment;
      record.reviewTime = now;
    }

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
        cand.reviewerFeedback = 'pending';
        cand.blockReason = `面试官${CURRENT_INTERVIEWER.name}要求补充信息：${comment}`;
      }
    }

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
          reqId: `REQ-${CURRENT_INTERVIEWER.id}`,
          reqName: reviewModalRecord.position,
          submittedBy: '',
          submittedByRole: '',
        });
      }
    }

    setLocalRecords(prev =>
      prev.map(r => r.id === reviewModalRecord.id
        ? { ...r, status: action, reviewComment: comment, reviewTime: now }
        : r
      )
    );
    setReviewModalRecord(null);

    const actionLabel = action === 'approved' ? '同意面试' : action === 'rejected' ? '标记为不合适' : '要求补充信息';
    showToast(`已对「${reviewModalRecord.candidateName}」${actionLabel}`);
  }, [reviewModalRecord, showToast]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return dateStr.slice(0, 16).replace('T', ' ');
  };

  const getDeadlineUrgency = (deadline: string) => {
    const now = new Date('2026-07-20');
    const dl = new Date(deadline);
    const diff = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 1) return { label: '即将截止', color: 'text-accent-600 bg-accent-50' };
    if (diff <= 3) return { label: `${diff}天后截止`, color: 'text-amber-600 bg-amber-50' };
    return { label: `${diff}天后截止`, color: 'text-foreground-500' };
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-primary-600">{CURRENT_INTERVIEWER.avatar}</span>
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground-900">待筛选简历</h1>
          <p className="text-sm text-foreground-500 mt-0.5">招聘专员推送的简历，需要你评审决定是否进入面试</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 bg-background-100 rounded-lg px-3 py-1.5">
            <span className="text-xs text-foreground-500">待筛选</span>
            <span className="text-sm font-bold text-amber-600">{tabCounts.pending}</span>
          </div>
          <div className="flex items-center gap-2 bg-background-100 rounded-lg px-3 py-1.5">
            <span className="text-xs text-foreground-500">已通过</span>
            <span className="text-sm font-bold text-emerald-600">{tabCounts.approved}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`bg-white rounded-xl border p-4 text-left cursor-pointer transition-all duration-200 ${
              activeTab === tab.key
                ? 'border-primary-300 ring-1 ring-primary-200 shadow-sm'
                : 'border-background-200 hover:border-background-300 hover:bg-background-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                tab.key === 'pending' ? 'bg-amber-50 text-amber-600' :
                tab.key === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                tab.key === 'rejected' ? 'bg-accent-50 text-accent-600' :
                'bg-primary-50 text-primary-600'
              }`}>
                <i className={`${tab.icon} text-base`}></i>
              </div>
              <span className={`text-2xl font-bold ${
                activeTab === tab.key ? 'text-foreground-900' : 'text-foreground-500'
              }`}>
                {tabCounts[tab.key]}
              </span>
            </div>
            <p className={`text-sm mt-2 font-medium ${
              activeTab === tab.key ? 'text-foreground-800' : 'text-foreground-500'
            }`}>
              {tab.label}
            </p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-foreground-900 shadow-sm'
                : 'text-foreground-500 hover:text-foreground-700'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key
                ? 'bg-background-100 text-foreground-600'
                : 'bg-background-200/70 text-foreground-400'
            }`}>
              {tabCounts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Records list */}
      <div className="space-y-3">
        {filteredRecords.map((record) => {
          const isExpanded = expandedRecord === record.id;
          const urgency = record.status === 'pending' ? getDeadlineUrgency(record.deadline) : null;

          return (
            <div
              key={record.id}
              className={`bg-white rounded-xl border transition-all duration-200 ${
                isExpanded ? 'border-primary-300 shadow-sm' : 'border-background-200 hover:border-background-300'
              }`}
            >
              {/* Main row */}
              <div
                onClick={() => record.status === 'pending' ? setReviewModalRecord(record) : setExpandedRecord(isExpanded ? null : record.id)}
                className={`px-5 py-4 flex items-center gap-4 ${
                  record.status === 'pending' ? 'cursor-pointer hover:bg-background-50/50' : 'cursor-pointer hover:bg-background-50/50'
                }`}
              >
                {/* Candidate avatar & info */}
                <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary-600">{record.candidateName.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground-900">{record.candidateName}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyleMap[record.status]}`}>
                      {statusLabelMap[record.status]}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-500 mt-0.5">
                    {record.position} · 来源：{record.source} · 推送人：{record.pusher}
                  </p>
                </div>

                {/* Deadline / Review time */}
                <div className="text-right flex-shrink-0">
                  {record.status === 'pending' && urgency && (
                    <>
                      <p className={`text-xs font-medium ${urgency.color} px-2 py-0.5 rounded-full inline-block`}>
                        {urgency.label}
                      </p>
                      <p className="text-xs text-foreground-400 mt-1">{record.pushTime.slice(0, 10)} 推送</p>
                    </>
                  )}
                  {record.status !== 'pending' && (
                    <>
                      <p className="text-xs text-foreground-500">{formatDate(record.reviewTime)}</p>
                      <p className="text-[11px] text-foreground-400 mt-0.5">已评审</p>
                    </>
                  )}
                </div>

                {/* Action button */}
                <div className="flex-shrink-0">
                  {record.status === 'pending' ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setReviewModalRecord(record); }}
                      className="px-4 py-2 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      去筛选
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedRecord(isExpanded ? null : record.id); }}
                      className="w-8 h-8 rounded-lg hover:bg-background-100 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
                    >
                      <i className={`text-sm transition-transform ${isExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`}></i>
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded detail for reviewed records */}
              {isExpanded && record.status !== 'pending' && (
                <div className="px-5 pb-5 pt-1 border-t border-background-100 mt-1">
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="bg-background-50 rounded-lg p-4 border border-background-200">
                      <p className="text-xs font-medium text-foreground-500 mb-2">评审要求</p>
                      <p className="text-sm text-foreground-700 leading-relaxed">{record.keyRequirements}</p>
                    </div>
                    <div className={`rounded-lg p-4 border ${
                      record.status === 'approved' ? 'bg-emerald-50/50 border-emerald-200' :
                      record.status === 'rejected' ? 'bg-accent-50/50 border-accent-200' :
                      'bg-primary-50/50 border-primary-200'
                    }`}>
                      <p className="text-xs font-medium text-foreground-500 mb-2">你的评审意见</p>
                      <p className="text-sm text-foreground-700 leading-relaxed">{record.reviewComment || '无'}</p>
                    </div>
                  </div>
                  {record.status === 'approved' && record.scheduledTime && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-foreground-500 bg-background-50 rounded-lg px-4 py-2.5">
                      <i className="ri-calendar-check-line text-emerald-500"></i>
                      <span>已安排面试：{record.scheduledTime.slice(0, 10)} {record.scheduledTime.slice(11, 16)} - {record.scheduledEndTime?.slice(11, 16)}</span>
                      <span className="text-foreground-400">· {record.interviewType} · {record.interviewLocation}</span>
                    </div>
                  )}
                  {record.status === 'approved' && !record.scheduledTime && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-4 py-2.5">
                      <i className="ri-time-line"></i>
                      <span>已通过评审，等待 HR 安排面试时间</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredRecords.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className={`text-2xl text-foreground-400 ${tabs.find(t => t.key === activeTab)?.icon || 'ri-inbox-line'}`}></i>
            </div>
            <p className="text-sm text-foreground-500 font-medium">
              {activeTab === 'pending' ? '暂无待筛选简历，太好了！' :
               activeTab === 'approved' ? '暂无已通过的简历' :
               activeTab === 'rejected' ? '暂无已拒绝的简历' :
               '暂无待补充信息的简历'}
            </p>
            <p className="text-xs text-foreground-400 mt-1">
              {activeTab === 'pending' ? '招聘专员推送新简历后会出现在这里' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewModalRecord && (
        <ReviewActionModal
          record={reviewModalRecord}
          onClose={() => setReviewModalRecord(null)}
          onSubmit={handleReviewSubmit}
        />
      )}
    </div>
  );
}
