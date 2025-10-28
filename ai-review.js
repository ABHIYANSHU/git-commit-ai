// ai-review.js
import { execSync } from 'child_process';
// Using global fetch available in Node.js 18+

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }); }
  catch (e) { return e.stdout ? e.stdout.toString() : ''; }
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
  console.log(trimmedDiff)

  // Run ESLint (JS/TS) and capture JSON output (if available)
  let eslintOut = '';
  try {
    eslintOut = run('npx eslint . -f json --no-error-on-unmatched-pattern').slice(0, 8000);
  } catch (e) {
    eslintOut = 'ESLint failed or no JS files.';
  }

  // Build prompt (structured)
  const prompt = `Review this pull request code changes. Respond ONLY with a structured code review.

    Provide exactly:
    1. Summary: One sentence describing the changes
    2. Issues: List 0-3 potential problems (file:line format)
    3. Suggestions: Brief fix recommendations
    4. Confidence: low/medium/high with brief reason

    Static Analysis:
    ${eslintOut}

    Code Diff:
    ${trimmedDiff}

    Respond with the review now.`.trim().slice(0, 16000);

  // Call LLM - replace URL + payload with the provider you have
  const lmmUrl = 'https://labs-ai-proxy.acloud.guru/openai/chatgpt-4o/v1/chat/completions'; // example: pluralsight
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.error('LLM_API_KEY not set. Exiting.');
    process.exit(1);
  }

  const body = {
    model: "chatgpt-4o", // adjust to your model
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    temperature: 0.2,
    stream: false
  };

  const res = await fetch(lmmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('LLM call failed', res.status, txt);
    process.exit(1);
  }

  const txt = await res.text();
  let commentText = '';
  
  // Handle SSE streaming format
  if (txt.startsWith('data:')) {
    const lines = txt.split('\n').filter(line => line.startsWith('data:'));
    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(5).trim());
        if (data.token) commentText += data.token;
      } catch (e) { /* skip invalid lines */ }
    }
  } else {
    // Handle standard JSON response
    try {
      const json = JSON.parse(txt);
      if (typeof json !== 'object' || json === null) {
        throw new Error('Invalid response format');
      }
      commentText = json.choices?.[0]?.message?.content ?? JSON.stringify(json, null, 2);
    } catch (e) {
      console.error('Failed to parse JSON response:', txt.slice(0, 500));
      process.exit(1);
    }
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
