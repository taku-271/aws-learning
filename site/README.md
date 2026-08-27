# site — 学習ノート公開サイト

各トピックに置いた `<番号>-<トピック名>/site/index.html`(+ 同ディレクトリのCSSなど)を集めて、
1つの静的サイトとして公開するための仕組みです。ページの中身・デザイン(HTML/CSS)はトピックごとに
手で書きます — README.mdを自動変換するものではありません。README.mdは今まで通り学習メモとして
各トピックに残し、公開したくなったら別途 `site/` フォルダにページを作る、という2本立てです。

ホスティングは [AWS Blocks](https://docs.aws.amazon.com/blocks/latest/devguide/what-is-blocks.html) の
`Hosting` construct を使い、Amazon CloudFront + Amazon S3 に静的サイトとしてデプロイします。バックエンド
APIは持たない、純粋な静的サイトです。`Hosting` は素の CDK スタックに直接乗せているだけで、AWS Blocksの
バックエンド(API Gateway + Lambda)は一切作りません。

## トピック側の構成

公開したいトピックには、`README.md` とは別に `site/` サブディレクトリを作ります。

```
<番号>-<トピック名>/
├── README.md          # 学習メモ(いつも通り。GitHub上で読む用)
├── cdk/ terraform/     # あれば
└── site/                # 公開したい場合のみ
    ├── index.html        # このトピックの公開ページ(自由にデザインしてよい)
    └── style.css          # 好きなだけCSSファイル・画像などを追加してよい
```

- `site/index.html` が無いトピックはサイトの一覧に出てきません(そのトピックはまだ公開しない、という状態)。
- `site/` の中身はそのままコピーされるだけなので、CSS・画像・複数HTMLファイルなど自由に追加できます。
- トップページへ戻るリンクを置きたい場合は `../../index.html` を指定してください
  (`dist/topics/<トピック名>/index.html` から見た `dist/index.html` の相対パスになります)。

## このディレクトリ(公開アプリ本体)の構成

```
site/
├── generate.mjs        # 各トピックの site/ を dist/ に集約するスクリプト
├── homepage.css         # トップページ(トピック一覧)専用のスタイル
├── aws-blocks/
│   ├── index.cdk.ts        # CDKレイヤー。素のcdk.Stack + Hosting constructでCloudFront+S3を構築(バックエンドなし)
│   └── scripts/            # デプロイ/削除用スクリプト。deploy.tsはバックエンドAPIを前提とする
│                            # AWS Blocks標準の deploy() ではなく `cdk deploy` を直接呼ぶ独自実装
└── package.json
```

`generate.mjs` はリポジトリ直下を走査し、`<番号>-*/site/index.html` が存在するトピックを見つけて、
その `site/` フォルダをまるごと `dist/topics/<トピック名>/` にコピーします。トップページ
(`dist/index.html`)は公開済みトピックへのリンク一覧です(`homepage.css` でスタイリング)。

## ローカルで確認する

```bash
cd site
npm install
npm run dev   # トピックのファイル変更を監視しつつ dist/ を再生成し、http://localhost:4173 でプレビュー
```

`npm run build` だけ実行すると `dist/` にビルドしたHTMLが出力されます(ブラウザで直接開いても見られます)。

## AWSにデプロイする

```bash
cd site
npm install
npm run deploy    # CloudFront + S3 を含むスタックをデプロイ(AWS CLI認証情報 & CDK bootstrapが必要)
```

デプロイが完了すると、CloudFrontの配信URLが出力されます。誰でもそのURLでサイトを閲覧できます。

学習が一区切りついたら、課金を避けるため以下で片付けます。

```bash
npm run destroy
```

## GitHub Actionsでの自動デプロイ

`main` に `site/**` または `<番号>-*/site/**` の変更がpushされると、
`.github/workflows/deploy-site.yml` が自動で `npm run deploy` を実行します。手動で
`npm run deploy` を叩く必要はありません(ローカルからの手動デプロイも引き続き可能です)。

認証はOIDC(GitHub Actions ↔ AWS IAM Role)を使い、長期のアクセスキーはリポジトリに置きません。
初回のみ、AWSアカウント側で以下を手動セットアップしてください(このリポジトリのコードだけでは完結しません)。

1. GitHubをIDプロバイダとして登録(既に他のワークフローで登録済みなら不要):
   ```bash
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com \
     --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
   ```
2. GitHub Actionsからのみ引き受けられるIAM Roleを作成し、信頼ポリシーを以下のようにする
   (`<ACCOUNT_ID>` は自分のAWSアカウントIDに置き換え。`sub`をmainブランチに限定しているので、
   フォークや他ブランチからは引き受けられません):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
           },
           "StringLike": {
             "token.actions.githubusercontent.com:sub": "repo:taku-271/aws-learning:ref:refs/heads/main"
           }
         }
       }
     ]
   }
   ```
   権限ポリシーは、ローカルで `cdk bootstrap` 済みであれば以下の最小権限で足ります。CDKは
   `cdk bootstrap` が作成したRole(`cdk-hnb659fds-*`)側に実際にS3・CloudFront・CloudFormationを
   操作する権限を持たせる設計になっているため、GitHub Actions用Roleにはそれらをassumeする権限
   だけを与えれば十分です(`<ACCOUNT_ID>`・`<REGION>` は実際の値に置き換え。正確なRole名は
   `aws iam list-roles --query "Roles[?starts_with(RoleName, 'cdk-hnb659fds')].{Name:RoleName,Arn:Arn}"`
   で確認できます):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AssumeCdkBootstrapRoles",
         "Effect": "Allow",
         "Action": "sts:AssumeRole",
         "Resource": [
           "arn:aws:iam::<ACCOUNT_ID>:role/cdk-hnb659fds-deploy-role-<ACCOUNT_ID>-<REGION>",
           "arn:aws:iam::<ACCOUNT_ID>:role/cdk-hnb659fds-file-publishing-role-<ACCOUNT_ID>-<REGION>",
           "arn:aws:iam::<ACCOUNT_ID>:role/cdk-hnb659fds-lookup-role-<ACCOUNT_ID>-<REGION>"
         ]
       }
     ]
   }
   ```
   `hnb659fds` はCDKのデフォルトqualifier(`cdk.json` でカスタマイズしていなければそのまま)。
   Dockerイメージアセットは使わないため `image-publishing-role` は含めていません。
