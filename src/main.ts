import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, HugoPublisherSettings } from "src/models/settings";
import { Publisher } from "src/publisher/Publisher";
import { SettingsTab } from "src/views/SettingsTab";
import { PublicationCenterModal } from "src/views/PublicationCenter";
import { NavigationOrderModal } from "src/views/NavigationOrderModal";
import { ImageConsolidationModal } from "src/migration/ImageConsolidator";

export default class PediaNotesHugoPlugin extends Plugin {
	settings: HugoPublisherSettings = DEFAULT_SETTINGS;
	publisher: Publisher;
	private statusBarItem: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.publisher = new Publisher(this.app.vault, this.app.metadataCache, this.settings);

		// Ribbon Icon: Open Publication Center
		this.addRibbonIcon("send", "PediaNotes Hugo: Publication Center", () => {
			new PublicationCenterModal(
				this.app,
				this.publisher,
				this.settings,
				() => this.saveSettings()
			).open();
		});

		// Status Bar Item
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass("pedia-status-bar");
		this.updateStatusBar();
		this.statusBarItem.onClickEvent(() => {
			new PublicationCenterModal(
				this.app,
				this.publisher,
				this.settings,
				() => this.saveSettings()
			).open();
		});

		// Commands
		this.addCommand({
			id: "open-publication-center",
			name: "Open Publication Center",
			callback: () => {
				new PublicationCenterModal(
					this.app,
					this.publisher,
					this.settings,
					() => this.saveSettings()
				).open();
			},
		});

		this.addCommand({
			id: "publish-current-note",
			name: "Publish Current Note to Hugo",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === "md") {
					if (!checking) {
						this.publishActiveNote(activeFile);
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "toggle-publish-flag",
			name: "Toggle 'publish: true' Flag on Current Note",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === "md") {
					if (!checking) {
						this.togglePublishFlag(activeFile);
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "reorder-section-navigation",
			name: "Reorder Section Navigation (Set Weight)",
			callback: () => {
				new NavigationOrderModal(this.app).open();
			},
		});

		this.addCommand({
			id: "consolidate-vault-images",
			name: "Consolidate Vault Images into 'img/'",
			callback: () => {
				new ImageConsolidationModal(this.app, async () => {
					this.settings.imageMigrationDone = true;
					await this.saveSettings();
				}).open();
			},
		});

		this.addCommand({
			id: "preview-live-site",
			name: "Preview Live Hugo Site in Browser",
			callback: () => {
				if (!this.settings.siteBaseUrl) {
					new Notice("Please configure Site Base URL in settings first.");
					return;
				}
				window.open(this.settings.siteBaseUrl, "_blank");
			},
		});

		// File Menu: Right-click note to publish
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item) => {
						item
							.setTitle("Publish Note to Hugo")
							.setIcon("upload-cloud")
							.onClick(() => this.publishActiveNote(file));
					});
				}
			})
		);

		// Event listeners for updating status bar badge
		this.registerEvent(this.app.metadataCache.on("changed", () => this.updateStatusBar()));
		this.registerEvent(this.app.vault.on("delete", () => this.updateStatusBar()));

		// Settings Tab
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {
		// Clean up
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.publisher) {
			this.publisher.updateSettings(this.settings);
		}
		this.updateStatusBar();
	}

	private updateStatusBar() {
		if (!this.statusBarItem) return;
		const published = this.publisher?.getPublishedFiles() ?? [];
		this.statusBarItem.setText(`📡 Hugo: ${published.length} notes`);
		this.statusBarItem.setAttribute(
			"aria-label",
			`${published.length} note(s) marked with publish: true. Click to open Publication Center.`
		);
	}

	private async togglePublishFlag(file: TFile) {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = fm["publish"] === true;
			fm["publish"] = !current;
			new Notice(
				!current
					? `✅ Set publish: true for "${file.basename}"`
					: `⭕ Removed publish flag from "${file.basename}"`
			);
		});
		this.updateStatusBar();
	}

	private async publishActiveNote(file: TFile) {
		const fm = this.app.metadataCache.getCache(file.path)?.frontmatter;
		if (fm?.["publish"] !== true) {
			// Offer to add publish: true automatically
			await this.app.fileManager.processFrontMatter(file, (f) => {
				f["publish"] = true;
			});
			new Notice(`Added 'publish: true' to ${file.basename}`);
		}

		new Notice(`Publishing ${file.basename}...`);
		try {
			const sha = await this.publisher.publishSingleFile(file);
			new Notice(`🎉 Published ${file.basename}! Commit: ${sha.slice(0, 7)}`);
			this.updateStatusBar();
		} catch (err) {
			new Notice(`❌ Failed to publish ${file.basename}: ${err}`);
		}
	}
}
