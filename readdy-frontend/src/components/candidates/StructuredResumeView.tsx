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

interface ResumeSectionView {
  key: string;
  title: string;
  value: unknown;
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-foreground-400">未填写</span>;
  if (typeof value === 'boolean') return <>{value ? '是' : '否'}</>;
  return <>{String(value)}</>;
}

function RecordValue({ value, dense = false }: { value: Record<string, unknown>; dense?: boolean }) {
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '');
  return (
    <dl className={dense ? 'grid grid-cols-2 gap-x-5 gap-y-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid gap-x-5 gap-y-2 sm:grid-cols-2'}>
      {entries.map(([key, item]) => (
        <div key={key} className="min-w-0">
          <dt className="text-[11px] font-medium text-foreground-400">{resumeFieldLabel(key)}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-foreground-800">
            <ResumeValue value={item} dense={dense} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ResumeValue({ value, dense = false }: { value: unknown; dense?: boolean }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-foreground-400">未填写</span>;
    const simple = value.every((item) => !isResumeRecord(item) && !Array.isArray(item));
    if (simple) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item, index) => (
            <span key={`${String(item)}-${index}`} className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
              <PrimitiveValue value={item} />
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className={dense ? 'space-y-2' : 'space-y-3'}>
        {value.map((item, index) => (
          <div key={index} className="border-l-2 border-background-200 pl-3">
            {isResumeRecord(item) ? <RecordValue value={item} dense={dense} /> : <ResumeValue value={item} dense={dense} />}
          </div>
        ))}
      </div>
    );
  }
  if (isResumeRecord(value)) return <RecordValue value={value} dense={dense} />;
  return <PrimitiveValue value={value} />;
}

function ProfileFactItems({ value, fallbackLabel }: { value: unknown; fallbackLabel: string }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const simple = value.every((item) => !isResumeRecord(item) && !Array.isArray(item));
    if (simple) {
      return (
        <div data-ui="resume-profile-fact" className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-[11px] font-medium text-foreground-400">{fallbackLabel}</span>
          <div className="min-w-0 text-sm text-foreground-800"><ResumeValue value={value} /></div>
        </div>
      );
    }
    return <>{value.map((item, index) => <ProfileFactItems key={index} value={item} fallbackLabel={fallbackLabel} />)}</>;
  }
  if (isResumeRecord(value)) {
    return (
      <>
        {Object.entries(value)
          .filter(([, item]) => item !== null && item !== undefined && item !== '')
          .map(([key, item]) => (
            <ProfileFactItems key={key} value={item} fallbackLabel={resumeFieldLabel(key)} />
          ))}
      </>
    );
  }
  if (value === null || value === undefined || value === '') return null;
  return (
    <div data-ui="resume-profile-fact" className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[11px] font-medium text-foreground-400">{fallbackLabel}</span>
      <span className="min-w-0 break-words text-sm text-foreground-800"><PrimitiveValue value={value} /></span>
    </div>
  );
}

function ProfileFactsValue({ sections }: { sections: ResumeSectionView[] }) {
  return (
    <section data-ui="resume-profile-facts" className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-3 py-2.5">
      {sections.map((section) => (
        <ProfileFactItems key={section.key} value={section.value} fallbackLabel={section.title} />
      ))}
    </section>
  );
}

function ProfileLongValue({ value, title }: { value: unknown; title: string }) {
  if (!isResumeRecord(value)) return <ResumeValue value={value} />;
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '');
  if (entries.length === 1) return <ResumeValue value={entries[0][1]} />;
  return (
    <div className="space-y-2">
      {entries.map(([key, item]) => (
        <div key={key}>
          {resumeFieldLabel(key) !== title && (
            <p className="mb-0.5 text-[11px] font-medium text-foreground-400">{resumeFieldLabel(key)}</p>
          )}
          <div className="whitespace-pre-wrap break-words"><ResumeValue value={item} /></div>
        </div>
      ))}
    </div>
  );
}

function ProfileSupplementValue({ value }: { value: unknown }) {
  return <ResumeValue value={value} dense />;
}

function CertificateLanguageRecord({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '');
  if (entries.length === 0) return null;
  return (
    <dl className="space-y-2">
      {entries.map(([key, item]) => (
        <div key={key} className="grid min-w-0 gap-x-3 gap-y-0.5 sm:grid-cols-[92px_minmax(0,1fr)]">
          <dt className="text-[11px] font-medium text-foreground-400">{resumeFieldLabel(key)}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-sm leading-5 text-foreground-800">
            <ResumeValue value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CertificateLanguageItem({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const simple = value.every((item) => !isResumeRecord(item) && !Array.isArray(item));
    if (simple) return <ResumeValue value={value} />;
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="min-w-0 border-l-2 border-background-200 pl-3">
            {isResumeRecord(item) ? <CertificateLanguageRecord value={item} /> : <CertificateLanguageItem value={item} />}
          </div>
        ))}
      </div>
    );
  }
  if (isResumeRecord(value)) return <CertificateLanguageRecord value={value} />;
  return <div className="whitespace-pre-wrap break-words text-sm leading-5"><ResumeValue value={value} /></div>;
}

function CertificateLanguageValue({ value }: { value: unknown }) {
  const entries = isResumeRecord(value)
    ? Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '')
    : [['certificates', value] as const];
  return (
    <div data-ui="resume-certificate-language-list" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
      {entries.map(([key, item]) => (
        <article key={key} className="min-w-0 rounded-md border border-background-200 bg-background-50/60 px-3 py-2.5">
          <h5 className="mb-2 text-xs font-semibold text-foreground-600">{resumeFieldLabel(key)}</h5>
          <CertificateLanguageItem value={item} />
        </article>
      ))}
    </div>
  );
}

