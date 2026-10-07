import { useCallback } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { useLocale } from '../i18n/LocaleContext';
import { log } from '../logging/logger';
import { toAppError } from './AppError';
import { errorsContent } from './messages';

export function useErrorAlert(): (err: unknown, opts?: { buttons?: AlertButton[] }) => void {
  const { t } = useLocale();
  return useCallback(
    (err, opts) => {
      const errs = (Array.isArray(err) ? err : [err]).map(toAppError);
      if (errs.length === 0) return;
      for (const e of errs) log.error(e.code, e.message, { file: e.fileName, cause: e.cause ?? e });
      const { title, message, code } = errorsContent(errs, t);
      Alert.alert(title, `${message}\n\n${t.errors.codeLine(code)}`, opts?.buttons);
    },
    [t],
  );
}
