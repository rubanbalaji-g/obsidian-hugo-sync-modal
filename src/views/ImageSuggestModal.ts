import { App, FuzzySuggestModal, TFile } from "obsidian";

const VALID_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "svg", "ico", "webp", "gif"]);

export class ImageSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder("Search vault images (PNG, SVG, ICO, JPG, WEBP)...");
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((file) =>
			VALID_IMAGE_EXTENSIONS.has(file.extension.toLowerCase())
		);
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	renderSuggestion(file: { item: TFile }, el: HTMLElement): void {
		el.addClass("pedia-image-suggest-item");
		const row = el.createDiv({ cls: "pedia-image-suggest-row" });
		const extBadge = row.createSpan({ cls: "pedia-image-suggest-badge", text: file.item.extension.toUpperCase() });
		row.createSpan({ cls: "pedia-image-suggest-name", text: file.item.name });
		el.createDiv({ cls: "pedia-image-suggest-path", text: file.item.path });
	}

	onChooseItem(item: TFile): void {
		this.onSelect(item);
	}
}
