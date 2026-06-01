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
    .addItem('Foresmaデータを取り込む', 'importForesmaData')
    .addItem('TimeRexデータを取り込む', 'importTimeRexData')
    .addSeparator()
    .addItem('ステータスを同期する', 'syncCustomerStatus')
    .addItem('タスクを更新する', 'createAutoTasks')
    .addItem('アラートを確認する', 'checkAlerts')
    .addItem('ダッシュボードを更新する', 'updateDashboard')
    .addToUi();
}

// ============================================================
// 定数定義
// ============================================================
var SHEET_NAMES = {
  CUSTOMER:    '顧客マスタ',
  FORESMA:     'Foresma取込',
  TIMEREX:     'TimeRex取込',
  MEETING:     '面談管理',
  HISTORY:     '対応履歴',
  SELECTION:   '選考管理',
  YOMI:        'ヨミ管理',
  TASK:        'タスク管理',
  DASHBOARD:   'ダッシュボード',
  SETTINGS:    '設定',
  LOG:         'ログ'
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
    '予約時メモ', '予約URL'
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
  CA_LIST: ['担当CA1', '担当CA2', '担当CA3']  // ← 実際のCA名に変更してください
};

// ============================================================
// CRM初期化メイン関数
// ============================================================
function initializeCRM() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  try {
    writeLog_('初期化開始', 'initializeCRM', 'CRM初期化処理を開始します', '処理中');

    // シートを決められた順序で作成
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

    // 存在しないシートのみ作成
    sheetOrder.forEach(function(name) {
      createSheetIfNotExists_(ss, name);
    });

    // 各シートにヘッダーを設定
    setupHeaders_(ss);

    // 設定シートにマスタデータを登録
    setupSettingsSheet_(ss);

    // ダッシュボードの枠組みを作成
    setupDashboardSheet_(ss);

    // ログシートにヘッダーを確認・設定
    setupLogSheet_(ss);

    // シートの並び順を整理
    reorderSheets_(ss, sheetOrder);

    writeLog_('初期化完了', 'initializeCRM', 'CRM初期化処理が完了しました', '成功');
    ui.alert('CRM初期化完了', 'すべてのシートが正常に作成・設定されました。\n\n設定シートの「担当CA」にCA名を入力してください。', ui.ButtonSet.OK);

  } catch (e) {
    writeLog_('初期化エラー', 'initializeCRM', e.message, 'エラー', e.stack);
    ui.alert('エラー', '初期化中にエラーが発生しました：\n' + e.message, ui.ButtonSet.OK);
  }
}

// ============================================================
// シート作成ユーティリティ
// ============================================================
function createSheetIfNotExists_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('シートを作成しました: ' + name);
  }
  return sheet;
}

function reorderSheets_(ss, order) {
  order.forEach(function(name, index) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(index + 1);
    }
  });
}

// ============================================================
// ヘッダー設定
// ============================================================
function setupHeaders_(ss) {
  setHeaderRow_(ss, SHEET_NAMES.CUSTOMER,  HEADERS.CUSTOMER);
  setHeaderRow_(ss, SHEET_NAMES.FORESMA,   HEADERS.FORESMA);
  setHeaderRow_(ss, SHEET_NAMES.TIMEREX,   HEADERS.TIMEREX);
  setHeaderRow_(ss, SHEET_NAMES.MEETING,   HEADERS.MEETING);
  setHeaderRow_(ss, SHEET_NAMES.HISTORY,   HEADERS.HISTORY);
  setHeaderRow_(ss, SHEET_NAMES.SELECTION, HEADERS.SELECTION);
  setHeaderRow_(ss, SHEET_NAMES.YOMI,      HEADERS.YOMI);
  setHeaderRow_(ss, SHEET_NAMES.TASK,      HEADERS.TASK);
}

function setHeaderRow_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  // 既にヘッダーがある場合はスキップ
  var existing = sheet.getRange(1, 1).getValue();
  if (existing !== '') return;

  var range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);

  // ヘッダー行のスタイル設定
  range.setBackground('#1a73e8');
  range.setFontColor('#ffffff');
  range.setFontWeight('bold');
  range.setFontSize(10);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 30);

  // 列幅の自動調整
  sheet.autoResizeColumns(1, headers.length);
}

