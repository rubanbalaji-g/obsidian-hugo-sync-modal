export interface HugoPublisherSettings {
	// ── GitHub ────────────────────────────────────────────────────────────
	githubToken: string;
	githubUsername: string;
	githubRepo: string;
	branch: string;

	// ── Site Identity (regenerates hugo.toml on save) ─────────────────────
	siteBaseUrl: string;
	siteName: string;
	siteDescription: string;
	siteAuthor: string;
	siteFaviconPath: string;
	siteLogoType: "none" | "icon" | "image";
	siteLogoIcon: string;
	siteLogoPath: string;
	footerFormat: "markdown" | "html";
	footerContent: string;

	// ── Theme ─────────────────────────────────────────────────────────────
	baseTheme: "light" | "dark" | "system";
	accentColor: string;
	fontFamily: "system" | "serif" | "mono" | "custom";
	customFontUrl: string;
	obsidianThemeCssUrl: string;

	// ── Layout ────────────────────────────────────────────────────────────
	maxContentWidth: number;
	showSidebar: boolean;
	showTocByDefault: boolean;

	// ── Feature Toggles ───────────────────────────────────────────────────
	showNoteIcons: boolean;
	computeBacklinks: boolean;
	generateTagIndex: boolean;
	generateRecentsFeed: boolean;
	generateSearchIndex: boolean;
	passThroughFrontmatter: boolean;
	showCreatedTimestamp: boolean;
	showUpdatedTimestamp: boolean;
	timestampFormat: string;
	navLinks: Array<{ name: string; url: string }>;

	// ── Internal Sync State ───────────────────────────────────────────────
	lastSyncAt: string;
	lastCommitSha: string;
	imageMigrationDone: boolean;
}

export const DEFAULT_SETTINGS: HugoPublisherSettings = {
	githubToken: "",
	githubUsername: "rubanbalaji-g",
	githubRepo: "dnb-practicals",
	branch: "main",

	siteBaseUrl: "https://practical.pedianotes.in/",
	siteName: "PediaNotes Practical",
	siteDescription: "DNB Pediatrics Practical Examination — Model Case Sheets, Proformas & Viva Questions",
	siteAuthor: "Dr. Rubanbalaji",
	siteFaviconPath: "",
	siteLogoType: "none",
	siteLogoIcon: "",
	siteLogoPath: "",
	footerFormat: "markdown",
	footerContent: "",

	baseTheme: "dark",
	accentColor: "#0ea5e9",
	fontFamily: "system",
	customFontUrl: "",
	obsidianThemeCssUrl: "",

	maxContentWidth: 860,
	showSidebar: true,
	showTocByDefault: true,

	showNoteIcons: true,
	computeBacklinks: true,
	generateTagIndex: true,
	generateRecentsFeed: true,
	generateSearchIndex: true,
	passThroughFrontmatter: false,
	showCreatedTimestamp: true,
	showUpdatedTimestamp: true,
	timestampFormat: "DD MMM YYYY",
	navLinks: [
		{ name: "Home", url: "https://pedianotes.in" },
		{ name: "Theory", url: "https://theory.pedianotes.in" },
	],

	lastSyncAt: "",
	lastCommitSha: "",
	imageMigrationDone: false,
};

/** Frontmatter keys that are always stripped before uploading to GitHub */
export const STRIP_KEYS = new Set([
	"dg-publish",
	"dg-home",
	"dgPassFrontmatter",
	"uplink",
	"uptext",
	"permalink",
	"publish",
	"main.index",
	"folder.index",
	"running.title",
	"note.icon",
]);
