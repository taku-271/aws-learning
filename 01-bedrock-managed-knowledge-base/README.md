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

## コスト比較(S3 Vectors / OpenSearch Serverless / Aurora Serverless との比較)

vector store 型 Knowledge Base で使える代表的なベクトルストアと、Managed Knowledge Base の
料金体系を比べてみた。

### Managed Knowledge Base の料金体系

ストレージ課金 + API呼び出し課金のシンプルなモデル。マルチモーダルパース・埋め込み・
再ランキングはすべて込み(カスタムモデルに差し替えた場合のみ通常のBedrockモデル料金が
別途発生)。

| 項目 | 単価 |
|---|---|
| インデックスストレージ | $5.00 / GB / 月 |
| 標準 Retrieve | $1.00 / 1,000件 |
| Agentic Retrieve | $4.00 / 1,000件(+ 内部で発生する Retrieve 呼び出し分も別途 $1.00/1,000件で加算) |
| マルチモーダルパース・埋め込み・リランカー | 無料込み |

AWS公式の試算例(SharePointから50GBを取り込み、月10万クエリのケース):

- 標準Retrieveのみ: ストレージ$250 + Retrieve$100 = **月$350**
- Agentic Retrieve(平均2回の内部呼び出し): ストレージ$250 + Agentic$400 + 内部Retrieve$200 = **月$850**

### 自前のベクトルストアを使う場合(vector store 型 Knowledge Base)

こちらは「埋め込みモデルのトークン課金」+「ベクトルストア自体の課金」の二重構造になる。

| ベクトルストア | 料金モデル | 特徴的なコスト構造 |
|---|---|---|
| **OpenSearch Serverless** | OCU(OpenSearch Compute Unit)時間課金、$0.24/OCU時間 | 最初のコレクションは indexing/search 合わせて最低4 OCUが常時課金される仕様。AWSの試算例では 4 OCU × 24h × 30日 = **月$691.20 が「待機しているだけ」でかかる最低ライン**。ストレージは別途GB月課金。 |
| **Aurora Serverless(pgvector)** | ACU時間課金(目安 $0.12/ACU時間) | 最小0 ACUまでオートポーズ可能 → アイドル時はコンピュート課金ゼロにできる。ストレージは概ね$0.10/GB程度。 |
| **S3 Vectors** | ストレージ $0.06/GB + PUT/QUERYのリクエスト課金 | プロビジョニング不要のサーバーレス。特化型ベクトルDB比で最大90%のコスト削減を謳う。低頻度アクセス・アーカイブ向け。 |

**ポイント**: OpenSearch Serverlessは「動いていなくても」月$700弱かかる最低ラインがあるため、
小規模な学習用途やトラフィックが少ないアプリでは Managed KB の方が安くなるケースが多い。
一方、Aurora ServerlessやS3 VectorsはアイドルコストがOpenSearchより低く抑えられる。

## パフォーマンス比較

| ベクトルストア | レイテンシ目安 | 得意な領域 |
|---|---|---|
| **OpenSearch Serverless** | sub-10ms(高スループット・低レイテンシ) | 高頻度クエリ、リアルタイム性が必要なアプリ、全文検索+ベクトル検索の併用 |
| **Aurora(pgvector)** | 数ミリ秒〜1桁ms(直接クエリ) | リレーショナルDBとベクトル検索を同居させたい場合 |
| **S3 Vectors** | コールドで1秒未満、ウォームで約100ms | 数十億ベクトル規模の低頻度アクセス・長期保存(RAGでも「たまにしか検索されない」用途向き) |
| **Managed Knowledge Base** | 非公開(内部ストレージ層はAWSが最適化・非開示) | ハイブリッド検索・ドキュメントランキング・agentic retrieval(マルチホップの自動クエリプランニング/再ランキング)が標準搭載。同等機能を自前構築するとかなりの追加実装が必要になる |

### 使い分けの指針

- **とにかく早く・安く始めたい / 小〜中規模データ / 運用コストをかけたくない** →
  Managed KB($5/GB + 従量課金、待機コストなし)
- **超高スループット・sub-10msのレイテンシが必須** →
  OpenSearch Serverless(ただし待機コスト月$700弱は覚悟)
- **リレーショナルクエリとベクトル検索を同じDBでやりたい、トラフィックが波がある** →
  Aurora Serverless + pgvector(オートポーズでコスト圧縮可)
- **数十億ベクトル規模を激安で長期保存、検索頻度は低くてよい** →
  S3 Vectors(ストレージ最安、レイテンシは妥協)

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
- [Amazon Bedrock Pricing(Knowledge Bases セクション)](https://aws.amazon.com/bedrock/pricing/)
- [Build enterprise search for agents with Amazon Bedrock Managed Knowledge Base (AWS Blog)](https://aws.amazon.com/blogs/machine-learning/build-enterprise-search-for-agents-with-amazon-bedrock-managed-knowledge-base/)
- [Vector database options / Cost comparisons (Prescriptive Guidance)](https://docs.aws.amazon.com/prescriptive-guidance/latest/choosing-an-aws-vector-database-for-rag-use-cases/vector-db-options.html)
- [Amazon OpenSearch Service Pricing](https://aws.amazon.com/opensearch-service/pricing/)

## 次にやりたいこと(ハンズオン候補)

- S3 をデータソースにした Managed Knowledge Base を CDK か Terraform で構築し、
  `Retrieve` / `RetrieveAndGenerate` API で実際に問い合わせてみる
- 既存の vector store 型 Knowledge Base(OpenSearch Serverless を自前構築するパターン)
  とコストや構築の手間を比較する
