import React from 'react'
import { render } from '@testing-library/react'
import Player from '../components/Player'

describe('Player', () => {
  beforeAll(() => {
    // jsdom doesn't implement HTMLMediaElement.play/load — provide no-op mocks
    // @ts-ignore
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve()
    }
    // @ts-ignore
    HTMLMediaElement.prototype.load = function () {
      // no-op
    }
  })

  it('renders audio element when src provided', () => {
    const { container } = render(<Player audioSrc={'https://example.com/audio.mp3'} audioKey={1} />)
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
  })
})
