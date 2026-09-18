/**
 * GitHub, read-only. A fine-grained personal access token is enough — no
 * OAuth dance, unlike the Google integrations — and read-only scopes keep
 * it out of the Approval Queue's territory: nothing here can change a
 * repository.
 */

const API = "https://api.github.com";

export function isGitHubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

async function call<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub is not configured. See .env.example.");

  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface Repo {
  full_name: string;
  description: string | null;
  private: boolean;
  pushed_at: string;
  html_url: string;
}

export async function listRepos(limit = 20): Promise<Repo[]> {
  const params = new URLSearchParams({
    sort: "pushed",
    per_page: String(Math.min(limit, 50)),
    affiliation: "owner,collaborator,organization_member",
  });
  return call<Repo[]>(`/user/repos?${params}`);
}

export interface IssueOrPr {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
  user?: { login: string };
}

export async function listIssues(repo: string, state = "open", limit = 20): Promise<IssueOrPr[]> {
  const params = new URLSearchParams({ state, per_page: String(Math.min(limit, 50)), sort: "updated" });
  return call<IssueOrPr[]>(`/repos/${repo}/issues?${params}`);
}

export interface Commit {
  sha: string;
  commit: { message: string; author?: { name?: string; date?: string } };
  html_url: string;
}

export async function listCommits(repo: string, limit = 20): Promise<Commit[]> {
  const params = new URLSearchParams({ per_page: String(Math.min(limit, 50)) });
  return call<Commit[]>(`/repos/${repo}/commits?${params}`);
}
