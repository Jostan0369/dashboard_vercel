// lib/pusherClient.ts
import Pusher from 'pusher-js';

export const pusherClient = new Pusher('853a42b4c40c4afef823', {
  cluster: 'ap2',
});
