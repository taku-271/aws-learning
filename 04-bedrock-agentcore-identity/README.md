# 04. Amazon Bedrock AgentCore Identity

## 概要

**Amazon Bedrock AgentCore Identity** は、AIエージェントやツールといった「非人間アイデンティティ
(non-human identity)」向けに特化した、認証・認可・認証情報管理サービス。

エージェントが増えるほど、次のような課題が顕在化する。

- エージェントごとに一貫した「身元」をどう管理するか
- エージェントを呼び出すユーザー/クライアントをどう検証するか(**インバウンド認証**)
- エージェントが裏側でSlack・GitHub・Google・AWSサービスなどにアクセスする際の認証情報をどう安全に
  払い出し・保管するか(**アウトバウンド認証**)
- ユーザーごとの認可コンテキスト(「このトークンはUser Aのものであり、User Bのデータに使ってはいけない」)
  をエージェント実行環境の中でどう厳密に分離するか

AgentCore Identityはこれらを、SigV4・標準化されたOAuth 2.0フロー・APIキーを横断する形で一元的に扱う。
Amazon Bedrock AgentCoreの他コンポーネント(Runtime、Gateway)と統合されており、Runtime/Gatewayを使う
場合はインバウンド認証・アウトバウンド認証の多くを自動的に肩代わりしてくれる。

## なぜ必要か(解決する課題)

- エージェントは「人間ではないが、人間に代わって(または自律的に)外部リソースにアクセスする」存在であり、
  従来のIAMユーザー/ロールだけでは表現しづらい認可パターン(ユーザー委任・多エージェント間の連鎖など)が
  発生する。
- 複数の外部サービス(Slack、GitHub、Google、Salesforceなど)ごとに異なる認証方式(APIキー、OAuth 2.0)を
  自前で実装・保管するのはリスクが高く、認証情報がエージェントのコードやログに露出しやすい。
- マルチテナント環境では「Agent AがUser 1の代わりにGoogle Driveへアクセスする際、誤ってUser 2のデータを
  取得してしまう」ようなクロステナント漏えいを防ぐ厳密なスコープ分離が必要。

AgentCore Identityは、ゼロトラストの考え方(すべてのリクエストを送信元によらず個別に検証する)に基づき、
これらを一元的な仕組みとして提供する。

## AgentCore Identityの主要コンポーネント

| コンポーネント | 役割 |
| --- | --- |
| Agent identity directory(ワークロードアイデンティティディレクトリ) | エージェント/ワークロードのアイデンティティを作成・管理・整理する統一ディレクトリ。ARNで一意に識別され、AWSホスト・自己ホスト・ハイブリッドを問わず組織内のエージェントの単一の真実源(source of truth)となる |
| Agent authorizer(インバウンド認証) | エージェントを呼び出そうとしているユーザー/サービスが許可されているかを検証する |
| Resource credential provider(アウトバウンド認証の設定) | エージェントが外部リソースサーバー(Google、GitHubなど)へアクセスするための認証情報を取得する設定を保持する |
| Resource token vault(トークンボルト) | ユーザーのOAuthアクセストークン・リフレッシュトークン・APIキー・OAuthクライアントシークレットを暗号化して保管し、エージェントが安全に取得できるようにする |

トークンボルトはAWS KMS(カスタマー管理キー対応)で暗号化され、認証情報の取得はエージェント単位に厳しく
制限される。ユーザー固有の認証情報(OAuthトークンなど)は、紐づくユーザーの代理としてのみアクセスでき、
最小権限と委任の原則が保たれる。

## インバウンド認証(Inbound Auth)の仕組み

インバウンド認証は「誰がこのエージェント/Gatewayを呼び出せるか」を検証する仕組みで、AgentCore Runtime・
AgentCore Gatewayの両方に共通の設定(`CustomJWTAuthorizerConfiguration`)で構成する。1つのRuntime/Gateway
(バージョン)は同時に1つの認証方式のみをサポートする。

### 認証方式

| 方式 | 用途 |
| --- | --- |
| AWS IAM(SigV4) | AWS内のサービス間呼び出し。AWS認証情報でリクエストに署名する。IAM側の設定だけで完結し、AgentCore Identity固有の追加設定は不要 |
| OAuth 2.0(JWT Bearerトークン) | エンドユーザーが既存のID プロバイダー(Amazon Cognito、Okta、Microsoft Entra IDなど)を通じて直接認証する場合 |

### JWTオーソライザーの設定項目

- **Discovery URL**: IdPのOIDC Discoveryエンドポイント(`^.+/\.well-known/openid-configuration$`)。
  これを指定するだけで、AgentCore IdentityはそのOIDC IdPが発行したトークンを動的に検証できる(個別の
  事前オンボーディング不要)。
