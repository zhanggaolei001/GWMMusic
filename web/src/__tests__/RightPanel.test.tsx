import React from 'react'
import { render, screen } from '@testing-library/react'
import RightPanel from '../components/RightPanel'

describe('RightPanel', () => {
    it('shows empty playlist message when no items', () => {
        render(<RightPanel playlistQueue={[]} removePlaylistItem={() => { }} fetchCache={() => { }} cacheEntries={[]} cacheLoading={false} setMiniPlayer={() => { }} />)
        expect(screen.getByText(/播放队列为空/)).toBeTruthy()
    })
})
