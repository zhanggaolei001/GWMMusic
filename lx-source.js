/**
 * @name GWM 音源 (REST)
 * @description 使用本地 GWMMusic server 提供的 REST 接口获取音乐/歌词/封面
 * @version 1.0.0
 * @author GWMMusic
 * @homepage https://github.com/zhanggaolei001/GWMMusic
 */

const { EVENT_NAMES, request, on, send } = globalThis.lx

// 配置：请按需修改为你的服务端地址
const API_BASE = "http://127.0.0.1:4000/api"

const httpRequest = (url, options) => new Promise((resolve, reject) => {
    request(url, options, (err, resp) => {
        if (err) return reject(err)
        resolve(resp.body)
    })
})

const buildUrl = (path, params) => {
    const base = API_BASE.replace(/\/$/, "")
    let query = ""
    if (params) {
        const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
        if (entries.length) {
            query = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")
        }
    }
    return `${base}${path}${query ? `?${query}` : ""}`
}

const apis = {
    gwm: {
        musicUrl({ id }, quality) {
            if (!id) return Promise.reject(new Error("Missing song id"))
            const url = buildUrl(`/songs/${id}/stream`, quality ? { br: quality } : undefined)
            return Promise.resolve(url)
        },
        lyric({ id }) {
            if (!id) return Promise.reject(new Error("Missing song id"))
            const url = buildUrl(`/songs/${id}/lyrics`)
            return httpRequest(url).then((data) => {
                let json
                try {
                    json = typeof data === "string" ? JSON.parse(data) : data
                } catch (e) {
                    json = {}
                }
                return {
                    lyric: json?.lrc?.lyric || "",
                    tlyric: json?.tlyric?.lyric || "",
                    rlyric: json?.romalrc?.lyric || "",
                }
            })
        },
        pic({ id }) {
            if (!id) return Promise.reject(new Error("Missing song id"))
            return Promise.resolve(buildUrl(`/songs/${id}/cover`))
        },
    },
}

const qualitys = {
    gwm: {
        "128k": "128000",
        "320k": "320000",
        flac: "999000",
        flac24bit: "999000",
    },
    local: {},
}

on(EVENT_NAMES.request, ({ source, action, info }) => {
    switch (action) {
        case "musicUrl":
            return apis[source].musicUrl(info.musicInfo, qualitys[source][info.type])
        case "lyric":
            return apis[source].lyric(info.musicInfo)
        case "pic":
            return apis[source].pic(info.musicInfo)
        default:
            return Promise.reject(new Error(`Unsupported action: ${action}`))
    }
})

send(EVENT_NAMES.inited, {
    sources: {
        gwm: {
            name: "GWM REST",
            type: "music",
            actions: ["musicUrl", "lyric", "pic"],
            qualitys: ["128k", "320k", "flac", "flac24bit"],
        },
        local: {
            name: "GWM 本地扩展",
            type: "music",
            actions: ["musicUrl", "lyric", "pic"],
            qualitys: [],
        },
    },
})