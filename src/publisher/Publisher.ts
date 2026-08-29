import { MetadataCache, Notice, TFile, Vault } from "obsidian";
import { Base64 } from "js-base64";
import { HugoPublisherSettings } from "src/models/settings";
import { GitHubConnection } from "src/github/GitHubConnection";
import { CommitBuilder, FileToCommit } from "src/github/CommitBuilder";
import { NoteCompiler, CompiledNote } from "src/compiler/NoteCompiler";
import { buildBacklinkMap } from "src/compiler/BacklinkMapper";
import { validatePublishedNotes, ValidationResult } from "src/publisher/Validator";
import { diffFiles, DiffResult, RemoteFile } from "src/publisher/FileDiffer";
import { collectImageRefs, ImageRef } from "src/utils/imageCollector";

export interface PublishSummary {
	uploadedCount: number;
	deletedCount: number;
	commitSha: string;
	durationMs: number;
}

export interface PublishPlan {
	validation: ValidationResult;
	notesToUpload: CompiledNote[];
	imagesToUpload: Array<{ repoPath: string; file: TFile }>;
	filesToDelete: string[];
	syncedNotes: string[];
	unchangedCount: number;
}

export class Publisher {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private settings: HugoPublisherSettings;
	private compiler: NoteCompiler;
	private connection: GitHubConnection;
	private commitBuilder: CommitBuilder;