- **Allowed audiences**: JWTの`aud`クレームと照合する許可オーディエンスのリスト。トークンが別のAPI向けに
  発行されたものを誤って使い回されることを防ぐ。
- **Allowed clients**: JWTの`client_id`クレームと照合する許可クライアントIDのリスト。
- **Allowed scopes**: 許可するOAuthスコープのリスト。設定した場合、トークン内の少なくとも1つのスコープが
  一致する必要がある。
- **Required custom claims**: 特定クレーム(例: `department`)の値が期待値と一致することを要求するカスタム
  ルール(`inboundTokenClaimName`/`inboundTokenClaimValueType`/`claimMatchOperator`など)。

### インバウンド認証フロー(JWTの場合)

1. エンドユーザーがIdP(Cognito/Okta/Entra IDなど)で認証する。
2. クライアントアプリがIdPからベアラートークン(JWT)を受け取る。
3. クライアントがそのトークンを`Authorization`ヘッダーに載せてRuntime/Gatewayを呼び出す。
4. AgentCore Runtime/GatewayがAgentCore Identity経由でトークンの署名・有効期限・発行者(`iss`)を
   暗号学的に検証し、設定されたAudience/Client/Scope/カスタムクレームと突き合わせる。
5. 検証に成功すればリクエストを処理し、失敗すれば呼び出し前に拒否する。

この検証はエージェントのコード実行前に行われるため、エージェント自身がトークン検証ロジックを実装する
必要はない。

## ワークロードアイデンティティとワークロードアクセストークン

AgentCore Runtimeにデプロイされた各エージェントには、自動的に一意の**ワークロードアイデンティティ**が
割り当てられる。これはエージェントのAWS環境内での「デジタルな身元」であり、IAMロール・OAuth 2.0トークン・
APIキーのいずれを使う場合でも一貫した身元を保つための土台になる。

**ワークロードアクセストークン**は、エージェントがAgentCore Identityなどのファーストパーティ
AgentCoreサービス(アウトバウンドの認証情報プロバイダーなど)にアクセスするための、AWS署名付きの
opaque(不透明)なトークンで、外部サービスには直接使えない。Runtime/Gatewayが自動的に発行してエージェント
実行環境に渡すため、通常は手動でのトークン管理は不要。

ワークロードアクセストークンの取得には2つのパターンがある。

| パターン | API | 内容 | 推奨用途 |
| --- | --- | --- | --- |
| JWTベース | `GetWorkloadAccessTokenForJWT` | エンドユーザーのJWT(発行者・署名・有効期限を暗号学的に検証)を渡してトークンを取得。`iss`/`sub`クレームでユーザーを一意に識別 | 本番環境(推奨) |
| UserIdベース | `GetWorkloadAccessTokenForUserId` | 文字列のユーザーIDをそのまま渡してトークンを取得。プラットフォームはこの文字列を検証しない(opaqueな文字列として扱う) | JWTが用意できない開発/クイックスタート、または上流で身元解決済みのアーキテクチャに限定 |

UserIdベースのパターンはなりすましのリスクがあるため、AWS公式のセキュリティ推奨事項として以下が
挙げられている。

- 信頼できるプリンシパルのコンテキスト(IAM呼び出し元IDやセッション属性)からuserIdを導出し、
  クライアントから任意の値をそのまま受け取らない。
- `bedrock-agentcore:GetWorkloadAccessTokenForUserId`のIAM権限を必要な範囲だけに限定し、ワイルドカードや
  マネージドポリシーでの広範な付与を避ける。
- 常にJWTが利用可能なワークロードでは、`GetWorkloadAccessTokenForUserId`と`InvokeAgentRuntimeForUser`を
  明示的にDenyするIAMポリシーを設定し、UserIdベースの経路を使わせない。
- 複数のIdPを使う場合は`provider_id+user_id`(例: `cognito+user123`)の形でuserIdをパーティション分割し、
  IdPをまたいだユーザーIDの衝突を防ぐ。
- CloudTrailで`GetWorkloadAccessTokenForUserId`の呼び出しを監査し、想定外のuserId値を検知する。

Runtime/Gatewayが自動でトークンを取得する場合の流れ:

1. Runtimeがインバウンドのトークン(IdP発行のOAuthトークン)の発行者・署名を検証する。
2. トークンから`iss`/`sub`クレーム(ユーザー識別情報)を抽出する。
3. エージェントに紐づくワークロードアイデンティティを取得する。
4. ユーザー身元とワークロードアイデンティティの両方を指定して`GetWorkloadAccessTokenForJWT`を呼び出す。
5. 得られたワークロードアクセストークンを、実行ペイロードのヘッダーとしてエージェントコードに渡す。

Runtime/Gatewayが管理するワークロードアイデンティティは、エージェント自身がワークロードアクセストークンを
直接取得することができないよう制限されている(トークンの抜き取り・悪用を防止するための設計)。

