import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { generateProjectFiles } from '@/lib/generator';
import { slugify } from '@/lib/templates';
import type { ProjectInput } from '@/lib/types';

export async function POST(request: Request) {
  const input = (await request.json()) as ProjectInput;
  const zip = new JSZip();
  const root = slugify(input.productName);
  for (const file of generateProjectFiles(input)) {
    zip.file(`${root}/${file.path}`, file.content);
  }
  const data = await zip.generateAsync({ type: 'uint8array' });
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${root}-xelera-handoff.zip"`
    }
  });
}
