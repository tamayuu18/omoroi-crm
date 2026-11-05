// ============================================================
// Notta連携（CRM側 /api/cron/notta）を1時間ごとに呼び出すトリガー
// ============================================================
// 背景:
//   Vercel の Hobby プランでは cron が1日1回しか動かず、1回の実行（最長300秒）で
//   取り込める面談は2〜3件。面談が多い日が続くと未処理が溜まり、議事録が
//   対応履歴に出てこなくなる。Apps Script の時間主導トリガーから同じURLを
//   1時間ごとに叩けば、1日に最大24回 × 2〜3件まで処理できる。
//   （取り込み済みのファイルはCRM側で判定してスキップするため、何度呼んでも二重登録はしない）
//
// 使い方:
//   1. このスクリプトを CRM スプレッドシートの Apps Script（他の *.gs と同じプロジェクト）に追加
//   2. 「プロジェクトの設定 → スクリプト プロパティ」に次を登録
//        CRM_BASE_URL  = https://omoroi-crm.vercel.app
//        CRON_SECRET   = Vercel の環境変数 CRON_SECRET と同じ値
//   3. エディタで setupNottaTrigger を1回実行（1時間ごとのトリガーが作成される）
//   4. 動作確認: runNottaSync を手動実行し、実行ログ（表示 → 実行数）で結果を見る
//      CRM側の実行記録は GET {CRM_BASE_URL}/api/cron/notta?key={CRON_SECRET}&runs=1 でも確認できる
//
// 止めるとき: removeNottaTrigger を実行
// ============================================================

var NOTTA_TRIGGER_HANDLER_ = 'runNottaSync';

/** 1時間ごとのトリガーを作成する（既存の同名トリガーは作り直す） */
function setupNottaTrigger() {
  removeNottaTrigger();
  ScriptApp.newTrigger(NOTTA_TRIGGER_HANDLER_)
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Notta連携トリガーを作成しました（1時間ごと）');
}

/** トリガーを削除する */
function removeNottaTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === NOTTA_TRIGGER_HANDLER_) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/** CRM の Notta 取り込みを1回実行する（トリガー・手動どちらからでも呼べる） */
function runNottaSync() {
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty('CRM_BASE_URL') || '').replace(/\/+$/, '');
  var secret = props.getProperty('CRON_SECRET') || '';
  if (!base || !secret) {
    throw new Error('スクリプト プロパティ CRM_BASE_URL / CRON_SECRET を設定してください');
  }

  var url = base + '/api/cron/notta?key=' + encodeURIComponent(secret);
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    // CRM側は最長300秒動く。Apps Script の UrlFetch 上限（6分）に収まる
    validateHttpsCertificates: true,
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  var summary = body;
  try {
    var json = JSON.parse(body);
    summary =
      'status=' + json.status +
      ' total=' + json.total +
      ' added=' + json.added +
      ' notMatched=' + json.notMatched +
      ' skipped=' + json.skipped +
      ' errored=' + json.errored +
      (json['残り'] !== undefined ? ' remaining=' + json['残り'] : '') +
      (json.error ? ' error=' + json.error : '');
  } catch (e) {
    // JSONでなければ本文の先頭だけ
    summary = body.slice(0, 500);
  }
  Logger.log('[notta] HTTP ' + code + ' ' + summary);

  if (code >= 500) {
    // 失敗した実行はトリガーの実行履歴（失敗）として残す
    throw new Error('Notta連携が失敗しました: HTTP ' + code + ' ' + summary);
  }
}
