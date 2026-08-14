import {
  buildResumeSections,
  isResumeRecord,
  normalizeWorkHistoryItem,
  resumeFieldLabel,
} from './resumePresentation';

interface StructuredResumeViewProps {
  resume: unknown;
  emptyText?: string;
  compact?: boolean;
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-foreground-400">未填写</span>;
  if (typeof value === 'boolean') return <>{value ? '是' : '否'}</>;
  return <>{String(value)}</>;
}

function RecordValue({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '');
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, item]) => (
        <div key={key} className="min-w-0 rounded-lg bg-background-50 px-3 py-2.5">
          <dt className="text-[11px] font-medium text-foreground-400">{resumeFieldLabel(key)}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-700">
            <ResumeValue value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ResumeValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-foreground-400">未填写</span>;
    const simple = value.every((item) => !isResumeRecord(item) && !Array.isArray(item));
    if (simple) {
      return <div className="flex flex-wrap gap-2">{value.map((item, index) => <span key={`${String(item)}-${index}`} className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"><PrimitiveValue value={item} /></span>)}</div>;
    }
    return <div className="space-y-2">{value.map((item, index) => <div key={index} className="rounded-lg border border-background-200 bg-white p-3">{isResumeRecord(item) ? <RecordValue value={item} /> : <ResumeValue value={item} />}</div>)}</div>;
  }
  if (isResumeRecord(value)) return <RecordValue value={value} />;
  return <PrimitiveValue value={value} />;
}

function WorkHistoryValue({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.every(isResumeRecord)) return <ResumeValue value={value} />;
  return (
    <div className="space-y-3">
      {value.map((item, index) => {
        const work = normalizeWorkHistoryItem(item);
        const hasRemaining = Object.keys(work.remaining).length > 0;
        return (
          <article key={index} data-ui="work-history-card" className="rounded-xl border border-background-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground-900">{work.company || '公司待补充'}</p>
                {work.role && <p className="mt-1 text-xs text-foreground-500">{work.role}</p>}
              </div>
              {work.period && <span className="w-fit shrink-0 whitespace-nowrap rounded-md bg-background-100 px-2 py-1 text-xs text-foreground-500">{work.period}</span>}
            </div>
            {(work.details.length > 0 || hasRemaining) && (
              <div className="mt-3 space-y-3 border-t border-background-100 pt-3">
                {work.details.map((detail, detailIndex) => (
                  <div key={`${detail.label}-${detailIndex}`}>
                    <p className="text-[11px] font-medium text-foreground-400">{detail.label}</p>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-700">
                      <ResumeValue value={detail.value} />
                    </div>
                  </div>
                ))}
                {hasRemaining && <RecordValue value={work.remaining} />}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** 长内容使用整行宽度，短内容集中在顶部概览区。 */
const MAIN_SECTION_KEYS = new Set(['work', 'projects', 'other']);

function Section({ section, overview = false }: { section: { key: string; title: string; value: unknown }; overview?: boolean }) {
  return (
    <section key={section.key} className={overview ? 'rounded-xl border border-background-200 bg-background-50 p-4' : 'border-t border-background-200 pt-5 first:border-t-0 first:pt-0'}>
      <h4 className="mb-3 text-sm font-semibold text-foreground-900">{section.title}</h4>
      <div className="text-sm leading-6 text-foreground-700">
        {section.key === 'work'
          ? <WorkHistoryValue value={section.value} />
          : <ResumeValue value={section.value} />}
      </div>
    </section>
  );
}

export default function StructuredResumeView({
  resume,
  emptyText = '暂无可展示的结构化简历信息',
  compact = false,
}: StructuredResumeViewProps) {
  const sections = buildResumeSections(resume);
  if (sections.length === 0) {
    return <div className="rounded-lg border border-background-200 bg-background-50 px-4 py-6 text-center text-sm text-foreground-500">{emptyText}</div>;
  }

  const mainSections = sections.filter((section) => MAIN_SECTION_KEYS.has(section.key));
  const sideSections = sections.filter((section) => !MAIN_SECTION_KEYS.has(section.key));

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'} data-ui="structured-resume-view">
      <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
        以下为系统结构化整理，方便快速阅读；关键信息请结合原版简历核对。
      </p>
      {sideSections.length > 0 && (
        <div data-ui="resume-overview-grid" className={compact ? 'grid gap-4' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
          {sideSections.map((section) => <Section key={section.key} section={section} overview />)}
        </div>
      )}
      {mainSections.length > 0 && (
        <div data-ui="resume-main-sections" className={compact ? 'space-y-4' : 'space-y-5'}>
          {mainSections.map((section) => <Section key={section.key} section={section} />)}
        </div>
      )}
    </div>
  );
}
