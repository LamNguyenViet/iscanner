const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @iscanner-release-signing';
const PROP = 'ISCANNER_UPLOAD_STORE_FILE';

const RELEASE_CONFIG = `
        release {
            if (project.hasProperty('${PROP}')) {
                storeFile file(${PROP})
                storePassword ISCANNER_UPLOAD_STORE_PASSWORD
                keyAlias ISCANNER_UPLOAD_KEY_ALIAS
                keyPassword ISCANNER_UPLOAD_KEY_PASSWORD
            }
        }`;

const WARNING = `
${MARKER}
if (!project.hasProperty('${PROP}')) {
    logger.warn('iScanner: release build is signed with the DEBUG key')
}
`;

function fail(what) {
  throw new Error(`withReleaseSigning: cannot patch android/app/build.gradle, ${what} not found`);
}

function applyReleaseSigning(buildGradle) {
  if (buildGradle.includes(MARKER)) return buildGradle;

  // 1. signingConfigs { debug { ... } } -> append release after debug
  const signing = /signingConfigs\s*\{\s*debug\s*\{[^}]*\}/.exec(buildGradle);
  if (!signing) fail('signingConfigs { debug { ... } } block');
  const signingEnd = signing.index + signing[0].length;
  let out = buildGradle.slice(0, signingEnd) + RELEASE_CONFIG + buildGradle.slice(signingEnd);

  // 2. buildTypes { release { signingConfig signingConfigs.debug } }
  const bt = /buildTypes\s*\{/.exec(out);
  if (!bt) fail('buildTypes block');
  const rel = /\brelease\s*\{/.exec(out.slice(bt.index));
  if (!rel) fail('buildTypes release block');
  const relStart = bt.index + rel.index;
  const sc = /signingConfig signingConfigs\.debug/.exec(out.slice(relStart));
  if (!sc) fail('release signingConfig signingConfigs.debug');
  const scStart = relStart + sc.index;
  out =
    out.slice(0, scStart) +
    `signingConfig project.hasProperty('${PROP}') ? signingConfigs.release : signingConfigs.debug` +
    out.slice(scStart + sc[0].length);

  // 3. top-level warning
  return out.replace(/\s*$/, '\n') + WARNING;
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
