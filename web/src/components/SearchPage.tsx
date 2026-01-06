import React, { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Empty, Input, List, message, Select, Space, Spin, Typography } from 'antd'
import { PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons'
import { cacheTrack, searchTracks } from '../lib/api'

type Props = {
    onPlay: (item: any) => void;
    onCache?: (id: number) => void;
}

const STORAGE_KEY = 'gwm_settings_v1'

const loadSettings = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { defaultSource: 'netease', cacheTag: 'default' }
        return JSON.parse(raw)
    } catch (e) {
        return { defaultSource: 'netease', cacheTag: 'default' }
    }
}

const SearchPage: React.FC<Props> = ({ onPlay, onCache }) => {
    const saved = loadSettings()
    const [q, setQ] = useState('')
    const [committedQ, setCommittedQ] = useState('')
    const [source, setSource] = useState<'netease' | 'bili'>(saved.defaultSource || 'netease')
    const [tag, setTag] = useState<string>(saved.cacheTag || 'default')

    const keyword = useMemo(() => committedQ.trim(), [committedQ])
    const { data: results = [], isFetching, isError } = useQuery({
        queryKey: ['search', keyword, source],
        enabled: keyword.length > 0,
        queryFn: () => searchTracks(keyword, source),
        staleTime: 10_000,
    })

    const cacheMut = useMutation({
        mutationFn: async (id: number) => {
            const res = await cacheTrack(id, tag)
            if (!res.ok) throw new Error(res.error || 'cache failed')
            return res
        },
        onSuccess: (_data, id) => {
            message.success('已加入缓存')
            onCache && onCache(id)
        },
        onError: (err: any) => {
            message.error(err?.message || '缓存失败')
        },
    })

    const doSearch = () => {
        const next = q.trim()
        if (!next) return
        setCommittedQ(next)
    }

    return (
        <Card title="搜索" styles={{ body: { padding: 16 } }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Input.Search
                        aria-label="search-input"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onSearch={doSearch}
                        placeholder="搜索歌曲/视频/专辑"
                        allowClear
                        style={{ minWidth: 260, flex: '1 1 320px' }}
                        loading={isFetching}
                        enterButton
                    />

                    <Select
                        value={source}
                        onChange={(v) => setSource(v)}
                        style={{ width: 120 }}
                        options={[
                            { value: 'netease', label: '网易云' },
                            { value: 'bili', label: 'Bilibili' },
                        ]}
                    />

                    <Input
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                        placeholder="缓存 tag"
                        style={{ width: 160 }}
                    />
                </Space>

                {isFetching ? (
                    <div style={{ padding: 18, textAlign: 'center' }}>
                        <Spin />
                    </div>
                ) : results.length === 0 ? (
                    <Empty
                        description={keyword ? (isError ? '搜索失败' : '未找到结果') : '请输入关键词并搜索'}
                        style={{ padding: 12 }}
                    />
                ) : (
                    <List
                        itemLayout="horizontal"
                        dataSource={results}
                        renderItem={(r: any) => (
                            <List.Item
                                actions={[
                                    <Button
                                        key="play"
                                        type="primary"
                                        icon={<PlayCircleOutlined />}
                                        onClick={() => onPlay(r)}
                                        aria-label={`play-${r.id}`}
                                    >
                                        播放
                                    </Button>,
                                    <Button
                                        key="cache"
                                        icon={<DownloadOutlined />}
                                        loading={cacheMut.isPending && (cacheMut.variables as any) === r.id}
                                        onClick={() => cacheMut.mutate(Number(r.id))}
                                    >
                                        缓存
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    title={<Typography.Text strong>{r.name}</Typography.Text>}
                                    description={<Typography.Text type="secondary">{(r.artists || []).join(' / ')}</Typography.Text>}
                                />
                            </List.Item>
                        )}
                    />
                )}
            </Space>
        </Card>
    )
}

export default SearchPage
