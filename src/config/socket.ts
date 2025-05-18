import { ServerOptions } from 'socket.io';

export const socketConfig: Partial<ServerOptions> = {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
};
