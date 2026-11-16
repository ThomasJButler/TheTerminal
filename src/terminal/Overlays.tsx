import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ALL_NODES } from '@/fs/tree';
import { LINKS } from '@/content/site';

/* ─── PF3: the index. Search by name instead of walking the tree. ─── */

interface PaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  found: ReadonlySet<string>;
  run: (line: string) => void;
}

export function Palette({ open, onOpenChange, found, run }: PaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Hidden files only appear here once you have found them the proper way.
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_NODES.filter((n) => n.path !== '~' && (!n.hidden || found.has(n.path)))
      .filter((n) => !q || `${n.path} ${n.title} ${n.note}`.toLowerCase().includes(q))
      .slice(0, 60);
  }, [query, found]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (index: number) => {
    const node = items[index];
    if (!node) return;
    onOpenChange(false);
    run(`${node.kind === 'dir' ? 'cd' : 'cat'} ${node.path}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl top-[12vh] translate-y-0">
        <DialogHeader>
          <DialogTitle>FIND</DialogTitle>
          <DialogDescription>Search the machine by name. Enter opens the file.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          placeholder="sanctuary, fuelius, 2024…"
          aria-label="Search files"
          aria-controls="palette-list"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(active);
            }
          }}
        />
        <ul id="palette-list" role="listbox" aria-label="Files" className="palette-list" ref={listRef}>
          {items.map((node, i) => (
            <li key={node.path} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className="palette-item"
                onMouseMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span>{node.path.slice(2)}{node.kind === 'dir' ? '/' : ''}</span>
                <span>{node.note}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="tty-dim" style={{ padding: '0.3rem 1ch' }}>Nothing by that name. Try grep.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/* ─── mail ─── */

export function Mail({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (open) setState('idle');
  }, [open]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState('sending');
    try {
      const res = await fetch(LINKS.formEndpoint, {
        method: 'POST',
        body: new FormData(e.currentTarget),
        headers: { Accept: 'application/json' },
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>MAIL</DialogTitle>
          <DialogDescription>
            To {LINKS.email}. Tell me about the role, the idea, or just say hello.
          </DialogDescription>
        </DialogHeader>
        {state === 'sent' ? (
          <p role="status">Message sent. Thank you, I'll get back to you as soon as I can.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mail-name">Name</Label>
              <Input id="mail-name" name="name" autoComplete="name" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mail-email">Email</Label>
              <Input id="mail-email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mail-message">Message</Label>
              <Textarea id="mail-message" name="message" rows={5} required />
            </div>
            {state === 'error' && (
              <p role="alert" className="tty-err">
                That did not send. Email me directly at {LINKS.email} instead.
              </p>
            )}
            <Button type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'SENDING…' : 'SEND'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Plates at full size and full colour ─── */

export interface ZoomState {
  images: { src: string; alt: string }[];
  index: number;
}

export function Lightbox({ zoom, onChange }: { zoom: ZoomState | null; onChange: (z: ZoomState | null) => void }) {
  const image = zoom?.images[zoom.index];
  const step = (by: number) => {
    if (!zoom) return;
    const count = zoom.images.length;
    onChange({ ...zoom, index: (zoom.index + by + count) % count });
  };
  return (
    <Dialog open={Boolean(zoom)} onOpenChange={(open) => !open && onChange(null)}>
      <DialogContent
        className="sm:max-w-5xl"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        <DialogHeader>
          <DialogTitle>PLATE {zoom ? `${zoom.index + 1}/${zoom.images.length}` : ''}</DialogTitle>
          <DialogDescription>{image?.alt}</DialogDescription>
        </DialogHeader>
        {image && (
          <img
            src={image.src.replace(/w_800/, 'w_1600')}
            alt={image.alt}
            className="max-h-[70vh] w-full object-contain"
          />
        )}
        {zoom && zoom.images.length > 1 && (
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => step(-1)}>← PREV</Button>
            <Button variant="outline" onClick={() => step(1)}>NEXT →</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
