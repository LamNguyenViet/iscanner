import { File } from 'expo-file-system';
import type { ReadBytes } from '../workflows/scanWorkflow';

export const readBytes: ReadBytes = async (uri) => new File(uri).bytes();
