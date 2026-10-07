import { stripComments, vietnameseLines } from './vietnameseGuard';

describe('vietnameseLines', () => {
  it.each([
    ['<Text>Xoá</Text>'],
    ['<Button label="Xoá" />'],
    ["const a = 'Xoá // x';"],
    ['const a = `Xoá ${n}`;'],
    ["const url = 'http://x'; const b = 'Xoá';"],
  ])('flags %s', (line) => {
    expect(vietnameseLines(line)).toEqual([1]);
  });

  it.each([['// Xoá'], ['/* Xoá */'], ['const a = 1; // Xoá'], ['/*\n Xoá\n*/\nconst a = 1;'], ['const a = "x";']])(
    'ignores %s',
    (src) => {
      expect(vietnameseLines(src)).toEqual([]);
    },
  );

  it('keeps line numbers across block comments', () => {
    expect(vietnameseLines('/*\n\n*/\n<Text>Xoá</Text>')).toEqual([4]);
    expect(stripComments('a\n/* b\nc */\nd').split('\n')).toHaveLength(4);
  });
});
