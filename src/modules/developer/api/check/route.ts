import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isDeveloper } from '@/shared/lib/auth-helpers';

// GET /api/developer/check - Check if current user is a developer
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ isDeveloper: false }, { status: 401 });

  const dev = await isDeveloper(user.id);
  return NextResponse.json({ isDeveloper: dev });
}