## アウトバウンド認証(Outbound Auth)の仕組み

アウトバウンド認証は、エージェントが外部の(または内部の)リソースサーバーへアクセスするための認証情報を
AgentCore Identityが仲介・管理する仕組み。

### 認証方式とモード

| 認証方式 | 内容 |
| --- | --- |
| OAuth 2.0 | OAuthをサポートするサービス(Slack、GitHub、Google、Salesforce、Zoom、Auth0、Cognito、Microsoft Entra ID、Oktaなど)向け |
| APIキー | APIキーベースの認証を使うサービス向け |

| モード | 内容 |
| --- | --- |
| ユーザー委任(user-delegated / 3LO) | ユーザー本人の代わりに、そのユーザーが同意した権限範囲でリソースへアクセスする(Authorization Code Grant) |
| 自律的(autonomous / 2LO・M2M) | ユーザーを介さず、サービスレベルの認証情報でエージェント自身がアクセスする(Client Credentials Grant) |

AgentCore SDKでは`auth_flow`パラメータとして`USER_FEDERATION`(3LO/ユーザー委任)、`M2M`(2LO/自律的)、
API的には`ON_BEHALF_OF_TOKEN_EXCHANGE`も選択できる(`GetResourceOauth2Token`の`oauth2Flow`パラメータ)。

### Resource Credential Provider

外部サービスごとに **Resource Credential Provider**(`OAuth2CredentialProvider`または
`ApiKeyCredentialProvider`)を作成し、クライアントID/シークレット、認可エンドポイント/トークン
エンドポイント(またはOIDC Discovery URL)などを登録する。Slack・GitHub・Google・Microsoft・Okta・
Auth0・Cognitoなど主要ベンダー向けの組み込み(included)設定と、任意のOAuth 2.0プロバイダー向けの
カスタム設定の両方に対応する。

`CreateOauth2CredentialProvider`を呼び出すと、AgentCore Identityはそのプロバイダー専用の一意な
OAuth2コールバックURLを発行する。このURLは**セッションバインディング**に使われ、認可コード交換を
クロスプロバイダーのリプレイ攻撃やCSRF類似の攻撃から守る(＝認可レスポンスは、それを開始した特定の
credential providerに対してしか使えない)。

クライアントシークレット自体も、直接値を渡す代わりにAWS Secrets ManagerのシークレットARNを参照する形
(`clientSecretSource: EXTERNAL`)で登録でき、シークレットのローテーションと連携できる。

### アウトバウンド認証フロー(ユーザー委任・3LO・初回アクセス時)

ユーザーがまだそのエージェントにリソースアクセスを許可しておらず、トークンボルトに有効なトークンが
存在しない場合の流れ(Authorization Code Grant):

1. 認証済みユーザーがエージェントにリクエストを送る。エージェントはインバウンドのJWTなどからユーザーIDを
   特定する。
2. エージェントが`GetWorkloadAccessTokenForUserId`(または`ForJWT`)を呼び出し、ユーザーに紐づく
   ワークロードアクセストークンを取得する。
3. AgentCore Identityがワークロードアクセストークンを返す。
4. エージェントが`GetResourceOauth2Token`を呼び出す。ワークロードアクセストークン、対象の
   Resource Credential Provider名、必要なスコープ(例: GitHubの`read:user`)、コールバックURL
   (セッションバインディング用)を渡す。
5. 有効なトークンが存在しないため、AgentCore Identityは認可フローの状態を追跡する`sessionUri`を生成する。
6. AgentCore Identityが認可URLと`sessionUri`をエージェントに返す。
7. エージェントがその認可URLをユーザーに提示し、認可を促す。
8. ユーザーが認可URLをクリックし、外部サービス(例: GitHub)の同意画面で権限を許可する。
9. 認可サーバーが認可コードをAgentCore Identityに送る。
10. AgentCore Identityが`sessionUri`付きでユーザーをコールバックURL(セッションバインディング用URL)に
    リダイレクトする。
11. ユーザーのブラウザがそのリダイレクトに従う。
12. アプリ側(セッションバインディングを処理するサービス)がセッションを突き合わせ、認可コード交換が
    正しいユーザー・正しいプロバイダーの組み合わせであることを確定させる。
13. AgentCore Identityがアクセストークン(および対応する場合はリフレッシュトークン)をトークンボルトに
    保存する。
14. 以降、同じユーザーからの呼び出しでは、有効なトークンがトークンボルトにキャッシュされているため、
    再度ユーザーに同意を求めることなくエージェントがトークンを取得できる。

トークンが期限切れの場合は、保存済みのリフレッシュトークンを使って自動的に新しいアクセストークンを
取得する。リフレッシュトークンも失効している場合は、再度ユーザーへの認可プロンプトが発生する。

