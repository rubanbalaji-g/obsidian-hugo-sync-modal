/** A file entry from the remote GitHub tree */
export interface RemoteFile {
	path: string;
	sha: string;
	size: number;
}

/** Result of diffing local vs remote */
export interface DiffResult {
	/** Files to upload (new or changed) */
	toUpload: string[];
	/** Files to delete from GitHub (removed from vault or unpublished) */
	toDelete: string[];
	/** Files unchanged (same SHA) */
	unchanged: string[];
}

/**
 * Computes a Git blob SHA for a string, matching GitHub's blob SHA formula:
 *   sha1("blob <byte_length>\0<content>")
 * Normalizes CRLF to LF so Windows line endings do not trigger false diffs.
 */
export async function computeLocalSha(content: string): Promise<string> {
	const normalized = content.replace(/\r\n/g, "\n");
	const encoder = new TextEncoder();
	const contentBytes = encoder.encode(normalized);
	const header = encoder.encode(`blob ${contentBytes.byteLength}\0`);
	const combined = new Uint8Array(header.byteLength + contentBytes.byteLength);
	combined.set(header, 0);
	combined.set(contentBytes, header.byteLength);
	const hashBuffer = await crypto.subtle.digest("SHA-1", combined);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Diffs a set of local compiled notes against the remote file tree.
 *
 * @param localFiles  Map of repoPath → compiled content
 * @param remoteTree  List of files currently in the repo under content/
 */
export async function diffFiles(
	localFiles: Map<string, string>,
	remoteTree: RemoteFile[]
): Promise<DiffResult> {
	const remoteMap = new Map<string, RemoteFile>();
	for (const rf of remoteTree) {
		remoteMap.set(rf.path, rf);
	}

	const toUpload: string[] = [];
	const unchanged: string[] = [];

	// Check each local file against remote
	for (const [path, content] of localFiles.entries()) {
		const remote = remoteMap.get(path);
		if (!remote) {
			// New file
			toUpload.push(path);
		} else {
			const localSha = await computeLocalSha(content);
			if (localSha !== remote.sha) {
				toUpload.push(path);
			} else {
				unchanged.push(path);
			}
		}
	}

	// Files on remote but not in local → to delete
	const toDelete: string[] = [];
	for (const remotePath of remoteMap.keys()) {
		if (!localFiles.has(remotePath)) {
			toDelete.push(remotePath);
		}
	}

	return { toUpload, toDelete, unchanged };
}
