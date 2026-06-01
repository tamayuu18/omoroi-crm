// ============================================================
// CRM初期化スクリプト
// キャリアアドバイザー業務向けCRM - Googleスプレッドシート
// ============================================================

// ============================================================
// カスタムメニュー
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM操作')
    .addItem('CRMを初期化', 'initializeCRM')
    .addSeparator()
    .addItem('✏️ 顧客を手動登録（顧客マスタに直接追加）', 'showManualCustomerForm')
    .addItem('✏️ Foresma取込に手動追加', 'showManualForesmaForm')
    .addSeparator()
    .addItem('Foresmaデータを取り込む', 'importForesmaData')
    .addItem('TimeRex: Gmailから自動取込', 'importTimeRexFromGmail')
    .addItem('TimeRex: 取込シートから反映', 'importTimeRexData')
    .addSeparator()
    .addItem('ステータスを同期する', 'syncCustomerStatus')
    .addItem('タスクを更新する', 'createAutoTasks')
    .addItem('アラートを確認する', 'checkAlerts')
    .addItem('ダッシュボードを更新する', 'updateDashboard')
    .addSeparator()
    .addItem('TimeRex: Step1 送信元アドレスを確認', 'debugCheckGmailSender')
    .addItem('TimeRex: Step2 メール解析テスト', 'debugTimeRexEmail')
    .addToUi();
}

// ============================================================
// 定数定義
// ============================================================
var SHEET_NAMES = {
  CUSTOMER:  '顧客マスタ',
  FORESMA:   'Foresma取込',
  TIMEREX:   'TimeRex取込',
  MEETING:   '面談管理',
  HISTORY:   '対応履歴',
  SELECTION: '選考管理',
  YOMI:      'ヨミ管理',
  TASK:      'タスク管理',
  DASHBOARD: 'ダッシュボード',
  SETTINGS:  '設定',
  LOG:       'ログ'
};

var HEADERS = {
  CUSTOMER: [
    '顧客ID', '登録日', '最終更新日', '流入元', 'Foresma管理ID',
    '氏名', 'フリガナ', '電話番号', 'メールアドレス', '年齢', '性別', '居住地',
    '現職企業名', '現職職種', '現在年収', '希望職種', '希望勤務地', '希望年収', '転職希望時期',
    '担当CA', '顧客ステータス', 'ヨミランク',
    '次回アクション', '次回アクション期限', '最終対応日', '備考'
  ],
  FORESMA: [
    '取込ステータス', '取込日時', 'Foresma管理ID', '送客日',
    '氏名', 'フリガナ', '電話番号', 'メールアドレス',
    '年齢', '性別', '居住地', '現職職種', '現在年収',
    '希望職種', '希望勤務地', '転職希望時期', '備考', '担当CA'
  ],
  TIMEREX: [
    '取込ステータス', '取込日時', 'TimeRex予約ID', '予約受付日',
    '氏名', 'メールアドレス', '電話番号',
    '面談予定日', '面談開始時間', '面談終了時間', '面談方法', '担当CA',
    '予約時メモ', '予約URL', 'GmailメッセージID'
  ],
  MEETING: [
    '面談ID', '顧客ID', '氏名', '担当CA',
    '面談予定日', '面談開始時間', '面談終了時間', '面談方法', '面談ステータス',
    'リマインド状況', '面談結果', '温度感', '求人提案有無',
    '次回アクション', '次回アクション期限'
  ],
  HISTORY: [
    '履歴ID', '顧客ID', '対応日時', '対応者',
    '対応種別', '対応結果', '対応内容', '次回対応内容', '次回対応期限'
  ],
  SELECTION: [
    '選考ID', '顧客ID', '氏名', '企業名', '求人名', '応募日',
    '選考ステータス', '面接予定日', '想定年収', '紹介手数料率', '想定売上', '選考メモ'
  ],
  YOMI: [
    'ヨミID', '顧客ID', '氏名', '担当CA', '現在ステータス', 'ヨミランク',
    '成約確度', '想定成約月', '想定入社日', '想定年収', '紹介手数料率',
    '想定売上', '加重売上', 'ヨミ理由', 'ネック要因',
    '次回アクション', '次回アクション期限', '最終更新日'
  ],
  TASK: [
    'タスクID', '顧客ID', '氏名', '担当CA',
    'タスク内容', 'タスク期限', 'タスクステータス', '優先度',
    '関連ステータス', '完了日', '備考'
  ],
  LOG: [
    '日時', '処理種別', '対象', '内容', 'ステータス', '詳細'
  ]
};

