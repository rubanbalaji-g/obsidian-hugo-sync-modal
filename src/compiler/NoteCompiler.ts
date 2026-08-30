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

		// Map index.md at vault root to content/_index.md (Hugo branch root)
		let relPath = file.path;
		if (relPath === "index.md") {
			relPath = "_index.md";
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

		let content: string;
		if (frontmatterBlock) {
			content = (frontmatterBlock + body).replace(/\r\n/g, "\n");
		} else {
			content = `---\npublish: true\n---\n${body}`.replace(/\r\n/g, "\n");
		}

		return { repoPath, content, slug };
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
			baseTheme, accentColor, fontFamily, customFontUrl,
			obsidianThemeCssUrl, maxContentWidth, showSidebar, showTocByDefault,
			showCreatedTimestamp, showUpdatedTimestamp, timestampFormat,
			showNoteIcons, computeBacklinks, generateTagIndex, navLinks } = this.settings;

		let navLinksToml = "";
		if (navLinks && navLinks.length > 0) {
			for (const link of navLinks) {
				navLinksToml += `\n[[params.navLinks]]\n  name = "${link.name}"\n  url = "${link.url}"\n`;
			}
		}

		return `baseURL = "${siteBaseUrl.endsWith("/") ? siteBaseUrl : siteBaseUrl + "/"}"
locale = "en"
title = "${siteName}"
paginate = 50
pluralizeListTitles = false

[params]
  description = "${siteDescription}"
  author = "${siteAuthor}"
  siteName = "${siteName}"
  baseTheme = "${baseTheme}"
  accentColor = "${accentColor}"
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
