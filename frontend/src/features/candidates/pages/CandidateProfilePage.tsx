// 候选人档案页（HR 视角）— 展示后端返回的简历事实、技能证据和结构化内容。

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Briefcase, MoreHorizontal, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { candidatesApi as api } from '../api';
import { API_BASE } from '../../../lib/apiBase';
import { formatDate } from '../../../lib/formatDate';
import { useAsync } from '../../../lib/useAsync';
import { useAuth } from '../../../lib/auth';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner, ErrorState, Input, useToast } from '../../../components/ui';
import { Reveal } from '../../../components/motion';
import { ReassignOwner } from '../../../components/candidate/ReassignOwner';
import { RejectionDispositionForm } from '../../../components/pipeline/RejectionDispositionForm';
import { OfferDrawer } from '../../../components/pipeline/OfferDrawer';
import { OriginalResumeViewer } from '../components/OriginalResumeViewer';
import { StructuredResumeView } from '../components/StructuredResumeView';
import { CandidateMatchAnalysis } from '../components/CandidateMatchAnalysis';
import { STAGES, stageLabel } from '../../../lib/pipelineStages';
import { NEXT_STAGE, isInterviewStage, isTerminalStage, stageAgeLabel } from '../../../lib/pipelineInsights';
import type {
  CandidateResumeTab,
  CandidateSourceInfo,
  CandidateTag,
  OriginalResumeInfo,
  ResumeJson,
} from '../types';
import type { CandidateDispositionInput, CandidatePipelineItem, PipelineStage } from '../../../types';

// Cal.com 近黑配色 hex（recharts 不接受 tailwind 类）
const RADAR_STROKE = '#111111';
const RADAR_FILL = 'rgba(17, 17, 17, 0.08)';
const RADAR_GRID_STROKE = '#e5e7eb';   // hairline
const RADAR_TICK_FILL = '#6b7280';     // muted
const CORE_SKILL_LIMIT = 8;
const EVIDENCE_SKILL_LIMIT = 6;
const CANDIDATE_RESUME_TABS: Array<{ key: CandidateResumeTab; label: string; hint: string }> = [
  { key: 'original', label: '原始简历', hint: '事实真源' },
  { key: 'structured', label: '结构化画像', hint: '可编辑辅助信息' },
  { key: 'match', label: '匹配分析', hint: '后端结果' },
];

function sortSkillTags(tags: CandidateTag[]): CandidateTag[] {
  return [...tags]
    .filter((tag) => tag.tag)
    .sort((a, b) => {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.tag.localeCompare(b.tag, 'zh-CN');
    });
}

function getCoreSkillTags(tags: CandidateTag[]): CandidateTag[] {
  return sortSkillTags(tags).slice(0, CORE_SKILL_LIMIT);
}

function skillTone(score: number) {
  if (score >= 4) return 'accent';
  if (score >= 3) return 'warning';
  return 'neutral';
}

