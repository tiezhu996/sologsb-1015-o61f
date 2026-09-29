import { computed, Injectable, signal } from '@angular/core';
import type {
  AntithesisPair,
  AnalysisCell,
  AnalysisLine,
  CharacterMark,
  CompareBlock,
  DiffSegment,
  DiffSegmentKind,
  DiffToken,
  MarkTone,
  MeterTemplate,
  PoemIssue,
  PoemVersion,
  PoemWorkspace,
  Tone,
} from '../models/poem.models';

export const METER_TEMPLATES: MeterTemplate[] = [
  {
    id: 'wuyan-zeqi',
    name: '五言绝句 · 仄起首句不入韵',
    summary: '四句，每句五字；二、四句押韵',
    lineCount: 4,
    lineLength: 5,
    pattern: ['仄', '仄', '中', '平', '仄', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中', '仄', '中', '平'],
    rhymeLines: [1, 3],
  },
  {
    id: 'wuyan-pingqi',
    name: '五言绝句 · 平起首句入韵',
    summary: '四句，每句五字；一、二、四句押韵',
    lineCount: 4,
    lineLength: 5,
    pattern: ['中', '平', '中', '仄', '平', '仄', '仄', '中', '平', '仄', '中', '平', '中', '仄', '仄', '中', '平', '仄', '中', '平'],
    rhymeLines: [0, 1, 3],
  },
  {
    id: 'qiyan-zeqi',
    name: '七言绝句 · 仄起首句入韵',
    summary: '四句，每句七字；一、二、四句押韵',
    lineCount: 4,
    lineLength: 7,
    pattern: ['仄', '仄', '中', '平', '中', '仄', '平', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中'],
    rhymeLines: [0, 1, 3],
  },
  {
    id: 'qiyan-pingqi',
    name: '七言绝句 · 平起首句不入韵',
    summary: '四句，每句七字；二、四句押韵',
    lineCount: 4,
    lineLength: 7,
    pattern: ['中', '平', '中', '仄', '仄', '中', '平', '仄', '仄', '中', '平', '平', '仄', '仄', '中', '平', '中', '仄', '中', '平', '仄', '仄', '中', '平', '中', '仄', '仄', '中', '平'],
    rhymeLines: [1, 3],
  },
];

const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';
const SCHEMA_VERSION = 2;
const PUNCTUATION = new Set(['，', '。', '！', '？', '；', '：', '、', ' ', '\t']);
const TONE_DICTIONARY: Record<string, Tone> = {
  春: '平', 眠: '平', 不: '仄', 觉: '仄', 晓: '仄', 处: '仄', 闻: '平', 啼: '平', 鸟: '仄',
  夜: '仄', 来: '平', 风: '平', 雨: '仄', 声: '平', 花: '平', 落: '仄', 知: '平', 多: '平', 少: '仄',
  国: '仄', 破: '仄', 山: '平', 河: '平', 在: '仄', 城: '平', 深: '平', 木: '仄', 草: '仄', 独: '仄',
  明: '平', 月: '仄', 高: '平', 天: '平', 故: '仄', 乡: '平', 万: '仄', 里: '仄', 江: '平', 船: '平',
};

const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function key(line: number, position: number): string {
  return `${line}:${position}`;
}

function defaultMark(): CharacterMark {
  return { tone: '?', rhyme: '', pauseAfter: false, basis: '', note: '' };
}

/** 字符流单元：换行符与标点的 position 为 null，不计入逐字标注坐标 */
export interface StreamToken {
  ch: string;
  line: number;
  position: number | null;
}

export function buildStream(text: string): StreamToken[] {
  const tokens: StreamToken[] = [];
  let line = 0;
  let position = 0;
  for (const ch of Array.from(text)) {
    if (ch === '\n') {
      tokens.push({ ch, line, position: null });
      line += 1;
      position = 0;
    } else if (PUNCTUATION.has(ch)) {
      tokens.push({ ch, line, position: null });
    } else {
      tokens.push({ ch, line, position });
      position += 1;
    }
  }
  return tokens;
}

/** 以字符为单位做 LCS 对齐：相同字锚定，增、删各自成行，增删字不再连带整段错位 */
export function alignStreams(oldTokens: StreamToken[], newTokens: StreamToken[]): DiffToken[] {
  const n = oldTokens.length;
  const m = newTokens.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = oldTokens[i].ch === newTokens[j].ch
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i].ch === newTokens[j].ch) {
      const o = oldTokens[i];
      const w = newTokens[j];
      result.push({
        type: 'equal',
        oldChar: o.ch,
        newChar: w.ch,
        oldLine: o.line,
        oldPosition: o.position,
        newLine: w.line,
        newPosition: w.position,
      });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      const o = oldTokens[i];
      result.push({ type: 'delete', oldChar: o.ch, newChar: '', oldLine: o.line, oldPosition: o.position, newLine: null, newPosition: null });
      i += 1;
    } else {
      const w = newTokens[j];
      result.push({ type: 'insert', oldChar: '', newChar: w.ch, oldLine: null, oldPosition: null, newLine: w.line, newPosition: w.position });
      j += 1;
    }
  }
  while (i < n) {
    const o = oldTokens[i];
    result.push({ type: 'delete', oldChar: o.ch, newChar: '', oldLine: o.line, oldPosition: o.position, newLine: null, newPosition: null });
    i += 1;
  }
  while (j < m) {
    const w = newTokens[j];
    result.push({ type: 'insert', oldChar: '', newChar: w.ch, oldLine: null, oldPosition: null, newLine: w.line, newPosition: w.position });
    j += 1;
  }
  return result;
}

