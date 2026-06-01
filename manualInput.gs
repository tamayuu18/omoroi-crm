// ============================================================
// 手動入力フォーム
// ============================================================

// ============================================================
// 顧客マスタへの直接手動登録フォーム
// ============================================================
function showManualCustomerForm() {
  var html = HtmlService.createHtmlOutput(buildCustomerFormHtml_())
    .setWidth(560).setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(html, '顧客を手動登録');
}

function saveManualCustomer(data) {
  var ss            = SpreadsheetApp.getActiveSpreadsheet();
  var customerSheet = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  var taskSheet     = ss.getSheetByName(SHEET_NAMES.TASK);
  if (!customerSheet) throw new Error('顧客マスタシートが見つかりません');

  var name  = String(data.name  || '').trim();
  var phone = normalizePhone_(String(data.phone || '').trim());
  var email = String(data.email || '').trim().toLowerCase();
  if (!name) throw new Error('氏名は必須です');

  // 重複チェック
  var idx = buildCustomerIndex_(customerSheet);
  if (email && idx.byEmail[email]) throw new Error('このメールアドレスはすでに登録されています');
  if (phone && idx.byPhone[phone]) throw new Error('この電話番号はすでに登録されています');

  var now        = new Date();
  var customerId = generateCustomerId_(customerSheet);
  var sendDate   = data.sendDate ? new Date(data.sendDate) : now;

  var row = new Array(26).fill('');
  row[CUSTOMER_COL.ID]          = customerId;
  row[CUSTOMER_COL.REG_DATE]    = now;
  row[CUSTOMER_COL.UPDATED_AT]  = now;
  row[CUSTOMER_COL.INFLOW]      = data.inflow || 'その他';
  row[CUSTOMER_COL.FORESMA_ID]  = '';
  row[CUSTOMER_COL.NAME]        = name;
  row[CUSTOMER_COL.KANA]        = String(data.kana    || '').trim();
  row[CUSTOMER_COL.PHONE]       = phone;
  row[CUSTOMER_COL.EMAIL]       = email;
  row[CUSTOMER_COL.AGE]         = data.age    || '';
  row[CUSTOMER_COL.GENDER]      = String(data.gender  || '').trim();
  row[CUSTOMER_COL.AREA]        = String(data.area    || '').trim();
  row[CUSTOMER_COL.COMPANY]     = String(data.company || '').trim();
  row[CUSTOMER_COL.JOB]         = String(data.job     || '').trim();
  row[CUSTOMER_COL.SALARY]      = String(data.salary  || '').trim();
  row[CUSTOMER_COL.HOPE_JOB]    = String(data.hopeJob || '').trim();
  row[CUSTOMER_COL.HOPE_AREA]   = String(data.hopeArea|| '').trim();
  row[CUSTOMER_COL.HOPE_SALARY] = String(data.hopeSalary || '').trim();
  row[CUSTOMER_COL.TIMING]      = String(data.timing  || '').trim();
  row[CUSTOMER_COL.CA]          = String(data.ca      || '').trim();
  row[CUSTOMER_COL.STATUS]      = '初回未対応';
  row[CUSTOMER_COL.YOMI_RANK]   = '';
  row[CUSTOMER_COL.NEXT_ACTION] = '初回連絡';
  row[CUSTOMER_COL.NEXT_DL]     = sendDate;
  row[CUSTOMER_COL.LAST_CONT]   = '';
  row[CUSTOMER_COL.NOTE]        = String(data.note || '').trim();
  customerSheet.appendRow(row);

  // タスク作成
  if (taskSheet) {
    var taskId  = generateTaskId_(taskSheet);
    var taskRow = buildTaskRow_(taskId, customerId, name,
      String(data.ca || ''), '初回連絡', sendDate, '未対応', '高', '初回未対応');
    taskSheet.appendRow(taskRow);
  }

  appendLog_(ss, '手動登録', name, '顧客マスタに手動登録しました。ID: ' + customerId, '成功', '');
  return customerId + ' として登録しました';
}

// ============================================================
// Foresma取込シートへの手動追加フォーム
// ============================================================
function showManualForesmaForm() {
  var html = HtmlService.createHtmlOutput(buildForesmaFormHtml_())
    .setWidth(520).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Foresma取込に手動追加');
}

function saveManualForesmaRow(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.FORESMA);
  if (!sheet) throw new Error('Foresma取込シートが見つかりません');

  var name = String(data.name || '').trim();
  if (!name) throw new Error('氏名は必須です');

  var now  = new Date();
  var row  = [
    '未取込',
    now,
    '',
    data.sendDate ? new Date(data.sendDate) : now,
    name,
    String(data.kana   || '').trim(),
    normalizePhone_(String(data.phone  || '').trim()),
    String(data.email  || '').trim().toLowerCase(),
    data.age   || '',
    String(data.gender || '').trim(),
    '',
    '',
    String(data.salary || '').trim(),
    '',
    '',
    String(data.timing || '').trim(),
    String(data.note   || '').trim(),
    String(data.ca     || '').trim()
  ];
  sheet.appendRow(row);
  appendLog_(ss, '手動追加', name, 'Foresma取込シートに手動追加しました', '成功', '');
  return '追加しました。「Foresmaデータを取り込む」を実行してください。';
}

