// @flow

import { OVERLAY_ERROR, OVERLAY_UNDEFINED } from './protocol.js'
import type { JsonValue, ProxyOverlay } from './protocol.js'

export const PROXY_OBJECT_KEY = 'proxy key'

/**
 * Searches through a JSON value, looking for API objects.
 * Returns an overlay containing the proxy id's,
 * or `undefined` if there are no API objects.
 * Calls `visitor` for each API object identified during the traversal.
 */
export function makeOverlay (
  value: any,
  visitor?: (proxyObject: any) => mixed
): ProxyOverlay {
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
      return null

    case 'undefined':
      return OVERLAY_UNDEFINED

    case 'object':
      if (value === null) return null
      if (value instanceof Error) return OVERLAY_ERROR

      // If this is an API object, return its id:
      const info = value[PROXY_OBJECT_KEY]
      if (info) {
        if (visitor) visitor(value)
        return info.proxyId
      }

      // Arrays:
      if (Array.isArray(value)) {
        let out = null
        for (let i = 0; i < value.length; ++i) {
          const overlay = makeOverlay(value[i], visitor)
          if (overlay !== null && out === null) {
            out = []
            for (let j = 0; j < i; ++j) out[j] = null
          }
          if (out !== null) out[i] = overlay
        }
        return out
      }

      // Objects:
      let out = null
      for (const name in value) {
        const overlay = makeOverlay(value[name], visitor)
        if (overlay !== null) {
          if (out === null) out = {}
          out[name] = overlay
        }
      }
      return out

    default:
      throw new TypeError(`Unsupported proxy value of type ${typeof value}`)
  }
}

/**
 * Copies a value, removing any API objects identified in the overlay.
 */
export function stripValue (value: any, overlay: ProxyOverlay): JsonValue {
  if (overlay === null) return value
  if (overlay === OVERLAY_ERROR) {
    const { name, message, stack } = value
    return { name, message, stack, ...value }
  }
  if (typeof overlay === 'string') return null

  // Arrays:
  if (Array.isArray(overlay)) {
    const out = []
    for (let i = 0; i < value.length; ++i) {
      out[i] = overlay[i] ? stripValue(value[i], overlay[i]) : value[i]
    }
    return out
  }

  // Objects:
  const out = {}
  for (const name in value) {
    out[name] = overlay[name]
      ? stripValue(value[name], overlay[name])
      : value[name]
  }
  return out
}
