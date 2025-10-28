// ai-commit.js
import 'dotenv/config';
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
    return '';
  }
}

async function main() {
  let diff = run('git diff --cached');
  
  if (!diff || diff.trim().length === 0) {
    console.log('No staged changes found. Use "git add" first.');
    process.exit(1);
  }

  // For large diffs, use stat summary instead
  let diffContent = diff;
  if (diff.length > 8000) {
    const stat = run('git diff --cached --stat');
    diffContent = `${stat}\n\nLarge changeset. Key changes:\n${diff.slice(0, 4000)}`;
  }

  const prompt = `Generate a concise git commit message for these changes:

${diffContent}

Follow conventional commits format (type: description).
Types: feat, fix, docs, style, refactor, test, chore.
Keep it under 72 characters.
Return ONLY the commit message, nothing else.`;

  try {
    const response = await client.send(new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      messages: [{ role: 'user', content: [{ text: prompt }] }]
    }));

    const message = response.output.message.content[0].text.trim().replace(/[\n\r]/g, ' ');
    console.log('\nGenerated commit message:', message);
    
    // Auto-commit with sanitized message
    const sanitized = message.replace(/"/g, '\\"');
    execSync(`git commit -m "${sanitized}"`, { encoding: 'utf8' });
    console.log('✓ Changes committed successfully!');
    console.log('\nYou can now run: git push');
  } catch (error) {
    console.error('Failed to generate commit message:', error.message);
    process.exit(1);
  }
}

main();
