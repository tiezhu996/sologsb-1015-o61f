export type Tone = '平' | '仄' | '中' | '?';
export type MarkTone = '平' | '仄' | '中';

export interface CharacterMark {
  tone: MarkTone | '?';
  rhyme: string;
  pauseAfter: boolean;
  basis: string;
  note: string;
}

export interface PoemVersion {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  text: string;
  marks: Record<string, CharacterMark>;
  antithesisPairs: AntithesisPair[];
}

export interface AntithesisPair {
  id: string;
  leftLine: number;
  rightLine: number;
  note: string;
}

export interface PoemWorkspace {
  title: string;
  author: string;
  templateId: string;
  versions: PoemVersion[];
  activeVersionId: string;
  updatedAt: string;
  /** 本地记录结构版本；旧记录（无此字段）载入时自动迁移到当前版本 */
  schemaVersion?: number;
}

export const WORKSPACE_SCHEMA_VERSION = 2;

export interface MeterTemplate {
  id: string;
  name: string;
  summary: string;
  lineCount: number;
  lineLength: number;
  pattern: Tone[];
  rhymeLines: number[];
}

export interface AnalysisCell {
  char: string;
  position: number;
  expected: Tone;
  actual: Tone;
  status: 'correct' | 'variant' | 'error' | 'unknown' | 'neutral';
  message: string;
  mark: CharacterMark;
}

export interface AnalysisLine {
  index: number;
  cells: AnalysisCell[];
  rhymeChars: string[];
  errors: number;
  variants: number;
}

export interface PoemIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  line?: number;
  position?: number;
}

/** 对齐后的最小单位：一个诗句正字（标点不参与对齐） */
export type DiffOp = 'equal' | 'replace' | 'insert' | 'delete';

export interface DiffUnit {
  /** 段内稳定序号 */
  seq: number;
  op: DiffOp;
  /** 底本用字，缺字为空 */
  left: string;
  /** 当前稿用字，增字为空 */
  right: string;
  /** 底本中的句、字序号（不计标点） */
  leftLine?: number;
  leftPos?: number;
  /** 当前稿中的句、字序号（不计标点） */
  rightLine?: number;
  rightPos?: number;
}

/** 一句对齐结果 */
export interface DiffRow {
  /** 对齐序号（含仅一侧存在的整句） */
  index: number;
  /** 底本句序，缺句为空 */
  leftLine?: number;
  /** 当前稿句序，缺句为空 */
  rightLine?: number;
  leftText: string;
  rightText: string;
  units: DiffUnit[];
  changed: boolean;
}

/** 连续变化合并而成的异文段，可逐段跳转 */
export interface DiffSegment {
  id: string;
  kind: '换字' | '增字' | '缺字' | '增缺' | '整句增' | '整句缺';
  /** 底本侧句序，缺段为空 */
  leftLine?: number;
  /** 当前稿侧句序，增段为空 */
  rightLine?: number;
  /** 段内各字，用于并排显示 */
  leftText: string;
  rightText: string;
  units: DiffUnit[];
}

export interface PoemAlignment {
  rows: DiffRow[];
  segments: DiffSegment[];
}
