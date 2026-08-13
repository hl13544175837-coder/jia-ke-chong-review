type CandidateIdentity = {
  id?: number | null;
  candidate_id?: number | null;
  name_masked?: string | null;
  candidate_name?: string | null;
};

export function candidateDisplayName(candidate: CandidateIdentity) {
  const name = String(candidate.name_masked ?? candidate.candidate_name ?? '').trim();
  if (name) return name;
  // Workbench records (such as Offer) have their own `id`; when an explicit
  // candidate id is present it is the stable identifier users need to see.
  const id = candidate.candidate_id ?? candidate.id;
  return id ? `候选人 #${id}` : '候选人';
}
