// XHTML of the Publications Office (EUR-Lex consolidated texts, Official Journal acts, Commission proposals) →
// one line per block element. Generic: no knowledge of any act. Consolidation markers (►M1 … ◄, ▼B) are removed
// (DECISIONS D3); everything else is the text as published.
import { type DefaultTreeAdapterMap, parse } from "parse5";

type Node = DefaultTreeAdapterMap["node"];

/** Elements that start and end a line. */
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "br",
  "caption",
  "center",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** Elements whose content is not document text. */
const SKIP = new Set(["head", "script", "style", "noscript", "template", "title"]);

/** ►M1 / ►B / ►C2 / ▼M3 / ▼B markers (with the spaces after them) and the closing ◄ (with the spaces before it). */
const OPEN_MARKER = /[►▼]\s*(?:B|[ACMR]\d+)\b\s*/gu;
const CLOSE_MARKER = /\s*◄(?:\s+(?=[.,;:)\]’”]))?/gu;

/** One line: markers removed, whitespace runs collapsed, trimmed. */
export function cleanLine(text: string): string {
  return text.replace(OPEN_MARKER, " ").replace(CLOSE_MARKER, "").replace(/\s+/gu, " ").trim();
}

/** The text lines of an XHTML/HTML document, in document order, empty lines dropped. */
export function htmlToLines(html: string): string[] {
  const lines: string[] = [];
  let buffer = "";
  const flush = () => {
    const line = cleanLine(buffer);
    if (line !== "") lines.push(line);
    buffer = "";
  };
  const walk = (node: Node) => {
    if (node.nodeName === "#text") {
      buffer += (node as DefaultTreeAdapterMap["textNode"]).value;
      return;
    }
    if (node.nodeName === "#comment" || node.nodeName === "#documentType" || SKIP.has(node.nodeName)) return;
    const block = BLOCK.has(node.nodeName);
    if (block) flush();
    if ("childNodes" in node) for (const child of node.childNodes) walk(child);
    if (block) flush();
  };
  walk(parse(html));
  flush();
  return lines;
}
