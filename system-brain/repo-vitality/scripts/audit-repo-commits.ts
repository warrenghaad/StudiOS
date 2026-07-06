import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type RepoMeta = {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  visibility?: string;
  archived: boolean;
  fork: boolean;
  size: number;
  default_branch: string;
  created_at: string;
  pushed_at: string;
};

type RepoMetaEnvelope = RepoMeta[] | { items: RepoMeta[] };

type CommitInfo = {
  oid: string;
  authoredDate?: string;
  committedDate?: string;
  shortMessage?: string;
  bodyMessageHtml?: string;
  authors?: Array<{
    login?: string | null;
    displayName?: string | null;
    profileName?: string | null;
    isGitHub?: boolean;
  }>;
  committer?: {
    login?: string | null;
    displayName?: string | null;
    profileName?: string | null;
    isGitHub?: boolean;
  } | null;
};

type AuditRecord = {
  repo: string;
  fullName: string;
  url: string;
  visibility: string;
  archived: boolean;
  fork: boolean;
  size: number;
  defaultBranch: string;
  createdAt: string;
  pushedAt: string;
  totalCommits: number;
  firstCommitSha: string;
  firstCommitDate: string;
  firstCommitAuthorName: string;
  firstCommitAuthorEmail: string;
  firstCommitAuthorLogin: string;
  firstCommitCommitterName: string;
  firstCommitCommitterEmail: string;
  firstCommitCommitterLogin: string;
  latestCommitSha: string;
  latestCommitDate: string;
  latestCommitAuthorName: string;
  latestCommitAuthorEmail: string;
  latestCommitAuthorLogin: string;
  latestCommitCommitterName: string;
  latestCommitCommitterEmail: string;
  latestCommitCommitterLogin: string;
  uniqueCommitAuthors: string[];
  uniqueCommitCommitters: string[];
  uniqueAuthorsCount: number;
  uniqueCommittersCount: number;
  ownerCommits: number;
  botCommits: number;
  unknownAuthorCommits: number;
  nonOwnerHumanCommits: number;
  hasMeaningfulFiles: boolean;
  scaffoldOnly: boolean;
  includeForFunctionalityAudit: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
};

const OWNER = 'warrenghaad';
const ownerAliases = new Set(['warrenghaad', 'sami', 'smajeed3']);
const ownerEmails = new Set(['smajeed3@gmail.com', '46694771-smajeed3@users.noreply.replit.com']);
const botAliases = new Set([
  'github-actions[bot]',
  'dependabot[bot]',
  'copilot',
  'copilot-swe-agent[bot]',
  'web-flow',
  'github',
  'replit',
  'replit-agent',
  'agent',
  'deployment',
  'cursor',
  'claude',
  'openai',
]);

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key.startsWith('--') && value) args.set(key, value);
  }
  return {
    metadataFile: args.get('--metadata-file') ?? '',
    outputDir: args.get('--output-dir') ?? process.cwd(),
    localRepoRoot: args.get('--local-repo-root') ?? process.cwd(),
  };
}

async function readRepoMetadata(metadataFile: string): Promise<RepoMeta[]> {
  const raw = JSON.parse(await fs.readFile(metadataFile, 'utf8')) as RepoMetaEnvelope;
  const repos = Array.isArray(raw) ? raw : raw.items;
  return [...repos].sort((left, right) => left.name.localeCompare(right.name));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return await response.text();
}

function extractEmbeddedJson(html: string): any {
  const match = html.match(/<script type="application\/json" data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('embeddedData not found');
  return JSON.parse(match[1]);
}

async function getPublicRepoTree(fullName: string) {
  const html = await fetchText(`https://github.com/${fullName}`);
  if (html.includes('This repository is empty.')) return { items: [] as any[], readmePresent: false, empty: true };
  const data = extractEmbeddedJson(html);
  const route = data.payload.codeViewRepoRoute;
  return {
    items: route?.tree?.items ?? [],
    readmePresent: Boolean(route?.tree?.readme),
    empty: false,
  };
}

function extractNextAfter(html: string, fullName: string, branch: string): string | null {
  const safeFullName = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeBranch = branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`/${safeFullName}/commits/${safeBranch}\\?after=([^"&]+(?:\\+\\d+)?)`);
  const match = html.match(pattern);
  return match ? match[1] : null;
}

