// ============================================================
// TimeRexメール解析デバッグツール
// ============================================================
// CRM操作メニューの「TimeRex: メール解析を確認」から実行する。
// 最新のTimeRex通知メール1件を取得し、
// 解析結果をダイアログとログシートに出力する。
// ============================================================

function debugTimeRexEmail() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ui  = SpreadsheetApp.getUi();
  var config = loadTimeRexConfig_(ss);

  // ---- 1. メールを1件取得 ----
  // 送信元が設定されていない場合は全受信トレイから最新を探す
  var query = config.senderEmail ? 'from:' + config.senderEmail : '';
  var threads = GmailApp.search(query || 'in:anywhere', 0, 20);

  if (threads.length === 0) {
    ui.alert('デバッグ', '対象メールが見つかりませんでした。\n送信元アドレスの設定を確認してください。', ui.ButtonSet.OK);
    return;
  }

  // ---- 2. メール候補を一覧表示して選択させる ----
  var candidates = [];
  threads.forEach(function(t) {
    t.getMessages().forEach(function(m) {
      candidates.push({
        subject: m.getSubject(),
        from:    m.getFrom(),
        date:    m.getDate(),
        message: m
      });
    });
  });

  // 最新5件を候補として表示
  var preview = candidates.slice(0, 5).map(function(c, i) {
    return (i + 1) + '. [' + Utilities.formatDate(c.date, Session.getScriptTimeZone(), 'MM/dd HH:mm') + '] ' + c.subject;
  }).join('\n');

  var choice = ui.prompt(
    'デバッグ: メールを選択',
    '以下のメールが見つかりました。\n番号を入力してください（Enter で1番を使用）:\n\n' + preview,
    ui.ButtonSet.OK_CANCEL
  );

  if (choice.getSelectedButton() === ui.Button.CANCEL) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= candidates.length) idx = 0;

  var message = candidates[idx].message;
  var subject = message.getSubject();
  var from    = message.getFrom();
  var body    = message.getPlainBody();

  // ---- 3. 解析を試みる ----
  var parsed = null;
  var parseError = '';
  try {
    parsed = parseTimeRexEmail_(message, config);
  } catch (e) {
    parseError = e.message;
  }

  // ---- 4. ログシートに生データを記録 ----
  var logSheet = ss.getSheetByName(SHEET_NAMES.LOG);
  if (logSheet) {
    logSheet.appendRow([new Date(), 'DEBUG', subject, '--- メール本文 ---\n' + body.slice(0, 2000), '調査中', 'from: ' + from]);
  }

  // ---- 5. デバッグシートに生データと解析結果を書き出す ----
  writeDebugSheet_(ss, subject, from, body, parsed, parseError);

  // ---- 6. サマリーをダイアログ表示 ----
  var summary = '【解析対象メール】\n' +
    '件名: ' + subject + '\n' +
    'From: ' + from + '\n\n';

  if (parseError) {
    summary += '⚠ 解析エラー: ' + parseError + '\n\n';
  } else if (!parsed) {
    summary += '⚠ 解析結果: TimeRex通知メールとして認識されませんでした。\n\n' +
      '「CRM_DEBUG」シートにメール本文を出力しました。\n' +
      '件名または本文に「timerex」「予約が入り」などが含まれているか確認してください。\n';
  } else {
    summary += '✅ 解析成功\n\n' +
      '氏名: '       + (parsed.name       || '（未取得）') + '\n' +
      'メール: '     + (parsed.email      || '（未取得）') + '\n' +
      '電話番号: '   + (parsed.phone      || '（未取得）') + '\n' +
      '面談日: '     + (parsed.mtgDate    ? Utilities.formatDate(parsed.mtgDate, Session.getScriptTimeZone(), 'yyyy/MM/dd') : '（未取得）') + '\n' +
      '開始時刻: '   + (parsed.mtgStart   || '（未取得）') + '\n' +
      '終了時刻: '   + (parsed.mtgEnd     || '（未取得）') + '\n' +
      '面談方法: '   + (parsed.mtgMethod  || '（未取得）') + '\n' +
      '担当CA: '     + (parsed.ca         || '（未取得）') + '\n';
  }

  summary += '\n→「CRM_DEBUG」シートに詳細を出力しました。\n正規表現の調整が必要な場合はメール本文を共有してください。';

  ui.alert('TimeRexメール解析デバッグ', summary, ui.ButtonSet.OK);
}

// ============================================================
// デバッグシートへの書き出し
// ============================================================
function writeDebugSheet_(ss, subject, from, body, parsed, parseError) {
  var sheetName = 'CRM_DEBUG';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clearContents();
  }

  var rows = [
    ['■ TimeRexメール解析デバッグ', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss')],
    ['', ''],
    ['【メール情報】', ''],
    ['件名',  subject],
    ['From',  from],
    ['', ''],
    ['【解析結果】', ''],
    ['解析ステータス', parseError ? 'エラー: ' + parseError : (parsed ? '成功' : 'TimeRexメールとして未認識')],
    ['氏名',      parsed ? parsed.name      : ''],
    ['メール',    parsed ? parsed.email     : ''],
    ['電話番号',  parsed ? parsed.phone     : ''],
    ['面談日',    parsed && parsed.mtgDate  ? Utilities.formatDate(parsed.mtgDate, Session.getScriptTimeZone(), 'yyyy/MM/dd') : ''],
    ['開始時刻',  parsed ? parsed.mtgStart  : ''],
    ['終了時刻',  parsed ? parsed.mtgEnd    : ''],
    ['面談方法',  parsed ? parsed.mtgMethod : ''],
    ['担当CA',    parsed ? parsed.ca        : ''],
    ['予約ID',    parsed ? parsed.bookingId : ''],
    ['メモ',      parsed ? parsed.memo      : ''],
    ['予約URL',   parsed ? parsed.bookingUrl : ''],
    ['', ''],
    ['【メール本文（生データ）】', ''],
    [body, '']
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);

  // スタイル
  sheet.getRange(1, 1).setFontSize(13).setFontWeight('bold').setBackground('#e8f0fe');
  [3, 7, 21].forEach(function(r) {
    sheet.getRange(r, 1).setBackground('#fce8e6').setFontWeight('bold');
  });

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 600);
  sheet.setRowHeights(22, 1, 400); // 本文行を高くする
  sheet.getRange(22, 2).setWrap(true);
}
