// ai-commit.js - Generates AI-powered commit messages from staged changes
import simpleGit from 'simple-git';
import { createBedrockClient, callAI, sanitizeText, log } from './utils.js';
import { DIFF_CONFIG, COMMIT_CONFIG } from './config.js';

const git = simpleGit();
let client;

// Initialize client with error handling
try {
  client = createBedrockClient();
} catch (error) {
  console.error('Initialization failed:', error.message);
  process.exit(1);
}

// Summarize large diffs for better AI context
async function summarizeDiff(diff) {
  if (diff.length <= DIFF_CONFIG.MAX_SIZE) {
    return diff;
  }

  log(`Large diff detected (${diff.length} chars), creating summary...`);
  const stat = await git.diff(['--cached', '--stat']);
  const diffSummary = await git.diffSummary(['--cached']);
  
  const fileChanges = diffSummary.files.map(f => 
    `${f.file}: +${f.insertions} -${f.deletions}`
  ).join('\n');
  
  return `Files changed:\n${fileChanges}\n\nStats:\n${stat}\n\nKey changes:\n${diff.slice(0, DIFF_CONFIG.SUMMARY_SIZE)}`;
}

// Build prompt for commit message generation
function buildPrompt(diffContent) {
  return `Generate a concise git commit message for these changes:

${diffContent}

Follow conventional commits format (type: description).
Types: ${COMMIT_CONFIG.TYPES.join(', ')}.
Keep it under ${COMMIT_CONFIG.MAX_LENGTH} characters.
Return ONLY the commit message, nothing else.`;
}

async function main() {
  try {
    // Get staged changes
    log('Checking for staged changes...');
    const diff = await git.diff(['--cached']);
    
    if (!diff || diff.trim().length === 0) {
      log('No staged changes found. Use "git add" first.', 'warn');
      process.exit(1);
    }

    // Summarize if needed
    const diffContent = await summarizeDiff(diff);
    const prompt = buildPrompt(diffContent);

    // Call AI with retry logic
    log('Generating commit message...');
    const { text, usage } = await callAI(client, prompt);
    const message = sanitizeText(text);
    
    log(`Token usage: ${usage.inputTokens} in, ${usage.outputTokens} out, ${usage.totalTokens} total`);
    console.log('\nGenerated commit message:', message);
    
    // Commit staged changes
    log('Committing changes...');
    await git.commit(message);
    log('Changes committed successfully!', 'info');
    console.log('\nYou can now run: git push');
  } catch (error) {
    log(`Failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

main();
