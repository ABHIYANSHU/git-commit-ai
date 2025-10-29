// ai-review.js - Automated AI code review for GitHub pull requests
import { execSync } from 'child_process';
import { createBedrockClient, callAI, log } from './utils.js';
import { DIFF_CONFIG, sanitizeESLintOutput } from './config.js';

let client;

// Initialize client with error handling
try {
  client = createBedrockClient();
} catch (error) {
  console.error('Initialization failed:', error.message);
  process.exit(1);
}

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }); }
  catch (e) {
    console.error(`Command failed: ${cmd}`);
    console.error(e.message);
    return (e.stdout || '').toString();
  }
}

// Remove sensitive information from diff before sending to AI
function scrubSecrets(text) {
  return text
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]')
    .replace(/(?:ssh-rsa|ssh-ed25519)\\s+[A-Za-z0-9+/=]+/g, '[REDACTED_SSH_KEY]');
}

async function main() {
  // Get PR diff (changes between main branch and current HEAD)
  const diff = run('git --no-pager diff origin/main...HEAD --unified=0').slice(0, DIFF_CONFIG.MAX_DIFF_FOR_PR);
  const trimmedDiff = scrubSecrets(diff);
  
  if (!trimmedDiff || trimmedDiff.trim().length === 0) {
    console.log('No changes detected in diff. Exiting.');
    return;
  }

  // Run ESLint for additional code quality insights
  const eslintRaw = run('npx eslint . -f json --no-error-on-unmatched-pattern 2>/dev/null').slice(0, DIFF_CONFIG.MAX_ESLINT_OUTPUT);
  const eslintOut = sanitizeESLintOutput(eslintRaw);

  // Build prompt (structured)
  const userPrompt = `You are an expert code reviewer. Analyze the following code changes and provide a comprehensive review.

  CODE CHANGES:
  ${trimmedDiff}

  LINTER OUTPUT:
  ${eslintOut}

  REVIEW INSTRUCTIONS:
  1. Identify bugs, security vulnerabilities, and logic errors
  2. Check for code quality issues (readability, maintainability, performance)
  3. Verify best practices and design patterns
  4. Note any potential runtime errors or edge cases
  5. Consider the ESLint output for additional context

  PROVIDE YOUR REVIEW IN THIS FORMAT:

  **Summary:** (One sentence overview)

  **Critical Issues:** (List 0-3 critical problems with file:line references)

  **Suggestions:** (Improvements and best practices)

  **Security Concerns:** (If any)

  **Confidence Level:** (High/Medium/Low)

  Start your review now.`.trim().slice(0, 16000);

  // Call AI for code review with retry logic
  let commentText;
  try {
    log('Calling AI for code review...');
    const { text, usage } = await callAI(client, userPrompt);
    commentText = text;
    log(`Token usage: ${usage.inputTokens} in, ${usage.outputTokens} out, ${usage.totalTokens} total`);
  } catch (error) {
    log(`AI review failed: ${error.message}`, 'error');
    commentText = `⚠️ AI review failed: ${error.message}\n\nPlease review the code changes manually.`;
  }

  console.log('\n--- LLM Generated Review ---\n', commentText);

  // Extract PR number from GitHub environment
  const ref = process.env.GITHUB_REF || '';
  const prMatch = ref.match(/refs\/pull\/(\d+)\/merge/) || ref.match(/pull\/(\d+)/);
  const prNumber = (prMatch && prMatch[1]) || process.env.PR_NUMBER;
  if (!prNumber) {
    console.error('PR number not found in GITHUB_REF:', process.env.GITHUB_REF);
    console.log('--- LLM output (local preview) ---\n', commentText);
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY;
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    console.error('GITHUB_TOKEN missing — cannot post comment.');
    process.exit(1);
  }

  // Post AI review as PR comment
  const commentBody = `**AI Review (automated):**\n\n${commentText}\n\n_AI suggestion — review required._`;

  const postRes = await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${ghToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({ body: commentBody })
  });

  if (!postRes.ok) {
    const txt = await postRes.text();
    console.error('Failed to post comment', postRes.status, txt);
    console.log('\n--- AI Review (unable to post) ---\n', commentText);
    console.error('\nNote: Ensure GITHUB_TOKEN has "pull-requests: write" or "issues: write" permission in workflow.');
    process.exit(1);
  }

  console.log('Posted AI review comment to PR', prNumber);
}

main().catch(err => {
  console.error('Unhandled error in ai-review:', err);
  process.exit(1);
});
