import { GitHubConnection } from "src/github/GitHubConnection";

export interface FileToCommit {
	path: string;        // full repo path, e.g. "sources/cardiology/kawasaki.md"
	content: string;     // text content
	encoding?: "utf-8" | "base64";
}

export interface CommitResult {
	sha: string;
	filesUploaded: number;
	filesDeleted: number;
}

/**
 * Builds and executes an atomic multi-file commit using the GitHub Git Data API.
 * Uploads new/changed files as blobs, deletes removed files by setting sha = null.
 */
export class CommitBuilder {
	private connection: GitHubConnection;

	constructor(connection: GitHubConnection) {
		this.connection = connection;
	}

	async commit(
		filesToAdd: FileToCommit[],
		pathsToDelete: string[],
		message: string,
		onProgress?: (done: number, total: number) => void
	): Promise<CommitResult> {
		if (filesToAdd.length === 0 && pathsToDelete.length === 0) {
			throw new Error("Nothing to commit");
		}

		const { sha: parentSha, treeSha: baseTreeSha } = await this.connection.getLatestCommit();
		const total = filesToAdd.length + pathsToDelete.length;
		let done = 0;

		// Upload blobs for all new/changed files
		const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];

		for (const file of filesToAdd) {
			const blobSha = await this.connection.createBlob(
				file.content,
				file.encoding ?? "utf-8"
			);
			treeEntries.push({
				path: file.path,
				mode: "100644",
				type: "blob",
				sha: blobSha,
			});
			done++;
			onProgress?.(done, total);
		}

		// Delete entries — Git Data API: set sha to null to delete
		for (const path of pathsToDelete) {
			treeEntries.push({
				path,
				mode: "100644",
				type: "blob",
				sha: null,
			});
			done++;
			onProgress?.(done, total);
		}

		const newSha = await this.connection.createCommit(
			treeEntries,
			message,
			parentSha,
			baseTreeSha
		);

		return {
			sha: newSha,
			filesUploaded: filesToAdd.length,
			filesDeleted: pathsToDelete.length,
		};
	}
}
