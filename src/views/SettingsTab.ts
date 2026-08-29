import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import PediaNotesHugoPlugin from "src/main";
import { GitHubConnection } from "src/github/GitHubConnection";
import { ImageConsolidationModal } from "src/migration/ImageConsolidator";

export class SettingsTab extends PluginSettingTab {
	private plugin: PediaNotesHugoPlugin;

	constructor(app: App, plugin: PediaNotesHugoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("pedia-settings-tab");

		containerEl.createEl("h2", { text: "🏥 PediaNotes Hugo Publisher Settings" });

		// ── GITHUB CONFIGURATION ──────────────────────────────────────────
		containerEl.createEl("h3", { text: "🐙 GitHub Configuration" });

		new Setting(containerEl)
			.setName("GitHub Personal Access Token (PAT)")
			.setDesc("A token with 'repo' scope from github.com/settings/tokens")
			.addText((text) =>
				text
					.setPlaceholder("ghp_...")
					.setValue(this.plugin.settings.githubToken)
					.onChange(async (val) => {
						this.plugin.settings.githubToken = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("GitHub Username / Owner")
			.setDesc("Your GitHub account or organization name")
			.addText((text) =>
				text
					.setPlaceholder("rubanbalaji-g")
					.setValue(this.plugin.settings.githubUsername)
					.onChange(async (val) => {
						this.plugin.settings.githubUsername = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("GitHub Repository Name")
			.setDesc("The repository holding your Hugo site")
			.addText((text) =>
				text
					.setPlaceholder("dnb-theory-hugo")
					.setValue(this.plugin.settings.githubRepo)
					.onChange(async (val) => {
						this.plugin.settings.githubRepo = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Git Branch")
			.setDesc("Branch to push published notes and assets to (default: main)")
			.addText((text) =>
				text
					.setPlaceholder("main")
					.setValue(this.plugin.settings.branch)
					.onChange(async (val) => {
						this.plugin.settings.branch = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Test GitHub Connection")
			.setDesc("Verifies token validity, repository access, and 'repo' write scope")
			.addButton((btn) =>
				btn.setButtonText("Test Connection").onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText("Testing...");
					const conn = new GitHubConnection(this.plugin.settings);
					const res = await conn.testConnection();
					btn.setDisabled(false);
					btn.setButtonText("Test Connection");

					if (res.ok) {
						const scopeText = res.hasRepoScope ? "Full 'repo' write scope confirmed." : "⚠️ Warning: 'repo' scope might be missing.";
						new Notice(`✅ Connection successful! ${scopeText}`);
					} else {
						new Notice(`❌ Connection failed: ${res.error}`);
					}
				})
			);

		// ── SITE IDENTITY & DOMAIN ────────────────────────────────────────
		containerEl.createEl("h3", { text: "🌐 Site Identity & Domain" });

		new Setting(containerEl)
			.setName("Site Base URL")
			.setDesc("Your live domain or URL (e.g. https://pedianotes.in or https://rubanbalaji-g.github.io/dnb-theory-hugo)")
			.addText((text) =>
				text
					.setPlaceholder("https://pedianotes.in")
					.setValue(this.plugin.settings.siteBaseUrl)
					.onChange(async (val) => {
						this.plugin.settings.siteBaseUrl = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Site Title")
			.setDesc("Website title shown in headers and browser tabs")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.siteName)
					.onChange(async (val) => {
						this.plugin.settings.siteName = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Author")
			.setDesc("Author name displayed in footer and metadata")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.siteAuthor)
					.onChange(async (val) => {
						this.plugin.settings.siteAuthor = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Site Description")
			.setDesc("Short summary for SEO and social preview cards")
			.addTextArea((ta) =>
				ta
					.setValue(this.plugin.settings.siteDescription)
					.onChange(async (val) => {
						this.plugin.settings.siteDescription = val;
						await this.plugin.saveSettings();
					})
			);

		// ── HEADER NAVIGATION LINKS ───────────────────────────────────────
		containerEl.createEl("h3", { text: "🔗 Header Navigation Links" });
		containerEl.createEl("p", {
			text: "Configure links displayed in the desktop title bar and inside the top-right mobile hamburger menu.",
			cls: "setting-item-description",
		});

		const navLinks = this.plugin.settings.navLinks || [];
		navLinks.forEach((link, idx) => {
			const s = new Setting(containerEl);
			s.setName(`Link #${idx + 1}`);
			s.addText((t) =>
				t
					.setPlaceholder("Display Text (e.g. Home)")
					.setValue(link.name)
					.onChange(async (val) => {
						link.name = val;
						await this.plugin.saveSettings();
					})
			);
			s.addText((t) =>
				t
					.setPlaceholder("URL (e.g. https://pedianotes.in)")
					.setValue(link.url)
					.onChange(async (val) => {
						link.url = val;
						await this.plugin.saveSettings();
					})
			);
			s.addButton((b) =>
				b
					.setButtonText("Delete")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.navLinks.splice(idx, 1);
						await this.plugin.saveSettings();
						this.display();
					})
			);
		});

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("➕ Add Navigation Link")
				.setCta()
				.onClick(async () => {
					if (!this.plugin.settings.navLinks) this.plugin.settings.navLinks = [];
					this.plugin.settings.navLinks.push({ name: "", url: "" });
					await this.plugin.saveSettings();
					this.display();
				})
		);

		// ── THEMES & APPEARANCE ───────────────────────────────────────────
		containerEl.createEl("h3", { text: "🎨 Theme & Appearance" });

		new Setting(containerEl)
			.setName("Base Theme Mode")
			.setDesc("Default appearance when visitors load the site")
			.addDropdown((dd) =>
				dd
					.addOption("dark", "Dark Mode")
					.addOption("light", "Light Mode")
					.addOption("system", "System Preference")
					.setValue(this.plugin.settings.baseTheme)
					.onChange(async (val: "light" | "dark" | "system") => {
						this.plugin.settings.baseTheme = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Accent Color")
			.setDesc("Primary accent color for links, buttons, and badges")
			.addColorPicker((cp) =>
				cp
					.setValue(this.plugin.settings.accentColor)
					.onChange(async (val) => {
						this.plugin.settings.accentColor = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Font Family")
			.setDesc("Typography used for reading notes")
			.addDropdown((dd) =>
				dd
					.addOption("system", "System Sans-Serif")
					.addOption("serif", "Editorial Serif")
					.addOption("mono", "Monospace")
					.addOption("custom", "Custom Web Font")
					.setValue(this.plugin.settings.fontFamily)
					.onChange(async (val: "system" | "serif" | "mono" | "custom") => {
						this.plugin.settings.fontFamily = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Obsidian Theme CSS URL")
			.setDesc("Optional URL to a community theme CSS file to match your Obsidian theme")
			.addText((text) =>
				text
					.setPlaceholder("https://raw.githubusercontent.com/.../theme.css")
					.setValue(this.plugin.settings.obsidianThemeCssUrl)
					.onChange(async (val) => {
						this.plugin.settings.obsidianThemeCssUrl = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync Theme to Hugo Repository")
			.setDesc("Pushes your site settings and theme parameters into hugo.toml via GitHub API")
			.addButton((btn) =>
				btn.setButtonText("Sync hugo.toml").onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText("Syncing...");
					try {
						const sha = await this.plugin.publisher.updateHugoConfig();
						new Notice(`✅ hugo.toml updated on GitHub! Commit: ${sha.slice(0, 7)}`);
					} catch (err) {
						new Notice(`❌ Failed to sync hugo.toml: ${err}`);
					}
					btn.setDisabled(false);
					btn.setButtonText("Sync hugo.toml");
				})
			);

		// ── LAYOUT & CONTENT ──────────────────────────────────────────────
		containerEl.createEl("h3", { text: "📐 Layout Options" });

		new Setting(containerEl)
			.setName("Max Content Width (px)")
			.setDesc("Maximum reading column width in pixels")
			.addSlider((slider) =>
				slider
					.setLimits(650, 1200, 10)
					.setValue(this.plugin.settings.maxContentWidth)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.maxContentWidth = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Sidebar")
			.setDesc("Display section navigation sidebar on desktop views")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSidebar)
					.onChange(async (val) => {
						this.plugin.settings.showSidebar = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Table of Contents (TOC) by Default")
			.setDesc("Display inline TOC on note pages")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTocByDefault)
					.onChange(async (val) => {
						this.plugin.settings.showTocByDefault = val;
						await this.plugin.saveSettings();
					})
			);

		// ── ADVANCED FEATURES ─────────────────────────────────────────────
		containerEl.createEl("h3", { text: "⚡ Advanced Features & Frontmatter" });

		new Setting(containerEl)
			.setName("Support Lucide Note Icons")
			.setDesc("Render icons from 'note.icon: <name>' (supports any icon from lucide.dev)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showNoteIcons)
					.onChange(async (val) => {
						this.plugin.settings.showNoteIcons = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Compute Backlinks Graph")
			.setDesc("Inject bidirectional links so notes show 'Referenced by' sections")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.computeBacklinks)
					.onChange(async (val) => {
						this.plugin.settings.computeBacklinks = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Generate Full-Text Search Index")
			.setDesc("Generates clean search index asynchronously after notes are pushed")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.generateSearchIndex)
					.onChange(async (val) => {
						this.plugin.settings.generateSearchIndex = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Generate Recents & Tags Feeds")
			.setDesc("Export recent notes and tags metadata for Hugo homepage widgets")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.generateRecentsFeed)
					.onChange(async (val) => {
						this.plugin.settings.generateRecentsFeed = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Created & Updated Timestamps")
			.setDesc("Display timestamps on note pages from 'created' and 'updated' frontmatter")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCreatedTimestamp)
					.onChange(async (val) => {
						this.plugin.settings.showCreatedTimestamp = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Date Display Format")
			.setDesc("Format string for dates (e.g. DD MMM YYYY or YYYY-MM-DD)")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.timestampFormat)
					.onChange(async (val) => {
						this.plugin.settings.timestampFormat = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Pass-Through Other Frontmatter")
			.setDesc("Forward non-system frontmatter fields directly to Hugo templates")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.passThroughFrontmatter)
					.onChange(async (val) => {
						this.plugin.settings.passThroughFrontmatter = val;
						await this.plugin.saveSettings();
					})
			);

		// ── MIGRATION TOOLS ───────────────────────────────────────────────
		containerEl.createEl("h3", { text: "🛠️ Vault Maintenance Tools" });

		new Setting(containerEl)
			.setName("Image Folder Consolidation")
			.setDesc("One-time migration: moves images from subfolders into a single 'img/' directory and updates note links")
			.addButton((btn) =>
				btn.setButtonText("Consolidate Images...").onClick(() => {
					new ImageConsolidationModal(this.app, async () => {
						this.plugin.settings.imageMigrationDone = true;
						await this.plugin.saveSettings();
					}).open();
				})
			);
	}
}
