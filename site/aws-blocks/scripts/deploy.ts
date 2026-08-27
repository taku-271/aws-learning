import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// No backend API here (static site only), so we run `cdk deploy` directly
// instead of `@aws-blocks/blocks/scripts`' deploy() — that helper assumes
// every stack has an API Gateway and throws "Could not find API URL in CDK
// outputs" when one isn't present.
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

console.log('🚀 Deploying static site (S3 + CloudFront) to AWS...');

try {
  execFileSync(
    'npx',
    [
      'cdk', 'deploy',
      '--require-approval', 'never',
      '--ci',
      '--progress', 'events',
      '--context', `projectRoot=${projectRoot}`,
    ],
    {
      stdio: 'inherit',
      cwd: projectRoot,
      env: { ...process.env, NODE_OPTIONS: '--conditions=cdk' },
    },
  );
} catch (error) {
  console.log('\n❌ Deployment failed.');
  throw error;
}

console.log('\n✅ Deployment complete!');