/**
 * 文本增删后，把逐字标注（平仄、韵组、依据、批注）按相同字迁移到新文本，
 * 对仗关系按行映射迁移；被整段删除的行，其标注与关系不再保留，避免无依据串位。
 */
export function migrateAnnotations(
  oldText: string,
  newText: string,
  oldMarks: Record<string, CharacterMark>,
  oldPairs: AntithesisPair[],
): { marks: Record<string, CharacterMark>; pairs: AntithesisPair[] } {
  const alignment = alignStreams(buildStream(oldText), buildStream(newText));
  const newMarks: Record<string, CharacterMark> = {};
  const oldLineToNew = new Map<number, number>();
  for (const token of alignment) {
    if (token.type !== 'equal') continue;
    if (token.oldPosition !== null && token.newPosition !== null) {
      const mark = oldMarks[key(token.oldLine as number, token.oldPosition)];
      if (mark) newMarks[key(token.newLine as number, token.newPosition)] = clone(mark);
    }
    if (token.oldLine !== null && token.newLine !== null && !oldLineToNew.has(token.oldLine)) {
      oldLineToNew.set(token.oldLine, token.newLine);
    }
  }
  const pairs: AntithesisPair[] = [];
  const seen = new Set<string>();
  for (const pair of oldPairs) {
    const leftLine = oldLineToNew.get(pair.leftLine);
    const rightLine = oldLineToNew.get(pair.rightLine);
    if (leftLine === undefined || rightLine === undefined || leftLine === rightLine) continue;
    const a = Math.min(leftLine, rightLine);
    const b = Math.max(leftLine, rightLine);
    const signature = `${a}:${b}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    pairs.push({ ...clone(pair), leftLine: a, rightLine: b });
  }
  return { marks: newMarks, pairs };
}

function collectNotes(
  run: DiffToken[],
  leftVersion: PoemVersion | undefined,
  rightVersion: PoemVersion | undefined,
): DiffSegment['notes'] {
  const notes: DiffSegment['notes'] = [];
  const push = (
    side: 'left' | 'right',
    version: PoemVersion | undefined,
    line: number | null,
    position: number | null,
    char: string,
  ): void => {
    if (!version || line === null || position === null) return;
    const mark = version.marks[key(line, position)];
    if (!mark) return;
    const text = [mark.note, mark.basis].filter((value) => value.trim()).join('；');
    if (!text) return;
    notes.push({ side, versionName: version.name, char, text });
  };
  for (const token of run) {
    if (token.type === 'delete') push('left', leftVersion, token.oldLine, token.oldPosition, token.oldChar);
    if (token.type === 'insert') push('right', rightVersion, token.newLine, token.newPosition, token.newChar);
  }
  return notes;
}

/** 把连续的增删 token 合并成异文段，段内附两边用字、上下文与批注 */
export function buildSegments(
  tokens: DiffToken[],
  leftVersion: PoemVersion | undefined,
  rightVersion: PoemVersion | undefined,
): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let id = 0;
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].type === 'equal') {
      i += 1;
      continue;
    }
    const start = i;
    while (i < tokens.length && tokens[i].type !== 'equal') i += 1;
    const run = tokens.slice(start, i);
    const deletes = run.filter((token) => token.type === 'delete');
    const inserts = run.filter((token) => token.type === 'insert');
    const hasDelete = deletes.length > 0;
    const hasInsert = inserts.length > 0;
    const kind: DiffSegmentKind = hasDelete && hasInsert
      ? (deletes.length === inserts.length ? 'replace' : 'mixed')
      : hasDelete ? 'delete' : 'insert';
    const contextBefore = tokens
      .slice(Math.max(0, start - 2), start)
      .filter((token) => token.type === 'equal')
      .map((token) => token.oldChar)
      .join('');
    const contextAfter = tokens
      .slice(i, Math.min(tokens.length, i + 2))
      .filter((token) => token.type === 'equal')
      .map((token) => token.oldChar)
      .join('');
    let locateLine: number | null = null;
    let locatePosition: number | null = null;
    const firstInsert = inserts[0];
    if (firstInsert) {
      locateLine = firstInsert.newLine;
      locatePosition = firstInsert.newPosition;
    } else {
      const after = tokens[i];
      const before = tokens[start - 1];
      const anchor = after?.type === 'equal' ? after : before?.type === 'equal' ? before : null;
      if (anchor) {
        locateLine = anchor.newLine;
        locatePosition = anchor.newPosition;
      }
    }
    segments.push({
      id: id++,
      kind,
      left: deletes.map((token) => token.oldChar).join(''),
      right: inserts.map((token) => token.newChar).join(''),
      contextBefore,
      contextAfter,
      notes: collectNotes(run, leftVersion, rightVersion),
      locateLine,
      locatePosition,
    });
  }
  return segments;
}

function buildCompareBlocks(tokens: DiffToken[], segments: DiffSegment[]): CompareBlock[] {
  const blocks: CompareBlock[] = [];
  let i = 0;
  let segmentIndex = 0;
  while (i < tokens.length) {
    if (tokens[i].type === 'equal') {
      let text = '';
      while (i < tokens.length && tokens[i].type === 'equal') {
        text += tokens[i].oldChar;
        i += 1;
      }
      blocks.push({ type: 'equal', text });
    } else {
      blocks.push({ type: 'segment', segment: segments[segmentIndex], segmentIndex });
      while (i < tokens.length && tokens[i].type !== 'equal') i += 1;
      segmentIndex += 1;
    }
  }
  return blocks;
}

export function segmentKindLabel(kind: DiffSegmentKind): string {
  switch (kind) {
    case 'replace': return '换字';
    case 'delete': return '缺字';
    case 'insert': return '增字';
    case 'mixed': return '混排';
  }
}

export function formatContext(text: string): string {
  return text.replace(/\n/g, '／');
}

function initialWorkspace(): PoemWorkspace {
  const now = new Date().toISOString();
  const spring = '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。';
  const marks: Record<string, CharacterMark> = {};
  const cells = [
    ['晓', 0, '平', false], ['鸟', 1, '平', false], ['声', 2, '平', false], ['少', 3, '平', false],
  ] as const;
  cells.forEach(([char, line, tone, pause]) => {
    marks[key(line, 4)] = { tone, rhyme: 'A', pauseAfter: pause, basis: '《平水韵》上声十七筱', note: `${char} 为韵脚` };
  });
  marks[key(0, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '句中平声' };
  marks[key(1, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '' };
  marks[key(2, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '' };

  const topVersion: PoemVersion = {
    id: 'version-main',
    name: '通行本 · 孟浩然集',
    source: '《孟浩然诗集笺注》',
    createdAt: now,
    text: spring,
    marks,
    antithesisPairs: [],
  };
  const variant: PoemVersion = {
    id: 'version-song',
    name: '宋刻本异文',
    source: '宋蜀刻本',
    createdAt: now,
    text: '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。',
    marks: clone(marks),
    antithesisPairs: [],
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    title: '春晓',
    author: '孟浩然',
    templateId: 'wuyan-zeqi',
    baselineVersionId: '',
    versions: [topVersion, variant],
    activeVersionId: topVersion.id,
    updatedAt: now,
  };
}

function normalizeMark(value: Record<string, unknown>): CharacterMark {
  const tone = value['tone'] === '平' || value['tone'] === '仄' || value['tone'] === '中' || value['tone'] === '?'
    ? value['tone'] as CharacterMark['tone']
    : '?';
  return {
    tone,
    rhyme: typeof value['rhyme'] === 'string' ? value['rhyme'] : '',
    pauseAfter: value['pauseAfter'] === true,
    basis: typeof value['basis'] === 'string' ? value['basis'] : '',
    note: typeof value['note'] === 'string' ? value['note'] : '',
  };
}

function migrateVersion(raw: unknown, index: number): PoemVersion {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const marks: Record<string, CharacterMark> = {};
  if (data['marks'] && typeof data['marks'] === 'object') {
    for (const [markKey, value] of Object.entries(data['marks'] as Record<string, unknown>)) {
      if (value && typeof value === 'object') marks[markKey] = normalizeMark(value as Record<string, unknown>);
    }
  }
  const antithesisPairs: AntithesisPair[] = [];
  if (Array.isArray(data['antithesisPairs'])) {
    for (const value of data['antithesisPairs'] as unknown[]) {
      if (value && typeof value === 'object') {
        const pair = value as Record<string, unknown>;
        if (typeof pair['leftLine'] === 'number' && typeof pair['rightLine'] === 'number') {
          antithesisPairs.push({
            id: typeof pair['id'] === 'string' ? pair['id'] as string : uid('pair'),
            leftLine: pair['leftLine'] as number,
            rightLine: pair['rightLine'] as number,
            note: typeof pair['note'] === 'string' ? pair['note'] : '',
          });
        }
      }
    }
  }
  return {
    id: typeof data['id'] === 'string' ? data['id'] as string : uid('version'),
    name: typeof data['name'] === 'string' ? data['name'] as string : `版本 ${index + 1}`,
    source: typeof data['source'] === 'string' ? data['source'] as string : '',
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] as string : new Date().toISOString(),
    text: typeof data['text'] === 'string' ? data['text'] as string : '',
    marks,
    antithesisPairs,
  };
}

/** 旧版本记录升级：v1 记录补全字段并规范化标注与关系，升级后回写本地存储 */
export function migrateWorkspace(raw: unknown): PoemWorkspace {
  if (typeof raw !== 'object' || raw === null) return initialWorkspace();
  const data = raw as Record<string, unknown>;
  const versionsRaw = Array.isArray(data['versions']) ? data['versions'] as unknown[] : [];
  const versions = versionsRaw.map((version, index) => migrateVersion(version, index));
  if (!versions.length) return initialWorkspace();
  const activeVersionId = typeof data['activeVersionId'] === 'string'
    && versions.some((version) => version.id === data['activeVersionId'])
    ? data['activeVersionId'] as string
    : versions[0].id;
  const baselineVersionId = typeof data['baselineVersionId'] === 'string'
    && versions.some((version) => version.id === data['baselineVersionId'])
    ? data['baselineVersionId'] as string
    : '';
  return {
    schemaVersion: SCHEMA_VERSION,
    title: typeof data['title'] === 'string' && data['title'] ? data['title'] as string : '未命名',
    author: typeof data['author'] === 'string' ? data['author'] as string : '',
    templateId: typeof data['templateId'] === 'string' ? data['templateId'] as string : 'wuyan-zeqi',
    baselineVersionId,
    versions,
    activeVersionId,
    updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] as string : new Date().toISOString(),
  };
}

function loadWorkspace(): PoemWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWorkspace();
    const parsed: unknown = JSON.parse(raw);
    const workspace = migrateWorkspace(parsed);
    const rawVersion = (parsed as { schemaVersion?: number } | null)?.schemaVersion ?? 0;
    if (rawVersion < SCHEMA_VERSION) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch {
        /* 本地存储不可写时仅保留内存中的升级结果 */
      }
    }
    return workspace;
  } catch {
    return initialWorkspace();
  }
}

@Injectable({ providedIn: 'root' })
export class PoetryStoreService {
  readonly workspace = signal<PoemWorkspace>(loadWorkspace());
  readonly selectedLine = signal(0);
  readonly selectedPosition = signal(4);
  readonly baselineVersionId = signal<string>(this.workspace().baselineVersionId);
  readonly currentDiffIndex = signal(0);
  readonly toast = signal('');
  readonly undoCount = signal(0);
  readonly redoCount = signal(0);

  private undoStack: PoemWorkspace[] = [];
  private redoStack: PoemWorkspace[] = [];

  readonly activeVersion = computed(() => {
    const state = this.workspace();
    return state.versions.find((version) => version.id === state.activeVersionId) ?? state.versions[0];
  });

  readonly template = computed(() => {
    return METER_TEMPLATES.find((item) => item.id === this.workspace().templateId) ?? METER_TEMPLATES[0];
  });

  readonly lines = computed(() => this.activeVersion().text.split('\n'));

  readonly analysis = computed<AnalysisLine[]>(() => {
    const version = this.activeVersion();
    const template = this.template();
    return this.lines().map((line, lineIndex) => {
      const chars = Array.from(line).filter((char) => !PUNCTUATION.has(char));
      const cells: AnalysisCell[] = chars.map((char, position) => {
        const mark = version.marks[key(lineIndex, position)] ?? defaultMark();
        const expected = template.pattern[lineIndex * template.lineLength + position] ?? '中';
        const actual = mark.tone === '?' ? (TONE_DICTIONARY[char] ?? '?') : mark.tone;
        let status: AnalysisCell['status'] = 'neutral';
        let message = '标点或不计律位置';
        if (PUNCTUATION.has(char)) {
          status = 'neutral';
        } else if (actual === '?') {
          status = 'unknown';
          message = '尚未标注平仄';
        } else if (expected === '中') {
          status = 'correct';
          message = '可平可仄';
        } else if (actual === expected) {
          status = 'correct';
          message = '合律';
        } else if (this.isAcceptableVariant(template, lineIndex, position)) {
          status = 'variant';
          message = '一三五位置的可接受变体';
        } else {
          status = 'error';
          message = `此处应为${expected}声`;
        }
        return { char, position, expected, actual, status, message, mark };
      });
      const rhymeChars = template.rhymeLines.includes(lineIndex) ? cells.slice(-1).map((cell) => cell.char) : [];
      return {
        index: lineIndex,
        cells,
        rhymeChars,
        errors: cells.filter((cell) => cell.status === 'error').length,
        variants: cells.filter((cell) => cell.status === 'variant').length,
      };
    });
  });

  readonly issues = computed<PoemIssue[]>(() => {
    const analysis = this.analysis();
    const version = this.activeVersion();
    const template = this.template();
    const issues: PoemIssue[] = [];
    analysis.forEach((line) => {
      line.cells.filter((cell) => cell.status === 'error').forEach((cell) => {
        issues.push({
          id: uid('issue'),
          level: 'error',
          title: '出律位置',
          detail: `第 ${line.index + 1} 句“${cell.char}”：${cell.message}`,
          line: line.index,
          position: cell.position,
        });
      });
      if (line.cells.some((cell) => cell.status === 'unknown')) {
        issues.push({ id: uid('issue'), level: 'warning', title: '存在未标注字', detail: `第 ${line.index + 1} 句仍有平仄未确认。`, line: line.index });
      }
    });
    const rhymeCells = template.rhymeLines.map((line) => analysis[line]?.cells.at(-1)).filter(Boolean);
    const rhymeGroups = new Map<string, string[]>();
    rhymeCells.forEach((cell) => {
      if (!cell?.mark.rhyme) {
        issues.push({ id: uid('issue'), level: 'warning', title: '韵脚缺少韵部', detail: `第 ${(cell?.position ?? 0) + 1} 句末字尚未指定韵部。` });
        return;
      }
      rhymeGroups.set(cell.mark.rhyme, [...(rhymeGroups.get(cell.mark.rhyme) ?? []), cell.char]);
    });
    rhymeGroups.forEach((chars, rhyme) => {
      const duplicate = chars.find((char, index) => chars.indexOf(char) !== index);
      if (duplicate) issues.push({ id: uid('issue'), level: 'warning', title: '重复用韵', detail: `韵部 ${rhyme} 重复使用末字“${duplicate}”。` });
    });
    if (version.antithesisPairs.length === 0) {
      issues.push({ id: 'antithesis-empty', level: 'info', title: '尚未标记对仗', detail: '可在检视器中把两句建立对仗关系。' });
    }
    if (!issues.some((issue) => issue.level === 'error')) {
      issues.unshift({ id: 'meter-ok', level: 'info', title: '格律检查通过', detail: '当前未发现硬性出律，请继续核对可接受变体。' });
    }
    return issues;
  });

  /** 底本与当前稿的字符级对齐结果（LCS，增删不错位） */
  readonly diffTokens = computed<DiffToken[]>(() => {
    const workspace = this.workspace();
    const left = workspace.versions.find((version) => version.id === this.baselineVersionId());
    const right = this.activeVersion();
    if (!left || left.id === right.id) return [];
    return alignStreams(buildStream(left.text), buildStream(right.text));
  });

  /** 连续变化字合并成的异文段 */
  readonly diffSegments = computed<DiffSegment[]>(() => {
    const tokens = this.diffTokens();
    if (!tokens.length) return [];
    const workspace = this.workspace();
    const left = workspace.versions.find((version) => version.id === this.baselineVersionId());
    return buildSegments(tokens, left, this.activeVersion());
  });

  /** 比较流渲染块：相同字串与异文段交错 */
  readonly compareBlocks = computed<CompareBlock[]>(() => {
    return buildCompareBlocks(this.diffTokens(), this.diffSegments());
  });

  /** 异文段总数（供界面计数） */
  readonly differences = computed(() => this.diffSegments());

  readonly baselineVersion = computed(() => this.workspace().versions.find((version) => version.id === this.baselineVersionId()));

  selectVersion(id: string): void {
    this.workspace.update((workspace) => ({ ...workspace, activeVersionId: id }));
  }

  selectCell(line: number, position: number): void {
    this.selectedLine.set(line);
    this.selectedPosition.set(position);
  }

  setTemplate(id: string): void {
    this.commit((workspace) => {
      workspace.templateId = id;
    });
  }

  updateText(text: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      const oldText = version.text;
      version.text = text;
      const migrated = migrateAnnotations(oldText, text, version.marks, version.antithesisPairs);
      version.marks = migrated.marks;
      version.antithesisPairs = migrated.pairs;
    });
    this.clampSelection();
  }

  updateTitle(title: string): void {
    this.commit((workspace) => {
      workspace.title = title;
    });
  }

  updateVersionSource(source: string): void {
    this.commit((workspace) => {
      this.versionIn(workspace).source = source;
    });
  }

  setMark(patch: Partial<CharacterMark>): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      const id = key(this.selectedLine(), this.selectedPosition());
      version.marks[id] = { ...defaultMark(), ...version.marks[id], ...patch };
    });
  }

  cycleTone(): void {
    const cell = this.selectedCell();
    const next: Record<Tone, MarkTone | '?'> = { '?': '平', '平': '仄', '仄': '中', '中': '?' };
    this.setMark({ tone: next[cell?.actual ?? '?'] });
  }

  togglePause(): void {
    const cell = this.selectedCell();
    this.setMark({ pauseAfter: !(cell?.mark.pauseAfter ?? false) });
  }

  cycleRhyme(): void {
    const cell = this.selectedCell();
    const current = cell?.mark.rhyme ?? '';
    const next = current === '' ? 'A' : current === 'A' ? 'B' : current === 'B' ? 'C' : '';
    this.setMark({ rhyme: next });
  }

  addAntithesis(): void {
    const line = this.selectedLine();
    const other = line === 0 ? 1 : line - 1;
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      if (version.antithesisPairs.some((pair) => pair.leftLine === line && pair.rightLine === other)) return;
      version.antithesisPairs.push({ id: uid('pair'), leftLine: Math.min(line, other), rightLine: Math.max(line, other), note: '结构相对，词性相应。' });
    });
  }

  removeAntithesis(id: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      version.antithesisPairs = version.antithesisPairs.filter((pair) => pair.id !== id);
    });
  }

  updateAntithesis(id: string, note: string): void {
    this.commit((workspace) => {
      const pair = this.versionIn(workspace).antithesisPairs.find((item) => item.id === id);
      if (pair) pair.note = note;
    });
  }

  snapshot(): void {
    const active = clone(this.activeVersion());
    active.id = uid('version');
    active.name = `校勘稿 ${this.workspace().versions.length}`;
    active.createdAt = new Date().toISOString();
    this.commit((workspace) => {
      workspace.versions.unshift(active);
      workspace.activeVersionId = active.id;
    });
    this.toast.set('已建立独立校勘稿');
  }

  setBaseline(id: string): void {
    this.baselineVersionId.set(id);
    this.workspace.update((workspace) => ({ ...workspace, baselineVersionId: id }));
    this.persist();
    this.currentDiffIndex.set(0);
  }

  duplicateActiveAsBaseline(): void {
    this.setBaseline(this.activeVersion().id);
  }

  selectSegment(index: number): void {
    const count = this.diffSegments().length;
    if (!count) return;
    this.currentDiffIndex.set(((index % count) + count) % count);
  }

  nextDifference(): void {
    const count = this.diffSegments().length;
    if (!count) return;
    this.currentDiffIndex.set((this.currentDiffIndex() + 1) % count);
  }

  previousDifference(): void {
    const count = this.diffSegments().length;
    if (!count) return;
    this.currentDiffIndex.set((this.currentDiffIndex() - 1 + count) % count);
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.workspace()));
    this.workspace.set(previous);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.clampSelection();
    this.persist();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.workspace()));
    this.workspace.set(next);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.clampSelection();
    this.persist();
  }

  exportProofreadCopy(): string {
    const workspace = this.workspace();
    const active = this.activeVersion();
    const baseline = this.baselineVersion();
    const meterLines = this.analysis().map((line) => {
      const tags = line.cells.map((cell) => `${cell.char}${cell.actual === '?' ? '□' : `(${cell.actual})`}`).join(' ');
      return `第 ${line.index + 1} 句：${tags}`;
    });
    const segments = this.diffSegments();
    const replaceCount = segments.filter((segment) => segment.kind === 'replace' || segment.kind === 'mixed').length;
    const insertCount = segments.filter((segment) => segment.kind === 'insert').length;
    const deleteCount = segments.filter((segment) => segment.kind === 'delete').length;
    const segmentLines: string[] = [];
    if (segments.length) {
      segments.forEach((segment, index) => {
        segmentLines.push(`### 第 ${index + 1} 段 · ${segmentKindLabel(segment.kind)}`);
        segmentLines.push(`- 底本：${formatContext(segment.contextBefore)}【${segment.left || '∅'}】${formatContext(segment.contextAfter)}`);
        segmentLines.push(`- 当前：${formatContext(segment.contextBefore)}【${segment.right || '∅'}】${formatContext(segment.contextAfter)}`);
        if (segment.notes.length) {
          segmentLines.push('- 批注：');
          segment.notes.forEach((note) => {
            segmentLines.push(`  - ${note.side === 'left' ? '底本' : '当前'}《${note.versionName}》「${note.char}」：${note.text}`);
          });
        } else {
          segmentLines.push('- 批注：（本段两边均无逐字批注与依据）');
        }
        segmentLines.push('');
      });
    } else {
      segmentLines.push('（未选择比较底本，或底本与当前稿文字完全一致）');
      segmentLines.push('');
    }
    const pairLines = active.antithesisPairs.length
      ? active.antithesisPairs.map((pair) => `- 第 ${pair.leftLine + 1} 句 ↔ 第 ${pair.rightLine + 1} 句：${pair.note}`)
      : ['（当前版本尚未标记对仗关系）'];
    const issueLines = this.issues().map((issue) => `[${issue.level.toUpperCase()}] ${issue.title}：${issue.detail}`);
    return [
      `# ${workspace.title} · 格律校对稿`,
      '',
      `作者：${workspace.author || '未详'}`,
      `底本：${baseline ? `${baseline.name}（${baseline.source || '出处未详'}）` : '未指定'}`,
      `当前校勘稿：${active.name}（${active.source || '出处未详'}）`,
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '## 一、逐句字音标注',
      ...meterLines,
      '',
      '## 二、异文段校勘',
      `共 ${segments.length} 段（换字 ${replaceCount}，增字 ${insertCount}，缺字 ${deleteCount}）`,
      '',
      ...segmentLines,
      '## 三、对仗关系',
      ...pairLines,
      '',
      '## 四、检查记录',
      ...issueLines,
    ].join('\n');
  }

  downloadProofreadCopy(): void {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([this.exportProofreadCopy()], { type: 'text/markdown;charset=utf-8' }));
    anchor.download = `${this.workspace().title}-格律校对稿.md`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  selectedCell(): AnalysisCell | undefined {
    return this.analysis()[this.selectedLine()]?.cells[this.selectedPosition()];
  }

  private clampSelection(): void {
    const lineCount = this.lines().length;
    if (this.selectedLine() >= lineCount) this.selectedLine.set(Math.max(0, lineCount - 1));
    const line = this.analysis()[this.selectedLine()];
    const max = Math.max(0, (line?.cells.length ?? 1) - 1);
    if (this.selectedPosition() > max) this.selectedPosition.set(max);
  }

  private commit(mutator: (workspace: PoemWorkspace) => void): void {
    this.undoStack.push(clone(this.workspace()));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    const next = clone(this.workspace());
    mutator(next);
    next.updatedAt = new Date().toISOString();
    this.workspace.set(next);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(0);
    this.persist();
  }

  private versionIn(workspace: PoemWorkspace): PoemVersion {
    const version = workspace.versions.find((item) => item.id === workspace.activeVersionId) ?? workspace.versions[0];
    return version;
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace()));
  }

  private isAcceptableVariant(template: MeterTemplate, line: number, position: number): boolean {
    if (template.lineLength === 5) return position === 0 || position === 2;
    return position === 0 || position === 2 || position === 4;
  }
}
