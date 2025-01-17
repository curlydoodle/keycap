import type { Prisma } from '@prisma/client';

export const selectors = defineNoteSelectors({
  default: {
    id: true,
    name: true,
    path: true,
    content: true,
  },

  details: {
    shares: { take: 1, select: { link: true } },
    updatedAt: true,
    createdAt: true,
  },
});

export default defineEventHandler(async (event) => {
  const user = event.context.user!;
  const timer = event.context.timer!;

  const path = getRouterParam(event, 'path');

  if (!path)
    throw createError({ statusCode: 400 });

  const notePath = generateNotePath(user.username, path);

  const prisma = getPrisma();
  const selectType: keyof typeof selectors = getQuery(event).details === undefined
    ? 'default'
    : 'details';

  timer.start('db');
  const note = await prisma.note.findFirst({
    where: { path: notePath, ownerId: user.id },
    select: selectors[selectType],
  })
    .catch(async (err) => {
      await event.context.logger.error({ err, msg: 'note.findFirst failed' });

      throw createError({ statusCode: 400 });
    });
  timer.end();

  if (!note)
    throw createError({ statusCode: 404 });

  timer.appendHeader(event);

  return {
    data: note as (
      Prisma.NoteGetPayload<{ select: typeof selectors['default'] }>
      | Prisma.NoteGetPayload<{ select: typeof selectors['details'] }>
    ),
  };
});
