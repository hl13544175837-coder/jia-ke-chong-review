interface JobDescriptionSectionProps {
  responsibilities?: string;
  requirements?: string;
  interviewProcess?: string;
}

export default function JobDescriptionSection({
  responsibilities,
  requirements,
  interviewProcess,
}: JobDescriptionSectionProps) {
  if (!responsibilities && !requirements && !interviewProcess) return null;
  const interviewSteps = interviewProcess?.split(' → ') ?? [];
  return (
    <section data-ui="job-description-section" className="space-y-4">
      {responsibilities && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground-900">岗位职责</h3>
          <div className="whitespace-pre-line rounded-lg bg-background-50 p-4 text-sm leading-relaxed text-foreground-700">{responsibilities}</div>
        </div>
      )}
      {requirements && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground-900">任职要求</h3>
          <div className="whitespace-pre-line rounded-lg bg-background-50 p-4 text-sm leading-relaxed text-foreground-700">{requirements}</div>
        </div>
      )}
      {interviewSteps.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground-900">面试流程</h3>
          <div className="rounded-lg bg-background-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {interviewSteps.map((step, index) => (
                <div key={`${step}-${index}`} className="flex items-center gap-2">
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700">{step.trim()}</span>
                  {index < interviewSteps.length - 1 && <i className="ri-arrow-right-s-line text-foreground-400"></i>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
