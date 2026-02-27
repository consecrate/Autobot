import { CSS_CLASSES, DOM_IDS, MATHJAX } from "./constants";
import type { LabelFormat } from "./constants";
import { MathMLToLaTeX } from "mathml-to-latex";

interface MathSource {
  value: string;
}

export interface ExtractOptions {
  labelFormat?: LabelFormat;
}

export interface ExtractResult {
  content: string;
  images: Array<{
    placeholder: string;
    src: string;
  }>;
  unresolvedMathCount: number;
}

interface WalkConfig {
  blockMathFormat: "simple" | "newlines";
  handleLists: boolean;
  handleBlockElements: boolean;
  choicesConfig?: { labelFormat: LabelFormat };
  skipChoicesTable: boolean;
}

interface DividerStyleContext {
  includeTableLayout?: boolean;
  includeDimensions?: boolean;
}

const CELL_CONFIG: WalkConfig = {
  blockMathFormat: "simple",
  handleLists: false,
  handleBlockElements: false,
  skipChoicesTable: false,
};

const LIST_ITEM_CONFIG: WalkConfig = {
  blockMathFormat: "simple",
  handleLists: true,
  handleBlockElements: false,
  skipChoicesTable: false,
};

function convertMathMLToTex(mathml: string): string | null {
  try {
    const tex = MathMLToLaTeX.convert(mathml.trim())?.trim();
    return tex && tex.length > 0 ? tex : null;
  } catch (error) {
    console.warn("[Autobot] Failed to convert MathML to LaTeX", error);
    return null;
  }
}

function getTexSource(container: HTMLElement): MathSource | null {
  if (container.classList.contains(MATHJAX.mjpage)) {
    const mjxChildTex = container.querySelector<HTMLElement>(
      `${MATHJAX.mjxContainer}[data-tex]`,
    );
    if (mjxChildTex) {
      const tex = mjxChildTex.getAttribute("data-tex");
      if (tex) return { value: tex };
    }
    const mjxChildMathML = container.querySelector<HTMLElement>(
      `${MATHJAX.mjxContainer}[data-mathml]`,
    );
    if (mjxChildMathML) {
      const mathml = mjxChildMathML.getAttribute("data-mathml");
      if (mathml) {
        const tex = convertMathMLToTex(mathml);
        if (tex) return { value: tex };
      }
    }
  }

  const dataTex = container.getAttribute("data-tex");
  if (dataTex) return { value: dataTex };

  const dataMathML = container.getAttribute("data-mathml");
  if (dataMathML) {
    const tex = convertMathMLToTex(dataMathML);
    if (tex) return { value: tex };
  }

  const assistiveMath = container.querySelector("mjx-assistive-mml > math");
  if (assistiveMath?.outerHTML) {
    const tex = convertMathMLToTex(assistiveMath.outerHTML);
    if (tex) return { value: tex };
  }

  const prevSibling = container.previousElementSibling;
  if (
    prevSibling?.matches(
      'script[type="math/tex"], script[type="math/tex; mode=display"]',
    )
  ) {
    const tex = prevSibling.textContent;
    if (tex) return { value: tex };
  }

  return null;
}

function extractSelectListContent(
  selectList: HTMLElement,
  mathCountRef: { value: number },
  unresolvedMathRef: { value: number },
): string {
  const optionEls =
    selectList.querySelectorAll(".selectListOptions .selectListOption").length > 0
      ? selectList.querySelectorAll(".selectListOptions .selectListOption")
      : selectList.querySelectorAll(".selectListOption");
  const optionTexts: string[] = [];

  for (const opt of optionEls) {
    const optParts: string[] = [];
    for (const child of opt.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent?.trim();
        if (text) optParts.push(text);
      } else if (child instanceof HTMLElement) {
        const isMath =
          child.tagName.toLowerCase() === MATHJAX.mjxContainer ||
          child.classList.contains(MATHJAX.mjpage);
        if (isMath) {
          const source = getTexSource(child);
          if (source) {
            mathCountRef.value++;
            optParts.push(`\\(${source.value}\\)`);
          } else {
            unresolvedMathRef.value++;
          }
        } else {
          optParts.push(child.textContent?.trim() || "");
        }
      }
    }
    const optText = optParts.join("").trim();
    if (optText) optionTexts.push(optText);
  }

  if (optionTexts.length === 0) {
    return "_________";
  }

  const allShort = optionTexts.every((opt) => opt.length < 5);
  if (allShort) {
    return optionTexts.join("/");
  }
  return `_________ (${optionTexts.join(" / ")})`;
}

