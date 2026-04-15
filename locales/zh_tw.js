module.exports = {
    // ─── Common ───────────────────────────────────────────────────────────────
    not_bound_title: '❌ 尚未綁定',
    not_bound_desc: '您尚未綁定帳號，請先使用 `/bind` 指令進行綁定。',
    not_bound_short: '尚未綁定帳號，請先使用 `/bind`。',
    not_bound_bare: '尚未綁定帳號。',
    query_failed_title: '❌ 查詢失敗',
    error_title: '❌ 發生錯誤',
    error_query: '查詢時發生錯誤，請稍後再試。',
    db_error: '資料庫發生錯誤，請稍後再試。',
    bot_name: '終末地簽到小助手',

    // ─── help ─────────────────────────────────────────────────────────────────
    help_title: '📖 指令列表',
    help_desc: '以下是目前所有可用的指令：',
    help_general: '🔧 一般',
    help_general_help: '`/help` 顯示本說明',
    help_general_invite: '`/invite` 取得機器人邀請連結',
    help_general_language: '`/language` 設定機器人語言',
    help_attendance: '📅 簽到',
    help_attendance_bind: '`/bind` 綁定 Endfield 帳號',
    help_attendance_unbind: '`/unbind` 解除綁定',
    help_attendance_signin: '`/signin` 立即執行一次簽到',
    help_attendance_schedule: '`/schedule` 設定每日自動簽到時間',
    help_game: '🎮 遊戲資訊',
    help_game_profile: '`/profile` 查詢玩家個人資料（等級、理智、BP 等）',
    help_game_explore: '`/explore` 查詢各區域探索進度（寶箱、謎題、暗箱等）',
    help_game_achieve: '`/achieve` 查詢光榮之路成就展示',
    help_game_operators: '`/operators` 查詢幹員列表',
    help_game_stamina: '`/stamina-notify` 設定理智快滿提醒',
    help_admin: '⚙️ 管理',
    help_admin_notify: '`/set-notify-channel` 設定伺服器通知頻道（限管理員）',
    help_footer: '如有問題請聯絡伺服器管理員',

    // ─── invite ───────────────────────────────────────────────────────────────
    invite_title: '🔗 邀請機器人',
    invite_desc: (url) => `點擊下方連結將機器人加入你的伺服器或安裝為個人應用程式！\n\n[➕ 點我邀請](${url})`,

    // ─── set-notify-channel ───────────────────────────────────────────────────
    notify_success_title: '✅ 設定成功',
    notify_success_desc: (channel) => `已將自動簽到通知頻道設定為 ${channel}。`,
    notify_fail_title: '❌ 設定失敗',

    // ─── language ─────────────────────────────────────────────────────────────
    language_set_title: '✅ 語言已設定',
    language_set_desc: (lang) => `已將語言設定為 **${lang}**。`,
    language_fail_title: '❌ 設定失敗',
    language_not_bound: '您尚未綁定帳號，請先使用 `/bind` 指令進行綁定後再設定語言。',

    // ─── profile ──────────────────────────────────────────────────────────────
    profile_title: (name) => `👤 ${name} 的玩家資料`,
    profile_server: '🌐 伺服器',
    profile_level: '📊 權限等階',
    profile_world_level: '🌍 探索等級',
    profile_char: '👥 幹員',
    profile_weapon: '⚔️ 武器',
    profile_doc: '📖 檔案',
    profile_stamina: '🔋 理智',
    profile_stamina_full_in: (h, m) => `回滿：${h > 0 ? `${h} 小時 ` : ''}${m} 分鐘後`,
    profile_stamina_full: '（已回滿）',
    profile_stamina_max: '（已滿）',
    profile_bp: '🏆 通行證',
    profile_daily: '📋 活躍度',
    profile_weekly: '📋 每周事務',
    profile_achieve: '🏅 光榮之路',
    profile_footer: (desc) => `主線進度：${desc ?? '—'}`,

    // ─── explore ──────────────────────────────────────────────────────────────
    explore_title: (name, level) => `🗺️ ${name}（等級 ${level}）`,
    explore_no_data: '目前無探索資料。',
    explore_no_data_title: '🗺️ 探索進度',
    explore_treasure: '儲藏箱',
    explore_blackbox: '協議採錄樁',
    explore_puzzle: '醚質',
    explore_piece: '維修靈感點',
    explore_equip: '裝備模板箱',
    explore_currency: (name) => `💰 ${name}調度卷`,

    // ─── achieve ──────────────────────────────────────────────────────────────
    achieve_title: (name) => `🏅 ${name} 的光榮之路`,
    achieve_no_data_title: '❌ 無成就資料',
    achieve_no_data_desc: '目前無光榮之路成就資料。',

    // ─── operators ────────────────────────────────────────────────────────────
    operators_title: (name) => `${name} 的幹員列表`,
    operators_no_data_title: '❌ 無幹員資料',
    operators_no_data_desc: '目前無幹員資料。',

    // ─── stamina-notify ───────────────────────────────────────────────────────
    stamina_title: '🔋 理智提醒設定',
    stamina_enabled: (threshold, isTag) =>
        `✅ 已開啟理智提醒。\n當理智達到最大值的 **${threshold}%** 時，將於通知頻道發送提醒。\n🔔 通知提及 (Tag): ${isTag ? '開啟' : '關閉'}\n\n⚠️ 前置需求：\n• 請先使用 \`/set-notify-channel\` 設定伺服器通知頻道。\n• 請先使用 \`/schedule\` 設定自動簽到，以確保通知範圍正確。`,
    stamina_disabled: '🔕 已關閉理智提醒。',
    stamina_fail_title: '❌ 設定失敗',

    // ─── bind ─────────────────────────────────────────────────────────────────
    bind_tutorial_title: 'Endfield 自動簽到綁定教學',
    bind_tutorial_desc: '請依照以下步驟獲取您的憑證並進行綁定：',
    bind_step1: '使用電腦瀏覽器開啟任意 [鷹角網站](https://www.skport.com) 並登入帳號。',
    bind_step2: '按下 `F12` 開啟開發者工具，切換至 `Console` 分頁。',
    bind_step3: '複製下方指令並貼上到 Console 中執行：',
    bind_step4: '執行後 Console 將顯示您的 `cred` 值，複製該值。',
    bind_step5: '點擊下方「輸入 Cred」按鈕貼上並送出，機器人會自動查詢可用角色供您選擇。',
    bind_footer: '注意：請勿將憑證洩漏給他人',
    bind_enter_btn: '輸入 Cred',
    bind_permission_title: '❌ 權限不足',
    bind_permission_desc: '只有指令使用者可以操作此按鈕。',
    bind_modal_title: '綁定帳號',
    bind_modal_label: '請輸入您的 Cred',
    bind_modal_placeholder: '貼上腳本輸出 cred 值',
    bind_input_error_title: '❌ 輸入錯誤',
    bind_input_error_desc: '無法解析 cred，請確認您複製了正確的內容。',
    bind_fetch_fail_desc: (msg) => `無法取得角色資訊：${msg}\n請確認您的 Cred 是否有效。`,
    bind_no_roles_title: '❌ 查無角色',
    bind_no_roles_desc: '未找到任何角色資料，請確認您已登入遊戲帳號。',
    bind_select_title: '🎮 選擇綁定角色',
    bind_select_desc: (count) => `找到 **${count}** 個角色，請從下方選單選擇要進行自動簽到的角色。`,
    bind_select_placeholder: '請選擇要綁定的角色...',
    bind_role_level: (level) => `等級: ${level}`,
    bind_expired_title: '❌ 操作逾時',
    bind_expired_desc: '綁定選擇已逾時，請重新執行 `/bind` 指令。',
    bind_invalid_title: '❌ 無效的選擇',
    bind_invalid_desc: '無法解析選取的角色資料，請重新執行 `/bind` 指令。',
    bind_invalid_server_desc: '無法解析伺服器 ID，請重新執行 `/bind` 指令。',
    bind_success_title: '✅ 綁定成功',
    bind_success_desc: (roleId, serverId) => `RoleID: \`${roleId}\`\nServer ID: \`${serverId}\`\n\n您可以繼續使用 \`/schedule\` 設定每日自動簽到時間。`,
    bind_fail_title: '❌ 綁定失敗',

    // ─── schedule ─────────────────────────────────────────────────────────────
    schedule_format_title: '❌ 格式錯誤',
    schedule_format_desc: '時間格式錯誤，請使用 HH:mm (例如 09:00 或 23:30)。',
    schedule_success_title: '✅ 設定成功',
    schedule_success_msg: (time) => `✅ 已設定每日自動簽到時間為：${time}`,
    schedule_guild_note: '\n📍 通知將發送至本伺服器 (若伺服器已設定通知頻道)。',
    schedule_dm_note: '\n⚠️ 注意：您是在私訊中使用指令，機器人可能無法正確發送通知到伺服器。建議在伺服器中使用此指令。',
    schedule_tag_note: (isTag) => `\n🔔 通知提及 (Tag): ${isTag ? '開啟' : '關閉'}`,
    schedule_fail_title: '❌ 設定失敗',
    schedule_fail_desc: '資料庫發生錯誤或排程失敗。',

    // ─── signin ───────────────────────────────────────────────────────────────
    signin_success: '✅ 簽到成功',
    signin_fail_title: '❌ 簽到失敗',

    // ─── unbind ───────────────────────────────────────────────────────────────
    unbind_success_title: '✅ 解除成功',
    unbind_success_desc: '已解除綁定並刪除您的資料。',
    unbind_fail_title: '❌ 解除失敗',
    unbind_fail_desc: '資料庫發生錯誤。',

    // ─── attendance embed ─────────────────────────────────────────────────────
    attendance_today: '🎁 今日獎勵',
    attendance_tomorrow: '📅 明日獎勵',
    attendance_success: '簽到成功！',
    attendance_already: '今日已簽到 (重複執行)',
    attendance_fail: (detail) => `簽到失敗: ${detail}`,
    attendance_error: (detail) => `發生錯誤: ${detail}`,
    attendance_api_error: (detail) => `API 回傳錯誤: ${detail}`,

    // ─── scheduler ────────────────────────────────────────────────────────────
    scheduler_auto_report: '📅 自動簽到報告',
    scheduler_stamina_title: '🔋 理智快滿提醒',
    scheduler_stamina_desc: (cur, max) => `您的理智已達 **${cur} / ${max}**，請記得消耗理智！`,

    // ─── html image render ────────────────────────────────────────────────────
    html_potential: '潛',
    html_evolve: '菁英化',
    html_achieve_total: '總收集數',
};