var MASTER = {
  CUSTOMER_STATUS: [
    '新規送客', '初回未対応', '初回連絡済み', '不通',
    '面談予約済み', '面談実施済み', '面談キャンセル', 'リスケ調整中',
    '求人提案中', '応募意思確認中', '応募済み', '書類選考中',
    '一次面接予定', '一次面接結果待ち', '最終面接予定', '最終面接結果待ち',
    '内定', '承諾', '入社予定', '入社済み', '辞退', '失注', '長期フォロー'
  ],
  MEETING_STATUS: ['予約済', '実施済', 'キャンセル', '無断キャンセル', 'リスケ'],
  YOMI_RANK: ['A', 'B', 'C', 'D', 'E', '失注'],
  TASK_STATUS: ['未対応', '対応中', '完了', '保留'],
  INFLOW: ['Foresma', 'TimeRex', '手動', 'その他'],
  MEETING_METHOD: ['電話', 'Zoom', 'Google Meet', '対面'],
  GENDER: ['男性', '女性', 'その他', '未回答'],
  REMIND_STATUS: ['未送信', '送信済'],
  TEMPERATURE: ['高', '中', '低'],
  PROPOSAL: ['あり', 'なし'],
  PRIORITY: ['高', '中', '低'],
  CONTACT_TYPE: ['電話', 'メール', 'LINE', 'SMS', '面談', 'その他'],
  CONTACT_RESULT: ['接続', '不通', '返信あり', '返信なし', '実施済'],
  SELECTION_STATUS: [
    '応募前', '書類選考中', '一次面接予定', '一次結果待ち',
    '最終面接予定', '内定', '承諾', '辞退', 'お見送り'
  ],
  TRANSFER_TIMING: ['すぐ', '1ヶ月以内', '3ヶ月以内', '半年以内', '未定'],
  IMPORT_STATUS: ['未取込', '取込済', '重複', 'エラー'],
  CA_LIST: ['担当CA1', '担当CA2', '担当CA3']  // ← 実際のCA名に書き換えてください
};

