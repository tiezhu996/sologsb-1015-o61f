import { alignTexts, poemLines, remapLineIndex, remapMarks, remapPoint } from './text-align';
import type { CharacterMark } from '../models/poem.models';

function mark(note = '', tone: CharacterMark['tone'] = '平'): CharacterMark {
  return { tone, rhyme: '', pauseAfter: false, basis: '', note };
}

describe('text-align 校勘对齐', () => {
  it('相同文本全部 equal，无异文段', () => {
    const result = alignTexts('春眠不觉晓\n处处闻啼鸟', '春眠不觉晓\n处处闻啼鸟');
    expect(result.rows.length).toBe(2);
    expect(result.rows.every((row) => !row.changed)).toBeTrue();
    expect(result.segments.length).toBe(0);
  });

  it('换字识别为 replace 且合成一个异文段', () => {
    const result = alignTexts('夜来风雨声', '夜来风雨雨');
    const last = result.rows[0].units[4];
    expect(last.op).toBe('replace');
    expect(last.left).toBe('声');
    expect(last.right).toBe('雨');
    expect(result.segments.length).toBe(1);
    expect(result.segments[0].kind).toBe('换字');
    expect(result.segments[0].leftText).toBe('声');
    expect(result.segments[0].rightText).toBe('雨');
  });

  it('底本多出的字识别为缺字（delete），不发生整段错位', () => {
    // 当前稿在第二字处少一字，后续“闻啼鸟”仍须逐字对齐
    const result = alignTexts('处处闻啼鸟', '处闻啼鸟');
    const ops = result.rows[0].units.map((unit) => unit.op).join(',');
    expect(ops).toBe('equal,delete,equal,equal,equal');
    const deleted = result.rows[0].units[1];
    expect(deleted.op).toBe('delete');
    expect(deleted.left).toBe('处');
    expect(result.segments.length).toBe(1);
    expect(result.segments[0].kind).toBe('缺字');
  });

  it('当前稿多出的字识别为增字（insert）', () => {
    const result = alignTexts('处闻啼鸟', '处处闻啼鸟');
    const ops = result.rows[0].units.map((unit) => unit.op).join(',');
    expect(ops).toBe('equal,insert,equal,equal,equal');
    expect(result.segments[0].kind).toBe('增字');
    expect(result.segments[0].rightText).toBe('处');
  });

  it('同一处既有增又有缺时合成“增缺”段，连续多字变化只算一段', () => {
    const result = alignTexts('春眠不觉晓', '春眠不觉晓吗呢');
    expect(result.segments.length).toBe(1);
    expect(result.segments[0].kind).toBe('增字');

    const mixed = alignTexts('处处闻啼鸟', '处处新鸣啼鸟');
    const kinds = mixed.segments.map((segment) => segment.kind);
    // “闻”换作“新”并增“鸣”，属同一连续变化块；既换又增归为增字段
    expect(kinds.length).toBe(1);
    expect(kinds[0]).toBe('增字');
    expect(mixed.segments[0].leftText).toBe('闻');
    expect(mixed.segments[0].rightText).toBe('新鸣');
  });

  it('标点不参与对齐与行切分', () => {
    expect(poemLines('春眠不觉晓，\n处处闻啼鸟。')).toEqual(['春眠不觉晓', '处处闻啼鸟']);
    const result = alignTexts('春眠不觉晓，', '春眠不觉晓。');
    expect(result.segments.length).toBe(0);
  });

  it('整句增删按句对齐', () => {
    const added = alignTexts('春眠不觉晓\n处处闻啼鸟', '春眠不觉晓\n处处闻啼鸟\n夜来风雨声');
    expect(added.segments.some((segment) => segment.kind === '整句增')).toBeTrue();

    const removed = alignTexts('春眠不觉晓\n处处闻啼鸟\n夜来风雨声', '春眠不觉晓\n夜来风雨声');
    // “处处闻啼鸟”整句缺失，其后“夜来风雨声”仍要对齐到第三句位置而不是错位成第二句
    const rows = removed.rows;
    expect(rows[0].leftLine).toBe(0);
    expect(rows[0].rightLine).toBe(0);
    expect(rows[1].leftLine).toBe(1);
    expect(rows[1].rightLine).toBeUndefined();
    expect(rows[2].leftLine).toBe(2);
    expect(rows[2].rightLine).toBe(1);
    expect(removed.segments.some((segment) => segment.kind === '整句缺')).toBeTrue();
  });
});

describe('remapMarks 标注随原字迁移', () => {
  it('插入字后，原字标注平移到新位置，不丢失也不串位', () => {
    const oldText = '处闻啼鸟';
    const newText = '处处闻啼鸟';
    const oldMarks: Record<string, CharacterMark> = {
      '0:0': mark('首字', '仄'),
      '0:1': mark('闻字批注'),
      '0:2': mark('', '平'),
      '0:3': mark('', '仄'),
    };
    const next = remapMarks(oldText, newText, oldMarks);
    // “闻”从第 2 字平移到第 3 字（索引 1 -> 2），批注必须跟随
    expect(next['0:2'].note).toBe('闻字批注');
    // 后续“啼、鸟”继续顺延
    expect(next['0:3'].note).toBe('');
    expect(next['0:4']).toBeDefined();
    // 新增的“处”没有任何依据，不得凭空继承批注
    expect(next['0:1']).toBeUndefined();
    // 首字不动
    expect(next['0:0'].note).toBe('首字');
  });

  it('删字后被删字的标注不串给邻字，其余字标注保留', () => {
    const oldText = '处处闻啼鸟';
    const newText = '处闻啼鸟';
    const oldMarks: Record<string, CharacterMark> = {
      '0:1': mark('被删的第二个处', '仄'),
      '0:2': mark('闻'),
    };
    const next = remapMarks(oldText, newText, oldMarks);
    expect(Object.values(next).some((item) => item.note === '被删的第二个处')).toBeFalse();
    // “闻”迁到索引 1
    expect(next['0:1'].note).toBe('闻');
  });

  it('整句增删后后续句的标注迁移到新句序', () => {
    const oldText = '春眠不觉晓\n处处闻啼鸟\n夜来风雨声';
    const newText = '春眠不觉晓\n夜来风雨声';
    const oldMarks: Record<string, CharacterMark> = {
      '1:0': mark('第二句标注', '仄'),
      '2:0': mark('第三句标注', '仄'),
    };
    const next = remapMarks(oldText, newText, oldMarks);
    expect(next['1:0'].note).toBe('第三句标注');
    expect(next['0:0']).toBeUndefined();
  });
});

describe('remapLineIndex 与 remapPoint', () => {
  it('删句后对仗句序移动，被删句返回 undefined', () => {
    const alignment = alignTexts('甲\n乙\n丙', '甲\n丙');
    expect(remapLineIndex(alignment, 0)).toBe(0);
    expect(remapLineIndex(alignment, 1)).toBeUndefined();
    expect(remapLineIndex(alignment, 2)).toBe(1);
  });

  it('光标随原字移动', () => {
    const alignment = alignTexts('处闻啼鸟', '处处闻啼鸟');
    expect(remapPoint(alignment, 0, 1)).toEqual({ line: 0, position: 2 });
  });
});
