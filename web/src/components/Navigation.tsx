import React from 'react';

type Props = {
    navCollapsed: boolean;
    setNavCollapsed: (v: boolean) => void;
    activeTab: string;
    setActiveTab: (k: any) => void;
    openSettings?: () => void;
};

export const Navigation: React.FC<Props> = ({ navCollapsed, setNavCollapsed, activeTab, setActiveTab, openSettings }) => {
    const items = [
        { key: 'tracks', label: '歌曲' },
        { key: 'albums', label: '专辑' },
        { key: 'playlist', label: '播放列表' },
    ]

    return (
        <>
            <aside className={`left-nav left-nav-desktop ${navCollapsed ? 'collapsed' : ''}`}>
                <div className="nav-item logo" onClick={() => setNavCollapsed(!navCollapsed)} style={{ justifyContent: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(90deg,var(--accent),var(--accent-2))' }} />
                </div>
                {items.map((it) => (
                    <div key={it.key} className={`nav-item ${activeTab === it.key ? 'active' : ''}`} onClick={() => setActiveTab(it.key)}>{it.label}</div>
                ))}
                <div style={{ flex: 1 }} />
                <div className={`nav-item`} onClick={() => openSettings && openSettings()}>
                    设置
                </div>
            </aside>

            <nav className="bottom-nav" aria-hidden={false}>
                {items.map((it) => (
                    <div key={it.key} className={`nav-item ${activeTab === it.key ? 'active' : ''}`} onClick={() => setActiveTab(it.key)}>{it.label}</div>
                ))}
            </nav>
        </>
    )
}

export default Navigation;
