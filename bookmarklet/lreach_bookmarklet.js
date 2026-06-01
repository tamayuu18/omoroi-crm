/**
 * Foresma Lreach → CRM スプレッドシート 転送ブックマークレット
 *
 * 【使い方】
 * 1. Apps Script をウェブアプリとしてデプロイし、URLを取得する
 * 2. 下の ENDPOINT_URL を書き換える
 * 3. このファイルを minify してブックマークのURLに登録する
 *    （先頭に javascript: を付ける）
 * 4. Foresma Lreach の顧客一覧ページを開いてブックマークをクリック
 *
 * 【カスタマイズ】
 * Foresma Lreach の実際のHTML構造に合わせて
 * extractRecords() 内のセレクタを調整する。
 * まず STEP1: デバッグモード(DEBUG_MODE = true)で
 * コンソールに抽出結果を出力して確認する。
 */

(function () {
  // ============================================================
  // ★ 設定 ★
  // ============================================================
  var ENDPOINT_URL = 'ここにウェブアプリのURLを貼り付け';
  var DEBUG_MODE   = false; // trueにするとデータを送信せずコンソールに表示

  // ============================================================
  // メイン処理
  // ============================================================
  var records = extractRecords();

  if (records.length === 0) {
    alert('【CRM取込】\n対象の顧客データが見つかりませんでした。\n\nForesma Lreachの顧客一覧ページを開いた状態で実行してください。');
    return;
  }

  if (DEBUG_MODE) {
    console.log('【CRM取込デバッグ】抽出データ:', records);
    alert('【CRM取込 デバッグモード】\n' + records.length + '件のデータを抽出しました。\nコンソール(F12)で内容を確認してください。');
    return;
  }

  var ok = confirm('【CRM取込】\n' + records.length + '件の顧客データをCRMに取り込みます。\nよろしいですか？');
  if (!ok) return;

  // ============================================================
  // GAS エンドポイントに送信
  // ============================================================
  fetch(ENDPOINT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ records: records })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.status === 'ok') {
      alert('【CRM取込 完了】\n✅ ' + data.added   + '件 追加\n⏭ ' + data.skipped + '件 スキップ（重複）\n\nスプレッドシートの「Foresma取込」シートを確認してください。');
    } else {
      alert('【CRM取込 エラー】\n' + data.message);
    }
  })
  .catch(function(err) {
    alert('【CRM取込 通信エラー】\n' + err.message + '\n\nエンドポイントURLを確認してください。');
  });

  // ============================================================
  // Foresma Lreach 管理画面からデータを抽出
  // ------------------------------------------------------------
  // ★ここを実際の管理画面のHTML構造に合わせて修正する★
  //
  // 確認方法:
  //   1. Foresma Lreach の顧客一覧を開く
  //   2. F12 → コンソールで以下を実行してテーブル構造を確認:
  //      document.querySelectorAll('table tr').length
  //      document.querySelectorAll('table tr')[1].innerText
  // ============================================================
  function extractRecords() {
    var records = [];

    // ---- パターンA: HTMLテーブル形式 ----
    // 一覧が <table> で作られている場合
    var rows = document.querySelectorAll('table tbody tr');
    if (rows.length > 0) {
      rows.forEach(function(row) {
        var rec = extractFromTableRow(row);
        if (rec) records.push(rec);
      });
      return records;
    }

    // ---- パターンB: カード/リスト形式 ----
    // 一覧が divカードで作られている場合
    var cards = document.querySelectorAll('.customer-card, .lead-card, .contact-card, [data-customer]');
    if (cards.length > 0) {
      cards.forEach(function(card) {
        var rec = extractFromCard(card);
        if (rec) records.push(rec);
      });
      return records;
    }

    return records;
  }

  // ---- テーブル行から抽出 ----
  // ★列の順番は実際の画面に合わせて変更する★
  function extractFromTableRow(row) {
    var cells = row.querySelectorAll('td');
    if (cells.length < 3) return null;

    var text = function(idx) {
      return cells[idx] ? cells[idx].innerText.trim() : '';
    };

    // Lreach管理画面の列順（実際の画面を確認して修正）:
    // 例: 送客日 | 氏名 | メールアドレス | 電話番号 | ステータス | ...
    return {
      sendDate:  text(0),  // 送客日
      name:      text(1),  // 氏名
      email:     text(2),  // メールアドレス
      phone:     text(3),  // 電話番号
      age:       text(4),  // 年齢
      area:      text(5),  // 居住地
      job:       text(6),  // 現職職種
      timing:    text(7),  // 転職希望時期
      note:      text(8),  // コメント/備考
      foresmaId: row.dataset.id || row.dataset.customerId || ''
    };
  }

  // ---- カード形式から抽出 ----
  // ★セレクタは実際の画面に合わせて変更する★
  function extractFromCard(card) {
    var get = function(selector) {
      var el = card.querySelector(selector);
      return el ? el.innerText.trim() : '';
    };

    return {
      name:      get('.name, [data-name], .customer-name'),
      email:     get('.email, [data-email], .customer-email'),
      phone:     get('.phone, [data-phone], .customer-phone, .tel'),
      area:      get('.area, .prefecture, .address'),
      job:       get('.job, .occupation, .current-job'),
      note:      get('.note, .comment, .memo'),
      foresmaId: card.dataset.id || card.dataset.customerId || '',
      sendDate:  get('.date, .created-at, .send-date')
    };
  }

})();
