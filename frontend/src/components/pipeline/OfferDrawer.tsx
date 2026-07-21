import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, Input, Spinner } from '../ui';

interface OfferDrawerProps {
  candidateId: number;
  demandId?: number;
  jobId: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '待发放',
  sent: '等待候选人回复',
  accepted: '待入职',
  declined: '已拒绝',
  withdrawn: '已撤回',
  expired: '已过期',
  onboarded: '已入职',
};

export function OfferDrawer({ candidateId, demandId, jobId }: OfferDrawerProps) {
  const { data, loading, error, reload } = useAsync(
    () => demandId
      ? api.getDemandOfferRecord(demandId, candidateId)
      : api.getOfferRecord(jobId, candidateId),
    [demandId, jobId, candidateId],
  );
  const [salaryRange, setSalaryRange] = useState('');
  const [onboardDate, setOnboardDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSalaryRange(data.salary_range ?? '');
    setOnboardDate(data.onboard_date ?? '');
    setNote(data.note ?? '');
  }, [data]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        salary_range: salaryRange.trim(),
        onboard_date: onboardDate || null,
        note: note.trim(),
      };
      if (demandId) {
        await api.saveDemandOfferRecord(demandId, candidateId, payload);
      } else {
        await api.saveOfferRecord(jobId, candidateId, payload);
      }
      setMessage('Offer 信息已保存');
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-2 rounded-lg border border-success-100 bg-success-50 p-3">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2 rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">
        {error.message}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-success-100 bg-success-50 p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">
          Offer 状态：{STATUS_LABELS[data?.status ?? data?.approval_status ?? 'draft'] ?? '草稿'}
        </span>
        {data?.id && (
          <Link to="/offers" className="text-xs font-semibold text-success-700 hover:underline">
            前往 Offer 管理
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="薪资范围"
          value={salaryRange}
          placeholder="例：25-30K * 14"
          onChange={(e) => setSalaryRange(e.target.value)}
        />
        <Input
          label="预计到岗时间"
          type="date"
          value={onboardDate}
          onChange={(e) => setOnboardDate(e.target.value)}
        />
      </div>
      <textarea
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        rows={2}
        placeholder="Offer 备注"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {message && <p className="text-sm text-muted">{message}</p>}
      {(data?.status ?? data?.approval_status ?? 'draft') === 'draft' ? (
        <Button type="button" size="sm" variant="secondary" loading={saving} disabled={saving} onClick={handleSave}>
          保存 Offer 草稿
        </Button>
      ) : (
        <p className="text-xs text-muted">Offer 已提交，审批和后续操作请前往 Offer 管理处理。</p>
      )}
    </div>
  );
}
