import { useState, useMemo } from 'react';
import { jobFilters } from '@/mocks/jobs';
import { provinceCityData } from '@/mocks/options';

interface RequisitionFilterProps {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filters: {
    department: string;
    province: string;
    city: string;
    owner: string;
    sort: string;
  };
  onFilterChange: (key: string, value: string) => void;
}

export default function RequisitionFilter({ searchQuery, onSearchChange, filters, onFilterChange }: RequisitionFilterProps) {
  const [filterProvince, setFilterProvince] = useState(filters.province || '');

  const filterCities = useMemo(() => {
    if (!filterProvince) return [];
    const province = provinceCityData.find((p) => p.name === filterProvince);
    return province ? province.cities : [];
  }, [filterProvince]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-3 flex-1">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <i className="ri-search-line text-foreground-400 text-sm"></i>
          </div>
          <input
            type="text"
            placeholder="需求编号、职位或负责人"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-64 pl-9 pr-4 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
          />
        </div>

        <select
          value={filters.department}
          onChange={(e) => onFilterChange('department', e.target.value)}
          className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer"
        >
          {jobFilters.departments.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        <select
          value={filterProvince}
          onChange={(e) => {
            setFilterProvince(e.target.value);
            onFilterChange('province', e.target.value);
            onFilterChange('city', '');
          }}
          className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer"
        >
          <option value="">全部省份</option>
          {provinceCityData.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>

        <select
          value={filters.city}
          onChange={(e) => onFilterChange('city', e.target.value)}
          disabled={!filterProvince}
          className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">全部城市</option>
          {filterCities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filters.owner}
          onChange={(e) => onFilterChange('owner', e.target.value)}
          className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer"
        >
          {jobFilters.owners.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 text-sm text-foreground-500 whitespace-nowrap">
        <span>排序</span>
        <select
          value={filters.sort}
          onChange={(e) => onFilterChange('sort', e.target.value)}
          className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer"
        >
          {jobFilters.sortOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}