function WorkHistoryValue({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.every(isResumeRecord)) return <ResumeValue value={value} />;
  return (
    <div data-ui="work-history-timeline" className="relative space-y-0 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-background-200">
      {value.map((item, index) => {
        const work = normalizeWorkHistoryItem(item);
        const hasRemaining = Object.keys(work.remaining).length > 0;
        return (
          <article key={index} data-ui="work-history-entry" className="relative py-2.5 pl-6">
            <span className="absolute left-0 top-[15px] h-[11px] w-[11px] rounded-full border-2 border-primary-400 bg-white" />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h5 className="break-words text-sm font-semibold text-foreground-900">{work.company || '公司待补充'}</h5>
              {work.role && <span className="text-xs font-medium text-primary-700">{work.role}</span>}
              {work.period && <span className="ml-auto shrink-0 text-xs font-medium text-foreground-500">{work.period}</span>}
            </div>
            {(work.details.length > 0 || hasRemaining) && (
              <div className="mt-1.5 grid gap-x-5 gap-y-1.5 text-sm leading-6 text-foreground-700 md:grid-cols-2">
                {work.details.map((detail, detailIndex) => (
                  <div key={`${detail.label}-${detailIndex}`} className="min-w-0">
                    <span className="mr-2 text-[11px] font-medium text-foreground-400">{detail.label}</span>
                    <div className="whitespace-pre-wrap break-words"><ResumeValue value={detail.value} /></div>
                  </div>
                ))}
                {hasRemaining && <div className="md:col-span-2"><RecordValue value={work.remaining} /></div>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ProjectHistoryValue({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return <ResumeValue value={value} />;
  return (
    <div data-ui="project-history-grid" className="grid gap-3 md:grid-cols-2">
      {value.map((item, index) => (
        <article key={index} className="border-l-2 border-primary-200 bg-background-50/70 px-3 py-2.5">
          {isResumeRecord(item) ? <RecordValue value={item} /> : <ResumeValue value={item} />}
        </article>
      ))}
    </div>
  );
}

const PROFILE_FACT_SECTION_KEYS = ['basic', 'education', 'target'];
const PROFILE_LONG_SECTION_KEYS = ['summary'];
const PROFILE_SUPPLEMENT_SECTION_KEYS = ['skills', 'certificates'];
const PROFILE_SECTION_KEYS = new Set([
  ...PROFILE_FACT_SECTION_KEYS,
  ...PROFILE_LONG_SECTION_KEYS,
  ...PROFILE_SUPPLEMENT_SECTION_KEYS,
]);
const MAIN_SECTION_KEYS = new Set(['work', 'projects', 'other']);

function ProfileStrip({ sections }: { sections: ResumeSectionView[] }) {
  const sectionByKey = new Map(sections.map((section) => [section.key, section]));
  const factSections = PROFILE_FACT_SECTION_KEYS.flatMap((key) => sectionByKey.get(key) ?? []);
  const longSections = PROFILE_LONG_SECTION_KEYS.flatMap((key) => sectionByKey.get(key) ?? []);
  const supplementSections = PROFILE_SUPPLEMENT_SECTION_KEYS.flatMap((key) => sectionByKey.get(key) ?? []);
  return (
    <div data-ui="resume-profile-strip" className="divide-y divide-background-200 rounded-lg border border-background-200 bg-white">
      {factSections.length > 0 && <ProfileFactsValue sections={factSections} />}
      {longSections.map((section) => (
        <section key={section.key} data-ui="resume-profile-long" className="grid gap-2 px-3 py-2.5 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4">
          <h4 className="text-xs font-semibold text-foreground-600">{section.title}</h4>
          <div className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-700">
            <ProfileLongValue value={section.value} title={section.title} />
          </div>
        </section>
      ))}
      {supplementSections.map((section) => (
        <section key={section.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4">
          <h4 className="text-xs font-semibold text-foreground-600">{section.title}</h4>
          <div className="min-w-0 text-sm leading-5 text-foreground-700">
            {section.key === 'certificates'
              ? <CertificateLanguageValue value={section.value} />
              : <ProfileSupplementValue value={section.value} />}
          </div>
        </section>
      ))}
    </div>
  );
}

function Section({ section }: { section: ResumeSectionView }) {
  return (
    <section className="border-t border-background-200 pt-4 first:border-t-0 first:pt-0">
      <h4 className="mb-2 text-sm font-semibold text-foreground-900">{section.title}</h4>
      <div className="text-sm leading-6 text-foreground-700">
        {section.key === 'work'
          ? <WorkHistoryValue value={section.value} />
          : section.key === 'projects'
            ? <ProjectHistoryValue value={section.value} />
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

  const profileSections = sections.filter((section) => PROFILE_SECTION_KEYS.has(section.key));
  const mainSections = sections.filter((section) => MAIN_SECTION_KEYS.has(section.key));

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'} data-ui="structured-resume-view">
      <p className="border-l-2 border-sky-300 bg-sky-50/70 px-3 py-1.5 text-xs leading-5 text-sky-800">
        系统已结构化整理，便于快速阅读；关键信息请结合原版简历核对。
      </p>
      {profileSections.length > 0 && <ProfileStrip sections={profileSections} />}
      {mainSections.length > 0 && (
        <div data-ui="resume-main-sections" className={compact ? 'space-y-4' : 'space-y-5'}>
          {mainSections.map((section) => <Section key={section.key} section={section} />)}
        </div>
      )}
    </div>
  );
}
