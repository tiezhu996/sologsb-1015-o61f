import { computed, Injectable, signal } from '@angular/core';
import type {
  AnalysisCell,
  AnalysisLine,
  AntithesisPair,
  CharacterMark,
  DiffSegment,
  MarkTone,
  MeterTemplate,
  PoemAlignment,
  PoemIssue,
  PoemVersion,
  PoemWorkspace,
  Tone,
} from '../models/poem.models';
import { WORKSPACE_SCHEMA_VERSION } from '../models/poem.models';
import { alignTexts, poemLines, remapLineIndex, remapMarks, remapPoint } from './text-align';

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

/** 沿用旧版键名：旧浏览器记录升级后无需迁移键即可继续打开编辑与导出 */
const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';
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

function initialWorkspace(): PoemWorkspace {
  const now = new Date().toISOString();
  const spring = '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。';
  const marks: Record<string, CharacterMark> = {};
  const cells = [
    ['晓', 0, '平'], ['鸟', 1, '平'], ['声', 2, '平'], ['少', 3, '平'],
  ] as const;
  cells.forEach(([char, line, tone]) => {
    marks[key(line, 4)] = { tone, rhyme: 'A', pauseAfter: false, basis: '《平水韵》上声十七筱', note: `${char} 为韵脚` };
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
    text: '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨雨，\n花落知多少。',
    marks: (() => {
      const copy = clone(marks);
      delete copy[key(2, 4)];
      copy[key(2, 4)] = { tone: '仄', rhyme: '', pauseAfter: false, basis: '宋本形近而误', note: '宋刻作“雨”，声字异文' };
      return copy;
    })(),
    antithesisPairs: [],
  };
  return {
    title: '春晓',
    author: '孟浩然',
    templateId: 'wuyan-zeqi',
    versions: [topVersion, variant],
    activeVersionId: topVersion.id,
    updatedAt: now,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
  };
}

/** 兼容旧版（无 schemaVersion）浏览器记录：补齐缺失字段并规整结构 */
function migrateWorkspace(parsed: Partial<PoemWorkspace>): PoemWorkspace | null {
  if (!parsed || !Array.isArray(parsed.versions) || parsed.versions.length === 0) return null;
  const templateOk = METER_TEMPLATES.some((item) => item.id === parsed.templateId);
  const versions: PoemVersion[] = parsed.versions.map((raw, index) => {
    const version = raw as Partial<PoemVersion>;
    const marks: Record<string, CharacterMark> = {};
    if (version.marks && typeof version.marks === 'object') {
      Object.entries(version.marks).forEach(([id, rawMark]) => {
        if (!/^\d+:\d+$/.test(id) || !rawMark || typeof rawMark !== 'object') return;
        const mark = rawMark as Partial<CharacterMark>;
        marks[id] = {
          tone: mark.tone === '平' || mark.tone === '仄' || mark.tone === '中' ? mark.tone : '?',
          rhyme: typeof mark.rhyme === 'string' ? mark.rhyme : '',
          pauseAfter: mark.pauseAfter === true,
          basis: typeof mark.basis === 'string' ? mark.basis : '',
          note: typeof mark.note === 'string' ? mark.note : '',
        };
      });
    }
    const pairs: AntithesisPair[] = Array.isArray(version.antithesisPairs)
      ? version.antithesisPairs
        .filter((pair) => pair && Number.isInteger(pair.leftLine) && Number.isInteger(pair.rightLine))
        .map((pair) => ({
          id: typeof pair.id === 'string' && pair.id ? pair.id : uid('pair'),
          leftLine: pair.leftLine,
          rightLine: pair.rightLine,
          note: typeof pair.note === 'string' ? pair.note : '',
        }))
      : [];
    return {
      id: typeof version.id === 'string' && version.id ? version.id : uid('version'),
      name: typeof version.name === 'string' && version.name ? version.name : `刻本 ${index + 1}`,
      source: typeof version.source === 'string' ? version.source : '',
      createdAt: typeof version.createdAt === 'string' ? version.createdAt : new Date().toISOString(),
      text: typeof version.text === 'string' ? version.text : '',
      marks,
      antithesisPairs: pairs,
    };
  });
  const activeVersionId = versions.some((item) => item.id === parsed.activeVersionId) ? parsed.activeVersionId! : versions[0].id;
  return {
    title: typeof parsed.title === 'string' && parsed.title ? parsed.title : '未命名诗稿',
    author: typeof parsed.author === 'string' ? parsed.author : '',
    templateId: templateOk ? parsed.templateId! : METER_TEMPLATES[0].id,
    versions,
    activeVersionId,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
  };
}

function loadWorkspace(): { workspace: PoemWorkspace; migrated: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { workspace: initialWorkspace(), migrated: false };
    const parsed = JSON.parse(raw) as Partial<PoemWorkspace>;
    const migrated = migrateWorkspace(parsed);
    if (!migrated) return { workspace: initialWorkspace(), migrated: false };
    return { workspace: migrated, migrated: parsed.schemaVersion !== WORKSPACE_SCHEMA_VERSION };
  } catch {
    return { workspace: initialWorkspace(), migrated: false };
  }
}

