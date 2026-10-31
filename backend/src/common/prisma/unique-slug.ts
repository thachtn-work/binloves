import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Every entity with a public slug hits the same P2002 case, so the mapping to
// a friendly Vietnamese message lives here rather than being re-typed in each
// service.
export async function withUniqueSlug<T>(entityLabel: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictException(`Slug này đã được dùng cho ${entityLabel} khác`);
    }
    throw err;
  }
}
