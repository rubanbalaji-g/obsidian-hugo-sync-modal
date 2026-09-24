import { App, Modal, MarkdownRenderer, Setting } from "obsidian";

export class FooterEditorModal extends Modal {
	private format: "markdown" | "html";
	private content: string;
	private onSave: (format: "markdown" | "html", content: string) => Promise<void>;
	private onSaveAndSync?: (format: "markdown" | "html", content: string) => Promise<void>;

	private editorEl!: HTMLTextAreaElement;
	private previewContainer!: HTMLElement;
	private isPreviewing = false;

	constructor(
		app: App,
		currentFormat: "markdown" | "html",
		currentContent: string,
		onSave: (format: "markdown" | "html", content: string) => Promise<void>,
		onSaveAndSync?: (format: "markdown" | "html", content: string) => Promise<void>
	) {
		super(app);
		this.format = currentFormat || "markdown";
		this.content = currentContent || "";
		this.onSave = onSave;
		this.onSaveAndSync = onSaveAndSync;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("pedia-footer-editor-modal");
		contentEl.addClass("pedia-footer-editor-content");
		contentEl.empty();

		// Modal Header
		const headerWrap = contentEl.createDiv({ cls: "pedia-footer-modal-header" });
		headerWrap.createEl("h2", { text: "Edit Site Footer" });
		headerWrap.createEl("p", {
			text: "Customize the footer displayed on your Hugo site. Select Markdown or raw HTML. If left blank, no footer will be rendered on the site.",
			cls: "setting-item-description",
		});

		// Format Selector Row
		const controlsRow = contentEl.createDiv({ cls: "pedia-footer-controls-row" });
		new Setting(controlsRow)
			.setName("Footer Format")
			.setDesc("Choose between Markdown formatting or raw HTML")
			.addDropdown((dd) =>
				dd
					.addOption("markdown", "Markdown")
					.addOption("html", "Raw HTML")
					.setValue(this.format)
					.onChange((val: "markdown" | "html") => {
						this.format = val;
						if (this.isPreviewing) {
							this.updatePreview();
						}
					})
			);

		// Editor & Preview Tab Buttons
		const tabRow = contentEl.createDiv({ cls: "pedia-footer-tab-row" });
		const editTabBtn = tabRow.createEl("button", {
			text: "Edit Code",
			cls: "pedia-tab-btn is-active",
		});
		const previewTabBtn = tabRow.createEl("button", {
			text: "Live Preview",
			cls: "pedia-tab-btn",
		});

		// Editor Area
		const editorWrap = contentEl.createDiv({ cls: "pedia-footer-editor-wrap" });
		this.editorEl = editorWrap.createEl("textarea", {
			cls: "pedia-footer-textarea",
			attr: {
				placeholder:
					this.format === "markdown"
						? "Write footer in Markdown (e.g. © 2026 Dr. Rubanbalaji | [Privacy Policy](/privacy))"
						: '<div class="custom-footer">\n  <p>© 2026 My Site</p>\n</div>',
			},
		});
		this.editorEl.value = this.content;

		// Support indentation with Tab key
		this.editorEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Tab") {
				e.preventDefault();
				const start = this.editorEl.selectionStart;
				const end = this.editorEl.selectionEnd;
				this.editorEl.value =
					this.editorEl.value.substring(0, start) + "\t" + this.editorEl.value.substring(end);
				this.editorEl.selectionStart = this.editorEl.selectionEnd = start + 1;
			}
		});

		// Ctrl+Enter / Cmd+Enter to save immediately
		this.editorEl.addEventListener("keydown", async (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
				e.preventDefault();
				this.content = this.editorEl.value;
				await this.onSave(this.format, this.content);
				this.close();
			}
		});

		this.editorEl.addEventListener("input", () => {
			this.content = this.editorEl.value;
		});

		// Preview Area
		this.previewContainer = contentEl.createDiv({ cls: "pedia-footer-preview-wrap" });
		this.previewContainer.style.display = "none";

		// Tab Switching
		editTabBtn.onclick = () => {
			this.isPreviewing = false;
			editTabBtn.addClass("is-active");
			previewTabBtn.removeClass("is-active");
			editorWrap.style.display = "flex";
			this.previewContainer.style.display = "none";
		};

		previewTabBtn.onclick = () => {
			this.isPreviewing = true;
			previewTabBtn.addClass("is-active");
			editTabBtn.removeClass("is-active");
			editorWrap.style.display = "none";
			this.previewContainer.style.display = "flex";
			this.updatePreview();
		};

		// Presets helper row
		const presetsRow = contentEl.createDiv({ cls: "pedia-footer-presets-row" });
		presetsRow.createSpan({ text: "Quick Starter Templates: ", cls: "setting-item-description" });

		const insertBtn = (text: string, template: string, fmt: "markdown" | "html") => {
			presetsRow.createEl("button", { text, cls: "pedia-preset-chip" }).onclick = () => {
				this.format = fmt;
				this.content = template;
				this.editorEl.value = template;
				const dd = controlsRow.querySelector("select") as HTMLSelectElement;
				if (dd) dd.value = fmt;
				if (this.isPreviewing) this.updatePreview();
			};
		};

		insertBtn(
			"Markdown Disclaimer",
			"© 2026 **PediaNotes** • [Home](https://pedianotes.in) • [Contact](mailto:hi@pedianotes.in)\n\n*These notes are intended for educational and exam preparation purposes only.*",
			"markdown"
		);

		insertBtn(
			"HTML Two-Column",
			`<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
  <div>
    <strong>PediaNotes</strong> © 2026 | High-Yield Medical Notes
  </div>
  <div>
    <a href="https://pedianotes.in">Home</a> • <a href="mailto:hi@pedianotes.in">Contact</a>
  </div>
</div>`,
			"html"
		);

		// Action Buttons Bar
		const actionsRow = contentEl.createDiv({ cls: "pedia-footer-actions-row" });

		const clearBtn = actionsRow.createEl("button", {
			text: "Clear Footer",
			cls: "mod-warning",
		});
		clearBtn.onclick = async () => {
			this.content = "";
			await this.onSave(this.format, "");
			this.close();
		};

		const cancelBtn = actionsRow.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.onclick = () => this.close();

		const saveBtn = actionsRow.createEl("button", {
			text: "Save Footer",
		});
		saveBtn.onclick = async () => {
			this.content = this.editorEl.value;
			await this.onSave(this.format, this.content);
			this.close();
		};

		if (this.onSaveAndSync) {
			const saveAndSyncBtn = actionsRow.createEl("button", {
				text: "Save & Sync to GitHub",
				cls: "mod-cta",
			});
			saveAndSyncBtn.onclick = async () => {
				this.content = this.editorEl.value;
				saveAndSyncBtn.setDisabled(true);
				saveAndSyncBtn.setText("Syncing...");
				try {
					if (this.onSaveAndSync) {
						await this.onSaveAndSync(this.format, this.content);
					}
					this.close();
				} catch (err: any) {
					saveAndSyncBtn.setDisabled(false);
					saveAndSyncBtn.setText("Save & Sync to GitHub");
				}
			};
		}
	}

	private updatePreview(): void {
		this.previewContainer.empty();
		if (!this.content.trim()) {
			this.previewContainer.createEl("div", {
				cls: "pedia-preview-empty",
				text: "(Footer is blank. No footer will be rendered on the site.)",
			});
			return;
		}

		if (this.format === "html") {
			const div = this.previewContainer.createDiv({ cls: "pedia-preview-html" });
			div.innerHTML = this.content;
		} else {
			const div = this.previewContainer.createDiv({ cls: "pedia-preview-markdown" });
			MarkdownRenderer.render(this.app, this.content, div, "", null as any);
		}
	}
}
