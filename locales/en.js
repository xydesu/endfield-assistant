module.exports = {
    // ─── Common ───────────────────────────────────────────────────────────────
    not_bound_title: '❌ Not Bound',
    not_bound_desc: 'You have not bound your account yet. Please use `/bind` first.',
    not_bound_short: 'Account not bound. Please use `/bind` first.',
    not_bound_bare: 'Account not bound.',
    query_failed_title: '❌ Query Failed',
    error_title: '❌ Error',
    error_query: 'An error occurred during the query. Please try again later.',
    db_error: 'A database error occurred. Please try again later.',
    bot_name: 'Endfield Check-in Assistant',

    // ─── help ─────────────────────────────────────────────────────────────────
    help_title: '📖 Command List',
    help_desc: 'Here are all available commands:',
    help_general: '🔧 General',
    help_general_help: '`/help` Show this help message',
    help_general_invite: '`/invite` Get the bot invite link',
    help_general_language: '`/language` Set bot language',
    help_attendance: '📅 Attendance',
    help_attendance_bind: '`/bind` Bind your Endfield account',
    help_attendance_unbind: '`/unbind` Unbind your account',
    help_attendance_signin: '`/signin` Sign in manually',
    help_attendance_schedule: '`/schedule` Set daily auto sign-in time',
    help_game: '🎮 Game Info',
    help_game_profile: '`/profile` View player profile (level, stamina, BP, etc.)',
    help_game_explore: '`/explore` View exploration progress by area',
    help_game_achieve: '`/achieve` View Glory Road achievements',
    help_game_operators: '`/operators` View operator list',
    help_game_stamina: '`/stamina-notify` Set stamina reminder',
    help_admin: '⚙️ Admin',
    help_admin_notify: '`/set-notify-channel` Set notification channel (admin only)',
    help_footer: 'Contact server admin if you have any questions',

    // ─── invite ───────────────────────────────────────────────────────────────
    invite_title: '🔗 Invite Bot',
    invite_desc: (url) => `Click the link below to add the bot to your server or install as a user app!\n\n[➕ Invite Me](${url})`,

    // ─── set-notify-channel ───────────────────────────────────────────────────
    notify_success_title: '✅ Setup Successful',
    notify_success_desc: (channel) => `Notification channel has been set to ${channel}.`,
    notify_fail_title: '❌ Setup Failed',

    // ─── language ─────────────────────────────────────────────────────────────
    language_set_title: '✅ Language Set',
    language_set_desc: (lang) => `Language has been set to **${lang}**.`,
    language_fail_title: '❌ Setup Failed',
    language_not_bound: 'You have not bound your account yet. Please use `/bind` first, then set your language.',

    // ─── profile ──────────────────────────────────────────────────────────────
    profile_title: (name) => `👤 ${name}'s Profile`,
    profile_server: '🌐 Server',
    profile_level: '📊 Authority Level',
    profile_world_level: '🌍 Exploration Level',
    profile_char: '👥 Operators',
    profile_weapon: '⚔️ Weapons',
    profile_doc: '📖 Documents',
    profile_stamina: '🔋 Stamina',
    profile_stamina_full_in: (h, m) => `Full in: ${h > 0 ? `${h}h ` : ''}${m}m`,
    profile_stamina_full: '(Recovered)',
    profile_stamina_max: '(Full)',
    profile_bp: '🏆 Battle Pass',
    profile_daily: '📋 Daily Activity',
    profile_weekly: '📋 Weekly Missions',
    profile_achieve: '🏅 Glory Road',
    profile_footer: (desc) => `Main Story: ${desc ?? '—'}`,

    // ─── explore ──────────────────────────────────────────────────────────────
    explore_title: (name, level) => `🗺️ ${name} (Level ${level})`,
    explore_no_data: 'No exploration data available.',
    explore_no_data_title: '🗺️ Exploration Progress',
    explore_treasure: 'Treasure Chests',
    explore_blackbox: 'Black Boxes',
    explore_puzzle: 'Puzzles',
    explore_piece: 'Dimensional Shards',
    explore_equip: 'Equipment Chests',
    explore_currency: (name) => `💰 ${name} Currency`,

    // ─── achieve ──────────────────────────────────────────────────────────────
    achieve_title: (name) => `🏅 ${name}'s Glory Road`,
    achieve_no_data_title: '❌ No Achievement Data',
    achieve_no_data_desc: 'No Glory Road achievement data available.',

    // ─── operators ────────────────────────────────────────────────────────────
    operators_title: (name) => `${name}'s Operator List`,
    operators_no_data_title: '❌ No Operator Data',
    operators_no_data_desc: 'No operator data available.',

    // ─── stamina-notify ───────────────────────────────────────────────────────
    stamina_title: '🔋 Stamina Reminder Settings',
    stamina_enabled: (threshold, isTag) =>
        `✅ Stamina reminder enabled.\nYou will be notified when stamina reaches **${threshold}%** of max.\n🔔 Mention (Tag): ${isTag ? 'On' : 'Off'}\n\n⚠️ Prerequisites:\n• Use \`/set-notify-channel\` to set the notification channel.\n• Use \`/schedule\` to set up auto sign-in for correct notification scope.`,
    stamina_disabled: '🔕 Stamina reminder disabled.',
    stamina_fail_title: '❌ Setup Failed',

    // ─── bind ─────────────────────────────────────────────────────────────────
    bind_tutorial_title: 'Endfield Auto Sign-in Binding Guide',
    bind_tutorial_desc: 'Follow these steps to obtain your credentials and bind your account:',
    bind_step1: 'Open the [Hypergryph website](https://www.skport.com) in a desktop browser and log in.',
    bind_step2: 'Press `F12` to open Developer Tools and switch to the `Console` tab.',
    bind_step3: 'Copy and paste the following command into the Console:',
    bind_step4: 'After execution, the Console will display your `cred` value. Copy it.',
    bind_step5: 'Click the "Enter Cred" button below to paste and submit. The bot will automatically query available characters for you to choose.',
    bind_footer: 'Warning: Do not share your credentials with anyone',
    bind_enter_btn: 'Enter Cred',
    bind_permission_title: '❌ Permission Denied',
    bind_permission_desc: 'Only the command user can operate this button.',
    bind_modal_title: 'Bind Account',
    bind_modal_label: 'Enter your Cred',
    bind_modal_placeholder: 'Paste the cred value from the script output',
    bind_input_error_title: '❌ Input Error',
    bind_input_error_desc: 'Could not parse the cred. Please verify you copied the correct content.',
    bind_fetch_fail_desc: (msg) => `Could not fetch character info: ${msg}\nPlease verify your Cred is valid.`,
    bind_no_roles_title: '❌ No Characters Found',
    bind_no_roles_desc: 'No character data found. Please verify you are logged into the game account.',
    bind_select_title: '🎮 Select Character to Bind',
    bind_select_desc: (count) => `Found **${count}** character(s). Please select the character for auto sign-in from the menu below.`,
    bind_select_placeholder: 'Select a character to bind...',
    bind_role_level: (level) => `Level: ${level}`,
    bind_expired_title: '❌ Timed Out',
    bind_expired_desc: 'Selection timed out. Please run `/bind` again.',
    bind_invalid_title: '❌ Invalid Selection',
    bind_invalid_desc: 'Could not parse the selected character data. Please run `/bind` again.',
    bind_invalid_server_desc: 'Could not parse the server ID. Please run `/bind` again.',
    bind_success_title: '✅ Binding Successful',
    bind_success_desc: (roleId, serverId) => `RoleID: \`${roleId}\`\nServer ID: \`${serverId}\`\n\nYou can now use \`/schedule\` to set your daily auto sign-in time.`,
    bind_fail_title: '❌ Binding Failed',

    // ─── schedule ─────────────────────────────────────────────────────────────
    schedule_format_title: '❌ Format Error',
    schedule_format_desc: 'Invalid time format. Please use HH:mm (e.g. 09:00 or 23:30).',
    schedule_success_title: '✅ Setup Successful',
    schedule_success_msg: (time) => `✅ Daily auto sign-in time set to: ${time}`,
    schedule_guild_note: '\n📍 Notifications will be sent to this server (if a notification channel is set).',
    schedule_dm_note: '\n⚠️ Note: You are using this command in DMs. The bot may not be able to send notifications to a server. It is recommended to use this command in a server.',
    schedule_tag_note: (isTag) => `\n🔔 Mention (Tag): ${isTag ? 'On' : 'Off'}`,
    schedule_fail_title: '❌ Setup Failed',
    schedule_fail_desc: 'Database error or scheduling failed.',

    // ─── signin ───────────────────────────────────────────────────────────────
    signin_success: '✅ Sign-in Successful',
    signin_fail_title: '❌ Sign-in Failed',

    // ─── unbind ───────────────────────────────────────────────────────────────
    unbind_success_title: '✅ Unbound Successfully',
    unbind_success_desc: 'Your account has been unbound and data deleted.',
    unbind_fail_title: '❌ Unbind Failed',
    unbind_fail_desc: 'A database error occurred.',

    // ─── attendance embed ─────────────────────────────────────────────────────
    attendance_today: '🎁 Today\'s Rewards',
    attendance_tomorrow: '📅 Tomorrow\'s Rewards',
    attendance_success: 'Sign-in successful!',
    attendance_already: 'Already signed in today (duplicate)',
    attendance_fail: (detail) => `Sign-in failed: ${detail}`,
    attendance_error: (detail) => `Error: ${detail}`,
    attendance_api_error: (detail) => `API error: ${detail}`,

    // ─── scheduler ────────────────────────────────────────────────────────────
    scheduler_auto_report: '📅 Auto Sign-in Report',
    scheduler_stamina_title: '🔋 Stamina Reminder',
    scheduler_stamina_desc: (cur, max) => `Your stamina has reached **${cur} / ${max}**. Remember to use your stamina!`,

    // ─── html image render ────────────────────────────────────────────────────
    html_potential: 'Pot.',
    html_evolve: 'Elite',
    html_achieve_total: 'Total',
};
