// ============================================================
// Foresma Lreach ブックマークレット受信エンドポイント
// ------------------------------------------------------------
// このスクリプトをウェブアプリとしてデプロイすることで、
// ブックマークレットからPOSTされたデータを受信し、
// Foresma取込シートに書き込む。
//
// 【デプロイ手順】
// Apps Script エディタ → デプロイ → 新しいデプロイ
//   種類: ウェブアプリ
//   次のユーザーとして実行: 自分
//   アクセスできるユーザー: 全員（匿名を含む） ← ブックマークレットから叩くため
// デプロイ後に発行されるURLをブックマークレットに設定する。
// ============================================================

// ============================================================
// GETリクエスト: 動作確認用
// ============================================================
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'CRM endpoint is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// POSTリクエスト: ブックマークレットからデータを受信
// ============================================================
function doPost(e) {
  var result = { status: 'error', message: '' };

  try {
    // フォーム送信（payload パラメータ）と JSON POST の両方に対応
    var rawBody = (e.parameter && e.parameter.payload)
      ? e.parameter.payload
      : e.postData.contents;
    var payload = JSON.parse(rawBody);
    var records = payload.records; // 顧客データの配列

    if (!records || !Array.isArray(records) || records.length === 0) {
      result.message = 'recordsが空です';
      return jsonResponse_(result);
    }

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.FORESMA);

    if (!sheet) {
      result.message = 'Foresma取込シートが見つかりません。CRMを初期化してください。';
      return jsonResponse_(result);
    }

    var added     = 0;
    var skipped   = 0;
    var now       = new Date();

    // 既存データのメールアドレス・電話番号をキャッシュ（重複取込防止）
    var existingKeys = buildForesmaImportIndex_(sheet);

    records.forEach(function(rec) {
      var email = String(rec.email || '').trim().toLowerCase();
      var phone = normalizePhone_(String(rec.phone || '').trim());
      var name  = String(rec.name  || '').trim();
      // メール・電話番号がない場合は氏名をキーとして使用（スキップしない）
      var key   = email || phone || name;

      if (!key) { skipped++; return; }
      if (existingKeys[key]) { skipped++; return; }

      var row = buildForesmaRowFromBookmarklet_(rec, now);
      sheet.appendRow(row);
      existingKeys[key] = true;
      added++;
    });

    appendLog_(ss, 'Lreach取込', 'ブックマークレット',
      added + '件追加、' + skipped + '件スキップ', '成功', '');

    result.status  = 'ok';
    result.added   = added;
    result.skipped = skipped;
    result.message = added + '件をForesma取込シートに追加しました。';

  } catch (err) {
    result.message = err.message;
    try {
      appendLog_(SpreadsheetApp.getActiveSpreadsheet(),
        'Lreach取込エラー', 'ブックマークレット', err.message, 'エラー', err.stack);
    } catch(e2) {}
  }

  return jsonResponse_(result);
}

// ============================================================
// ブックマークレットから受け取ったデータをForesma取込行に変換
// ------------------------------------------------------------
// rec のフィールド名はブックマークレット側で合わせる:
//   name, kana, email, phone, age, gender, area,
//   job, salary, hopeJob, hopeArea, timing, note, ca, sendDate
// ============================================================
function buildForesmaRowFromBookmarklet_(rec, now) {
  // Foresma取込シートの列順:
  // 取込ステータス, 取込日時, Foresma管理ID, 送客日,
  // 氏名, フリガナ, 電話番号, メールアドレス,
  // 年齢, 性別, 居住地, 現職職種, 現在年収,
  // 希望職種, 希望勤務地, 転職希望時期, 備考, 担当CA
  return [
    '未取込',
    now,
    rec.foresmaId  || '',
    rec.sendDate   ? new Date(rec.sendDate) : now,
    rec.name       || '',
    rec.kana       || '',
    normalizePhone_(String(rec.phone  || '')),
    String(rec.email || '').toLowerCase(),
    rec.age        || '',
    rec.gender     || '',
    rec.area       || '',
    rec.job        || '',
    rec.salary     || '',
    rec.hopeJob    || '',
    rec.hopeArea   || '',
    rec.timing     || '',
    rec.note       || '',
    rec.ca         || ''
  ];
}