function extractMjxChar(node: HTMLElement): string {
  if (node.tagName === "MJX-C") {
    const content = window.getComputedStyle(node, "::before").content;
    if (content && content !== "none" && content !== "normal") {
      return content.replace(/^["']|["']$/g, "");
    }
  }

  return (node.textContent || "").replace(/\s+/g, "").trim();
}

function extractMjxTex(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").replace(/\s+/g, "").trim();
  }

  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "MJX-ASSISTIVE-MML") return "";
  if (node.classList.contains("selectList")) {
    return "";
  }

  const directDataTex = node.getAttribute("data-tex");
  if (directDataTex && !node.querySelector(".selectList")) {
    return directDataTex;
  }

  if (node.tagName === "MJX-MSUP") {
    const base = node.children[0];
    const script = node.children[1];
    const baseTex = base ? extractMjxTex(base) : "";
    const scriptTex = script ? extractMjxTex(script) : "";
    if (baseTex && scriptTex) return `${baseTex}^{${scriptTex}}`;
    return baseTex || scriptTex;
  }

  if (node.tagName === "MJX-MSUB") {
    const base = node.children[0];
    const script = node.children[1];
    const baseTex = base ? extractMjxTex(base) : "";
    const scriptTex = script ? extractMjxTex(script) : "";
    if (baseTex && scriptTex) return `${baseTex}_{${scriptTex}}`;
    return baseTex || scriptTex;
  }

  if (node.tagName === "MJX-MFRAC") {
    const num =
      node.querySelector<HTMLElement>(":scope > mjx-frac > mjx-num") ||
      node.querySelector<HTMLElement>("mjx-num");
    const den =
      node.querySelector<HTMLElement>(":scope > mjx-frac > mjx-den") ||
      node.querySelector<HTMLElement>("mjx-den");

    const numTex = num ? extractMjxTex(num) : "";
    const denTex = den ? extractMjxTex(den) : "";

    if (numTex && denTex) {
      return `\\frac{${numTex}}{${denTex}}`;
    }

    return numTex || denTex;
  }

  if (node.tagName === "MJX-C") {
    return extractMjxChar(node);
  }

  let combined = "";
  for (const child of Array.from(node.childNodes)) {
    combined += extractMjxTex(child);
  }
  return combined;
}

