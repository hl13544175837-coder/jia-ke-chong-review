import { Button, Input } from '../../../components/ui';
import type { CandidateOwnerOption, DemandListQuery, DemandStatus } from '../../../types';

interface DemandFiltersProps {
  query: DemandListQuery;
  owners: CandidateOwnerOption[];
  onChange: (query: DemandListQuery) => void;
}

const STATUS_OPTIONS: { value: DemandStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '招聘中' },
  { value: 'pending', label: '待确认' },
  { value: 'paused', label: '暂停' },
  { value: 'filled', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
  { value: 'closed', label: '提前关闭' },
];

export function DemandFilters({ query, owners, onChange }: DemandFiltersProps) {
  const patch = (next: Partial<DemandListQuery>) => onChange({ ...query, ...next, page: 1 });
  return (
    <div className="space-y-4 rounded-lg border border-hairline bg-canvas p-4">
      <div className="flex flex-wrap gap-2" aria-label="需求状态分类">
        {STATUS_OPTIONS.map((item) => (
          <Button
            key={item.value}
            type="button"
            size="sm"
            variant={(query.status ?? 'all') === item.value ? 'primary' : 'secondary'}
            onClick={() => patch({ status: item.value })}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Input
          label="搜索"
          placeholder="需求编号、职位或负责人"
          value={query.q ?? ''}
          onChange={(event) => patch({ q: event.target.value })}
        />
        <Input
          label="用人部门"
          value={query.department ?? ''}
          onChange={(event) => patch({ department: event.target.value })}
        />
        <Input
          label="招聘城市"
          value={query.city ?? ''}
          onChange={(event) => patch({ city: event.target.value })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">招聘负责人</span>
          <select
            value={query.owner_hr_id ?? ''}
            onChange={(event) => patch({ owner_hr_id: event.target.value ? Number(event.target.value) : undefined })}
            className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
          >
            <option value="">全部负责人</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">排序</span>
          <select
            value={query.sort ?? 'created_at_desc'}
            onChange={(event) => patch({ sort: event.target.value as DemandListQuery['sort'] })}
            className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
          >
            <option value="created_at_desc">最新创建在前</option>
            <option value="created_at_asc">最早创建在前</option>
          </select>
        </label>
      </div>
    </div>
  );
}
