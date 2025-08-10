// lib/pusher.ts
import Pusher from 'pusher';

export const pusher = new Pusher({
  appId: '2029809',
  key: '853a42b4c40c4afef823',
  secret: 'c6ba97e3eb23a97a1e3d',
  cluster: 'ap2',
  useTLS: true,
});
