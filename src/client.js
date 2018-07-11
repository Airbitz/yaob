// @flow

import { DELETED_PROXY_ID } from './protocol'
import type {
  ProxyCallMessage,
  ProxyOverlay,
  ProxyUpdateMessage
} from './protocol.js'

/**
 * The proxy sends messages to the server using this function.
 */
export type SendClientMessage = (message: ProxyCallMessage) => mixed

/**
 * The client application is responsible for receiving messages from the
 * server and passing them into this object.
 */
export type ProxyClient = {
  // The root of the API:
  root: Promise<any>,

  // The server has sent a message:
  handleMessage(message: ProxyUpdateMessage): mixed
}

/**
 * Creates the client side of an API proxy.
 */
export function makeProxyClient (sendMessage: SendClientMessage): ProxyClient {
  let lastCallId = 0

  // Proxy cache:
  const proxies: { [proxyId: string]: Object } = {}
  const pendingCalls: {
    [callId: number]: { resolve: Function, reject: Function }
  } = {}

  function applyOverlay (value: any, overlay: ProxyOverlay): any {
    // Proxies:
    if (overlay === null) return value
    if (overlay === DELETED_PROXY_ID) return null
    if (overlay === 'e') {
      const out = new Error()
      out.name = value.name
      out.stack = value.stack
      out.message = value.message
      return out
    }
    if (typeof overlay === 'string') {
      return proxies[overlay]
    }

    // Arrays:
    if (Array.isArray(overlay)) {
      const out = []
      for (let i = 0; i < value.length; ++i) {
        out[i] = overlay[i] ? applyOverlay(value[i], overlay[i]) : value[i]
      }
      return out
    }

    // Objects:
    if (overlay !== null) {
      const out = {}
      for (const name in value) {
        out[name] = overlay[name]
          ? applyOverlay(value[name], overlay[name])
          : value[name]
      }
      return out
    }
  }

  /**
   * Creates a method for placement on a proxy object.
   */
  function makeMethod (proxyId, method, type) {
    return (...params) => {
      if (!proxies[proxyId]) {
        return Promise.reject(
          new Error(`Calling method '${method}' on deleted object '${type}'`)
        )
      }

      // TODO: Overlay args?
      const callId = ++lastCallId
      sendMessage({ proxyId, callId, method, params })
      return new Promise((resolve, reject) => {
        pendingCalls[callId] = { resolve, reject }
      })
    }
  }

  let resolveRoot
  const root = new Promise(resolve => (resolveRoot = resolve))

  return {
    /**
     * Handle an incoming message from the server.
     */
    handleMessage (message: ProxyUpdateMessage) {
      // Handle newly-created objects:
      if (message.creates) {
        // Pass 1: Create proxies for the new objects:
        for (const { proxyId, methods, type } of message.creates) {
          // TODO: Use Object.create to snag client-side methods
          const proxy = {}
          proxies[proxyId] = proxy
          for (const method of methods) {
            proxy[method] = makeMethod(proxyId, method, type)
          }
          proxy.on = (name, callback) =>
            (proxy['on' + name[0].toUpperCase() + name.slice(1)] = callback)
        }

        // Pass 2: Fill in the values:
        for (const { proxyId, value, overlay } of message.creates) {
          const values = applyOverlay(value, overlay)
          for (const name in values) {
            proxies[proxyId][name] = values[name]
          }
        }
      }

      // Handle deleted objects:
      if (message.deletes) {
        for (const proxyId of message.deletes) {
          delete proxies[proxyId]
        }
      }

      // Handle updated objects:
      if (message.updates) {
        for (const { proxyId, name, value, overlay } of message.updates) {
          const proxy = proxies[proxyId]
          proxy[name] = applyOverlay(value, overlay)

          // Fire the callback:
          const callback =
            proxy['on' + name[0].toUpperCase() + name.slice(1) + 'Changed']
          if (callback) callback(proxy[name])
        }
      }

      // Handle function returns:
      if (message.return) {
        const { callId, fail, overlay, value } = message.return
        const result = applyOverlay(value, overlay)

        // Resolve the promise:
        if (fail) pendingCalls[callId].reject(result)
        else pendingCalls[callId].resolve(result)
        delete pendingCalls[callId]
      }

      // Handle the root object:
      if (message.root) {
        const { overlay, value } = message.root
        resolveRoot(applyOverlay(value, overlay))
      }
    },

    root
  }
}
