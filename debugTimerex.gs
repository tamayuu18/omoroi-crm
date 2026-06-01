// ============================================================
// TimeRexメール解析デバッグツール
// ============================================================
// CRM操作メニューの「TimeRex: メール解析を確認」から実行する。
// 最新のTimeRex通知メール1件を取得し、
// 解析結果をダイアログとログシートに出力する。
// ============================================================

// ============================================================
// ステップ1: Gmailに届いているTimeRexメールの送信元を確認
// まずこれを実行して「CRM_DEBUG」シートを確認する
// ============================================================
function debugCheckGmailSender() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // フィルタなしで受信トレイ全体から最新20件を取得
  var threads = GmailApp.search('in:anywhere', 0, 20);
  var rows = [['#', '日時', '送信元(From)', '件名', 'TimeRex判定']];

  var count = 0;
  threads.forEach(function(t) {
    t.getMessages().forEach(function(m) {
      if (count >= 20) return;
      var subject = m.getSubject();
      var from    = m.getFrom();
      var isTimerex = /さんが新しい予定を追加|さんが予定を追加|timerex/i.test(subject) ||
                      /TimeRexから.+さんが/i.test(m.getPlainBody().slice(0, 200));
      rows.push([
        ++count,
        Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), 'MM/dd HH:mm'),
        from,
        subject,
        isTimerex ? '✅ 該当' : '—'
      ]);
    });
  });

  var sheet = getOrCreateDebugSheet_(ss);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 5).setValues(rows);
  sheet.getRange(1, 1, 1, 5).setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
  sheet.autoResizeColumns(1, 5);

  ui.alert(
    'Step1: Gmail送信元確認',
    '「CRM_DEBUG」シートに最新20件のメール一覧を出力しました。\n\n' +
    '「TimeRex判定」列が ✅ の行の「送信元(From)」をコピーして、\n' +
    '設定シートの「TimeRex送信元メールアドレス」に貼り付けてください。\n\n' +
    '確認後、次は「Step2: メール解析テスト」を実行してください。',
    ui.ButtonSet.OK
  );
}

