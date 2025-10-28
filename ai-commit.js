// ai-commit.js - Generates AI-powered commit messages from staged changes
import 'dotenv/config';
import simpleGit from 'simple-git';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const git = simpleGit();

// Validate AWS credentials are present
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('Error: AWS credentials are missing.');
  console.error('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
  process.exit(1);
}

// Initialize AWS Bedrock client for Claude AI
const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function main() {
  // Get staged changes
  let diff = await git.diff(['--cached']);
  
  if (!diff || diff.trim().length === 0) {
    console.log('No staged changes found. Use "git add" first.');
    process.exit(1);
  }

  // For large diffs (>8KB), create a summary with file stats and partial diff
  let diffContent = diff;
  if (diff.length > 8000) {
    const stat = await git.diff(['--cached', '--stat']);
    const summary = await git.diff(['--cached', '--numstat']);
    const diffSummary = await git.diffSummary(['--cached']);
    
    const fileChanges = diffSummary.files.map(f => 
      `${f.file}: +${f.insertions} -${f.deletions}`
    ).join('\n');
    
    diffContent = `Files changed:\n${fileChanges}\n\nStats:\n${stat}\n\nKey changes:\n${diff.slice(0, 3000)}`;
  }

  const prompt = `Generate a concise git commit message for these changes:

${diffContent}

Follow conventional commits format (type: description).
Types: feat, fix, docs, style, refactor, test, chore.
Keep it under 72 characters.
Return ONLY the commit message, nothing else.`;

  try {
    // Call Claude AI via AWS Bedrock to generate commit message
    const response = await client.send(new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      messages: [{ role: 'user', content: [{ text: prompt }] }]
    }));

    // Extract and sanitize the commit message
    const message = response.output.message.content[0].text.trim().replace(/[\n\r]/g, ' ');
    console.log('\nGenerated commit message:', message);
    
    // Commit staged changes with AI-generated message
    await git.commit(message);
    console.log('✓ Changes committed successfully!');
    console.log('\nYou can now run: git push');
  } catch (error) {
    console.error('Failed to generate commit message:', error.message);
    process.exit(1);
  }
}

main();
