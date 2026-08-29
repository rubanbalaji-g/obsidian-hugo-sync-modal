import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { HugoPublisherSettings } from "src/models/settings";
import { Publisher, PublishPlan } from "src/publisher/Publisher";
import { GitHubConnection, CommitEntry } from "src/github/GitHubConnection";
import { DiagnosticModal } from "src/views/DiagnosticModal";

interface TreeFileItem {
	name: string;
	repoPath: string;
}

interface TreeFolderNode {
	name: string;
	folders: Map<string, TreeFolderNode>;
	files: TreeFileItem[];
}

function buildPathTree(repoPaths: string[]): TreeFolderNode {
	const root: TreeFolderNode = { name: "root", folders: new Map(), files: [] };
	for (const fullPath of repoPaths) {
		let clean = fullPath;
		if (clean.startsWith("content/")) clean = clean.substring("content/".length);
		else if (clean.startsWith("sources/")) clean = clean.substring("sources/".length);
		else if (clean.startsWith("static/img/")) clean = clean.substring("static/img/".length);

		const parts = clean.split("/");
		if (parts.length === 1) {
			root.files.push({ name: parts[0], repoPath: fullPath });
		} else {
			let current = root;
			for (let i = 0; i < parts.length - 1; i++) {
				const folderName = parts[i];
				if (!current.folders.has(folderName)) {
					current.folders.set(folderName, {
						name: folderName,
						folders: new Map(),
						files: [],
					});
				}
				current = current.folders.get(folderName)!;
			}
			const fileName = parts[parts.length - 1];
			current.files.push({ name: fileName, repoPath: fullPath });
		}
	}
	return root;
}

