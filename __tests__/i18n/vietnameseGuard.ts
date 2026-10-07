const LETTERS =
  'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ';
const VIETNAMESE = new RegExp(`[${LETTERS}]`);

/**
 * Blanks out comments, keeping line structure. A double slash or slash-star only starts a comment
 * outside a quoted string, so a string literal containing one never hides the rest of the line.
 */
export function stripComments(text: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\' && next !== undefined) {
        out += next;
        i++;
      } else if (c === quote) {
        quote = null;
      }
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      i--;
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n';
        i++;
      }
      i++;
    } else {
      if (c === '"' || c === "'" || c === '`') quote = c;
      out += c;
    }
  }
  return out;
}

/** 1-based numbers of the lines of `source` that contain a Vietnamese letter outside comments. */
export function vietnameseLines(source: string): number[] {
  return stripComments(source)
    .split(/\r?\n/)
    .flatMap((line, i) => (VIETNAMESE.test(line) ? [i + 1] : []));
}