3. 作成したRoleのARNをリポジトリの Settings → Secrets and variables → Actions に
   `AWS_DEPLOY_ROLE_ARN`(Secret)として、デプロイ先リージョンを `AWS_REGION`(Variable)として登録します。

セットアップ後は、`main` にマージされるたびに自動でサイトが更新されます。

## 注意

- `site/aws-blocks/` はこのサイトを配信するためだけのAWS Blocksアプリで、他のトピックの `cdk/`・
  `terraform/` ハンズオンとは独立しています。
- 各トピックの `site/index.html` の中身・デザインはこのツールでは一切加工しません。
- `site/.blocks/config.json` の `stackId` は `AWS`/`aws` から始まる名前にしないこと。この制約は
  `BlocksStack`(AWS Blocksのバックエンド)を使うアプリ全般に当てはまる: `BlocksStack.create()` は
  スタック名(`<stackId>-prod`)から `AWS::ResourceGroups::Group` を自動生成するが、Resource Groups
  のグループ名は大文字小文字を問わず `AWS` で始まる名前を予約語として拒否するため、`stackId` がそれで
  始まっていると `Group name must not start with 'AWS' (Service: ResourceGroups, Status Code: 400)` で
  デプロイが失敗する。このsiteアプリ自体は現在バックエンドなし(`BlocksStack` を使わず素の `cdk.Stack` +
  `Hosting` のみ)なのでこの自動生成は起きないが、`stackId` は他の用途(スタック名そのものなど)にも
  使われるので引き続き `aws`/`AWS` 始まりは避けること。