### アウトバウンド認証フロー(自律的・2LO/M2M)

ユーザーの同意を必要としないケース(Client Credentials Grant)では、エージェントが自身のワークロード
アイデンティティを使って`GetResourceOauth2Token`(`oauth2Flow: M2M`)を呼び出すだけでよく、認可URLの
提示やユーザーリダイレクトは発生しない。APIキー認証の場合も同様に、`ApiKeyCredentialProvider`から
`GetResourceApiKey`相当の仕組みでキーを取得する。

### トークンのスコープ分離

ワークロードアクセストークンは「エージェントのワークロードアイデンティティ + ユーザーID」の組み合わせを
バインディングキーとしてトークンをキャッシュする。この暗号学的な紐付けにより、たとえばUser 1のGoogle
トークンがUser 2のリクエスト処理中に誤って使われる、といったクロステナントの漏えいをアプリケーション
ロジックのバグに関わらず防止する。

## インバウンド認証とアウトバウンド認証の関係

Runtime/Gatewayを使う典型的な構成では、次のようにインバウンド認証とアウトバウンド認証が連携する。

```
[エンドユーザー]
   │ ① IdP(Cognito/Okta/Entra ID)で認証、JWT取得
   ▼
[クライアントアプリ] ──② Authorizationヘッダーに JWT を付与──▶ [AgentCore Runtime / Gateway]
                                                              │
                                                              │ ③ インバウンド認証: JWT検証
                                                              │    (発行者/署名/aud/scope/カスタムクレーム)
                                                              ▼
                                                     [AgentCore Identity]
                                                              │
                                                              │ ④ GetWorkloadAccessTokenForJWT
                                                              │    (ワークロードアクセストークン発行)
                                                              ▼
                                                     [エージェントコード]
                                                              │
                                                              │ ⑤ GetResourceOauth2Token /
                                                              │    GetResourceApiKey
                                                              │    (アウトバウンド認証)
                                                              ▼
                                              [Resource Credential Provider]
                                                              │
                                                              │ ⑥ トークンボルトにキャッシュ済みなら即返却
                                                              │    なければユーザー同意フロー(3LO)へ
                                                              ▼
                                          [外部サービス(Slack/GitHub/Google/AWSなど)]
```

インバウンド認証で確立された「検証済みユーザー身元」が、そのままアウトバウンド認証でのトークンボルトの
スコープ(誰の認証情報を取得できるか)に引き継がれる点が、AgentCore Identityの一貫した設計思想。

## 料金

AgentCore Identity単体の追加料金は明示されておらず、AgentCore全体の消費ベース課金モデルの一部として
提供されている(トークンボルトへの保存・取得やAPI呼び出し自体に個別の追加課金は発生しない想定。
最新の料金体系は都度公式ページで確認すること)。

## 参考リンク

- [Overview of Amazon Bedrock AgentCore Identity (Developer Guide)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity-overview.html)
- [Provide identity and credential management for agent applications with Amazon Bedrock AgentCore Identity](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity.html)
- [Configure inbound JWT authorizer](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/inbound-jwt-authorizer.html)
- [Get workload access token](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/get-workload-access-token.html)
- [Obtain OAuth 2.0 access token](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity-authentication.html)
- [Security best practices for AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)
- [AgentCore Runtime: how it works](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html)
- [Introducing Amazon Bedrock AgentCore Identity: Securing agentic AI at scale (AWS ML Blog)](https://aws.amazon.com/blogs/machine-learning/introducing-amazon-bedrock-agentcore-identity-securing-agentic-ai-at-scale/)
- [Securing AI agents with Amazon Bedrock AgentCore Identity (AWS Security Blog)](https://aws.amazon.com/blogs/security/securing-ai-agents-with-amazon-bedrock-agentcore-identity/)
- [Propagate user authorization context in AI agents with Amazon Bedrock AgentCore (AWS Security Blog)](https://aws.amazon.com/blogs/security/propagate-user-authorization-context-in-ai-agents-with-amazon-bedrock-agentcore/)
- [Secure AI agents with Amazon Bedrock AgentCore Identity on Amazon ECS (AWS ML Blog)](https://aws.amazon.com/blogs/machine-learning/secure-ai-agents-with-amazon-bedrock-agentcore-identity-on-amazon-ecs/)
- [Securely launch and scale your agents and tools on Amazon Bedrock AgentCore Runtime (AWS ML Blog)](https://aws.amazon.com/blogs/machine-learning/securely-launch-and-scale-your-agents-and-tools-on-amazon-bedrock-agentcore-runtime/)
- [Amazon Bedrock AgentCore FAQs](https://aws.amazon.com/bedrock/agentcore/faqs/)
- [Amazon Bedrock AgentCore Construct Library (AWS CDK)](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrockagentcore-readme.html)
