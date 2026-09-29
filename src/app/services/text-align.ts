import type {
  CharacterMark,
  DiffOp,
  DiffRow,
  DiffSegment,
  DiffUnit,
  PoemAlignment,
} from '../models/poem.models';

/** 不参与格律与对齐的标点、空白 */
export const PUNCTUATION = new Set(['，', '。', '！', '？', '；', '：', '、', ' ', '\t', '—', '「', '」', '『', '』', '（', '）']);

interface RawOp {
  op: DiffOp;
  char: string;
  /** 底本（左）侧位置 */
  leftPos: number;
  /** 当前稿（右）侧位置；delete 时为 -1 */
  rightPos: number;
}

/** 拆成诗句行，再去掉每行的标点空白，只保留正字 */
export function poemLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => Array.from(line).filter((char) => !PUNCTUATION.has(char)).join(''));
}

/** 最长公共子序列回溯：返回逐字操作（equal/insert/delete），随后再压缩成 replace */
function lcsOps(a: string[], b: string[]): RawOp[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      ops.push({ op: 'equal', char: a[i], leftPos: i, rightPos: j });
      i++;
      j++;
    } else if (j >= n || (i < m && dp[i + 1][j] >= dp[i][j + 1])) {
      ops.push({ op: 'delete', char: a[i], leftPos: i, rightPos: -1 });
      i++;
    } else {
      ops.push({ op: 'insert', char: b[j], leftPos: -1, rightPos: j });
      j++;
    }
  }
  return ops;
}

/** 把连续的 delete/insert 压缩为 replace（按顺序一一配对，多余的保持增/缺） */
function compressOps(raw: RawOp[]): DiffUnit[] {
  const units: DiffUnit[] = [];
  let k = 0;
  let seq = 0;
  while (k < raw.length) {
    if (raw[k].op === 'equal') {
      const item = raw[k];
      units.push({ seq: seq++, op: 'equal', left: item.char, right: item.char, leftPos: item.leftPos, rightPos: item.rightPos });
      k++;
      continue;
    }
    const block: RawOp[] = [];
    while (k < raw.length && raw[k].op !== 'equal') {
      block.push(raw[k]);
      k++;
    }
    const dels = block.filter((item) => item.op === 'delete');
    const inss = block.filter((item) => item.op === 'insert');
    const pairs = Math.min(dels.length, inss.length);
    for (let p = 0; p < pairs; p++) {
      units.push({ seq: seq++, op: 'replace', left: dels[p].char, right: inss[p].char, leftPos: dels[p].leftPos, rightPos: inss[p].rightPos });
    }
    for (let p = pairs; p < dels.length; p++) {
      units.push({ seq: seq++, op: 'delete', left: dels[p].char, right: '', leftPos: dels[p].leftPos });
    }
    for (let p = pairs; p < inss.length; p++) {
      units.push({ seq: seq++, op: 'insert', left: '', right: inss[p].char, rightPos: inss[p].rightPos });
    }
  }
  return units;
}

/** 行级最长公共子序列，返回 0/1/2 组成的编辑脚本 */
function lineScript(left: string[], right: string[]): Array<0 | 1 | 2> {
  const m = left.length;
  const n = right.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const script: Array<0 | 1 | 2> = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && left[i] === right[j]) {
      script.push(0);
      i++;
      j++;
    } else if (j >= n || (i < m && dp[i + 1][j] >= dp[i][j + 1])) {
      script.push(1);
      i++;
    } else {
      script.push(2);
      j++;
    }
  }
  return script;
}

function segmentKind(units: DiffUnit[]): DiffSegment['kind'] {
  const hasReplace = units.some((unit) => unit.op === 'replace');
  const hasDelete = units.some((unit) => unit.op === 'delete');
  const hasInsert = units.some((unit) => unit.op === 'insert');
  // 同时存在纯增与纯缺（或再叠加换字），信息最全，标“增缺”
  if (hasDelete && hasInsert) return '增缺';
  if (hasReplace && hasInsert) return '增字';
  if (hasReplace && hasDelete) return '缺字';
  if (hasInsert) return '增字';
  if (hasDelete) return '缺字';
  return '换字';
}

