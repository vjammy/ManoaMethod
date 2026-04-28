import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { generateProjectBundle } from '@/lib/generator';
import type { ProjectInput } from '@/lib/types';

export async function POST(request: Request) {
  const input = (await request.json()) as ProjectInput;
  const bundle = generateProjectBundle(input);
  const zip = new JSZip();

  for (const file of bundle.files) {
    zip.file(`${bundle.exportRoot}/${file.path}`, file.content);
  }

  const data = await zip.generateAsync({ type: 'arraybuffer' });

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${bundle.exportRoot}-xelera-handoff.zip"`
    }
  });
}
