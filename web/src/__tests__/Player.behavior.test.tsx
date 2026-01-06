import React from 'react'
import { render, screen, act } from '@testing-library/react'
import Player from '../components/Player'

describe('Player behavior', () => {
    beforeAll(() => {
        // mock media methods
        // @ts-ignore
        HTMLMediaElement.prototype.play = function () { return Promise.resolve() }
        // @ts-ignore
        HTMLMediaElement.prototype.load = function () { }
        // @ts-ignore
        HTMLMediaElement.prototype.pause = function () { }
    })

    it('calls onPlayStateChange when play and pause happen', async () => {
        const onPlayStateChange = vi.fn()
        const { container } = render(<Player audioSrc={'https://example.com/audio.mp3'} audioKey={1} onPlayStateChange={onPlayStateChange} />)

        // allow effects to run
        await act(async () => { await Promise.resolve() })

        const audio = container.querySelector('audio') as HTMLAudioElement
        // simulate play event
        act(() => {
            audio.dispatchEvent(new Event('play'))
        })
        expect(onPlayStateChange).toHaveBeenCalledWith(true)

        // simulate pause event
        act(() => {
            audio.dispatchEvent(new Event('pause'))
        })
        expect(onPlayStateChange).toHaveBeenCalledWith(false)
    })

    it('calls onEnded when ended fires', async () => {
        const onEnded = vi.fn()
        const { container } = render(<Player audioSrc={'https://example.com/audio.mp3'} audioKey={2} onEnded={onEnded} />)
        const audio = container.querySelector('audio') as HTMLAudioElement
        // simulate ended
        act(() => {
            audio.dispatchEvent(new Event('ended'))
        })
        expect(onEnded).toHaveBeenCalled()
    })
})