/** 底本与当前稿按字符对齐，连续变化合成异文段 */
export function alignTexts(leftRaw: string, rightRaw: string): PoemAlignment {
  const left = poemLines(leftRaw);
  const right = poemLines(rightRaw);
  const rows: DiffRow[] = [];
  let rowIndex = 0;

  const pushRow = (leftLine: number | undefined, rightLine: number | undefined): void => {
    let units: DiffUnit[];
    if (leftLine !== undefined && rightLine !== undefined) {
      units = compressOps(lcsOps(Array.from(left[leftLine]), Array.from(right[rightLine])));
    } else if (leftLine !== undefined) {
      units = Array.from(left[leftLine]).map((char, pos) => ({ seq: pos, op: 'delete' as DiffOp, left: char, right: '', leftPos: pos }));
    } else {
      units = Array.from(right[rightLine!]).map((char, pos) => ({ seq: pos, op: 'insert' as DiffOp, left: '', right: char, rightPos: pos }));
    }
    const changed = units.some((unit) => unit.op !== 'equal');
    rows.push({
      index: rowIndex++,
      leftLine,
      rightLine,
      leftText: leftLine !== undefined ? left[leftLine] : '',
      rightText: rightLine !== undefined ? right[rightLine] : '',
      units: units.map((unit) => ({ ...unit, leftLine: leftLine, rightLine })),
      changed,
    });
  };

  // 行级 LCS 以“整句全同”为锚点；锚点之间的差异行块按序配对做句内字对齐，
  // 这样句中改一字不会被误判成整句增删；块内多出行才算真正的整句增缺。
  const script = lineScript(left, right);
  let li = 0;
  let ri = 0;
  let cursor = 0;
  while (cursor < script.length) {
    if (script[cursor] === 0) {
      pushRow(li, ri);
      li++;
      ri++;
      cursor++;
      continue;
    }
    const blockStart = cursor;
    while (cursor < script.length && script[cursor] !== 0) cursor++;
    const leftOnly: number[] = [];
    const rightOnly: number[] = [];
    for (let k = blockStart; k < cursor; k++) {
      if (script[k] === 1) leftOnly.push(li++);
      else rightOnly.push(ri++);
    }
    const pairs = Math.min(leftOnly.length, rightOnly.length);
    // 先输出真正的整句增删，再配对等长部分，保证阅读顺序接近原序
    for (let k = 0; k < leftOnly.length - pairs; k++) pushRow(leftOnly[k], undefined);
    for (let k = 0; k < pairs; k++) pushRow(leftOnly[leftOnly.length - pairs + k], rightOnly[rightOnly.length - pairs + k]);
    for (let k = 0; k < rightOnly.length - pairs; k++) pushRow(undefined, rightOnly[k]);
  }

  const segments: DiffSegment[] = [];
  rows.filter((row) => row.changed).forEach((row) => {
    if (row.leftLine === undefined) {
      segments.push({
        id: `seg-${row.index}-whole`,
        kind: '整句增',
        leftLine: undefined,
        rightLine: row.rightLine,
        leftText: '',
        rightText: row.rightText,
        units: row.units,
      });
      return;
    }
    if (row.rightLine === undefined) {
      segments.push({
        id: `seg-${row.index}-whole`,
        kind: '整句缺',
        leftLine: row.leftLine,
        rightLine: undefined,
        leftText: row.leftText,
        rightText: '',
        units: row.units,
      });
      return;
    }
    let block: DiffUnit[] = [];
    const flush = (): void => {
      if (!block.length) return;
      segments.push({
        id: `seg-${row.index}-${block[0].seq}`,
        kind: segmentKind(block),
        leftLine: row.leftLine,
        rightLine: row.rightLine,
        leftText: block.map((unit) => unit.left).join(''),
        rightText: block.map((unit) => unit.right).join(''),
        units: block,
      });
      block = [];
    };
    row.units.forEach((unit) => {
      if (unit.op === 'equal') flush();
      else block.push(unit);
    });
    flush();
  });

  return { rows, segments };
}

/** 文本增删后，平仄、韵组、依据、批注等随原字迁移到新位置；被删的字不串给邻字 */
export function remapMarks(
  oldText: string,
  newText: string,
  oldMarks: Record<string, CharacterMark>,
): Record<string, CharacterMark> {
  const alignment = alignTexts(oldText, newText);
  const next: Record<string, CharacterMark> = {};
  alignment.rows.forEach((row) => {
    row.units.forEach((unit) => {
      if (unit.leftLine === undefined || unit.leftPos === undefined) return;
      if (unit.rightLine === undefined || unit.rightPos === undefined) return;
      const mark = oldMarks[`${unit.leftLine}:${unit.leftPos}`];
      if (mark) next[`${unit.rightLine}:${unit.rightPos}`] = { ...mark };
    });
  });
  return next;
}

/** 旧句序到新句序的映射（整句增删时移动，删除的句不返回） */
export function remapLineIndex(alignment: PoemAlignment, oldLine: number): number | undefined {
  for (const row of alignment.rows) {
    if (row.leftLine === oldLine) return row.rightLine;
  }
  return undefined;
}

/** 文本增删后，把光标从旧坐标迁到最近的新字坐标 */
export function remapPoint(
  alignment: PoemAlignment,
  oldLine: number,
  oldPos: number,
): { line: number; position: number } {
  for (const row of alignment.rows) {
    if (row.leftLine !== oldLine) continue;
    if (row.rightLine === undefined) break;
    const exact = row.units.find((unit) => unit.leftPos === oldPos && unit.rightPos !== undefined);
    if (exact && exact.rightPos !== undefined) return { line: row.rightLine, position: exact.rightPos };
    const after = row.units.find((unit) => (unit.leftPos ?? -1) >= oldPos && unit.rightPos !== undefined);
    if (after && after.rightPos !== undefined) return { line: row.rightLine, position: after.rightPos };
    const before = [...row.units].reverse().find((unit) => (unit.leftPos ?? Infinity) <= oldPos && unit.rightPos !== undefined);
    if (before && before.rightPos !== undefined) return { line: row.rightLine, position: before.rightPos };
  }
  const mapped = remapLineIndex(alignment, oldLine);
  if (mapped !== undefined) {
    const row = alignment.rows.find((item) => item.rightLine === mapped);
    const maxPos = Math.max(0, (row?.units.filter((unit) => unit.rightPos !== undefined).length ?? 1) - 1);
    return { line: mapped, position: Math.min(oldPos, maxPos) };
  }
  const nearest = alignment.rows
    .filter((row) => row.rightLine !== undefined)
    .sort((a, b) => Math.abs((a.leftLine ?? a.rightLine!) - oldLine) - Math.abs((b.leftLine ?? b.rightLine!) - oldLine))[0];
  return { line: nearest?.rightLine ?? 0, position: Math.min(oldPos, Math.max(0, (nearest?.rightText.length ?? 1) - 1)) };
}