// ============================================================
// Foresma取込シートの既存データインデックス（重複取込防止）
// ============================================================
function buildForesmaImportIndex_(sheet) {
  var index   = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return index;

  // 列5=氏名(E), 列7=電話番号(G), 列8=メールアドレス(H)
  var data = sheet.getRange(2, 5, lastRow - 1, 4).getValues();
  data.forEach(function(row) {
    var name  = String(row[0] || '').trim();
    var phone = normalizePhone_(String(row[2] || '').trim());
    var email = String(row[3] || '').trim().toLowerCase();
    if (name)  index[name]  = true;
    if (phone) index[phone] = true;
    if (email) index[email] = true;
  });
  return index;
}

// ============================================================
// Lreach: クリップボードから取込（メニュー用）
// ブックマークレットがクリップボードにコピーしたJSONを
// スプレッドシートのダイアログから貼り付けて処理する
// ============================================================
function importLreachFromClipboard() {
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:sans-serif;padding:16px;margin:0}' +
    'textarea{width:100%;height:180px;font-size:12px;box-sizing:border-box;border:1px solid #ccc;padding:8px;border-radius:4px}' +
    'button{margin-top:12px;padding:10px 24px;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer}' +
    '#msg{margin-top:10px;font-weight:bold}</style>' +
    '<p style="margin:0 0 8px;font-size:14px">ブックマークレット実行後にコピーされたJSONをここに貼り付けてください：</p>' +
    '<textarea id="json" placeholder="Ctrl+V で貼り付け"></textarea>' +
    '<br><button onclick="doImport()">取込</button>' +
    '<div id="msg"></div>' +
    '<script>' +
    'function doImport(){' +
    'var v=document.getElementById("json").value.trim();' +
    'if(!v){document.getElementById("msg").innerText="データが空です";return;}' +
    'document.getElementById("msg").innerText="処理中...";' +
    'google.script.run' +
    '.withSuccessHandler(function(r){document.getElementById("msg").innerHTML="<span style=\'color:green\'>✅ "+r+"</span>";})' +
    '.withFailureHandler(function(e){document.getElementById("msg").innerHTML="<span style=\'color:red\'>❌ "+e.message+"</span>";})' +
    '.processLreachJson(v);' +
    '}' +
    '</script>'
  ).setWidth(520).setHeight(340);
  SpreadsheetApp.getUi().showModalDialog(html, 'Lreach: クリップボードから取込');
}

function processLreachJson(jsonStr) {
  var payload = JSON.parse(jsonStr);
  var records = payload.records;
  if (!records || !Array.isArray(records) || records.length === 0) throw new Error('recordsが空です');

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.FORESMA);
  if (!sheet) throw new Error('Foresma取込シートが見つかりません');

  var added   = 0;
  var skipped = 0;
  var now     = new Date();
  var existingKeys = buildForesmaImportIndex_(sheet);

  records.forEach(function(rec) {
    var email = String(rec.email || '').trim().toLowerCase();
    var phone = normalizePhone_(String(rec.phone || '').trim());
    var name  = String(rec.name  || '').trim();
    var key   = email || phone || name;
    if (!key) { skipped++; return; }
    if (existingKeys[key]) { skipped++; return; }
    sheet.appendRow(buildForesmaRowFromBookmarklet_(rec, now));
    existingKeys[key] = true;
    added++;
  });

  appendLog_(ss, 'Lreach取込', 'クリップボード', added + '件追加、' + skipped + '件スキップ', '成功', '');
  return added + '件追加、' + skipped + '件スキップ（重複）しました。';
}

// ============================================================
// JSONレスポンス生成
// ============================================================
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
