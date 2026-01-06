import React, { useEffect, useState } from 'react'

type Settings = {
    defaultSource: 'netease' | 'bili';
    cacheTag: string;
}

const STORAGE_KEY = 'gwm_settings_v1'

const defaultSettings: Settings = {
    defaultSource: 'netease',
    cacheTag: 'default',
}

const loadSettings = (): Settings => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return defaultSettings
        return JSON.parse(raw)
    } catch (e) {
        return defaultSettings
    }
}

const saveSettings = (s: Settings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

type Props = {
    onClose?: () => void;
}

const SettingsPage: React.FC<Props> = ({ onClose }) => {
    const [settings, setSettings] = useState<Settings>(defaultSettings)

    useEffect(() => {
        setSettings(loadSettings())
    }, [])

    const update = (patch: Partial<Settings>) => {
        const next = { ...settings, ...patch }
        setSettings(next)
        saveSettings(next)
    }

    return (
        <div className="card settings-page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>设置</h2>
                {onClose ? (
                    <button className="action-btn" onClick={onClose} aria-label="close-settings">关闭</button>
                ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <label>
                    音乐来源
                    <select value={settings.defaultSource} onChange={(e) => update({ defaultSource: e.target.value as any })}>
                        <option value="netease">网易云</option>
                        <option value="bili">Bilibili</option>
                    </select>
                </label>

                <label>
                    缓存 tag (文件夹)
                    <input value={settings.cacheTag} onChange={(e) => update({ cacheTag: e.target.value })} />
                </label>
            </div>
        </div>
    )
}

export default SettingsPage