	constructor(vault: Vault, metadataCache: MetadataCache, settings: HugoPublisherSettings) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.compiler = new NoteCompiler(vault, metadataCache, settings);
		this.connection = new GitHubConnection(settings);
		this.commitBuilder = new CommitBuilder(this.connection);
	}

	updateSettings(settings: HugoPublisherSettings) {
		this.settings = settings;
		this.compiler = new NoteCompiler(this.vault, this.metadataCache, settings);
		this.connection = new GitHubConnection(settings);
		this.commitBuilder = new CommitBuilder(this.connection);
	}

	getPublishedFiles(): TFile[] {
		return this.vault.getMarkdownFiles().filter((file) => {
			const fm = this.metadataCache.getCache(file.path)?.frontmatter;
			return fm?.["publish"] === true;
		});
	}

	async preparePublishPlan(): Promise<PublishPlan> {
		const publishedFiles = this.getPublishedFiles();
		const validation = validatePublishedNotes(publishedFiles, this.metadataCache);

		if (!validation.valid) {
			return {
				validation,
				notesToUpload: [],
				imagesToUpload: [],
				filesToDelete: [],
				unchangedCount: 0,
			};
		}

		// 1. Build backlink map
		const backlinkMap = this.settings.computeBacklinks
			? buildBacklinkMap(publishedFiles, this.vault, this.metadataCache)
			: new Map();

		// 2. Compile notes & collect images
		const compiledNotes: CompiledNote[] = [];
		const localContentMap = new Map<string, string>();
		const referencedImages = new Map<string, TFile>();

		for (const file of publishedFiles) {
			const compiled = await this.compiler.compile(file, backlinkMap);
			compiledNotes.push(compiled);
			localContentMap.set(compiled.repoPath, compiled.content);

			// Collect image references
			const rawContent = await this.vault.cachedRead(file);
			const imageRefs = collectImageRefs(rawContent, this.vault);
			for (const ref of imageRefs) {
				if (ref.file) {
					const ext = ref.file.extension.toLowerCase();
					const repoPath = `static/img/${ref.file.name}`;
					if (!referencedImages.has(repoPath)) {
						referencedImages.set(repoPath, ref.file);
					}
				}
			}
		}

		// 3. Fetch remote tree
		let remoteTree: RemoteFile[] = [];
		try {
			remoteTree = await this.connection.getSourcesTree();
		} catch (err) {
			console.warn("Could not fetch remote tree (repo might be empty):", err);
		}

		// 4. Diff notes
		const diff = await diffFiles(localContentMap, remoteTree.filter((r) => r.path.endsWith(".md")));

		const notesToUpload = compiledNotes.filter((n) => diff.toUpload.includes(n.repoPath));
		const remoteImagePaths = new Set(remoteTree.filter((r) => !r.path.endsWith(".md")).map((r) => r.path));

		const imagesToUpload: Array<{ repoPath: string; file: TFile }> = [];
		for (const [repoPath, file] of referencedImages.entries()) {
			if (!remoteImagePaths.has(repoPath)) {
				imagesToUpload.push({ repoPath, file });
			}
		}

		return {
			validation,
			notesToUpload,
			imagesToUpload,
			filesToDelete: diff.toDelete,
			syncedNotes: diff.unchanged,
			unchangedCount: diff.unchanged.length,
		};
	}

	async executePublish(
		plan: PublishPlan,
		onProgress?: (done: number, total: number) => void
	): Promise<PublishSummary> {
		const startTime = Date.now();
		const filesToCommit: FileToCommit[] = [];

		// Add notes
		for (const note of plan.notesToUpload) {
			filesToCommit.push({
				path: note.repoPath,
				content: note.content,
				encoding: "utf-8",
			});
		}

		// Add images (base64)
		for (const img of plan.imagesToUpload) {
			const buffer = await this.vault.readBinary(img.file);
			const base64 = Base64.fromUint8Array(new Uint8Array(buffer));
			filesToCommit.push({
				path: img.repoPath,
				content: base64,
				encoding: "base64",
			});
		}

		// Commit
		const message = `publish: sync ${filesToCommit.length} file(s), delete ${plan.filesToDelete.length} file(s)`;
		const result = await this.commitBuilder.commit(
			filesToCommit,
			plan.filesToDelete,
			message,
			onProgress
		);

		// Post-publish: push search index, recents, tags in background if configured
		this.triggerBackgroundDataPush(plan.notesToUpload).catch((err) =>
			console.error("Failed background index push:", err)
		);

		return {
			uploadedCount: result.filesUploaded,
			deletedCount: result.filesDeleted,
			commitSha: result.sha,
			durationMs: Date.now() - startTime,
		};
	}

	async publishSingleFile(file: TFile): Promise<string> {
		const fm = this.metadataCache.getCache(file.path)?.frontmatter;
		if (fm?.["publish"] !== true) {
			throw new Error("Note does not have 'publish: true' frontmatter");
		}

		const compiled = await this.compiler.compile(file, new Map());
		const filesToCommit: FileToCommit[] = [
			{
				path: compiled.repoPath,
				content: compiled.content,
				encoding: "utf-8",
			},
		];

		// Include any referenced local images not yet in repo
		const rawContent = await this.vault.cachedRead(file);
		const imageRefs = collectImageRefs(rawContent, this.vault);
		for (const ref of imageRefs) {
			if (ref.file) {
				const buffer = await this.vault.readBinary(ref.file);
				const base64 = Base64.fromUint8Array(new Uint8Array(buffer));
				filesToCommit.push({
					path: `sources/img/${ref.file.name}`,
					content: base64,
					encoding: "base64",
				});
			}
		}

		const result = await this.commitBuilder.commit(
			filesToCommit,
			[],
			`publish: update note ${file.basename}`
		);

		return result.sha;
	}

	async updateHugoConfig(): Promise<string> {
		const toml = this.compiler.generateHugoToml();
		const filesToCommit: FileToCommit[] = [
			{
				path: "hugo.toml",
				content: toml,
				encoding: "utf-8",
			},
		];
		const result = await this.commitBuilder.commit(
			filesToCommit,
			[],
			"chore: update hugo.toml configuration from Obsidian plugin"
		);
		return result.sha;
	}

	private async triggerBackgroundDataPush(notes: CompiledNote[]): Promise<void> {
		const postFiles: FileToCommit[] = [];

		if (this.settings.generateSearchIndex) {
			const searchIndex = notes.map((n) => ({
				title: n.slug.replace(/-/g, " "),
				url: n.repoPath.replace(/^sources\//, "/").replace(/\.md$/, ""),
				content: n.content.replace(/^---[\s\S]*?---/, "").slice(0, 3000), // First 3000 chars
			}));
			postFiles.push({
				path: "sources/search-index.json",
				content: JSON.stringify(searchIndex),
				encoding: "utf-8",
			});
		}

		if (this.settings.generateRecentsFeed) {
			const publishedFiles = this.getPublishedFiles();
			const recents = publishedFiles
				.sort((a, b) => (b.stat.mtime || 0) - (a.stat.mtime || 0))
				.slice(0, 20)
				.map((f) => ({
					title: f.basename,
					mtime: f.stat.mtime,
				}));
			postFiles.push({
				path: "sources/recents.json",
				content: JSON.stringify(recents, null, 2),
				encoding: "utf-8",
			});
		}

		if (postFiles.length > 0) {
			await this.commitBuilder.commit(postFiles, [], "chore: update search index & metadata feeds");
		}
	}
}
