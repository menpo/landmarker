/**
 * @module utils
 * Collection of utility functions not present in underscore and useful
 * throughout the application
 */
import Config from '../model/config'

/**
 * Generate a random alphanumeric string
 * useTime will **append** the current timestamp at the end
 * @param  {Integer} length
 * @param  {boolean} useTime=true
 * @return {string}
 */
export function randomString (length: number, useTime=true): string {
    var result = '',
        ch = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

    for (var i = length; i > 0; --i) {
        result += ch[Math.round(Math.random() * (ch.length - 1))]
    }

    if (useTime) {
        return result + (new Date()).getTime()
    }

    return result
}

/**
 * Returns the last part of a path, with or without the extension
 * @param  {string} path
 * @param  {boolean} removeExt=false
 * @return {string}
 */
export function basename(path: string, removeExt=false) {
    const bn = path.split('/').pop()
    return removeExt ? bn.split('.').slice(0, -1).join('.') : bn
}

/**
 * Return the lowercase extension for a path (null if no extension)
 * @param  {string} path
 * @return {string}
 */
export function extname(path: string): string {
    const parts = path.split('.')
    return parts.length > 1 ? parts.pop().toLowerCase() : undefined
}

/**
 * Return a path without its extension
 * @return {string}
 */
export function stripExtension(path: string): string {
    const parts = path.split('.')
    return parts.length > 1 ? parts.slice(0, -1).join('.') : path
}

export function stripTrailingSlash(str: string): string {
    return str.substr(-1) === '/' ? str.substr(0, str.length - 1) : str
}

export function addTrailingSlash(str: string): string {
    return str.substr(-1) === '/' ? str : str + '/'
}

/**
 * The base url of the current window with trailing slash addedd
 */
export function baseUrl () {
    return addTrailingSlash(window.location.origin + window.location.pathname)
}

export function pad(n: number, width: number, z='0') {
    const nStr = n.toString()
    return nStr.length >= width ? nStr :
        new Array(width - nStr.length + 1).join(z) + nStr
}

export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Restart the application by clearing the config and reloading the current
 * origin.
 * @param  {String} serverUrl [Server URL to preset before reloading]
 */
export function restart(serverUrl: string): void {
    Config().clear()
    const restartUrl = (
        baseUrl() + (serverUrl ? `?server=${serverUrl}` : '')
    )
    window.location.replace(restartUrl)
}

export function truncate(str: string, max: number, right=false, ellipsis=true): string {
    if (str.length > max) {
        let _str = !right ? str.slice(0, max - str.length) : // Keep left
                            str.slice(str.length - max)     // Keep right
        if (ellipsis) {
            _str = !right ? _str.slice(0, -3) + '...' : '...' + _str.slice(3)
        }
        return _str
    } else {
        return str
    }
}
