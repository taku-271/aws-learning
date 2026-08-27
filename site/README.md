# site — 学習ノート公開サイト

各トピックに置いた `<番号>-<トピック名>/site/index.html`(+ 同ディレクトリのCSSなど)を集めて、
1つの静的サイトとして公開するための仕組みです。ページの中身・デザイン(HTML/CSS)はトピックごとに
手で書きます — README.mdを自動変換するものではありません。README.mdは今まで通り学習メモとして
各トピックに残し、公開したくなったら別途 `site/` フォルダにページを作る、という2本立てです。

ホスティングは [AWS Blocks](https://docs.aws.amazon.com/blocks/latest/devguide/what-is-blocks.html) の
`Hosting` construct を使い、Amazon CloudFront + Amazon S3 に静的サイトとしてデプロイします。バックエンド
APIは持たない、純粋な静的サイトです。

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
│   ├── index.ts           # バックエンド定義(APIなし。AWS Blocksの構造上ファイルのみ必要)
│   ├── index.cdk.ts        # CDKレイヤー。Hosting constructでCloudFront+S3を構築
│   └── scripts/            # デプロイ/削除用スクリプト(AWS Blocksの標準テンプレートのまま)
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

## 注意

- `site/aws-blocks/` はこのサイトを配信するためだけのAWS Blocksアプリで、他のトピックの `cdk/`・
  `terraform/` ハンズオンとは独立しています。
- 各トピックの `site/index.html` の中身・デザインはこのツールでは一切加工しません。
