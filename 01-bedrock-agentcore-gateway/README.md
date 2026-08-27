# 01. Amazon Bedrock AgentCore Gateway

## 概要

**Amazon Bedrock AgentCore Gateway** は、AIエージェントがツール・他のエージェント・LLM(モデルプロバイダー)へ
アクセスするための、単一のセキュアな入口(エントリポイント)を提供するフルマネージドサービス。

単なる「MCPツールゲートウェイ」に留まらず、以下のようなエージェント関連トラフィック全般をルーティング・保護する
「エージェント向けAIゲートウェイ」として位置づけられている。

- 既存のAPI・Lambda関数・サービスを **Model Context Protocol (MCP)** 互換のツールに変換する
- passthroughターゲットを通じて他のエージェントやHTTPサービス(Agent-to-Agent = A2A通信を含む)をフロントする
- 複数のモデルプロバイダーへの推論リクエストを、統一されたモデルベースルーティングのエンドポイント経由で振り分ける

Gatewayは OpenAPI・Smithy・Lambda をツールの入力タイプとしてサポートし、インバウンド認証(ingress)と
アウトバウンド認証(egress)の両方をフルマネージドで提供する点が特徴。Salesforce・Slack・Jira・Asana・Zendesk
などとのワンクリック連携も用意されている。

Bedrock AgentCoreは Gateway 以外にも Runtime・Memory・Identity・Observability などのコンポーネントから
構成されるが、本トピックでは **Gateway** に絞って学習する。

## なぜ必要か(解決する課題)

エージェントに独自ツールを持たせようとすると、通常は次のような作業が発生する。

- 社内API/LambdaをMCPサーバーとして自前でラップする実装
- サーバーレスやコンテナなどのインフラ構築・スケーリング
- ツールごとに異なる認証方式(APIキー、OAuthなど)の管理
- エージェント側の認証(誰がこのエージェントを呼んでいいか)の検証

Gatewayはこれらを「数行のコード」で肩代わりし、開発者がエージェント固有のロジックに集中できるようにする、
というのが提供価値。

## 主なメリット(Key benefits)

- **ツール開発・統合の簡素化**: 既存のAPI/Lambdaを数行でエージェント対応ツールに変換できる
- **統一アクセスによる開発加速**: API、Lambda、他のエージェント、モデルプロバイダーを1つのセキュアな
  エンドポイントに集約
- **セマンティック検索によるスケーラビリティ**: ツール数が増えても、自然言語クエリでエージェントが
  適切なツールを見つけられる(`x_amz_bedrock_agentcore_search` ツール)
- **包括的な認証**: インバウンド認証(エージェントの身元確認)とアウトバウンド認証(ツールへの接続)を
  1つのサービスで管理。OAuthフロー、トークンリフレッシュ、認証情報の安全な保管に対応
- **フレームワーク互換性**: CrewAI、LangGraph、LlamaIndex、Strands Agentsなど主要OSSフレームワークに対応
- **サーバーレス**: インフラ管理不要、需要に応じて自動スケール、ビルトインのオブザーバビリティ/監査機能

## 主な機能(Key capabilities)

| 機能 | 説明 |
| --- | --- |
| Security Guard | OAuth認可を管理し、正当なユーザー/エージェントのみがツール・リソースにアクセスできるようにする |
| Translation | MCPなどのエージェントリクエストをAPIリクエストやLambda呼び出しに変換する |
| Composition | 複数のAPI・関数・ツール・エージェント・モデルプロバイダーを単一エンドポイントの背後に集約する |
| Secure Credential Exchange | ツールごとに異なる認証情報の注入を処理する |
| Semantic Tool Selection | 自然言語検索で最適なツールを見つけ、プロンプトサイズとレイテンシを削減する |
| Infrastructure Manager | サーバーレスでオブザーバビリティ/監査機能を内蔵、インフラ管理が不要 |

## コアコンセプト

### Gateway と Target

- **Gateway**: エージェントがアクセスする単一のMCPエンドポイント(URL)。ここに複数の **Target** を登録する。
- **Target**: Gatewayに紐づく個々のツール群の実体。Targetを追加すると、その裏側のAPI/Lambda/サービスが
  MCPツールとしてGateway経由で公開される。

### サポートされるTargetの種類

| Target種別 | 内容 |
| --- | --- |
| Lambda targets | AWS Lambda関数をMCPツールに変換する |
| OpenAPI targets | OpenAPI仕様(REST API)をMCPツールとして公開する |
| Smithy targets | Smithyモデル定義から型安全なMCPツールを構築する |
| MCP server targets | 既存の外部MCPサーバー(URLエンドポイント)にそのまま接続する |
| API Gateway stage targets | Amazon API Gatewayのステージをターゲットにする |
| HTTP runtime targets | 任意のHTTPランタイムをターゲットにする |
| Connector targets | Amazon Bedrock Managed Knowledge Bases、Web Search Toolなどの組み込みコネクタ |

### インバウンド認証(ingress)

Gatewayを呼び出すエージェント/クライアントを検証する仕組み。JWTベースの認証(`CUSTOM_JWT`)が中心で、
OIDCのDiscovery URL・許可するAudience/Client ID/Scope・カスタムクレームの一致条件などを設定する。
Amazon Cognitoをアイデンティティプロバイダーとして使う構成がクイックスタートとして用意されている
(`agentcore create` コマンドで自動セットアップ可能)。

