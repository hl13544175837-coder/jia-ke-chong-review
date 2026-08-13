type CandidateIdentity = {
  id?: number | null;
  candidate_id?: number | null;
  name_masked?: string | null;
  candidate_name?: string | null;
};

export function candidateDisplayName(candidate: CandidateIdentity) {
  const name = String(candidate.name_masked ?? candidate.candidate_name ?? '').trim();
  if (name) return name;
  const id = candidate.id ?? candidate.candidate_id;
  return id ? `候选人 #${id}` : '候选人';
}