function extractInteractiveMathJaxContent(
  node: HTMLElement,
  parts: string[],
  images: ExtractResult["images"],
  mathCountRef: { value: number },
  unresolvedMathRef: { value: number },
  config: WalkConfig,
): boolean {
  const renderInteractiveMathNode = (mathNode: Node): string => {
    if (mathNode.nodeType === Node.TEXT_NODE) {
      return (mathNode.textContent || "").trim();
    }

    if (!(mathNode instanceof HTMLElement)) return "";
    if (mathNode.tagName === "MJX-ASSISTIVE-MML") return "";

    if (mathNode.classList.contains("selectList")) {
      return extractSelectListContent(mathNode, mathCountRef, unresolvedMathRef);
    }

    if (mathNode.tagName === "MJX-MFRAC") {
      const numerator =
        mathNode.querySelector<HTMLElement>(":scope > mjx-frac > mjx-num") ||
        mathNode.querySelector<HTMLElement>("mjx-num");
      const denominator =
        mathNode.querySelector<HTMLElement>(":scope > mjx-frac > mjx-den") ||
        mathNode.querySelector<HTMLElement>("mjx-den");

      const numHtml = numerator
        ? Array.from(numerator.childNodes)
            .map((child) => renderInteractiveMathNode(child))
            .join(" ")
            .trim()
        : "";
      const denHtml = denominator
        ? Array.from(denominator.childNodes)
            .map((child) => renderInteractiveMathNode(child))
            .join(" ")
            .trim()
        : "";

      return `<table style="display:inline-table;vertical-align:middle;border-collapse:collapse;margin:0 0.12em;"><tr><td style="text-align:center;border-bottom:1px solid currentColor;padding:0 0.2em;">${numHtml || "&nbsp;"}</td></tr><tr><td style="text-align:center;padding:0 0.2em;">${denHtml || "&nbsp;"}</td></tr></table>`;
    }

    if (mathNode.querySelector(".selectList")) {
      return Array.from(mathNode.childNodes)
        .map((child) => renderInteractiveMathNode(child))
        .filter((chunk) => chunk.length > 0)
        .join(" ")
        .trim();
    }

    const tex = extractMjxTex(mathNode);
    if (tex) {
      mathCountRef.value++;
      return `\\(${tex}\\)`;
    }

    return Array.from(mathNode.childNodes)
      .map((child) => renderInteractiveMathNode(child))
      .filter((chunk) => chunk.length > 0)
      .join(" ")
      .trim();
  };

  const mathRoot =
    node.querySelector<HTMLElement>(":scope > mjx-math") ||
    node.querySelector<HTMLElement>("mjx-math");

  if (!mathRoot) return false;

  const mtable =
    mathRoot.querySelector<HTMLElement>(":scope > mjx-mtable") ||
    mathRoot.querySelector<HTMLElement>("mjx-mtable");

  if (mtable) {
    const mtrNodes =
      Array.from(
        mtable.querySelectorAll<HTMLElement>(
          ":scope > mjx-table > mjx-itable > mjx-mtr",
        ),
      ) ||
      [];

    const topLevelRows =
      mtrNodes.length > 0
        ? mtrNodes
        : Array.from(mtable.querySelectorAll<HTMLElement>(":scope > mjx-mtr"));

    if (topLevelRows.length > 0) {
      let html =
        '<table style="display:inline-table;border-collapse:collapse;vertical-align:middle;">';

      for (const mtr of topLevelRows) {
        html += "<tr>";
        const mtdNodes = Array.from(
          mtr.querySelectorAll<HTMLElement>(":scope > mjx-mtd"),
        );

        for (const mtd of mtdNodes) {
          const cellStyle = mtd.getAttribute("style") || "";
          const cellHtml = Array.from(mtd.childNodes)
            .map((child) => renderInteractiveMathNode(child))
            .filter((chunk) => chunk.length > 0)
            .join(" ")
            .trim();

          html += `<td${styleAttr(cellStyle)}>${cellHtml}</td>`;
        }

        html += "</tr>";
      }

      html += "</table>";
      parts.push(html);
      return true;
    }
  }

  let inlineTex = "";
  const flushInlineTex = () => {
    const trimmed = inlineTex.trim();
    if (!trimmed) return;
    mathCountRef.value++;
    parts.push(`\\(${trimmed}\\)`);
    inlineTex = "";
  };

  for (const child of Array.from(mathRoot.childNodes)) {
    if (
      child instanceof HTMLElement &&
      (child.classList.contains("selectList") ||
        child.querySelector(".selectList"))
    ) {
      flushInlineTex();
      walkNodes(child, parts, images, mathCountRef, unresolvedMathRef, config);
      continue;
    }

    const tex = extractMjxTex(child);
    if (tex) inlineTex += tex;
  }

  flushInlineTex();
  return true;
}

function extractCellContent(
  cell: HTMLElement,
  images: ExtractResult["images"],
  mathCountRef: { value: number },
  unresolvedMathRef: { value: number },
): string {
  const parts: string[] = [];
  walkNodes(cell, parts, images, mathCountRef, unresolvedMathRef, CELL_CONFIG);
  return parts.join(" ").trim();
}

