import React from 'react'
import { render, screen } from '@testing-library/react'
import LeftNav from '../components/LeftNav'

describe('LeftNav', () => {
    it('renders nav items and toggles collapse', () => {
        const setNavCollapsed = vi.fn()
        const setActiveTab = vi.fn()
        render(<LeftNav navCollapsed={false} setNavCollapsed={setNavCollapsed} activeTab={'tracks'} setActiveTab={setActiveTab} />)
        expect(screen.getAllByText(/歌曲/).length).toBeGreaterThan(0)
        expect(screen.getAllByText(/专辑/).length).toBeGreaterThan(0)
        expect(screen.getAllByText(/播放列表/).length).toBeGreaterThan(0)
    })
})
