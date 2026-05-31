import { App, Modal } from "obsidian";
import { moment } from "obsidian";

/**
 * Asks the user whether to create a daily note for a day that has none.
 * Resolves true on confirm, false on cancel/dismiss.
 */
export class CreateNoteModal extends Modal {
	private resolved = false;
	private resolve!: (value: boolean) => void;
	private readonly result: Promise<boolean>;

	constructor(app: App, private date: moment.Moment, private targetPath: string) {
		super(app);
		this.result = new Promise((resolve) => (this.resolve = resolve));
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText("Create daily note?");

		const pretty = this.date.format("dddd, LL");
		contentEl.createEl("p", {
			text: `No daily note exists for ${pretty}.`,
		});
		contentEl.createEl("p", {
			cls: "better-calendar-modal-path",
			text: this.targetPath,
		});

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.finish(false));

		const create = buttons.createEl("button", { text: "Create", cls: "mod-cta" });
		create.addEventListener("click", () => this.finish(true));
		create.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		// If dismissed without a choice (Esc / click-out), treat as cancel.
		if (!this.resolved) this.resolve(false);
	}

	private finish(value: boolean): void {
		this.resolved = true;
		this.resolve(value);
		this.close();
	}

	/** Open the modal and await the user's choice. */
	confirm(): Promise<boolean> {
		this.open();
		return this.result;
	}
}