async function getPublicCommitPages(fullName: string, branch: string): Promise<CommitInfo[]> {
  const commits: CommitInfo[] = [];
  let after: string | null = null;
  const seenAfter = new Set<string>();

  for (let index = 0; index < 50; index += 1) {
    const url = `https://github.com/${fullName}/commits/${branch}${after ? `?after=${after}` : ''}`;
    const html = await fetchText(url);
    if (html.includes('This repository is empty.')) return [];

    const data = extractEmbeddedJson(html);
    const groups = data.payload.commitGroups ?? [];
    for (const group of groups) {
      for (const commit of group.commits ?? []) commits.push(commit);
    }

    const nextAfter = extractNextAfter(html, fullName, branch);
    if (!nextAfter || seenAfter.has(nextAfter)) break;
    seenAfter.add(nextAfter);
    after = nextAfter;
  }

  return commits;
}

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function classifyPublicAuthor(authorName: string, commit: CommitInfo): 'owner' | 'bot' | 'non-owner-human' | 'unknown' {
  const normalizedName = normalize(authorName);
  if (!normalizedName) return 'unknown';
  if (ownerAliases.has(normalizedName)) return 'owner';

  const commitText = `${normalizedName} ${commit.shortMessage ?? ''} ${commit.bodyMessageHtml ?? ''}`.toLowerCase();
  if ([...botAliases].some((alias) => commitText.includes(alias))) return 'bot';
  return 'non-owner-human';
}

function classifyLocalAuthor(authorName: string, authorEmail: string): 'owner' | 'bot' | 'non-owner-human' | 'unknown' {
  const normalizedName = normalize(authorName);
  const normalizedEmail = normalize(authorEmail);
  if (!normalizedName && !normalizedEmail) return 'unknown';
  if (ownerAliases.has(normalizedName) || ownerEmails.has(normalizedEmail)) return 'owner';
  if ([...botAliases].some((alias) => normalizedName.includes(alias)) || normalizedEmail.includes('copilot')) return 'bot';
  return 'non-owner-human';
}

function analyzeFiles(items: Array<{ name: string; contentType: string }> | string[], readmePresent = false) {
  const names = items.map((item: any) => (typeof item === 'string' ? item : item.name));
  const lowerNames = names.map((name) => name.toLowerCase());
  const directories = new Set(
    items
      .filter((item: any) => typeof item !== 'string' && item.contentType === 'directory')
      .map((item: any) => item.name.toLowerCase()),
  );

  const meaningfulDirectoryNames = ['server', 'client', 'src', 'app', 'shared', 'lib', 'scripts', 'db', 'schema', 'routes'];
  const meaningfulDir = meaningfulDirectoryNames.some((directory) => directories.has(directory));

  const codeOrDataFiles = lowerNames.filter((name) => /\.(ts|tsx|js|jsx|py|sql|ya?ml|json)$/i.test(name));
  const nonConfigFiles = codeOrDataFiles.filter(
    (name) => !['package-lock.json', 'tsconfig.json', '.replit', '.gitignore', 'package.json'].includes(name) && !name.endsWith('.lock'),
  );

  const scaffoldNames = new Set([
    'readme.md',
    '.gitignore',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'postcss.config.js',
    'components.json',
    '.replit',
  ]);

  const scaffoldOnlyByNames = lowerNames.length > 0 && lowerNames.every((name) => scaffoldNames.has(name));
  const hasMeaningful = meaningfulDir || nonConfigFiles.length > 0 || lowerNames.includes('replit.md') || readmePresent;

  return { names, hasMeaningful, scaffoldOnlyByNames };
}

function inferScaffoldOnly(totalCommits: number, hasMeaningfulFiles: boolean, scaffoldOnlyByNames: boolean, archived: boolean, size: number) {
  if (size === 0) return true;
  if (totalCommits <= 1 && !hasMeaningfulFiles) return true;
  if (scaffoldOnlyByNames && totalCommits <= 3) return true;
  if (archived && totalCommits <= 1) return true;
  return false;
}

function isVersionedOrDuplicateName(repoName: string) {
  const lowerName = repoName.toLowerCase();
  return /v\d+$/.test(lowerName) || lowerName.includes('penultimate') || lowerName.includes('timelinev1');
}

function buildReason(record: Pick<AuditRecord, 'includeForFunctionalityAudit' | 'hasMeaningfulFiles' | 'scaffoldOnly' | 'archived' | 'totalCommits' | 'repo'>) {
  if (record.repo === 'StudiOS') return 'Current hub repo is documentation-first and not yet a functionality target';
  if (record.includeForFunctionalityAudit) {
    return record.hasMeaningfulFiles ? 'Meaningful source structure plus multi-commit history' : 'Commit history exceeds scaffold stage';
  }
  if (record.scaffoldOnly) return 'Empty, scaffold-only, or too little history to justify deeper audit';
  if (record.archived && record.totalCommits <= 1) return 'Archived with only minimal commit activity';
  return 'Not enough evidence yet for deeper functionality mapping';
}

function computeConfidence(repo: RepoMeta, includeForFunctionalityAudit: boolean, empty: boolean, flaggedVersion: boolean) {
  if (empty) return 'high';
  if (repo.name === 'StudiOS') return 'high';
  if (flaggedVersion) return 'low';
  if (includeForFunctionalityAudit && repo.size > 1000) return 'high';
  return 'medium';
}

