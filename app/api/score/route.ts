import { NextResponse } from 'next/server';
import { generateProjectBundle } from '@/lib/generator';
import type { ProjectInput } from '@/lib/types';

export async function POST(request: Request) {
  const input = (await request.json()) as ProjectInput;
  return NextResponse.json(generateProjectBundle(input).score);
}
