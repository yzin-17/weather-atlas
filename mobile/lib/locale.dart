import 'package:flutter/material.dart';

const languageNames = {
  'en': 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  'ko': '한국어',
};
const supportedLocales = [
  Locale('en'),
  Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hans'),
  Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant'),
  Locale('ko'),
];
String resolveLanguage(Locale os) {
  if (os.languageCode == 'ko') return 'ko';
  if (os.languageCode != 'zh') return 'en';
  if (os.scriptCode != null) {
    return os.scriptCode == 'Hant' ? 'zh-Hant' : 'zh-Hans';
  }
  return ['TW', 'HK', 'MO'].contains(os.countryCode) ? 'zh-Hant' : 'zh-Hans';
}

Locale asLocale(String lang) =>
    supportedLocales[languageNames.keys.toList().indexOf(lang)];
const copy = <String, List<String>>{
  'loading': ['Loading…', '正在加载…', '載入中…', '불러오는 중…'],
  'loadingWeather': [
    'Loading weather for the selected location…',
    '正在加载所选位置的天气…',
    '正在載入所選位置的天氣…',
    '선택한 위치의 날씨를 불러오는 중…',
  ],
  'mapTileError': [
    'Map unavailable. You can still search or confirm a point.',
    '底图暂不可用，仍可搜索或确认坐标。',
    '底圖暫時無法使用，仍可搜尋或確認座標。',
    '지도를 불러올 수 없습니다. 검색하거나 위치를 확인할 수 있습니다.',
  ],
  'mapConfirmPreview': [
    'Confirm to load this point’s forecast',
    '确认后加载该点天气',
    '確認後載入此處天氣',
    '확인하면 이 위치의 예보를 불러옵니다',
  ],
  'mapWeatherError': [
    'Some weather is unavailable',
    '部分天气暂不可用',
    '部分天氣暫時無法使用',
    '일부 날씨를 불러올 수 없습니다',
  ],
  'copyLink': ['Copy city link', '复制城市链接', '複製城市連結', '도시 링크 복사'],
  'linkCopied': ['City link copied', '已复制城市链接', '已複製城市連結', '도시 링크를 복사했습니다'],
  'askCity': [
    'Include each city’s region and country.',
    '请补充每座城市的地区和国家。',
    '請補充每座城市的地區和國家。',
    '각 도시의 지역과 국가를 입력하세요.',
  ],
  'askInput': [
    'Specify both cities, date, period and timezone.',
    '请明确两座城市、日期、时段和时区。',
    '請明確兩座城市、日期、時段和時區。',
    '두 도시, 날짜, 시간대와 기준 시간대를 지정하세요.',
  ],
  'server': ['Weather service URL', '天气服务地址', '天氣服務網址', '날씨 서비스 주소'],
  'connect': ['Connect', '连接', '連線', '연결'],
  'badUrl': [
    'Enter an http(s) server URL',
    '请输入 http(s) 服务地址',
    '請輸入 http(s) 服務網址',
    'http(s) 서버 주소를 입력하세요',
  ],
  'search': ['Search cities', '搜索城市', '搜尋城市', '도시 검색'],
  'locate': ['Use my location', '使用当前位置', '使用目前位置', '현재 위치 사용'],
  'here': ['Current location', '当前位置', '目前位置', '현재 위치'],
  'point': ['Selected location', '地图选点', '地圖選點', '선택한 위치'],
  'locating': ['Finding your location…', '正在获取位置…', '正在取得位置…', '위치 확인 중…'],
  'denied': [
    'Location permission is off. You can search for a city.',
    '定位权限未开启，可搜索城市。',
    '未開啟定位權限，可搜尋城市。',
    '위치 권한이 꺼져 있습니다. 도시를 검색할 수 있습니다.',
  ],
  'gpsOff': [
    'Turn on the device’s location service or search for a city.',
    '请开启系统定位或搜索城市。',
    '請開啟系統定位或搜尋城市。',
    '위치 서비스를 켜거나 도시를 검색하세요.',
  ],
  'deniedForever': [
    'Location access is blocked. Allow it in system Settings, or search for a city.',
    '定位权限已被禁止，请在系统设置中允许，或搜索城市。',
    '定位權限已被禁止，請在系統設定中允許，或搜尋城市。',
    '위치 권한이 차단되었습니다. 시스템 설정에서 허용하거나 도시를 검색하세요.',
  ],
  'gpsTimeout': [
    'No location received within 10 seconds. Retry or search for a city.',
    '10 秒内未收到位置，请重试或搜索城市。',
    '10 秒內未收到位置，請重試或搜尋城市。',
    '10초 안에 위치를 받지 못했습니다. 다시 시도하거나 도시를 검색하세요.',
  ],
  'gpsFail': [
    'Location unavailable. Try again or search.',
    '定位暂不可用，请重试或搜索。',
    '定位暫無法使用，請重試或搜尋。',
    '위치를 확인할 수 없습니다. 다시 시도하거나 검색하세요.',
  ],
  'language': ['Language', '语言', '語言', '언어'],
  'system': ['System language', '跟随系统', '跟隨系統', '시스템 언어'],
  'hourly': ['Hourly forecast', '逐小时预报', '逐時預報', '시간별 예보'],
  'week': ['7-day forecast', '7 天预报', '7 天預報', '주간 예보'],
  'places': ['Other cities', '其他城市', '其他城市', '다른 도시'],
  'add': ['Add city', '添加城市', '新增城市', '도시 추가'],
  'save': ['Save city', '收藏城市', '收藏城市', '도시 저장'],
  'remove': ['Remove city', '取消收藏', '取消收藏', '저장 해제'],
  'empty': [
    'Save a city to see its weather here.',
    '收藏城市后，可在这里查看天气。',
    '收藏城市後，可在這裡查看天氣。',
    '도시를 저장하면 이곳에 날씨가 표시됩니다.',
  ],
  'today': ['Today', '今天', '今天', '오늘'],
  'now': ['Now', '现在', '現在', '지금'],
  'local': ['Local time', '当地时间', '當地時間', '현지 시각'],
  'updated': ['Updated', '更新于', '更新於', '업데이트'],
  'weatherFail': [
    'Weather unavailable. Check the connection and retry.',
    '天气暂不可用，请检查连接后重试。',
    '天氣暫無法使用，請檢查連線後重試。',
    '날씨를 불러오지 못했습니다. 연결 상태를 확인하세요.',
  ],
  'stale': [
    'Refresh failed · showing saved forecast',
    '刷新失败，正在显示已保存的预报',
    '更新失敗，顯示已儲存的預報',
    '새로 고침 실패 · 저장된 예보 표시 중',
  ],
  'weatherTimeout': [
    'The weather request timed out. Please retry.',
    '天气请求超时，请重试。',
    '天氣請求逾時，請重試。',
    '날씨 요청 시간이 초과되었습니다. 다시 시도하세요.',
  ],
  'weatherConnection': [
    'Cannot connect to the weather service. Check the network and service address.',
    '无法连接天气服务，请检查网络和服务地址。',
    '無法連線天氣服務，請檢查網路與服務網址。',
    '날씨 서비스에 연결할 수 없습니다. 네트워크와 서비스 주소를 확인하세요.',
  ],
  'weatherServer': [
    'The weather service returned an error. Please retry.',
    '天气服务返回错误，请重试。',
    '天氣服務回傳錯誤，請重試。',
    '날씨 서비스에서 오류를 반환했습니다. 다시 시도하세요.',
  ],
  'weatherInvalid': [
    'The weather response could not be read. Please retry.',
    '无法读取天气数据，请重试。',
    '無法讀取天氣資料，請重試。',
    '날씨 데이터를 읽을 수 없습니다. 다시 시도하세요.',
  ],
  'weatherUpstream': [
    'Fresh data is unavailable from the weather provider. Please retry later.',
    '天气供方暂无新数据，请稍后重试。',
    '天氣供應方暫無新資料，請稍後重試。',
    '날씨 제공업체의 최신 데이터가 없습니다. 나중에 다시 시도하세요.',
  ],
  'retry': ['Retry', '重试', '重試', '다시 시도'],
  'retryCity': ['Retry city lookup', '重新识别城市', '重新辨識城市', '도시 이름 다시 찾기'],
  'resolvingCity': ['Finding city…', '正在识别城市…', '正在辨識城市…', '도시를 찾는 중…'],
  'refresh': ['Refresh', '刷新', '重新整理', '새로 고침'],
  'demo': ['Sample forecast', '示例预报', '範例預報', '샘플 예보'],
  'map': ['Map search', '地图搜索', '地圖搜尋', '지도 검색'],
  'confirm': ['View weather here', '查看此处天气', '查看此處天氣', '이 위치의 날씨 보기'],
  'pin': [
    'Tap the map to choose a location',
    '点按地图选择地点',
    '點選地圖以選擇地點',
    '지도를 눌러 위치를 선택하세요',
  ],
  'saved': ['Saved', '已收藏', '已收藏', '저장됨'],
  'choose': ['Choose a city', '选择城市', '選擇城市', '도시 선택'],
  'citiesHint': [
    'Enter at least two characters',
    '至少输入两个字符',
    '至少輸入兩個字元',
    '두 글자 이상 입력하세요',
  ],
  'none': ['No matching cities', '未找到匹配的城市', '找不到相符的城市', '일치하는 도시가 없습니다'],
  'searchFail': [
    'Search unavailable. Please retry.',
    '搜索暂不可用，请重试。',
    '搜尋暫無法使用，請重試。',
    '검색할 수 없습니다. 다시 시도하세요.',
  ],
  'ask': ['Ask about the weather', '问天气', '問天氣', '날씨에 질문하기'],
  'askShort': ['Ask weather', '问天气', '問天氣', '날씨 질문'],
  'compare': [
    'Compare Seoul and Taipei tomorrow morning 7–9: where is rain more likely?',
    '首尔和台北明天早上 7–9 点，哪里更容易下雨？',
    '首爾和台北明天早上 7–9 點，哪裡更容易下雨？',
    '서울과 타이베이 내일 오전 7–9시 어디가 비가 올 가능성이 높나요?',
  ],
  'afternoon': ['What about the afternoon?', '那下午呢？', '那下午呢？', '그럼 오후는요?'],
  'colder': ['Which is colder?', '哪个更冷？', '哪個更冷？', '어디가 더 추워요?'],
  'testTiles': [
    'Local map test layer',
    '本地地图测试图层',
    '本機地圖測試圖層',
    '로컬 지도 테스트 레이어',
  ],
  'refreshAsk': [
    'Refresh forecasts and retry',
    '刷新预报并重试',
    '重新整理預報並重試',
    '예보 새로고침 후 다시 시도',
  ],
  'question': ['Ask a question', '输入天气问题', '輸入天氣問題', '날씨에 대해 질문하세요'],
  'send': ['Ask', '提问', '提問', '질문하기'],
  'askStop': ['Stop', '停止', '停止', '중지'],
  'askStopped': ['Generation stopped', '已停止生成', '已停止產生', '생성이 중지되었습니다'],
  'askWeather': ['Preparing forecasts…', '正在准备预报…', '正在準備預報…', '예보 준비 중…'],
  'askSearch': ['Finding cities…', '正在查找城市…', '正在尋找城市…', '도시 검색 중…'],
  'askModel': ['Interpreting your question…', '正在理解问题…', '正在理解問題…', '질문 분석 중…'],
  'askDisplaying': ['Displaying answer…', '正在显示回答…', '正在顯示回答…', '답변 표시 중…'],
  'askFootnote': [
    'Answers use the current forecast. Weather may change.',
    '回答依据当前预报，天气可能变化。',
    '回答依據目前預報，天氣可能變化。',
    '현재 예보를 바탕으로 답변하며 날씨는 바뀔 수 있습니다.',
  ],
  'weekQuestion': [
    'What is the forecast for the next 7 days?',
    '未来 7 天天气如何？',
    '未來 7 天天氣如何？',
    '앞으로 7일 날씨는 어떤가요?',
  ],
  'umbrella': [
    'Do I need an umbrella in the next 6 hours?',
    '未来六小时需要带伞吗？',
    '未來六小時需要帶傘嗎？',
    '앞으로 6시간 동안 우산이 필요할까요?',
  ],
  'warm': [
    'When is the warmest hour today?',
    '今天几点最暖？',
    '今天幾點最暖？',
    '오늘 몇 시가 가장 따뜻한가요?',
  ],
  'askFail': [
    'Could not get an answer. Please retry.',
    '回答暂不可用，请重试。',
    '暫時無法取得回答，請重試。',
    '답변을 가져올 수 없습니다. 다시 시도하세요.',
  ],
  'askForecast': [
    'Weather data could not be updated. Please try again shortly.',
    '天气数据暂时无法更新，请稍后重试。',
    '天氣資料暫時無法更新，請稍後重試。',
    '날씨 데이터를 업데이트할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  ],
  'changed': [
    'Forecast changed. Refresh the city and ask again.',
    '预报已更新，请刷新城市后重新提问。',
    '預報已更新，請重新整理後再次提問。',
    '예보가 변경되었습니다. 새로 고침 후 다시 질문하세요.',
  ],
  'limited': [
    'Too many questions. Please try later.',
    '提问较频繁，请稍后再试。',
    '提問過於頻繁，請稍後再試。',
    '질문이 너무 많습니다. 잠시 후 다시 시도하세요.',
  ],
  'evidence': ['Forecast evidence', '预报依据', '預報依據', '예보 근거'],
  'model': ['AI answer', 'AI 回答', 'AI 回答', 'AI 답변'],
  'rules': ['Forecast guide', '预报规则解读', '預報規則解讀', '예보 안내'],
  'rain': ['Precipitation chance', '降水概率', '降水機率', '강수 확률'],
  'data': ['Weather data', '天气数据', '天氣資料', '날씨 데이터'],
  'clear': ['Clear sky', '晴', '晴', '맑음'],
  'partial': ['Partly cloudy', '局部多云', '局部多雲', '구름 조금'],
  'cloud': ['Overcast', '阴', '陰', '흐림'],
  'fog': ['Fog', '雾', '霧', '안개'],
  'drizzle': ['Drizzle', '毛毛雨', '毛毛雨', '이슬비'],
  'wet': ['Rain', '雨', '雨', '비'],
  'snow': ['Snow', '雪', '雪', '눈'],
  'thunder': ['Thunderstorms', '雷暴', '雷雨', '뇌우'],
  'unknown': ['Weather', '天气', '天氣', '날씨'],
};

class Words {
  final String language;
  const Words(this.language);
  String call(String key) =>
      copy[key]![languageNames.keys.toList().indexOf(language)];
  String city(String id, String name) => switch (id) {
    'gps' => name.isEmpty ? call('here') : name,
    'point' => name.isEmpty ? call('point') : name,
    '1835848' => [
      'Seoul',
      '首尔',
      '首爾',
      '서울',
    ][languageNames.keys.toList().indexOf(language)],
    '1815286' => [
      'Chengdu',
      '成都',
      '成都',
      '청두',
    ][languageNames.keys.toList().indexOf(language)],
    '1795565' => [
      'Shenzhen',
      '深圳',
      '深圳',
      '선전',
    ][languageNames.keys.toList().indexOf(language)],
    '1819729' => [
      'Hong Kong',
      '香港',
      '香港',
      '홍콩',
    ][languageNames.keys.toList().indexOf(language)],
    '1668341' => [
      'Taipei',
      '台北',
      '臺北',
      '타이베이',
    ][languageNames.keys.toList().indexOf(language)],
    '2643743' => [
      'London',
      '伦敦',
      '倫敦',
      '런던',
    ][languageNames.keys.toList().indexOf(language)],
    '1850147' => [
      'Tokyo',
      '东京',
      '東京',
      '도쿄',
    ][languageNames.keys.toList().indexOf(language)],
    '5128581' => [
      'New York',
      '纽约',
      '紐約',
      '뉴욕',
    ][languageNames.keys.toList().indexOf(language)],
    _ => name,
  };
  String condition(int? code) => call(switch (code ?? -1) {
    0 => 'clear',
    1 || 2 => 'partial',
    3 => 'cloud',
    45 || 48 => 'fog',
    >= 51 && <= 57 => 'drizzle',
    >= 61 && <= 67 || >= 80 && <= 82 => 'wet',
    >= 71 && <= 77 || 85 || 86 => 'snow',
    >= 95 && <= 99 => 'thunder',
    _ => 'unknown',
  });
}
