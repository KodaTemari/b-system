# Private tournament data

This repository is public. **Do not commit real-name / operational tournament files** under `public/data/...`.

## Where to put real data

Put real datasets under:

```
private/data/<eventId>/...
```

This path is **gitignored** (see `.gitignore`: `private/data/`).

`<eventId>` は URL と一致します（例: `/event/bgp-2026-preliminary/court/1/scoreboard` → データルートの `bgp-2026-preliminary/`）。

## BOCCIA GRAND PRIX 2026 — このリポジトリの `private/data/`

現在 **`bgp-2026-preliminary`（予選ラウンド）のみ** を置いています。

**予選ラウンドはトーナメント戦（プールなし）**です。`schedule.json` には `pools` を置かず、`format: "tournament"` とします。プール＋リーグ戦のデータ形状が必要な大会（例: `public/data/0-TEST`）とは別形式です。

予選・シリーズ・FINAL はピラミッド上は別段階ですが、アプリは **`DATA_ROOT/<eventId>/` のフラット構成**のため、シリーズや FINAL を運用するときは **別フォルダ（別 `eventId`）** を追加します。命名の参考例:

| 段階 | 推奨 `eventId`（フォルダ名） | 備考 |
|------|------------------------------|------|
| 予選ラウンド | `bgp-2026-preliminary` | 本リポジトリの private は当面これのみ |
| SERIES ①〜③ | `bgp-2026-series-1` など | 必要になったらフォルダを新設 |
| FINAL | `bgp-2026-final` | 同上 |

目安: **`bgp-<年>-<ステージ>`**（予選は **`preliminary`**、シリーズは `-series-<n>`）。英小文字・ハイフンで URL 安全な文字列にします。

**`public/data/bgp-qualifiers-2026/`** は従来どおり **匿名デモ用** です。本番用 `eventId` と分けても問題ありません。

## Example layout（予選の一例）

```
private/
  README.md
  data/
    bgp-2026-preliminary/
      init.json
      classes/
        FRD/
          player.json
          schedule.json
          results.json
      court/
        1/
          game.json
          settings.json
```

## How to use on a server

Copy `private/data/<eventId>/` to the machine that serves tournament files (for example next to your runtime `public/data/<eventId>/`), **without committing** it to GitHub.

The `public/data/bgp-qualifiers-2026/` tree in this repo should remain **anonymized demo** content only.