function collectBorderStyles(style: CSSStyleDeclaration): string[] {
  const declarations: string[] = [];
  const borderParts = ["top", "right", "bottom", "left"] as const;

  for (const part of borderParts) {
    const width = style.getPropertyValue(`border-${part}-width`)?.trim();
    const borderStyle = style.getPropertyValue(`border-${part}-style`)?.trim();
    const color = style.getPropertyValue(`border-${part}-color`)?.trim();

    const hasVisibleBorder =
      !!width &&
      width !== "0px" &&
      !!borderStyle &&
      borderStyle !== "none" &&
      borderStyle !== "hidden";

    if (!hasVisibleBorder) continue;

    declarations.push(`border-${part}-width:${width}`);
    declarations.push(`border-${part}-style:${borderStyle}`);
    if (color) declarations.push(`border-${part}-color:${color}`);
  }

  return declarations;
}

function mergeStyleDeclarations(
  currentStyle: string,
  declarations: string[],
): string {
  const normalizedCurrent = currentStyle.trim().replace(/;\s*$/, "");
  const merged = [normalizedCurrent, ...declarations]
    .filter((entry) => entry && entry.length > 0)
    .join(";");
  return merged.length > 0 ? `${merged};` : "";
}

function getDividerStyle(
  element: HTMLElement,
  context: DividerStyleContext = {},
): string {
  const currentStyle = element.getAttribute("style") || "";
  const computed = window.getComputedStyle(element);
  const declarations: string[] = [];

  declarations.push(...collectBorderStyles(computed));

  if (context.includeTableLayout) {
    const borderCollapse = computed.getPropertyValue("border-collapse")?.trim();
    const borderSpacing = computed.getPropertyValue("border-spacing")?.trim();
    if (borderCollapse && borderCollapse !== "separate") {
      declarations.push(`border-collapse:${borderCollapse}`);
    }
    if (borderSpacing && borderSpacing !== "0px") {
      declarations.push(`border-spacing:${borderSpacing}`);
    }
  }

  if (context.includeDimensions) {
    const height = computed.getPropertyValue("height")?.trim();
    const width = computed.getPropertyValue("width")?.trim();
    if (height && height !== "0px" && height !== "auto") {
      declarations.push(`height:${height}`);
    }
    if (width && width !== "auto") {
      declarations.push(`width:${width}`);
    }
  }

  return mergeStyleDeclarations(currentStyle, declarations);
}

function styleAttr(style: string): string {
  return style ? ` style="${style}"` : "";
}

function hasLineStyle(style: string): boolean {
  return /border-(top|bottom)-style:/.test(style);
}

function buildTableAttrs(table: HTMLElement): string {
  const style = getDividerStyle(table, { includeTableLayout: true });
  let attrs = "";

  attrs += styleAttr(style);

  for (const name of [
    "rules",
    "cellpadding",
    "cellspacing",
    "border",
    "align",
  ]) {
    const val = table.getAttribute(name);
    if (val) attrs += ` ${name}="${val}"`;
  }
  return attrs;
}

function buildCellAttrs(cell: Element): string {
  const style =
    cell instanceof HTMLElement
      ? getDividerStyle(cell)
      : cell.getAttribute("style") || "";
  let attrs = "";

  attrs += styleAttr(style);

  for (const name of ["colspan", "rowspan", "align", "valign"]) {
    const val = cell.getAttribute(name);
    if (val) attrs += ` ${name}="${val}"`;
  }
  return attrs;
}

function buildRowAttrs(row: HTMLElement): string {
  return styleAttr(getDividerStyle(row));
}

function isMathJaxBlock(node: HTMLElement): boolean {
  const displayAttr = node.getAttribute("display");
  return (
    displayAttr === "block" ||
    displayAttr === "true" ||
    node.classList.contains(MATHJAX.mjpageBlock)
  );
}