function getAllFilePaths(node: TreeFolderNode): string[] {
	const paths: string[] = [];
	for (const f of node.files) paths.push(f.repoPath);
	for (const sub of node.folders.values()) paths.push(...getAllFilePaths(sub));
	return paths;
}

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

		contentEl.createEl("h2", { text: "🚀 Publication Center" });

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

		// Pre-select: Changed Notes + Unsynced Notes + Deleted Notes
		this.selectedNotes = new Set([
			...this.plan.changedNotes.map((n) => n.repoPath),
			...this.plan.newNotes.map((n) => n.repoPath),
		]);
		this.selectedDeletions = new Set(this.plan.filesToDelete);

		// Render Tree Dashboard
		this.renderDashboard(contentEl);
	}

	private renderDashboard(contentEl: HTMLElement) {
		contentEl.empty();

		// Modal Title
		const titleRow = contentEl.createEl("div", { cls: "pedia-modal-title-row" });
		titleRow.createEl("h2", { text: "📤 Publication Center" });

		// Tree View Container
		const treeContainer = contentEl.createEl("div", { cls: "pedia-pub-tree-container" });

		// 1. CHANGED NOTES (Amber / Orange)
		const changedPaths = this.plan?.changedNotes.map((n) => n.repoPath) || [];
		if (changedPaths.length > 0) {
			this.renderCategoryTree(
				treeContainer,
				"Changed Notes",
				"pedia-cat-changed",
				"✏️",
				changedPaths,
				this.selectedNotes,
				true
			);
		}

		// 2. UNSYNCED NOTES (Cyan / Blue)
		const newPaths = this.plan?.newNotes.map((n) => n.repoPath) || [];
		if (newPaths.length > 0) {
			this.renderCategoryTree(
				treeContainer,
				"Unsynced Notes",
				"pedia-cat-new",
				"➕",
				newPaths,
				this.selectedNotes,
				true
			);
		}

		// 3. DELETED NOTES (Red)
		const deletedPaths = this.plan?.filesToDelete || [];
		if (deletedPaths.length > 0) {
			this.renderCategoryTree(
				treeContainer,
				"Deleted Notes",
				"pedia-cat-deleted",
				"🗑️",
				deletedPaths,
				this.selectedDeletions,
				true
			);
		}

		// 4. PUBLISHED / SYNCED NOTES (Emerald Green)
		const syncedPaths = this.plan?.syncedNotes || [];
		if (syncedPaths.length > 0) {
			this.renderCategoryTree(
				treeContainer,
				"Published Notes",
				"pedia-cat-synced",
				"✅",
				syncedPaths,
				this.selectedNotes,
				false // collapsed by default
			);
		}

		// If everything is completely in sync with zero pending changes
		if (
			changedPaths.length === 0 &&
			newPaths.length === 0 &&
			deletedPaths.length === 0 &&
			(this.plan?.imagesToUpload.length || 0) === 0
		) {
			const banner = treeContainer.createEl("div", { cls: "pedia-success-banner" });
			banner.setText("✨ Everything is up to date with GitHub! All notes are synced.");
		}

		// Images to Upload Section (if any)
		if (this.plan && this.plan.imagesToUpload.length > 0) {
			const imgSection = treeContainer.createEl("div", { cls: "pedia-tree-category pedia-cat-images" });
			const imgHeader = imgSection.createEl("div", { cls: "pedia-cat-header" });
			imgHeader.createEl("span", { text: `🖼️ Images to Upload (${this.plan.imagesToUpload.length})`, cls: "pedia-cat-title" });
			const imgList = imgSection.createEl("div", { cls: "pedia-cat-body" });
			for (const img of this.plan.imagesToUpload) {
				const row = imgList.createEl("div", { cls: "pedia-tree-file-row static-item" });
				row.createEl("span", { text: "🖼️", cls: "pedia-file-icon" });
				row.createEl("span", { text: img.repoPath, cls: "pedia-file-name" });
			}
		}

		// Bottom Action Bar
		const actionsContainer = contentEl.createEl("div", { cls: "pedia-actions-bar" });
		const totalSelected =
			this.selectedNotes.size +
			(this.plan?.imagesToUpload.length || 0) +
			this.selectedDeletions.size;

		const publishBtn = actionsContainer.createEl("button", {
			text: `Publish Changes to GitHub (${totalSelected})`,
			cls: "mod-cta pedia-btn-publish",
		});
		publishBtn.id = "pedia-publish-btn";
		publishBtn.disabled = totalSelected === 0;

		publishBtn.onclick = async () => {
			if (this.isPublishing) return;
			this.isPublishing = true;
			publishBtn.disabled = true;
			publishBtn.setText("Publishing...");

			const progressBar = actionsContainer.createEl("div", { cls: "pedia-progress-bar" });
			const progressFill = progressBar.createEl("div", { cls: "pedia-progress-fill" });

			try {
				const allUploads = [
					...(this.plan?.changedNotes || []),
					...(this.plan?.newNotes || []),
				];

				// Also include any selected notes from the synced section if manually checked
				const syncedCompiled = await Promise.all(
					(this.plan?.syncedNotes || [])
						.filter((p) => this.selectedNotes.has(p))
						.map(async (repoPath) => {
							const relVaultPath = repoPath.replace(/^content\//, "");
							const file = this.app.vault.getAbstractFileByPath(relVaultPath);
							if (file instanceof TFile) {
								return await this.publisher["compiler"].compile(file, new Map());
							}
							return null;
						})
				);

				const extraNotes = syncedCompiled.filter((n): n is NonNullable<typeof n> => n !== null);

				const filteredPlan: PublishPlan = {
					...this.plan!,
					notesToUpload: [
						...allUploads.filter((n) => this.selectedNotes.has(n.repoPath)),
						...extraNotes,
					],
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
				publishBtn.setText(`Publish Changes to GitHub (${totalSelected})`);
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

	private renderCategoryTree(
		parentEl: HTMLElement,
		title: string,
		colorClass: string,
		icon: string,
		paths: string[],
		selectedSet: Set<string>,
		defaultOpen = true
	) {
		const tree = buildPathTree(paths);
		const allPaths = getAllFilePaths(tree);

		const categoryEl = parentEl.createEl("div", { cls: `pedia-tree-category ${colorClass}` });

		// Header Row: [Caret] [Checkbox] [Title] [Count]
		const headerEl = categoryEl.createEl("div", { cls: "pedia-cat-header" });

		const caret = headerEl.createEl("span", {
			text: defaultOpen ? "▾" : "▸",
			cls: "pedia-tree-caret",
		});

		const categoryCb = headerEl.createEl("input", { type: "checkbox", cls: "pedia-tree-cb" });
		const updateCategoryCbState = () => {
			const checkedCount = allPaths.filter((p) => selectedSet.has(p)).length;
			if (checkedCount === 0) {
				categoryCb.checked = false;
				categoryCb.indeterminate = false;
			} else if (checkedCount === allPaths.length) {
				categoryCb.checked = true;
				categoryCb.indeterminate = false;
			} else {
				categoryCb.checked = false;
				categoryCb.indeterminate = true;
			}
		};
		updateCategoryCbState();

		categoryCb.onchange = (e) => {
			e.stopPropagation();
			const isChecked = categoryCb.checked;
			for (const p of allPaths) {
				if (isChecked) selectedSet.add(p);
				else selectedSet.delete(p);
			}
			this.renderDashboard(this.contentEl);
		};

		const titleEl = headerEl.createEl("span", {
			text: `${title} (${paths.length})`,
			cls: "pedia-cat-title",
		});

		const bodyEl = categoryEl.createEl("div", { cls: "pedia-cat-body" });
		bodyEl.style.display = defaultOpen ? "block" : "none";

		// Click header to collapse/expand
		headerEl.onclick = (e) => {
			if (e.target === categoryCb) return;
			const isOpen = bodyEl.style.display === "block";
			bodyEl.style.display = isOpen ? "none" : "block";
			caret.setText(isOpen ? "▸" : "▾");
		};

		// Render Root Files First (e.g. About.md, index.md)
		tree.files.sort((a, b) => a.name.localeCompare(b.name));
		for (const file of tree.files) {
			this.renderFileRow(bodyEl, file, selectedSet, () => {
				updateCategoryCbState();
				this.updatePublishCount();
			});
		}

		// Render Folders Sorted Alphabetically
		const folderNames = Array.from(tree.folders.keys()).sort((a, b) => a.localeCompare(b));
		for (const fName of folderNames) {
			const subNode = tree.folders.get(fName)!;
			this.renderFolderNode(bodyEl, subNode, selectedSet, defaultOpen, () => {
				updateCategoryCbState();
				this.updatePublishCount();
			});
		}
	}

	private renderFolderNode(
		parentEl: HTMLElement,
		node: TreeFolderNode,
		selectedSet: Set<string>,
		defaultOpen: boolean,
		onItemChanged: () => void
	) {
		const folderPaths = getAllFilePaths(node);
		const folderEl = parentEl.createEl("div", { cls: "pedia-tree-folder" });

		// Folder Header: [Caret] [📁 Folder Icon] [Checkbox] [Folder Name] [Count]
		const header = folderEl.createEl("div", { cls: "pedia-folder-header" });

		const caret = header.createEl("span", {
			text: defaultOpen ? "▾" : "▸",
			cls: "pedia-tree-caret",
		});

		const folderIcon = header.createEl("span", { text: "📁", cls: "pedia-folder-icon" });

		const cb = header.createEl("input", { type: "checkbox", cls: "pedia-tree-cb" });
		const updateFolderCb = () => {
			const checkedCount = folderPaths.filter((p) => selectedSet.has(p)).length;
			if (checkedCount === 0) {
				cb.checked = false;
				cb.indeterminate = false;
			} else if (checkedCount === folderPaths.length) {
				cb.checked = true;
				cb.indeterminate = false;
			} else {
				cb.checked = false;
				cb.indeterminate = true;
			}
		};
		updateFolderCb();

		cb.onchange = (e) => {
			e.stopPropagation();
			const isChecked = cb.checked;
			for (const p of folderPaths) {
				if (isChecked) selectedSet.add(p);
				else selectedSet.delete(p);
			}
			onItemChanged();
			// Re-render folder children checkboxes
			childrenEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((c) => {
				c.checked = isChecked;
				c.indeterminate = false;
			});
		};

		header.createEl("span", { text: node.name, cls: "pedia-folder-name" });
		header.createEl("span", { text: `(${folderPaths.length})`, cls: "pedia-folder-count" });

		const childrenEl = folderEl.createEl("div", { cls: "pedia-folder-children" });
		childrenEl.style.display = defaultOpen ? "block" : "none";

		header.onclick = (e) => {
			if (e.target === cb) return;
			const isOpen = childrenEl.style.display === "block";
			childrenEl.style.display = isOpen ? "none" : "block";
			caret.setText(isOpen ? "▸" : "▾");
		};

		// Render Files inside this folder
		node.files.sort((a, b) => a.name.localeCompare(b.name));
		for (const file of node.files) {
			this.renderFileRow(childrenEl, file, selectedSet, () => {
				updateFolderCb();
				onItemChanged();
			});
		}

		// Render Nested Subfolders (if any)
		const subNames = Array.from(node.folders.keys()).sort((a, b) => a.localeCompare(b));
		for (const subName of subNames) {
			this.renderFolderNode(childrenEl, node.folders.get(subName)!, selectedSet, defaultOpen, () => {
				updateFolderCb();
				onItemChanged();
			});
		}
	}

	private renderFileRow(
		parentEl: HTMLElement,
		file: TreeFileItem,
		selectedSet: Set<string>,
		onChanged: () => void
	) {
		const row = parentEl.createEl("div", { cls: "pedia-tree-file-row" });

		const cb = row.createEl("input", { type: "checkbox", cls: "pedia-tree-cb" });
		cb.checked = selectedSet.has(file.repoPath);

		cb.onchange = () => {
			if (cb.checked) selectedSet.add(file.repoPath);
			else selectedSet.delete(file.repoPath);
			onChanged();
		};

		row.createEl("span", { text: "📄", cls: "pedia-file-icon" });
		row.createEl("span", { text: file.name, cls: "pedia-file-name" });
	}

	private updatePublishCount() {
		const btn = this.contentEl.querySelector("#pedia-publish-btn") as HTMLButtonElement | null;
		if (btn && this.plan) {
			const totalSelected =
				this.selectedNotes.size +
				(this.plan.imagesToUpload.length || 0) +
				this.selectedDeletions.size;
			btn.setText(`Publish Changes to GitHub (${totalSelected})`);
			btn.disabled = totalSelected === 0;
		}
	}
}
