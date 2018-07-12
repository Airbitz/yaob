// @flow

// Server API:
export { deleteApi, makeApi, makeProxyServer } from './server.js'
export type {
  ProxyServer,
  ProxyServerOptions,
  SendServerMessage
} from './server.js'

// Client API:
export { makeProxyClient } from './client.js'
export type { ProxyClient, SendClientMessage } from './client.js'

// Flow helper:
export type Event<name: string, Type> = (name, (value: Type) => mixed) => mixed