### アウトバウンド認証(egress)

Gatewayが各Targetの裏側(Lambda実行ロール、外部APIのAPIキー、OAuthなど)へアクセスする際の認証情報。
Targetごとに異なる認証方式(IAMロール、APIキー、OAuth)を設定でき、Gatewayが認証情報の交換・注入を代行する。

### AgentCore Identity

Runtime/Gateway双方で共通の仕組みとして、エージェントごとに **ワークロードアイデンティティ** が割り当てられる。
IAMロール、OAuth 2.0トークン、APIキーなど複数の認証手段を横断して、エージェントの一貫した身元を保つ。

## オプション機能(Gateway features)

| 機能 | 説明 |
| --- | --- |
| Debugging messages | Gateway呼び出し時に詳細なデバッグメッセージを返す(本番投入前に無効化推奨) |
| Custom encryption | AWS管理キーの代わりに自分で管理するKMSキーで暗号化する |
| Semantic search of tools | 自然言語クエリでツールを検索する(`x_amz_bedrock_agentcore_search`) |
| Tagging | リソースへのタグ付け |
| MCP sessions | クライアント-Gateway間のステートフルなやり取り(session ID保持) |
| Response streaming | ツール実行中の進捗をServer-Sent Events (SSE) でリアルタイム受信 |
| Elicitation | MCP server targetがツール呼び出し中にクライアントへ追加情報(ユーザー確認や認証)を要求する |
| Sampling | MCP server targetがツール呼び出し中にクライアントへLLM補完を要求する |

## セットアップの基本フロー

1. Gatewayを作成する(インバウンド認証としてJWTオーソライザーを設定。CognitoユーザープールをCLIで自動作成も可能)
2. Gatewayに1つ以上のTargetを追加する(Lambda、OpenAPI、MCPサーバーなど)。Targetごとにツールスキーマと
   アウトバウンド認証情報を定義する
3. エージェント(Strands Agentsなど)からアクセストークンを取得してGatewayのMCPエンドポイントに接続し、
   ツールを一覧・呼び出しする

### CLIでの例(Lambda Target)

```bash
# Gateway作成(対話式でCognito等をセットアップ)
agentcore create

# Lambda関数をTargetとして追加
agentcore add gateway-target \
  --name MyLambdaTarget \
  --type lambda-function-arn \
  --lambda-arn arn:aws:lambda:us-east-1:123456789012:function:MyFunction \
  --tool-schema-file tools.json \
  --gateway MyGateway

agentcore deploy
```

`tools.json` には、MCPツールとして公開する関数のスキーマ(name/description/inputSchema)をJSON Schemaで
記述する。

### Python SDK(GatewayClient)での例

```python
from bedrock_agentcore_starter_toolkit.operations.gateway.client import GatewayClient

client = GatewayClient(region_name="us-east-1")

lambda_target = client.create_mcp_gateway_target(
    gateway=gateway,
    name=None,          # 省略すると自動生成
    target_type="lambda",
    target_payload=None, # 省略すると新規Lambdaが自動作成される
    credentials=None,    # 省略すると認証情報も自動作成される
)
```

## 料金

消費ベース(コンサンプションベース)の課金モデル。

- `ListTools` / `InvokeTool` / Search API などのAPI呼び出し回数に対して課金
- セマンティック検索用にインデックスされたTarget数に対して課金
- ネットワークデータ転送は標準のEC2料金が適用される
- 顧客のVPCへのデータ egress には $0.006/GB のデータ処理料金がかかる(商用リージョン)
- Web Search や Bedrock Managed Knowledge Base の利用は別途課金
- カスタムのレート制限自体には追加料金はかからない

前払い不要・最低利用料金なし。

## 参考リンク

- [Amazon Bedrock AgentCore Gateway: A secure AI gateway for agents, tools, and models (Developer Guide)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html)
- [Introducing Amazon Bedrock AgentCore Gateway (AWS ML Blog)](https://aws.amazon.com/blogs/machine-learning/introducing-amazon-bedrock-agentcore-gateway-transforming-enterprise-ai-agent-tool-development/)
- [Amazon Bedrock AgentCore FAQs](https://aws.amazon.com/bedrock/agentcore/faqs/)
- [Amazon Bedrock AgentCore Gateway features](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-features.html)
- [Define the gateway target configuration](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-add-target-api-target-config.html)
- [Set up inbound authorization for your gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-inbound-auth.html)
- [Configure inbound JWT authorizer](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/inbound-jwt-authorizer.html)
- [Amazon Bedrock AgentCore Pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- [Propagate user authorization context in AI agents with Amazon Bedrock AgentCore (AWS Security Blog)](https://aws.amazon.com/blogs/security/propagate-user-authorization-context-in-ai-agents-with-amazon-bedrock-agentcore/)

## 今後試したいハンズオン

- Lambda TargetをGatewayに登録し、Strands Agentsなどのフレームワークから呼び出す
- Cognitoによるインバウンド認証(JWT)を設定し、アクセストークン取得〜Gateway呼び出しまでの一連の流れを試す
- セマンティックツール検索を有効化し、複数ツール登録時の挙動を確認する
