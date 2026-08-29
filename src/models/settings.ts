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
	githubUsername: "",
	githubRepo: "",
	branch: "main",

	siteBaseUrl: "https://theory.pedianotes.in",
	siteName: "PediaNotes",
	siteDescription: "Pediatric Clinical Theory & Exam Notes by Dr. Rubanbalaji",
	siteAuthor: "Dr. Rubanbalaji",

	baseTheme: "dark",
	accentColor: "#00a868",
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
	navLinks: [{ name: "Home", url: "https://pedianotes.in" }],

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
