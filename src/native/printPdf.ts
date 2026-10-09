import * as Print from 'expo-print';
import type { PageSetup } from '../convert/types';

/** Renders HTML to a PDF in the cache directory and returns its file:// URI. */
export async function printHtmlToPdf(html: string, page: PageSetup): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html,
    width: page.width,
    height: page.height,
    margins: page.margin,
  });
  return uri;
}
