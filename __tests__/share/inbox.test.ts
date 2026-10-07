import { isIosInboxFile } from '../../src/share/inbox';

describe('isIosInboxFile', () => {
  test('a file in the app Documents/Inbox', () => {
    expect(
      isIosInboxFile('file:///var/mobile/Containers/Data/Application/ABC/Documents/Inbox/hop-dong.pdf'),
    ).toBe(true);
  });

  test('a percent-encoded Inbox path', () => {
    expect(isIosInboxFile('file:///var/mobile/ABC/Documents%2FInbox/H%E1%BB%A3p%20%C4%91%E1%BB%93ng.pdf')).toBe(true);
    expect(isIosInboxFile('file:///var/mobile/My%20App/Documents/Inbox/a.pdf')).toBe(true);
  });

  test('other sandbox files are never Inbox files', () => {
    expect(isIosInboxFile('file:///var/mobile/ABC/Documents/pdfs/x.pdf')).toBe(false);
    expect(isIosInboxFile('file:///var/mobile/ABC/Documents/Inboxes/x.pdf')).toBe(false);
    expect(isIosInboxFile('file:///var/mobile/ABC/Library/Caches/Documents/Inbox')).toBe(false);
  });

  test('non-file URIs and garbage', () => {
    expect(isIosInboxFile('content://p/Documents/Inbox/x.pdf')).toBe(false);
    expect(isIosInboxFile('file:///x/Documents/Inbox/%E0%A4%A')).toBe(false);
    expect(isIosInboxFile('')).toBe(false);
  });
});