function processTable(
  table: HTMLElement,
  images: ExtractResult["images"],
  mathCountRef: { value: number },
  unresolvedMathRef: { value: number },
): string {
  let html = `<table${buildTableAttrs(table)}>`;

  const rows = table.querySelectorAll(
    ":scope > tbody > tr, :scope > thead > tr, :scope > tr",
  );
  for (const row of Array.from(rows)) {
    html += `<tr${buildRowAttrs(row as HTMLElement)}>`;
    const cells = row.querySelectorAll(":scope > td, :scope > th");
    for (const cell of Array.from(cells)) {
      const tag = cell.tagName.toLowerCase();
      const cellContent = extractCellContent(
        cell as HTMLElement,
        images,
        mathCountRef,
        unresolvedMathRef,
      );
      html += `<${tag}${buildCellAttrs(cell)}>${cellContent}</${tag}>`;
    }
    html += "</tr>";
  }

  html += "</table>";
  return html;
}

function extractListItemContent(
  item: HTMLElement,
  images: ExtractResult["images"],
  mathCountRef: { value: number },
  unresolvedMathRef: { value: number },
): string {
  const parts: string[] = [];
  walkNodes(
    item,
    parts,
    images,
    mathCountRef,
    unresolvedMathRef,
    LIST_ITEM_CONFIG,
  );
  return parts.join(" ").trim();
}

function processList(
  list: HTMLElement,
  images: ExtractResult["images"],
  mathCountRef: { value: number },
  unresolvedMathRef: { value: number },
): string {
  const tag = list.tagName.toLowerCase();
  let html = `<${tag}>`;

  const items = list.querySelectorAll(":scope > li");
  for (const item of Array.from(items)) {
    const itemContent = extractListItemContent(
      item as HTMLElement,
      images,
      mathCountRef,
      unresolvedMathRef,
    );
    html += `<li>${itemContent}</li>`;
  }

  html += `</${tag}>`;
  return html;
}

