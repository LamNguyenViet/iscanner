const NAME = /^(\d{4})-(\d{2})-(\d{2})\.log$/;

/** True for a `YYYY-MM-DD.log` file name. */
export const isLogFileName = (name: string): boolean => NAME.test(name);

/** Log files older than the last `keepDays` local days (today included). Other names and future files are kept. */
export function expiredLogFiles(names: string[], today: Date, keepDays = 7): string[] {
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (keepDays - 1));
  const cutoffKey = cutoff.getFullYear() * 10000 + (cutoff.getMonth() + 1) * 100 + cutoff.getDate();
  return names.filter((name) => {
    const m = NAME.exec(name);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const check = new Date(y, mo - 1, d);
    if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return false;
    return y * 10000 + mo * 100 + d < cutoffKey;
  });
}
