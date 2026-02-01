import { describe, expect, test, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import vm from 'vm'

const lxSourcePath = path.resolve(process.cwd(), '..', 'lx-source.js')

type LxEventHandler = (payload: { source: string; action: string; info: any }) => Promise<any> | any

describe('lx-source.js', () => {
    let lastInitedPayload: any
    let requestMock: (url: string, options: any, cb: (err: any, resp: { body: any }) => void) => void
    let handler: LxEventHandler | null

    const createContext = () => {
        handler = null
        lastInitedPayload = undefined
        requestMock = (_url, _options, cb) => cb(null, { body: JSON.stringify({ lrc: { lyric: 'LRC' }, tlyric: { lyric: 'TLRC' } }) })

        const lx = {
            EVENT_NAMES: {
                request: 'request',
                inited: 'inited',
            },
            request: requestMock,
            on: (_event: string, cb: LxEventHandler) => {
                handler = cb
            },
            send: (_event: string, payload: any) => {
                lastInitedPayload = payload
            },
        }

        return {
            globalThis: { lx },
            console,
            setTimeout,
            clearTimeout,
        }
    }

    const runScript = (context: any) => {
        const code = fs.readFileSync(lxSourcePath, 'utf8')
        const script = new vm.Script(code, { filename: 'lx-source.js' })
        const vmContext = vm.createContext(context)
        script.runInContext(vmContext)
        return { handler, lastInitedPayload }
    }

    beforeEach(() => {
        handler = null
        lastInitedPayload = undefined
    })

    test('emits inited sources with expected actions', () => {
        const ctx = createContext()
        runScript(ctx)
        expect(lastInitedPayload).toBeDefined()
        expect(lastInitedPayload.sources.gwm.actions).toEqual(['musicUrl', 'lyric', 'pic'])
        expect(lastInitedPayload.sources.gwm.qualitys).toContain('flac')
    })

    test('musicUrl builds stream url with bitrate quality', async () => {
        const ctx = createContext()
        runScript(ctx)
        expect(handler).toBeTypeOf('function')
        const url = await handler!({
            source: 'gwm',
            action: 'musicUrl',
            info: { musicInfo: { id: 123 }, type: 'flac' },
        })
        expect(url).toMatch(/\/api\/songs\/123\/stream\?br=999000/)
    })

    test('lyric returns parsed lyric fields', async () => {
        const ctx = createContext()
        runScript(ctx)
        const res = await handler!({
            source: 'gwm',
            action: 'lyric',
            info: { musicInfo: { id: 456 } },
        })
        expect(res.lyric).toBe('LRC')
        expect(res.tlyric).toBe('TLRC')
    })

    test('pic returns cover url', async () => {
        const ctx = createContext()
        runScript(ctx)
        const url = await handler!({
            source: 'gwm',
            action: 'pic',
            info: { musicInfo: { id: 789 } },
        })
        expect(url).toMatch(/\/api\/songs\/789\/cover$/)
    })

    test('missing song id rejects', async () => {
        const ctx = createContext()
        runScript(ctx)
        await expect(handler!({ source: 'gwm', action: 'musicUrl', info: { musicInfo: {} } })).rejects.toThrow('Missing song id')
        await expect(handler!({ source: 'gwm', action: 'lyric', info: { musicInfo: {} } })).rejects.toThrow('Missing song id')
        await expect(handler!({ source: 'gwm', action: 'pic', info: { musicInfo: {} } })).rejects.toThrow('Missing song id')
    })

    test('unsupported action rejects', async () => {
        const ctx = createContext()
        runScript(ctx)
        await expect(handler!({ source: 'gwm', action: 'unknown', info: { musicInfo: { id: 1 } } })).rejects.toThrow('Unsupported action')
    })
})