import * as Application from 'expo-application';
import Constants from 'expo-constants';

export function currentAppBuild(): { version: string; build: number } {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
  const parsed = parseInt(Application.nativeBuildVersion ?? '', 10);
  return { version, build: Number.isFinite(parsed) ? parsed : 0 };
}
