import { createContext, useContext, type CSSProperties, type MouseEvent } from 'react';
import { FORTUNES } from '@/content/site';
import { resolve, urlFor } from '@/fs/tree';
import type { Block, FsNode, Inline, Listing } from '@/fs/types';
import type { Program } from './types';

export interface TtyApi {
  /** Run a line, in the given program or in whichever one has the prompt. */
  run: (line: string, opts?: { program?: Program }) => void;
  found: ReadonlySet<string>;
  zoom: (images: { src: string; alt: string }[], index: number) => void;
  /** The entry holding the menu that answers to the arrow keys, if there is one. */
  liveMenu: number | null;
  menuAt: number;
  setMenuAt: (index: number) => void;
  /** What this browser remembers about its visits. null until the page has hydrated. */
  caller: { calls: number; have: number; total: number; motd: string } | null;
}

export const TtyContext = createContext<TtyApi>({
  run: () => {}, found: new Set(), zoom: () => {}, liveMenu: null, menuAt: 0, setMenuAt: () => {}, caller: null,
});

/** Which entry these blocks belong to: its id, and the program its links should run in. */
export const EntryContext = createContext<{ id: number; links: Program }>({ id: -1, links: 'shell' });

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const hrefFor = (node: FsNode) => `${BASE}${urlFor(node)}`;
export const hrefTo = (url: string) => `${BASE}${url}`;

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
        // A file is the shell's to open, whichever program printed the link.
        run(`${node.kind === 'dir' ? 'cd' : 'cat'} ${node.path}`, { program: 'shell' });
      }}
    >
      {children}
    </a>
  );
}

function Inl({ inl }: { inl: Inline[] }) {
  const { run } = useContext(TtyContext);
  const { links } = useContext(EntryContext);
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
              <button key={i} type="button" className="tty-link" onClick={() => run(part.cmd, { program: links })}>
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

function Menu({ block, style }: { block: Extract<Block, { k: 'menu' }>; style: CSSProperties }) {
  const { run, liveMenu, menuAt, setMenuAt } = useContext(TtyContext);
  const { id } = useContext(EntryContext);
  const live = liveMenu === id;
  return (
    <ol className="tty-menu" style={style} aria-label="Main menu">
      {block.items.map((item, i) => {
        const row = (
          <>
            <span className="tty-menu__key">{item.key}</span>
            <span className="tty-menu__name">{item.name}</span>
            <span className="tty-menu__note">{item.note}</span>
          </>
        );
        const choose = (e: MouseEvent) => {
          if (item.href && !plainClick(e)) return;
          e.preventDefault();
          run(item.key, { program: 'menu' });
        };
        return (
          <li key={item.key} data-active={live && i === menuAt ? '' : undefined} onMouseEnter={() => live && setMenuAt(i)}>
            {item.href ? (
              <a href={hrefTo(item.href)} onClick={choose}>{row}</a>
            ) : (
              <button type="button" onClick={choose}>{row}</button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The line under the menu: a thing Tom said, and how often this browser has been here. */
function Caller({ style }: { style: CSSProperties }) {
  const { caller } = useContext(TtyContext);
  return (
    <p className="tty-caller" style={style}>
      <span>"{caller?.motd ?? FORTUNES[0]}"</span>
      {caller && (
        <span>
          CALL {caller.calls} FROM THIS BROWSER · {caller.have} OF {caller.total} FILES READ
        </span>
      )}
    </p>
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
    case 'trace':
      return (
        <dl className="tty-trace" style={style} aria-label="How this was worked out">
          {block.rows.map((row, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <dt>{row.key}</dt>
              <dd>{row.text}</dd>
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
    case 'menu':
      return <Menu block={block} style={style} />;
    case 'caller':
      return <Caller style={style} />;
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
