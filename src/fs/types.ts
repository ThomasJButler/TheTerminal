/**
 * The content model. Everything the terminal prints is a list of Blocks, and every file in
 * the virtual filesystem is a function that returns one. Blocks are plain data, so the same
 * file renders in the browser, in the prerender, and as searchable text for `grep`.
 */

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'b'; text: string }
  | { t: 'i'; text: string }
  | { t: 'code'; text: string }
  /** An external link. */
  | { t: 'link'; href: string; text: string }
  /** A path on this machine. Activating it opens the file or directory. */
  | { t: 'path'; path: string; text: string }
  /** A command. Activating it runs it, as if typed. */
  | { t: 'cmd'; cmd: string; text: string };

export interface Listing {
  name: string;
  path: string;
  dir: boolean;
  hidden: boolean;
  note: string;
  /** Number of entries, for directories. */
  count?: number;
}

export type Block =
  /** Double-height line, the VT100's DECDHL. level 1 is the file title. */
  | { k: 'h'; level: 1 | 2 | 3; text: string }
  | { k: 'p'; inl: Inline[]; dim?: boolean }
  | { k: 'list'; items: Inline[][]; ordered?: boolean }
  | { k: 'kv'; rows: { key: string; inl: Inline[] }[] }
  | { k: 'quote'; inl: Inline[] }
  | { k: 'pre'; text: string }
  | { k: 'rule' }
  | { k: 'img'; images: { src: string; alt: string }[] }
  | { k: 'video'; src: string; poster?: string; caption: string }
  | { k: 'ls'; entries: Listing[]; long: boolean }
  | { k: 'tree'; rows: { prefix: string; entry: Listing }[] }
  | { k: 'err'; text: string }
  /** A status line in reverse video. */
  | { k: 'banner'; text: string };

interface NodeBase {
  name: string;
  /** Absolute, rooted at '~'. '~/projects/sanctuary.md'. */
  path: string;
  /** Human title, used for the page <title> and the command palette. */
  title: string;
  /** One line, shown by `ls -l` and used as the meta description. */
  note: string;
  hidden: boolean;
}

export interface FileNode extends NodeBase {
  kind: 'file';
  blocks: () => Block[];
}

export interface DirNode extends NodeBase {
  kind: 'dir';
  children: FsNode[];
}

export type FsNode = FileNode | DirNode;
