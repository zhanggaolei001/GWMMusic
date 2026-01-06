import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../App'

describe('App integration', () => {
    beforeAll(() => {
        // jsdom media mocks
        // @ts-ignore
        HTMLMediaElement.prototype.play = function () { return Promise.resolve() }
        // @ts-ignore
        HTMLMediaElement.prototype.load = function () { }
        // @ts-ignore
        HTMLMediaElement.prototype.pause = function () { }
    })

    it('clicking playlist item starts playback (audio element present)', async () => {
        const { container } = render(<App />)
        const items = screen.getAllByText(/Example Song/)
        expect(items.length).toBeGreaterThan(0)
        fireEvent.click(items[0])
        const audio = await container.querySelector('audio')
        expect(audio).not.toBeNull()
    })
})
