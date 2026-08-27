# 03. Amazon SQS (Simple Queue Service)

## 概要

**Amazon Simple Queue Service (SQS)** は、マイクロサービス・分散システム・サーバーレスアプリケーションを
疎結合化してスケールさせるための、フルマネージドなメッセージキューイングサービス。メッセージ指向ミドルウェアの
運用・管理にまつわる複雑さやオーバーヘッドを排除し、開発者が本質的な差別化ロジックに集中できるようにする。

コンポーネント間でメッセージを送信・保存・受信でき、メッセージの消失や他サービスの可用性に依存することなく、
任意のボリュームでやり取りできる。AWS マネジメントコンソール・CLI・SDK から、3つのシンプルなコマンド
(`SendMessage` / `ReceiveMessage` / `DeleteMessage`)ですぐに使い始められる。

## なぜ必要か(解決する課題)

システム間を直接同期呼び出しで繋ぐと、送信側と受信側が密結合になり、以下のような問題が起きやすい。

- 受信側(コンシューマー)がダウンしていると送信側の処理も止まってしまう
- 受信側の処理速度が送信側の生成速度に追いつかないとリクエストが失われる/タイムアウトする
- 受信側をスケールさせる仕組みを自前で作り込む必要がある

SQS をコンポーネント間に挟むことで、送信側(プロデューサー)と受信側(コンシューマー)を **疎結合** にし、
それぞれを独立してスケール・デプロイできるようにする。

## キューの種類

SQS には2種類のキューがあり、要件に応じて選択する。

| 観点 | Standard キュー | FIFO キュー |
| --- | --- | --- |
| スループット | ほぼ無制限 | デフォルトで最大3,000msg/秒(バッチ利用時)。高スループットモードで最大70,000msg/秒まで拡張可 |
| 配信保証 | 少なくとも1回配信(at-least-once)。まれに重複あり | 正確に1回処理(exactly-once)。重複は入らない |
| 順序保証 | ベストエフォート(順序が入れ替わることがある) | 厳密なFIFO(送信順=受信順) |
| 向いている用途 | 重複や順序の入れ替わりを許容できる高スループット処理 | 操作順序が重要、または重複が許されない処理 |
| Lambda トリガー | 対応 | 対応(バッチサイズ上限は10) |

- Standard キューの例: メディアアップロードとリサイズ処理の分離、クレジットカード検証タスクの複数ワーカーへの
  割り当て、将来処理するメッセージのバッチ化
- FIFO キューの例: ユーザー入力コマンドを正しい順序で実行、価格変更を正しい順序で反映、口座登録前の受講登録を防ぐ

## 主要な概念

### 可視性タイムアウト (Visibility Timeout)

コンシューマーがメッセージを受信(`ReceiveMessage`)すると、そのメッセージは一定時間「不可視」になり、
他のコンシューマーから見えなくなる。この間に処理を完了して `DeleteMessage` で削除しないと、タイムアウト後に
メッセージが再び可視化され、別のコンシューマーに配信される。

- デフォルトは30秒、最大12時間まで設定可能
- 処理時間が読めない場合は短め(例: 2分)から始め、`ChangeMessageVisibility` で必要に応じて延長する
  (ハートビート方式)
- 延長しても「最初に受信してから12時間」という上限はリセットされない。12時間を超える処理が必要な場合は
  AWS Step Functions の利用やタスクの分割を検討する
- SDK の読み取りタイムアウトより長く設定し、他のコンシューマーへの二重配信を防ぐ

### デッドレターキュー (Dead-Letter Queue, DLQ)

指定回数(`maxReceiveCount`)処理に失敗したメッセージを隔離するための別キュー。

- 不良メッセージがキュー内の他メッセージの処理をブロックするのを防ぐ
- 失敗メッセージを個別に調査・デバッグでき、DLQ の redrive 機能で元のキュー(または任意の宛先)へ
  再投入できる
- Lambda をコンシューマーにする場合、`maxReceiveCount` を1にはしない(再試行なしでDLQに溜まってしまう)のが
  ベストプラクティス
- Lambda が正常な SQS メッセージを再試行して DLQ に入れてしまう典型的な原因は、**キューの可視性タイムアウトが
  Lambda 関数のタイムアウトの6倍以上になっていない** こと

### ポーリング方式(ショート/ロングポーリング)

`ReceiveMessage` の挙動を制御するオプション。

| 方式 | 挙動 |
| --- | --- |
| ショートポーリング(デフォルト) | サーバーの一部(加重ランダム分散)だけに問い合わせ、メッセージがなくても即座に応答を返す |
| ロングポーリング | 全サーバーに問い合わせ、メッセージが最低1件見つかるまで(最大待機時間=1〜20秒まで)待ってから応答する |

ほぼすべてのケースでロングポーリングが推奨される。空応答の回数を減らせるためコストと性能の両面で有利。
ただし、1スレッドで複数キューを順番にポーリングするような設計では、空のキューでロングポーリングの待機時間
分ブロックされてしまうため注意が必要。

### 遅延キュー (Delay Queues)

メッセージがキューに投入されてから一定秒数(最大15分)コンシューマーに見えないようにする機能。