// ============================================================
// CRM初期化メイン関数
// ============================================================
function initializeCRM() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var errors = [];

  // --- Step 1: シート作成 ---
  var sheetOrder = [
    SHEET_NAMES.CUSTOMER,
    SHEET_NAMES.FORESMA,
    SHEET_NAMES.TIMEREX,
    SHEET_NAMES.MEETING,
    SHEET_NAMES.HISTORY,
    SHEET_NAMES.SELECTION,
    SHEET_NAMES.YOMI,
    SHEET_NAMES.TASK,
    SHEET_NAMES.DASHBOARD,
    SHEET_NAMES.SETTINGS,
    SHEET_NAMES.LOG
  ];

  sheetOrder.forEach(function(name) {
    try {
      createSheetIfNotExists_(ss, name);
    } catch (e) {
      errors.push('シート作成失敗 [' + name + ']: ' + e.message);
    }
  });

  // --- Step 2: ヘッダー設定 ---
  var headerTargets = [
    [SHEET_NAMES.CUSTOMER,  HEADERS.CUSTOMER],
    [SHEET_NAMES.FORESMA,   HEADERS.FORESMA],
    [SHEET_NAMES.TIMEREX,   HEADERS.TIMEREX],
    [SHEET_NAMES.MEETING,   HEADERS.MEETING],
    [SHEET_NAMES.HISTORY,   HEADERS.HISTORY],
    [SHEET_NAMES.SELECTION, HEADERS.SELECTION],
    [SHEET_NAMES.YOMI,      HEADERS.YOMI],
    [SHEET_NAMES.TASK,      HEADERS.TASK],
    [SHEET_NAMES.LOG,       HEADERS.LOG]
  ];

  headerTargets.forEach(function(pair) {
    try {
      setHeaderRow_(ss, pair[0], pair[1]);
    } catch (e) {
      errors.push('ヘッダー設定失敗 [' + pair[0] + ']: ' + e.message);
    }
  });

  // --- Step 3: 設定シートのマスタ登録 ---
  try {
    setupSettingsSheet_(ss);
  } catch (e) {
    errors.push('設定シート構築失敗: ' + e.message);
  }

  // --- Step 4: ダッシュボードの枠組み作成 ---
  try {
    setupDashboardSheet_(ss);
  } catch (e) {
    errors.push('ダッシュボード構築失敗: ' + e.message);
  }

  // --- Step 5: TimeRex設定欄を設定シートに追加 ---
  try {
    setupTimeRexSettings();
  } catch (e) {
    // 未実装環境では無視
  }

  // --- Step 6: シート順序を整理 ---
  try {
    reorderSheets_(ss, sheetOrder);
  } catch (e) {
    // 順序変更失敗は致命的でないので続行
    errors.push('シート並び替え失敗: ' + e.message);
  }

  // --- Step 7: ログに記録 ---
  try {
    appendLog_(ss, '初期化完了', 'initializeCRM', 'CRM初期化処理が完了しました', '成功', errors.join(' / '));
  } catch (e) {
    // ログ失敗は無視
  }

  // --- 完了メッセージ ---
  if (errors.length === 0) {
    ui.alert('CRM初期化完了',
      'すべてのシートが正常に作成・設定されました。\n\n' +
      '【次の手順】\n' +
      '設定シートの「担当CA」列に実際のCA名を入力してください。',
      ui.ButtonSet.OK);
  } else {
    ui.alert('CRM初期化（一部エラー）',
      '初期化は完了しましたが、以下のエラーが発生しました：\n\n' +
      errors.join('\n'),
      ui.ButtonSet.OK);
  }
}

// ============================================================
// シート作成
// ============================================================
function createSheetIfNotExists_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    ss.insertSheet(name);
  }
}

function reorderSheets_(ss, order) {
  for (var i = 0; i < order.length; i++) {
    var sheet = ss.getSheetByName(order[i]);
    if (sheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(i + 1);
    }
  }
}

// ============================================================
// ヘッダー行の設定
// ============================================================
function setHeaderRow_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  // 既にヘッダーが入力済みならスキップ
  if (sheet.getRange(1, 1).getValue() !== '') return;

  var numCols = headers.length;
  var range = sheet.getRange(1, 1, 1, numCols);
  range.setValues([headers]);
  range.setBackground('#1a73e8');
  range.setFontColor('#ffffff');
  range.setFontWeight('bold');
  range.setFontSize(10);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 30);

  for (var i = 1; i <= numCols; i++) {
    sheet.setColumnWidth(i, 120);
  }
}

