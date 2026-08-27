# site — 学習ノート公開サイト

各トピック(`<番号>-<トピック名>/README.md`)とルートの `README.md` を、そのまま静的HTMLに変換して
公開するための仕組みです。「勉強が終わったらまとめる」のではなく、書いている最中の内容もそのまま
HTMLとして見られるようにすることが目的です(要約や加工はしません)。

ホスティングは [AWS Blocks](https://docs.aws.amazon.com/blocks/latest/devguide/what-is-blocks.html) の
`Hosting` construct を使い、Amazon CloudFront + Amazon S3 に静的サイトとしてデプロイします。バックエンド
APIは持たない、純粋な静的サイトです。

## 構成

```
site/
├── generate.mjs       # README.md -> HTML への変換スクリプト(トップレベルの一覧ページ + トピックごとのページ)
├── style.css           # 生成するHTMLに適用する共通スタイル
├── aws-blocks/
│   ├── index.ts         # バックエンド定義(APIなし。AWS Blocksの構造上ファイルのみ必要)
│   ├── index.cdk.ts      # CDKレイヤー。Hosting constructでCloudFront+S3を構築
│   └── scripts/          # デプロイ/削除用スクリプト(AWS Blocksの標準テンプレートのまま)
└── package.json
```

`generate.mjs` はリポジトリ直下を走査し、`^\d+-` にマッチするディレクトリの中の `README.md` を
Markdown → HTML変換(`marked`)して `dist/topics/<トピック名>/index.html` に出力します。トップページ
(`dist/index.html`)はルートの `README.md` + 各トピックへのリンク一覧です。

## ローカルで確認する

```bash
cd site
npm install
npm run dev   # README.mdの変更を監視しつつ dist/ を再生成し、http://localhost:4173 でプレビュー
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

## 注意

- `site/aws-blocks/` はこのサイトを配信するためだけのAWS Blocksアプリで、他のトピックの `cdk/`・
  `terraform/` ハンズオンとは独立しています。
- 内容はREADME.mdをそのまま変換したものです。要約や加工は行っていません。
