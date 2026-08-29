import { App, Modal, Notice, Setting, TFile } from "obsidian";

interface NoteOrderItem {
	file: TFile;
	title: string;
	weight: number;
}

export class NavigationOrderModal extends Modal {
	private selectedFolder: string = "";
	private notesInFolder: NoteOrderItem[] = [];

	constructor(app: App) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pedia-hugo-modal");

		contentEl.createEl("h2", { text: "🌳 Section Navigation Ordering" });
		contentEl.createEl("p", {
			text: "Reorder notes within any specialty folder. When saved, this updates the 'weight' frontmatter in each note to control sidebar and section list ordering in Hugo.",
			cls: "pedia-modal-desc",
		});

		// Find all specialty folders that contain markdown files
		const folders = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const folderName = file.parent?.name;
			if (folderName && folderName !== "/" && !file.parent?.isRoot()) {
				folders.add(folderName);
			}
		}
		const folderList = Array.from(folders).sort();
		if (folderList.length === 0) {
			contentEl.createEl("p", { text: "No specialty folders found." });
			return;
		}

		if (!this.selectedFolder && folderList.length > 0) {
			this.selectedFolder = folderList[0];
		}

		const controlsContainer = contentEl.createEl("div", { cls: "pedia-order-controls" });
		new Setting(controlsContainer)
			.setName("Specialty Folder")
			.setDesc("Select the folder you want to reorder")
			.addDropdown((dd) => {
				for (const f of folderList) {
					dd.addOption(f, f);
				}
				dd.setValue(this.selectedFolder);
				dd.onChange((val) => {
					this.selectedFolder = val;
					this.loadNotesForFolder();
					this.renderNoteList(listContainer);
				});
			});

		const listContainer = contentEl.createEl("div", { cls: "pedia-order-list-container" });
		this.loadNotesForFolder();
		this.renderNoteList(listContainer);

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Save Order to Frontmatter")
					.setCta()
					.onClick(async () => {
						await this.saveOrder();
						this.close();
					})
			)
			.addButton((b) =>
				b.setButtonText("Close").onClick(() => this.close())
			);
	}

	private loadNotesForFolder() {
		const files = this.app.vault.getMarkdownFiles().filter((f) => f.parent?.name === this.selectedFolder);
		this.notesInFolder = files.map((file) => {
			const fm = this.app.metadataCache.getCache(file.path)?.frontmatter;
			const weight = typeof fm?.["weight"] === "number" ? fm["weight"] : 999;
			return {
				file,
				title: file.basename,
				weight,
			};
		});

		// Sort by weight then title
		this.notesInFolder.sort((a, b) => {
			if (a.weight !== b.weight) return a.weight - b.weight;
			return a.title.localeCompare(b.title);
		});
	}

	private renderNoteList(container: HTMLElement) {
		container.empty();

		if (this.notesInFolder.length === 0) {
			container.createEl("p", { text: "No notes found in this folder." });
			return;
		}

		const list = container.createEl("div", { cls: "pedia-order-list" });

		for (let i = 0; i < this.notesInFolder.length; i++) {
			const item = this.notesInFolder[i];
			const row = list.createEl("div", { cls: "pedia-order-row" });

			const rank = row.createEl("span", { text: `${i + 1}.`, cls: "pedia-order-rank" });
			const title = row.createEl("span", { text: item.title, cls: "pedia-order-title" });

			const btnGroup = row.createEl("div", { cls: "pedia-order-buttons" });

			const upBtn = btnGroup.createEl("button", { text: "▲", cls: "pedia-btn-mini" });
			upBtn.disabled = i === 0;
			upBtn.onclick = () => {
				const temp = this.notesInFolder[i - 1];
				this.notesInFolder[i - 1] = this.notesInFolder[i];
				this.notesInFolder[i] = temp;
				this.renderNoteList(container);
			};

			const downBtn = btnGroup.createEl("button", { text: "▼", cls: "pedia-btn-mini" });
			downBtn.disabled = i === this.notesInFolder.length - 1;
			downBtn.onclick = () => {
				const temp = this.notesInFolder[i + 1];
				this.notesInFolder[i + 1] = this.notesInFolder[i];
				this.notesInFolder[i] = temp;
				this.renderNoteList(container);
			};
		}
	}

	private async saveOrder() {
		let count = 0;
		for (let i = 0; i < this.notesInFolder.length; i++) {
			const item = this.notesInFolder[i];
			const targetWeight = i + 1;

			await this.app.fileManager.processFrontMatter(item.file, (fm) => {
				fm["weight"] = targetWeight;
			});
			count++;
		}
		new Notice(`Updated navigation weight on ${count} notes in ${this.selectedFolder}!`);
	}

	onClose() {
		this.contentEl.empty();
	}
}