function execGit(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || String(error)));
      else resolve(stdout);
    });
  });
}

async function getLocalRepoInfo(repoRoot: string) {
  const logOutput = await execGit(['log', '--reverse', '--format=%H|%aI|%an|%ae|%cI|%cn|%ce|%s'], repoRoot);
  const commits = logOutput
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, authoredDate, authorName, authorEmail, committedDate, committerName, committerEmail, ...subjectParts] = line.split('|');
      return {
        sha,
        authoredDate,
        authorName,
        authorEmail,
        committedDate,
        committerName,
        committerEmail,
        subject: subjectParts.join('|'),
      };
    });

  const files = (await execGit(['ls-files'], repoRoot))
    .trim()
    .split('\n')
    .filter(Boolean);

  return { commits, files };
}

async function auditLocalRepo(repo: RepoMeta, localRepoRoot: string): Promise<AuditRecord> {
  const local = await getLocalRepoInfo(localRepoRoot);
  const uniqueAuthors = new Set<string>();
  const uniqueCommitters = new Set<string>();
  let ownerCommits = 0;
  let botCommits = 0;
  let unknownAuthorCommits = 0;
  let nonOwnerHumanCommits = 0;

  for (const commit of local.commits) {
    if (commit.authorName) uniqueAuthors.add(commit.authorName);
    if (commit.committerName) uniqueCommitters.add(commit.committerName);

    const classification = classifyLocalAuthor(commit.authorName, commit.authorEmail);
    if (classification === 'owner') ownerCommits += 1;
    else if (classification === 'bot') botCommits += 1;
    else if (classification === 'non-owner-human') nonOwnerHumanCommits += 1;
    else unknownAuthorCommits += 1;
  }

  const fileAnalysis = analyzeFiles(local.files, local.files.includes('README.md'));
  const scaffoldOnly = inferScaffoldOnly(local.commits.length, false, fileAnalysis.scaffoldOnlyByNames, repo.archived, repo.size);
  const includeForFunctionalityAudit = false;
  const reason = buildReason({
    includeForFunctionalityAudit,
    hasMeaningfulFiles: false,
    scaffoldOnly,
    archived: repo.archived,
    totalCommits: local.commits.length,
    repo: repo.name,
  });

  return {
    repo: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    visibility: repo.visibility || (repo.private ? 'private' : 'public'),
    archived: repo.archived,
    fork: repo.fork,
    size: repo.size,
    defaultBranch: repo.default_branch,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    totalCommits: local.commits.length,
    firstCommitSha: local.commits[0]?.sha ?? '',
    firstCommitDate: local.commits[0]?.authoredDate ?? '',
    firstCommitAuthorName: local.commits[0]?.authorName ?? '',
    firstCommitAuthorEmail: local.commits[0]?.authorEmail ?? '',
    firstCommitAuthorLogin: '',
    firstCommitCommitterName: local.commits[0]?.committerName ?? '',
    firstCommitCommitterEmail: local.commits[0]?.committerEmail ?? '',
    firstCommitCommitterLogin: '',
    latestCommitSha: local.commits.at(-1)?.sha ?? '',
    latestCommitDate: local.commits.at(-1)?.authoredDate ?? '',
    latestCommitAuthorName: local.commits.at(-1)?.authorName ?? '',
    latestCommitAuthorEmail: local.commits.at(-1)?.authorEmail ?? '',
    latestCommitAuthorLogin: '',
    latestCommitCommitterName: local.commits.at(-1)?.committerName ?? '',
    latestCommitCommitterEmail: local.commits.at(-1)?.committerEmail ?? '',
    latestCommitCommitterLogin: '',
    uniqueCommitAuthors: [...uniqueAuthors],
    uniqueCommitCommitters: [...uniqueCommitters],
    uniqueAuthorsCount: uniqueAuthors.size,
    uniqueCommittersCount: uniqueCommitters.size,
    ownerCommits,
    botCommits,
    unknownAuthorCommits,
    nonOwnerHumanCommits,
    hasMeaningfulFiles: false,
    scaffoldOnly,
    includeForFunctionalityAudit,
    reason,
    confidence: 'high',
    notes: 'Private repo evaluated from the local clone only. Current history is documentation-heavy and not yet a deeper functionality-audit target.',
  };
}

