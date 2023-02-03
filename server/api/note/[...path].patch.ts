import getPrisma from '~/prisma';

export default defineEventHandler(async (event) => {
  const timer = createTimer();

  const user = event.context.user!;

  const prisma = getPrisma();

  const query = getQuery(event);
  const path = getRouterParam(event, 'path') as string;
  const notePath = generateNotePath(user.username, path);

  const whitelistedFieldUpdates: Array<'name' | 'content'> = ['name', 'content'];

  interface UpdatableFields { name?: string; content?: string }
  const fieldsToUpdate = await readBody<UpdatableFields>(event);

  const data: UpdatableFields & { path?: string } = {};

  for (const field of whitelistedFieldUpdates)
    if (fieldsToUpdate[field]) data[field] = fieldsToUpdate[field];

  // if user updates note name we also need to update its path
  if (data.name) {
    // replacing last string after `/` with new note name
    const newNotePath = path.split('/').slice(0, -1).concat(encodeURIComponent(data.name)).join('/');

    data.path = generateNotePath(user.username, newNotePath);
  }

  try {
    timer.start('db');
    const updatedNote = await prisma.note.update({
      data,
      where: { path: notePath },
      select: { id: true, name: true, content: true, path: true, updatedAt: true, createdAt: true },
    });
    timer.end();

    timer.appendHeader(event);

    if (query.getNote === 'true')
      return updatedNote;

    return { ok: true };
  }
  catch {
    return createError({ statusCode: 400 });
  }
});
