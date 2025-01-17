import type { User } from '@prisma/client';
import type { createTimer } from '~/server/utils/timers';
import type { createLogger } from '~/server/utils/logger';
import type { OAuthProvider } from '~/server/utils/oauth';

export type SafeUser = Prettify<Pick<User, 'id' | 'email' | 'username'>>;

export declare module 'h3' {
  interface H3EventContext {
    user?: SafeUser | null
    timer?: ReturnType<typeof createTimer>
    logger: ReturnType<typeof createLogger>
  }
}

export interface NormalizedSocialUser {
  id: string
  email: string
  username: string
  type: OAuthProvider
}

// eslint-disable-next-line ts/no-redeclare
export type OAuthProvider = (typeof OAuthProvider)[keyof typeof OAuthProvider];

export {};
