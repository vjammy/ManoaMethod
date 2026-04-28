import { NextResponse } from 'next/server';
import { scoreProject } from '@/lib/scoring';
import type { ProjectInput } from '@/lib/types';

export async function POST(request: Request) {
  return NextResponse.json(scoreProject((await request.json()) as ProjectInput));
}