@Injectable({ providedIn: 'root' })
export class PoetryStoreService {
  readonly workspace = signal<PoemWorkspace>(loadWorkspace().workspace);
  readonly migratedFromLegacy = signal(loadWorkspaceMigrated());
  readonly selectedLine = signal(0);
  readonly selectedPosition = signal(4);
  readonly baselineVersionId = signal<string>(this.defaultBaselineId(this.workspace()));
  readonly currentSegmentIndex = signal(0);
  readonly toast = signal('');
  readonly undoCount = signal(0);
  readonly redoCount = signal(0);

  private undoStack: PoemWorkspace[] = [];
  private redoStack: PoemWorkspace[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  readonly activeVersion = computed(() => {
    const state = this.workspace();
    return state.versions.find((version) => version.id === state.activeVersionId) ?? state.versions[0];
  });

  readonly template = computed(() => {
    return METER_TEMPLATES.find((item) => item.id === this.workspace().templateId) ?? METER_TEMPLATES[0];
  });

  readonly lines = computed(() => poemLines(this.activeVersion().text));

  readonly analysis = computed<AnalysisLine[]>(() => {
    const version = this.activeVersion();
    const template = this.template();
    return this.lines().map((line, lineIndex) => {
      const chars = Array.from(line);
      const cells: AnalysisCell[] = chars.map((char, position) => {
        const mark = version.marks[key(lineIndex, position)] ?? defaultMark();
        const expected = template.pattern[lineIndex * template.lineLength + position] ?? '中';
        const actual = mark.tone === '?' ? (TONE_DICTIONARY[char] ?? '?') : mark.tone;
        let status: AnalysisCell['status'] = 'neutral';
        let message = '标点或不计律位置';
        if (actual === '?') {
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
    const rhymeCells = template.rhymeLines
      .map((line) => ({ line, cell: analysis[line]?.cells.at(-1) }))
      .filter((item): item is { line: number; cell: NonNullable<typeof item.cell> } => Boolean(item.cell));
    const rhymeGroups = new Map<string, string[]>();
    rhymeCells.forEach(({ line, cell }) => {
      if (!cell.mark.rhyme) {
        issues.push({ id: uid('issue'), level: 'warning', title: '韵脚缺少韵部', detail: `第 ${line + 1} 句末字“${cell.char}”尚未指定韵部。`, line });
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

  readonly baselineVersion = computed(() => this.workspace().versions.find((version) => version.id === this.baselineVersionId()));

  /** 底本与当前稿按字符对齐，增字 / 缺字 / 换字各自归位，不再整段错位 */
  readonly alignment = computed<PoemAlignment>(() => {
    const left = this.baselineVersion();
    const right = this.activeVersion();
    if (!left || left.id === right.id) return { rows: [], segments: [] };
    return alignTexts(left.text, right.text);
  });

  readonly segments = computed<DiffSegment[]>(() => this.alignment().segments);
  readonly currentSegment = computed(() => this.segments()[this.clampedSegmentIndex()]);

  selectVersion(id: string): void {
    this.workspace.update((workspace) => ({ ...workspace, activeVersionId: id }));
    this.currentSegmentIndex.set(0);
  }

  selectBaseline(id: string): void {
    this.baselineVersionId.set(id);
    this.currentSegmentIndex.set(0);
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

  /** 改文本：原字的平仄、韵组、依据、批注、停顿随原字迁移；对仗句序随句移动 */
  updateText(text: string): void {
    const version = this.activeVersion();
    const alignment = alignTexts(version.text, text);
    const movedMarks = remapMarks(version.text, text, version.marks);
    const point = remapPoint(alignment, this.selectedLine(), this.selectedPosition());
    this.commit((workspace) => {
      const target = this.versionIn(workspace);
      target.text = text;
      target.marks = movedMarks;
      target.antithesisPairs = target.antithesisPairs
        .map((pair) => {
          const leftLine = remapLineIndex(alignment, pair.leftLine);
          const rightLine = remapLineIndex(alignment, pair.rightLine);
          return leftLine === undefined || rightLine === undefined ? null : { ...pair, leftLine, rightLine };
        })
        .filter((pair): pair is AntithesisPair => pair !== null);
    });
    this.selectedLine.set(point.line);
    this.selectedPosition.set(point.position);
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
    this.baselineVersionId.set(this.workspace().versions.find((item) => item.id !== active.id)?.id ?? '');
    this.currentSegmentIndex.set(0);
    this.showToast('已建立独立校勘稿');
  }

  duplicateActiveAsBaseline(): void {
    this.baselineVersionId.set(this.activeVersion().id);
    this.currentSegmentIndex.set(0);
  }

  jumpSegment(index: number): void {
    const total = this.segments().length;
    if (!total) return;
    this.currentSegmentIndex.set(((index % total) + total) % total);
    this.scrollToCurrentSegment();
  }

  nextSegment(): void {
    this.jumpSegment(this.clampedSegmentIndex() + 1);
  }

  previousSegment(): void {
    this.jumpSegment(this.clampedSegmentIndex() - 1);
  }

  /** 异文段两侧用字的批注、依据、韵组等，供校对界面与导出使用 */
  segmentAnnotations(segment: DiffSegment): { left: string[]; right: string[] } {
    const baseline = this.baselineVersion();
    const active = this.activeVersion();
    const describe = (version: PoemVersion | undefined, line: number | undefined, pos: number | undefined, char: string): string | null => {
      if (version === undefined || line === undefined || pos === undefined) return null;
      const mark = version.marks[key(line, pos)];
      if (!mark) return null;
      const parts: string[] = [];
      if (mark.tone !== '?') parts.push(`${mark.tone}声`);
      if (mark.rhyme) parts.push(`韵 ${mark.rhyme}`);
      if (mark.pauseAfter) parts.push('句读顿');
      if (mark.basis) parts.push(`依据：${mark.basis}`);
      if (mark.note) parts.push(`批注：${mark.note}`);
      return parts.length ? `“${char}” ${parts.join('，')}` : null;
    };
    const collect = (side: 'left' | 'right'): string[] => {
      const version = side === 'left' ? baseline : active;
      const notes: string[] = [];
      segment.units.forEach((unit) => {
        if (side === 'left') {
          if (unit.op === 'insert') return;
          const text = describe(version, unit.leftLine, unit.leftPos, unit.left);
          if (text) notes.push(text);
        } else {
          if (unit.op === 'delete') return;
          const text = describe(version, unit.rightLine, unit.rightPos, unit.right);
          if (text) notes.push(text);
        }
      });
      return notes;
    };
    return { left: collect('left'), right: collect('right') };
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
    const lines = this.analysis().map((line) => {
      const tags = line.cells.map((cell) => `${cell.char}${cell.actual === '?' ? '□' : `(${cell.actual})`}`).join(' ');
      return `第 ${line.index + 1} 句：${tags}`;
    });
    const notes = this.issues().map((issue) => `[${issue.level.toUpperCase()}] ${issue.title}：${issue.detail}`);
    const section: string[] = ['# 异文校勘记录'];
    if (baseline && baseline.id !== active.id) {
      const segments = this.segments();
      section.push('', `底本：${baseline.name}（${baseline.source || '未注出处'}）`);
      section.push(`校勘稿：${active.name}（${active.source || '未注出处'}）`);
      if (segments.length === 0) {
        section.push('', '两本用字全同，无异文。');
      } else {
        section.push('', `共 ${segments.length} 段异文：`);
        segments.forEach((segment, index) => {
          const place = segment.leftLine !== undefined
            ? `第 ${segment.leftLine + 1} 句`
            : `（对应当前稿第 ${(segment.rightLine ?? 0) + 1} 句）`;
          section.push('', `### ${index + 1}. ${place} · ${segment.kind}`);
          section.push(`- 底本用字：${segment.leftText || '（无）'}`);
          section.push(`- 校勘稿用字：${segment.rightText || '（无）'}`);
          const annotations = this.segmentAnnotations(segment);
          if (annotations.left.length) section.push(`- 底本批注：${annotations.left.join('；')}`);
          if (annotations.right.length) section.push(`- 校勘稿批注：${annotations.right.join('；')}`);
        });
      }
    } else {
      section.push('', '未选择与当前稿不同的底本，暂无异文记录。');
    }
    const pairs = active.antithesisPairs;
    if (pairs.length) {
      section.push('', '## 对仗关系');
      pairs.forEach((pair) => {
        section.push(`- 第 ${pair.leftLine + 1} 句 ↔ 第 ${pair.rightLine + 1} 句：${pair.note || '（无说明）'}`);
      });
    }
    return [
      `# ${workspace.title} · 格律校对稿`,
      '',
      `作者：${workspace.author || '佚名'}`,
      `校勘稿：${active.name}`,
      `出处：${active.source}`,
      '',
      ...section,
      '',
      '## 字音标注',
      ...lines,
      '',
      '## 检查记录',
      ...notes,
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

  showToast(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }

  /** 旧记录升级后写回当前结构，之后仍可正常编辑、保存与导出 */
  persistMigrated(): void {
    if (!this.migratedFromLegacy()) return;
    this.persist();
    this.migratedFromLegacy.set(false);
  }

  private scrollToCurrentSegment(): void {
    setTimeout(() => {
      const segment = this.currentSegment();
      if (!segment) return;
      document.getElementById(segment.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  private clampedSegmentIndex(): number {
    const total = this.segments().length;
    if (total === 0) return 0;
    return Math.min(this.currentSegmentIndex(), total - 1);
  }

  private clampSelection(): void {
    const analysis = this.analysis();
    if (!analysis.length) {
      this.selectedLine.set(0);
      this.selectedPosition.set(0);
      return;
    }
    const line = Math.min(this.selectedLine(), analysis.length - 1);
    const position = Math.min(this.selectedPosition(), Math.max(0, analysis[line].cells.length - 1));
    this.selectedLine.set(line);
    this.selectedPosition.set(position);
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
    this.clampSelection();
    this.persist();
  }

  private versionIn(workspace: PoemWorkspace): PoemVersion {
    return workspace.versions.find((item) => item.id === workspace.activeVersionId) ?? workspace.versions[0];
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace()));
  }

  private defaultBaselineId(workspace: PoemWorkspace): string {
    return workspace.versions.find((item) => item.id !== workspace.activeVersionId)?.id ?? '';
  }

  private isAcceptableVariant(template: MeterTemplate, line: number, position: number): boolean {
    if (template.lineLength === 5) return position === 0 || position === 2;
    return position === 0 || position === 2 || position === 4;
  }
}

/** loadWorkspace 需读两次（signal 初始化顺序），这里只取迁移标记 */
function loadWorkspaceMigrated(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PoemWorkspace>;
    return parsed.schemaVersion !== WORKSPACE_SCHEMA_VERSION && !!migrateWorkspace(parsed);
  } catch {
    return false;
  }
}
