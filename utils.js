// utils.js - Shared utilities for AI commit and review tools
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { AWS_CONFIG, validateEnv } from './config.js';

// Initialize AWS Bedrock client with validation
export function createBedrockClient() {
  validateEnv();
  
  return new BedrockRuntimeClient({
    region: AWS_CONFIG.REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

// Call AI with retry logic
export async function callAI(client, prompt, retries = AWS_CONFIG.MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.send(new ConverseCommand({
        modelId: AWS_CONFIG.MODEL_ID,
        messages: [{ role: 'user', content: [{ text: prompt }] }]
      }));

      if (!response?.output?.message?.content?.[0]?.text) {
        throw new Error('Invalid API response structure');
      }

      return {
        text: response.output.message.content[0].text,
        usage: response.usage
      };
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`AI call failed after ${retries} attempts: ${error.message}`);
      }
      console.warn(`Attempt ${attempt} failed, retrying... (${error.message})`);
      await sleep(AWS_CONFIG.RETRY_DELAY_MS * attempt);
    }
  }
}

// Sleep utility for retry delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sanitize text by removing newlines
export function sanitizeText(text) {
  return text.trim().replace(/[\n\r]/g, ' ');
}

// Log with timestamp
export function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}
