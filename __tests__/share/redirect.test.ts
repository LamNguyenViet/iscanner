import { incomingUriParam, MAX_INCOMING_PATH, redirectIncomingPath } from '../../src/share/redirect';

/** What expo-router does to a query param before `useLocalSearchParams` hands it to the screen:
 * URLSearchParams decodes it once (getStateFromPath), then useLocalSearchParams decodes it again. */
function routerParam(href: string, name: string): string {
  const raw = new URL(href, 'http://x').searchParams.get(name)!;
  return decodeURIComponent(raw);
}

describe('redirectIncomingPath', () => {
  test('file URL goes to the incoming screen', () => {
    const href = redirectIncomingPath('file:///a/b.pdf');
    expect(href.startsWith('/incoming?uri=')).toBe(true);
    expect(incomingUriParam(routerParam(href, 'uri'))).toBe('file:///a/b.pdf');
  });

  test('content URI goes to the incoming screen', () => {
    const href = redirectIncomingPath('content://com.zing.zalo/x');
    expect(href.startsWith('/incoming?uri=')).toBe(true);
    expect(incomingUriParam(routerParam(href, 'uri'))).toBe('content://com.zing.zalo/x');
  });

  test('percent-escapes in the URI survive expo-router decoding the param twice', () => {
    const uri = 'content://com.android.providers.downloads.documents/document/msf%3A12%20a+b';
    const href = redirectIncomingPath(uri);
    expect(incomingUriParam(routerParam(href, 'uri'))).toBe(uri);
  });

  test('expo-sharing share link that launches the app goes to the incoming screen', () => {
    expect(redirectIncomingPath('iscanner://expo-sharing', true)).toBe('/incoming');
    expect(redirectIncomingPath('iscanner:///expo-sharing', true)).toBe('/incoming');
    expect(redirectIncomingPath('/expo-sharing', true)).toBe('/incoming');
    expect(redirectIncomingPath('expo-sharing', true)).toBe('/incoming');
  });

  test('expo-sharing share link while the app runs is ignored (the foreground check owns it)', () => {
    expect(redirectIncomingPath('iscanner://expo-sharing', false)).toBe('');
    expect(redirectIncomingPath('/expo-sharing', false)).toBe('');
  });

  test('file URLs and other paths behave the same while the app runs', () => {
    expect(redirectIncomingPath('file:///a/b.pdf', false).startsWith('/incoming?uri=')).toBe(true);
    expect(redirectIncomingPath('/scan', false)).toBe('/scan');
  });

  test('leaves other paths unchanged', () => {
    for (const p of ['/', '/scan', 'iscanner://viewer/abc', 'iscanner:///', '/expo-sharing-x']) {
      expect(redirectIncomingPath(p)).toBe(p);
    }
  });

  test('garbage and empty input are returned unchanged', () => {
    expect(redirectIncomingPath('')).toBe('');
    expect(redirectIncomingPath('%%%')).toBe('%%%');
    expect(redirectIncomingPath(undefined as unknown as string)).toBe(undefined);
    expect(redirectIncomingPath(42 as unknown as string)).toBe(42);
  });
});

describe('incomingUriParam', () => {
  test('returns a decoded URI as is', () => {
    expect(incomingUriParam('content://p/doc%3A1')).toBe('content://p/doc%3A1');
  });

  test('decodes a param that is still encoded', () => {
    expect(incomingUriParam(encodeURIComponent('content://p/doc%3A1'))).toBe('content://p/doc%3A1');
  });

  test('missing or invalid param gives undefined', () => {
    expect(incomingUriParam(undefined)).toBeUndefined();
    expect(incomingUriParam('')).toBeUndefined();
    expect(incomingUriParam(['a', 'b'])).toBeUndefined();
    expect(incomingUriParam('%E0%A4%A')).toBeUndefined();
  });
});

describe('incomingUriParam schemes', () => {
  test('only file and content URIs are accepted', () => {
    expect(incomingUriParam('file:///a/b.pdf')).toBe('file:///a/b.pdf');
    expect(incomingUriParam('CONTENT://p/1')).toBe('CONTENT://p/1');
    for (const uri of ['https://evil.example/x.pdf', 'javascript:alert(1)', 'iscanner://viewer/x', 'data:application/pdf;base64,JVBE']) {
      expect(incomingUriParam(uri)).toBeUndefined();
      expect(incomingUriParam(encodeURIComponent(uri))).toBeUndefined();
    }
  });
});

describe('over-long incoming links (expo-router query decoding DoS, GHSA-vcc3-ghjq-m6fr)', () => {
  test('a malformed link longer than the cap opens the library instead', () => {
    expect(redirectIncomingPath('iscanner://x?q=' + '%E0%A4%A'.repeat(400))).toBe('/');
  });

  test('a file link longer than the cap is refused too', () => {
    expect(redirectIncomingPath('content://p/' + 'a'.repeat(MAX_INCOMING_PATH))).toBe('/');
  });

  test('links up to the cap are unchanged', () => {
    const path = '/viewer/' + 'a'.repeat(MAX_INCOMING_PATH - 8);
    expect(path).toHaveLength(MAX_INCOMING_PATH);
    expect(redirectIncomingPath(path)).toBe(path);
  });
});