// ============================================================
// 設定シートのマスタデータ登録
// ============================================================
function setupSettingsSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return;
  if (sheet.getRange('A1').getValue() !== '') return;

  // マスタ定義: [タイトル, 値の配列]
  var columns = [
    ['顧客ステータス', MASTER.CUSTOMER_STATUS],
    ['面談ステータス', MASTER.MEETING_STATUS],
    ['ヨミランク',     MASTER.YOMI_RANK],
    ['タスクステータス', MASTER.TASK_STATUS],
    ['担当CA',        MASTER.CA_LIST],
    ['流入元',        MASTER.INFLOW],
    ['面談方法',      MASTER.MEETING_METHOD],
    ['対応種別',      MASTER.CONTACT_TYPE],
    ['対応結果',      MASTER.CONTACT_RESULT],
    ['選考ステータス', MASTER.SELECTION_STATUS],
    ['転職希望時期',   MASTER.TRANSFER_TIMING],
    ['優先度',        MASTER.PRIORITY],
    ['取込ステータス', MASTER.IMPORT_STATUS]
  ];

  // 列ごとに書き込む（1列ずつ、間に1列スペース）
  var col = 1;
  columns.forEach(function(def) {
    var title  = def[0];
    var values = def[1];

    // タイトル行
    var titleCell = sheet.getRange(1, col);
    titleCell.setValue(title);
    titleCell.setBackground('#34a853');
    titleCell.setFontColor('#ffffff');
    titleCell.setFontWeight('bold');
    titleCell.setHorizontalAlignment('center');

    // 値を縦に書き込む
    values.forEach(function(val, i) {
      sheet.getRange(i + 2, col).setValue(val);
    });

    sheet.setColumnWidth(col, 140);
    col += 2; // 1列スペースを空けて次へ
  });

  // ヨミランク定義を補足（別エリアに表形式で記載）
  var defRow = 1;
  var defCol = col + 1;
  var yomiDefs = [
    ['ヨミランク定義', 'ランク', '定義', '成約確度'],
    ['', 'A', '内定承諾済み、入社日確定', '80〜100%'],
    ['', 'B', '最終面接中、内定見込みあり', '60〜79%'],
    ['', 'C', '応募済み、選考進行中', '30〜59%'],
    ['', 'D', '面談済み、求人提案中', '10〜29%'],
    ['', 'E', '不通、長期フォロー、転職時期未定', '1〜9%'],
    ['', '失注', '辞退、他社決定、連絡不可', '0%']
  ];
  yomiDefs.forEach(function(row, i) {
    sheet.getRange(defRow + i, defCol, 1, 4).setValues([row]);
  });
  sheet.getRange(defRow, defCol, 1, 4).setBackground('#f9ab00').setFontWeight('bold');

  // Slack Webhook URL欄
  sheet.getRange(defRow + 9, defCol).setValue('Slack Webhook URL:');
  sheet.getRange(defRow + 9, defCol).setFontWeight('bold');
  sheet.getRange(defRow + 10, defCol, 1, 3).merge()
    .setValue('（ここにWebhook URLを貼り付け）')
    .setBackground('#fce8e6');
}

