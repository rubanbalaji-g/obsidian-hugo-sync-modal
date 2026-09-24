import { MetadataCache, TFile, Vault } from "obsidian";
import { HugoPublisherSettings } from "src/models/settings";
import { slugify } from "src/utils/slugify";
import { transformFrontmatter } from "src/compiler/FrontmatterTransformer";
import { resolveWikilinks, getPublishedPaths } from "src/compiler/WikilinkResolver";
import { BacklinkMap } from "src/compiler/BacklinkMapper";

export interface CompiledNote {
	/** Path in GitHub repo: sources/<folder>/<slug>.md */
	repoPath: string;
	/** Final compiled markdown content */
	content: string;
	/** Slug derived from file basename */
	slug: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const CALLOUT_RE = /^(\s*)>\s*\[!(\w+)\]([+-]?)\s*(.*)?$/gm;
const CODE_BLOCK_OR_COMMENT_RE = /(```[\s\S]*?```)|(%%[\s\S]*?%%)/g;
const BLOCK_REF_RE = /\s*\^[a-zA-Z0-9-]+$/gm;
const WIKILINK_IMAGE_RE = /!\[\[([^\]]+)\]\]/g;

export class NoteCompiler {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private settings: HugoPublisherSettings;
	private publishedPaths: Set<string>;

