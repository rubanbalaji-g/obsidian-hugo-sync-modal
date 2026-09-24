import { App, Notice, PluginSettingTab, Setting, TFile, setIcon } from "obsidian";
import PediaNotesHugoPlugin from "src/main";
import { ImageSuggestModal } from "src/views/ImageSuggestModal";
import { FooterEditorModal } from "src/views/FooterEditorModal";
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

		// ── TOP HEADER ROW WITH DISTINCT MASTER SYNC ─────────────────────
		const topHeaderRow = containerEl.createDiv({ cls: "pedia-top-header-row" });
		topHeaderRow.createEl("h2", { text: "Hugo Publisher Settings", cls: "pedia-main-heading" });

		const masterSyncBtn = topHeaderRow.createEl("button", {
			cls: "mod-cta pedia-master-sync-btn",
			attr: { "aria-label": "Master Sync: Push all settings, hugo.toml & staged assets to GitHub" },
		});
		const masterIconWrap = masterSyncBtn.createSpan({ cls: "pedia-master-icon-wrap" });
		setIcon(masterIconWrap, "sparkles");
		masterSyncBtn.createSpan({ text: "Sync All", cls: "pedia-master-btn-text" });

		masterSyncBtn.onclick = async () => {
			if (masterSyncBtn.hasClass("is-loading")) return;
			masterSyncBtn.addClass("is-loading");
			masterSyncBtn.setAttribute("disabled", "true");
			try {
				const sha = await this.plugin.publisher.masterSync();
				new Notice(`✅ Master Sync Complete! All settings & hugo.toml updated (Commit: ${sha.slice(0, 7)})`);
			} catch (err: any) {
				new Notice(`❌ Master Sync failed: ${err.message || err}`);
			} finally {
				masterSyncBtn.removeClass("is-loading");
				masterSyncBtn.removeAttribute("disabled");
			}
		};

		// ── GITHUB CONFIGURATION ──────────────────────────────────────────
		containerEl.createEl("h3", { text: "GitHub Configuration", cls: "pedia-section-title" });

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
			.setDesc("Verify your token and repository access")
			.addButton((btn) =>
				btn.setButtonText("Test Connection").onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText("Testing...");
					try {
						await this.plugin.publisher.testConnection();
						new Notice("✅ Connection successful!");
					} catch (err: any) {
						new Notice(`❌ Connection failed: ${err.message || err}`);
					}
					btn.setDisabled(false);
					btn.setButtonText("Test Connection");
				})
			);

		// ── SITE IDENTITY & DOMAIN ────────────────────────────────────────
		this.createSectionHeader(
			containerEl,
			"Site Identity & Domain",
			"Sync Site Identity & Assets to GitHub",
			async () => {
				const sha = await this.plugin.publisher.syncSiteIdentity();
				new Notice(`✅ Site Identity & hugo.toml synced! Commit: ${sha.slice(0, 7)}`);
			}
		);

		new Setting(containerEl)
			.setName("Site Base URL")
			.setDesc("Your live Hugo site URL (e.g. https://practical.pedianotes.in/)")
			.addText((text) =>
				text
					.setPlaceholder("https://practical.pedianotes.in/")
					.setValue(this.plugin.settings.siteBaseUrl)
					.onChange(async (val) => {
						this.plugin.settings.siteBaseUrl = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Open Live Site")
			.setDesc("Opens your configured live site in your default browser")
			.addButton((btn) =>
				btn.setButtonText("Open in Browser").onClick(() => {
					if (!this.plugin.settings.siteBaseUrl) {
						new Notice("❌ Site Base URL is not set");
						return;
					}
					window.open(this.plugin.settings.siteBaseUrl, "_blank");
				})
			);

		new Setting(containerEl)
			.setName("Site Title")
			.setDesc("Website title shown in headers and browser tabs (defaults to 'Hugo Homepage' if left blank)")
			.addText((text) =>
				text
					.setPlaceholder("Hugo Homepage")
					.setValue(this.plugin.settings.siteName)
					.onChange(async (val) => {
						this.plugin.settings.siteName = val;
						await this.plugin.saveSettings();
					})
			);

		// ── SITE FAVICON ──────────────────────────────────────────────────
		const favSetting = new Setting(containerEl)
			.setName("Site Favicon")
			.setDesc("Select any image from the vault to use as the site favicon (if blank, no favicon will be used)");

		let favInputEl: HTMLInputElement;
		favSetting.addText((t) => {
			favInputEl = t.inputEl;
			t.setPlaceholder("Select an image from vault...")
				.setValue(this.plugin.settings.siteFaviconPath || "")
				.onChange(async (val) => {
					this.plugin.settings.siteFaviconPath = val.trim();
					await this.plugin.saveSettings();
					this.renderFaviconPreview(favPreviewContainer);
				});
		});

		favSetting.addButton((b) =>
			b.setButtonText("Choose from Vault").onClick(() => {
				new ImageSuggestModal(this.app, async (file: TFile) => {
					this.plugin.settings.siteFaviconPath = file.path;
					favInputEl.value = file.path;
					await this.plugin.saveSettings();
					this.renderFaviconPreview(favPreviewContainer);
				}).open();
			})
		);

		favSetting.addButton((b) =>
			b.setButtonText("Clear").onClick(async () => {
				this.plugin.settings.siteFaviconPath = "";
				favInputEl.value = "";
				await this.plugin.saveSettings();
				this.renderFaviconPreview(favPreviewContainer);
			})
		);

		const favPreviewContainer = containerEl.createDiv({ cls: "pedia-thumbnail-preview-row" });
		this.renderFaviconPreview(favPreviewContainer);

		// ── SITE TITLE ICON / LOGO ────────────────────────────────────────
		new Setting(containerEl)
			.setName("Title Icon or Logo Display")
			.setDesc("Display a Lucide vector icon or custom vault image near the site title (if None, text only)")
			.addDropdown((dd) =>
				dd
					.addOption("none", "None (Text Only)")
					.addOption("icon", "Lucide Vector Icon")
					.addOption("image", "Vault Image")
					.setValue(this.plugin.settings.siteLogoType || "none")
					.onChange(async (val: "none" | "icon" | "image") => {
						this.plugin.settings.siteLogoType = val;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.siteLogoType === "icon") {
			const iconSetting = new Setting(containerEl)
				.setName("Site Title Icon")
				.setDesc("Lucide icon name (e.g. stethoscope, book-open, heart-pulse, activity, baby)");

			const iconPreviewEl = iconSetting.controlEl.createDiv({ cls: "pedia-inline-icon-preview" });
			this.renderLucidePreview(iconPreviewEl, this.plugin.settings.siteLogoIcon || "book-open");

			iconSetting.addText((t) =>
				t
					.setPlaceholder("e.g. stethoscope")
					.setValue(this.plugin.settings.siteLogoIcon || "")
					.onChange(async (val) => {
						this.plugin.settings.siteLogoIcon = val.trim().toLowerCase();
						await this.plugin.saveSettings();
						this.renderLucidePreview(iconPreviewEl, this.plugin.settings.siteLogoIcon);
					})
			);

			iconSetting.addButton((b) =>
				b.setButtonText("Clear").onClick(async () => {
					this.plugin.settings.siteLogoIcon = "";
					await this.plugin.saveSettings();
					this.renderLucidePreview(iconPreviewEl, "");
					this.display();
				})
			);
		} else if (this.plugin.settings.siteLogoType === "image") {
			const logoSetting = new Setting(containerEl)
				.setName("Site Title Image")
				.setDesc("Select an image from the vault to display next to the site title");

			let logoInputEl: HTMLInputElement;
			logoSetting.addText((t) => {
				logoInputEl = t.inputEl;
				t.setPlaceholder("Select an image from vault...")
					.setValue(this.plugin.settings.siteLogoPath || "")
					.onChange(async (val) => {
						this.plugin.settings.siteLogoPath = val.trim();
						await this.plugin.saveSettings();
						this.renderLogoPreview(logoPreviewContainer);
					});
			});

			logoSetting.addButton((b) =>
				b.setButtonText("Choose from Vault").onClick(() => {
					new ImageSuggestModal(this.app, async (file: TFile) => {
						this.plugin.settings.siteLogoPath = file.path;
						logoInputEl.value = file.path;
						await this.plugin.saveSettings();
						this.renderLogoPreview(logoPreviewContainer);
					}).open();
				})
			);

			logoSetting.addButton((b) =>
				b.setButtonText("Clear").onClick(async () => {
					this.plugin.settings.siteLogoPath = "";
					logoInputEl.value = "";
					await this.plugin.saveSettings();
					this.renderLogoPreview(logoPreviewContainer);
				})
			);

			const logoPreviewContainer = containerEl.createDiv({ cls: "pedia-thumbnail-preview-row" });
			this.renderLogoPreview(logoPreviewContainer);
		}

		new Setting(containerEl)
			.setName("Author")
			.setDesc("Author name displayed in metadata and feeds")
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

		// ── SITE FOOTER ───────────────────────────────────────────────────
		const footerContent = this.plugin.settings.footerContent || "";
		const footerFormat = this.plugin.settings.footerFormat || "markdown";
		const isFooterConfigured = footerContent.trim().length > 0;

		const footerSetting = new Setting(containerEl)
			.setName("Site Footer")
			.setDesc(
				isFooterConfigured
					? `Custom ${footerFormat.toUpperCase()} footer configured (${footerContent.trim().split("\n").length} lines). If cleared, no footer will be rendered.`
					: "No custom footer configured. (The entire footer will be omitted from the site)."
			);

		footerSetting.addButton((btn) =>
			btn
				.setButtonText("Edit Footer")
				.setCta()
				.onClick(() => {
					new FooterEditorModal(
						this.app,
						this.plugin.settings.footerFormat,
						this.plugin.settings.footerContent,
						async (fmt, cnt) => {
							this.plugin.settings.footerFormat = fmt;
							this.plugin.settings.footerContent = cnt;
							await this.plugin.saveSettings();
							this.display();
							new Notice("✅ Footer saved! Click [🔄] on Site Identity or [✨ Sync All] to push to GitHub.");
						},
						async (fmt, cnt) => {
							this.plugin.settings.footerFormat = fmt;
							this.plugin.settings.footerContent = cnt;
							await this.plugin.saveSettings();
							this.display();
							try {
								const sha = await this.plugin.publisher.syncSiteIdentity();
								new Notice(`✅ Footer saved & synced to GitHub! Commit: ${sha.slice(0, 7)}`);
							} catch (err: any) {
								new Notice(`❌ Sync failed: ${err.message || err}`);
								throw err;
							}
						}
					).open();
				})
		);

		if (isFooterConfigured) {
			footerSetting.addButton((btn) =>
				btn.setButtonText("Clear Footer").onClick(async () => {
					this.plugin.settings.footerContent = "";
					await this.plugin.saveSettings();
					this.display();
				})
			);
		}

		// ── HEADER NAVIGATION LINKS ───────────────────────────────────────
		this.createSectionHeader(
			containerEl,
			"Header Navigation Links",
			"Sync Navigation Links to GitHub",
			async () => {
				const sha = await this.plugin.publisher.updateHugoConfig(
					"chore(site): update navigation links in hugo.toml"
				);
				new Notice(`✅ Navigation links synced! Commit: ${sha.slice(0, 7)}`);
			}
		);

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

		// ── THEME & APPEARANCE ───────────────────────────────────────────
		this.createSectionHeader(
			containerEl,
			"Theme & Appearance",
			"Sync Theme Settings to GitHub",
			async () => {
				const sha = await this.plugin.publisher.updateHugoConfig(
					"chore(site): update theme settings in hugo.toml"
				);
				new Notice(`✅ Theme settings synced! Commit: ${sha.slice(0, 7)}`);
			}
		);

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

		// ── LAYOUT OPTIONS ────────────────────────────────────────────────
		this.createSectionHeader(
			containerEl,
			"Layout Options",
			"Sync Layout Options to GitHub",
			async () => {
				const sha = await this.plugin.publisher.updateHugoConfig(
					"chore(site): update layout settings in hugo.toml"
				);
				new Notice(`✅ Layout options synced! Commit: ${sha.slice(0, 7)}`);
			}
		);

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

		// ── ADVANCED FEATURES & FRONTMATTER ───────────────────────────────
		this.createSectionHeader(
			containerEl,
			"Advanced Features & Frontmatter",
			"Sync Advanced Features to GitHub",
			async () => {
				const sha = await this.plugin.publisher.updateHugoConfig(
					"chore(site): update advanced settings in hugo.toml"
				);
				new Notice(`✅ Advanced features synced! Commit: ${sha.slice(0, 7)}`);
			}
		);

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

		// ── VAULT MAINTENANCE TOOLS ───────────────────────────────────────
		containerEl.createEl("h3", { text: "Vault Maintenance Tools", cls: "pedia-section-title" });

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

	private createSectionHeader(
		containerEl: HTMLElement,
		titleText: string,
		syncTooltip: string,
		onSync: () => Promise<void>
	): HTMLElement {
		const row = containerEl.createDiv({ cls: "pedia-section-header-row" });
		row.createEl("h3", { text: titleText, cls: "pedia-section-title" });
		const syncBtn = row.createEl("button", {
			cls: "clickable-icon pedia-header-sync-btn",
			attr: { "aria-label": syncTooltip },
		});
		setIcon(syncBtn, "refresh-cw");

		syncBtn.onclick = async () => {
			if (syncBtn.hasClass("is-loading")) return;
			syncBtn.addClass("is-loading");
			syncBtn.setAttribute("disabled", "true");
			try {
				await onSync();
			} catch (err: any) {
				new Notice(`❌ Sync failed: ${err.message || err}`);
			} finally {
				syncBtn.removeClass("is-loading");
				syncBtn.removeAttribute("disabled");
			}
		};

		return row;
	}

	private renderFaviconPreview(container: HTMLElement): void {
		container.empty();
		const path = this.plugin.settings.siteFaviconPath;
		if (!path) return;

		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const wrapper = container.createDiv({ cls: "pedia-thumb-box" });
			const img = wrapper.createEl("img", {
				cls: "pedia-thumb-img",
				attr: { src: this.app.vault.getResourcePath(file), alt: "Favicon Preview" },
			});
			wrapper.createSpan({ text: `Favicon: ${file.name} (${file.extension.toUpperCase()})`, cls: "pedia-thumb-label" });
		}
	}

	private renderLogoPreview(container: HTMLElement): void {
		container.empty();
		const path = this.plugin.settings.siteLogoPath;
		if (!path) return;

		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const wrapper = container.createDiv({ cls: "pedia-thumb-box" });
			wrapper.createEl("img", {
				cls: "pedia-thumb-img",
				attr: { src: this.app.vault.getResourcePath(file), alt: "Logo Preview" },
			});
			wrapper.createSpan({ text: `Logo: ${file.name} (${file.extension.toUpperCase()})`, cls: "pedia-thumb-label" });
		}
	}

	private renderLucidePreview(el: HTMLElement, iconName: string): void {
		el.empty();
		if (!iconName) {
			el.createSpan({ text: "(No icon selected)", cls: "pedia-icon-preview-none" });
			return;
		}
		try {
			setIcon(el, iconName);
			el.createSpan({ text: iconName, cls: "pedia-icon-preview-text" });
		} catch {
			el.createSpan({ text: `(Unknown: ${iconName})`, cls: "pedia-icon-preview-none" });
		}
	}
}
