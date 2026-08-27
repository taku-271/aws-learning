import { ApiNamespace, Scope } from '@aws-blocks/blocks';

// This app has no backend API. It only publishes the repo's README.md files
// as a static HTML site (see ../generate.mjs) through the Hosting construct
// in index.cdk.ts. A Scope/ApiNamespace is still required so AWS Blocks has
// a backend layer to wire up, even though it exposes no methods.
const scope = new Scope('aws-learning-site');
export const api = new ApiNamespace(scope, 'api', () => ({}));
