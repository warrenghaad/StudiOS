import { promises as fs } from 'node:fs';
import path from 'node:path';

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
  firstCommitDate: string;
  latestCommitDate: string;
  uniqueAuthorsCount: number;
  ownerCommits: number;
  botCommits: number;
  nonOwnerHumanCommits: number;
  unknownAuthorCommits: number;
  hasMeaningfulFiles: boolean;
  scaffoldOnly: boolean;
  includeForFunctionalityAudit: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  uniqueCommitAuthors: string[];
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key.startsWith('--') && value) args.set(key, value);
  }
  return {
    auditFile: args.get('--audit-file') ?? '',
    outputDir: args.get('--output-dir') ?? process.cwd(),
  };
}

function csvEscape(value: unknown) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) return `"${stringValue.replaceAll('"', '""')}"`;
  return stringValue;
}

async function writeCsv(filePath: string, header: string[], rows: string[][]) {
  const csv = [header.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  await fs.writeFile(filePath, `${csv}\n`);
}

function priorityFor(record: AuditRecord) {
  if (!record.includeForFunctionalityAudit) return '';
  if (record.confidence === 'high' && record.totalCommits >= 20) return 'High';
  if (record.totalCommits >= 10) return 'Medium';
  return 'Low';
}

function nextAuditStep(record: AuditRecord) {
  if (!record.includeForFunctionalityAudit) return '';
  if (record.notes.toLowerCase().includes('canonical')) return 'Compare against related versioned repos before mapping functionality';
  if (record.notes.toLowerCase().includes('author aliases')) return 'Review author identity evidence, then inspect source structure';
  return 'Inspect repo structure, runtime entry points, and feature boundaries';
}

function evidenceFor(record: AuditRecord) {
  const authorSummary = record.uniqueCommitAuthors.slice(0, 4).join('; ');
  return `${record.totalCommits} commits; meaningfulFiles=${record.hasMeaningfulFiles}; authors=${authorSummary || 'none'}`;
}

function needsManualReview(record: AuditRecord) {
  const lowerNotes = record.notes.toLowerCase();
  return lowerNotes.includes('canonical')
    || lowerNotes.includes('author aliases')
    || record.repo === 'StudiOS';
}

async function main() {
  const { auditFile, outputDir } = parseArgs(process.argv.slice(2));
  if (!auditFile) throw new Error('Missing required --audit-file argument.');

  const records = JSON.parse(await fs.readFile(auditFile, 'utf8')) as AuditRecord[];
  await fs.mkdir(outputDir, { recursive: true });

  const auditHeader = [
    'Repo',
    'Full Name',
    'URL',
    'Visibility',
    'Archived',
    'Fork',
    'Size',
    'Default Branch',
    'Created At',
    'Pushed At',
    'Total Commits',
    'First Commit Date',
    'Latest Commit Date',
    'Unique Authors',
    'Owner Commits',
    'Bot Commits',
    'Non Owner Human Commits',
    'Unknown Author Commits',
    'Has Meaningful Files',
    'Scaffold Only',
    'Include For Functionality Audit',
    'Reason',
    'Confidence',
    'Notes',
  ];

  const auditRows = records.map((record) => [
    record.repo,
    record.fullName,
    record.url,
    record.visibility,
    record.archived,
    record.fork,
    record.size,
    record.defaultBranch,
    record.createdAt,
    record.pushedAt,
    record.totalCommits,
    record.firstCommitDate,
    record.latestCommitDate,
    record.uniqueAuthorsCount,
    record.ownerCommits,
    record.botCommits,
    record.nonOwnerHumanCommits,
    record.unknownAuthorCommits,
    record.hasMeaningfulFiles,
    record.scaffoldOnly,
    record.includeForFunctionalityAudit,
    record.reason,
    record.confidence,
    record.notes,
  ].map(String));

  await writeCsv(path.join(outputDir, 'repo-commit-audit.csv'), auditHeader, auditRows);

  const included = records.filter((record) => record.includeForFunctionalityAudit);
  const inclusionRows = included.map((record) => [
    record.repo,
    record.reason,
    evidenceFor(record),
    priorityFor(record),
    nextAuditStep(record),
  ]);
  await writeCsv(
    path.join(outputDir, 'inclusion-candidates.csv'),
    ['Repo', 'Reason For Inclusion', 'Evidence', 'Priority', 'Next Audit Step'],
    inclusionRows,
  );

  const excluded = records.filter((record) => !record.includeForFunctionalityAudit);
  const excludedRows = excluded.map((record) => [
    record.repo,
    record.reason,
    evidenceFor(record),
    record.confidence === 'high' ? 'Yes' : 'Maybe',
  ]);
  await writeCsv(
    path.join(outputDir, 'excluded-repos.csv'),
    ['Repo', 'Reason For Exclusion', 'Evidence', 'Can Revisit Later'],
    excludedRows,
  );

  const manualReview = records.filter(needsManualReview);
  const manualReviewLines = [
    '# Manual Review Needed',
    '',
    'These repos need a human decision before deeper functionality mapping is finalized.',
    '',
  ];

  for (const record of manualReview) {
    manualReviewLines.push(`## ${record.repo}`);
    manualReviewLines.push('');
    manualReviewLines.push(`- Reason: ${record.reason}`);
    manualReviewLines.push(`- Evidence: ${evidenceFor(record)}`);
    manualReviewLines.push(`- Notes: ${record.notes}`);
    manualReviewLines.push(`- Suggested next step: ${nextAuditStep(record) || 'Confirm whether the repo should stay excluded.'}`);
    manualReviewLines.push('');
  }

  await fs.writeFile(path.join(outputDir, 'manual-review-needed.md'), `${manualReviewLines.join('\n')}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
