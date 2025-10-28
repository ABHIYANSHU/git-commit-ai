// config.js - Centralized configuration for AI commit and review tools
import 'dotenv/config';

// AWS Bedrock Configuration
export const AWS_CONFIG = {
  REGION: process.env.AWS_REGION || 'us-east-1',
  MODEL_ID: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000
};

// Diff Processing Configuration
export const DIFF_CONFIG = {
  MAX_SIZE: 8000,
  SUMMARY_SIZE: 3000,
  MAX_DIFF_FOR_PR: 9000,
  MAX_ESLINT_OUTPUT: 8000
};

// Commit Message Configuration
export const COMMIT_CONFIG = {
  MAX_LENGTH: 72,
  TYPES: ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore']
};

// Validate required environment variables
export function validateEnv() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
