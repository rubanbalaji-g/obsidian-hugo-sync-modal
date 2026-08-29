import { App, Modal, Setting, TFile } from "obsidian";
import { ValidationResult } from "src/publisher/Validator";

export class DiagnosticModal extends Modal {
	private result: ValidationResult;

	constructor(app: App, result: ValidationResult) {
		super(app);
		this.result = result;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pedia-hugo-modal");

		contentEl.createEl("h2", { text: "⚠️ Frontmatter Validation Issues" });
		contentEl.createEl("p", {
			text: "The site publishing rules were violated. Please fix the following issues before publishing to ensure Hugo builds correctly.",
			cls: "pedia-modal-desc",
		});

		// Errors section
		if (this.result.errors.length > 0) {
			const errorContainer = contentEl.createEl("div", { cls: "pedia-diagnostic-section" });
			errorContainer.createEl("h3", { text: "❌ Hard Errors (Blocks Publish)" });

			for (const err of this.result.errors) {
				const card = errorContainer.createEl("div", { cls: "pedia-diagnostic-card error" });
				card.createEl("div", { text: `Rule: ${err.rule}`, cls: "pedia-card-rule" });
				card.createEl("div", { text: err.message, cls: "pedia-card-msg" });

				if (err.files.length > 0) {
					const fileList = card.createEl("ul", { cls: "pedia-card-files" });
					for (const filePath of err.files) {
						const li = fileList.createEl("li");
						const link = li.createEl("a", { text: filePath, cls: "pedia-file-link" });
						link.addEventListener("click", () => {
							const file = this.app.vault.getAbstractFileByPath(filePath);
							if (file instanceof TFile) {
								this.app.workspace.getLeaf(false).openFile(file);
								this.close();
							}
						});
					}
				}
			}
		}

		// Warnings section
		if (this.result.warnings.length > 0) {
			const warnContainer = contentEl.createEl("div", { cls: "pedia-diagnostic-section" });
			warnContainer.createEl("h3", { text: "⚠️ Warnings (Site will build, but structure may be incomplete)" });

			for (const warn of this.result.warnings) {
				const card = warnContainer.createEl("div", { cls: "pedia-diagnostic-card warning" });
				card.createEl("div", { text: `Rule: ${warn.rule}`, cls: "pedia-card-rule" });
				card.createEl("div", { text: warn.message, cls: "pedia-card-msg" });
			}
		}

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Dismiss").setCta().onClick(() => this.close())
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
