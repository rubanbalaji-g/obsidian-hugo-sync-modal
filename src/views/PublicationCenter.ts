import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { HugoPublisherSettings } from "src/models/settings";
import { Publisher, PublishPlan } from "src/publisher/Publisher";
import { GitHubConnection, CommitEntry } from "src/github/GitHubConnection";
import { DiagnosticModal } from "src/views/DiagnosticModal";

export class PublicationCenterModal extends Modal {
	private publisher: Publisher;
	private settings: HugoPublisherSettings;
	private saveSettings: () => Promise<void>;
	private plan: PublishPlan | null = null;
	private selectedNotes: Set<string> = new Set();
	private selectedDeletions: Set<string> = new Set();
	private recentCommits: CommitEntry[] = [];
	private isPublishing = false;

	constructor(
		app: App,
		publisher: Publisher,
		settings: HugoPublisherSettings,
		saveSettings: () => Promise<void>
	) {
		super(app);
		this.publisher = publisher;
		this.settings = settings;
		this.saveSettings = saveSettings;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pedia-hugo-modal");
		contentEl.addClass("publication-center");

		contentEl.createEl("h2", { text: "🚀 PediaNotes Publication Center" });

		const loadingEl = contentEl.createEl("p", {
			text: "Analyzing vault and comparing with GitHub...",
			cls: "pedia-loading",
		});

		try {
			this.plan = await this.publisher.preparePublishPlan();
			const conn = new GitHubConnection(this.settings);
			try {
				this.recentCommits = await conn.getRecentCommits(5);
			} catch (err) {
				console.warn("Could not fetch recent commits:", err);
			}
		} catch (err) {
			loadingEl.setText(`❌ Error preparing publish plan: ${err}`);
			return;
		}

		loadingEl.remove();

		// Check validation hard errors
		if (!this.plan.validation.valid) {
			const errorBox = contentEl.createEl("div", { cls: "pedia-alert-box error" });
			errorBox.createEl("strong", { text: "Publishing blocked by validation errors." });
			errorBox.createEl("p", {
				text: "There are conflicting or missing index flags in your frontmatter.",
			});
			new Setting(errorBox).addButton((b) =>
				b
					.setButtonText("View Diagnostic Details")
					.setCta()
					.onClick(() => {
						new DiagnosticModal(this.app, this.plan!.validation).open();
					})
			);
			return;
		}

		// Pre-select ONLY the unsynced notes (new and modified) and deletions
		this.selectedNotes = new Set(this.plan.notesToUpload.map((n) => n.repoPath));
		this.selectedDeletions = new Set(this.plan.filesToDelete);

		// Render dashboard
		this.renderDashboard(contentEl);
	}

