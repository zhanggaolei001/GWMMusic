import React from 'react'
import { render, screen } from '@testing-library/react'
import App from '../App'
import Player from '../components/Player'

beforeAll(() => {
    // Provide jsdom-compatible no-op implementations for media methods
    // @ts-ignore
    HTMLMediaElement.prototype.play = function () {
        return Promise.resolve()
    }
    // @ts-ignore
    HTMLMediaElement.prototype.load = function () { }
    // @ts-ignore
    HTMLMediaElement.prototype.pause = function () { }
})

describe('App', () => {
    it('renders app title and left nav', () => {
        render(<App />)
        expect(screen.getByText(/GWM Music/i)).toBeTruthy()
        // LeftNav shows 菜单项 like 歌曲 (desktop + bottom variants)
        expect(screen.getAllByText(/歌曲/).length).toBeGreaterThan(0)
        // RightPanel shows example song from default playlist
        expect(screen.getByText(/Example Song/)).toBeTruthy()
    })

    it('renders player audio element when Player provided a src', () => {
        // render Player directly to isolate behavior
        const { container } = render(<Player audioSrc={'https://example.com/audio.mp3'} audioKey={1} />)
        const audio = container.querySelector('audio')
        expect(audio).not.toBeNull()
    })
})
