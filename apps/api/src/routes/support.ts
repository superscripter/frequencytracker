import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sendEmail } from '../services/email.js';

const contactSchema = z.object({
  message: z.string().min(10, 'Message must be at least 10 characters'),
  subject: z.string().optional(),
});

export const supportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/support/contact
  // Send a support request from the logged-in user
  fastify.post('/contact', async (request, reply) => {
    await request.jwtVerify();
    const { userId } = request.user as { userId: string };

    try {
      const body = contactSchema.parse(request.body);

      // Get user info
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Send email notification to support email
      const notificationEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || 'frequencytrackerhelp@gmail.com';
      const subject = body.subject || `Support Request from ${user.name || user.email}`;

      const result = await sendEmail({
        to: notificationEmail,
        subject: `[FT Support] ${subject}`,
        html: `
          <h2>New Support Request</h2>
          <p><strong>From:</strong> ${user.name || 'Unknown'} (${user.email})</p>
          <p><strong>User ID:</strong> ${userId}</p>
          <p><strong>Reply to:</strong> <a href="mailto:${user.email}">${user.email}</a></p>
          <hr />
          <p>${body.message.replace(/\n/g, '<br />')}</p>
          <hr />
          <p style="color: #666; font-size: 12px;">
            To reply, use: <code>npm run send-email "${user.email}" "Re: ${subject}" "Your message"</code>
          </p>
        `,
        text: `New Support Request\n\nFrom: ${user.name || 'Unknown'} (${user.email})\nUser ID: ${userId}\nReply to: ${user.email}\n\n${body.message}\n\n---\nTo reply, use: npm run send-email "${user.email}" "Re: ${subject}" "Your message"`,
      });

      if (!result.success) {
        fastify.log.error({ error: result.error }, 'Failed to send support email');
        return reply.status(500).send({ error: 'Failed to send message. Please try again.' });
      }

      return reply.send({ success: true, message: 'Your message has been sent!' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });
};
