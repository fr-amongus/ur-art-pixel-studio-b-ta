import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Eraser, PaintBucket, Pencil, Redo2, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const palette = ['#f7f3ff', '#17151e', '#b8b3c8', '#726b83', '#f04f74', '#ff7b54', '#ffc857', '#d6e84f', '#58d68d', '#42c6d6', '#5c8df6', '#a66cff']
const brushSizes = [1, 2, 4, 8]
const canvasPresets = [[2, 2], [32, 32], [64, 64], [128, 128], [256, 256]]
type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; size: number; erase: boolean }
type Fill = { x: number; y: number; color: string }
type Snapshot = { strokes: Stroke[]; fills: Fill[] }

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Ur Art · Pixel Studio' },
    { name: 'description', content: 'Un atelier pixel-art tactile pour créer, expérimenter et exporter vos petites œuvres.' },
  ] }),
  component: PixelStudio,
})

function PixelStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 128, height: 128 })
  const [color, setColor] = useState('#17151e')
  const [brush, setBrush] = useState(4)
  const [tool, setTool] = useState<'draw' | 'erase' | 'fill'>('draw')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [fills, setFills] = useState<Fill[]>([])
  const [history, setHistory] = useState<Snapshot[]>([])
  const [redo, setRedo] = useState<Snapshot[]>([])
  const [drawing, setDrawing] = useState(false)
  const [status, setStatus] = useState('Canvas ready')
  const currentStroke = useRef<Stroke | null>(null)

  const snapshot = useCallback((nextStrokes = strokes, nextFills = fills): Snapshot => ({
    strokes: nextStrokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })),
    fills: nextFills.map(fill => ({ ...fill })),
  }), [fills, strokes])

  const paint = useCallback((items: Stroke[], fillItems: Fill[] = fills) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f7f3ff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = false
    fillItems.forEach(fill => {
      context.fillStyle = fill.color
      context.fillRect(fill.x, fill.y, 1, 1)
    })
    items.forEach(stroke => {
      if (!stroke.points.length) return
      context.save()
      context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
      context.fillStyle = stroke.color
      const radius = Math.floor(stroke.size / 2)
      const stamp = (point: Point) => {
        const x = Math.floor(point.x) - radius
        const y = Math.floor(point.y) - radius
        context.fillRect(x, y, stroke.size, stroke.size)
      }
      for (let index = 0; index < stroke.points.length; index += 1) {
        const point = stroke.points[index]
        const previous = stroke.points[index - 1]
        if (!previous) {
          stamp(point)
          continue
        }
        const distance = Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y))
        const steps = Math.max(1, Math.ceil(distance))
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps
          stamp({
            x: previous.x + (point.x - previous.x) * progress,
            y: previous.y + (point.y - previous.y) * progress,
          })
        }
      }
      context.restore()
    })
  }, [fills])

  const floodFill = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const point = pointFromEvent(event)
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x)))
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y)))
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const start = (y * canvas.width + x) * 4
    const target = [image.data[start], image.data[start + 1], image.data[start + 2], image.data[start + 3]]
    const replacement = hexToRgba(color)
    const tolerance = 56
    const matches = (index: number) => (
      Math.abs(image.data[index] - target[0]) <= tolerance &&
      Math.abs(image.data[index + 1] - target[1]) <= tolerance &&
      Math.abs(image.data[index + 2] - target[2]) <= tolerance &&
      Math.abs(image.data[index + 3] - target[3]) <= tolerance
    )
    if (matches(start)) return
    const queue: Point[] = [{ x, y }]
    const visited = new Uint8Array(canvas.width * canvas.height)
    const nextFills = [...fills]
    while (queue.length) {
      const current = queue.pop() as Point
      if (current.x < 0 || current.x >= canvas.width || current.y < 0 || current.y >= canvas.height) continue
      const position = current.y * canvas.width + current.x
      const index = position * 4
      if (visited[position] || !matches(index)) continue
      visited[position] = 1
      nextFills.push({ x: current.x, y: current.y, color })
      queue.push({ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 })
    }
    setHistory(previous => [...previous, snapshot()])
    setFills(nextFills)
    setRedo([])
    setStatus('Area filled — closed outlines contain the paint')
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = size.width
    canvas.height = size.height
    paint(strokes)
  }, [paint, size, strokes])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (tool === 'fill') {
      floodFill(event)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    currentStroke.current = { points: [pointFromEvent(event)], color, size: Math.min(brush, canvasSize(canvasRef.current)), erase: tool === 'erase' }
    setHistory(previous => [...previous, snapshot()])
    setRedo([])
    setDrawing(true)
  }
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !currentStroke.current) return
    currentStroke.current.points.push(pointFromEvent(event))
    paint([...strokes, currentStroke.current], fills)
  }
  const finishDrawing = () => {
    if (!drawing || !currentStroke.current) return
    const completedStroke = currentStroke.current
    setStrokes(previous => [...previous, completedStroke])
    currentStroke.current = null
    setDrawing(false)
    setStatus(tool === 'erase' ? 'Mark erased' : 'Mark added')
  }
  const clearCanvas = () => {
    if (!strokes.length && !fills.length) return
    setHistory(previous => [...previous, snapshot()])
    setStrokes([])
    setFills([])
    setRedo([])
    setStatus('Canvas cleared')
  }
  const undo = () => {
    if (!history.length) return
    setRedo(previous => [...previous, snapshot()])
    const previous = history[history.length - 1]
    setStrokes(previous.strokes)
    setFills(previous.fills)
    setHistory(history.slice(0, -1))
  }
  const redoStroke = () => {
    if (!redo.length) return
    setHistory(previous => [...previous, snapshot()])
    const next = redo[redo.length - 1]
    setStrokes(next.strokes)
    setFills(next.fills)
    setRedo(redo.slice(0, -1))
  }
  const resizeCanvas = (width: number, height: number) => {
    const next = { width: Math.max(2, Math.min(4096, Math.round(width || 2))), height: Math.max(2, Math.min(4096, Math.round(height || 2))) }
    setSize(next); setStrokes([]); setFills([]); setHistory([]); setRedo([])
    setStatus(`Canvas resized to ${next.width} × ${next.height} px`)
  }

  function hexToRgba(hex: string): number[] {
    return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16), 255]
  }

  function canvasSize(canvas: HTMLCanvasElement | null): number {
    if (!canvas) return brush
    return Math.max(1, Math.min(canvas.width, canvas.height))
  }

  const exportImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a'); link.download = 'ur-art-pixel.png'; link.href = canvas.toDataURL('image/png'); link.click(); setStatus('ur-art-pixel.png downloaded')
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-7 sm:py-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary font-serif text-2xl font-bold text-primary-foreground shadow-[0_0_26px_color-mix(in_oklch,var(--primary)_35%,transparent)]">u</div><div><h1 className="font-serif text-xl font-bold leading-none">Ur Art</h1><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">pixel studio</p></div></div><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="size-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />{status}</div><Button onClick={exportImage} variant="outline" className="border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"><Download className="mr-2 size-4" />Save image</Button></div></header>
      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-7 sm:py-8 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
        <aside className="order-2 space-y-4 lg:order-1"><Panel title="Tools" code="01 / mark"><ToolButton active={tool === 'draw'} icon={<Pencil />} onClick={() => setTool('draw')} label="Draw" shortcut="B" /><ToolButton active={tool === 'erase'} icon={<Eraser />} onClick={() => setTool('erase')} label="Eraser" shortcut="E" /><ToolButton active={tool === 'fill'} icon={<PaintBucket />} onClick={() => setTool('fill')} label="Fill" shortcut="F" /></Panel><Panel title="Pixel size" code="02 / brush"><div className="grid grid-cols-4 gap-2">{brushSizes.map(item => <button key={item} onClick={() => setBrush(item)} className={`grid aspect-square place-items-center rounded-lg border transition hover:-translate-y-0.5 ${brush === item ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'}`}><span className="rounded-full bg-current" style={{ width: Math.max(5, item * 2), height: Math.max(5, item * 2) }} /></button>)}</div><div className="mt-3 flex justify-between font-mono text-[10px] uppercase text-muted-foreground"><span>1px</span><span>{brush}px</span><span>8px</span></div></Panel><Panel title="Canvas size" code="03 / dimensions"><div className="grid grid-cols-2 gap-2">{(['width', 'height'] as const).map(field => <label key={field} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{field}<input type="number" min="2" max="4096" value={size[field]} onChange={event => resizeCanvas(field === 'width' ? Number(event.target.value) : size.width, field === 'height' ? Number(event.target.value) : size.height)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-2 py-2 text-sm text-foreground outline-none focus:border-primary" /></label>)}</div><div className="mt-3 grid grid-cols-2 gap-2">{canvasPresets.map(([width, height]) => <button key={`${width}-${height}`} onClick={() => resizeCanvas(width, height)} className="rounded-lg border border-border bg-secondary px-1 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground">{width} × {height}</button>)}</div></Panel><Panel title="Actions" code="04 / history"><div className="grid grid-cols-2 gap-2"><Button onClick={undo} disabled={!history.length} variant="outline" className="bg-secondary text-muted-foreground"><Undo2 className="mr-1 size-4" />Undo</Button><Button onClick={redoStroke} disabled={!redo.length} variant="outline" className="bg-secondary text-muted-foreground"><Redo2 className="mr-1 size-4" />Redo</Button></div><Button onClick={clearCanvas} variant="outline" className="mt-2 w-full border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"><Trash2 className="mr-2 size-4" />Clear all</Button></Panel></aside>
        <section className="order-1 min-w-0 lg:order-2"><div className="rounded-2xl border border-border bg-card p-3 shadow-lg sm:p-4"><div className="canvas-frame relative aspect-[1.15/1] overflow-hidden rounded-xl border border-border/70"><span className="absolute left-3 top-3 z-10 rounded-full border border-border/60 bg-background/75 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">● untitled canvas</span><canvas ref={canvasRef} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} className="size-full cursor-crosshair touch-none [image-rendering:pixelated]" /></div><div className="flex justify-between gap-2 px-2 pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>{size.width} × {size.height} px</span><span>{tool === 'erase' ? 'erase' : tool} mode · {status}</span></div></div></section>
        <aside className="order-3 space-y-4"><Panel title="Palette" code="05 / color"><div className="grid grid-cols-6 gap-2">{palette.map(item => <button key={item} title={item} onClick={() => { setColor(item); setTool('draw') }} className={`aspect-square rounded-md border-2 transition hover:scale-110 ${color === item && tool === 'draw' ? 'border-foreground outline outline-2 outline-primary/60 outline-offset-2' : 'border-transparent'}`} style={{ backgroundColor: item }} />)}</div><div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-secondary p-2"><span className="size-8 rounded-md border border-border" style={{ backgroundColor: color }} /><div><p className="text-xs">Active color</p><p className="font-mono text-[10px] text-muted-foreground">{color.toUpperCase()}</p></div></div></Panel><Panel title="Export" code="06 / save"><Button onClick={exportImage} className="mt-1 w-full bg-primary text-primary-foreground hover:bg-primary/90"><Download className="mr-2 size-4" />Save PNG</Button></Panel><div className="rounded-2xl border border-primary/25 bg-primary/10 p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">small worlds, big mood</p><p className="mt-2 font-serif text-lg">Make something tiny that feels like yours.</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Draw with a mouse, finger, or stylus. Every mark stays pixel-sharp.</p></div></aside>
      </div>
    </main>
  )
}

function Panel({ title, code, children }: { title: string; code: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-border bg-card/90 p-4 shadow-md"><div className="mb-3 flex items-end justify-between gap-2"><h2 className="font-serif text-base font-bold">{title}</h2><span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{code}</span></div>{children}</section> }
function ToolButton({ active, icon, label, shortcut, onClick }: { active: boolean; icon: React.ReactNode; label: string; shortcut: string; onClick: () => void }) { return <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition hover:-translate-y-0.5 ${active ? 'border-primary/60 bg-primary/15 text-primary' : 'border-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-foreground'}`}><span className="size-4">{icon}</span>{label}<kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{shortcut}</kbd></button> }