async function auditPublicRepo(repo: RepoMeta): Promise<AuditRecord> {
  const [tree, commits] = await Promise.all([getPublicRepoTree(repo.full_name), getPublicCommitPages(repo.full_name, repo.default_branch)]);

  const uniqueAuthors = new Set<string>();
  const uniqueCommitters = new Set<string>();
  let ownerCommits = 0;
  let botCommits = 0;
  let unknownAuthorCommits = 0;
  let nonOwnerHumanCommits = 0;

  for (const commit of commits) {
    const authorName = commit.authors?.[0]?.login || commit.authors?.[0]?.displayName || commit.authors?.[0]?.profileName || '';
    const committerName = commit.committer?.login || commit.committer?.displayName || commit.committer?.profileName || '';
    if (authorName) uniqueAuthors.add(authorName);
    if (committerName) uniqueCommitters.add(committerName);

    const classification = classifyPublicAuthor(authorName, commit);
    if (classification === 'owner') ownerCommits += 1;
    else if (classification === 'bot') botCommits += 1;
    else if (classification === 'non-owner-human') nonOwnerHumanCommits += 1;
    else unknownAuthorCommits += 1;
  }

  const fileAnalysis = analyzeFiles(tree.items, tree.readmePresent);
  const scaffoldOnly = tree.empty
    || inferScaffoldOnly(commits.length, fileAnalysis.hasMeaningful, fileAnalysis.scaffoldOnlyByNames, repo.archived, repo.size);
  const includeForFunctionalityAudit = !tree.empty && !scaffoldOnly && fileAnalysis.hasMeaningful && commits.length > 1;
  const versionFlag = isVersionedOrDuplicateName(repo.name);
  const firstCommit = commits.at(-1);
  const latestCommit = commits[0];

  const noteParts: string[] = [];
  if (tree.empty) noteParts.push('Repository page reports an empty repository.');
  if (versionFlag) noteParts.push('Versioned or supersession-style naming needs manual canonical-repo review.');
  if (nonOwnerHumanCommits > 0 || uniqueAuthors.has('AgentMedia1942')) noteParts.push('Contains author aliases that are not yet confidently classified.');
  if (!tree.empty && fileAnalysis.hasMeaningful && noteParts.length === 0) {
    noteParts.push('Public repo shows source directories or code-bearing root files beyond a bare scaffold.');
  }

  const reason = buildReason({
    includeForFunctionalityAudit,
    hasMeaningfulFiles: fileAnalysis.hasMeaningful,
    scaffoldOnly,
    archived: repo.archived,
    totalCommits: commits.length,
    repo: repo.name,
  });

  return {
    repo: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    visibility: repo.visibility || (repo.private ? 'private' : 'public'),
    archived: repo.archived,
    fork: repo.fork,
    size: repo.size,
    defaultBranch: repo.default_branch,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    totalCommits: commits.length,
    firstCommitSha: firstCommit?.oid ?? '',
    firstCommitDate: firstCommit?.authoredDate ?? '',
    firstCommitAuthorName: firstCommit?.authors?.[0]?.displayName ?? '',
    firstCommitAuthorEmail: '',
    firstCommitAuthorLogin: firstCommit?.authors?.[0]?.login ?? '',
    firstCommitCommitterName: firstCommit?.committer?.displayName ?? '',
    firstCommitCommitterEmail: '',
    firstCommitCommitterLogin: firstCommit?.committer?.login ?? '',
    latestCommitSha: latestCommit?.oid ?? '',
    latestCommitDate: latestCommit?.authoredDate ?? '',
    latestCommitAuthorName: latestCommit?.authors?.[0]?.displayName ?? '',
    latestCommitAuthorEmail: '',
    latestCommitAuthorLogin: latestCommit?.authors?.[0]?.login ?? '',
    latestCommitCommitterName: latestCommit?.committer?.displayName ?? '',
    latestCommitCommitterEmail: '',
    latestCommitCommitterLogin: latestCommit?.committer?.login ?? '',
    uniqueCommitAuthors: [...uniqueAuthors],
    uniqueCommitCommitters: [...uniqueCommitters],
    uniqueAuthorsCount: uniqueAuthors.size,
    uniqueCommittersCount: uniqueCommitters.size,
    ownerCommits,
    botCommits,
    unknownAuthorCommits,
    nonOwnerHumanCommits,
    hasMeaningfulFiles: fileAnalysis.hasMeaningful,
    scaffoldOnly,
    includeForFunctionalityAudit,
    reason,
    confidence: computeConfidence(repo, includeForFunctionalityAudit, tree.empty, versionFlag),
    notes: noteParts.join(' '),
  };
}

async function main() {
  const { metadataFile, outputDir, localRepoRoot } = parseArgs(process.argv.slice(2));
  if (!metadataFile) throw new Error('Missing required --metadata-file argument.');

  const repos = await readRepoMetadata(metadataFile);
  const results: AuditRecord[] = [];

  for (const repo of repos) {
    if (repo.full_name === `${OWNER}/StudiOS`) results.push(await auditLocalRepo(repo, localRepoRoot));
    else results.push(await auditPublicRepo(repo));
  }

  const outputPath = path.join(outputDir, 'repo-commit-audit.json');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
