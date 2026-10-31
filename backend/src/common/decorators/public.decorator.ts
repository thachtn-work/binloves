import { SetMetadata } from '@nestjs/common';

// Marks a route as exempt from the global JwtAuthGuard. Default is "closed" —
// every new controller is protected unless explicitly opted out here. This is
// the fix for bin-loves shipping an unauthenticated /sync/trigger endpoint:
// forgetting to add a guard can no longer leave a route open by accident.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