// ============================================================
// ステップ2: 送信元を無視してTimeRexメールの解析内容を確認
// ============================================================
function debugTimeRexEmail() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var ui     = SpreadsheetApp.getUi();
  var config = loadTimeRexConfig_(ss);

  // 送信元フィルタなしで「さんが新しい予定を追加」の件名で検索
  var threads = GmailApp.search('subject:新しい予定を追加 OR subject:予定を追加 OR subject:timerex', 0, 10);

  // 見つからなければ全メールから候補を探す
  if (threads.length === 0) {
    threads = GmailApp.search('in:anywhere', 0, 30);
  }

  var candidates = [];
  threads.forEach(function(t) {
    t.getMessages().forEach(function(m) {
      candidates.push(m);
    });
  });

  if (candidates.length === 0) {
    ui.alert('デバッグ', 'メールが1件も見つかりませんでした。', ui.ButtonSet.OK);
    return;
  }

  // 最新5件を候補として表示
  var preview = candidates.slice(0, 5).map(function(m, i) {
    return (i + 1) + '. [' + Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), 'MM/dd') + '] ' + m.getSubject().slice(0, 40);
  }).join('\n');

  var choice = ui.prompt(
    'Step2: 解析するメールを選択',
    '番号を入力してください（未入力→1番）:\n\n' + preview,
    ui.ButtonSet.OK_CANCEL
  );
  if (choice.getSelectedButton() === ui.Button.CANCEL) return;

  var idx = parseInt(choice.getResponseText().trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= candidates.length) idx = 0;

  var message = candidates[idx];
  var subject = message.getSubject();
  var from    = message.getFrom();
  var body    = message.getPlainBody();

  // 送信元チェックをスキップして強制解析
  var configNoFilter = JSON.parse(JSON.stringify(config));
  configNoFilter.senderEmail = ''; // 送信元フィルタを一時的に無効化

  var parsed = null;
  var steps  = [];

  // --- 判定ステップをひとつずつ確認 ---
  var step1 = /さんが新しい予定を追加|さんが予定を追加|timerex/i.test(subject) ||
              /TimeRexから.+さんが/i.test(body.slice(0, 300));
  steps.push('TimeRex判定: ' + (step1 ? '✅ 通過' : '❌ 失敗 → 件名が「さんが新しい予定を追加」を含まない'));

  var nameMatch = subject.match(/^(.+?)さんが新しい予定|^(.+?)さんが予定/);
  var name = nameMatch ? (nameMatch[1] || nameMatch[2] || '').trim() : '';
  steps.push('氏名(件名から): ' + (name || '❌ 未取得'));

  var emailField = extractTabField_(body, ['メールアドレス', 'Email', 'email']);
  steps.push('メールアドレス: ' + (emailField || '❌ 未取得'));

  var dateRaw = extractTabField_(body, ['日時', '面談日時', '予約日時']);
  steps.push('日時(生): ' + (dateRaw || '❌ 未取得'));

  var dt = parseTimeRexDatetime_(dateRaw);
  steps.push('面談日: ' + (dt.date ? Utilities.formatDate(dt.date, Session.getScriptTimeZone(), 'yyyy/MM/dd') : '❌ 未取得'));
  steps.push('開始時刻: ' + (dt.start || '❌ 未取得'));
  steps.push('終了時刻: ' + (dt.end   || '❌ 未取得'));

  var webRoom = extractTabField_(body, ['Web会議室', 'Web会議', 'オンライン会議']);
  steps.push('Web会議室: ' + (webRoom || '（なし）'));
  steps.push('面談方法: ' + detectMeetingMethod_(webRoom, body, 'Google Meet'));

  var memo = extractTabField_(body, ['コメント', '備考', 'メモ', '回答内容']);
  steps.push('コメント: ' + (memo || '（なし）'));

  var senderOk = !config.senderEmail || from.indexOf(config.senderEmail) !== -1;
  steps.push('\n--- 送信元チェック ---');
  steps.push('設定の送信元: ' + (config.senderEmail || '（未設定）'));
  steps.push('実際のFrom: ' + from);
  steps.push('送信元チェック: ' + (senderOk ? '✅ 通過' : '❌ 失敗 → 設定の送信元アドレスを実際のFromに合わせてください'));

  // デバッグシートに書き出し
  writeDebugSheet_(ss, subject, from, body, step1 ? {
    name: name, email: emailField, phone: '', mtgDate: dt.date,
    mtgStart: dt.start, mtgEnd: dt.end, mtgMethod: detectMeetingMethod_(webRoom, body, 'Google Meet'),
    ca: config.defaultCa, memo: memo, bookingUrl: webRoom
  } : null, step1 ? '' : 'TimeRexメールとして認識されませんでした');

  // 解析ステップをシートにも記録
  var debugSheet = getOrCreateDebugSheet_(ss);
  var stepRow = debugSheet.getLastRow() + 2;
  debugSheet.getRange(stepRow, 1).setValue('【解析ステップ詳細】');
  debugSheet.getRange(stepRow, 1).setFontWeight('bold');
  steps.forEach(function(s, i) {
    debugSheet.getRange(stepRow + 1 + i, 1).setValue(s);
  });

  ui.alert(
    'Step2: メール解析結果',
    '件名: ' + subject + '\nFrom: ' + from + '\n\n' +
    steps.join('\n') + '\n\n' +
    '詳細は「CRM_DEBUG」シートを確認してください。',
    ui.ButtonSet.OK
  );
}

// ============================================================
// デバッグシート取得 or 作成
// ============================================================
function getOrCreateDebugSheet_(ss) {
  var name = 'CRM_DEBUG';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
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
