import * as cdk from 'aws-cdk-lib';

import { Hosting } from '@aws-blocks/blocks/cdk';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getStackName } from '@aws-blocks/blocks/scripts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new cdk.App();
const projectRoot = app.node.tryGetContext('projectRoot') || process.cwd();

const stackName = getStackName({ sandbox: false, projectRoot });
const stack = new cdk.Stack(app, stackName);

// Static site only (README.md -> HTML) — no AWS Blocks backend (no API
// Gateway/Lambda), just the Hosting construct on a plain CDK stack:
// https://docs.aws.amazon.com/blocks/latest/devguide/bb-hosting.html
new Hosting(stack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  buildOutputDir: 'dist',
});