// 核心技能雷达图（最多 8 个标签，避免详情页变成标签墙）
function TagRadarChart({ tags }: { tags: CandidateTag[] }) {
  const data = tags.map((t) => ({ subject: t.tag, value: t.score }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke={RADAR_GRID_STROKE} />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 12, fill: RADAR_TICK_FILL }}
        />
        <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
        <Radar
          name="技能评分"
          dataKey="value"
          stroke={RADAR_STROKE}
          fill={RADAR_FILL}
          fillOpacity={1}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function AllSkillTagsDisclosure({ tags, hiddenCount }: { tags: CandidateTag[]; hiddenCount: number }) {
  if (hiddenCount <= 0) return null;
  const sortedTags = sortSkillTags(tags);

  return (
    <details className="mt-4 rounded-md border border-hairline bg-surface-soft px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        查看全部技能标签（共 {tags.length} 个，另有 {hiddenCount} 个未放入雷达）
      </summary>
      <div className="mt-3 flex max-h-48 flex-wrap gap-1.5 overflow-auto pr-1">
        {sortedTags.map((tag, index) => (
          <Badge key={`${tag.tag}-${tag.score}-${index}`} tone={skillTone(tag.score)}>
            {tag.tag} · {tag.score}
          </Badge>
        ))}
      </div>
    </details>
  );
}

function textFromValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function structuredSummary(value: unknown, keys: string[]): string {
  const record = Array.isArray(value)
    ? value.find(isObject)
    : isObject(value)
      ? value
      : null;
  if (record) {
    return keys
      .map((key) => textFromValue(record[key]))
      .filter(Boolean)
      .join(' · ');
  }
  if (Array.isArray(value)) {
    return value.map(textFromValue).find(Boolean) ?? '';
  }
  return textFromValue(value);
}

function uniqueLines(lines: string[], limit: number): string[] {
  return Array.from(new Set(lines.filter(Boolean))).slice(0, limit);
}

function CandidateEvidenceCard({
  resumeJson,
  source,
  tags,
  coreTags,
  hiddenSkillCount,
}: {
  resumeJson: ResumeJson;
  source: CandidateSourceInfo | null | undefined;
  tags: CandidateTag[];
  coreTags: CandidateTag[];
  hiddenSkillCount: number;
}) {
  const info = getExtractedInfo(resumeJson);
  const visibleSkills = coreTags.slice(0, EVIDENCE_SKILL_LIMIT);
  const latestExperience = structuredSummary(info.experience ?? info.work_experience, ['position', 'company', 'duration']);
  const education = structuredSummary(info.education, ['school', 'degree', 'major']);
  const summary = textFromValue(info.summary);

  const facts = uniqueLines([
    latestExperience ? `最近经历：${latestExperience}` : '',
    education ? `教育背景：${education}` : '',
    source?.target_job_title ? `来源岗位：${source.target_job_title}` : '',
    summary ? `简历摘要：${summary}` : '',
  ], 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>简历事实摘要</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="rounded-md border border-hairline bg-surface-soft px-3 py-3">
          <p className="text-sm leading-6 text-body">
            结构化信息来自后端解析结果；技能分、标签和字段只用于辅助核对，不代表推进、淘汰或录用结论。
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">已提取信息</p>
          {facts.length > 0 ? (
            <ul className="space-y-1.5 text-sm leading-6 text-body">
              {facts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-soft">后端暂未返回可展示的结构化经历信息，请查看原始简历。</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">技能标签（后端解析）</p>
          {visibleSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleSkills.map((skill) => (
                <Badge key={`${skill.tag}-${skill.score}`} tone={skillTone(skill.score)}>
                  {skill.tag} · {skill.score}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-soft">暂无技能标签</p>
          )}
        </div>

        {coreTags.length >= 3 && (
          <details className="rounded-md border border-hairline bg-canvas px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-ink">辅助雷达</summary>
            <div className="mt-3">
              <TagRadarChart tags={coreTags} />
            </div>
          </details>
        )}

        <AllSkillTagsDisclosure tags={tags} hiddenCount={hiddenSkillCount} />
      </CardBody>
    </Card>
  );
}

// ---- 简历 JSON 渲染器 ----

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((i) => typeof i === 'string');
}

// 字符串列表，渲染为项目符号
function StringList({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-0.5 text-sm text-body">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// 对象数组（如工作经历条目）
function ObjectList({ items }: { items: Record<string, unknown>[] }) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <EntryCard key={i} data={item} />
      ))}
    </div>
  );
}

// 简历子字段中文标签（教育/工作经历条目内部）。键统一用小写匹配，做到大小写不敏感。
const FIELD_LABELS: Record<string, string> = {
  school: '学校',
  degree: '学位',
  major: '专业',
  year: '年份',
  years: '年限',
  duration: '时间',
  period: '时间',
  company: '公司',
  employer: '公司',
  position: '职位',
  title: '职位',
  role: '职位',
  description: '描述',
  responsibilities: '职责',
  achievements: '成果',
  name: '名称',
  date: '日期',
  start: '开始',
  end: '结束',
  level: '水平',
  proficiency: '熟练度',
  location: '地点',
  city: '城市',
  gpa: 'GPA',
  certification: '证书',
  issuer: '颁发机构',
  language: '语言',
};

// 大小写不敏感取中文标签；未知字段做基础美化（首字母大写、下划线转空格）而非裸键。
function fieldLabel(key: string): string {
  const hit = FIELD_LABELS[key.toLowerCase()];
  if (hit) return hit;
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


// 标题候选键（用作条目主标题）与副标题候选键
const TITLE_KEYS = ['company', 'school', 'position', 'title', 'name'];
const SUBTITLE_KEYS = ['position', 'degree', 'major', 'title'];
const PERIOD_KEYS = ['duration', 'year', 'date'];
const DESC_KEYS = ['description', 'summary'];

// 结构化条目卡片：主标题 + 时间徽章 + 副标题 + 描述 + 其余字段。
// 取代原先把 school/degree/... 平铺成 "key: value" 的丑陋样式。
function EntryCard({ data }: { data: Record<string, unknown> }) {
  const str = (k: string) => {
    const v = data[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const pick = (keys: string[]) => keys.map(str).find(Boolean);

  const title = pick(TITLE_KEYS);
  // 副标题：学位+专业 / 职位 等组合，避免 major 等字段被丢弃。
  const subParts = SUBTITLE_KEYS
    .filter((k) => str(k) && str(k) !== title)
    .map(str);
  const subtitle = Array.from(new Set(subParts)).join(' · ') || undefined;
  const period = pick(PERIOD_KEYS);
  const desc = pick(DESC_KEYS);

  const usedKeys = new Set([
    ...TITLE_KEYS, ...SUBTITLE_KEYS, ...PERIOD_KEYS, ...DESC_KEYS,
  ]);
  // 剩余未被主结构消费的字段，作为补充键值
  const rest = Object.entries(data).filter(
    ([k, v]) => !usedKeys.has(k) && v != null && String(v).trim() !== ''
  );

  return (
    <div className="relative rounded-lg border border-hairline bg-canvas px-4 py-3.5 transition-colors hover:border-surface-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <p className="font-medium text-ink">{title}</p>
          ) : (
            <p className="text-sm text-muted-soft">条目</p>
          )}
          {subtitle && <p className="mt-0.5 text-sm text-body">{subtitle}</p>}
        </div>
        {period && (
          <span className="shrink-0 rounded-full bg-surface-card px-2.5 py-0.5 text-xs font-medium text-muted tabular-nums">
            {period}
          </span>
        )}
      </div>
      {desc && (
        <p className="mt-2 text-sm leading-relaxed text-body whitespace-pre-wrap">{desc}</p>
      )}
      {rest.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {rest.map(([k, v]) => (
            <div key={k} className="flex gap-1.5 text-xs">
              <dt className="shrink-0 text-muted-soft">{fieldLabel(k)}</dt>
              <dd className="text-body">{renderScalar(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// 扁平键值对渲染（用于无法结构化的对象）
function SimpleKV({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="space-y-1.5">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex gap-2 text-sm">
          <dt className="shrink-0 font-medium text-muted">{fieldLabel(k)}</dt>
          <dd className="text-ink">{renderScalar(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderScalar(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v || '—';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((i) => renderScalar(i, depth)).join(', ');
  if (isObject(v)) {
    // 最多递归 2 层，避免循环引用
    if (depth < 2) {
      return Object.entries(v)
        .map(([k, val]) => `${k}: ${renderScalar(val, depth + 1)}`)
        .join(' | ');
    }
    return JSON.stringify(v);
  }
  return String(v);
}

// 常见简历字段中文标签映射
const SECTION_LABELS: Record<string, string> = {
  education: '教育背景',
  experience: '工作经历',
  work_experience: '工作经历',
  skills: '技能',
  summary: '个人简介',
  projects: '项目经历',
  project_experience: '项目经历',
  certifications: '资质证书',
  languages: '语言能力',
  contact: '联系方式',
  name: '姓名',
  email: '邮箱',
  phone: '电话',
  intent_city: '意向城市',
  additional_info: '其他备注',
};

// 优先展示顺序
const SECTION_ORDER = [
  'summary',
  'name',
  'email',
  'phone',
  'intent_city',
  'contact',
  'education',
  'experience',
  'work_experience',
  'skills',
  'projects',
  'project_experience',
  'additional_info',
  'certifications',
  'languages',
];

const RESUME_TOP_ID = 'candidate-full-resume';

const RESUME_OUTLINE_ITEMS = [
  { label: '全部', targets: [] },
  { label: '重点', targets: ['summary', 'name', 'contact', 'email', 'phone', 'intent_city'] },
  { label: '经历', targets: ['experience', 'work_experience'] },
  { label: '项目', targets: ['projects', 'project_experience'] },
  { label: '教育/证书/其他', targets: ['education', 'certifications', 'languages', 'additional_info'] },
];

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key;
}

function resumeSectionId(key: string): string {
  return `resume-section-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function sortedEntries(obj: ResumeJson): [string, unknown][] {
  const entries = Object.entries(obj);
  return entries.sort(([a], [b]) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function ResumeSection({ sectionKey, value }: { sectionKey: string; value: unknown }) {
  const label = sectionLabel(sectionKey);

  let content: ReactNode;

  if (value === null || value === undefined || value === '') {
    content = <p className="text-sm text-muted-soft">—</p>;
  } else if (typeof value === 'string') {
    content = <p className="text-sm text-body whitespace-pre-wrap">{value}</p>;
  } else if (isStringArray(value)) {
    content = <StringList items={value} />;
  } else if (Array.isArray(value)) {
    const objItems = value.filter(isObject);
    if (objItems.length > 0) {
      content = <ObjectList items={objItems} />;
    } else {
      content = <StringList items={value.map(renderScalar)} />;
    }
  } else if (isObject(value)) {
    content = <SimpleKV data={value} />;
  } else {
    content = <p className="text-sm text-body">{renderScalar(value)}</p>;
  }

  return (
    <section id={resumeSectionId(sectionKey)} className="scroll-mt-24">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </h3>
      {content}
    </section>
  );
}

function resumeContentEntries(resumeJson: ResumeJson): [string, unknown][] {
  // 后端 resume_json 结构为 { extracted_info: {...简历字段}, skills: [...], upload_date }。
  // 真正可读的简历内容在 extracted_info 里；skills 已由左栏技能标签单独展示，
  // upload_date 是元数据。故优先解包 extracted_info 渲染；兼容旧的扁平结构。
  const ei = resumeJson?.extracted_info;
  const source: ResumeJson =
    ei && typeof ei === 'object' && !Array.isArray(ei)
      ? (ei as ResumeJson)
      : resumeJson;

  return sortedEntries(source).filter(
    ([k]) => k !== 'skills' && k !== 'upload_date' && k !== 'extracted_info'
  );
}

function ResumeOutlineNav({ resumeJson }: { resumeJson: ResumeJson }) {
  const entries = resumeContentEntries(resumeJson);
  const entryKeys = new Set(entries.map(([key]) => key));
  const outlineItems = RESUME_OUTLINE_ITEMS.map((item) => {
    const target = item.targets.find((key) => entryKeys.has(key));
    return {
      label: item.label,
      href: item.targets.length === 0 ? `#${RESUME_TOP_ID}` : target ? `#${resumeSectionId(target)}` : null,
    };
  }).filter((item) => item.href !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>简历</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {outlineItems.length > 0 ? (
          <nav aria-label="简历目录" className="space-y-1">
            {outlineItems.map((item) => (
              <a
                key={item.label}
                href={item.href ?? `#${RESUME_TOP_ID}`}
                className="block rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {item.label}
              </a>
            ))}
          </nav>
        ) : (
          <p className="text-sm text-muted-soft">暂无可定位的简历段落。</p>
        )}
      </CardBody>
    </Card>
  );
}

function ResumeJsonView({ resumeJson }: { resumeJson: ResumeJson }) {
  const entries = resumeContentEntries(resumeJson);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-soft">暂无简历结构化内容</p>;
  }
  return (
    <Reveal className="space-y-4" stagger={0.05}>
      {entries.map(([k, v]) => (
        <ResumeSection key={k} sectionKey={k} value={v} />
      ))}
    </Reveal>
  );
}

interface ProfileDraft {
  name: string;
  email: string;
  phone: string;
  intentCity: string;
  summary: string;
  experienceItems: ExperienceDraftItem[];
  projectItems: ProjectDraftItem[];
  additionalInfo: string;
  skillsText: string;
}

interface ExperienceDraftItem {
  id: string;
  company: string;
  position: string;
  duration: string;
  description: string;
}

interface ProjectDraftItem {
  id: string;
  name: string;
  role: string;
  duration: string;
  description: string;
}

type StructuredDraftItem = ExperienceDraftItem | ProjectDraftItem;
type StructuredDraftField<Item extends StructuredDraftItem> = {
  key: Exclude<keyof Item, 'id'>;
  label: string;
  placeholder: string;
  multiline?: boolean;
  className?: string;
};

let structuredItemSeed = 0;

function nextStructuredItemId(prefix: string): string {
  structuredItemSeed += 1;
  return `${prefix}-${structuredItemSeed}`;
}

function getExtractedInfo(resumeJson: ResumeJson): Record<string, unknown> {
  const info = resumeJson?.extracted_info;
  return isObject(info) ? info : {};
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function createExperienceDraftItem(seed?: Partial<Omit<ExperienceDraftItem, 'id'>>): ExperienceDraftItem {
  return {
    id: nextStructuredItemId('experience'),
    company: seed?.company ?? '',
    position: seed?.position ?? '',
    duration: seed?.duration ?? '',
    description: seed?.description ?? '',
  };
}

function createProjectDraftItem(seed?: Partial<Omit<ProjectDraftItem, 'id'>>): ProjectDraftItem {
  return {
    id: nextStructuredItemId('project'),
    name: seed?.name ?? '',
    role: seed?.role ?? '',
    duration: seed?.duration ?? '',
    description: seed?.description ?? '',
  };
}

function buildExperienceDraftItems(value: unknown): ExperienceDraftItem[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<ExperienceDraftItem[]>((items, entry) => {
    if (isObject(entry)) {
      items.push(
        createExperienceDraftItem({
          company: textValue(entry.company),
          position: textValue(entry.position),
          duration: textValue(entry.duration),
          description: textValue(entry.description),
        }),
      );
      return items;
    }
    const description = String(entry || '').trim();
    if (description) {
      items.push(createExperienceDraftItem({ description }));
    }
    return items;
  }, []);
}

function buildProjectDraftItems(value: unknown): ProjectDraftItem[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<ProjectDraftItem[]>((items, entry) => {
    if (isObject(entry)) {
      items.push(
        createProjectDraftItem({
          name: textValue(entry.name),
          role: textValue(entry.role),
          duration: textValue(entry.duration),
          description: textValue(entry.description),
        }),
      );
      return items;
    }
    const name = String(entry || '').trim();
    if (name) {
      items.push(createProjectDraftItem({ name }));
    }
    return items;
  }, []);
}

function compactRecord(entries: Array<[string, string]>): Record<string, string> {
  const record: Record<string, string> = {};
  entries.forEach(([key, value]) => {
    const cleaned = value.trim();
    if (cleaned) record[key] = cleaned;
  });
  return record;
}

function experienceItemsToPayload(items: ExperienceDraftItem[]): Record<string, string>[] {
  return items
    .map((item) =>
      compactRecord([
        ['company', item.company],
        ['position', item.position],
        ['duration', item.duration],
        ['description', item.description],
      ]),
    )
    .filter((item) => Object.keys(item).length > 0);
}

function projectItemsToPayload(items: ProjectDraftItem[]): Record<string, string>[] {
  return items
    .map((item) =>
      compactRecord([
        ['name', item.name],
        ['role', item.role],
        ['duration', item.duration],
        ['description', item.description],
      ]),
    )
    .filter((item) => Object.keys(item).length > 0);
}

function skillsToLines(tags: CandidateTag[]): string {
  return tags.map((tag) => `${tag.tag}:${tag.score}`).join('\n');
}

function linesToSkills(text: string): CandidateTag[] {
  const seen = new Set<string>();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nameRaw, scoreRaw] = line.split(/[:：]/);
      const tag = (nameRaw || '').trim();
      const parsed = Number((scoreRaw || '3').trim());
      const score = Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 3;
      return { tag, score };
    })
    .filter((item) => {
      if (!item.tag || seen.has(item.tag)) return false;
      seen.add(item.tag);
      return true;
    });
}

function buildProfileDraft(resumeJson: ResumeJson, tags: CandidateTag[]): ProfileDraft {
  const info = getExtractedInfo(resumeJson);
  const experienceSource = info.experience ?? info.work_experience;
  const projectSource = info.projects ?? info.project_experience;
  return {
    name: textValue(info.name),
    email: textValue(info.email),
    phone: textValue(info.phone),
    intentCity: textValue(info.intent_city),
    summary: textValue(info.summary),
    experienceItems: buildExperienceDraftItems(experienceSource),
    projectItems: buildProjectDraftItems(projectSource),
    additionalInfo: textValue(info.additional_info),
    skillsText: skillsToLines(tags),
  };
}

function StructuredItemsEditor<Item extends StructuredDraftItem>({
  title,
  addLabel,
  items,
  fields,
  emptyHint,
  createItem,
  onChange,
}: {
  title: string;
  addLabel: string;
  items: Item[];
  fields: StructuredDraftField<Item>[];
  emptyHint: string;
  createItem: () => Item;
  onChange: (items: Item[]) => void;
}) {
  const updateItem = (id: string, key: Exclude<keyof Item, 'id'>, value: string) => {
    onChange(
      items.map((item) =>
        item.id === id ? ({ ...item, [key]: value } as Item) : item,
      ),
    );
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{title}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange([...items, createItem()])}
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface-soft/60 px-3 py-4 text-sm text-muted-soft">
          {emptyHint}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-lg border border-hairline bg-canvas px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">
                  {title} {index + 1}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeItem(item.id)}
                  aria-label={`删除${title}${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {fields.map((field) => {
                  const value = item[field.key];
                  return (
                    <div key={String(field.key)} className={field.className}>
                      {field.multiline ? (
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-ink">
                            {field.label}
                          </span>
                          <textarea
                            className="min-h-[96px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
                            placeholder={field.placeholder}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(event) => updateItem(item.id, field.key, event.target.value)}
                          />
                        </label>
                      ) : (
                        <Input
                          label={field.label}
                          placeholder={field.placeholder}
                          value={typeof value === 'string' ? value : ''}
                          onChange={(event) => updateItem(item.id, field.key, event.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileEditForm({
  draft,
  onChange,
}: {
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
}) {
  const patch = <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };

  const experienceFields: StructuredDraftField<ExperienceDraftItem>[] = [
    { key: 'company', label: '公司', placeholder: '例如：某 AI 公司' },
    { key: 'position', label: '职位', placeholder: '例如：算法工程师' },
    { key: 'duration', label: '时间', placeholder: '例如：2022-2025' },
    {
      key: 'description',
      label: '经历描述',
      placeholder: '补充这段工作里做了什么、结果如何',
      multiline: true,
      className: 'sm:col-span-3',
    },
  ];

  const projectFields: StructuredDraftField<ProjectDraftItem>[] = [
    { key: 'name', label: '项目名', placeholder: '例如：智能招聘助手' },
    { key: 'role', label: '角色', placeholder: '例如：项目负责人' },
    { key: 'duration', label: '时间', placeholder: '例如：2024.03-2024.12' },
    {
      key: 'description',
      label: '项目描述',
      placeholder: '补充项目目标、职责和结果',
      multiline: true,
      className: 'sm:col-span-3',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="姓名" value={draft.name} onChange={(event) => patch('name', event.target.value)} />
        <Input label="邮箱" value={draft.email} onChange={(event) => patch('email', event.target.value)} />
        <Input label="电话" value={draft.phone} onChange={(event) => patch('phone', event.target.value)} />
        <Input
          label="意向城市"
          value={draft.intentCity}
          onChange={(event) => patch('intentCity', event.target.value)}
          placeholder="例如：上海"
        />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">个人简介</span>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
          value={draft.summary}
          onChange={(event) => patch('summary', event.target.value)}
        />
      </label>
      <StructuredItemsEditor
        title="工作经历"
        addLabel="新增工作经历"
        items={draft.experienceItems}
        fields={experienceFields}
        emptyHint="还没有补充工作经历，点击右上角可以新增一条。"
        createItem={() => createExperienceDraftItem()}
        onChange={(items) => patch('experienceItems', items)}
      />
      <StructuredItemsEditor
        title="项目经历"
        addLabel="新增项目经历"
        items={draft.projectItems}
        fields={projectFields}
        emptyHint="还没有补充项目经历，点击右上角可以新增一条。"
        createItem={() => createProjectDraftItem()}
        onChange={(items) => patch('projectItems', items)}
      />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">其他备注</span>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
          value={draft.additionalInfo}
          onChange={(event) => patch('additionalInfo', event.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">技能标签</span>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
          placeholder="每行一个：Python:5"
          value={draft.skillsText}
          onChange={(event) => patch('skillsText', event.target.value)}
        />
      </label>
    </div>
  );
}

function rematchToastMessage(jobs: { id: number; title: string }[]): string {
  if (jobs.length === 0) return '候选人档案已保存';
  if (jobs.length === 1) {
    return `候选人档案已保存，已同步刷新「${jobs[0].title}」的匹配结果`;
  }
  return `候选人档案已保存，已同步刷新 ${jobs.length} 个岗位的匹配结果`;
}

function SourceInfoCard({ source }: { source: CandidateSourceInfo | null | undefined }) {
  if (!source) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>来源信息</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-muted-soft">暂无来源记录</p>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>来源信息</CardTitle>
      </CardHeader>
      <CardBody>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted">来源渠道</dt>
            <dd className="font-medium text-ink">{source.channel || '未填写'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">目标岗位</dt>
            <dd className="text-body">{source.target_job_title || '未关联'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">岗位带出城市/部门</dt>
            <dd className="text-body">
              {source.target_job_city || '未设置'} / {source.target_job_department || '未设置'}
            </dd>
          </div>
          {source.referrer && (
            <div>
              <dt className="text-xs text-muted">推荐人</dt>
              <dd className="text-body">{source.referrer}</dd>
            </div>
          )}
          {source.note && (
            <div>
              <dt className="text-xs text-muted">备注</dt>
              <dd className="text-body">{source.note}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">上传批次</dt>
            <dd className="text-body">#{source.batch_id}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

function pipelineTimestamp(pipeline: CandidatePipelineItem): number {
  if (!pipeline.updated_at) return 0;
  const ts = new Date(pipeline.updated_at).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function sortPipelinesByRecent(pipelines: CandidatePipelineItem[]): CandidatePipelineItem[] {
  return [...pipelines].sort((a, b) => pipelineTimestamp(b) - pipelineTimestamp(a));
}

function CandidatePipelineSelector({
  pipelines,
  selectedDemandId,
  loading,
  error,
  onSelectDemand,
  onRetry,
}: {
  pipelines: CandidatePipelineItem[];
  selectedDemandId: number | null;
  loading: boolean;
  error: Error | null;
  onSelectDemand: (demandId: number) => void;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>招聘进展</CardTitle>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Spinner size="sm" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={onRetry} />
        ) : pipelines.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-soft">该候选人尚未进入任何招聘需求。</p>
            <Link
              to="/candidates"
              className="inline-flex text-sm font-semibold text-ink hover:underline"
            >
              回到简历库加入流程
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {sortPipelinesByRecent(pipelines).map((pipeline) => {
              const selected = selectedDemandId === pipeline.demand_id;
              return (
                <button
                  key={pipeline.demand_id}
                  type="button"
                  onClick={() => onSelectDemand(pipeline.demand_id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-ink bg-surface-soft'
                      : 'border-hairline bg-canvas hover:bg-surface-soft'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {pipeline.job_title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-soft">
                        {[pipeline.department, pipeline.city, stageAgeLabel(pipeline.updated_at)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Badge tone={selected ? 'brand' : 'neutral'} className="shrink-0">
                      {stageLabel(pipeline.stage)}
                    </Badge>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function CandidatePipelineActionPanel({
  candidateId,
  candidateName,
  pipeline,
  pipelines,
  loading,
  error,
  selectedDemandId,
  canMove,
  canReassign,
  currentOwnerId,
  onSelectDemand,
  onReload,
  onCandidateReload,
}: {
  candidateId: number;
  candidateName: string;
  pipeline: CandidatePipelineItem | null;
  pipelines: CandidatePipelineItem[];
  loading: boolean;
  error: Error | null;
  selectedDemandId: number | null;
  canMove: boolean;
  canReassign: boolean;
  currentOwnerId?: number;
  onSelectDemand: (demandId: number) => void;
  onReload: () => void;
  onCandidateReload: () => void;
}) {
  const toast = useToast();
  const [moving, setMoving] = useState(false);
  const [moveNote, setMoveNote] = useState('');
  const [showDisposition, setShowDisposition] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [targetStage, setTargetStage] = useState<PipelineStage | ''>('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  useEffect(() => {
    setMoveNote('');
    setShowDisposition(false);
    setShowOffer(false);
    setShowCorrection(false);
    setTargetStage('');
    setCorrectionReason('');
    setCorrectionError(null);
  }, [candidateId, pipeline?.demand_id, pipeline?.stage]);

  async function movePipeline(
    toStage: PipelineStage,
    note?: string,
    disposition?: CandidateDispositionInput,
  ) {
    if (!pipeline) return;
    setMoving(true);
    try {
      await api.movePipeline({
        candidate_id: candidateId,
        demand_id: pipeline.demand_id,
        stage: toStage,
        note,
        disposition,
      });
      toast.success(`${candidateName || '候选人'} 已更新至「${stageLabel(toStage)}」`);
      setMoveNote('');
      setShowDisposition(false);
      setShowCorrection(false);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '流程更新失败');
    } finally {
      setMoving(false);
    }
  }

  async function correctStage() {
    if (!targetStage || !pipeline) return;
    const reason = correctionReason.trim();
    if (!reason) {
      setCorrectionError('请填写修正原因');
      return;
    }
    const message = '修正会影响当前阶段和 BI 当前存量，历史记录会保留。确认继续？';
    if (!window.confirm(message)) return;
    setCorrectionError(null);
    await movePipeline(targetStage, `阶段修正：${reason}`);
    setTargetStage('');
    setCorrectionReason('');
  }

  const nextStage = pipeline ? NEXT_STAGE[pipeline.stage] : undefined;
  const terminal = pipeline ? isTerminalStage(pipeline.stage) : false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>动作</CardTitle>
            <p className="mt-1 text-xs text-muted-soft">对当前招聘需求生效</p>
          </div>
          {moving && <Spinner size="sm" />}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {loading ? (
          <Spinner size="sm" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={onReload} />
        ) : !pipeline ? (
          <div className="space-y-2 rounded-md border border-hairline bg-surface-soft px-3 py-3">
            <p className="text-sm font-semibold text-ink">暂无可推进流程</p>
            <p className="text-sm leading-6 text-muted">
              该候选人还没有进入招聘需求，先回到简历库选择具体需求后加入。
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-md border border-hairline bg-surface-soft px-3 py-3">
              <p className="text-xs font-semibold text-muted">当前操作需求</p>
              <div className="mt-2 flex items-start gap-2">
                <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{pipeline.job_title}</p>
                  <p className="mt-1 text-xs text-muted-soft">
                    {[pipeline.department, pipeline.city, stageLabel(pipeline.stage), stageAgeLabel(pipeline.updated_at)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              {pipelines.length > 1 && (
                <select
                  value={selectedDemandId ?? ''}
                  onChange={(event) => onSelectDemand(Number(event.target.value))}
                  className="mt-3 h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                  aria-label="切换当前操作需求"
                >
                  {sortPipelinesByRecent(pipelines).map((item) => (
                    <option key={item.demand_id} value={item.demand_id}>
                      {[item.job_title, item.department, item.city, stageLabel(item.stage)].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!canMove && (
              <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2 text-sm text-muted">
                当前角色只能查看候选人材料和面试相关入口，不能推进主流程。
              </div>
            )}

            {canMove && !terminal && (
              <section className="space-y-2">
                <label htmlFor="candidate-profile-move-note" className="text-xs font-semibold text-muted">
                  推进备注（可选）
                </label>
                <textarea
                  id="candidate-profile-move-note"
                  rows={2}
                  maxLength={240}
                  value={moveNote}
                  onChange={(event) => setMoveNote(event.target.value)}
                  disabled={moving}
                  className="w-full resize-none rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-60"
                  placeholder="例如：业务反馈通过，安排面试"
                />
                {nextStage && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => movePipeline(nextStage, moveNote.trim() || undefined)}
                    disabled={moving}
                  >
                    推进到 {stageLabel(nextStage)}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              {isInterviewStage(pipeline.stage) && (
                <Link
                  to={`/interviews?demand=${pipeline.demand_id}&candidate=${candidateId}`}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-hairline bg-canvas px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
                >
                  填写面试反馈
                </Link>
              )}
              {pipeline.stage === 'offer' && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowOffer((value) => !value)}
                  disabled={moving}
                >
                  记录 Offer
                </Button>
              )}
              <Link
                to={`/kanban?demand=${pipeline.demand_id}&candidate=${candidateId}&stage=${pipeline.stage}`}
                className="inline-flex h-8 items-center justify-center rounded-md border border-hairline bg-canvas px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
              >
                查看流程详情
              </Link>
            </div>

            {canMove && !terminal && (
              <div className="border-t border-hairline-soft pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => setShowDisposition((value) => !value)}
                  disabled={moving}
                >
                  {showDisposition ? '收起淘汰' : '淘汰'}
                </Button>
                {showDisposition && (
                  <RejectionDispositionForm
                    busy={moving}
                    onCancel={() => setShowDisposition(false)}
                    onSubmit={(disposition, note) =>
                      movePipeline('rejected', note, disposition)
                    }
                  />
                )}
              </div>
            )}

            {canMove && (
              <section className="border-t border-hairline-soft pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start px-0 text-muted hover:bg-transparent hover:text-ink"
                  onClick={() => setShowCorrection((value) => !value)}
                  aria-expanded={showCorrection}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  更多操作：修正阶段
                </Button>
                {showCorrection && (
                  <div className="mt-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-3">
                    <label htmlFor="candidate-profile-target-stage" className="text-xs font-semibold text-warning-700">
                      修正阶段
                    </label>
                    <p className="mt-1 text-xs leading-5 text-warning-700">
                      用于误推进、误淘汰等补救。修正会影响当前阶段和 BI 当前存量，历史记录会保留。
                    </p>
                    <select
                      id="candidate-profile-target-stage"
                      value={targetStage}
                      onChange={(event) => {
                        setTargetStage(event.target.value as PipelineStage);
                        setCorrectionError(null);
                      }}
                      className="mt-2 h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                    >
                      <option value="">选择阶段</option>
                      {STAGES.map((item) => (
                        <option key={item.key} value={item.key} disabled={item.key === pipeline.stage}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="candidate-profile-correction-reason" className="mb-1 mt-2 block text-xs font-semibold text-warning-700">
                      修正原因（必填）
                    </label>
                    <input
                      id="candidate-profile-correction-reason"
                      value={correctionReason}
                      onChange={(event) => {
                        setCorrectionReason(event.target.value);
                        setCorrectionError(null);
                      }}
                      placeholder="例如：刚才误点，改回待筛选"
                      className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                    />
                    <Button
                      type="button"
                      className="mt-2"
                      size="sm"
                      variant="secondary"
                      disabled={!targetStage || moving}
                      onClick={() => void correctStage()}
                    >
                      保存修正
                    </Button>
                    {correctionError && <p className="mt-2 text-xs text-danger-600">{correctionError}</p>}
                  </div>
                )}
              </section>
            )}

            {pipeline.stage === 'offer' && showOffer && (
              <OfferDrawer candidateId={candidateId} demandId={pipeline.demand_id} jobId={pipeline.job_id} />
            )}
          </>
        )}

        {canReassign && (
          <div className="border-t border-hairline-soft pt-3">
            <ReassignOwner
              candidateId={candidateId}
              currentOwnerId={currentOwnerId}
              onReassigned={onCandidateReload}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ---- 主页面 ----

export function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const candidateId = Number(id);
  const isInvalidId = !id || Number.isNaN(candidateId);
  const { role } = useAuth();
  const canReassign = role === 'manager' || role === 'admin';
  const canEditProfile = role !== 'interviewer';
  const canMovePipeline = role === 'recruiter' || role === 'manager' || role === 'admin';
  const toast = useToast();
  const [retryingParse, setRetryingParse] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [exportingCandidate, setExportingCandidate] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [selectedPipelineDemandId, setSelectedPipelineDemandId] = useState<number | null>(null);
  const [activeResumeTab, setActiveResumeTab] = useState<CandidateResumeTab>('original');
  const [showRecruitmentActions, setShowRecruitmentActions] = useState(false);

  // useAsync 无条件调用，fetch 函数在 id 无效时短路，不发送请求
  const { data, loading, error, reload } = useAsync(
    () =>
      isInvalidId
        ? Promise.reject(new Error('invalid id'))
        : api.getCandidate(candidateId),
    [candidateId, isInvalidId]
  );

  const pipelineAsync = useAsync(
    () =>
      isInvalidId
        ? Promise.reject(new Error('invalid id'))
        : api.getCandidatePipelines(candidateId),
    [candidateId, isInvalidId],
  );

  const pipelines = useMemo(
    () => pipelineAsync.data?.pipelines ?? [],
    [pipelineAsync.data],
  );

  useEffect(() => {
    if (pipelines.length === 0) {
      setSelectedPipelineDemandId(null);
      return;
    }
    if (
      selectedPipelineDemandId === null ||
      !pipelines.some((pipeline) => pipeline.demand_id === selectedPipelineDemandId)
    ) {
      setSelectedPipelineDemandId(sortPipelinesByRecent(pipelines)[0].demand_id);
    }
  }, [pipelines, selectedPipelineDemandId]);

  const selectedPipeline = useMemo(
    () =>
      pipelines.find((pipeline) => pipeline.demand_id === selectedPipelineDemandId) ??
      sortPipelinesByRecent(pipelines)[0] ??
      null,
    [pipelines, selectedPipelineDemandId],
  );

  const handleRetryParse = async () => {
    if (!data || data.parse_status !== 'failed') return;
    setRetryingParse(true);
    try {
      await api.retryCandidateParse(candidateId);
      toast.success('简历已重新解析');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新解析失败');
    } finally {
      setRetryingParse(false);
    }
  };

  const handleStartEditProfile = () => {
    if (!data) return;
    setProfileDraft(buildProfileDraft(data.resume_json, data.tags));
    setEditingProfile(true);
    setActiveResumeTab('structured');
  };

  const handleCancelEditProfile = () => {
    setEditingProfile(false);
    setProfileDraft(null);
  };

  const handleSaveProfile = async () => {
    if (!profileDraft) return;
    setSavingProfile(true);
    try {
      const saved = await api.updateCandidateProfile(candidateId, {
        profile: {
          name: profileDraft.name,
          email: profileDraft.email,
          phone: profileDraft.phone,
          intent_city: profileDraft.intentCity,
          summary: profileDraft.summary,
          experience: experienceItemsToPayload(profileDraft.experienceItems),
          projects: projectItemsToPayload(profileDraft.projectItems),
          additional_info: profileDraft.additionalInfo,
        },
        skills: linesToSkills(profileDraft.skillsText),
      });
      toast.success(rematchToastMessage(saved.rematched_jobs ?? []));
      setEditingProfile(false);
      setProfileDraft(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存候选人档案失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportCandidate = async () => {
    setExportingCandidate(true);
    try {
      const blob = await api.exportCandidate(candidateId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `candidate-${candidateId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('候选人简历已导出');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出候选人简历失败');
    } finally {
      setExportingCandidate(false);
    }
  };

  // 所有 hook 调用完毕后再做早返回
  if (isInvalidId) {
    return (
      <div>
        <Link
          to="/candidates"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← 候选人列表
        </Link>
        <div className="mt-4">
          <ErrorState message="无效的候选人 ID" />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link
          to="/candidates"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← 候选人列表
        </Link>
        <div className="mt-4">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { name_masked, resume_json, tags, created_at, source, parse_status, parse_error } = data;
  const hasTags = tags && tags.length > 0;
  const coreTags = hasTags ? getCoreSkillTags(tags) : [];
  const hiddenSkillCount = hasTags ? Math.max(tags.length - coreTags.length, 0) : 0;
  const parseFailed = parse_status === 'failed';
  const originalResume: OriginalResumeInfo = data.original_resume ?? {
    available: false,
    filename: null,
    mime_type: null,
    preview_url: `${API_BASE}/resume/${candidateId}/original/preview`,
    download_url: `${API_BASE}/resume/${candidateId}/original/download`,
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <nav aria-label="面包屑" className="mb-4">
        <Link
          to="/candidates"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          候选人
        </Link>
        <span className="mx-1.5 text-sm text-muted-soft">/</span>
        <span className="text-sm text-ink">{name_masked}</span>
      </nav>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-display text-ink">
            {name_masked}
          </h1>
          <p className="mt-1 text-sm text-muted">
            录入时间：{formatDate(created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasTags && (
            <Badge tone="neutral">核心 {coreTags.length} / 共 {tags.length} 个技能</Badge>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={showRecruitmentActions}
            aria-controls="candidate-recruitment-actions"
            onClick={() => setShowRecruitmentActions((value) => !value)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {showRecruitmentActions ? '收起招聘操作' : '招聘操作'}
          </Button>
        </div>
      </div>

      {showRecruitmentActions && (
        <div id="candidate-recruitment-actions">
          <Reveal
            as="section"
            className="mb-5 grid gap-5 rounded-xl border border-hairline bg-surface-soft/50 p-4 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]"
            y={8}
          >
            <CandidatePipelineSelector
              pipelines={pipelines}
              selectedDemandId={selectedPipeline?.demand_id ?? selectedPipelineDemandId}
              loading={pipelineAsync.loading}
              error={pipelineAsync.error}
              onSelectDemand={setSelectedPipelineDemandId}
              onRetry={pipelineAsync.reload}
            />
            <CandidatePipelineActionPanel
              candidateId={candidateId}
              candidateName={name_masked}
              pipeline={selectedPipeline}
              pipelines={pipelines}
              selectedDemandId={selectedPipeline?.demand_id ?? selectedPipelineDemandId}
              loading={pipelineAsync.loading}
              error={pipelineAsync.error}
              canMove={canMovePipeline}
              canReassign={canReassign && pipelines.length === 0}
              currentOwnerId={data.owner_hr_id}
              onSelectDemand={setSelectedPipelineDemandId}
              onReload={pipelineAsync.reload}
              onCandidateReload={reload}
            />
          </Reveal>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-hairline bg-canvas p-1 shadow-card">
        <div role="tablist" aria-label="候选人简历视图" className="grid w-full grid-cols-3 gap-1">
          {CANDIDATE_RESUME_TABS.map((tab) => {
            const active = activeResumeTab === tab.key;
            return (
              <button
                key={tab.key}
                id={`candidate-resume-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`candidate-resume-panel-${tab.key}`}
                onClick={() => setActiveResumeTab(tab.key)}
                className={`min-w-0 rounded-lg px-2 py-3 text-left transition-colors sm:px-4 ${
                  active ? 'bg-ink text-white shadow-apple-sm' : 'text-muted hover:bg-surface-soft hover:text-ink'
                }`}
              >
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className={`mt-0.5 hidden text-xs sm:block ${active ? 'text-white/60' : 'text-muted-soft'}`}>
                  {tab.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Reveal as="main" className="min-w-0" y={10}>
        {activeResumeTab === 'original' && (
          <div
            id="candidate-resume-panel-original"
            role="tabpanel"
            aria-labelledby="candidate-resume-tab-original"
          >
            <OriginalResumeViewer
              candidateId={candidateId}
              info={originalResume}
              parseFailed={parseFailed}
            />
          </div>
        )}

        {activeResumeTab === 'structured' && (
          <div
            id="candidate-resume-panel-structured"
            role="tabpanel"
            aria-labelledby="candidate-resume-tab-structured"
          >
            <div id={RESUME_TOP_ID}>
              <StructuredResumeView
                parseFailed={parseFailed}
                parseError={parse_error}
                retryingParse={retryingParse}
                editing={editingProfile}
                saving={savingProfile}
                canEdit={canEditProfile}
                exporting={exportingCandidate}
                retryLabel="重新解析"
                editLabel="编辑档案"
                exportLabel="导出简历"
                onRetryParse={() => void handleRetryParse()}
                onStartEdit={handleStartEditProfile}
                onCancelEdit={handleCancelEditProfile}
                onSave={() => void handleSaveProfile()}
                onExport={() => void handleExportCandidate()}
                outline={<ResumeOutlineNav resumeJson={resume_json} />}
              >
                {editingProfile && profileDraft ? (
                  <ProfileEditForm draft={profileDraft} onChange={setProfileDraft} />
                ) : resume_json && Object.keys(resume_json).length > 0 ? (
                  <ResumeJsonView resumeJson={resume_json} />
                ) : (
                  <p className="text-sm text-muted-soft">暂无简历结构化内容</p>
                )}
              </StructuredResumeView>
            </div>
          </div>
        )}

        {activeResumeTab === 'match' && (
          <div
            id="candidate-resume-panel-match"
            role="tabpanel"
            aria-labelledby="candidate-resume-tab-match"
          >
            <CandidateMatchAnalysis
              candidateId={candidateId}
              jobId={selectedPipeline?.job_id ?? null}
              jobTitle={selectedPipeline?.job_title}
            >
              <CandidateEvidenceCard
                resumeJson={resume_json}
                source={source}
                tags={tags}
                coreTags={coreTags}
                hiddenSkillCount={hiddenSkillCount}
              />
              <SourceInfoCard source={source} />
            </CandidateMatchAnalysis>
          </div>
        )}
      </Reveal>
    </div>
  );
}
