import './index.css'
import { render } from 'preact'
import { App } from './App'
import { Agentation } from 'agentation'
import { fetchUrlToEntry, addEntry } from './state/library'

// URL param ingest: ?url= or ?text=
const params = new URLSearchParams(location.search)
const paramUrl = params.get('url')
const paramText = params.get('text')
if (paramUrl) {
  fetchUrlToEntry(paramUrl).catch(() => {})
  history.replaceState(null, '', location.pathname)
} else if (paramText) {
  addEntry({ content: paramText, isMarkdown: false })
  history.replaceState(null, '', location.pathname)
}

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