- 可視性タイムアウトとの違い: 遅延キューは「投入時」に不可視化、可視性タイムアウトは「受信(消費)時」に不可視化
- Standard キューでは遅延設定の変更は既存メッセージに遡及しないが、FIFO キューでは遡及する
- メッセージ単位で遅延させたい場合は、キュー全体の `DelaySeconds` ではなくメッセージタイマーを使う
- 15分を超える柔軟なスケジューリングが必要な場合は Amazon EventBridge Scheduler の利用が推奨される

### 暗号化(SSE)

サーバーサイド暗号化(SSE)を有効にすると、キューに送信されたメッセージ本文が暗号化されて保存される。

- 暗号化されるのはメッセージ本文のみ。キューのメタデータ(キュー名・属性)やメッセージメタデータ
  (メッセージID・タイムスタンプ・属性)、キューごとのメトリクスは暗号化されない
- 暗号化が有効化された後に送信されたメッセージのみが暗号化される(既存の未処理メッセージは対象外)
- 暗号化済みメッセージが暗号化されていない DLQ に移動しても、暗号化された状態のまま保持される
- AWS 管理キーまたはカスタム KMS キー(CMK)でエンベロープ暗号化を行う。データキーの再利用期間
  (1分〜24時間、デフォルト5分)を短くするほどセキュリティは上がるが KMS 呼び出し回数(コスト)が増える

## Lambda との統合(Event Source Mapping)

SQS キューを Lambda のイベントソースとして登録すると、Lambda がキューをポーリングしてメッセージのバッチで
関数を同期呼び出しする。

- 実行ロールに `AWSLambdaSQSQueueExecutionRole` マネージドポリシーが必要
- バッチサイズは Standard キューで最大10,000件、FIFO キューで最大10件(10件を超える場合は
  `MaximumBatchingWindowInSeconds` を1秒以上に設定する必要あり)
- Lambda サービス側が最大1,000並列(リージョンあたり)のポーリングスレッドを立ち上げ、キューのトラフィックに
  応じて自動でスケールする
- 関数が正常終了するとバッチ内のメッセージが削除され、エラー/タイムアウトの場合は可視性タイムアウト経過後に
  メッセージがキューへ戻る
- Lambda の関数タイムアウトはキューの可視性タイムアウトより短く設定する必要がある

```bash
# CLIでイベントソースマッピングを作成する例
aws lambda create-event-source-mapping --function-name ProcessSQSRecord --batch-size 10 \
  --event-source-arn arn:aws:sqs:us-east-1:111122223333:my-queue
```

## 料金

- 従量課金制で、最低利用料金なし
- 全リクエスト(`SendMessage` / `ReceiveMessage` / `DeleteMessage` など)が課金対象で、無料枠を超えた分に
  課金される
- 無料枠: すべてのアカウントで **月100万リクエストまで無料**
- ロングポーリングを使わずに高頻度でポーリングし続けると、メッセージが返らない「空の受信(empty receive)」も
  リクエストとしてカウントされ、想定以上の課金につながりやすい。ロングポーリングの利用や
  `MaxNumberOfMessages` を増やしてのバッチ受信が費用対策として有効
- SSE を使う場合は KMS の API 呼び出し分の料金が別途発生する

## 参考リンク

- [Amazon SQS Developer Guide - Create queue](https://docs.aws.amazon.com/help-panel/AWSSimpleQueueService/latest/console/hp-createq-page.html)
- [Amazon SQS Features](https://aws.amazon.com/sqs/features/)
- [Amazon SQS standard queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html)
- [Amazon SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
- [Implementing AWS Well-Architected best practices for Amazon SQS – Part 2 (AWS Compute Blog)](https://aws.amazon.com/blogs/compute/implementing-aws-well-architected-best-practices-for-amazon-sqs-part-2/)
- [Why did my Lambda function retry valid Amazon SQS messages and place them in my dead-letter queue?](https://repost.aws/knowledge-center/lambda-retrying-valid-sqs-messages)
- [Amazon SQS short and long polling](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html)
- [Amazon SQS delay queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-delay-queues.html)
- [Server-side encryption](https://docs.aws.amazon.com/help-panel/AWSSimpleQueueService/latest/console/hp-createq-encryption.html)
- [Creating and configuring an Amazon SQS event source mapping (Lambda Developer Guide)](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html)
- [Tutorial: Using Lambda with Amazon SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs-example.html)
- [Amazon SQS Pricing](https://aws.amazon.com/sqs/pricing/)
- [Amazon SQS FAQs](https://aws.amazon.com/sqs/faqs/)
- [Why are my Amazon SQS charges higher than expected?](https://repost.aws/knowledge-center/sqs-high-charges)

## 今後試したいハンズオン

- Standard キューと FIFO キューを作成し、送信順序・重複配信の挙動の違いを実際に確認する
- 可視性タイムアウトを短めに設定した上でわざと処理を遅延させ、メッセージが再配信される様子を観察する
- DLQ を設定し、`maxReceiveCount` を超えて失敗したメッセージが DLQ に移動する流れと redrive を試す
- SQS を Lambda のイベントソースとして登録し、バッチサイズや可視性タイムアウトとの関係を確認する
- CDK または Terraform でキュー(+ DLQ + Lambda トリガー)を IaC 化する