// ============================================================
// ダッシュボードの枠組み作成
// ============================================================
function setupDashboardSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) return;
  if (sheet.getRange('A1').getValue() !== '') return;

  var rows = [
    ['キャリアアドバイザーCRM ダッシュボード', '', '', ''],
    ['最終更新', '（updateDashboard()を実行してください）', '', ''],
    ['', '', '', ''],
    ['■ 日次確認', '', '', ''],
    ['指標', '件数', '', ''],
    ['本日の面談予定数', '', '', ''],
    ['本日の対応タスク数', '', '', ''],
    ['期限超過タスク数', '', '', ''],
    ['新規送客数（本日）', '', '', ''],
    ['初回未対応数', '', '', ''],
    ['面談後未更新数', '', '', ''],
    ['', '', '', ''],
    ['■ ヨミ管理（今月）', '', '', ''],
    ['指標', '件数', '金額（円）', ''],
    ['Aヨミ件数', '', '', ''],
    ['Bヨミ件数', '', '', ''],
    ['Cヨミ件数', '', '', ''],
    ['今月の想定売上合計', '', '', ''],
    ['今月の加重売上合計', '', '', ''],
    ['', '', '', ''],
    ['■ CA別KPI（今月）', '', '', ''],
    ['CA名', '担当顧客数', '面談数', '応募数'],
    ['（CA1）', '', '', ''],
    ['（CA2）', '', '', ''],
    ['（CA3）', '', '', ''],
    ['', '', '', ''],
    ['■ 月次KPI', '', '', ''],
    ['指標', '件数', '', ''],
    ['月間送客数', '', '', ''],
    ['月間面談予約数', '', '', ''],
    ['月間面談実施数', '', '', ''],
    ['月間応募数', '', '', ''],
    ['月間内定数', '', '', ''],
    ['月間承諾数', '', '', ''],
    ['月間入社数', '', '', ''],
    ['月間想定売上', '', '', ''],
    ['月間加重売上', '', '', ''],
    ['', '', '', ''],
    ['■ ファネル', '', '', ''],
    ['ステージ', '件数', '', ''],
    ['① 送客数', '', '', ''],
    ['② 初回対応数', '', '', ''],
    ['③ 面談予約数', '', '', ''],
    ['④ 面談実施数', '', '', ''],
    ['⑤ 求人提案数', '', '', ''],
    ['⑥ 応募数', '', '', ''],
    ['⑦ 内定数', '', '', ''],
    ['⑧ 承諾数', '', '', ''],
    ['⑨ 入社数', '', '', '']
  ];

  sheet.getRange(1, 1, rows.length, 4).setValues(rows);

  // タイトル行
  var titleRange = sheet.getRange(1, 1, 1, 4);
  titleRange.setBackground('#1a73e8');
  titleRange.setFontColor('#ffffff');
  titleRange.setFontSize(14);
  titleRange.setFontWeight('bold');

  // セクションヘッダー行番号
  [4, 13, 21, 27, 38].forEach(function(r) {
    var r_ = sheet.getRange(r, 1, 1, 4);
    r_.setBackground('#e8eaf6');
    r_.setFontWeight('bold');
    r_.setFontSize(11);
  });

  // 小見出し（指標列ヘッダー）
  [5, 14, 22, 28, 39].forEach(function(r) {
    sheet.getRange(r, 1, 1, 4).setBackground('#f1f3f4').setFontWeight('bold');
  });

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 130);
}

// ============================================================
// ログ出力（シートが存在する場合のみ書き込む）
// ============================================================
function appendLog_(ss, type, target, content, status, detail) {
  try {
    var sheet = ss.getSheetByName(SHEET_NAMES.LOG);
    if (!sheet) return;
    sheet.appendRow([
      new Date(),
      type   || '',
      target || '',
      content || '',
      status || '',
      detail || ''
    ]);
  } catch (e) {
    Logger.log('ログ出力失敗: ' + e.message);
  }
}

// グローバル向けラッパー（他のgsファイルから呼び出す用）
function writeLog_(type, target, content, status, detail) {
  appendLog_(SpreadsheetApp.getActiveSpreadsheet(), type, target, content, status, detail);
}

// ============================================================
// スタブ関数（後続ステップで実装）
// ============================================================
// importForesmaData()     は foresmaImport.gs で実装
// importTimeRexFromGmail() は timerexImport.gs で実装
// importTimeRexData()      は timerexImport.gs で実装

// importTimeRexData() / importTimeRexFromGmail() は timerexImport.gs で実装

function syncCustomerStatus() {
  SpreadsheetApp.getUi().alert('未実装', 'ステータス同期機能は実装予定です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function createAutoTasks() {
  SpreadsheetApp.getUi().alert('未実装', 'タスク自動生成機能は実装予定です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function checkAlerts() {
  SpreadsheetApp.getUi().alert('未実装', 'アラート確認機能は実装予定です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function updateDashboard() {
  SpreadsheetApp.getUi().alert('未実装', 'ダッシュボード更新機能は実装予定です。', SpreadsheetApp.getUi().ButtonSet.OK);
}