	constructor(vault: Vault, metadataCache: MetadataCache, settings: HugoPublisherSettings) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.publishedPaths = getPublishedPaths(vault, metadataCache);
	}

	async compile(file: TFile, backlinkMap: BacklinkMap): Promise<CompiledNote> {
		let raw = await this.vault.cachedRead(file);
		const slug = slugify(file.basename);

		// Check if file is designated as main.index or folder.index in frontmatter
		const fm = this.metadataCache.getCache(file.path)?.frontmatter;
		const isMainIndex = fm?.["main.index"] === true || /(?:^|\n)\s*main\.index:\s*true/i.test(raw);
		const isFolderIndex = fm?.["folder.index"] === true || /(?:^|\n)\s*folder\.index:\s*true/i.test(raw);

		// Hugo branch bundles:
		// 1. Any note with main.index: true -> content/_index.md (Root home page)
		// 2. Any note with folder.index: true -> content/<folder>/_index.md (Section index)
		// 3. Any note named index.md (case-insensitive) -> content/<folder>/_index.md (or content/_index.md at root)
		const normalizedPath = file.path.replace(/\\/g, "/");
		const lastSlash = normalizedPath.lastIndexOf("/");
		const folderPath = lastSlash !== -1 ? normalizedPath.substring(0, lastSlash) : "";
		const fileName = (file.name || normalizedPath.split("/").pop() || "").toLowerCase();

		// Control configuration files (tree.weight.md, do.not.display.md):
		// Pass raw clean content directly to content/<fileName> without Hugo note transformations
		if (
			fileName === "tree.weight.md" ||
			fileName === "tree.weight" ||
			fileName === "do.not.display.md" ||
			fileName === "do.not.display"
		) {
			let body = raw;
			const match = raw.match(FRONTMATTER_RE);
			if (match) {
				body = raw.substring(match[0].length).trim();
			}
			return {
				repoPath: `content/${fileName}`,
				content: body,
				slug: file.basename,
			};
		}

		let relPath = normalizedPath;
		if (isMainIndex) {
			relPath = "_index.md";
		} else if (isFolderIndex) {
			relPath = folderPath ? `${folderPath}/_index.md` : "_index.md";
		} else if (fileName === "index.md") {
			relPath = folderPath ? `${folderPath}/_index.md` : "_index.md";
		}
		const repoPath = `content/${relPath}`;

		// Extract existing frontmatter block if present
		let frontmatterBlock = "";
		let body = raw;
		const match = raw.match(FRONTMATTER_RE);
		if (match) {
			frontmatterBlock = match[0];
			body = raw.substring(match[0].length);
		}

		// 1. Strip Obsidian comments (%% ... %%) ONLY outside fenced code blocks
		body = body.replace(CODE_BLOCK_OR_COMMENT_RE, (match, codeBlock) => {
			if (codeBlock) return codeBlock;
			return "";
		});

		// 2. Strip block reference anchors (^block-id)
		body = body.replace(BLOCK_REF_RE, "");

		// 3. Convert wikilink images to standard markdown with modifiers preserved
		body = this.convertWikilinkImages(body);

		// 4. Normalize indented alphabetical or roman sublists to standard ordered lists for Hugo CommonMark
		body = this.normalizeSublists(body);

		let content: string;
		if (frontmatterBlock) {
			content = (frontmatterBlock + body).replace(/\r\n/g, "\n");
		} else {
			content = `---\npublish: true\n---\n${body}`.replace(/\r\n/g, "\n");
		}

		content = content.replace(/\/img\/user\/00\.Attachments\/(?:system_cards\/)?([^\s"')]+)/g, '/images/$1');

		return { repoPath, content, slug };
	}

	/**
	 * Normalizes indented alphabetical (a., b.) and Roman numeral (i., ii.) sublists
	 * to standard CommonMark ordered lists (1.) outside of code blocks.
	 * Hugo Goldmark strictly parses 0-9 digits as ordered lists; CSS handles the
	 * lower-alpha / lower-roman list styling hierarchically.
	 */
	private normalizeSublists(content: string): string {
		const CODE_BLOCK_RE = /(```[\s\S]*?```)|(`[^`\n]+`)/g;
		const INDENTED_SUBLIST_RE = /^(\s*(?:>\s*)*\s+)(?:[a-zA-Z]|[ivxIVX]{1,4})\.\s+(.*)$/gm;

		const codeBlocks: string[] = [];
		let sanitized = content.replace(CODE_BLOCK_RE, (match) => {
			codeBlocks.push(match);
			return `%%%CODE_BLOCK_PRESERVE_${codeBlocks.length - 1}%%%`;
		});

		sanitized = sanitized.replace(INDENTED_SUBLIST_RE, "$11. $2");

		sanitized = sanitized.replace(/%%%CODE_BLOCK_PRESERVE_(\d+)%%%/g, (_, idx) => codeBlocks[Number(idx)]);

		return sanitized;
	}

	/**
	 * Converts Obsidian wikilink images to standard Hugo markdown image links.
	 * Preserves pipe parameters like |right, |left, |200 so Hugo can format them.
	 * ![[image.png|right|200]] → ![image.png|right|200](/img/image.png)
	 */
	private convertWikilinkImages(content: string): string {
		return content.replace(WIKILINK_IMAGE_RE, (_match, inner) => {
			const raw = inner.replace(/\\\|/g, "|");
			const parts = raw.split("|");
			const namePart = parts[0].trim();
			const modifiers = parts.slice(1).map((p) => p.trim()).filter(Boolean);
			const basename = namePart.split("/").pop()?.split("\\").pop() ?? namePart;
			const encodedName = encodeURIComponent(basename);
			const altText = modifiers.length > 0 ? `${basename}|${modifiers.join("|")}` : basename;
			return `![${altText}](/img/${encodedName})`;
		});
	}

	/**
	 * Generates the hugo.toml content from current settings.
	 */
	generateHugoToml(): string {
		const { siteBaseUrl, siteName, siteDescription, siteAuthor,
			siteFaviconPath, siteLogoType, siteLogoIcon, siteLogoPath,
			footerFormat, footerContent,
			baseTheme, accentColor, fontFamily, customFontUrl,
			obsidianThemeCssUrl, maxContentWidth, showSidebar, showTocByDefault,
			showCreatedTimestamp, showUpdatedTimestamp, timestampFormat,
			showNoteIcons, computeBacklinks, generateTagIndex, navLinks } = this.settings;

		const resolvedTitle = (siteName || "").trim() || "Hugo Homepage";

		let faviconVal = "";
		if (siteFaviconPath && siteFaviconPath.trim()) {
			const dotIdx = siteFaviconPath.lastIndexOf(".");
			const ext = dotIdx !== -1 ? siteFaviconPath.substring(dotIdx + 1).toLowerCase() : "png";
			faviconVal = `/favicon.${ext}`;
		}

		let logoVal = "";
		let siteIconVal = "";
		if (siteLogoType === "image" && siteLogoPath && siteLogoPath.trim()) {
			const dotIdx = siteLogoPath.lastIndexOf(".");
			const ext = dotIdx !== -1 ? siteLogoPath.substring(dotIdx + 1).toLowerCase() : "png";
			logoVal = `/logo.${ext}`;
		} else if (siteLogoType === "icon" && siteLogoIcon && siteLogoIcon.trim()) {
			siteIconVal = siteLogoIcon.trim();
		}

		let footerToml = `  footerFormat = "${footerFormat || "markdown"}"\n  footerContent = ""`;
		if (footerContent && footerContent.trim()) {
			footerToml = `  footerFormat = "${footerFormat || "markdown"}"\n  footerContent = '''\n${footerContent}\n'''`;
		}

		let navLinksToml = "";
		if (navLinks && navLinks.length > 0) {
			for (const link of navLinks) {
				navLinksToml += `\n[[params.navLinks]]\n  name = "${link.name}"\n  url = "${link.url}"\n`;
			}
		}

		return `baseURL = "${siteBaseUrl.endsWith("/") ? siteBaseUrl : siteBaseUrl + "/"}"
locale = "en"
title = "${resolvedTitle}"
ignoreFiles = ['do\\.not\\.display\\.md$', 'tree\\.weight.*$']

[pagination]
  pagerSize = 50
pluralizeListTitles = false

[params]
  description = "${siteDescription}"
  author = "${siteAuthor}"
  siteName = "${resolvedTitle}"
  baseTheme = "${baseTheme}"
  accentColor = "${accentColor}"
  favicon = "${faviconVal}"
  logo = "${logoVal}"
  siteIcon = "${siteIconVal}"
${footerToml}
  fontFamily = "${fontFamily}"
  customFontUrl = "${customFontUrl}"
  obsidianThemeCssUrl = "${obsidianThemeCssUrl}"
  maxContentWidth = ${maxContentWidth}
  showSidebar = ${showSidebar}
  showTocByDefault = ${showTocByDefault}
  showCreatedTimestamp = ${showCreatedTimestamp}
  showUpdatedTimestamp = ${showUpdatedTimestamp}
  timestampFormat = "${timestampFormat}"
  showNoteIcons = ${showNoteIcons}
  computeBacklinks = ${computeBacklinks}
  generateTagIndex = ${generateTagIndex}${navLinksToml}

[params.sidebarTitles]
  "01-proforma"                       = "Case Proformas"
  "02-history-taking-and-examination" = "History & Examination"
  "03-model-case-sheets"              = "Model Case Sheets"
  "04-questions"                      = "Viva Questions"

[params.sidebarIcons]
  "01-proforma"                       = "clipboard-list"
  "02-history-taking-and-examination" = "stethoscope"
  "03-model-case-sheets"              = "book-open"
  "04-questions"                      = "message-circle-question"

[markup]
  [markup.goldmark]
    [markup.goldmark.renderer]
      unsafe = true
    [markup.goldmark.extensions]
      definitionList = true
      footnote = true
      linkify = true
      strikethrough = true
      table = true
      taskList = true
      typographer = false
      [markup.goldmark.extensions.passthrough]
        enable = true
        [markup.goldmark.extensions.passthrough.delimiters]
          block = [['\\[', '\\]'], ['$$', '$$']]
          inline = [['\\(', '\\)'], ['$', '$']]
  [markup.tableOfContents]
    startLevel = 2
    endLevel = 4
    ordered = false

[outputs]
  home = ["HTML", "JSON"]
  page = ["HTML"]
  section = ["HTML"]
`;
	}
}
