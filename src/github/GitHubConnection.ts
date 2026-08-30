import { Octokit } from "@octokit/core";
import { HugoPublisherSettings } from "src/models/settings";
import { RemoteFile } from "src/publisher/FileDiffer";

export interface CommitEntry {
	sha: string;
	message: string;
	date: string;
	url: string;
}

/**
 * Thin wrapper around the GitHub REST & Git Data APIs via Octokit.
 */
export class GitHubConnection {
	private octokit: Octokit;
	private owner: string;
	private repo: string;
	private branch: string;

	constructor(settings: HugoPublisherSettings) {
		this.octokit = new Octokit({ auth: settings.githubToken });
		this.owner = settings.githubUsername;
		this.repo = settings.githubRepo;
		this.branch = settings.branch || "main";
	}

	private base() {
		return { owner: this.owner, repo: this.repo };
	}

	/** Verify the token and repo are accessible; also checks token scope */
	async testConnection(): Promise<{ ok: boolean; error?: string; hasRepoScope: boolean }> {
		try {
			const resp = await this.octokit.request("GET /repos/{owner}/{repo}", this.base());
			const scopes: string = (resp.headers["x-oauth-scopes"] as string) ?? "";
			const hasRepoScope = scopes.split(",").map((s) => s.trim()).includes("repo");
			return { ok: true, hasRepoScope };
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			return { ok: false, error: msg, hasRepoScope: false };
		}
	}

	/** Get the SHA of the latest commit on the branch */
	async getLatestCommitSha(): Promise<string> {
		const resp = await this.octokit.request(
			"GET /repos/{owner}/{repo}/commits/HEAD?cacheBust=" + Date.now(),
			this.base()
		);
		return resp.data.sha as string;
	}

	/** Get the tree SHA of the latest commit */
	async getLatestCommit(): Promise<{ sha: string; treeSha: string }> {
		const resp = await this.octokit.request(
			"GET /repos/{owner}/{repo}/commits/HEAD?cacheBust=" + Date.now(),
			this.base()
		);
		return {
			sha: resp.data.sha as string,
			treeSha: (resp.data.commit as { tree: { sha: string } }).tree.sha,
		};
	}

	/**
	 * Fetches the full recursive file tree under `sources/` prefix.
	 * Returns path + sha for each file.
	 */
	async getSourcesTree(): Promise<RemoteFile[]> {
		const { treeSha } = await this.getLatestCommit();
		const resp = await this.octokit.request(
			"GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
			{
				...this.base(),
				tree_sha: treeSha,
				recursive: "true",
				headers: { "If-None-Match": "" }, // bypass cache
			}
		);
		const tree = resp.data.tree as Array<{ path: string; sha: string; size: number; type: string }>;
		return tree
			.filter((item) => item.type === "blob" && (item.path.startsWith("content/") || item.path.startsWith("sources/") || item.path.startsWith("static/")))
			.map((item) => ({ path: item.path, sha: item.sha, size: item.size ?? 0 }));
	}

	/** Create a git blob and return its SHA */
	async createBlob(content: string, encoding: "utf-8" | "base64" = "utf-8"): Promise<string> {
		const resp = await this.octokit.request("POST /repos/{owner}/{repo}/git/blobs", {
			...this.base(),
			content,
			encoding,
		});
		return resp.data.sha as string;
	}

	/**
	 * Creates a commit with the given tree entries atomically.
	 * Handles creates, updates, and deletes in a single commit.
	 */
	async createCommit(
		treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }>,
		message: string,
		parentSha: string,
		baseTreeSha: string
	): Promise<string> {
		// Create new tree
		const newTree = await this.octokit.request("POST /repos/{owner}/{repo}/git/trees", {
			...this.base(),
			base_tree: baseTreeSha,
			tree: treeEntries,
		});

		// Create commit
		const newCommit = await this.octokit.request("POST /repos/{owner}/{repo}/git/commits", {
			...this.base(),
			message,
			tree: newTree.data.sha,
			parents: [parentSha],
		});

		// Advance branch ref
		await this.octokit.request("PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}", {
			...this.base(),
			branch: this.branch,
			sha: newCommit.data.sha,
		});

		return newCommit.data.sha as string;
	}

	/** Get the last N commits on the branch */
	async getRecentCommits(n = 5): Promise<CommitEntry[]> {
		const resp = await this.octokit.request(
			"GET /repos/{owner}/{repo}/commits?sha={branch}&per_page={n}",
			{ ...this.base(), branch: this.branch, n }
		);
		return (resp.data as Array<{
			sha: string;
			commit: { message: string; author: { date: string } };
			html_url: string;
		}>).map((c) => ({
			sha: c.sha.slice(0, 7),
			message: c.commit.message.split("\n")[0],
			date: c.commit.author.date,
			url: c.html_url,
		}));
	}

	/** Reset the branch HEAD to a previous commit SHA */
	async rollbackTo(sha: string): Promise<void> {
		await this.octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
			...this.base(),
			ref: `heads/${this.branch}`,
			sha,
			force: true,
		});
	}

	/** Verify that the site base URL is reachable */
	async verifySiteUrl(url: string): Promise<{ ok: boolean; status?: number }> {
		try {
			const resp = await fetch(url, { method: "HEAD" });
			return { ok: resp.ok, status: resp.status };
		} catch {
			return { ok: false };
		}
	}
}