// ============================================================
// 設定シートのマスタデータ登録
// ============================================================
function setupSettingsSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return;

  // 既にデータがある場合はスキップ
  if (sheet.getRange('A1').getValue() !== '') return;

  sheet.clearContents();

  var col = 1;

  // 顧客ステータス
  col = writeMasterColumn_(sheet, col, '顧客ステータス', MASTER.CUSTOMER_STATUS);

  // 面談ステータス
  col = writeMasterColumn_(sheet, col, '面談ステータス', MASTER.MEETING_STATUS);

  // ヨミランク（定義付き）
  col = writeMasterColumnWithDesc_(sheet, col, 'ヨミランク', [
    ['A', '内定承諾済み、入社日確定', '80〜100%'],
    ['B', '最終面接中、内定見込みあり', '60〜79%'],
    ['C', '応募済み、選考進行中', '30〜59%'],
    ['D', '面談済み、求人提案中', '10〜29%'],
    ['E', '不通、長期フォロー、転職時期未定', '1〜9%'],
    ['失注', '辞退、他社決定、連絡不可', '0%']
  ]);

  // タスクステータス
  col = writeMasterColumn_(sheet, col, 'タスクステータス', MASTER.TASK_STATUS);

  // 担当CA
  col = writeMasterColumn_(sheet, col, '担当CA', MASTER.CA_LIST);

  // その他マスタ（参照用）
  col = writeMasterColumn_(sheet, col, '流入元', MASTER.INFLOW);
  col = writeMasterColumn_(sheet, col, '面談方法', MASTER.MEETING_METHOD);
  col = writeMasterColumn_(sheet, col, '対応種別', MASTER.CONTACT_TYPE);
  col = writeMasterColumn_(sheet, col, '対応結果', MASTER.CONTACT_RESULT);
  col = writeMasterColumn_(sheet, col, '選考ステータス', MASTER.SELECTION_STATUS);
  col = writeMasterColumn_(sheet, col, '転職希望時期', MASTER.TRANSFER_TIMING);
  col = writeMasterColumn_(sheet, col, '優先度', MASTER.PRIORITY);
  col = writeMasterColumn_(sheet, col, '取込ステータス', MASTER.IMPORT_STATUS);

  // Slack Webhook URL欄
  var slackRow = 2;
  var slackCol = col + 1;
  sheet.getRange(1, slackCol).setValue('Slack設定');
  sheet.getRange(1, slackCol).setBackground('#f4b400').setFontWeight('bold');
  sheet.getRange(slackRow, slackCol).setValue('Slack Webhook URL');
  sheet.getRange(slackRow + 1, slackCol).setValue('（ここにWebhook URLを貼り付け）');

  sheet.autoResizeColumns(1, col + 2);
}

function writeMasterColumn_(sheet, col, title, values) {
  sheet.getRange(1, col).setValue(title);
  sheet.getRange(1, col)
    .setBackground('#34a853')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  values.forEach(function(val, i) {
    sheet.getRange(i + 2, col).setValue(val);
  });

  return col + 2; // 1列空けて次へ
}

function writeMasterColumnWithDesc_(sheet, col, title, rows) {
  sheet.getRange(1, col).setValue(title);
  sheet.getRange(1, col, 1, 3)
    .merge()
    .setBackground('#34a853')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  // サブヘッダー
  sheet.getRange(2, col).setValue('ランク');
  sheet.getRange(2, col + 1).setValue('定義');
  sheet.getRange(2, col + 2).setValue('成約確度');
  sheet.getRange(2, col, 1, 3)
    .setBackground('#e8f5e9')
    .setFontWeight('bold');

  rows.forEach(function(row, i) {
    sheet.getRange(i + 3, col).setValue(row[0]);
    sheet.getRange(i + 3, col + 1).setValue(row[1]);
    sheet.getRange(i + 3, col + 2).setValue(row[2]);
  });

  return col + 5;
}

