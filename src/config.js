/**
 * ============================================================================
 * PLAY & WIN — CENTRALISED CONFIGURATION (SINGLE SOURCE OF TRUTH)
 * ============================================================================
 * Edit this file to customise the app for future events.
 * Both the mobile web-app (Vite) and the local backend (server.js) import it.
 *
 * What you can change here:
 *  - Event branding & copy (including English, Chinese, Malay, and Tamil)
 *  - Pass mark (e.g. 0.8 = 80% of maximum score)
 *  - Fun-Fact Quiz questions (any number of questions, any number of options)
 *  - Forest Canopy Memory Match limits (time limit, pair count, points per pair)
 *  - Staff / Admin 4-digit PIN (also overridable via STAFF_PIN env var)
 * ============================================================================
 */

export const config = {
  // --------------------------------------------------------------------------
  // 1. EVENT BRANDING (English defaults — edit here to rename for new events)
  // --------------------------------------------------------------------------
  event: {
    clientName: 'Harbour Point Community Club',
    eventName: 'FunFest @ Downtown West',
    appTitle: 'Play & Win',
    tagline: 'Play a quick game, score 80% or more, and claim a fun prize!',
    version: 'v1.0',
    translations: {
      zh: {
        clientName: '海港湾民众俱乐部',
        eventName: '西区欢乐嘉年华 FunFest',
        appTitle: '趣味赢好礼',
        tagline: '玩个小游戏，达到及格分数即可兑换精美奖品！',
      },
      ms: {
        clientName: 'Kelab Masyarakat Harbour Point',
        eventName: 'FunFest @ Downtown West',
        appTitle: 'Main & Menang',
        tagline: 'Main permainan ringkas, capai markah lulus dan tebus hadiah!',
      },
      ta: {
        clientName: 'ஹார்பர் பாயிண்ட் சமூக மன்றம்',
        eventName: 'FunFest @ டவுன்டவுன் வெஸ்ட்',
        appTitle: 'விளையாடி வெல்லுங்கள்',
        tagline: 'சிறிய விளையாட்டை விளையாடி, தேர்ச்சி மதிப்பெண் பெற்று பரிசு வெல்லுங்கள்!',
      },
    },
  },

  // --------------------------------------------------------------------------
  // 2. LANGUAGES (Singapore's 4 official languages)
  // --------------------------------------------------------------------------
  languages: {
    defaultLanguage: 'en',
    supported: [
      { code: 'en', label: 'EN', nativeName: 'English', htmlLang: 'en' },
      { code: 'zh', label: '中文', nativeName: '华语', htmlLang: 'zh-SG' },
      { code: 'ms', label: 'BM', nativeName: 'Bahasa Melayu', htmlLang: 'ms' },
      { code: 'ta', label: 'தமிழ்', nativeName: 'தமிழ்', htmlLang: 'ta' },
    ],
  },

  // --------------------------------------------------------------------------
  // 3. SCORING & PRIZE RULES
  // --------------------------------------------------------------------------
  rules: {
    // Players win when (score / maxScore) >= passMark. Default: 0.8 (80%).
    passMark: 0.8,
    // Limit to 1 prize per phone/device (with Staff PIN override for shared family phones).
    // Set to false if families should freely replay for new prizes without staff unlock.
    onePrizePerDevice: true,
    // Nature-themed prefixes for 4–6 char booth claim codes (e.g. OAK-42).
    claimCodePrefixes: ['OAK', 'FERN', 'PINE', 'OWL', 'MOSS', 'LEAF'],
  },

  // --------------------------------------------------------------------------
  // 4. GAME 1: FUN-FACT QUIZ
  // --------------------------------------------------------------------------
  quiz: {
    id: 'quiz',
    pointsPerCorrect: 1,
    // Set to a number (e.g. 5) to draw a random subset per round from a larger bank,
    // or null to play all questions in the bank.
    questionLimit: null,
    // Shuffle the full question bank each round (prioritising unseen questions on retries).
    shuffleQuestions: true,
    // Shuffle the answer options for every question while preserving the correct answer.
    shuffleOptions: true,
    // Questions can have ANY number of options. `answerIndex` starts from 0.
    // `translations` is optional — any new question without it works in all languages!
    questions: [
      {
        id: 1,
        question: 'Which of these is a fruit?',
        options: ['Carrot', 'Tomato'],
        answerIndex: 1,
        translations: {
          zh: { question: '以下哪一种是水果？', options: ['胡萝卜', '番茄'] },
          ms: { question: 'Manakah antara berikut ialah buah?', options: ['Lobak merah', 'Tomato'] },
          ta: { question: 'இவற்றில் எது பழம்?', options: ['கேரட்', 'தக்காளி'] },
        },
      },
      {
        id: 2,
        question: 'How many legs does a spider have?',
        options: ['6', '8', '10'],
        answerIndex: 1,
        translations: {
          zh: { question: '蜘蛛有几条腿？', options: ['6', '8', '10'] },
          ms: { question: 'Berapakah bilangan kaki labah-labah?', options: ['6', '8', '10'] },
          ta: { question: 'சிலந்திக்கு எத்தனை கால்கள் உள்ளன?', options: ['6', '8', '10'] },
        },
      },
      {
        id: 3,
        question: 'Which planet is closest to the Sun?',
        options: ['Venus', 'Mercury'],
        answerIndex: 1,
        translations: {
          zh: { question: '哪一颗行星离太阳最近？', options: ['金星', '水星'] },
          ms: { question: 'Planet manakah yang paling dekat dengan Matahari?', options: ['Zuhrah', 'Utarid'] },
          ta: { question: 'சூரியனுக்கு மிக அருகில் உள்ள கோள் எது?', options: ['வெள்ளி', 'புதன்'] },
        },
      },
      {
        id: 4,
        question: 'What do bees make?',
        options: ['Milk', 'Silk', 'Honey', 'Paper'],
        answerIndex: 2,
        translations: {
          zh: { question: '蜜蜂会酿造什么？', options: ['牛奶', '丝绸', '蜂蜜', '纸张'] },
          ms: { question: 'Apakah yang dihasilkan oleh lebah?', options: ['Susu', 'Sutera', 'Madu', 'Kertas'] },
          ta: { question: 'தேனீக்கள் எதை உருவாக்குகின்றன?', options: ['பால்', 'பட்டு', 'தேன்', 'காகிதம்'] },
        },
      },
      {
        id: 5,
        question: 'Which colour do you get when you mix blue and yellow?',
        options: ['Green', 'Purple'],
        answerIndex: 0,
        translations: {
          zh: { question: '蓝色和黄色混合会变成什么颜色？', options: ['绿色', '紫色'] },
          ms: { question: 'Warna apakah yang terhasil apabila biru dan kuning dicampurkan?', options: ['Hijau', 'Ungu'] },
          ta: { question: 'நீலமும் மஞ்சளும் கலந்தால் என்ன நிறம் கிடைக்கும்?', options: ['பச்சை', 'ஊதா'] },
        },
      },
      {
        id: 6,
        question: 'Which animal is the largest?',
        options: ['Elephant', 'Blue whale', 'Giraffe'],
        answerIndex: 1,
        translations: {
          zh: { question: '哪种动物体型最大？', options: ['大象', '蓝鲸', '长颈鹿'] },
          ms: { question: 'Haiwan manakah yang paling besar?', options: ['Gajah', 'Paus biru', 'Zirafah'] },
          ta: { question: 'இவற்றில் மிகப் பெரிய விலங்கு எது?', options: ['யானை', 'நீலத் திமிங்கலம்', 'ஒட்டகச்சிவிங்கி'] },
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 5. GAME 2: FOREST CANOPY MEMORY MATCH (Under 1 min, Fixed Max Score)
  // --------------------------------------------------------------------------
  memory: {
    id: 'memory',
    // Must stay under 60 seconds per brief. Default: 45s.
    timeLimitSeconds: 45,
    // Number of pairs on the board (2 to 8 supported automatically). Default: 6 (3x4 = 12 cards).
    pairCount: 6,
    // Points awarded per matched pair. Fixed max score = pairCount * pointsPerPair (600).
    pointsPerPair: 100,
    // How long mismatched cards stay visible before flipping back (ms).
    mismatchDelayMs: 750,
    // Built-in forest card symbols (8 available so pairCount can scale up to 8).
    symbols: [
      {
        id: 'acorn',
        tint: '#fef3c7',
        labels: { en: 'Acorn', zh: '橡果', ms: 'Buah Ek', ta: 'ஓக் கொட்டை' },
      },
      {
        id: 'fox',
        tint: '#ffedd5',
        labels: { en: 'Fox', zh: '狐狸', ms: 'Musang', ta: 'நரி' },
      },
      {
        id: 'fern',
        tint: '#dcfce7',
        labels: { en: 'Fern', zh: '蕨叶', ms: 'Paku Pakis', ta: 'பன்னம்' },
      },
      {
        id: 'mushroom',
        tint: '#ffe4e6',
        labels: { en: 'Mushroom', zh: '蘑菇', ms: 'Cendawan', ta: 'காளான்' },
      },
      {
        id: 'owl',
        tint: '#e0e7ff',
        labels: { en: 'Owl', zh: '猫头鹰', ms: 'Burung Hantu', ta: 'ஆந்தை' },
      },
      {
        id: 'pinecone',
        tint: '#f3e8ff',
        labels: { en: 'Pinecone', zh: '松果', ms: 'Kon Pain', ta: 'பூங்கூம்பு' },
      },
      {
        id: 'butterfly',
        tint: '#e0f2fe',
        labels: { en: 'Butterfly', zh: '蝴蝶', ms: 'Rama-rama', ta: 'பட்டாம்பூச்சி' },
      },
      {
        id: 'leaf',
        tint: '#ecfccb',
        labels: { en: 'Leaf', zh: '树叶', ms: 'Daun', ta: 'இலை' },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 6. ADMIN & STAFF SETTINGS
  // --------------------------------------------------------------------------
  admin: {
    // 4-digit staff PIN for Admin Dashboard & Prize Redemption.
    // Can also be overridden with the STAFF_PIN environment variable.
    staffPin: '1234',
    // Auto-refresh interval on Admin Dashboard in milliseconds.
    autoRefreshMs: 10000,
  },

  // --------------------------------------------------------------------------
  // 7. LOCALIZED UI COPY (Falls back to `en` if a key is missing)
  // --------------------------------------------------------------------------
  copy: {
    en: {
      // Landing
      step1Title: 'Pick a Game',
      step1Desc: 'Quiz or Memory Match',
      step2Title: 'Score {passPercent}%+',
      step2Desc: 'Beat the target score',
      step3Title: 'Win a Prize',
      step3Desc: 'Show staff your code',
      startButton: 'Start Playing',
      familyNote: 'Fun for kids, parents & grandparents!',
      tapCritterHint: 'Tap a forest friend to say hi!',
      critterFoxMsg: 'Hi! Ready to match forest pairs in {seconds} seconds?',
      critterOwlMsg: 'Hoo-hoo! Can you ace our Fun-Fact Quiz?',
      critterButterflyMsg: 'Score {passPercent}% or more to unlock a real prize!',
      livePlayersCount: '{count} players joined FunFest today!',
      livePlayersFirst: 'Be the first to play at FunFest today!',

      // Game Select
      selectHeading: 'Choose Your Game',
      selectSubheading: 'Score at least {passPercent}% to win a prize!',
      quizTitle: 'Fun-Fact Quiz',
      quizDesc: '{count} multiple-choice questions. Get {needed} out of {maxScore} to win!',
      quizTag: '{count} Questions • Untimed',
      memoryTitle: 'Forest Canopy Memory',
      memoryDesc: 'Match {pairs} forest pairs in {seconds}s. Score {needed} / {maxScore} to win!',
      memoryTag: '{seconds}s • {pairs} Pairs',
      playNow: 'Play',
      backHome: 'Back',

      // Quiz
      questionProgress: 'Question {current} of {total}',
      scoreLabel: 'Score',
      targetLabel: 'Win: {needed}+',
      correctFeedback: 'Spot on! +1 point',
      wrongFeedback: 'Nice try! Correct answer: {answer}',
      nextQuestion: 'Next Question',
      seeResult: 'See My Score',

      // Memory Match
      memoryHint: 'Tap two cards to find matching forest pairs!',
      timeLeft: 'Time',
      pairsLabel: 'Pairs',
      forestMasterBanner: 'Forest Master! All pairs cleared!',
      timesUpBanner: "Time's up!",

      // Loss / Retry Screen
      lossBadge: 'Almost There!',
      lossTitle: 'Good Effort!',
      lossSummary: 'You scored {score} out of {maxScore} ({percent}%).',
      lossNeeded: 'You need {needed} points ({passPercent}%) to win a prize. Give it another go!',
      tryAgainBtn: 'Try Again',
      switchGameBtn: 'Pick Another Game',

      // Final Prize Screen
      winBadge: 'Winner!',
      winTitle: 'Congratulations!',
      winSubtitle: 'You scored {score} / {maxScore} ({percent}%) in {gameName}!',
      claimCodeLabel: 'Your Prize Claim Code',
      prizeInstructions: 'Show this screen to our staff at the Prize Booth to collect your prize.',
      onePrizeNote: 'One prize per win • Valid for this session',
      staffRedeemBtn: 'Staff: Tap to Redeem Prize',
      prizeClaimedStamp: 'PRIZE CLAIMED',
      claimedAtText: 'Redeemed at {time}',
      claimedThankYou: 'Thank you for playing at FunFest! Hand the phone to the next family member to play.',
      nextPlayerBtn: 'Play Again (Next Player)',

      // Staff Redeem Modal
      redeemModalTitle: 'Staff Prize Verification',
      redeemModalSubtitle: 'Enter the 4-digit staff PIN to mark {code} as redeemed.',
      redeemPinPlaceholder: '4-digit PIN',
      redeemConfirmBtn: 'Confirm Redemption',
      redeemCancelBtn: 'Cancel',
      redeemWrongPin: 'Incorrect staff PIN. Please try again.',
      redeemAlreadyClaimed: 'This code was already claimed!',
      redeemDeviceBlocked: 'This phone has already claimed its prize.',
      redeemError: 'Could not reach server. Please check Wi-Fi and try again.',

      // Device Lock, Play-for-Fun & Staff Family-Pass Override
      deviceClaimedBanner: 'Prize already claimed on this phone ({code}). You can still play for fun!',
      playForFunBtn: 'Play for Fun',
      funModeBadge: 'Great Score!',
      funModeNotice: 'A prize was already claimed on this phone ({code}). Thanks for playing for fun!',
      funModePlayAgainBtn: 'Play Again (For Fun)',
      staffUnlockFamilyBtn: 'Staff: Unlock for Next Family Member',
      staffUnlockTitle: 'Staff Family-Pass Unlock',
      staffUnlockSubtitle: 'Enter the 4-digit staff PIN to allow one more prize on this shared phone.',
      staffUnlockConfirmBtn: 'Unlock Phone',
      repeatIpWarning:
        'Staff alert: {count} prize(s) already claimed from this phone/network IP today (possible Private/Incognito replay or shared phone).',
    },

    zh: {
      step1Title: '选择游戏',
      step1Desc: '趣味问答或记忆配对',
      step2Title: '达到 {passPercent}%',
      step2Desc: '突破目标分数',
      step3Title: '赢取奖品',
      step3Desc: '出示领奖码兑换',
      startButton: '开始游戏',
      familyNote: '老少皆宜，全家一起玩！',
      tapCritterHint: '点一点森林小伙伴打个招呼吧！',
      critterFoxMsg: '嗨！准备好在 {seconds} 秒内配对森林卡牌了吗？',
      critterOwlMsg: '咕咕！快来挑战趣味知识问答吧！',
      critterButterflyMsg: '得分达到 {passPercent}% 就能兑换精美奖品哦！',
      livePlayersCount: '今天已有 {count} 位居民参与活动！',
      livePlayersFirst: '快来成为今天第一位挑战者吧！',

      selectHeading: '选择一款游戏',
      selectSubheading: '得分达到 {passPercent}% 即可赢取奖品！',
      quizTitle: '趣味知识问答',
      quizDesc: '共 {count} 道选择题，答对 {needed} / {maxScore} 分即可获奖！',
      quizTag: '{count} 道题 • 不限时',
      memoryTitle: '森林记忆配对',
      memoryDesc: '{seconds} 秒内配对 {pairs} 组森林卡牌，得 {needed} / {maxScore} 分即获胜！',
      memoryTag: '{seconds}秒 • {pairs} 组配对',
      playNow: '开始玩',
      backHome: '返回',

      questionProgress: '第 {current} 题 / 共 {total} 题',
      scoreLabel: '得分',
      targetLabel: '过关：{needed}+',
      correctFeedback: '答对了！+1 分',
      wrongFeedback: '加油！正确答案：{answer}',
      nextQuestion: '下一题',
      seeResult: '查看成绩',

      memoryHint: '翻开两张卡牌，找出相同的森林图案！',
      timeLeft: '时间',
      pairsLabel: '配对',
      forestMasterBanner: '森林大师！全部配对完成！',
      timesUpBanner: '时间到！',

      lossBadge: '差一点点！',
      lossTitle: '表现很棒！',
      lossSummary: '您获得了 {score} / {maxScore} 分（{percent}%）。',
      lossNeeded: '需要达到 {needed} 分（{passPercent}%）才能赢奖，再试一次吧！',
      tryAgainBtn: '再试一次',
      switchGameBtn: '换个游戏玩',

      winBadge: '恭喜获奖！',
      winTitle: '太棒了！',
      winSubtitle: '您在「{gameName}」中获得 {score} / {maxScore} 分（{percent}%）！',
      claimCodeLabel: '您的领奖码',
      prizeInstructions: '请向奖品柜台的工作人员出示此页面，即可领取奖品。',
      onePrizeNote: '每次获胜限领一份奖品',
      staffRedeemBtn: '工作人员：点击核销奖品',
      prizeClaimedStamp: '奖品已领取',
      claimedAtText: '领取时间：{time}',
      claimedThankYou: '感谢参与！可以将手机交给下一位家人继续体验。',
      nextPlayerBtn: '下一位玩家开始',

      redeemModalTitle: '工作人员核销验证',
      redeemModalSubtitle: '请输入 4 位工作人员密码以核销 {code}。',
      redeemPinPlaceholder: '4位密码',
      redeemConfirmBtn: '确认核销',
      redeemCancelBtn: '取消',
      redeemWrongPin: '工作人员密码错误，请重试。',
      redeemAlreadyClaimed: '此领奖码已被领取！',
      redeemDeviceBlocked: '此手机已领取过奖品。',
      redeemError: '无法连接服务器，请检查网络。',

      deviceClaimedBanner: '此手机已领取奖品（{code}），仍可继续免费体验游戏！',
      playForFunBtn: '继续免费玩',
      funModeBadge: '高分达人！',
      funModeNotice: '此手机已领取过奖品（{code}），感谢您的参与！',
      funModePlayAgainBtn: '再玩一次（体验模式）',
      staffUnlockFamilyBtn: '工作人员：为下一位家人解锁',
      staffUnlockTitle: '工作人员家庭解锁',
      staffUnlockSubtitle: '输入 4 位工作人员密码，允许共用此手机的下一位家人赢取奖品。',
      staffUnlockConfirmBtn: '确认解锁',
      repeatIpWarning: '工作人员提示：同一网络 IP 今日已领取 {count} 份奖品（可能为无痕模式或共用手机）。',
    },

    ms: {
      step1Title: 'Pilih Permainan',
      step1Desc: 'Kuiz atau Padanan Memori',
      step2Title: 'Capai {passPercent}%+',
      step2Desc: 'Lepasi markah sasaran',
      step3Title: 'Tebus Hadiah',
      step3Desc: 'Tunjuk kod kepada staf',
      startButton: 'Mula Bermain',
      familyNote: 'Seronok untuk kanak-kanak, ibu bapa & datuk nenek!',
      tapCritterHint: 'Ketik rakan rimba untuk menyapa!',
      critterFoxMsg: 'Hai! Sedia padankan pasangan rimba dalam {seconds} saat?',
      critterOwlMsg: 'Huu-huu! Jom uji minda dengan Kuiz Fakta Menarik!',
      critterButterflyMsg: 'Capai {passPercent}% ke atas untuk menebus hadiah!',
      livePlayersCount: '{count} pemain telah menyertai FunFest hari ini!',
      livePlayersFirst: 'Jadilah pemain pertama FunFest hari ini!',

      selectHeading: 'Pilih Permainan Anda',
      selectSubheading: 'Capai sekurang-kurangnya {passPercent}% untuk menang hadiah!',
      quizTitle: 'Kuiz Fakta Menarik',
      quizDesc: '{count} soalan pilihan berganda. Capai {needed} daripada {maxScore} untuk menang!',
      quizTag: '{count} Soalan • Tiada Had Masa',
      memoryTitle: 'Memori Rimba',
      memoryDesc: 'Padankan {pairs} pasangan dalam {seconds}s. Capai {needed} / {maxScore} untuk menang!',
      memoryTag: '{seconds}s • {pairs} Pasangan',
      playNow: 'Main',
      backHome: 'Kembali',

      questionProgress: 'Soalan {current} daripada {total}',
      scoreLabel: 'Markah',
      targetLabel: 'Menang: {needed}+',
      correctFeedback: 'Tepat sekali! +1 mata',
      wrongFeedback: 'Cuba bagus! Jawapan betul: {answer}',
      nextQuestion: 'Soalan Seterusnya',
      seeResult: 'Lihat Markah',

      memoryHint: 'Ketik dua kad untuk mencari pasangan rimba yang sama!',
      timeLeft: 'Masa',
      pairsLabel: 'Pasangan',
      forestMasterBanner: 'Juara Rimba! Semua pasangan berjaya dipadankan!',
      timesUpBanner: 'Masa tamat!',

      lossBadge: 'Hampir Berjaya!',
      lossTitle: 'Usaha Yang Baik!',
      lossSummary: 'Markah anda {score} daripada {maxScore} ({percent}%).',
      lossNeeded: 'Anda perlukan {needed} mata ({passPercent}%) untuk menang. Cuba lagi!',
      tryAgainBtn: 'Cuba Lagi',
      switchGameBtn: 'Pilih Permainan Lain',

      winBadge: 'Pemenang!',
      winTitle: 'Tahniah!',
      winSubtitle: 'Anda mendapat {score} / {maxScore} ({percent}%) dalam {gameName}!',
      claimCodeLabel: 'Kod Tuntutan Hadiah Anda',
      prizeInstructions: 'Tunjukkan skrin ini kepada staf di Kaunter Hadiah untuk menebus hadiah anda.',
      onePrizeNote: 'Satu hadiah bagi setiap kemenangan',
      staffRedeemBtn: 'Staf: Ketik untuk Tebus Hadiah',
      prizeClaimedStamp: 'HADIAH DITEBUS',
      claimedAtText: 'Ditebus pada {time}',
      claimedThankYou: 'Terima kasih kerana bermain! Berikan telefon kepada ahli keluarga seterusnya.',
      nextPlayerBtn: 'Main Semula (Pemain Seterusnya)',

      redeemModalTitle: 'Pengesahan Hadiah Staf',
      redeemModalSubtitle: 'Masukkan PIN staf 4 digit untuk menebus {code}.',
      redeemPinPlaceholder: 'PIN 4 digit',
      redeemConfirmBtn: 'Sahkan Penebusan',
      redeemCancelBtn: 'Batal',
      redeemWrongPin: 'PIN staf salah. Sila cuba lagi.',
      redeemAlreadyClaimed: 'Kod ini sudah ditebus!',
      redeemDeviceBlocked: 'Telefon ini telah pun menebus hadiahnya.',
      redeemError: 'Tidak dapat menghubungi pelayan. Sila semak sambungan.',

      deviceClaimedBanner: 'Hadiah telah ditebus di telefon ini ({code}). Anda masih boleh bermain untuk suka-suka!',
      playForFunBtn: 'Main Suka-Suka',
      funModeBadge: 'Markah Hebat!',
      funModeNotice: 'Hadiah telah ditebus di telefon ini ({code}). Terima kasih kerana bermain!',
      funModePlayAgainBtn: 'Main Semula (Suka-Suka)',
      staffUnlockFamilyBtn: 'Staf: Buka Kunci untuk Ahli Keluarga Seterusnya',
      staffUnlockTitle: 'Buka Kunci Kongsi Keluarga (Staf)',
      staffUnlockSubtitle: 'Masukkan PIN staf 4 digit untuk membenarkan satu lagi hadiah di telefon ini.',
      staffUnlockConfirmBtn: 'Buka Kunci',
      repeatIpWarning: 'Amaran Staf: {count} hadiah telah ditebus dari IP rangkaian ini hari ini (mungkin mod Incognito atau telefon kongsi).',
    },

    ta: {
      step1Title: 'விளையாட்டைத் தேர்வு செய்',
      step1Desc: 'வினாடி வினா அல்லது நினைவாற்றல்',
      step2Title: '{passPercent}%+ பெறுங்கள்',
      step2Desc: 'இலக்கு மதிப்பெண்ணை அடையுங்கள்',
      step3Title: 'பரிசு வெல்லுங்கள்',
      step3Desc: 'ஊழியரிடம் குறியீட்டைக் காட்டுங்கள்',
      startButton: 'விளையாடத் தொடங்கு',
      familyNote: 'குழந்தைகள் முதல் தாத்தா பாட்டி வரை அனைவருக்கும்!',
      tapCritterHint: 'காட்டு நண்பர்களைத் தொட்டுப் பாருங்கள்!',
      critterFoxMsg: 'வணக்கம்! {seconds} வினாடிகளில் ஜோடிகளைப் பொருத்தத் தயாரா?',
      critterOwlMsg: 'சுவாரசிய வினாடி வினாவில் வெற்றி பெறத் தயாரா?',
      critterButterflyMsg: '{passPercent}%+ மதிப்பெண் பெற்று பரிசு வெல்லுங்கள்!',
      livePlayersCount: 'இன்று {count} பேர் FunFest-ல் விளையாடியுள்ளனர்!',
      livePlayersFirst: 'இன்று முதலில் விளையாடுபவராக இருங்கள்!',

      selectHeading: 'விளையாட்டைத் தேர்ந்தெடுங்கள்',
      selectSubheading: 'பரிசு வெல்ல குறைந்தது {passPercent}% மதிப்பெண் பெறுங்கள்!',
      quizTitle: 'சுவாரசிய வினாடி வினா',
      quizDesc: '{count} கேள்விகள். வெல்ல {maxScore}-க்கு {needed} மதிப்பெண் பெறுங்கள்!',
      quizTag: '{count} கேள்விகள் • நேர வரம்பில்லை',
      memoryTitle: 'காட்டு நினைவாற்றல் விளையாட்டு',
      memoryDesc: '{seconds} வினாடிகளில் {pairs} ஜோடிகளைப் பொருத்துங்கள். வெல்ல {needed} / {maxScore} தேவை!',
      memoryTag: '{seconds}வி • {pairs} ஜோடிகள்',
      playNow: 'விளையாடு',
      backHome: 'பின்செல்',

      questionProgress: 'கேள்வி {current} / {total}',
      scoreLabel: 'மதிப்பெண்',
      targetLabel: 'வெற்றி: {needed}+',
      correctFeedback: 'சரியான பதில்! +1 புள்ளி',
      wrongFeedback: 'நல்ல முயற்சி! சரியான பதில்: {answer}',
      nextQuestion: 'அடுத்த கேள்வி',
      seeResult: 'மதிப்பெண்ணைப் பார்',

      memoryHint: 'ஒரே மாதிரியான காட்டு அட்டைகளைத் திறந்து பொருத்துங்கள்!',
      timeLeft: 'நேரம்',
      pairsLabel: 'ஜோடிகள்',
      forestMasterBanner: 'காட்டின் சாதனையாளர்! அனைத்து ஜோடிகளும் பொருந்தின!',
      timesUpBanner: 'நேரம் முடிந்தது!',

      lossBadge: 'மிக அருகில்!',
      lossTitle: 'நல்ல முயற்சி!',
      lossSummary: 'உங்கள் மதிப்பெண் {score} / {maxScore} ({percent}%).',
      lossNeeded: 'பரிசு வெல்ல {needed} புள்ளிகள் ({passPercent}%) தேவை. மீண்டும் முயற்சிக்கவும்!',
      tryAgainBtn: 'மீண்டும் முயற்சி செய்',
      switchGameBtn: 'வேறு விளையாட்டு தேர்வு செய்',

      winBadge: 'வெற்றியாளர்!',
      winTitle: 'வாழ்த்துகள்!',
      winSubtitle: '{gameName} விளையாட்டில் {score} / {maxScore} ({percent}%) பெற்றீர்கள்!',
      claimCodeLabel: 'உங்கள் பரிசு குறியீடு',
      prizeInstructions: 'பரிசு பெற இந்தத் திரையை பரிசுக் கூடத்தில் உள்ள ஊழியரிடம் காட்டுங்கள்.',
      onePrizeNote: 'ஒரு வெற்றிக்கு ஒரு பரிசு',
      staffRedeemBtn: 'ஊழியர்: பரிசை வழங்க தட்டவும்',
      prizeClaimedStamp: 'பரிசு வழங்கப்பட்டது',
      claimedAtText: 'வழங்கப்பட்ட நேரம்: {time}',
      claimedThankYou: 'விளையாடியதற்கு நன்றி! அடுத்த குடும்ப உறுப்பினர் விளையாடலாம்.',
      nextPlayerBtn: 'மீண்டும் விளையாடு (அடுத்தவர்)',

      redeemModalTitle: 'ஊழியர் பரிசு சரிபார்ப்பு',
      redeemModalSubtitle: '{code} குறியீட்டை வழங்க 4 இலக்க ஊழியர் PIN-ஐ உள்ளிடவும்.',
      redeemPinPlaceholder: '4 இலக்க PIN',
      redeemConfirmBtn: 'உறுதிப்படுத்து',
      redeemCancelBtn: 'ரத்து செய்',
      redeemWrongPin: 'தவறான PIN. மீண்டும் முயற்சிக்கவும்.',
      redeemAlreadyClaimed: 'இந்தக் குறியீடு ஏற்கனவே பயன்படுத்தப்பட்டது!',
      redeemDeviceBlocked: 'இந்தத் தொலைபேசியில் பரிசு ஏற்கனவே வழங்கப்பட்டுவிட்டது.',
      redeemError: 'சர்வருடன் இணைக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',

      deviceClaimedBanner: 'இந்தத் தொலைபேசியில் பரிசு ஏற்கனவே பெறப்பட்டது ({code}). மகிழ்ச்சிக்காக மீண்டும் விளையாடலாம்!',
      playForFunBtn: 'மகிழ்ச்சிக்காக விளையாடு',
      funModeBadge: 'சிறந்த மதிப்பெண்!',
      funModeNotice: 'இந்தத் தொலைபேசியில் பரிசு ஏற்கனவே பெறப்பட்டது ({code}). விளையாடியதற்கு நன்றி!',
      funModePlayAgainBtn: 'மீண்டும் விளையாடு (பயிற்சி)',
      staffUnlockFamilyBtn: 'ஊழியர்: அடுத்த குடும்ப உறுப்பினருக்குத் திற',
      staffUnlockTitle: 'குடும்பப் பகிர்வுத் திறப்பு (ஊழியர்)',
      staffUnlockSubtitle: 'இந்தத் தொலைபேசியில் மேலும் ஒரு பரிசை அனுமதிக்க 4 இலக்க ஊழியர் PIN-ஐ உள்ளிடவும்.',
      staffUnlockConfirmBtn: 'திறக்கவும்',
      repeatIpWarning: 'ஊழியர் எச்சரிக்கை: இதே IP முகவரியிலிருந்து இன்று ஏற்கனவே {count} பரிசு(கள்) வழங்கப்பட்டுள்ளன.',
    },
  },
}

export default config
