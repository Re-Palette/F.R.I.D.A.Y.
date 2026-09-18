import { isGitHubConfigured, listCommits, listIssues, listRepos } from "@/lib/integrations/github";
import type { ToolDefinition } from "./types";

const NOT_CONNECTED = "GitHub is not connected yet. Tell the user this isn't set up.";

export const githubTool: ToolDefinition = {
  name: "github",
  description:
    "Look at the user's GitHub: their repositories, or the open issues/pull requests or recent commits of " +
    "one of them. Read-only — nothing here changes a repository. Use it instead of guessing what state a " +
    "project is in.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["repos", "issues", "commits"],
        description:
          "repos = list the user's repositories; issues = open issues and PRs of one repo; " +
          "commits = recent commits of one repo.",
      },
      repo: { type: "string", description: "owner/name — required for issues and commits." },
      state: { type: "string", enum: ["open", "closed", "all"], description: "Issues only. Default open." },
    },
    required: ["action"],
  },
  level: 1,
  async execute(input) {
    if (!isGitHubConfigured()) return { ok: false, content: NOT_CONNECTED };

    const action = String(input.action ?? "");
    const repo = String(input.repo ?? "").trim();

    try {
      if (action === "repos") {
        const repos = await listRepos();
        if (!repos.length) return { ok: true, content: "No repositories found." };
        return {
          ok: true,
          content: repos
            .map((r) => `- ${r.full_name}${r.private ? " (private)" : ""}\n  ${r.description ?? "(no description)"}\n  last push: ${r.pushed_at}`)
            .join("\n"),
        };
      }

      // Both remaining actions address a specific repository, and GitHub's
      // 404 for a malformed name is indistinguishable from "no access".
      if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
        return { ok: false, content: "repo must be given as owner/name" };
      }

      if (action === "issues") {
        const state = ["open", "closed", "all"].includes(String(input.state)) ? String(input.state) : "open";
        const issues = await listIssues(repo, state);
        if (!issues.length) return { ok: true, content: `No ${state} issues or PRs in ${repo}.` };
        return {
          ok: true,
          content: issues
            .map((i) => `- #${i.number} [${i.pull_request ? "PR" : "issue"}] ${i.title}\n  state: ${i.state} / updated: ${i.updated_at} / by ${i.user?.login ?? "?"}`)
            .join("\n"),
        };
      }

      if (action === "commits") {
        const commits = await listCommits(repo);
        if (!commits.length) return { ok: true, content: `No commits found in ${repo}.` };
        return {
          ok: true,
          content: commits
            .map((c) => `- ${c.sha.slice(0, 7)} ${c.commit.message.split("\n")[0]}\n  ${c.commit.author?.name ?? "?"} / ${c.commit.author?.date ?? "?"}`)
            .join("\n"),
        };
      }

      return { ok: false, content: `Unknown action: ${action}` };
    } catch (err) {
      return { ok: false, content: `GitHub lookup failed: ${(err as Error).message}` };
    }
  },
};