// ============================================================
// ダッシュボードシートの枠組み作成
// ============================================================
function setupDashboardSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) return;
  if (sheet.getRange('A1').getValue() !== '') return;

  var data = [
    ['キャリアアドバイザーCRM ダッシュボード', '', '', ''],
    ['最終更新', '', '', ''],
    ['', '', '', ''],

    // 日次KPI
    ['■ 日次確認', '', '', ''],
    ['指標', '件数', '', ''],
    ['本日の面談予定数', '', '', ''],
    ['本日の対応タスク数', '', '', ''],
    ['期限超過タスク数', '', '', ''],
    ['新規送客数', '', '', ''],
    ['初回未対応数', '', '', ''],
    ['面談後未更新数', '', '', ''],
    ['', '', '', ''],

    // ヨミ管理
    ['■ ヨミ管理（今月）', '', '', ''],
    ['指標', '件数', '金額', ''],
    ['Aヨミ件数', '', '', ''],
    ['Bヨミ件数', '', '', ''],
    ['Cヨミ件数', '', '', ''],
    ['今月の想定売上', '', '', ''],
    ['今月の加重売上', '', '', ''],
    ['', '', '', ''],

    // CA別KPI
    ['■ CA別KPI', '', '', ''],
    ['CA名', '担当顧客数', '面談数', '応募数'],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],

    // 月次KPI
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

    // ファネル
    ['■ ファネル', '', '', ''],
    ['ステージ', '件数', '', ''],
    ['送客数', '', '', ''],
    ['初回対応数', '', '', ''],
    ['面談予約数', '', '', ''],
    ['面談実施数', '', '', ''],
    ['求人提案数', '', '', ''],
    ['応募数', '', '', ''],
    ['内定数', '', '', ''],
    ['承諾数', '', '', ''],
    ['入社数', '', '', '']
  ];

  sheet.getRange(1, 1, data.length, 4).setValues(data);

  // タイトル行スタイル
  sheet.getRange('A1').setFontSize(16).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  sheet.getRange('A1:D1').merge();

  // セクションヘッダーのスタイル
  [4, 13, 21, 27, 38].forEach(function(r) {
    sheet.getRange(r, 1, 1, 4).merge()
      .setBackground('#e8eaf6')
      .setFontWeight('bold')
      .setFontSize(11);
  });

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 120);
}

// ============================================================
// ログシート設定
// ============================================================
function setupLogSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.LOG);
  if (!sheet) return;
  if (sheet.getRange('A1').getValue() !== '') return;

  var range = sheet.getRange(1, 1, 1, HEADERS.LOG.length);
  range.setValues([HEADERS.LOG]);
  range.setBackground('#455a64');
  range.setFontColor('#ffffff');
  range.setFontWeight('bold');
  range.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.LOG.length);
}

// ============================================================
// ログ出力関数
// ============================================================
function writeLog_(type, target, content, status, detail) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.LOG);
    if (!sheet) return;

    // ヘッダーがなければ作成
    if (sheet.getRange('A1').getValue() === '') {
      setupLogSheet_(ss);
    }

    sheet.appendRow([
      new Date(),
      type || '',
      target || '',
      content || '',
      status || '',
      detail || ''
    ]);
  } catch (e) {
    Logger.log('ログ出力エラー: ' + e.message);
  }
}

// ============================================================
// スタブ関数（後続ステップで実装）
// ============================================================
function importForesmaData() {
  SpreadsheetApp.getUi().alert('未実装', 'Foresmaデータ取込機能は現在実装中です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function importTimeRexData() {
  SpreadsheetApp.getUi().alert('未実装', 'TimeRexデータ取込機能は現在実装中です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function syncCustomerStatus() {
  SpreadsheetApp.getUi().alert('未実装', 'ステータス同期機能は現在実装中です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function createAutoTasks() {
  SpreadsheetApp.getUi().alert('未実装', 'タスク自動生成機能は現在実装中です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function checkAlerts() {
  SpreadsheetApp.getUi().alert('未実装', 'アラート確認機能は現在実装中です。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function updateDashboard() {
  SpreadsheetApp.getUi().alert('未実装', 'ダッシュボード更新機能は現在実装中です。', SpreadsheetApp.getUi().ButtonSet.OK);
}
