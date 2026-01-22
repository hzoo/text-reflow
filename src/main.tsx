import './index.css'
import { render } from 'preact'
import { App } from './App'
import { Agentation } from 'agentation'

const root = document.querySelector<HTMLDivElement>('#app')!

// Create canvas outside Preact tree to prevent unmounting
const canvas = document.createElement('canvas')
canvas.id = 'canv'
root.appendChild(canvas)

// Create UI container for Preact
const uiContainer = document.createElement('div')
uiContainer.id = 'ui'
root.appendChild(uiContainer)

// Render Preact UI overlay
render(
  <>
    <App canvas={canvas} />
    {import.meta.env.DEV && <Agentation />}
  </>,
  uiContainer
)
