import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '@frequency-tracker/database';

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin);
