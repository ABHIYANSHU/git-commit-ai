// ai-commit.js
import 'dotenv/config';
import { execSync } from 'child_process';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({
  region: 'us-east-1',
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
  const diff = run('git diff --cached').slice(0, 8000);
  
  if (!diff || diff.trim().length === 0) {
    console.log('No staged changes found. Use "git add" first.');
    process.exit(1);
  }

  const prompt = `Generate a concise git commit message for these changes:

${diff}

Follow conventional commits format (type: description).
Types: feat, fix, docs, style, refactor, test, chore.
Keep it under 72 characters.
Return ONLY the commit message, nothing else.`;

  try {
    const response = await client.send(new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      messages: [{ role: 'user', content: [{ text: prompt }] }]
    }));

    const message = response.output.message.content[0].text.trim();
    console.log('\nGenerated commit message:', message);
    
    // Auto-commit
    run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    console.log('✓ Changes committed successfully!');
    console.log('\nYou can now run: git push');
  } catch (error) {
    console.error('Failed to generate commit message:', error.message);
    process.exit(1);
  }
}

main();
