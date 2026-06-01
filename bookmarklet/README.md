# Foresma Lreach CRM取込ブックマークレット

## セットアップ手順

### 1. GASウェブアプリをデプロイする

1. Apps Script エディタを開く
2. **デプロイ** → **新しいデプロイ**
3. 以下の設定でデプロイ:
   - 種類: **ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員（匿名を含む）**
4. 発行された **URL をコピー**する

### 2. ブックマークレットのURLを設定する

`lreach_bookmarklet.js` の先頭にある以下の行を書き換える:

```js
var ENDPOINT_URL = 'ここにウェブアプリのURLを貼り付け';
```

### 3. ブックマークに登録する

ブラウザのブックマークバーを右クリック → **「ページを追加」**
- 名前: `CRM: Lreach取込`
- URL: `javascript:(function(){...})()`  ← minify済みのコードを貼る

### 4. 動作確認（デバッグモード）

`DEBUG_MODE = true` に設定してブックマークをクリックすると、
データを送信せずにコンソール（F12）で抽出結果を確認できる。

---

## HTML構造の確認方法

Foresma Lreachの一覧画面を開き、F12コンソールで実行:

```js
// テーブルの行数確認
document.querySelectorAll('table tbody tr').length

// 1行目の中身確認
document.querySelectorAll('table tbody tr')[0].innerText

// 全セルの中身確認
Array.from(document.querySelectorAll('table tbody tr')[0].querySelectorAll('td'))
  .map((td, i) => i + ': ' + td.innerText.trim())
```

その結果を共有してもらえれば、`extractFromTableRow()` の列順を正確に設定します。
