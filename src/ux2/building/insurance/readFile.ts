import { readPolicy, readSummary, type PolicyRead } from '@/lib/policyRead';

/** Read an insurance PDF in the browser. Anything else (a photo, a scan with no text) comes back empty with a sentence saying so. */
export async function readPolicyFile(file: File): Promise<{ read: PolicyRead; note: string }> {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return { read: {}, note: `${file.name} is not a PDF, so nothing was read from it. Type the details in.` };
  try {
    const { pdfLines } = await import('@/features/setup/pdfText');
    const read = readPolicy((await pdfLines(file)).map(page => page.join('\n')).join('\n'));
    return { read, note: readSummary(read, file.name) };
  } catch {
    return { read: {}, note: `${file.name} could not be read. Type the details in.` };
  }
}
