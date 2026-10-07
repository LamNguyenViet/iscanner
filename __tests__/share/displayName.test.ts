import { displayNameFromUri } from '../../src/share/displayName';

describe('displayNameFromUri', () => {
  it('strips the volume prefix and folders of a DocumentsProvider URI', () => {
    expect(
      displayNameFromUri('content://com.android.externalstorage.documents/document/primary%3ADownload%2Fphu-luc-B.pdf'),
    ).toBe('phu-luc-B.pdf');
  });

  it('keeps a plain numeric id', () => {
    expect(displayNameFromUri('content://media/external/file/123')).toBe('123');
  });

  it('decodes percent-encoded unicode', () => {
    expect(displayNameFromUri('file:///data/x/Inbox/H%E1%BB%A3p%20%C4%91%E1%BB%93ng.pdf')).toBe('Hợp đồng.pdf');
  });

  it('returns an empty string when there is no usable segment', () => {
    expect(displayNameFromUri('content://x/')).toBe('');
  });

  it('does not throw on malformed percent sequences', () => {
    expect(() => displayNameFromUri('content://x/%E0%A4%A')).not.toThrow();
    expect(displayNameFromUri('content://x/%E0%A4%A')).toBe('%E0%A4%A');
  });
});
