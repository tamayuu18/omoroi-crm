/**
 * Lreach 個別顧客ページ → おもろいCRM 更新ブックマークレット
 *
 * 対象URL: lreach-crm-prototype.vercel.app/referrals/[id]
 *
 * 【登録方法】
 * lreach_detail_bookmarklet.min.js の内容をブックマークのURLに貼り付ける
 * 名前: 「CRM: Lreach個別取込」
 *
 * 【使い方】
 * Lreach CRM の個別顧客ページを開いてブックマークをクリック
 */
javascript:(function(){

  var ENDPOINT_URL = 'https://omoroi-crm.vercel.app/api/ingest/lreach-update';
  var INGEST_TOKEN = 'crm-ingest-secret-2024';

  // ============================================================
  // ヒアリングメモのテキストを取得
  // ============================================================
  function getHearingMemoText() {
    // 複数のセレクタを試す
    var selectors = [
      '[class*="hearing"]', '[class*="memo"]', '[class*="Memo"]',
      '[class*="HearingMemo"]', 'pre', '.whitespace-pre-wrap',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) {
        var t = els[j].innerText || '';
        if (t.length > 50 && t.match(/名前|氏名|電話|アドレス/)) return t;
      }
    }
    // フォールバック: ページ全体テキストからヒアリングメモ部分を抽出
    var body = document.body.innerText;
    var m = body.match(/名前\s*[：:].+?(?=\n{3,}|$)/s);
    return m ? m[0] : '';
  }

  // ============================================================
  // React Fiber から個別顧客データを取得
  // ============================================================
  function getDataFromReact() {
    try {
      var root = document.querySelector('#__next') || document.querySelector('[id="__next"]');
      if (!root) return null;
      var fk = Object.keys(root).find(function(k){ return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'); });
      if (!fk) return null;
      return searchFiber(root[fk], 0);
    } catch(e) { return null; }
  }

  function searchFiber(fiber, depth) {
    if (!fiber || depth > 30) return null;
    try {
      var state = fiber.memoizedState;
      while (state) {
        var ms = state.memoizedState;
        if (ms && typeof ms === 'object' && !Array.isArray(ms)) {
          if (ms.name || ms.fullName || ms.customerName) return ms;
          if (ms.hearingMemo || ms.memo) return ms;
        }
        state = state.next;
      }
      var props = fiber.memoizedProps;
      if (props) {
        for (var k in props) {
          var v = props[k];
          if (v && typeof v === 'object' && (v.name || v.hearingMemo)) return v;
        }
      }
    } catch(e) {}
    var fromChild = searchFiber(fiber.child, depth+1);
    if (fromChild) return fromChild;
    return searchFiber(fiber.sibling, depth+1);
  }

  // ============================================================
  // __NEXT_DATA__ から取得
  // ============================================================
  function getFromNextData() {
    try {
      var nd = window.__NEXT_DATA__;
      if (!nd) return null;
      var props = nd.props && nd.props.pageProps;
      if (!props) return null;
      // referral / customer / record など
      return props.referral || props.customer || props.record || props.data || null;
    } catch(e) { return null; }
  }

  // ============================================================
  // ページの名前をDOMから取得
  // ============================================================
  function getNameFromDOM() {
    // h1, h2, タイトル系
    var headings = document.querySelectorAll('h1, h2, [class*="name"], [class*="Name"]');
    for (var i = 0; i < headings.length; i++) {
      var t = (headings[i].innerText || '').trim();
      if (t && t.length >= 2 && t.length <= 20 && !t.match(/CRM|Lreach|管理|ページ/)) return t;
    }
    return '';
  }

  // ============================================================
  // ヒアリングメモのパース
  // ============================================================
  function parseMemoText(text) {
    var result = {};
    var lines = text.split('\n');
    var fieldMap = [
      [/^(名前|氏名)\s*[：:]\s*(.+)/, 'name'],
      [/^(ふりがな|フリガナ)\s*[：:]\s*(.+)/, 'kana'],
      [/^性別\s*[：:]\s*(.+)/, 'gender'],
      [/^(最終学歴|学歴)\s*[：:]\s*(.+)/, 'education'],
      [/^(電話番号|TEL|Tel)\s*[：:]\s*([\d\-\s]+)/, 'phone'],
      [/^(アドレス|メール|メールアドレス)\s*[：:]\s*([\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,})/, 'email'],
      [/^(所在地|住所|居住地)\s*[：:]\s*(.+)/, 'area'],
      [/^希望勤務地\s*[：:]\s*(.+)/, 'hopeArea'],
      [/^(現在の職種|現職種|現職職種|職種)\s*[：:]\s*(.+)/, 'job'],
      [/^(現職企業|会社名|企業名|現勤務先)\s*[：:]\s*(.+)/, 'company'],
      [/^(現在年収|現在の年収|年収)\s*[：:]\s*([\d,，万円]+)/, 'salary'],
      [/^希望年収\s*[：:]\s*([\d,，万円]+)/, 'hopeSalary'],
      [/^希望職種\s*[：:]\s*(.+)/, 'hopeJob'],
      [/^(転職希望時期|転職時期|希望転職時期)\s*[：:]\s*(.+)/, 'timing'],
    ];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      for (var j = 0; j < fieldMap.length; j++) {
        var m = line.match(fieldMap[j][0]);
        if (m) {
          result[fieldMap[j][1]] = (m[2] !== undefined ? m[2] : m[1]).trim();
          break;
        }
      }
    }
    // 生年月日 → 保存用に正規化 + 年齢を自動算出
    var birthM = text.match(/生年月日\s*[：:]\s*(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/);
    if (birthM) {
      result.birthDate = birthM[1] + '-' + ('0'+birthM[2]).slice(-2) + '-' + ('0'+birthM[3]).slice(-2);
      var today = new Date();
      var age = today.getFullYear() - parseInt(birthM[1]);
      var md = (today.getMonth()+1) - parseInt(birthM[2]);
      if (md < 0 || (md === 0 && today.getDate() < parseInt(birthM[3]))) age--;
      result.age = String(age);
    }
    // 年収の万円除去
    if (result.salary) result.salary = result.salary.replace(/万円?/,'').replace(/[,，]/g,'').trim();
    if (result.hopeSalary) result.hopeSalary = result.hopeSalary.replace(/万円?/,'').replace(/[,，]/g,'').trim();
    return result;
  }

  // ============================================================
  // React/NextData から正規化
  // ============================================================
  function normBirthDate(str) {
    if (!str) return '';
    var m = String(str).match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[3]).slice(-2);
  }

  function normalizeReactData(rec) {
    var memo = rec.hearingMemo || rec.memo || rec.note || rec.comment || rec['ヒアリングメモ'] || '';
    var parsed = parseMemoText(memo);
    return {
      name:       rec.name || rec.customerName || rec.fullName || parsed.name || '',
      kana:       rec.kana || rec.furigana || parsed.kana || '',
      phone:      (rec.phone || rec.phoneNumber || rec.tel || parsed.phone || '').replace(/[\s\-]/g,''),
      email:      (rec.email || rec.mailAddress || parsed.email || '').toLowerCase(),
      age:        parsed.age || String(rec.age || ''),
      birthDate:  parsed.birthDate || normBirthDate(rec.birthDate || rec.birthday || ''),
      education:  parsed.education || rec.education || rec.finalEducation || '',
      gender:     parsed.gender || rec.gender || '',
      area:       parsed.area || '',
      company:    parsed.company || '',
      job:        parsed.job || '',
      salary:     parsed.salary || String(rec.currentSalary || ''),
      hopeJob:    parsed.hopeJob || '',
      hopeArea:   parsed.hopeArea || '',
      hopeSalary: parsed.hopeSalary || String(rec.desiredSalary || ''),
      timing:     parsed.timing || '',
    };
  }

  // ============================================================
  // メイン処理
  // ============================================================
  var data = null;

  // 1. React/NextData から取得を試みる
  var reactData = getFromNextData() || getDataFromReact();
  if (reactData && (reactData.name || reactData.hearingMemo)) {
    data = normalizeReactData(reactData);
  }

  // 2. ヒアリングメモテキストからパース
  var memoText = getHearingMemoText();
  if (memoText) {
    var parsedMemo = parseMemoText(memoText);
    if (!data) {
      data = parsedMemo;
    } else {
      // マージ: パース結果で空フィールドを補完
      for (var k in parsedMemo) {
        if (parsedMemo[k] && !data[k]) data[k] = parsedMemo[k];
      }
    }
  }

  // 3. 名前だけDOMから補完
  if (!data) data = {};
  if (!data.name) data.name = getNameFromDOM();

  if (!data.name) {
    alert('【CRM取込】顧客名が取得できませんでした。\nLreachの個別顧客ページを開いた状態で実行してください。');
    return;
  }

  // ============================================================
  // 確認ダイアログ
  // ============================================================
  var LABELS = {
    name:'氏名', kana:'フリガナ', gender:'性別', age:'年齢',
    birthDate:'生年月日', education:'最終学歴',
    phone:'電話番号', email:'メール', area:'居住地',
    company:'現職企業', job:'現職職種',
    salary:'現在年収(万)', hopeJob:'希望職種',
    hopeArea:'希望勤務地', hopeSalary:'希望年収(万)',
    timing:'転職希望時期'
  };
  var preview = '「' + data.name + '」の情報をCRMに反映します。\n\n';
  for (var key in LABELS) {
    if (data[key]) preview += LABELS[key] + ': ' + data[key] + '\n';
  }
  preview += '\n」送信しますか？';

  if (!confirm(preview)) return;

  // ============================================================
  // about:blank ポップアップ経由でCRM APIに送信
  // ============================================================
  var w = window.open('', '_blank', 'width=380,height=200,left=100,top=100');
  if (!w) {
    alert('ポップアップがブロックされています。許可してください。');
    return;
  }

  var escUrl   = JSON.stringify(ENDPOINT_URL);
  var escToken = JSON.stringify(INGEST_TOKEN);
  var escBody  = JSON.stringify(JSON.stringify({ data: data }));

  w.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>body{font-family:sans-serif;padding:20px;background:#f0fff4;margin:0}' +
    'p{font-size:15px;color:#333;margin:0 0 8px}.sub{font-size:12px;color:#666}</style>' +
    '</head><body>' +
    '<p id="s">&#128228; CRMに送信中...</p>' +
    '<p class="sub" id="d">このウィンドウを閉じないでください</p>' +
    '<script>' +
    'var url='+escUrl+';var token='+escToken+';var body='+escBody+';' +
    'fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-ingest-token":token},body:body})' +
    '.then(function(r){return r.json();})' +
    '.then(function(d){' +
    '  var msg=d.action==="updated"?"✅ 更新完了！「"+d.name+"」":"✅ 新規登録！「"+d.name+"」";' +
    '  document.getElementById("s").textContent=msg;' +
    '  document.getElementById("d").textContent="閉じてOKです";' +
    '  try{window.opener.postMessage("crm_lreach_ok_"+d.action,"*");}catch(e){}' +
    '  setTimeout(function(){try{window.close();}catch(e){}},3000);' +
    '})' +
    '.catch(function(err){' +
    '  document.getElementById("s").textContent="❌ エラー: "+err.message;' +
    '});' +
    '<\/script></body></html>'
  );
  w.document.close();

  var done = false;
  window.addEventListener('message', function onMsg(ev) {
    if (typeof ev.data === 'string' && ev.data.indexOf('crm_lreach_ok_') === 0 && !done) {
      done = true;
      window.removeEventListener('message', onMsg);
      var action = ev.data.replace('crm_lreach_ok_','');
      alert('【CRM取込 完了】\n' + (action==='updated'?'✅ 更新しました！':'✅ 新規登録しました！') + '\n\nCRMで「' + data.name + '」を確認してください。');
    }
  });
  setTimeout(function(){
    if (!done) {
      done = true;
      alert('【CRM取込】送信しました。CRMで「' + data.name + '」を確認してください。');
    }
  }, 12000);

})();
