# 01. Amazon Bedrock Managed Knowledge Base

## 概要

Amazon Bedrock Knowledge Bases は、生成AIアプリケーションに RAG(Retrieval-Augmented
Generation)を実装するための Bedrock の機能。自社データの場所を指定するだけで、Bedrock が

1. データソースからドキュメントを取得
2. チャンク(小さなテキストブロック)に分割
3. 埋め込みモデルでベクトル化
4. ベクトルストアに保存・同期

までを内部で行ってくれる。データソース統合やデータ同期のためのカスタム実装は不要で、
マルチターン会話のためのセッションコンテキスト管理も組み込まれている。

Knowledge Base を Bedrock Agent に接続すると、エージェントがユーザー入力に応じて適切な
Knowledge Base を自動選択し、取得した情報をプロンプトに追加してくれる。取得結果には
出典(citation)が付くため、ハルシネーションの抑制とファクトチェックのしやすさにつながる。

### 2種類の Knowledge Base

Bedrock Knowledge Bases には現在、性質の異なる2つの作成方法がある。

| | Managed Knowledge Base(新) | Knowledge base with vector store(従来) |
|---|---|---|
| GA時期 | 2026年6月 GA | 2023年11月 GA(現行のRAGの基本形) |
| ベクトルストア | Bedrock が完全管理(自分で用意しない) | 自分で OpenSearch Serverless / Aurora / Pinecone 等を用意 or Quick create |
| データソース | S3, SharePoint, Confluence, Google Drive, OneDrive, Web Crawler(ネイティブ6種) | S3, Confluence, Salesforce, SharePoint, Web Crawler など |
| 検索機能 | ハイブリッド検索・ドキュメントランキング・agentic retrieval(クエリ計画/再ランキングを自動オーケストレーション)が標準 | チャンク戦略・埋め込みモデル・再ランカーなどを個別に設定 |
| 向いている用途 | 素早く本番品質のRAGを構築したい場合(AWS推奨) | ベクトルストアの選択肢や設定を細かく制御したい場合 |

AWS公式ドキュメントでも「retrieval精度とマネージド体験を最適化するなら Managed
Knowledge Base を推奨」と明記されており、今後の新規構築ではまず Managed Knowledge Base
を検討するのが基本方針になりそう。

## Managed Knowledge Base の特徴

- **インフラ管理不要**: ベクトルDB・データパイプライン・検索基盤の運用が不要。作成時に
  Embeddings モデルを「Default(自動選択・自動管理)」にすることも可能。
- **ネイティブコネクタ6種**: Amazon S3, SharePoint, Confluence, Google Drive, OneDrive,
  Web Crawler。自動データ同期に対応。
- **高度な検索**:
  - ハイブリッド検索(キーワード検索 + セマンティック検索)
  - ドキュメントランキング(re-ranking)
  - agentic retrieval — 複雑なマルチホップクエリに対して、クエリプランニング・中間応答の
    評価・再ランキングを自動でオーケストレーションする
- **マルチモーダル対応**: テキストだけでなく動画・音声・画像を横断した Knowledge Base を
  構築可能
- **Bedrock AgentCore とのネイティブ統合**: 権限の自動生成やオブザーバビリティが組み込みで
  エージェントに接続できる
- **リージョン**: US East (N. Virginia), US West (Oregon), Asia Pacific (Sydney, Tokyo),
  Europe (Dublin, Frankfurt, London), AWS GovCloud (US-West)(2026年6月時点)

## クエリ用API

Knowledge Base(Managed / vector store 型 いずれも共通)に対しては以下の2つのAPIで
問い合わせる。

- **RetrieveAndGenerate**: クエリを埋め込みに変換 → Knowledge Base を検索 →
  検索結果をコンテキストとしてプロンプトに追加 → LLMが生成した回答を返す、という
  一連の流れをまとめて実行する。会話の短期記憶(セッションコンテキスト)も管理してくれる。
- **Retrieve**: 検索結果(関連チャンク)のみを返す。生成は行わず、後続の独自ワークフロー
  (関連度評価、別の回答生成ロジックなど)に使う。LangChain の
  `AmazonKnowledgeBasesRetriever` などから利用できる。

## Managed Knowledge Base の作り方(コンソール手順の概要)

1. Bedrock コンソール → **Knowledge bases** → **Create** → **Managed Knowledge Base**
2. Knowledge Base 名・説明を入力
3. Embeddings model を選択(Default embedding model を選ぶと Bedrock が自動選択・管理)
4. データソースを接続(まずは S3 が試しやすい)
5. 作成後、データソースに対して ingestion job を実行してコンテンツを検索可能にする

CloudFormation/CDK では `AWS::Bedrock::KnowledgeBase` リソースの
`KnowledgeBaseConfiguration` に `ManagedKnowledgeBaseConfiguration`(Managed 型)か
`VectorKnowledgeBaseConfiguration`(vector store 型)のどちらかを指定する形になっている。

## 学んだこと・メモ

- 「Managed Knowledge Base」という名前は、Bedrock Knowledge Bases 全体の別名ではなく、
  2026年6月にGAした特定の作成モード(ベクトルストア管理も含めて完全マネージド)を指す。
  紛らわしいので混同しないこと。
- 既存の(vector store型)Knowledge Base の情報を調べると、OpenSearch Serverless の
  コレクション作成やIAMロールの設定など前提作業が多いが、Managed Knowledge Base は
  そのあたりをAWS側に委任できるのが最大の差分。
- Agent に組み込む場合、Managed Knowledge Base は AgentCore との統合が謳われており、
  権限周りが自動生成される点も従来型との違い。

## 参考リンク

- [Amazon Bedrock Knowledge Bases 製品ページ](https://aws.amazon.com/bedrock/knowledge-bases/)
- [Amazon Bedrock Managed Knowledge Base is now generally available (What's New, 2026/6/17)](https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-bedrock-managed-knowledge-base/)
- [Knowledge bases for Amazon Bedrock (Prescriptive Guidance)](https://docs.aws.amazon.com/prescriptive-guidance/latest/retrieval-augmented-generation-options/rag-fully-managed-bedrock.html)
- [Build a knowledge base with vector stores (User Guide)](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-build.html)
- [Knowledge Bases now delivers fully managed RAG experience in Amazon Bedrock (AWS Blog)](https://aws.amazon.com/blogs/aws/knowledge-bases-now-delivers-fully-managed-rag-experience-in-amazon-bedrock/)

## 次にやりたいこと(ハンズオン候補)

- S3 をデータソースにした Managed Knowledge Base を CDK か Terraform で構築し、
  `Retrieve` / `RetrieveAndGenerate` API で実際に問い合わせてみる
- 既存の vector store 型 Knowledge Base(OpenSearch Serverless を自前構築するパターン)
  とコストや構築の手間を比較する
