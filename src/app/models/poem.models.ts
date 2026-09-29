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
  schemaVersion: number;
  title: string;
  author: string;
  templateId: string;
  baselineVersionId: string;
  versions: PoemVersion[];
  activeVersionId: string;
  updatedAt: string;
}

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

/** 对齐流中的一个字符单元：equal 为两边相同字，delete 仅底本有（缺字），insert 仅当前稿有（增字） */
export interface DiffToken {
  type: 'equal' | 'delete' | 'insert';
  oldChar: string;
  newChar: string;
  /** 底本中的行号（不计标点的行内位置），标点或换行时为 null */
  oldLine: number | null;
  oldPosition: number | null;
  /** 当前稿中的行号与行内位置，标点或换行时为 null */
  newLine: number | null;
  newPosition: number | null;
}

export type DiffSegmentKind = 'replace' | 'delete' | 'insert' | 'mixed';

export interface DiffSegmentNote {
  side: 'left' | 'right';
  versionName: string;
  char: string;
  text: string;
}

/** 连续变化字合并成的异文段 */
export interface DiffSegment {
  id: number;
  kind: DiffSegmentKind;
  /** 底本侧用字（缺字段为 ''） */
  left: string;
  /** 当前稿侧用字（增字段为 ''） */
  right: string;
  /** 段前、段后的相同字上下文（含换行以 ／ 表示） */
  contextBefore: string;
  contextAfter: string;
  /** 段内各字在两个版本中携带的批注与依据 */
  notes: DiffSegmentNote[];
  /** 段落在当前稿中的定位坐标（供“前往标注”），缺字段取后续相同字位置 */
  locateLine: number | null;
  locatePosition: number | null;
}

/** 比较流的渲染块：相同字串或一个异文段 */
export type CompareBlock =
  | { type: 'equal'; text: string }
  | { type: 'segment'; segment: DiffSegment; segmentIndex: number };
