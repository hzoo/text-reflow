# text-reflow

`text-reflow` was started to test different ways of reading.

On desktop, it keeps one semantic sentence visually anchored while everything around it reflows.
On mobile, it treats the current sentence or paragraph like a poster and makes it as large as possible inside the viewport.

The underlying question is simple:

> What is to reading what a word processor is to writing?

## Lineage

This project is inspired by:

- Omar Rizwan's [`pretty-print`](https://omar.website/pretty-print/), which made code layout itself feel animatable.  
  Citation: [site](https://omar.website/pretty-print/), [tweet](https://x.com/rsnous/status/1367305117293178881?s=20)

- Eli's syntax exploder / "parsing processors" direction, especially the Doug Engelbart demo and the reading-tool question above.  
  Citation: [tweet](https://x.com/elzr/status/1372391789332725763), [Doug Engelbart, *Augmenting Human Intellect*](https://dougengelbart.org/content/view/138)

- Earlier experiments by myself on using syntax-preserving animation to explain code transforms, especially JSX lowering and Babel-style rewrites.  
  Citations: [JSX experiment](https://x.com/left_pad/status/1367941962083471361?s=20), [if-statement animation](https://x.com/left_pad/status/1372428053796769793?s=20)

## Intent

I want to treat prose as something that can be laid out, focused, navigated, and reshaped with more intention, not just as simply a block or word-wrap. A question: can we use space as part of the meaning of any reading, like we do with poetry?

## Run

```sh
bun install
bun run dev
```