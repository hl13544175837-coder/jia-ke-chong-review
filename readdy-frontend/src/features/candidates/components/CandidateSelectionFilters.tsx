import type { Dispatch, SetStateAction } from 'react';

const sourceChips = [
  { value: '', label: '全部来源' }, { value: 'PDF导入', label: 'PDF导入' },
  { value: '内部推荐', label: '内部推荐' }, { value: '猎头公司推荐', label: '猎头推荐' },
  { value: '外部收录', label: '外部收录' },
];
const expRangeChips = ['', '应届/1年以内', '1–3年', '3–5年', '5–10年', '10年以上'].map((value) => ({ value, label: value || '全部' }));
const eduOptions = ['高中及以下', '大专', '本科', '硕士', '博士'];
const joinStatusChips = [
  { value: '', label: '全部' }, { value: 'available', label: '可加入' },
  { value: 'in_other', label: '其他岗位流程中' }, { value: 'in_current', label: '已在当前岗位' },
  { value: 'ended', label: '已结束' },
];
const cityOptions = ['', '上海', '北京', '杭州', '广州', '深圳', '武汉', '成都', '南京', '西安', '天津', '重庆', '合肥', '厦门', '无锡', '哈尔滨', '苏州'];
const recruiterOptions = ['', '张敏', '李华', '王磊'];
const resumeTimeOptions = [
  { value: '', label: '全部' }, { value: '7d', label: '最近7天' },
  { value: '14d', label: '最近14天' }, { value: '30d', label: '最近30天' },
  { value: '90d', label: '最近90天' },
];
const positionChips = ['', '高级前端工程师', '前端开发工程师', '后端开发工程师', 'Java开发工程师', '产品经理', '高级产品经理', 'UI/UX设计师', 'UI设计师', '数据分析师', '测试工程师', '架构师', 'HRBP', '市场运营专员'];
const sortModes = [
  { value: 'match' as const, label: '岗位匹配度' },
  { value: 'updated' as const, label: '最近更新' },
  { value: 'entry' as const, label: '最近入库' },
];

interface CandidateSelectionFiltersProps {
  searchQuery: string; setSearchQuery: Dispatch<SetStateAction<string>>;
  cityFilter: string; setCityFilter: Dispatch<SetStateAction<string>>;
  joinStatusFilter: string; setJoinStatusFilter: Dispatch<SetStateAction<string>>;
  joinableOnly: boolean; setJoinableOnly: Dispatch<SetStateAction<boolean>>;
  showMoreFilters: boolean; setShowMoreFilters: Dispatch<SetStateAction<boolean>>;
  sourceFilter: string; setSourceFilter: Dispatch<SetStateAction<string>>;
  expFilter: string; setExpFilter: Dispatch<SetStateAction<string>>;
  eduFilters: Set<string>; setEduFilters: Dispatch<SetStateAction<Set<string>>>;
  recruiterFilter: string; setRecruiterFilter: Dispatch<SetStateAction<string>>;
  resumeTimeFilter: string; setResumeTimeFilter: Dispatch<SetStateAction<string>>;
  positionFilter: string; setPositionFilter: Dispatch<SetStateAction<string>>;
  sortMode: 'match' | 'updated' | 'entry'; setSortMode: Dispatch<SetStateAction<'match' | 'updated' | 'entry'>>;
  moreFilterCount: number;
  filterStats: { total: number; available: number; filtered: number };
  hasActiveFilters: boolean;
  selectedCount: number;
  onClear: () => void;
}

