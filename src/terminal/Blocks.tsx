import { createContext, useContext, type CSSProperties, type MouseEvent } from 'react';
import { resolve, urlFor } from '@/fs/tree';
import type { Block, FsNode, Inline, Listing } from '@/fs/types';

export interface TtyApi {
  run: (line: string) => void;
  found: ReadonlySet<string>;
  zoom: (images: { src: string; alt: string }[], index: number) => void;
}

export const TtyContext = createContext<TtyApi>({ run: () => {}, found: new Set(), zoom: () => {} });

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const hrefFor = (node: FsNode) => `${BASE}${urlFor(node)}`;

/** A plain left click runs the command; anything else (new tab, copy link) is left to the browser. */
function plainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function PathLink({ node, children }: { node: FsNode; children: React.ReactNode }) {
  const { run } = useContext(TtyContext);
  return (
    <a
      className="tty-link"
      href={hrefFor(node)}
      onClick={(e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        run(`${node.kind === 'dir' ? 'cd' : 'cat'} ${node.path}`);
      }}
    >
      {children}
    </a>
  );
}

function Inl({ inl }: { inl: Inline[] }) {
  const { run } = useContext(TtyContext);
  return (
    <>
      {inl.map((part, i) => {
        switch (part.t) {
          case 'text':
            return part.text;
          case 'b':
            return <strong key={i} className="tty-b">{part.text}</strong>;
          case 'i':
            return <em key={i}>{part.text}</em>;
          case 'code':
            return <code key={i} className="tty-code">{part.text}</code>;
          case 'link':
            return (
              <a key={i} className="tty-link" data-ext href={part.href} target="_blank" rel="noopener noreferrer">
                {part.text}
              </a>
            );
          case 'path': {
            // Paths in copy are written from home. One that does not resolve is just code.
            const node = resolve('~', part.path);
            return node ? (
              <PathLink key={i} node={node}>{part.text}</PathLink>
            ) : (
              <code key={i} className="tty-code">{part.text}</code>
            );
          }
          case 'cmd':
            return (
              <button key={i} type="button" className="tty-link" onClick={() => run(part.cmd)}>
                {part.text}
              </button>
            );
        }
      })}
    </>
  );
}

function Entry({ entry }: { entry: Listing }) {
  const { found } = useContext(TtyContext);
  const node = resolve('~', entry.path);
  if (!node) return <>{entry.name}</>;
  return (
    <span data-read={!entry.dir && found.has(entry.path) ? '' : undefined}>
      <PathLink node={node}>{entry.name}</PathLink>
    </span>
  );
}

function BlockView({ block, style }: { block: Block; style: CSSProperties }) {
  const { zoom } = useContext(TtyContext);
  switch (block.k) {
    case 'h': {
      const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
      return <Tag className={`tty-h${block.level}`} style={style}>{block.text}</Tag>;
    }
    case 'p':
      return (
        <p className={block.dim ? 'tty-p tty-dim' : 'tty-p'} style={style}>
          <Inl inl={block.inl} />
        </p>
      );
    case 'list':
      return (
        <ul className="tty-list" data-ordered={block.ordered ? '' : undefined} style={style}>
          {block.items.map((item, i) => (
            <li key={i}><span><Inl inl={item} /></span></li>
          ))}
        </ul>
      );
    case 'kv':
      return (
        <dl className="tty-kv" style={style}>
          {block.rows.map((row, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <dt>{row.key}</dt>
              <dd><Inl inl={row.inl} /></dd>
            </div>
          ))}
        </dl>
      );
    case 'quote':
      return <blockquote className="tty-quote" style={style}><Inl inl={block.inl} /></blockquote>;
    case 'pre':
      return <pre className="tty-pre" style={style}>{block.text}</pre>;
    case 'rule':
      return <hr className="tty-rule" style={style} />;
    case 'err':
      return <p className="tty-err" style={style} role="alert">{block.text}</p>;
    case 'banner':
      return <p style={style}><span className="tty-banner">{block.text}</span></p>;
    case 'ls':
      return (
        <ul className="tty-ls" data-long={block.long ? '' : undefined} style={style}>
          {block.entries.map((entry) => (
            <li key={entry.path}>
              <Entry entry={entry} />
              {block.long && (
                <span className="tty-ls__note">
                  {entry.dir ? `${entry.count} items · ` : ''}{entry.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      );
    case 'tree':
      return (
        <ul className="tty-tree" style={style}>
          {block.rows.map((row) => (
            <li key={row.entry.path}>
              <span>{row.prefix}</span>
              <Entry entry={row.entry} />
            </li>
          ))}
        </ul>
      );
    case 'img':
      return (
        <div className="tty-plates" style={style}>
          {block.images.map((image, i) => (
            <button key={image.src} type="button" className="tty-plate" onClick={() => zoom(block.images, i)}>
              <img src={image.src} alt={image.alt} loading="lazy" decoding="async" width={800} height={500} />
            </button>
          ))}
        </div>
      );
    case 'video':
      return (
        <figure className="tty-video" style={style}>
          <video src={block.src} poster={block.poster} controls muted loop playsInline preload="none" />
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="tty-out">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  );
}
