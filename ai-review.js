// ai-review.js
import { execSync } from 'child_process';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }); }
  catch (e) {
    console.error(`Command failed: ${cmd}`);
    console.error(e.message);
    return (e.stdout || '').toString();
  }
}

function scrubSecrets(text) {
  // naive patterns — expand as needed
  return text
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]')
    .replace(/(?:ssh-rsa|ssh-ed25519)\\s+[A-Za-z0-9+/=]+/g, '[REDACTED_SSH_KEY]');
}

async function main() {
  // PR diff relative to main — limited hunks only
  const diff = run('git --no-pager diff origin/main...HEAD --unified=0').slice(0, 9000);
  const trimmedDiff = scrubSecrets(diff);
  
  if (!trimmedDiff || trimmedDiff.trim().length === 0) {
    console.log('No changes detected in diff. Exiting.');
    return;
  }

  // Run ESLint (JS/TS) and capture JSON output (if available)
  let eslintOut = '';
  try {
    eslintOut = run('npx eslint . -f json --no-error-on-unmatched-pattern').slice(0, 8000);
  } catch (e) {
    eslintOut = 'ESLint failed or no JS files.';
  }

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

  let commentText;
  try {
    const response = await client.send(new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      messages: [{
        role: 'user',
        content: [{ text: userPrompt }]
      }]
    }));

    commentText = response.output.message.content[0].text;
    const usage = response.usage;
    console.log('Token usage:', { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens });
  } catch (error) {
    console.error('AWS Bedrock API call failed:', error.message);
    commentText = `⚠️ AI review failed: ${error.message}\n\nPlease review the code changes manually.`;
  }

  console.log('\n--- LLM Generated Review ---\n', commentText);

  // Compute PR number
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