export default function CandidateSelectionFilters(props: CandidateSelectionFiltersProps) {
  const chipTones = {
    primary: {
      active: 'bg-primary-500 text-white border-primary-500',
      idle: 'bg-white text-foreground-600 border-background-200 hover:border-primary-300 hover:text-primary-600',
    },
    accent: {
      active: 'bg-accent-500 text-white border-accent-500',
      idle: 'bg-white text-foreground-600 border-background-200 hover:border-accent-300 hover:text-accent-600',
    },
    secondary: {
      active: 'bg-secondary-500 text-white border-secondary-500',
      idle: 'bg-white text-foreground-600 border-background-200 hover:border-secondary-300 hover:text-secondary-600',
    },
  };
  const chipClass = (active: boolean, tone: keyof typeof chipTones = 'primary') => `px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${active ? chipTones[tone].active : chipTones[tone].idle}`;
  return (
    <div className="space-y-3 border-b border-background-100 px-6 py-3" data-ui="candidate-selection-filters">
      <div className="relative"><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><i className="ri-search-line text-sm text-foreground-400"></i></div><input type="text" placeholder="搜索姓名、职位或技能标签..." value={props.searchQuery} onChange={(event) => props.setSearchQuery(event.target.value)} className="w-full rounded-lg border border-background-200 bg-white py-2 pl-9 pr-4 text-sm text-foreground-900 placeholder:text-foreground-400 focus:border-primary-300 focus:outline-none" /></div>
      <div className="flex items-end gap-3">
        <div className="w-52"><span className="mb-1 block text-[11px] text-foreground-400">期望工作城市</span><select value={props.cityFilter} onChange={(event) => props.setCityFilter(event.target.value)} className="w-full cursor-pointer rounded-lg border border-background-200 bg-white px-3 py-2 text-sm"><option value="">全部城市</option>{cityOptions.slice(1).map((city) => <option key={city}>{city}</option>)}</select></div>
        <button onClick={() => props.setJoinableOnly(!props.joinableOnly)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs ${props.joinableOnly ? 'border-primary-500 bg-primary-500 text-white' : 'border-background-200 bg-white text-foreground-600'}`}><i className={`${props.joinableOnly ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'} text-sm`}></i>仅显示可加入</button>
      </div>
      <div><span className="mb-1.5 block text-[11px] text-foreground-400">加入状态</span><div className="flex flex-wrap gap-1.5">{joinStatusChips.map((chip) => <button key={chip.value} onClick={() => { props.setJoinStatusFilter(props.joinStatusFilter === chip.value ? '' : chip.value); if (chip.value) props.setJoinableOnly(false); }} className={chipClass(props.joinStatusFilter === chip.value, 'accent')}>{chip.label}</button>)}</div></div>
      <button onClick={() => props.setShowMoreFilters(!props.showMoreFilters)} className="flex items-center gap-1.5 text-xs text-foreground-500">{props.showMoreFilters ? <i className="ri-arrow-up-s-line"></i> : <i className="ri-arrow-down-s-line"></i>}更多筛选{props.moreFilterCount > 0 && <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] text-white">{props.moreFilterCount}</span>}</button>
      {props.showMoreFilters && (
        <div className="space-y-3 border-t border-background-100 pt-3">
          <div><span className="mb-1.5 block text-[11px] text-foreground-400">简历来源</span><div className="flex flex-wrap gap-1.5">{sourceChips.map((chip) => <button key={chip.value} onClick={() => props.setSourceFilter(props.sourceFilter === chip.value ? '' : chip.value)} className={chipClass(props.sourceFilter === chip.value)}>{chip.label}</button>)}</div></div>
          <div><span className="mb-1.5 block text-[11px] text-foreground-400">期望岗位</span><div className="flex flex-wrap gap-1.5">{positionChips.map((position) => <button key={position} onClick={() => props.setPositionFilter(props.positionFilter === position ? '' : position)} className={chipClass(props.positionFilter === position, 'accent')}>{position || '全部期望岗位'}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="mb-1.5 block text-[11px] text-foreground-400">工作年限</span><div className="flex flex-wrap gap-1.5">{expRangeChips.map((chip) => <button key={chip.value} onClick={() => props.setExpFilter(props.expFilter === chip.value ? '' : chip.value)} className={chipClass(props.expFilter === chip.value, 'secondary')}>{chip.label}</button>)}</div></div>
            <div><span className="mb-1.5 block text-[11px] text-foreground-400">学历（可多选）</span><div className="flex flex-wrap gap-1.5">{eduOptions.map((education) => <button key={education} onClick={() => props.setEduFilters((current) => { const next = new Set(current); if (next.has(education)) next.delete(education); else next.add(education); return next; })} className={chipClass(props.eduFilters.has(education), 'accent')}>{education}</button>)}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] text-foreground-400">负责人<select value={props.recruiterFilter} onChange={(event) => props.setRecruiterFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-900">{recruiterOptions.map((value) => <option key={value} value={value}>{value || '全部负责人'}</option>)}</select></label>
            <label className="text-[11px] text-foreground-400">简历更新时间<select value={props.resumeTimeFilter} onChange={(event) => props.setResumeTimeFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-900">{resumeTimeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-background-100 pt-2 text-xs"><span className="text-foreground-500">共 {props.filterStats.total} 人 · 可加入 {props.filterStats.available}{props.hasActiveFilters ? ` · 筛选结果 ${props.filterStats.filtered}` : ''}</span>{props.hasActiveFilters && <button onClick={props.onClear} className="font-medium text-primary-600"><i className="ri-close-circle-line mr-0.5"></i>清除筛选</button>}<div className="flex-1"></div><span className="text-foreground-400">排序：</span>{sortModes.map((mode) => <button key={mode.value} onClick={() => props.setSortMode(mode.value)} className={`rounded-full px-2.5 py-1 ${props.sortMode === mode.value ? 'bg-foreground-900 text-white' : 'bg-background-100 text-foreground-500'}`}>{mode.label}</button>)}<span className="flex items-center gap-1 text-foreground-500"><span className="h-2 w-2 rounded-full bg-primary-500"></span>可加入</span><span className="flex items-center gap-1 text-foreground-500"><span className="h-2 w-2 rounded-full bg-primary-200"></span>已加入</span><span className="flex items-center gap-1 text-foreground-500"><span className="h-2 w-2 rounded-full bg-foreground-300"></span>其他流程/已结束</span>{props.selectedCount > 0 && <span className="font-medium text-primary-600">已选 {props.selectedCount} 人</span>}</div>
    </div>
  );
}
