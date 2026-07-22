import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatDate';
import {
  assignmentResponseLabel,
  assignmentResponseTone,
  roundLabel,
} from '../lib/interviewRecords';
import type { PublicInterviewAccess } from '../types';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Select, Spinner } from '../components/ui';

function accessTokenFromHash(): string {
  const fragment = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(fragment).get('token')?.trim() ?? '';
}

export function PublicInterviewAccessPage() {
  const token = useMemo(accessTokenFromHash, []);
  const [access, setAccess] = useState<PublicInterviewAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [score, setScore] = useState('');
  const [professionalScore, setProfessionalScore] = useState('');
  const [communicationScore, setCommunicationScore] = useState('');
  const [passed, setPassed] = useState('');
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    if (!token) {
      setError('面试协同链接不完整，请联系 HR 重新发送。');
      setLoading(false);
      return () => {
        active = false;
      };
    }
    api.getPublicInterviewAccess(token)
      .then((result) => {
        if (active) setAccess(result);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : '面试任务加载失败');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleRespond(decision: 'accepted' | 'declined') {
    const reason = declineReason.trim();
    if (decision === 'declined' && !reason) {
      setError('无法参加时请填写原因，方便 HR 重新安排。');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.respondPublicInterviewAccess(
        token,
        decision,
        reason || undefined,
      );
      setAccess(updated);
      setShowDecline(false);
      setNotice(
        decision === 'accepted'
          ? '已确认参加，请在面试结束后继续填写评分和评价。'
          : '已将原因反馈给 HR，本次任务无需继续处理。',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '接单状态更新失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitFeedback() {
    const overallScore = Number(score);
    if (!Number.isInteger(overallScore) || overallScore < 1 || overallScore > 5) {
      setError('请选择 1 至 5 分的综合评分。');
      return;
    }
    if (passed !== 'yes' && passed !== 'no') {
      setError('请选择面试结论。');
      return;
    }
    const evaluation: Record<string, number> = {};
    if (professionalScore) evaluation['专业能力'] = Number(professionalScore);
    if (communicationScore) evaluation['沟通表达'] = Number(communicationScore);

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.submitPublicInterviewFeedback({
        token,
        score: overallScore,
        passed: passed === 'yes',
        evaluation,
        strengths: strengths.trim(),
        concerns: concerns.trim(),
        note: note.trim(),
      });
      const updated = await api.getPublicInterviewAccess(token);
      setAccess(updated);
      setNotice('评分和评价已提交，HR 将查看结果并决定后续流程。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '面试反馈提交失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-soft px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-on-primary">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink">面试协同</h1>
            <p className="text-sm text-muted">确认安排并提交本次面试评价</p>
          </div>
        </div>

        {loading && (
          <Card>
            <CardBody className="flex justify-center py-16">
              <Spinner size="lg" />
            </CardBody>
          </Card>
        )}

        {!loading && !access && (
          <Card>
            <CardBody className="py-12 text-center">
              <XCircle className="mx-auto h-10 w-10 text-danger-700" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-ink">无法打开面试任务</h2>
              <p role="alert" className="mt-2 text-sm text-muted">
                {error ?? '链接已失效，请联系 HR 重新发送。'}
              </p>
            </CardBody>
          </Card>
        )}

        {!loading && access && (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{access.candidate_name} · {access.job_title}</CardTitle>
                    <p className="mt-1 text-sm text-muted">
                      {access.demand_request_no} · {roundLabel(access.round)} · 第 {access.round_sequence} 轮
                    </p>
                  </div>
                  <Badge tone={assignmentResponseTone(access.response_status)}>
                    {assignmentResponseLabel(access.response_status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                <dl className="grid gap-3 rounded-lg border border-hairline bg-canvas p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-soft">面试时间</dt>
                    <dd className="mt-1 text-sm font-medium text-ink">
                      {access.scheduled_at ? formatDate(access.scheduled_at) : '由 HR 另行确认'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-soft">地点 / 会议方式</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-ink">
                      {access.location || '由 HR 另行确认'}
                    </dd>
                  </div>
                </dl>
                {access.note && (
                  <div className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-sm text-muted">
                    安排说明：{access.note}
                  </div>
                )}
                <div className="flex items-start gap-2 text-xs text-muted-soft">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  此链接仅能处理这一条面试任务，无需登录，请勿转发。
                </div>
              </CardBody>
            </Card>

            {access.response_status === 'pending' && access.can_respond && (
              <Card>
                <CardHeader>
                  <CardTitle>是否参加本次面试？</CardTitle>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" loading={busy} disabled={busy} onClick={() => void handleRespond('accepted')}>
                      确认参加
                    </Button>
                    <Button type="button" variant="danger" disabled={busy} onClick={() => setShowDecline(true)}>
                      无法参加
                    </Button>
                  </div>
                  {showDecline && (
                    <div className="space-y-2 rounded-lg border border-danger-200 bg-danger-50 p-3">
                      <label htmlFor="interview-decline-reason" className="block text-sm font-medium text-ink">
                        无法参加的原因
                      </label>
                      <textarea
                        id="interview-decline-reason"
                        rows={3}
                        value={declineReason}
                        onChange={(event) => setDeclineReason(event.target.value)}
                        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                        placeholder="例：该时段已有客户会议，请调整到次日下午"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="danger" loading={busy} disabled={busy} onClick={() => void handleRespond('declined')}>
                          提交并通知 HR
                        </Button>
                        <Button type="button" variant="ghost" disabled={busy} onClick={() => setShowDecline(false)}>
                          返回
                        </Button>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {access.response_status === 'accepted' && access.can_submit_feedback && (
              <Card>
                <CardHeader>
                  <CardTitle>填写评分和评价</CardTitle>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Select id="public-feedback-score" label="综合评分" value={score} onChange={(event) => setScore(event.target.value)}>
                      <option value="">请选择</option>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 分</option>)}
                    </Select>
                    <Select id="public-feedback-professional" label="专业能力" value={professionalScore} onChange={(event) => setProfessionalScore(event.target.value)}>
                      <option value="">可选</option>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 分</option>)}
                    </Select>
                    <Select id="public-feedback-communication" label="沟通表达" value={communicationScore} onChange={(event) => setCommunicationScore(event.target.value)}>
                      <option value="">可选</option>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 分</option>)}
                    </Select>
                    <Select id="public-feedback-result" label="面试结论" value={passed} onChange={(event) => setPassed(event.target.value)}>
                      <option value="">请选择</option>
                      <option value="yes">建议通过</option>
                      <option value="no">建议不通过</option>
                    </Select>
                  </div>
                  {[
                    { id: 'strengths', label: '主要优势', value: strengths, setter: setStrengths },
                    { id: 'concerns', label: '主要顾虑', value: concerns, setter: setConcerns },
                    { id: 'note', label: '综合评价', value: note, setter: setNote },
                  ].map((field) => (
                    <div key={field.id}>
                      <label htmlFor={`public-feedback-${field.id}`} className="mb-1.5 block text-sm font-medium text-ink">
                        {field.label}
                      </label>
                      <textarea
                        id={`public-feedback-${field.id}`}
                        rows={3}
                        value={field.value}
                        onChange={(event) => field.setter(event.target.value)}
                        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                      />
                    </div>
                  ))}
                  <Button type="button" loading={busy} disabled={busy} onClick={() => void handleSubmitFeedback()}>
                    提交评分和评价
                  </Button>
                </CardBody>
              </Card>
            )}

            {access.feedback_submitted && (
              <Card>
                <CardBody className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-success-700" aria-hidden="true" />
                  <h2 className="mt-3 text-lg font-semibold text-ink">面试反馈已完成</h2>
                  <p className="mt-2 text-sm text-muted">HR 会查看结果并决定下一步，无需重复提交。</p>
                </CardBody>
              </Card>
            )}

            {access.response_status === 'declined' && (
              <Card>
                <CardBody className="py-8 text-center">
                  <XCircle className="mx-auto h-9 w-9 text-danger-700" aria-hidden="true" />
                  <h2 className="mt-3 font-semibold text-ink">已反馈无法参加</h2>
                  {access.response_reason && <p className="mt-2 text-sm text-muted">{access.response_reason}</p>}
                  <p className="mt-1 text-sm text-muted">HR 将重新安排面试官。</p>
                </CardBody>
              </Card>
            )}

            {(notice || error) && (
              <div
                role={error ? 'alert' : 'status'}
                aria-live="polite"
                className={`rounded-lg border px-4 py-3 text-sm ${
                  error
                    ? 'border-danger-200 bg-danger-50 text-danger-700'
                    : 'border-success-200 bg-success-50 text-success-700'
                }`}
              >
                {error ?? notice}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
