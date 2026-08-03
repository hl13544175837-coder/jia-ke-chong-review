import { useState, useMemo } from 'react';
import ResumePanel from '@/features/candidates/components/ResumePanel';
import AdvanceStageModal from '@/components/feature/AdvanceStageModal';
import { stageColorMap } from '@/mocks/candidates';

interface PipelineCandidate {
  id: number;
  name: string;
  gender: string;
  age: number;
  phone: string;
  email: string;
  position: string;
  department?: string;
  source: string;
  stage: string;
  stageColor: string;
  appliedAt: string;
  education: string;
  experience: string;
  experienceYears: string;
  tags: string[];
  summary: string;
  workHistory: Array<{ company: string; role: string; period: string; highlights: string[] }>;
  educationHistory: Array<{ school: string; degree: string; major: string; period: string }>;
  skills: string[];
  projects?: Array<{ name: string; role: string; desc: string }>;
  languages?: string[];
  certifications?: string[];
  nextAction?: string;
}

interface FlowStage {
  id: string;
  label: string;
  description: string;
  color: string;
}

interface CandidatePipelineProps {
  candidates: PipelineCandidate[];
  flowStages: FlowStage[];
  stageMapping: (stage: string) => string;
  onAdvance?: (candidateId: number, newStage: string) => void;
  onReject?: (candidateId: number) => void;
  onCandidatesChange?: (newCandidates: PipelineCandidate[]) => void;
  title?: string;
}

export default function CandidatePipeline({
  candidates,
  flowStages,
  stageMapping,
  onAdvance,
  onReject,
  onCandidatesChange,
  title = '候选人',
}: CandidatePipelineProps) {
  const [selectedStage, setSelectedStage] = useState('all');
  const [resumeCandidate, setResumeCandidate] = useState<PipelineCandidate | null>(null);
  const [advanceCandidate, setAdvanceCandidate] = useState<PipelineCandidate | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const candidatesByStage = (stageId: string) => {
    return candidates.filter((c) => stageMapping(c.stage) === stageId);
  };

  const filteredCandidates = useMemo(() => {
    if (selectedStage === 'all') return candidates;
    return candidates.filter((c) => stageMapping(c.stage) === selectedStage);
  }, [selectedStage, candidates, stageMapping]);

  const handleAdvance = (candidate: PipelineCandidate) => {
    setAdvanceCandidate(candidate);
    setAdvanceOpen(true);
  };

  const handleConfirmAdvance = (candidateId: number, newStage: string, _comment: string) => {
    const updated = candidates.map((c) =>
      c.id === candidateId
        ? { ...c, stage: newStage, stageColor: stageColorMap[newStage] || c.stageColor }
        : c
    );
    onCandidatesChange?.(updated);
    onAdvance?.(candidateId, newStage);
  };

  const handleReject = (candidate: PipelineCandidate) => {
    const updated = candidates.map((c) =>
      c.id === candidate.id
        ? { ...c, stage: '已淘汰', stageColor: stageColorMap['已淘汰'] }
        : c
    );
    onCandidatesChange?.(updated);
    onReject?.(candidate.id);
  };

  const stageLabel = selectedStage === 'all'
    ? `全部${title}`
    : flowStages.find((s) => s.id === selectedStage)?.label || '';

  return (
    <div className="space-y-5">
      {/* Pipeline cards */}
      <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
        {flowStages.map((stage, index) => {
          const count = candidatesByStage(stage.id).length;
          const isActive = selectedStage === stage.id;
          return (
            <button
              key={stage.id}
              onClick={() => setSelectedStage(isActive ? 'all' : stage.id)}
              className={`flex-1 min-w-[140px] rounded-xl border p-4 text-left transition-all cursor-pointer whitespace-nowrap ${
                isActive ? 'ring-2 ring-primary-300 shadow-sm' : 'hover:shadow-sm'
              } ${stage.color}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium opacity-80">{index + 1}</span>
                <span className="text-lg font-bold">{count}</span>
              </div>
              <p className="text-sm font-semibold">{stage.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{stage.description}</p>
            </button>
          );
        })}
      </div>

      {/* Candidate list */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
          <h3 className="font-semibold text-foreground-900 text-sm">
            {stageLabel}
            <span className="ml-2 text-xs text-foreground-400">{filteredCandidates.length} 人</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedStage('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                selectedStage === 'all'
                  ? 'bg-primary-500 text-white'
                  : 'bg-background-100 text-foreground-600 hover:bg-background-200'
              }`}
            >
              全部显示
            </button>
          </div>
        </div>
        <div className="divide-y divide-background-100">
          {filteredCandidates.map((c) => (
            <div
              key={c.id}
              className="px-5 py-4 hover:bg-background-50/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary-600">{c.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground-900">{c.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${c.stageColor}`}>{c.stage}</span>
                    {c.nextAction && (
                      <span className="text-xs text-foreground-400">{c.nextAction}</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground-500 mt-0.5">
                    {c.position}
                    {c.department && ` · ${c.department}`}
                    {c.experience && ` · ${c.experience}`}
                    {c.education && ` · ${c.education}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-foreground-400">{c.source}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setResumeCandidate(c)}
                      className="w-8 h-8 rounded-lg bg-background-100 hover:bg-background-200 flex items-center justify-center text-foreground-500 transition-colors cursor-pointer"
                      title="查看简历"
                    >
                      <i className="ri-eye-line text-sm"></i>
                    </button>
                    <button
                      onClick={() => handleAdvance(c)}
                      className="w-8 h-8 rounded-lg bg-background-100 hover:bg-primary-100 flex items-center justify-center text-foreground-500 hover:text-primary-600 transition-colors cursor-pointer"
                      title="推进流程"
                    >
                      <i className="ri-arrow-right-circle-line text-sm"></i>
                    </button>
                    <button
                      onClick={() => handleReject(c)}
                      className="w-8 h-8 rounded-lg bg-background-100 hover:bg-accent-50 flex items-center justify-center text-foreground-500 hover:text-accent-600 transition-colors cursor-pointer"
                      title="淘汰"
                    >
                      <i className="ri-user-unfollow-line text-sm"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {filteredCandidates.length === 0 && (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-user-follow-line text-2xl text-foreground-400"></i>
            </div>
            <p className="text-sm text-foreground-500">该阶段暂无候选人</p>
          </div>
        )}
      </div>

      <ResumePanel candidate={resumeCandidate} onClose={() => setResumeCandidate(null)} />
      <AdvanceStageModal
        candidate={advanceCandidate ? { id: advanceCandidate.id, name: advanceCandidate.name, stage: advanceCandidate.stage } : null}
        isOpen={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        onConfirm={handleConfirmAdvance}
      />
    </div>
  );
}
