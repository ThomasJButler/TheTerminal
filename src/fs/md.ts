import { marked, type Token, type Tokens } from 'marked';
import type { Block, Inline } from './types';

/**
 * Markdown to Blocks, via marked's lexer. Nothing here produces HTML: the terminal renders
 * Blocks itself, so there is no dangerouslySetInnerHTML anywhere in the app.
 */

function inlineTokens(tokens: Token[] | undefined, out: Inline[] = []): Inline[] {
  for (const tok of tokens ?? []) {
    switch (tok.type) {
      case 'strong':
        out.push({ t: 'b', text: plain((tok as Tokens.Strong).tokens) });
        break;
      case 'em':
        out.push({ t: 'i', text: plain((tok as Tokens.Em).tokens) });
        break;
      case 'codespan': {
        const text = unescape((tok as Tokens.Codespan).text);
        // A codespan that looks like a path on this machine becomes a live link to it.
        if (/^[\w.~-]+\/[\w./-]*$|^[\w-]+\.(txt|md|log)$/.test(text)) {
          out.push({ t: 'path', path: text, text });
        } else {
          out.push({ t: 'code', text });
        }
        break;
      }
      case 'link': {
        const link = tok as Tokens.Link;
        const text = plain(link.tokens) || link.href;
        if (link.href.startsWith('cmd:')) out.push({ t: 'cmd', cmd: link.href.slice(4), text });
        else if (link.href.startsWith('~')) out.push({ t: 'path', path: link.href, text });
        else out.push({ t: 'link', href: link.href, text });
        break;
      }
      case 'br':
        out.push({ t: 'text', text: ' ' });
        break;
      default:
        if ('tokens' in tok && tok.tokens) inlineTokens(tok.tokens, out);
        else if ('text' in tok) out.push({ t: 'text', text: unescape(String(tok.text)) });
    }
  }
  return out;
}

function plain(tokens: Token[] | undefined): string {
  return inlineTokens(tokens).map((i) => i.text).join('');
}

function unescape(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** One line of inline markdown to Inline[]. `**bold**`, `` `code` ``, `[text](href)`. */
export function inl(src: string): Inline[] {
  return inlineTokens(marked.Lexer.lexInline(src));
}

export function p(src: string, dim = false): Block {
  return dim ? { k: 'p', inl: inl(src), dim } : { k: 'p', inl: inl(src) };
}

export function mdBlocks(src: string): Block[] {
  const out: Block[] = [];
  for (const tok of marked.lexer(src)) {
    switch (tok.type) {
      case 'heading': {
        const h = tok as Tokens.Heading;
        out.push({ k: 'h', level: h.depth <= 2 ? 2 : 3, text: plain(h.tokens) });
        break;
      }
      case 'paragraph':
        out.push({ k: 'p', inl: inlineTokens((tok as Tokens.Paragraph).tokens) });
        break;
      case 'list': {
        const list = tok as Tokens.List;
        out.push({
          k: 'list',
          ordered: list.ordered,
          items: list.items.map((item) => inlineTokens(item.tokens)),
        });
        break;
      }
      case 'blockquote':
        out.push({ k: 'quote', inl: inlineTokens((tok as Tokens.Blockquote).tokens) });
        break;
      case 'code':
        out.push({ k: 'pre', text: (tok as Tokens.Code).text });
        break;
      case 'table': {
        const table = tok as Tokens.Table;
        const head = table.header.map((c) => c.text);
        for (const row of table.rows) {
          out.push({
            k: 'kv',
            rows: row.slice(1).map((cell, i) => ({
              key: `${row[0].text} · ${head[i + 1] ?? ''}`,
              inl: inlineTokens(cell.tokens),
            })),
          });
        }
        break;
      }
      case 'hr':
        out.push({ k: 'rule' });
        break;
      case 'space':
        break;
      default:
        if ('text' in tok && tok.text) out.push({ k: 'p', inl: [{ t: 'text', text: String(tok.text) }] });
    }
  }
  return out;
}

/** Flatten blocks to searchable lines, for `grep` and for the prerender's text floor. */
export function blockLines(blocks: Block[]): string[] {
  const lines: string[] = [];
  const text = (i: Inline[]) => i.map((x) => x.text).join('');
  for (const b of blocks) {
    switch (b.k) {
      case 'h':
      case 'err':
      case 'banner':
        lines.push(b.text);
        break;
      case 'p':
      case 'quote':
        lines.push(text(b.inl));
        break;
      case 'list':
        for (const item of b.items) lines.push(text(item));
        break;
      case 'kv':
        for (const row of b.rows) lines.push(`${row.key}: ${text(row.inl)}`);
        break;
      case 'pre':
        lines.push(...b.text.split('\n'));
        break;
      case 'video':
        lines.push(b.caption);
        break;
      case 'img':
        for (const image of b.images) lines.push(image.alt);
        break;
      case 'ls':
        for (const e of b.entries) lines.push(`${e.name} ${e.note}`);
        break;
      case 'tree':
        for (const r of b.rows) lines.push(`${r.prefix}${r.entry.name}`);
        break;
      case 'rule':
        break;
    }
  }
  return lines.filter(Boolean);
}
