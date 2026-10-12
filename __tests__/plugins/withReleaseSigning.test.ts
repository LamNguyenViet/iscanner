import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withReleaseSigning = require('../../plugins/withReleaseSigning');
const applyReleaseSigning: (gradle: string) => string = withReleaseSigning.applyReleaseSigning;

const FIXTURE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
}
`;

const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('applyReleaseSigning', () => {
  test('adds release signing config, conditional signingConfig, warning and marker', () => {
    const out = applyReleaseSigning(FIXTURE);
    expect(count(out, '// @iscanner-release-signing')).toBe(1);
    expect(count(out, "storeFile file(ISCANNER_UPLOAD_STORE_FILE)")).toBe(1);
    expect(out).toContain('storePassword ISCANNER_UPLOAD_STORE_PASSWORD');
    expect(out).toContain('keyAlias ISCANNER_UPLOAD_KEY_ALIAS');
    expect(out).toContain('keyPassword ISCANNER_UPLOAD_KEY_PASSWORD');
    expect(out).toContain(
      "signingConfig project.hasProperty('ISCANNER_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    expect(out).toContain("logger.warn('iScanner: release build is signed with the DEBUG key')");
    // debug build type keeps the debug key; release block inserted after debug config
    expect(count(out, 'signingConfig signingConfigs.debug')).toBe(1);
    expect(out.indexOf('release {')).toBeGreaterThan(out.indexOf("keyAlias 'androiddebugkey'"));
  });

  test('is idempotent', () => {
    const once = applyReleaseSigning(FIXTURE);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  test('throws when anchors are missing', () => {
    expect(() => applyReleaseSigning('android { }')).toThrow(/signing/i);
    expect(() => applyReleaseSigning(FIXTURE.replace('signingConfig signingConfigs.debug\n            def', 'def'))).toThrow();
  });
});

describe('app.json native config', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8')).expo;

  test('registers the plugin', () => {
    expect(app.plugins).toContain('./plugins/withReleaseSigning');
  });
  test('declares install permission', () => {
    expect(app.android.permissions).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
  });
  test('has updateConfigUrl extra', () => {
    expect(app.extra).toHaveProperty('updateConfigUrl');
  });
  test('version 1.11.0 / 11 / "11"', () => {
    expect(app.version).toBe('1.11.0');
    expect(app.android.versionCode).toBe(11);
    expect(app.ios.buildNumber).toBe('11');
  });
});