	private renderDashboard(contentEl: HTMLElement) {
		contentEl.empty();
		contentEl.createEl("h2", { text: "🚀 PediaNotes Publication Center" });

		// Stats Bar
		const statsBar = contentEl.createEl("div", { cls: "pedia-stats-bar" });
		const publishedTotal = this.publisher.getPublishedFiles().length;

		statsBar.createEl("div", {
			cls: "pedia-stat-card",
			text: `${publishedTotal} Published Notes`,
		});
		statsBar.createEl("div", {
			cls: "pedia-stat-card",
			text: `${this.plan?.notesToUpload.length || 0} to Upload`,
		});
		statsBar.createEl("div", {
			cls: "pedia-stat-card",
			text: `${this.plan?.filesToDelete.length || 0} to Delete`,
		});
		statsBar.createEl("div", {
			cls: "pedia-stat-card",
			text: `${this.plan?.unchangedCount || 0} Synced`,
		});

		// Selection Controls Bar
		const controlsBar = contentEl.createEl("div", { cls: "pedia-selection-controls" });
		controlsBar.style.cssText = "display: flex; gap: 8px; margin: 12px 0; align-items: center;";

		const selectUnsyncedBtn = controlsBar.createEl("button", {
			text: "⚡ Select Only Yet to Sync",
			cls: "mod-cta",
		});
		selectUnsyncedBtn.onclick = () => {
			this.selectedNotes = new Set(this.plan?.notesToUpload.map((n) => n.repoPath) || []);
			this.renderDashboard(contentEl);
		};

		const selectAllBtn = controlsBar.createEl("button", { text: "Select All" });
		selectAllBtn.onclick = () => {
			const all = new Set<string>();
			this.plan?.notesToUpload.forEach((n) => all.add(n.repoPath));
			this.plan?.syncedNotes?.forEach((p) => all.add(p));
			this.selectedNotes = all;
			this.renderDashboard(contentEl);
		};

		const deselectAllBtn = controlsBar.createEl("button", { text: "Deselect All" });
		deselectAllBtn.onclick = () => {
			this.selectedNotes.clear();
			this.renderDashboard(contentEl);
		};

		// Changes Summary Container
		const changesContainer = contentEl.createEl("div", { cls: "pedia-changes-container" });

		// Upload Section (Unsynced Notes)
		if (this.plan && this.plan.notesToUpload.length > 0) {
			const upSec = changesContainer.createEl("div", { cls: "pedia-change-sec" });
			upSec.createEl("h3", { text: `📤 Notes to Upload — New or Changed (${this.plan.notesToUpload.length})` });

			const list = upSec.createEl("div", { cls: "pedia-file-tree" });
			for (const note of this.plan.notesToUpload) {
				const item = list.createEl("label", { cls: "pedia-tree-item" });
				const cb = item.createEl("input", { type: "checkbox" });
				cb.checked = this.selectedNotes.has(note.repoPath);
				cb.onchange = () => {
					if (cb.checked) this.selectedNotes.add(note.repoPath);
					else this.selectedNotes.delete(note.repoPath);
					this.updatePublishButton(contentEl);
				};
				item.createEl("span", { text: note.repoPath });
			}
		}

		// Images Section
		if (this.plan && this.plan.imagesToUpload.length > 0) {
			const imgSec = changesContainer.createEl("div", { cls: "pedia-change-sec" });
			imgSec.createEl("h3", { text: `🖼️ Images to Upload (${this.plan.imagesToUpload.length})` });
			const list = imgSec.createEl("div", { cls: "pedia-file-tree" });
			for (const img of this.plan.imagesToUpload) {
				const item = list.createEl("div", { cls: "pedia-tree-item-static" });
				item.createEl("span", { text: img.repoPath });
			}
		}

		// Delete Section
		if (this.plan && this.plan.filesToDelete.length > 0) {
			const delSec = changesContainer.createEl("div", { cls: "pedia-change-sec" });
			delSec.createEl("h3", { text: `🗑️ Remote Files to Remove (${this.plan.filesToDelete.length})` });

			const list = delSec.createEl("div", { cls: "pedia-file-tree" });
			for (const path of this.plan.filesToDelete) {
				const item = list.createEl("label", { cls: "pedia-tree-item" });
				const cb = item.createEl("input", { type: "checkbox" });
				cb.checked = this.selectedDeletions.has(path);
				cb.onchange = () => {
					if (cb.checked) this.selectedDeletions.add(path);
					else this.selectedDeletions.delete(path);
					this.updatePublishButton(contentEl);
				};
				item.createEl("span", { text: path, cls: "pedia-delete-text" });
			}
		}

		// Synced Notes (Up to date) Section
		if (this.plan && this.plan.syncedNotes && this.plan.syncedNotes.length > 0) {
			const syncedSec = changesContainer.createEl("div", { cls: "pedia-change-sec" });
			const details = syncedSec.createEl("details");
			const summary = details.createEl("summary");
			summary.style.cssText = "cursor: pointer; font-weight: 600; padding: 4px 0; color: var(--text-muted);";
			summary.setText(`✅ Synced Notes — Up to date (${this.plan.syncedNotes.length}) — Click to view`);

			const list = details.createEl("div", { cls: "pedia-file-tree" });
			list.style.cssText = "margin-top: 8px; opacity: 0.85;";
			for (const path of this.plan.syncedNotes) {
				const item = list.createEl("label", { cls: "pedia-tree-item" });
				const cb = item.createEl("input", { type: "checkbox" });
				cb.checked = this.selectedNotes.has(path);
				cb.onchange = () => {
					if (cb.checked) this.selectedNotes.add(path);
					else this.selectedNotes.delete(path);
					this.updatePublishButton(contentEl);
				};
				item.createEl("span", { text: path });
			}
		}

		if (
			this.plan &&
			this.plan.notesToUpload.length === 0 &&
			this.plan.imagesToUpload.length === 0 &&
			this.plan.filesToDelete.length === 0
		) {
			changesContainer.createEl("p", {
				text: "✨ Everything is up to date with GitHub! No pending changes.",
				cls: "pedia-success-banner",
			});
		}

		// Action Bar
		const actionsContainer = contentEl.createEl("div", { cls: "pedia-actions-bar" });
		const publishBtn = actionsContainer.createEl("button", {
			text: "Publish Changes to GitHub",
			cls: "mod-cta pedia-btn-publish",
		});
		publishBtn.id = "pedia-publish-btn";
		publishBtn.disabled =
			!this.plan ||
			(this.selectedNotes.size === 0 &&
				this.plan.imagesToUpload.length === 0 &&
				this.selectedDeletions.size === 0);

		publishBtn.onclick = async () => {
			if (this.isPublishing) return;
			this.isPublishing = true;
			publishBtn.disabled = true;
			publishBtn.setText("Publishing...");

			const progressBar = actionsContainer.createEl("div", { cls: "pedia-progress-bar" });
			const progressFill = progressBar.createEl("div", { cls: "pedia-progress-fill" });

			try {
				const filteredPlan: PublishPlan = {
					...this.plan!,
					notesToUpload: this.plan!.notesToUpload.filter((n) =>
						this.selectedNotes.has(n.repoPath)
					),
					filesToDelete: this.plan!.filesToDelete.filter((p) =>
						this.selectedDeletions.has(p)
					),
				};

				const summary = await this.publisher.executePublish(
					filteredPlan,
					(done, total) => {
						const pct = Math.round((done / Math.max(total, 1)) * 100);
						progressFill.style.width = `${pct}%`;
						publishBtn.setText(`Publishing... ${pct}%`);
					}
				);

				this.settings.lastSyncAt = new Date().toISOString();
				this.settings.lastCommitSha = summary.commitSha;
				await this.saveSettings();

				new Notice(`✅ Published ${summary.uploadedCount} files to GitHub!`);
				this.close();
			} catch (err) {
				new Notice(`❌ Publish failed: ${err}`);
				publishBtn.disabled = false;
				publishBtn.setText("Publish Changes to GitHub");
				progressBar.remove();
				this.isPublishing = false;
			}
		};

		// Rollback / Recent Commits Section
		if (this.recentCommits.length > 0) {
			const rollbackSec = contentEl.createEl("div", { cls: "pedia-rollback-sec" });
			rollbackSec.createEl("h3", { text: "⏮️ Recent Commits" });
			const commitList = rollbackSec.createEl("div", { cls: "pedia-commit-list" });

			for (const c of this.recentCommits) {
				const item = commitList.createEl("div", { cls: "pedia-commit-item" });
				const info = item.createEl("div", { cls: "pedia-commit-info" });
				info.createEl("span", { text: c.message, cls: "pedia-commit-msg" });
				info.createEl("span", {
					text: `${c.sha.substring(0, 7)} • ${new Date(c.date).toLocaleDateString()}`,
					cls: "pedia-commit-meta",
				});
			}
		}
	}

	private updatePublishButton(contentEl: HTMLElement) {
		const btn = contentEl.querySelector("#pedia-publish-btn") as HTMLButtonElement | null;
		if (btn) {
			btn.disabled =
				!this.plan ||
				(this.selectedNotes.size === 0 &&
					(this.plan.imagesToUpload.length || 0) === 0 &&
					this.selectedDeletions.size === 0);
		}
	}
}