function walkNodes(
  node: Node,
  parts: string[],
  images: ExtractResult["images"],
  mathCountRef: { value: number },
  unresolvedMathRef: { value: number },
  config: WalkConfig,
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (text) parts.push(text);
    return;
  }

  if (!(node instanceof HTMLElement)) return;

  if (node.tagName === "STYLE" || node.tagName === "SCRIPT") return;
  if (node.classList?.contains(CSS_CLASSES.ankiButton)) return;
  if (node.tagName === "MJX-ASSISTIVE-MML") return;

  if (node.id?.startsWith(DOM_IDS.freeResponsePrefix)) {
    parts.push("\\(\\boxed{\\vphantom{X}\\quad}\\)");
    return;
  }

  if (node.classList?.contains("selectList")) {
    parts.push(extractSelectListContent(node, mathCountRef, unresolvedMathRef));
    return;
  }

  if (node.tagName === "SELECT") {
    const optionTexts = Array.from(node.querySelectorAll("option"))
      .map((opt) => opt.textContent?.trim())
      .filter((t): t is string => !!t);

    if (optionTexts.length === 0) {
      parts.push("_________");
    } else {
      const allShort = optionTexts.every((opt) => opt.length < 5);
      if (allShort) {
        parts.push(`_________ (${optionTexts.join("/")})`);
      } else {
        parts.push(`_________ (${optionTexts.join(" / ")})`);
      }
    }
    return;
  }

  if (config.choicesConfig && node.tagName === "TR") {
    const cells = Array.from(node.querySelectorAll("td"));
    if (cells.length >= 2) {
      const label = cells[0].textContent?.trim() || "";
      const { labelFormat } = config.choicesConfig;
      const formatted =
        labelFormat === "dot"
          ? `${label}.`
          : labelFormat === "bracket"
            ? `(${label})`
            : `${label})`;
      parts.push(formatted + " ");
      for (let i = 1; i < cells.length; i++)
        walkNodes(
          cells[i],
          parts,
          images,
          mathCountRef,
          unresolvedMathRef,
          config,
        );
      parts.push("\n");
      return;
    }
  }

  if (node.tagName === "IMG") {
    const src = node.getAttribute("src");
    if (src) {
      const placeholder = `{{IMG_${images.length}}}`;
      images.push({ placeholder, src });
      parts.push(placeholder);
    }
    return;
  }

  if (node.tagName === "HR") {
    const hrStyle = getDividerStyle(node, { includeDimensions: true });
    parts.push(`<hr${styleAttr(hrStyle)}>`);
    return;
  }

  const hasNoVisibleText = !node.textContent?.trim();
  const hasNoChildren = node.childNodes.length === 0;
  if (hasNoVisibleText && hasNoChildren) {
    const dividerStyle = getDividerStyle(node, { includeDimensions: true });
    if (hasLineStyle(dividerStyle)) {
      parts.push(`<div${styleAttr(dividerStyle)}></div>`);
      return;
    }
  }

  if (node.tagName === "MJX-C") {
    const content = window.getComputedStyle(node, "::before").content;
    if (content && content !== "none" && content !== "normal") {
      const char = content.replace(/^["']|["']$/g, "");
      if (char) parts.push(char);
    }
    return;
  }

  const isMathJax =
    node.tagName.toLowerCase() === MATHJAX.mjxContainer ||
    node.classList.contains(MATHJAX.mjpage);

  if (isMathJax) {
    const hasInteractiveSelectList =
      node.querySelector(".selectListOptions .selectListOption, .selectList") !==
      null;

    if (hasInteractiveSelectList) {
      const handledInteractive = extractInteractiveMathJaxContent(
        node,
        parts,
        images,
        mathCountRef,
        unresolvedMathRef,
        config,
      );

      if (!handledInteractive) {
        for (const child of Array.from(node.childNodes)) {
          walkNodes(
            child,
            parts,
            images,
            mathCountRef,
            unresolvedMathRef,
            config,
          );
        }
      }
      return;
    }

    const source = getTexSource(node);
    if (source) {
      mathCountRef.value++;
      const isBlock = isMathJaxBlock(node);
      if (isBlock) {
        parts.push(
          config.blockMathFormat === "newlines"
            ? `\n\n\\[${source.value}\\]\n\n`
            : `\\[${source.value}\\]`,
        );
      } else {
        parts.push(`\\(${source.value}\\)`);
      }
    } else {
      unresolvedMathRef.value++;
    }
    return;
  }

  if (node.tagName === "TABLE" && !config.skipChoicesTable) {
    parts.push(processTable(node, images, mathCountRef, unresolvedMathRef));
    return;
  }

  if (config.handleLists && (node.tagName === "OL" || node.tagName === "UL")) {
    parts.push(processList(node, images, mathCountRef, unresolvedMathRef));
    return;
  }

  const isBlock =
    config.handleBlockElements &&
    ["P", "DIV", "BR", "H1", "H2", "H3", "H4"].includes(node.tagName);

  for (const child of Array.from(node.childNodes))
    walkNodes(child, parts, images, mathCountRef, unresolvedMathRef, config);

  if (isBlock && parts.length > 0) parts.push("\n\n");
}

export function extractElementContent(
  el: HTMLElement,
  options: ExtractOptions = {},
): ExtractResult {
  const { labelFormat = "paren" } = options;
  const isChoicesTable = el.classList?.contains("questionWidget-choicesTable");

  const parts: string[] = [];
  const images: ExtractResult["images"] = [];
  const mathCountRef = { value: 0 };
  const unresolvedMathRef = { value: 0 };

  const mainConfig: WalkConfig = {
    blockMathFormat: "newlines",
    handleLists: true,
    handleBlockElements: true,
    choicesConfig: isChoicesTable ? { labelFormat } : undefined,
    skipChoicesTable: isChoicesTable,
  };

  walkNodes(el, parts, images, mathCountRef, unresolvedMathRef, mainConfig);

  const content = parts
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .trim();

  console.log(
    `[Autobot] Extracted: ${mathCountRef.value} math, ${unresolvedMathRef.value} unresolved math, ${images.length} img, ${content.length} chars`,
  );
  return { content, images, unresolvedMathCount: unresolvedMathRef.value };
}
