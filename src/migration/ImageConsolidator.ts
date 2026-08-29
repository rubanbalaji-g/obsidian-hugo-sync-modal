import { App, Modal, Notice, Setting, TFile, TFolder, Vault } from "obsidian";

export interface MigrationPreviewItem {
	file: TFile;
	oldLinks: string[];
	newLinks: string[];
}

export interface MigrationSummary {
	imagesMoved: number;
	notesUpdated: number;
}

export class ImageConsolidator {
	private app: App;
	private vault: Vault;

	constructor(app: App) {
		this.app = app;
		this.vault = app.vault;
	}

	async analyzeMigration(): Promise<{
		imagesToConsolidate: TFile[];
		affectedNotes: MigrationPreviewItem[];
	}> {
		const allFiles = this.vault.getFiles();
		const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

		// Find images in nested folders (like img/user/+Images, img/user/+İmages)
		const imagesToConsolidate = allFiles.filter((f) => {
			if (!imageExtensions.has(f.extension.toLowerCase())) return false;
			// If it's already directly in 'img/' root, skip
			if (f.parent?.path === "img") return false;
			// If it's in any subfolder under img/ or has +Images in path
			return f.path.startsWith("img/") || f.path.includes("+Images") || f.path.includes("+İmages");
		});

		const affectedNotes: MigrationPreviewItem[] = [];
		const markdownFiles = this.vault.getMarkdownFiles();

		for (const note of markdownFiles) {
			const content = await this.vault.cachedRead(note);
			const oldLinks: string[] = [];
			const newLinks: string[] = [];

			// Match wikilinks containing paths or subfolder prefixes
			const wikilinkRe = /!\[\[([^\]]+)\]\]/g;
			let m: RegExpExecArray | null;
			while ((m = wikilinkRe.exec(content)) !== null) {
				const raw = m[1];
				const unescaped = raw.replace(/\\\|/g, "|");
				const namePart = unescaped.split("|")[0].trim();
				if (namePart.includes("/") || namePart.includes("\\") || namePart.includes("+Images") || namePart.includes("+İmages")) {
					const cleanName = namePart.split("/").pop()?.split("\\").pop() ?? namePart;
					oldLinks.push(m[0]);
					newLinks.push(`![[${cleanName}]]`);
				}
			}

			// Match markdown links
			const mdRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
			while ((m = mdRe.exec(content)) !== null) {
				const raw = m[2];
				if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
					if (raw.includes("+Images") || raw.includes("+İmages") || raw.includes("img/user/")) {
						const cleanName = decodeURIComponent(raw.split("|")[0].split("/").pop()?.split("\\").pop() ?? raw);
						oldLinks.push(m[0]);
						newLinks.push(`![${m[1]}](/img/${cleanName})`);
					}
				}
			}

			if (oldLinks.length > 0) {
				affectedNotes.push({ file: note, oldLinks, newLinks });
			}
		}

		return { imagesToConsolidate, affectedNotes };
	}

	async executeMigration(): Promise<MigrationSummary> {
		const { imagesToConsolidate, affectedNotes } = await this.analyzeMigration();

		// Ensure 'img' root folder exists
		let targetFolder = this.vault.getAbstractFileByPath("img");
		if (!targetFolder) {
			await this.vault.createFolder("img");
		}

		let imagesMoved = 0;
		for (const img of imagesToConsolidate) {
			const targetPath = `img/${img.name}`;
			const existing = this.vault.getAbstractFileByPath(targetPath);
			if (!existing) {
				try {
					await this.app.fileManager.renameFile(img, targetPath);
					imagesMoved++;
				} catch (err) {
					console.warn(`Could not move ${img.path} to ${targetPath}:`, err);
				}
			}
		}

		let notesUpdated = 0;
		for (const item of affectedNotes) {
			let content = await this.vault.read(item.file);
			for (let i = 0; i < item.oldLinks.length; i++) {
				content = content.split(item.oldLinks[i]).join(item.newLinks[i]);
			}
			await this.vault.modify(item.file, content);
			notesUpdated++;
		}

		return { imagesMoved, notesUpdated };
	}
}

export class ImageConsolidationModal extends Modal {
	private consolidator: ImageConsolidator;
	private onComplete: () => void;

	constructor(app: App, onComplete: () => void) {
		super(app);
		this.consolidator = new ImageConsolidator(app);
		this.onComplete = onComplete;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pedia-hugo-modal");

		contentEl.createEl("h2", { text: "🖼️ Image Consolidation Migration" });
		contentEl.createEl("p", {
			text: "This one-time migration consolidates all vault images from subfolders into a single unified 'img/' directory and updates note links accordingly.",
		});

		const loadingEl = contentEl.createEl("p", { text: "Scanning vault..." });
		const analysis = await this.consolidator.analyzeMigration();
		loadingEl.remove();

		const statsEl = contentEl.createEl("div", { cls: "pedia-migration-stats" });
		statsEl.createEl("div", { text: `📁 Images to move: ${analysis.imagesToConsolidate.length}` });
		statsEl.createEl("div", { text: `📝 Notes with outdated paths: ${analysis.affectedNotes.length}` });

		if (analysis.imagesToConsolidate.length === 0 && analysis.affectedNotes.length === 0) {
			contentEl.createEl("p", {
				text: "✅ All images are already consolidated in 'img/'! No migration needed.",
				cls: "pedia-success-text",
			});
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Close").onClick(() => this.close())
			);
			return;
		}

		const previewList = contentEl.createEl("div", { cls: "pedia-preview-list" });
		for (const item of analysis.affectedNotes.slice(0, 10)) {
			const row = previewList.createEl("div", { cls: "pedia-preview-item" });
			row.createEl("strong", { text: item.file.basename });
			row.createEl("span", { text: ` (${item.oldLinks.length} link${item.oldLinks.length > 1 ? "s" : ""})` });
		}
		if (analysis.affectedNotes.length > 10) {
			previewList.createEl("div", {
				text: `...and ${analysis.affectedNotes.length - 10} more notes.`,
				cls: "pedia-muted",
			});
		}

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Start Consolidation")
					.setCta()
					.onClick(async () => {
						b.setDisabled(true);
						b.setButtonText("Migrating...");
						try {
							const summary = await this.consolidator.executeMigration();
							new Notice(
								`Migration complete! Moved ${summary.imagesMoved} image(s), updated ${summary.notesUpdated} note(s).`
							);
							this.onComplete();
							this.close();
						} catch (err) {
							new Notice(`Migration error: ${err}`);
							b.setDisabled(false);
							b.setButtonText("Start Consolidation");
						}
					})
			)
			.addButton((b) =>
				b.setButtonText("Cancel").onClick(() => this.close())
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