// ============================================================
// フォームHTML生成
// ============================================================
function buildCustomerFormHtml_() {
  return '<style>' +
    'body{font-family:sans-serif;font-size:13px;padding:12px 16px;margin:0;color:#333}' +
    'label{display:block;margin:8px 0 2px;font-weight:600;font-size:12px;color:#555}' +
    'input,select,textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px}' +
    'textarea{height:60px;resize:vertical}' +
    '.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    'button{margin-top:14px;padding:9px 24px;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer;width:100%}' +
    'button:hover{background:#1557b0}' +
    '#msg{margin-top:10px;font-weight:bold;min-height:20px}' +
    '.req{color:#d93025}' +
    '</style>' +
    '<div class="row2">' +
      '<div><label>氏名 <span class="req">*</span></label><input id="name" placeholder="山田 太郎"></div>' +
      '<div><label>フリガナ</label><input id="kana" placeholder="ヤマダ タロウ"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>電話番号</label><input id="phone" placeholder="090-1234-5678"></div>' +
      '<div><label>メールアドレス</label><input id="email" placeholder="taro@example.com"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>年齢</label><input id="age" type="number" placeholder="30"></div>' +
      '<div><label>性別</label>' +
        '<select id="gender"><option value="">-</option><option>男性</option><option>女性</option></select>' +
      '</div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>流入元</label>' +
        '<select id="inflow"><option>Foresma</option><option>Lreach</option><option>TimeRex</option><option>紹介</option><option>その他</option></select>' +
      '</div>' +
      '<div><label>送客日</label><input id="sendDate" type="date"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>担当CA</label><input id="ca" placeholder="担当者名"></div>' +
      '<div><label>居住地</label><input id="area" placeholder="東京都"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>現職企業名</label><input id="company" placeholder="株式会社〇〇"></div>' +
      '<div><label>現職職種</label><input id="job" placeholder="営業"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>現在年収</label><input id="salary" placeholder="400万"></div>' +
      '<div><label>希望年収</label><input id="hopeSalary" placeholder="500万"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>希望職種</label><input id="hopeJob"></div>' +
      '<div><label>希望勤務地</label><input id="hopeArea"></div>' +
    '</div>' +
    '<label>転職希望時期</label><input id="timing" placeholder="3ヶ月以内">' +
    '<label>備考</label><textarea id="note"></textarea>' +
    '<button onclick="save()">登録する</button>' +
    '<div id="msg"></div>' +
    '<script>' +
    'function v(id){return document.getElementById(id).value.trim();}' +
    'function save(){' +
    '  var msg=document.getElementById("msg");' +
    '  msg.style.color="#555";msg.textContent="登録中...";' +
    '  var d={name:v("name"),kana:v("kana"),phone:v("phone"),email:v("email"),' +
    '    age:v("age"),gender:v("gender"),inflow:v("inflow"),sendDate:v("sendDate"),' +
    '    ca:v("ca"),area:v("area"),company:v("company"),job:v("job"),' +
    '    salary:v("salary"),hopeSalary:v("hopeSalary"),hopeJob:v("hopeJob"),' +
    '    hopeArea:v("hopeArea"),timing:v("timing"),note:v("note")};' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){msg.style.color="green";msg.textContent="✅ "+r;})' +
    '    .withFailureHandler(function(e){msg.style.color="red";msg.textContent="❌ "+e.message;})' +
    '    .saveManualCustomer(d);' +
    '}' +
    '</script>';
}

function buildForesmaFormHtml_() {
  return '<style>' +
    'body{font-family:sans-serif;font-size:13px;padding:12px 16px;margin:0;color:#333}' +
    'label{display:block;margin:8px 0 2px;font-weight:600;font-size:12px;color:#555}' +
    'input,select,textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px}' +
    'textarea{height:60px;resize:vertical}' +
    '.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    'button{margin-top:14px;padding:9px 24px;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer;width:100%}' +
    'button:hover{background:#1557b0}' +
    '#msg{margin-top:10px;font-weight:bold;min-height:20px}' +
    '.req{color:#d93025}' +
    '</style>' +
    '<div class="row2">' +
      '<div><label>氏名 <span class="req">*</span></label><input id="name" placeholder="山田 太郎"></div>' +
      '<div><label>フリガナ</label><input id="kana" placeholder="ヤマダ タロウ"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>電話番号</label><input id="phone" placeholder="090-1234-5678"></div>' +
      '<div><label>メールアドレス</label><input id="email" placeholder="taro@example.com"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>年齢</label><input id="age" type="number"></div>' +
      '<div><label>性別</label>' +
        '<select id="gender"><option value="">-</option><option>男性</option><option>女性</option></select>' +
      '</div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>送客日</label><input id="sendDate" type="date"></div>' +
      '<div><label>担当CA</label><input id="ca"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>現在年収</label><input id="salary" placeholder="400万"></div>' +
      '<div><label>転職希望時期</label><input id="timing" placeholder="3ヶ月以内"></div>' +
    '</div>' +
    '<label>備考（ヒアリングメモ等）</label><textarea id="note"></textarea>' +
    '<button onclick="save()">取込シートに追加する</button>' +
    '<div id="msg"></div>' +
    '<script>' +
    'function v(id){return document.getElementById(id).value.trim();}' +
    'function save(){' +
    '  var msg=document.getElementById("msg");' +
    '  msg.style.color="#555";msg.textContent="追加中...";' +
    '  var d={name:v("name"),kana:v("kana"),phone:v("phone"),email:v("email"),' +
    '    age:v("age"),gender:v("gender"),sendDate:v("sendDate"),' +
    '    ca:v("ca"),salary:v("salary"),timing:v("timing"),note:v("note")};' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){msg.style.color="green";msg.textContent="✅ "+r;})' +
    '    .withFailureHandler(function(e){msg.style.color="red";msg.textContent="❌ "+e.message;})' +
    '    .saveManualForesmaRow(d);' +
    '}' +
    '</script>';
}
